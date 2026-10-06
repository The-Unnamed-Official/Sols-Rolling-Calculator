// Build the static /auras directory from the wiki snapshot and simulator registry.
// Refresh references with node tools/fetch-aura-wiki.cjs, then run this file.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const layout = require('./shared-layout.cjs');
layout.buildHomeLayout();
layout.buildAuraFragments();
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const write = (name, text) => {
    const target = path.join(root, name);
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
};
const reference = JSON.parse(read('data/auras/wiki-reference.json'));
const history = JSON.parse(read('data/auras/history.json'));
const { renderHistory, setRichText } = require('./aura-history-pages.cjs');
const tierContext = {};
vm.runInNewContext(read('scripts/aura-tiers.js'), tierContext);
const context = {};
vm.runInNewContext(read('scripts/wiki-title-data.js') + '\n' + read('scripts/event-data.js'), context);
if (fs.existsSync(path.join(root, 'scripts/directory-title-data.js'))) vm.runInNewContext(read('scripts/directory-title-data.js'), context);
const main = read('scripts/main.js');
const home = read('index.html');
// Read the Run Parameters presentation directly so its order, icons and sigils
// remain the source of truth for the directory filters.
const biomePresentation = main.slice(main.indexOf('const BIOME_ICON_OVERRIDES'), main.indexOf('\nfunction getBiomeIconSource'));
vm.runInNewContext(biomePresentation + '\nglobalThis.biomeIcons = BIOME_ICON_OVERRIDES; globalThis.biomeSigils = BIOME_SIGIL_CLASS_OVERRIDES; globalThis.biomeLabels = BIOME_DISPLAY_LABEL_OVERRIDES;', context);
const backgroundPresentation = main.slice(main.indexOf('const biomeAssets ='), main.indexOf('\nfunction resolveBiomeAssetKey'));
vm.runInNewContext(backgroundPresentation + '\nglobalThis.biomeAssets = biomeAssets;', context);
const constants = [...main.matchAll(/const\s+(\w+_AURA_NAME)\s*=\s*((?:"[^"\n]*"|'[^'\n]*'));?/g)].map(match => `const ${match[1]} = ${match[2]};`).join('\n');
const blueprint = main.slice(main.indexOf('const NATIVE_BREAKTHROUGH_MULTIPLIERS'), main.indexOf('\n]);', main.indexOf('const AURA_BLUEPRINT_SOURCE')) + 4);
const eventList = main.slice(main.indexOf('const EVENT_LIST = ['), main.indexOf('\n];', main.indexOf('const EVENT_LIST = [')) + 3);
const eventLookup = main.slice(main.indexOf('const EVENT_AURA_LOOKUP = {'), main.indexOf('\n};', main.indexOf('const EVENT_AURA_LOOKUP = {')) + 3);
vm.runInNewContext(constants + '\n' + blueprint + '\n' + eventList + '\n' + eventLookup + '\nglobalThis.registry = AURA_BLUEPRINT_SOURCE; globalThis.events = EVENT_LIST; globalThis.eventLookup = EVENT_AURA_LOOKUP;', context);

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const baseName = name => name.replace(/\s+-\s+[\d,]+$/, '').trim();
const normalize = name => baseName(name).toLowerCase().replace(/[^\p{L}\p{N}★]/gu, '');
const wikiKey = title => title.replace(/_/g, ' ').trim().toLowerCase();
function canonicalTitle(title) {
    let key = wikiKey(title);
    const visited = new Set();
    while (reference.aliases[key] && !visited.has(key)) { visited.add(key); key = reference.aliases[key]; }
    return key;
}
const sourceTitle = source => decodeURIComponent(new URL(source).pathname.slice('/wiki/'.length));
const pageByTitle = new Map(reference.pages.map(page => [wikiKey(page.title), page]));
const pageByName = new Map(reference.pages.map(page => [normalize(page.title), page]));
const styles = new Map();
const simulator = new Map();
const routes = {};
for (const [name, art] of Object.entries(context.WikiTitleData.auras)) {
    const page = pageByTitle.get(canonicalTitle(sourceTitle(art.source)));
    if (page) { if (!styles.has(page.title)) styles.set(page.title, name); pageByName.set(normalize(name), page); }
}
const missing = [];
for (const aura of context.registry) {
    const page = pageByName.get(normalize(aura.name));
    if (!page) { missing.push(aura.name); continue; }
    simulator.set(page.title, aura);
}
if (missing.length) throw new Error('Simulator auras missing wiki references: ' + missing.join(', '));

const eventNames = new Map(context.events.map(event => [event.id, event.label]));
const auraEvents = new Map();
for (const [id, names] of Object.entries(context.eventLookup)) {
    for (const name of names) {
        const page = pageByName.get(normalize(name));
        if (page) auraEvents.set(page.title, [...(auraEvents.get(page.title) || []), eventNames.get(id)]);
    }
}
const biomeNames = { glitch: 'Glitched', limbo: 'The Limbo', 'limbo-null': 'Null / The Limbo', dreamspace: 'Dreamspace', cyberspace: 'Cyberspace', oldStarfall: 'Old Starfall', pumpkinMoon: 'Pumpkin Moon', bloodRain: 'Blood Rain', graveyard: 'Graveyard', day: 'Daytime', night: 'Nighttime', blazing: 'Blazing Sun', edict: 'The Citadel Of Orders', fullMoon: '赤い満月', anotherRealm: 'The Hyperspace Realm', mastermind: "The Null's Existence" };
const biomeLabel = value => biomeNames[value] || value[0].toUpperCase() + value.slice(1);
const biomeKey = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const backgrounds = new Map();
const musicForBackground = new Map();
for (const [id, asset] of Object.entries(context.biomeAssets)) {
    musicForBackground.set(asset.image, asset.music);
    for (const label of [id, biomeLabel(id), context.biomeLabels[id]].filter(Boolean)) backgrounds.set(biomeKey(label), asset.image);
}
for (const [alias, id] of Object.entries({Day:'day', Night:'night', Glitch:'glitch', Limbo:'limbo'})) backgrounds.set(biomeKey(alias), context.biomeAssets[id].image);
const backgroundFor = value => String(value || '').split(/\s+or\s+|\s*\/\s*/i).map(label => backgrounds.get(biomeKey(label))).find(Boolean) || '';
const {createRichText}=require('./aura-rich-text.cjs');
const rich=createRichText({auras:context.WikiTitleData.auras,items:context.WikiTitleData.items,biomes:Object.entries(context.biomeSigils).map(([id,sigil])=>({sigil,labels:[id[0].toUpperCase()+id.slice(1),biomeLabel(id),context.biomeLabels[id],id==='glitch'?'Glitch':id==='limbo'?'Limbo':id==='day'?'Day':id==='night'?'Night':''].filter(Boolean)}))});
setRichText(rich);
const denominator = text => {
    const match = /1\s*(?:in|\/)\s*(\d[\d,]*(?:\.\d+)?(?:e[+-]?\d+)?)/i.exec(text);
    return match ? Number(match[1].replace(/,/g, '')) : null;
};
const odds = value => '1 in ' + Number(value).toLocaleString('en-US');
const referenceOdds = text => {
    const scientific = /1\s*(?:in|\/)\s*([\d,.]+e[+-]?\d+)/i.exec(text);
    return scientific ? '1 in ' + scientific[1] : odds(denominator(text));
};
const usedSlugs = new Set();
function slugFor(title) {
    let slug = /^★+$/.test(title) ? ['star', 'double-star', 'triple-star'][title.length - 1] : title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    if (!slug || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(slug)) slug = 'aura-' + (slug || 'unknown');
    if (usedSlugs.has(slug)) throw new Error('Duplicate aura URL: ' + title);
    usedSlugs.add(slug);
    return slug;
}
const entries = reference.pages.map(page => {
    const aura = simulator.get(page.title);
    const name = styles.get(page.title) || page.title;
    const slug = slugFor(page.title);
    const events = [...new Set((page.events.length ? page.events : (auraEvents.get(page.title) || [])).map(event => event.replace(/April[ '\u2019]*fool(?:[ '\u2019]*s)?/i, 'April Fools')))];
    const hasEvent = events.length && (page.tier === 'Event' || page.categories.some(category => /Event|Limited/i.test(category)) || auraEvents.has(page.title));
    const rarity = denominator(page.rarity) || denominator(page.nativeRarity) || (aura?.chance ?? null);
    const rarityText = denominator(page.rarity) ? referenceOdds(page.rarity)
        : denominator(page.nativeRarity) ? referenceOdds(page.nativeRarity)
        : aura && /unobtainable/i.test(page.rarity) && hasEvent ? odds(aura.chance) : page.rarity;
    const nativeBiomes = [...new Set([...(aura?.nativeBiomes || []), ...Object.keys(aura?.breakthroughs || {})])].map(biomeLabel);
    const biomes = [...new Set([...nativeBiomes, page.required].filter(biome => biome && !/effect|N\/A/i.test(biome)).flatMap(biome => biome.split(/\s+or\s+|\s*\/\s*/i)).map(biome => biome.replace(/\s*\(collection\)/i, '').replace(/^Glitched$/i, 'Glitch').replace(/^The Limbo$/i, 'Limbo').trim()))];
    const tierKey = tierContext.AuraTiers.resolve(page.tier, rarity);
    const effectSource = /\bfrom (.+)/i.exec(page.rarity)?.[1];
    const obtainment = page.obtainment || effectSource || (aura?.requiresDunePreset ? 'Potion of the Dune' : aura?.requiresBloodPreset ? 'Red Moon Potion' : '') || (/craft/i.test(page.rarity) ? "Crafted at Jake’s Workshop" : '');
    const location = [obtainment, page.required].filter(Boolean).join(' · ') || (nativeBiomes.length ? nativeBiomes.join(' / ') : /unobtainable|unreleased|removed/i.test(page.rarity + ' ' + page.status) ? 'Not currently rollable' : 'Any biome');
    const kind = /craft/i.test(page.rarity) ? 'Crafted' : /NPC/i.test(page.rarity) ? 'NPC exclusive'
        : /developer|dev exclusive/i.test(page.rarity) || page.categories.includes('Developer') ? 'Developer exclusive'
        : /unreleased/i.test(page.status) ? 'Unreleased' : /removed/i.test(page.status) ? 'Removed'
        : hasEvent ? 'Event' : page.exclusive ? 'Biome exclusive' : nativeBiomes.length || (page.required && denominator(page.nativeRarity)) || page.categories.includes('Biome-Native') ? 'Biome native'
        : obtainment ? 'Special obtainment' : /unobtainable/i.test(page.rarity) ? 'Unobtainable' : 'Standard';
    for (const alias of [page.title, name, aura?.name].filter(Boolean)) routes[normalize(alias)] = slug;
    const background = biomes.map(backgroundFor).find(Boolean) || '';
    return { ...page, obtainment, name, slug, rarityValue: rarity, rarityText, tierKey, kind, location, events: hasEvent ? events : [], nativeBiomes, biomes, background, simulatorName: aura?.name || null, simulatorChance: aura?.chance ?? null, ignoreLuck: Boolean(aura?.ignoreLuck) };
});
for (const [alias, target] of Object.entries(reference.aliases)) {
    const page = pageByTitle.get(canonicalTitle(target));
    const entry = page && entries.find(entry => entry.title === page.title);
    if (entry) routes[normalize(alias)] = entry.slug;
}
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true, ignorePunctuation: true });
entries.sort((a, b) => tierContext.AuraTiers.sortGroup(a.tierKey, a.kind) - tierContext.AuraTiers.sortGroup(b.tierKey, b.kind) || (a.rarityValue ?? Infinity) - (b.rarityValue ?? Infinity) || collator.compare(a.name, b.name));
const entryByTitle=new Map(entries.map(entry=>[wikiKey(entry.title),entry]));
const memberFor=title=>entryByTitle.get(canonicalTitle(wikiKey(title)));
const parents=new Map();
for(const entry of entries) {
    const profile=history.profiles[entry.title];
    const parent=memberFor(profile.mutationOf);
    if(parent&&parent!==entry) parents.set(entry,parent);
    for(const title of profile.relatedAuras||[]) {
        const child=memberFor(title);
        if(child&&child!==entry&&!parents.has(child)) parents.set(child,entry);
    }
}
const rootFor=entry=>{const visited=new Set();while(parents.has(entry)&&!visited.has(entry)){visited.add(entry);entry=parents.get(entry);}return entry;};
const families=new Map();
for(const entry of entries){const base=rootFor(entry);if(!families.has(base)) families.set(base,[]);families.get(base).push(entry);}
function mutationNavigation(entry) {
    const base=rootFor(entry),members=families.get(base);
    if(members.length<2) return '';
    const ordered=[base,...members.filter(member=>member!==base)];
    return `<nav class="aura-mutations" aria-label="Aura mutations"><div class="aura-mutations__heading"><h2>Aura family</h2><span>${ordered.length-1} mutation${ordered.length>2?'s':''}</span></div><div class="aura-mutation-tabs">${ordered.map(member=>`<a class="interface-button interface-button--ghost aura-mutation-link" href="../${member.slug}/index.html" aria-label="${escape(member.name)} ${member===base?'base aura':'mutation'}"${member===entry?' aria-current="page"':''}><span class="aura-link-title">${rich.sigil('aura',member.name)}</span><span class="aura-mutation-kind">${member===base?'Base aura':'Mutation'}</span></a>`).join('')}</div></nav>`;
}

function head(title, description, prefix, canonical) {
    return `<!DOCTYPE html>
<html lang="en" data-aura-layout="loading">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escape(description)}">
    <meta name="theme-color" content="#050a14">
    <title>${escape(title)} · Sol's RNG Rolling Simulator</title>
    <link rel="canonical" href="https://rollingsimulator.com/auras/${canonical}">
    <meta name="color-scheme" content="dark">
    <link rel="preconnect" href="https://static.wikia.nocookie.net">
    <style>html { color-scheme: dark; background: #050a14; color: #d8e7f1; } body { margin: 0; min-height: 100vh; background-color: #050a14; } html[data-aura-layout="loading"] [data-aura-shell] { visibility: hidden; }</style>
    <noscript><style>[data-aura-shell] { visibility: visible !important; }</style><link rel="stylesheet" href="${prefix}styles/base.css"><link rel="stylesheet" href="${prefix}styles/auras.css"></noscript>
    <script src="${prefix}scripts/aura-page-layout.js" defer></script>
</head>`;
}
const titleArt = entry => `<span data-aura-title="${escape(entry.name)}" data-aura-tier="${escape(entry.tierKey)}" data-aura-rarity="${entry.rarityValue ?? ''}">${escape(entry.name)}</span>`;
// Profiles need one title, rather than downloading both complete title registries.
const profileTitle = entry => `<script type="application/json" data-aura-title-reference>${JSON.stringify({ [entry.name]: context.WikiTitleData.auras[entry.name] }).replace(/</g, '\\u003c')}</script>`;
const row = (entry, index) => `<li class="aura-row" data-aura-row data-name="${escape(entry.name)}" data-sort-group="${tierContext.AuraTiers.sortGroup(entry.tierKey, entry.kind)}" data-rarity="${entry.rarityValue ?? ''}" data-biomes="${escape(JSON.stringify(entry.biomes))}" data-kind="${escape(entry.kind)}" data-events="${escape(JSON.stringify(entry.events))}" data-tier="${escape(entry.tierKey)}" data-search="${escape([entry.name, entry.title, entry.kind, entry.tierKey, entry.location, ...entry.events].join(' ').toLowerCase())}"><a class="resource-link aura-card aura-page-link" href="./${entry.slug}/index.html" aria-label="${escape(entry.name)} aura details"><span class="resource-link__icon aura-row__index" aria-hidden="true">${String(index + 1).padStart(3, '0')}</span><span class="resource-link__content"><span class="resource-link__category">${escape(entry.kind)} · <span class="rarity-tier-${escape(entry.tierKey)}">${escape(tierContext.AuraTiers.label(entry.tierKey))}</span></span><span class="resource-link__label aura-row__name"><span class="aura-link-title">${titleArt(entry)}</span></span><span class="resource-link__meta aura-row__rarity">${escape(entry.rarityText)}</span><span class="resource-link__meta aura-row__location">${rich.text(entry.location)}</span></span><span class="resource-link__launch" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span></a></li>`;
function filter(id, label, all, values) {
    return `<div class="form-field directory-filter"><label class="form-field__label" id="${id}-label" for="${id}">${label}</label><select class="form-field__input form-field__input--native" id="${id}" data-aura-filter multiple tabindex="-1" aria-hidden="true"><option value="" selected>${all}</option>${values.map(([value, text, presentation = {}]) => `<option value="${escape(value)}"${Object.entries(presentation).map(([key, content]) => ` data-${key}="${escape(content)}"`).join('')}>${escape(text)}</option>`).join('')}</select><details class="interface-select interface-select--multi" data-select="${id}"><summary class="form-field__input interface-select__summary" role="button" aria-labelledby="${id}-label" aria-haspopup="listbox" aria-expanded="false">${all}</summary><div class="interface-select__menu" role="listbox" aria-multiselectable="true" aria-labelledby="${id}-label"></div></details></div>`;
}
const filterValues = values => [...new Set(values)].sort(collator.compare).map(value => [value, value]);
function parameterOptions(id) {
    const markup = new RegExp(`<select\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(home)?.[1] || '';
    return [...markup.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(([, id, label]) => ({ id, label }));
}
const availableBiomes = new Set(entries.flatMap(entry => entry.biomes));
const biomeFilters = [...parameterOptions('biome-primary-dropdown'), ...parameterOptions('biome-time-dropdown')].flatMap(({ id, label }) => {
    const value = biomeLabel(id).replace(/^Glitched$/, 'Glitch').replace(/^The Limbo$/, 'Limbo');
    if (!availableBiomes.delete(value)) return [];
    const display = context.biomeLabels[id] || label;
    const background = context.biomeAssets[id]?.image || backgroundFor(value);
    return [[value, display, { icon: '../' + (context.biomeIcons[id] || `files/images/icons/${id}BiomeIcon.png`), label: display, ...(background ? {background: '../' + background,music:'../'+musicForBackground.get(background)} : {}), ...(context.biomeSigils[id] ? { sigil: context.biomeSigils[id] } : {}) }]];
});
biomeFilters.push(...filterValues([...availableBiomes]).map(([value, label]) => [value, label, backgroundFor(value) ? { background: '../' + backgroundFor(value),music:'../'+musicForBackground.get(backgroundFor(value)) } : {}]));
const eventPresentation = new Map([...home.matchAll(/<input\b[^>]*data-event-id="([^"]+)"[^>]*>\s*<span class="interface-select__option-label"><span class="([^"]+)">([^<]+)<\/span>([^<]*)/g)].map(([, id, sigil, label, suffix]) => [id, { sigil, label, suffix: suffix.trim() ? ' ' + suffix.trim() : '' }]));
const eventAliases = { 'RIA 2024': 'Innovator 2024', 'Winter 2026': 'Christmas 2025' };
const availableEvents = new Set(entries.flatMap(entry => entry.events));
const eventFilters = context.events.flatMap(({ id, label }) => {
    const value = availableEvents.has(label) ? label : eventAliases[label];
    if (!availableEvents.delete(value)) return [];
    return [[value, label, eventPresentation.get(id) || {}]];
});
// Retain historical wiki events that are not available in Run Parameters.
for (const value of [...availableEvents].sort(collator.compare)) {
    const [, label, year] = /^(.*?) (\d{4})$/.exec(value) || ['', value, ''];
    const style = [...eventPresentation.values()].find(presentation => presentation.label === label);
    const item = [value, value, style ? { ...style, suffix: ' ' + year } : {}];
    const nextYear = eventFilters.findIndex(([, text]) => Number(text.match(/\d{4}$/)?.[0]) > Number(year));
    const nextSeason = style && context.events.findIndex(event => event.label.startsWith(label + ' '));
    const nextEvent = nextSeason >= 0 ? context.events[nextSeason + 1]?.label.replace(/\d{4}$/, year) : null;
    const before = eventFilters.findIndex(([, text]) => text === nextEvent);
    eventFilters.splice(before >= 0 ? before : nextYear >= 0 ? nextYear : eventFilters.length, 0, item);
}
const tierFilters = tierContext.AuraTiers.keys.filter(key => entries.some(entry => entry.tierKey === key)).map(key => [key, tierContext.AuraTiers.label(key), { sigil: `rarity-tier-${key}` }]);
const pagination = () => `<nav class="directory-pagination" data-aura-pagination aria-label="Aura pages"><button class="interface-button interface-button--ghost" type="button" data-page-step="-1" aria-label="Previous aura page" disabled>← Previous</button><div class="directory-page-buttons" data-page-buttons></div><span class="directory-page-status" data-page-status>Page 1</span><button class="interface-button interface-button--ghost" type="button" data-page-step="1" aria-label="Next aura page">Next →</button></nav>`;
write('auras/index.html', `${head('Aura directory', 'Browse every Sol’s RNG aura, sorted by rarity or alphabetically. Discover descriptions, odds, biomes, and event obtainment.', '../', '')}
<body data-aura-page="directory">
<div data-aura-shell>
<header data-aura-fragment="header"><a href="../index.html">Home</a></header>
<main id="main-content">
    <section class="surface directory-catalogue" aria-labelledby="directory-title">
        <header class="surface__header"><h1 class="surface__title" id="directory-title">Aura directory</h1><p class="surface__subtitle">Explore every aura, its wiki description, rarity, and where to obtain it.</p></header>
        <form class="directory-toolbar" role="search" onsubmit="return false"><div class="form-field directory-search"><label class="form-field__label" for="aura-search">Find an aura</label><input class="form-field__input" id="aura-search" type="search" placeholder="Search name, biome, or event…" autocomplete="off"></div><div class="form-field directory-sort"><label class="form-field__label" id="aura-sort-label" for="aura-sort">Sort by</label><select class="form-field__input form-field__input--native" id="aura-sort" tabindex="-1" aria-hidden="true"><option value="rarity-ascending" selected>Rarity · lowest to highest</option><option value="rarity">Rarity · highest to lowest</option><option value="alphabetical">Alphabetical · A–Z</option><option value="alphabetical-descending">Alphabetical · Z–A</option></select><details class="interface-select interface-select--single" data-select="aura-sort"><summary class="form-field__input interface-select__summary" role="button" aria-labelledby="aura-sort-label" aria-haspopup="listbox" aria-expanded="false">Rarity · lowest to highest</summary><div class="interface-select__menu" role="listbox" aria-labelledby="aura-sort-label"></div></details></div></form>
        <div class="directory-filters" aria-label="Filter auras">${filter('aura-biome', 'Biome', 'All biomes', biomeFilters)}${filter('aura-kind', 'Exclusiveness', 'All types', filterValues(entries.map(entry => entry.kind)))}${filter('aura-event', 'Event', 'All events', [['none', 'No event'], ...eventFilters])}${filter('aura-tier', 'Tier', 'All tiers', tierFilters)}<button class="interface-button interface-button--ghost directory-clear" type="button" id="aura-clear-filters">Clear filters</button></div>
        <p class="directory-result-count" id="aura-result-count" role="status" aria-live="polite" tabindex="-1">${entries.length} auras</p>
        ${pagination()}
        <ol class="resource-board aura-list" id="aura-list">${entries.map(row).join('\n')}</ol>
        ${pagination()}
        <p class="directory-empty" id="aura-empty" hidden>No auras found. Try another name, biome, or event.</p>
        <p class="directory-note">Rarity sorting follows the wiki’s tier groups, then odds within each group. Challenged auras stay together even when their effect or biome odds are small. Odds shown are base rarity, or native odds for biome exclusive auras. Crafted, event, and other special auras are included for reference. Change auras per page in Settings → Quality Preferences.</p>
    </section>
</main>
<footer data-aura-fragment="footer"><a href="../data/auras/README.md">Attribution</a></footer>
</div>
<div data-aura-fragment="quality"></div>
</body>
</html>
`);
for (const entry of entries) {
    const currentVersion = history.profiles[entry.title]?.versions[0];
    const descriptionText = currentVersion?.description ?? entry.description;
    const descriptionTruncated = currentVersion?.descriptionTruncated ?? entry.descriptionTruncated;
    let where = entry.location;
    if (!entry.obtainment && entry.required) {
        where = entry.exclusive ? `Only in ${entry.required}. This aura cannot be rolled outside its exclusive biome.`
            : entry.nativeRarity ? `Native to ${entry.required}. Native odds: ${entry.nativeRarity}. It can also be rolled outside its native biome through breakthrough.` : entry.required;
    }
    const rarityLabel = entry.exclusive && denominator(entry.nativeRarity) ? 'Exclusive biome rarity' : entry.events.length && /unobtainable/i.test(entry.rarity) && entry.simulatorChance ? 'Event rarity' : 'Rarity';
    const status = /unobtainable|unreleased|removed/i.test(entry.rarity + ' ' + entry.status) && !entry.exclusive ? `<p class="aura-availability">${escape(entry.rarity)}${entry.events.length && entry.simulatorName ? '. Available through its event settings in the simulator.' : ''}</p>` : '';
    const currentContent = `<div class="aura-detail__body">
            <section class="changelog-release-group aura-description" aria-labelledby="description-title"><h2 id="description-title">${descriptionTruncated ? 'Description excerpt' : 'Description'}</h2>${descriptionText ? `<blockquote id="aura-description-text" data-aura-description>${rich.description(currentVersion || {description:descriptionText})}${descriptionTruncated ? '…' : ''}</blockquote><button class="interface-button interface-button--ghost aura-description__toggle" type="button" data-description-toggle aria-controls="aura-description-text" aria-expanded="false" hidden>Show More</button>` : '<p>The wiki does not currently record an aura description.</p>'}<a class="aura-source-link" href="${escape(entry.source)}${currentVersion?'?oldid='+currentVersion.revisionId:''}" target="_blank" rel="noopener">${descriptionTruncated ? 'Read the full description' : 'View the source'} on Sol's RNG Wiki ↗</a></section>
            <div class="aura-facts"><section class="changelog-release-group aura-fact"><h2>${rarityLabel}</h2><p class="aura-fact__odds">${escape(entry.rarityText)}</p>${entry.nativeRarity && !entry.exclusive ? `<p class="aura-fact__secondary">Native: ${rich.text(entry.nativeRarity)}</p>` : ''}${status}</section><section class="changelog-release-group aura-fact"><h2>${entry.obtainment ? 'How to obtain' : 'Where to roll'}</h2><p>${rich.text(where)}</p>${entry.events.length ? `<div class="aura-event"><h3>Event${entry.events.length > 1 ? 's' : ''}</h3><p>${escape(entry.events.join(' / '))}</p></div>` : ''}${entry.ignoreLuck ? '<p class="aura-fact__secondary">Fixed odds in the simulator; luck does not increase its chance.</p>' : ''}</section></div>
        </div>`;
    write(`auras/${entry.slug}/index.html`, `${head(entry.name, `${entry.name}: ${entry.rarityText}. ${entry.location}. Aura information and wiki description.`, '../../', entry.slug + '/')}
<body data-aura-page="profile" data-aura-background="${entry.background ? '../../' + escape(entry.background) : ''}" data-aura-music="${entry.background ? '../../' + escape(musicForBackground.get(entry.background)) : ''}">
${profileTitle(entry)}
<div data-aura-shell>
<header data-aura-fragment="header"><a href="../../index.html">Home</a></header>
<main id="main-content">
    <nav class="aura-breadcrumb" aria-label="Breadcrumb"><a class="interface-button interface-button--ghost" href="../index.html">Auras</a><span aria-hidden="true">/</span><span aria-current="page">${escape(entry.name)}</span></nav>
    <article class="surface aura-detail">
        <header class="surface__header aura-detail__hero"><p class="resource-link__category">Aura profile / ${escape(entry.tier || entry.kind)}</p><h1>${titleArt(entry)}</h1><span class="surface__subtitle">${escape(entry.kind)}</span></header>
        ${mutationNavigation(entry)}
        ${renderHistory(entry,currentContent,history.profiles[entry.title],history.reviewedOn,version => version.label === 'Current' ? entry.background : backgroundFor(version.facts?.required) || entry.background,background => musicForBackground.get(background)||'')}
        <footer data-aura-fragment="navigation"><a href="../index.html">← All auras</a><a href="../../index.html">Open simulator ↗</a></footer>
    </article>
    <p class="aura-reference">Wiki reference reviewed ${reference.reviewedOn}. ${entry.simulatorName ? 'Roll details also reflect the simulator’s current aura registry.' : ''} <a href="${escape(entry.source)}?oldid=${entry.revisionId}" target="_blank" rel="noopener">Source revision ↗</a></p>
</main>
<footer data-aura-fragment="footer"><a href="../../data/auras/README.md">Attribution</a></footer>
</div>
<div data-aura-fragment="quality"></div>
</body>
</html>
`);
}
write('scripts/aura-routes.js', '// Generated by tools/build-aura-pages.cjs. Do not edit by hand.\nglobalThis.AuraRoutes = Object.freeze(' + JSON.stringify(routes, null, 2) + ');\n');
write('data/auras/catalogue.json', JSON.stringify(entries, null, 2) + '\n');
console.log(`Built ${entries.length} aura pages and the directory. Linked all ${context.registry.length} simulator auras.`);
