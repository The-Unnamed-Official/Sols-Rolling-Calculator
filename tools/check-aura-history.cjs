// Validate source coverage, historical facts, archived uploads and generated tabs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const history = JSON.parse(read('data/auras/history.json'));
const catalogue = JSON.parse(read('data/auras/catalogue.json'));
const {fileKey} = require('./aura-history-parser.cjs');
const titles = catalogue.map(aura => aura.title).sort();
assert.equal(history.auditedCount, catalogue.length);
assert.deepEqual(history.audit.map(aura => aura.title).sort(), titles, 'Every aura must be audited exactly once');
assert(history.audit.every(aura => Number.isInteger(aura.revisionId) && aura.revisionId > 0));
const validUrl = (url, hostname) => {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, 'https:');
    assert.equal(parsed.hostname, hostname);
};
let historicalVersions = 0;
for (const aura of catalogue) {
    const profile = history.profiles[aura.title];
    const html = read(`auras/${aura.slug}/index.html`);
    assert(profile, `${aura.title}: every profile needs media`);
    assert(profile.versions[0].media.length, `${aura.title}: no current aura preview`);
    assert(html.includes('data-aura-viewer'), `${aura.title}: missing image viewer`);
    assert(html.includes('aura-version-information'), `${aura.title}: missing details beside the image`);
    const multiple = profile.versions.length > 1;
    assert.equal(html.includes('data-aura-history'), multiple, `${aura.title}: single-version auras do not need tabs`);
    assert.equal(profile.versions[0].label, 'Current');
    assert.equal(new Set(profile.versions.map(version => version.label)).size, profile.versions.length, `${aura.title}: duplicate stages`);
    validUrl(profile.source, 'sol-rng.fandom.com');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${aura.title}: duplicate HTML IDs`);
    assert.equal([...html.matchAll(/role="tab"/g)].length, multiple?profile.versions.length:0);
    assert.equal([...html.matchAll(/role="tabpanel"/g)].length, multiple?profile.versions.length:0);
    for (const [index, version] of profile.versions.entries()) {
        if (multiple) {
            assert.match(html, new RegExp(`id="aura-version-tab-${index}" aria-controls="aura-version-panel-${index}" aria-selected="${index===0}" tabindex="${index===0?0:-1}"`));
            assert.match(html, new RegExp(`id="aura-version-panel-${index}" aria-labelledby="aura-version-tab-${index}" tabindex="0"${index?' hidden':''}>`));
        }
        validUrl(version.source, 'sol-rng.fandom.com');
        assert(Number.isInteger(version.revisionId) && version.revisionId > 0, `${aura.title}: missing version source`);
        if (index) {
            assert(version.media.length || version.descriptionRecorded || Object.values(version.facts || {}).some(Boolean), `${aura.title}: empty historical version`);
            if (version.before && version.timestamp) assert(version.timestamp.slice(0,10) <= version.before, `${aura.title}: revision is after its rework`);
        }
        for (const media of version.media) {
            validUrl(media.url, 'static.wikia.nocookie.net');
            validUrl(media.source, 'sol-rng.fandom.com');
            if (media.originalUrl) validUrl(media.originalUrl, 'static.wikia.nocookie.net');
            assert(media.width > 0 && media.height > 0, `${aura.title}: missing preview dimensions`);
            assert(/^(image|video)\//.test(media.mime));
            assert(!/^Placeholder\./i.test(media.file), `${aura.title}: placeholder masquerading as an old appearance`);
            if (index) assert(!profile.versions[0].media.some(current => current.url === media.url), `${aura.title}: current image wrongly repeated in an old version`);
        }
    }
    for (const mediaTag of html.matchAll(/<(?:img|video)\b[^>]*data-history-src="[^>]+>/g)) {
        if (/\ssrc=/.test(mediaTag[0])) assert.match(mediaTag[0], /fetchpriority="high"/, `${aura.title}: only the first preview may start before the viewer`);
    }
    assert.equal((html.match(/fetchpriority="high"/g)||[]).length, profile.versions[0].media[0].mime.startsWith('image/')?1:0, `${aura.title}: prioritize the initial preview once`);
    historicalVersions += profile.versions.length - 1;
}
assert.deepEqual(Object.keys(history.profiles).sort(), titles, 'Media must cover the whole roster');
assert.notEqual(fileKey('CometInGame.gif'), fileKey('CometIngame.gif'), 'MediaWiki filenames are case-sensitive after the first character');
assert.equal(fileKey('imaginary\u200e\u200e_collection.gif'), fileKey('Imaginary collection.gif'), 'Invisible title formatting must not break image resolution');
const version = (title, label) => history.profiles[title].versions.find(item => item.label === label);
const chromatic = version('Chromatic', 'Old');
assert.match(chromatic.description, /^Yes! /);
assert.match(version('Chromatic', 'Current').description, /^Yeah! /);
assert.match(chromatic.facts.music, /Re:Construct/);
assert.equal(version('Archangel', 'Oldest').facts.rarity, '1 in 250,000,000');
assert.equal(version('Archangel', 'Current').facts.rarity, '1 in 350,000,000');
assert.match(version('Arcane', 'Oldest').description, /disaster/);
assert.match(version('Arcane', 'Old').description, /^A spell/);
assert.equal(history.profiles.Arcane.versions.length, 3, 'The earliest snapshot and Oldest gallery describe one stage');
const commonOld = history.profiles.Common.versions[1];
assert(commonOld.media.some(item => /\/revision\/\d{14}(?:\?|$)/.test(item.url)), 'An overwritten Common image needs its archived upload');
assert(commonOld.media.every(item => !version('Common', 'Current').media.some(current => current.url === item.url)));
assert(version('Twilight : Iridescent Memory', 'Viridescent Memory'));
assert.equal(history.audit.find(item => item.title === 'Twilight : Viridescent Memory').status, 'historical-predecessor');
assert.notEqual(version('Ascendant', 'Current').description, version('Ascendant', 'Old').description, 'Changes after the first 25 words must survive');
assert.equal(version('Ascendant', 'Oldest').description, 'weee i am angel');
for (const [title, label] of [['Undead : Devil','Old']]) {
    const old = version(title, label).media.find(item=>/ingame/i.test(item.file));
    const current = version(title, 'Current').media.find(item=>/ingame/i.test(item.file));
    assert(old && current && old.url !== current.url, `${title}: older in-game capture must use its separate upload`);
}
assert.equal(version('Comet','Current').media.length, 1, 'The in-game capture marked TBU is outdated and should not accompany the current preview');
assert.match(version('Comet','Old').media.find(item=>/ingame/i.test(item.file)).url, /CometIngame\.gif/);
assert.equal(version('Mastermind', 'Current').media.length, 1, 'Only the reworked Mastermind capture belongs to the current appearance');
for (const name of ['Atlas','Nothing','THE RAREST AURA','Imaginary','ConstraintTest']) assert(version(name, 'Current').media.length, `${name}: standard/bare-file previews must be included`);
assert.match(version('Sapphire : Peace','Current').media[0].caption, /concept.*unreleased/i);
const rarest = catalogue.find(aura => aura.title === 'THE RAREST AURA');
assert.equal(rarest.rarityText, '1 in 16e+306');
assert.equal(rarest.rarityValue, 1.6e307);
assert(catalogue.filter(aura => aura.rarityValue).every(aura => aura.rarityValue <= rarest.rarityValue), 'Scientific odds must sort numerically');
assert.match(read(`auras/${rarest.slug}/index.html`), /1 in 16e\+306/);
assert.match(read('auras/index.html'), /class="resource-link__meta aura-row__rarity">1 in 16e\+306</);
console.log(`Passed: all ${history.audit.length} profiles have preview images; ${historicalVersions} sourced historical versions have accessible panels and preloadable media.`);
console.log('Historical descriptions, changed rarities, overwritten uploads, predecessor mapping and scientific rarity formatting are valid.');
