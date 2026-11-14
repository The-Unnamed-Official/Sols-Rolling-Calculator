const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const event = JSON.parse(read('data/events/halloween2026.json'));
const catalogue = JSON.parse(read('data/auras/catalogue.json'));
const additions = [
    ['Nightlight', 2666666, 'pumpkinMoon'],
    ['GraftShifter', 1134903170, 'graveyard', 'graftshifter'],
    ['Hallow Treat', 70000000, 'pumpkinMoon'],
    ['Wraith : Phasmophobia', 6620000, 'graveyard'],
    ['Dementor', 69000000, 'graveyard'],
    ['Ashraem', 2000000000, 'bloodRain', 'ashraem'],
    ['Death', 1400000000, 'bloodRain', 'death'],
    ['Hollow', 2666666666, 'graveyard', 'hollow'],
    ['Hellhound', 800000000, 'bloodRain'],
    ['Memphis', 98000000, 'pumpkinMoon'],
    ['Hylophobia', 66363166, 'pumpkinMoon']
];

test('Part 2 rolls retain exact odds, exclusive biomes, and active event defaults', () => {
    assert.equal(event.status, 'active');
    assert.equal(event.defaultEnabled, true);
    const compiled = {};
    vm.runInNewContext(read('scripts/events/event-data.js'), compiled);
    assert.deepEqual(JSON.parse(JSON.stringify(compiled.EventData.halloween26)), event);
    for (const [title, chance, biome] of additions) {
        const matches = event.auras.filter(aura => aura.name === `${title} - ${chance.toLocaleString('en-US')}`);
        assert.equal(matches.length, 1, title);
        assert.equal(matches[0].chance, chance, title);
        assert.deepEqual([...matches[0].nativeBiomes].sort(), ['glitch', biome].sort(), title);
        const profiles = catalogue.filter(entry => entry.simulatorName === matches[0].name);
        assert.equal(profiles.length, 1, title);
        assert.equal(profiles[0].rarityValue, chance, title);
        assert.deepEqual(profiles[0].events, ['Halloween 2026'], title);
        assert.equal(profiles[0].exclusive, true, title);
    }
});

test('shop and boss-item rewards have profiles without entering the rolling pool', () => {
    for (const [title, obtainment] of [
        ['Exanimatus', /20,000 Hallow Points/],
        ['Devotee', /30,000 Hallow Points/],
        ['Sinister : S', /Soul-Scooping Shovel/]
    ]) {
        const entry = catalogue.find(entry => entry.title === title);
        assert.ok(entry, title);
        assert.equal(entry.simulatorName, null, title);
        assert.match(entry.rarity, obtainment, title);
        assert.ok(!event.auras.some(aura => aura.name.startsWith(`${title} - `)), title);
    }
    const entropy = catalogue.find(entry => entry.title === 'Entropy');
    assert.equal(entropy.rarityValue, 30000000);
    assert.equal(entropy.simulatorName, 'Entropy - 30,000,000');
    assert.equal(entropy.nativeRarity, '1 in 15,000,000');
    assert.equal(entropy.exclusive, false);
    assert.deepEqual(entropy.events, []);
    assert.equal(entropy.tierKey, 'exalted');
    const routes = {};
    vm.runInNewContext(read('scripts/auras/aura-routes.js'), routes);
    assert.equal(routes.AuraRoutes.phasmophobia, routes.AuraRoutes.wraithphasmophobia);
});

test('all four new cutscenes are registered for playback, filters, and aggregate results', () => {
    const home = read('index.html');
    const minimal = read('rotatosimulator/index.html');
    const priority = read('scripts/simulator/main.js').split('const CUTSCENE_PRIORITY_SEQUENCE = [')[1].split('];')[0];
    for (const [title, , , clip] of additions.filter(entry => entry[3])) {
        const aura = event.auras.find(aura => aura.name.startsWith(`${title} - `));
        assert.equal(aura.cutscene, `${clip}-cutscene`);
        const media = new RegExp(`<video id="${clip}-cutscene"[^>]*>[\\s\\S]*?<source data-src="files/videos/cutscenes/${clip}Cutscene\\.webm" type="video/webm">`);
        assert.match(home, media, title);
        assert.match(minimal, media, title);
        assert.ok(priority.includes(`"${clip}-cutscene"`), title);
    }
});

test('Sinister : P stays discoverable with pending facts and no invented roll chance', async () => {
    const entry = catalogue.find(entry => entry.title === 'Sinister : P');
    assert.ok(entry);
    assert.equal(entry.simulatorName, null);
    assert.equal(entry.rarityValue, null);
    assert.equal(entry.wikiPending, true);
    assert.match(entry.obtainment, /awaiting documentation/i);
    assert.ok(!event.auras.some(aura => aura.name.startsWith('Sinister : P')));
    const profile = read('auras/sinister-p/index.html');
    assert.doesNotMatch(profile, /roll details are available in the simulator/);
    assert.match(profile, /Sinister&#160;: P/);
    const { discoverEventPages } = require('../fetch/fetch-event-auras.cjs');
    const result = await discoverEventPages({ ...event, auras: [] }, { pages: [] }, async parameters => {
        if (parameters.list === 'categorymembers') return { query: { categorymembers: [] } };
        return { query: { pages: [{ title: parameters.titles, revisions: [{ slots: {
            main: { content: parameters.titles === 'Sinister : P' ? 'other shovel aura tba\nsinister mutation' : '' }
        } }] }] } };
    });
    assert.deepEqual(result.pages, []);
    assert.deepEqual(result.pending, ['Sinister : P']);
});
