const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { discoverEventPages } = require('../fetch/fetch-event-auras.cjs');

test('event discovery includes shop, boss, quest and pass articles outside the simulator roster', async () => {
    const event = { id: 'halloween26', label: 'Halloween 2026', auras: [{ name: 'Example Roll Aura - 1,000' }, { name: 'Unpublished Aura - 2,000' }] };
    const article = (title, eventName = 'Halloween 2026') => ({ title, revisions: [{ revid: 123, slots: { main: { content:
        `{{Aura Infobox|aura_rarity=NPC reward|rarity_name={{Rarity|Event}}|obtainment=Obtain from its event activity}}\n==Profile==\nThis aura was added during ${eventName}.\n===Appearance===\nTBA` } } }] });
    const pages = new Map([
        ['Example Roll Aura', article('Example Roll Aura', 'Eon 1-31')],
        ['Example Shop Aura', article('Example Shop Aura')],
        ['Example Boss Aura', article('Example Boss Aura')],
        ['Example Quest Aura', article('Example Quest Aura')],
        ['Example Pass Aura', article('Example Pass Aura')],
        ['Unrelated Aura', article('Unrelated Aura', 'Halloween 2025')],
        ['Example NPC', { title: 'Example NPC', revisions: [{ slots: { main: { content: 'A boss from Halloween 2026.' } } }] }]
    ]);
    const request = async parameters => {
        if (parameters.list === 'categorymembers') return parameters.cmcontinue
            ? { query: { categorymembers: [{ title: 'Example Quest Aura' }] } }
            : { continue: { cmcontinue: 'second' }, query: { categorymembers: ['Example Shop Aura', 'Example Boss Aura', 'Unrelated Aura', 'Example NPC'].map(title => ({ title })) } };
        if (parameters.titles === 'Template:Auras') return { query: { pages: [{ revisions: [{ slots: { main: { content: '[[Example Pass Aura|{{Aura|Example Pass Aura}}]]' } } }] }] } };
        return { query: { pages: parameters.titles.split('|').map(title => pages.get(title) || { title, missing: true }), normalized: [{ from: 'Example_Shop_Aura', to: 'Example Shop Aura' }] } };
    };
    const before = JSON.stringify(event);
    const result = await discoverEventPages(event, { pages: [] }, request);
    assert.deepEqual(result.pages.map(page => page.title).sort(), ['Example Roll Aura', 'Example Shop Aura', 'Example Boss Aura', 'Example Quest Aura', 'Example Pass Aura'].sort());
    for (const page of result.pages) assert.ok(page.events.includes('Halloween 2026'));
    assert.deepEqual(result.pending, ['Unpublished Aura']);
    assert.equal(JSON.stringify(event), before);
    assert.equal(result.aliases['example shop aura'], 'example shop aura');
});

test('published shop and boss auras generate catalogue pages without entering the roll registry', () => {
    const root = path.resolve(__dirname, '../..');
    const builder = path.join(root, 'tools/build/build-aura-pages.cjs');
    const referencePath = path.join(root, 'data/auras/wiki-reference.json');
    const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
    const before = JSON.parse(fs.readFileSync(path.join(root, 'data/auras/catalogue.json'), 'utf8'));
    const fixture = (title, rarity, obtainment) => ({ title, source: 'https://sol-rng.fandom.com/wiki/' + title.replaceAll(' ', '_'), revisionId: 123,
        description: '', descriptionTruncated: false, rarity, nativeRarity: '', tier: 'Event', required: '', obtainment,
        categories: ['Auras', 'Event'], notice: '', status: '', exclusive: false, events: ['Halloween 2026'], reviewedOn: '2026-10-31' });
    reference.pages.push(fixture('Example Shop Aura', 'Event shop reward', 'Purchase from the event shop for 100 Hollow Points'),
        fixture('Example Boss Aura', '1 in 100 from the boss', 'Defeat the event boss'));
    const outputs = new Map();
    const originalRequire = createRequire(builder);
    const virtualFs = { ...fs,
        readFileSync: (file, ...args) => path.resolve(file) === referencePath ? JSON.stringify(reference) : fs.readFileSync(file, ...args),
        writeFileSync: (file, contents) => outputs.set(path.resolve(file), contents), mkdirSync: () => {}
    };
    const requireFixture = name => name === 'node:fs' ? virtualFs : name === '../lib/shared-layout.cjs'
        ? { buildHomeLayout() {}, buildAuraFragments() {} } : originalRequire(name);
    vm.runInNewContext(fs.readFileSync(builder, 'utf8'), { require: requireFixture, __dirname: path.dirname(builder), URL, console: { log() {} } });
    const catalogue = JSON.parse(outputs.get(path.join(root, 'data/auras/catalogue.json')));
    assert.equal(catalogue.filter(entry => entry.simulatorName).length, before.filter(entry => entry.simulatorName).length);
    for (const [title, slug, detail] of [['Example Shop Aura', 'example-shop-aura', '100 Hollow Points'], ['Example Boss Aura', 'example-boss-aura', 'Defeat the event boss']]) {
        const entry = catalogue.find(entry => entry.title === title);
        assert.equal(entry.simulatorName, null);
        assert.equal(entry.simulatorChance, null);
        assert.equal(entry.mediaPending, true);
        assert.ok(entry.events.includes('Halloween 2026'));
        assert.ok(outputs.get(path.join(root, 'auras', slug, 'index.html')).includes(detail));
    }
});
