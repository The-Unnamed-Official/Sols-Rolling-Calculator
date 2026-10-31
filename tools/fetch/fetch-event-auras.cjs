const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { templates, extract } = require('./fetch-aura-wiki.cjs');
const root = path.resolve(__dirname, '../..');
const normalize = value => value.replace(/_/g, ' ').replace(/\s+-\s+[\d,]+$/, '').trim().toLowerCase();
const baseName = value => value.replace(/\s+-\s+[\d,]+$/, '').trim();
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
async function api(parameters) {
    const url = 'https://sol-rng.fandom.com/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', ...parameters });
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Wiki API returned ' + response.status);
    const result = await response.json();
    if (result.error) throw new Error(result.error.info);
    return result;
}
async function discoverEventPages(event, reference, request = api) {
    const existing = new Set(reference.pages.map(page => normalize(page.title)));
    const known = new Set(event.auras.map(aura => normalize(aura.name)));
    const titles = new Set(event.auras.map(aura => baseName(aura.name)));
    reference.pages.filter(page => page.events.includes(event.label)).forEach(page => titles.add(page.title));
    let continuation;
    do {
        const result = await request({ action: 'query', list: 'categorymembers', cmtitle: 'Category:Auras', cmnamespace: '0', cmlimit: '500', ...(continuation ? { cmcontinue: continuation } : {}) });
        for (const member of result.query.categorymembers) if (!existing.has(normalize(member.title))) titles.add(member.title);
        continuation = result.continue?.cmcontinue;
    } while (continuation);
    const navigation = await request({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: 'Template:Auras' });
    const markup = navigation.query.pages[0]?.revisions?.[0]?.slots?.main?.content || '';
    for (const [, title] of markup.matchAll(/\[\[([^|\]]+)\|\s*\{\{Aura\|/g)) if (!existing.has(normalize(title))) titles.add(title.replace(/^:/, ''));
    const found = new Map();
    const aliases = {};
    const candidates = [...titles];
    for (let offset = 0; offset < candidates.length; offset += 50) {
        const result = await request({ action: 'query', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', titles: candidates.slice(offset, offset + 50).join('|'), redirects: '1' });
        for (const alias of [...(result.query.normalized || []), ...(result.query.redirects || [])]) aliases[normalize(alias.from)] = normalize(alias.to);
        for (const page of result.query.pages) {
            const content = page.revisions?.[0]?.slots?.main?.content || '';
            if (page.missing || !templates(content, '(?:New)?Aura[ _]?Infobox').length) continue;
            const entry = extract(page);
            if (!known.has(normalize(entry.title)) && !entry.events.some(label => normalize(label) === normalize(event.label))) continue;
            entry.events = [...new Set([...entry.events, event.label])];
            if (/^(?:TBA|TBD|N\/A|Unknown|Coming soon|\?+)[.!]?$/i.test(entry.description)) {
                entry.description = '';
                entry.descriptionTruncated = false;
            }
            found.set(normalize(entry.title), entry);
        }
    }
    return { pages: [...found.values()], aliases, pending: event.auras.map(aura => baseName(aura.name)).filter(name => !found.has(normalize(name))) };
}
function prepareTitles(event, pages) {
    const titlePath = path.join(root, 'scripts/titles/wiki-title-data.js');
    const overridePath = path.join(root, 'data/references/wiki-title-overrides.json');
    const context = {};
    vm.runInNewContext(fs.readFileSync(titlePath, 'utf8'), context);
    const overrides = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
    let changed = false;
    for (const page of pages) {
        if (context.WikiTitleData.auras[page.title] || overrides[page.title]) continue;
        const hook = event.id + '-' + page.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
        overrides[page.title] = { name: page.title, url: '', pending: true, markup: `<span class="${hook}">${escape(page.title)}</span>` };
        context.WikiTitleData.auras[page.title] = { source: '', pending: true, markup: `<span class="wiki-ref-${hook}">${escape(page.title)}</span>` };
        changed = true;
    }
    if (changed) {
        fs.writeFileSync(overridePath, JSON.stringify(overrides, null, 2) + '\n');
        fs.writeFileSync(titlePath, 'globalThis.WikiTitleData = ' + JSON.stringify(context.WikiTitleData, null, 2) + ';\n');
    }
}
async function refreshEvent(eventId) {
    const directory = path.join(root, 'data/events');
    const events = fs.readdirSync(directory).filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
    const event = events.find(event => event.id === eventId);
    if (!event) throw new Error('Unknown event: ' + eventId);
    const target = path.join(root, 'data/auras/wiki-reference.json');
    const reference = JSON.parse(fs.readFileSync(target, 'utf8'));
    const result = await discoverEventPages(event, reference);
    const reviewedOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const merged = new Map(reference.pages.map(page => [normalize(page.title), page]));
    for (const page of result.pages) merged.set(normalize(page.title), { ...page, reviewedOn });
    reference.pages = [...merged.values()].sort((a, b) => a.title.localeCompare(b.title));
    Object.assign(reference.aliases, result.aliases);
    const rollable = new Set(event.auras.map(aura => normalize(aura.name)));
    const catalogueOnly = result.pages.filter(page => !rollable.has(normalize(page.title))).map(page => page.title);
    reference.eventReviews = { ...reference.eventReviews, [event.id]: {
        reviewedOn, source: 'https://sol-rng.fandom.com/wiki/Category:Auras',
        publishedArticles: result.pages.map(page => page.title), catalogueOnly, pendingKnownArticles: result.pending
    } };
    prepareTitles(event, result.pages);
    fs.writeFileSync(target, JSON.stringify(reference, null, 2) + '\n');
    console.log(JSON.stringify({ event: event.label, publishedArticles: result.pages.length, catalogueOnly, pendingKnownArticles: result.pending }, null, 2));
}
module.exports = { discoverEventPages };
if (require.main === module) refreshEvent(process.argv[2] || 'halloween26').catch(error => { console.error(error); process.exitCode = 1; });
