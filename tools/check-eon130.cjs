// Deterministic release checks: native odds, family unlocks and next-roll reward.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const main = read('scripts/main.js');
const context = vm.createContext({});
vm.runInContext(read('scripts/event-data.js') + '\n' + read('scripts/simulation-core.js'), context);
const constants = [...main.matchAll(/const\s+(\w+_AURA_NAME)\s*=\s*((?:"[^"\n]*"|'[^'\n]*'));?/g)].map(match => `const ${match[1]} = ${match[2]};`).join('\n');
vm.runInContext(constants + '\n' + main.slice(main.indexOf('const NATIVE_BREAKTHROUGH_MULTIPLIERS'), main.indexOf('\ninitializeAuraFilters(AURA_REGISTRY)')) + '\nglobalThis.registry = AURA_REGISTRY;', context);
const source = name => {
    const start = main.indexOf(`function ${name}(`);
    assert(start >= 0, name);
    return main.slice(start, main.indexOf('\n}', start) + 2);
};
Object.assign(context, {
    getAuraEventIds: () => [], eventAuraBiomeRequirementsMet: () => true,
    ROE_EXCLUSION_SET: new Set(), ROE_BREAKTHROUGH_BLOCKLIST: new Set(),
    HALLOWEEN_EVENT_IDS: [], enabledEvents: new Set(),
    LEVIATHAN_ALLOWED_BIOMES: new Set(['rainy', 'glitch']), MONARCH_ALLOWED_BIOMES: new Set(['corruption', 'glitch']),
    HELLBORN_ALLOWED_BIOMES: new Set(['hell', 'glitch']), EMPTY_ALLOWED_BIOMES: new Set(['null', 'limbo', 'glitch']),
    DREAMCATCHER_ALLOWED_BIOMES: new Set(['night']), NULL_BIOME_FILTER: new Set(['null', 'limbo-null'])
});
vm.runInContext(main.match(/^const GLITCH_BREAKTHROUGH_EXCLUSION_SET = .+$/m)[0]
    + '\nconst auraGlitchBreakthroughMinChanceCache = new Array(AURA_REGISTRY.length).fill(null);', context);
vm.runInContext(['getAuraIndex', 'getAuraGlitchBreakthroughMinChance', 'isAuraNativeTo', 'auraMatchesAnyBiome', 'readBreakthroughMultiplier', 'isIllusionaryAura', 'isExactMetaAuraName',
    'isCyberspaceExclusiveLucklessAura', 'computeStandardEffectiveChance', 'determineAuraEffectiveChance'].map(source).join('\n'), context);
const aura = name => context.registry.find(aura => aura.name.split(' - ')[0] === name);
const evaluation = (biome, time = 'day', mask = 0) => ({ biome, primaryBiome: biome, timeBiome: time,
    exclusivityBiome: biome, activeBiomes: [biome, time], breakthroughBiomes: [biome, time],
    eventChecker: () => true, radiantUnlockMask: mask });
const chance = (name, biome, time, mask) => context.determineAuraEffectiveChance(aura(name), evaluation(biome, time, mask));
assert.equal(chance('Zeus', 'normal'), 4500000, 'Zeus remains rollable outside Heaven through breakthrough');
assert.equal(chance('Zeus', 'heaven'), 900000, 'Zeus uses the Heaven native multiplier');
for (const [name, base] of Object.entries({ Artifact: 500000, Veylune: 555000, Hasuen: 485000000, 'Tree House': 3800000000 })) {
    assert.equal(chance(name, 'normal'), base);
    assert.equal(chance(name, 'lostForest'), base / 2);
}
for (const name of ['Flora', 'Flora : Florest', 'Flora : Evergreen', 'Marsh', 'Lantern', 'Runic', 'Runic : Wilt', 'Ruins', 'Ruins : Withered', 'Perpetual', 'Flutter', 'Flutter : Buggify', 'Lily']) {
    assert.equal(chance(name, 'lostForest'), Math.floor(aura(name).chance / 2), name);
}
for (const name of ['Jade', 'Jade : Purity', 'Kyawthuite', 'Kyawthuite : Remembrance']) {
    assert.equal(chance(name, 'radiantForest', 'night'), aura(name).chance / 2, name);
}
for (const definition of context.registry.filter(aura => aura.breakthroughs?.has('night'))) {
    assert.equal(chance(definition.name.split(' - ')[0], 'radiantForest', 'night'), Math.floor(definition.chance / 10), definition.name);
}
for (const [name, odds] of Object.entries({ Watcher: 5000, Rekindle: 7500, Moonchild: 5000000, 'Cor Lunae': 50000000 })) {
    assert.equal(chance(name, 'normal'), Infinity);
    assert.equal(chance(name, 'radiantForest', 'night'), odds);
}
assert.equal(aura('Tomorrow').requiresRadiantMoons, true);
assert.equal(chance('Tomorrow', 'radiantForest', 'night', 7), Infinity, 'Tomorrow cannot enter the random pool');
const glitch = { ...evaluation('glitch'), glitchLikeBiome: true };
assert.equal(context.determineAuraEffectiveChance(aura('Zeus'), glitch), 900000, 'Glitch inherits the new Heaven native odds');
assert.equal(context.determineAuraEffectiveChance(aura('Zeus'), { ...evaluation('roe'), breakthroughBiomes: ['heaven'], isRoe: true }), 900000, 'RoE inherits the new Heaven native odds');
assert.equal(context.determineAuraEffectiveChance(aura('Artifact'), glitch), 250000, 'Glitch inherits normal Lost Forest native rarity');
assert.equal(context.determineAuraEffectiveChance(aura('Jade'), glitch), 125000, 'Glitch does not inherit rare Radiant Forest rarity');
for (const name of ['Watcher', 'Rekindle', 'Moonchild', 'Cor Lunae', 'True Jade', 'True Kyawthuite', 'True Twilight', 'Tomorrow']) {
    assert.equal(context.determineAuraEffectiveChance(aura(name), glitch), Infinity, name);
}
for (const [name, mask] of [['True Jade', 1], ['True Kyawthuite', 2], ['True Twilight', 4]]) {
    assert.equal(chance(name, 'radiantForest', 'night', 0), Infinity);
    assert.equal(chance(name, 'radiantForest', 'night', mask), aura(name).chance);
    assert.equal(chance(name, 'normal', 'night', mask), Infinity);
}

const core = context.SimulationCore;
const config = { moonIndices: [0, 1, 2, 3, 4, 5, 6], rewardIndex: 7 };
const state = core.createRadiantState();
const selections = Array.from({ length: 8 }, (_, mask) => {
    const indices = [0, 1, 2, 3, 4, 5, 6, ...[8, 9, 10].filter((_, index) => mask & (1 << index)), 11];
    return { auraIndices: indices, breakthroughIndices: indices.map(() => -1), selection: core.buildCumulativeSelectionFromProbabilities(indices.map(() => 1 / indices.length)) };
});
const batch = { radiantSelections: selections };
let entropy = 0, entropyCalls = 0;
const pick = core.createRadiantSelector(config, state, () => { entropyCalls++; return entropy; });
const roll = index => {
    const indices = selections[core.radiantUnlockMask(state)].auraIndices;
    entropy = (indices.indexOf(index) + 0.5) / indices.length;
    return pick(batch).auraIndex;
};
for (const moon of [6, 5, 1, 0]) assert.equal(roll(moon), moon);
assert.equal(core.radiantUnlockMask(state), 1, 'Only the completed Jade family unlocks');
const beforeTrue = state.moons;
assert.equal(roll(8), 8);
assert.equal(state.moons, beforeTrue, 'True Auras do not count as moons');
assert.equal(roll(4), 4);
assert.equal(core.radiantUnlockMask(state), 5);
// A new selector models the next run in the same biome.
const resumed = core.createRadiantSelector(config, state, () => entropy);
assert.equal(roll(3), 3);
assert.equal(roll(2), 2);
assert.equal(state.moons, 127);
assert.equal(state.rewardClaimed, false, 'The last moon does not replace its own roll');
const callsBeforeReward = entropyCalls;
assert.equal(resumed(batch).auraIndex, 7, 'The very next roll awards Challenged+');
assert.equal(entropyCalls, callsBeforeReward);
assert.equal(state.rewardClaimed, true);
assert.notEqual(roll(11), 7, 'Reward occurs once per biome');
assert.equal(core.radiantUnlockMask(state), 7, 'Obtainment buffs remain active after the reward');
assert.equal(core.createRadiantState().moons, 0);

// The bulk runner shares collection state across potion batches.
const batches = [0, 1, 2, 3, 4, 5, 6, 11].map(index => {
    const combined = { auraIndices: [index], breakthroughIndices: [index < 7 ? index : -1], selection: core.buildWeightedSelection([1]) };
    return { count: 1, combinedSelection: combined, radiantSelections: Array(8).fill(combined), winCounts: new Float64Array(12), breakthroughCounts: new Float64Array(12) };
});
const wins = new Float64Array(12), nativeWins = new Float64Array(12), bulkState = core.createRadiantState();
const batchPlan = batches.map((batch, index) => ({ count: batch.count, pattern: [index], prefix: [], startRoll: 0 }));
const rewardBatchIndex = batches.length;
batches.push({ ...batches[7], count: 1, luckValue: 1, label: 'Remember',
    winCounts: new Float64Array(12), breakthroughCounts: new Float64Array(12) });
const runner = core.createRunner(batches, wins, () => 0.5, nativeWins, batchPlan, { config, state: bulkState, rewardBatchIndex });
runner.runSlice(1, () => 0);
assert(runner.done);
assert.equal(wins[7], 1);
assert.equal(wins[11], 0);
assert.equal(batches[7].winCounts[7], 0, 'Remember does not use the queued potion');
assert.equal(batches[rewardBatchIndex].winCounts[7], 1, 'Remember uses its own 1× luck batch');
assert.equal(nativeWins.reduce((sum, count) => sum + count, 0), 7);

// Bulk execution yields at both milestones so the page can show Remember and
// finish the forced cutscene before the worker continues the remaining rolls.
const checkpointBatches = batches.map(batch => ({ ...batch,
    winCounts: new Float64Array(12), breakthroughCounts: new Float64Array(12) }));
const checkpointWins = new Float64Array(12), checkpointState = core.createRadiantState();
const checkpointRunner = core.createRunner(checkpointBatches, checkpointWins, () => 0.5, null, batchPlan,
    { config, state: checkpointState, checkpoints: true, rewardBatchIndex });
assert.equal(checkpointRunner.runSlice(1, () => 0), 7);
assert.equal(checkpointRunner.checkpoint, 'radiant-ready');
assert.equal(checkpointState.rewardClaimed, false);
assert.equal(checkpointWins[7], 0);
assert.equal(checkpointRunner.runSlice(1, () => 0), 8);
assert.equal(checkpointRunner.checkpoint, 'radiant-reward');
assert.equal(checkpointWins[7], 1);
assert.equal(checkpointRunner.runSlice(1, () => 0), 8);
assert.equal(checkpointRunner.checkpoint, null);
assert(checkpointRunner.done);

const catalogue = JSON.parse(read('data/auras/catalogue.json'));
const zeus = catalogue.find(entry => entry.title === 'Zeus');
assert(zeus.nativeBiomes.includes('Heaven'));
assert(zeus.biomes.includes('Heaven'));
assert.equal(zeus.nativeRarity, '1 in 900,000');
assert.equal(zeus.rarityValue, 4500000);
assert(read(`auras/${zeus.slug}/index.html`).includes('Native: 1 in 900,000'));
for (const [biome, names] of Object.entries({
    lostForest: ['Artifact', 'Veylune', 'Hasuen', 'Tree House', 'Flora', 'Flora : Florest', 'Flora : Evergreen', 'Marsh', 'Lantern', 'Runic', 'Runic : Wilt', 'Ruins', 'Ruins : Withered', 'Perpetual', 'Flutter', 'Flutter : Buggify', 'Lily'],
    radiantForest: ['Jade', 'Jade : Purity', 'Kyawthuite', 'Kyawthuite : Remembrance']
})) {
    const label = biome === 'lostForest' ? 'The Lost Forest' : 'The Radiant Forest';
    for (const name of names) {
        const definition = aura(name);
        const entry = catalogue.find(entry => entry.simulatorName === definition.name);
        assert(entry, name + ' is in the directory');
        assert(entry.biomes.includes(label), name + ' appears under its new biome filter');
        assert.equal(entry.nativeRarity, '1 in ' + Math.floor(definition.chance / 2).toLocaleString('en-US'));
        assert.equal(entry.rarityValue, definition.chance);
        assert.equal(entry.kind, 'Biome native');
        const page = read(`auras/${entry.slug}/index.html`);
        assert(page.includes(label), name + ' profile shows the forest');
        assert(page.includes('Native: ' + entry.nativeRarity), name + ' profile shows current native odds');
    }
}
for (const name of ['Twilight', 'Twilight : Withering Grace', 'Twilight : Iridescent Memory', 'Lunar', 'Lunar : Full Moon', 'DreamCatcher']) {
    const entry = catalogue.find(entry => entry.simulatorName === aura(name).name);
    assert(entry.biomes.includes('The Radiant Forest'), `${name}: nighttime natives belong in the Radiant Forest directory filter`);
    assert(entry.location.includes('The Radiant Forest'), `${name}: the displayed location includes the forced-night forest`);
}
for (const name of ['Watcher', 'Rekindle', 'Moonchild', 'Cor Lunae', 'Tomorrow']) {
    const entry = catalogue.find(entry => entry.simulatorName === aura(name).name);
    assert(entry, name + ' has a generated page');
    assert(entry.biomes.includes('The Radiant Forest'));
}
assert(fs.existsSync(path.join(__dirname, '..', 'files/images/icons/radiantForestBiomeIcon.png')));

const pendingVideos = ['present.webm', 'missing.webm', 'fallback.html'].map(src => ({
    dataset: { cutscenePending: 'true' },
    querySelector: () => ({ dataset: { src } })
}));
vm.runInNewContext(read('scripts/media-loader.js'), {
    document: { querySelectorAll: () => pendingVideos },
    fetch: async src => ({ ok: src !== 'missing.webm', headers: { get: () => src.endsWith('.html') ? 'text/html' : 'video/webm' } })
});
setImmediate(() => {
    assert.equal(pendingVideos[0].dataset.cutscenePending, undefined, 'Uploading the video activates its cutscene');
    assert.equal(pendingVideos[1].dataset.cutscenePending, 'true', 'Missing videos do not interrupt rolling');
    assert.equal(pendingVideos[2].dataset.cutscenePending, 'true', 'An HTML fallback is not a playable cutscene');
    console.log('Passed: Eon 1-30 native odds, nighttime directory filters, family unlocks, persistent moons, next-roll reward, potion attribution, and pending cutscene activation.');
});
