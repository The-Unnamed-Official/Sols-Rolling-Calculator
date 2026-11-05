const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { templates, plainText, extract } = require('./fetch-aura-wiki.cjs');
const { article, fileKey } = require('../lib/aura-history-parser.cjs');
const { currentMusic, soundtracks } = require('../lib/aura-soundtracks.cjs');
const { candidates, showcases } = require('../lib/aura-showcases.cjs');
const root = path.resolve(__dirname, '../..');
const cache = path.join(root, '.cache/aura-refresh');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const key = value => value.replace(/_/g, ' ').trim().toLowerCase();
const baseName = value => value.replace(/\s+-\s+[\d,]+$/, '').trim();
const write = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n');

async function api(parameters) {
    const url = 'https://sol-rng.fandom.com/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', ...parameters });
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error(`Wiki API HTTP ${response.status}`);
            const result = await response.json();
            if (result.error) throw new Error(result.error.info);
            return result;
        } catch (error) {
            if (attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
}

function simulatorTitles() {
    const main = fs.readFileSync(path.join(root, 'scripts/simulator/main.js'), 'utf8');
    const constants = [...main.matchAll(/const\s+(\w+_AURA_NAME)\s*=\s*((?:"[^"\n]*"|'[^'\n]*'));?/g)]
        .map(match => `const ${match[1]}=${match[2]};`).join('\n');
    const blueprint = main.slice(main.indexOf('const NATIVE_BREAKTHROUGH_MULTIPLIERS'), main.indexOf('\n]);', main.indexOf('const AURA_BLUEPRINT_SOURCE')) + 4);
    const context = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/events/event-data.js'), 'utf8') + '\n' + constants + '\n' + blueprint + '\nglobalThis.registry=AURA_BLUEPRINT_SOURCE;', context);
    return context.registry.map(aura => baseName(aura.name));
}

async function discover(reference, request = api) {
    const titles = new Set([...reference.pages.map(page => page.title), ...simulatorTitles()]);
    const navigation = await request({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: 'Template:Auras' });
    const markup = navigation.query.pages[0]?.revisions?.[0]?.slots?.main?.content || '';
    for (const [, title] of markup.matchAll(/\[\[([^|\]]+)\|\s*\{\{Aura\|/g)) titles.add(title.replace(/^:/, ''));
    let continuation;
    do {
        const result = await request({ action: 'query', list: 'categorymembers', cmtitle: 'Category:Auras', cmnamespace: '0', cmlimit: '500', ...(continuation ? { cmcontinue: continuation } : {}) });
        result.query.categorymembers.forEach(page => titles.add(page.title));
        continuation = result.continue?.cmcontinue;
    } while (continuation);
    return [...titles];
}

async function fetchArticles(reference, request = api) {
    const titles = await discover(reference, request), pages = new Map(), missing = [], aliases = { ...reference.aliases };
    for (let offset = 0; offset < titles.length; offset += 100) {
        const results = await Promise.all([titles.slice(offset, offset + 50), titles.slice(offset + 50, offset + 100)].filter(batch => batch.length)
            .map(batch => request({ action: 'query', prop: 'revisions', rvprop: 'ids|timestamp|content', rvslots: 'main', titles: batch.join('|'), redirects: '1' })));
        for (const result of results) {
            for (const alias of [...(result.query.normalized || []), ...(result.query.redirects || [])]) aliases[key(alias.from)] = key(alias.to);
            for (const page of result.query.pages) {
                if (page.missing) { missing.push(page.title); continue; }
                if (!templates(page.revisions?.[0]?.slots?.main?.content || '', '(?:New)?Aura[ _]?Infobox').length) continue;
                pages.set(key(page.title), page);
            }
        }
        console.log(`Checked ${Math.min(offset + 100, titles.length)}/${titles.length} aura titles; ${pages.size} articles found.`);
    }
    return { pages: [...pages.values()], aliases, missing };
}

function canonical(title, aliases) {
    let result = key(title);
    const visited = new Set();
    while (aliases[result] && !visited.has(result)) { visited.add(result); result = aliases[result]; }
    return result;
}

function facts(a) {
    const purchase = /^(?:Bought|Purchased)\s+from\b/i.test(a.rarity);
    return { rarity: a.rarity, nativeRarity: purchase ? '' : a.nativeRarity, tier: a.tier,
        required: purchase ? '' : a.required, obtainment: a.obtainment,
        music: plainText(currentMusic(a.infobox.music_name || a.infobox.music || '')).split(/\s+/).slice(0, 25).join(' '),
        creator: plainText(a.infobox.creator || '') };
}

function mediaItem(item, info) {
    if (!info || !/^(?:image|video)\//.test(info.mime)) return null;
    const image = info.mime.startsWith('image/');
    return { file: item.file, caption: item.caption, url: image ? info.thumburl || info.url : info.url,
        ...(image && info.thumburl && info.thumburl !== info.url ? { originalUrl: info.url } : {}), source: info.descriptionurl,
        width: image ? info.thumbwidth || info.width : info.width, height: image ? info.thumbheight || info.height : info.height,
        mime: info.mime, timestamp: info.timestamp };
}

function updateProfile(a, previous, uploads, audio, videos, override = {}) {
    const groups = a.images.map(group => ({ ...group, media: group.media.map(item => mediaItem(item, uploads[fileKey(item.file)])).filter(Boolean) }));
    const currentGroup = groups.find(group => group.label === 'Current');
    const allowed = override.currentFiles;
    const currentCandidates = (currentGroup?.media || []).filter(item => !allowed || allowed.some(file => fileKey(file) === fileKey(item.file)));
    const fresh = currentCandidates.filter(item => !/(?:\bTBU\b|to be updated|outdated|needs? update)/i.test(item.caption));
    const current = { id: 'current', label: 'Current', description: a.description, descriptionMarkup: a.descriptionMarkup,
        descriptionTruncated: false, media: fresh.length ? fresh : currentCandidates, facts: facts(a),
        revisionId: a.revisionId, source: a.source, timestamp: a.timestamp,
        soundtracks: soundtracks(a.infobox.music_name || a.infobox.music || '', audio), showcases: showcases(a, { assets: videos }) };
    const archived = (previous?.versions || []).filter(version => version.id !== 'current').map(version => ({ ...version }));
    const oldCurrent = previous?.versions?.find(version => version.id === 'current');
    const signature = media => (media || []).map(item => fileKey(item.file)).sort().join('|');
    if (oldCurrent?.media?.length && signature(oldCurrent.media) !== signature(current.media)
        && a.reworkDates.some(event => event.date > (oldCurrent.timestamp || '').slice(0, 10))
        && !archived.some(version => signature(version.media) === signature(oldCurrent.media))) {
        archived.push({ ...oldCurrent, label: `Before ${a.reworkDates[0].date}`, sourceKind: 'previous-snapshot' });
    }
    for (const group of groups.filter(group => group !== currentGroup && group.media.length)) {
        const recorded = new Set(archived.flatMap(version => (version.media || []).map(item => fileKey(item.file))));
        if (group.media.every(item => recorded.has(fileKey(item.file)))) continue; // Keep archived URLs and descriptions intact.
        const description = a.descriptionVersions.find(version => version.label === group.label);
        const label = archived.some(version => version.label === group.label) ? `${group.label} gallery` : group.label;
        archived.push({ label, media: group.media, description: description?.description || '',
            descriptionMarkup: description?.descriptionMarkup || '', descriptionTruncated: false,
            descriptionRecorded: Boolean(description), facts: null, soundtracks: [], showcases: [],
            revisionId: a.revisionId, source: a.source, timestamp: null, sourceKind: 'documented-gallery' });
    }
    for (const music of a.musicVersions) {
        const tracks = soundtracks(music.musicMarkup, audio);
        if (!tracks.length || tracks.every(track => archived.some(version => version.soundtracks?.some(other => fileKey(other.file) === fileKey(track.file))))) continue;
        archived.push({ label: `${music.label} soundtrack`, media: [], description: '', descriptionMarkup: '', descriptionTruncated: false,
            facts: { music: music.music }, soundtracks: tracks, showcases: [], revisionId: a.revisionId, source: a.source,
            timestamp: null, sourceKind: 'documented-soundtrack' });
    }
    return { source: a.source, revisionId: a.revisionId, mutationOf: a.mutationOf, relatedAuras: a.relatedAuras,
        versions: [current, ...archived.map((version, index) => ({ ...version, id: `version-${index + 1}` }))] };
}

async function refreshDirectory({ reviewedOn, request = api, fromCache = false } = {}) {
    reviewedOn ||= new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedOn)) throw new Error('Use --reviewed-on=YYYY-MM-DD');
    fs.mkdirSync(cache, { recursive: true });
    const reference = read('data/auras/wiki-reference.json'), oldHistory = read('data/auras/history.json');
    const snapshotFile = path.join(cache, 'articles.json');
    const snapshot = fromCache ? JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) : await fetchArticles(reference, request);
    if (!fromCache) fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
    const parsed = snapshot.pages.map(article), files = new Map();
    const audio = read('data/auras/soundtracks.json'), videos = read('data/auras/showcases.json');
    for (const a of parsed) {
        a.images.flatMap(group => group.media).forEach(item => files.set(fileKey(item.file), item.file));
        for (const value of Object.values(a.infobox)) for (const match of value.matchAll(/\[\[(?:File|Image):([^|\]]+\.(?:mp3|ogg|wav|m4a|opus))(?=[|\]])/gi)) files.set(fileKey(match[1]), match[1]);
        candidates(a.text).forEach(item => files.set(fileKey(item.file), item.file));
    }
    const uploadsFile = path.join(cache, 'uploads.json');
    const uploads = fromCache ? JSON.parse(fs.readFileSync(uploadsFile, 'utf8')) : {};
    const fileNames = [...files.values()];
    if (!fromCache) for (let offset = 0; offset < fileNames.length; offset += 100) {
        const results = await Promise.all([fileNames.slice(offset, offset + 50), fileNames.slice(offset + 50, offset + 100)].filter(batch => batch.length)
            .map(batch => request({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|timestamp|mime', iiurlwidth: '640', titles: batch.map(file => 'File:' + file).join('|') })));
        for (const result of results) for (const page of result.query.pages) {
            const info = page.imageinfo?.[0];
            if (info) uploads[fileKey(page.title.slice(5))] = info;
        }
        console.log(`Resolved ${Math.min(offset + 100, fileNames.length)}/${fileNames.length} current gallery, soundtrack and cutscene files.`);
    }
    if (!fromCache) fs.writeFileSync(uploadsFile, JSON.stringify(uploads, null, 2));
    for (const [name, info] of Object.entries(uploads)) {
        const item = { file: name, url: info.url, source: info.descriptionurl, mime: info.mime, timestamp: info.timestamp };
        if (/^audio\//.test(info.mime)) audio[name] = item;
        if (/^video\//.test(info.mime)) videos[name] = item;
    }
    const previousPages = new Map(reference.pages.map(page => [canonical(page.title, snapshot.aliases), page]));
    const previousProfiles = new Map(Object.entries(oldHistory.profiles).map(([title, profile]) => [canonical(title, snapshot.aliases), profile]));
    const profiles = { ...oldHistory.profiles }, pages = new Map(reference.pages.map(page => [canonical(page.title, snapshot.aliases), page]));
    const overrides = read('data/references/aura-history-overrides.json');
    const changed = [], added = [], audit = [];
    for (const [index, a] of parsed.entries()) {
        const id = key(a.title), previous = previousPages.get(id), oldProfile = previousProfiles.get(id);
        const entry = extract(snapshot.pages[index]);
        entry.events = [...new Set([...(previous?.events || []), ...entry.events])];
        entry.reviewedOn = reviewedOn;
        pages.set(id, entry);
        const profile = updateProfile(a, oldProfile, uploads, audio, videos, overrides[a.title]);
        profiles[a.title] = profile;
        if (!previous) added.push(a.title);
        else if (previous.revisionId !== a.revisionId) changed.push(a.title);
        audit.push({ title: a.title, revisionId: a.revisionId, status: profile.versions.length > 1 ? 'archived-versions' : 'no-documented-older-version',
            versionCount: profile.versions.length - 1, reworkDates: a.reworkDates });
    }
    const report = { reviewedOn, articlesChecked: parsed.length, added, updated: changed,
        preservedArchivedVersions: Object.values(oldHistory.profiles).reduce((sum, profile) => sum + profile.versions.length - 1, 0),
        unresolvedGalleryFiles: [...files.keys()].filter(name => !uploads[name]), missingArticleCandidates: snapshot.missing };
    // Only commit the refreshed data after every article and media request succeeds.
    write('data/auras/wiki-reference.json', { ...reference, reviewedOn, aliases: snapshot.aliases, pages: [...pages.values()].sort((a, b) => a.title.localeCompare(b.title)) });
    write('data/auras/history.json', { ...oldHistory, reviewedOn, auditedCount: parsed.length, profiles, audit });
    write('data/auras/soundtracks.json', audio);
    write('data/auras/showcases.json', videos);
    write('data/auras/refresh-report.json', report);
    console.log(`Refreshed ${parsed.length} aura profiles: ${added.length} new articles, ${changed.length} updated references; historical versions preserved.`);
    return report;
}

module.exports = { api, discover, fetchArticles, updateProfile, mediaItem, refreshDirectory };
if (require.main === module) refreshDirectory({
    reviewedOn: process.argv.find(argument => argument.startsWith('--reviewed-on='))?.slice(14),
    fromCache: process.argv.includes('--from-cache')
}).catch(error => { console.error(error); process.exitCode = 1; });
