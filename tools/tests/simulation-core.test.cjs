const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../scripts/simulator/simulation-core.js'), 'utf8'), context);
const core = context.SimulationCore;

function entropy(seed = 19313) {
    let draws = 0;
    const sample = () => { draws++; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    sample.draws = () => draws;
    return sample;
}
function batch(count, ratios = [.002, .01, .15, .9], indices = [0, 1, 2, 3]) {
    return { count, winCounts: new Float64Array(5), breakthroughCounts: new Float64Array(5),
        combinedSelection: { selection: core.buildWeightedSelection(ratios), auraIndices: indices,
            breakthroughIndices: indices.map((index, position) => position % 2 ? index : -1) } };
}
function linearSelect(selection, random) {
    if (!selection || random >= selection.totalProbability) return -1;
    for (let index = 0; index < selection.cumulativeWeights.length; index++) {
        if (random < selection.cumulativeWeights[index]) return index;
    }
    return -1;
}
// Deliberately straightforward roll-by-roll oracle. Equipment entropy is drawn
// immediately before its outcome, including choices held across multiple rolls.
function reference(batches, plan, random) {
    const wins = new Float64Array(5), breakthroughs = new Float64Array(5);
    let randomBlock = -1, heldChoice = 0;
    for (const group of plan) for (let offset = 0; offset < group.count; offset++) {
        const roll = (group.startRoll || 0) + offset, prefix = group.prefix || [];
        let index = roll < prefix.length ? prefix[roll] : group.pattern[(roll - prefix.length) % group.pattern.length];
        if (Array.isArray(index)) {
            if (group.heldRandomEvery) {
                const block = Math.floor((roll - prefix.length) / group.heldRandomEvery);
                if (block !== randomBlock) { randomBlock = block; heldChoice = Math.min(index.length - 1, Math.floor(random() * index.length)); }
                index = index[heldChoice];
            } else index = index[Math.min(index.length - 1, Math.floor(random() * index.length))];
        }
        const current = batches[index], combined = current.combinedSelection;
        const choice = linearSelect(combined.selection, random());
        if (choice < 0) continue;
        const aura = combined.auraIndices[choice], bt = combined.breakthroughIndices[choice];
        if (Number.isInteger(aura) && aura >= 0 && aura < wins.length) { wins[aura]++; current.winCounts[aura]++; }
        if (Number.isInteger(bt) && bt >= 0 && bt < wins.length) { breakthroughs[bt]++; current.breakthroughCounts[bt]++; }
    }
    return { wins, breakthroughs };
}
function compare(plan, makeBatches = () => [batch(30000), batch(20000, [.2, .08, .4, .5])]) {
    const expectedBatches = makeBatches(), actualBatches = makeBatches();
    const expectedRandom = entropy(), actualRandom = entropy();
    const expected = reference(expectedBatches, plan, expectedRandom);
    const wins = new Float64Array(5), breakthroughs = new Float64Array(5);
    const runner = core.createRunner(actualBatches, wins, actualRandom, breakthroughs, plan);
    let ticks = 0, lastRoll = 0;
    while (!runner.done) {
        const current = runner.runSlice(1, () => ++ticks);
        assert.ok(current > lastRoll);
        assert.ok(current - lastRoll <= 4096);
        lastRoll = current;
    }
    assert.equal(runner.currentRoll, plan.reduce((sum, group) => sum + group.count, 0));
    assert.deepEqual(wins, expected.wins);
    assert.deepEqual(breakthroughs, expected.breakthroughs);
    actualBatches.forEach((current, index) => {
        assert.deepEqual(current.winCounts, expectedBatches[index].winCounts);
        assert.deepEqual(current.breakthroughCounts, expectedBatches[index].breakthroughCounts);
    });
    assert.equal(actualRandom.draws(), expectedRandom.draws());
    assert.equal(actualRandom(), expectedRandom());
}

test('indexed weighted selection preserves every boundary, including zero-weight tails', () => {
    for (const ratios of [[], [0, 0], [.1, .5, 1, 0], Array.from({length: 420}, (_, i) => i < 419 ? (i % 7 ? .001 : 0) : 1)]) {
        const selection = core.buildWeightedSelection(ratios);
        const values = [0, 1 - Number.EPSILON, 1];
        for (const boundary of selection?.cumulativeWeights || []) values.push(boundary, Math.max(0, boundary - Number.EPSILON));
        for (let i = 0; i < 10000; i++) values.push(i / 10000);
        values.forEach(random => assert.equal(core.selectWeightedIndex(selection, random), linearSelect(selection, random)));
    }
});
test('combined priority groups retain sequential probabilities and no-win probability', () => {
    const combined = core.buildCombinedSimulationSelection([
        { selection: core.buildWeightedSelection([.1]), auraIndices: [0] },
        { selection: core.buildWeightedSelection([.2, .5]), auraIndices: [1, 2], breakthroughIndices: [1, -1] }
    ]);
    assert.deepEqual(Array.from(combined.auraIndices), [0, 1, 2]);
    const weights = combined.selection.cumulativeWeights;
    assert.ok(Math.abs(weights[0] - .1) < 1e-15);
    assert.ok(Math.abs(weights[1] - .28) < 1e-15);
    assert.ok(Math.abs(weights[2] - .64) < 1e-15);
    assert.equal(core.selectWeightedIndex(combined.selection, .9), -1);
});
test('constant equipment schedules match the reference over sliced runs', () => compare([{ count: 50000, pattern: [0, 0, 0] }]));
test('bonus cycles, prefixes, offsets and potion boundaries preserve seeded results', () => compare([
    {count: 7, startRoll: 1, prefix: [1, 0, 1, 1, 0], pattern: [0, 0, 1]},
    {count: 0, pattern: [0]},
    {count: 35007, startRoll: 8, prefix: [0, 1], pattern: [0, 1, 0, 0, 1]},
    {count: 1111, startRoll: 35015, prefix: [0, 1], pattern: [1, 1, 0]}
]));
test('random and held equipment choices consume the original interleaved entropy', () => compare([
    {count: 193, pattern: [[0, 1], 0, [1, 0]], prefix: [1, [0, 1]]},
    {count: 13003, startRoll: 193, pattern: [[0, 1], [0, 1], 1], heldRandomEvery: 50},
    {count: 122, startRoll: 13196, pattern: [[0, 1], [1, 0]], heldRandomEvery: 50}
]));
test('empty pools and invalid aura indices do not corrupt counters', () => compare(
    [{count: 2000, pattern: [0, 1]}], () => [batch(1000, []), batch(1000, [.2, .2, .2, .2], [-1, 9, 1.5, 3])]
));
test('default batch order and empty runners finish at the exact roll count', () => {
    const batches = [batch(13), batch(0), batch(19)];
    const counts = new Float64Array(5);
    const runner = core.createRunner(batches, counts, entropy());
    runner.runSlice(Infinity, () => 0);
    assert.equal(runner.currentRoll, 32);
    assert.equal(runner.done, true);
    const empty = core.createRunner([], counts, entropy());
    assert.equal(empty.runSlice(1, () => 0), 0);
    assert.equal(empty.done, true);
});
test('Radiant moons stop at unlock and reward checkpoints without extra entropy', () => {
    const config = {moonIndices: [0, 1, 2, 3, 4, 5, 6], rewardIndex: 7};
    const state = {moons: 63, rewardClaimed: false};
    const current = batch(3, [1], [6]);
    current.winCounts = new Float64Array(8); current.breakthroughCounts = new Float64Array(8);
    const combined = { selection: core.buildWeightedSelection([1]), auraIndices: [6], breakthroughIndices: [-1] };
    current.radiantSelections = Array(8).fill(combined);
    const counts = new Float64Array(8), random = entropy();
    const runner = core.createRunner([current], counts, random, null, null, {config, state, checkpoints: true, rewardBatchIndex: 0});
    assert.equal(runner.runSlice(Infinity, () => 0), 1);
    assert.equal(runner.checkpoint, 'radiant-ready');
    assert.equal(state.moons, 127);
    assert.equal(runner.runSlice(Infinity, () => 0), 2);
    assert.equal(runner.checkpoint, 'radiant-reward');
    assert.equal(counts[7], 1);
    assert.equal(random.draws(), 1);
    assert.equal(runner.runSlice(Infinity, () => 0), 3);
    assert.equal(runner.done, true);
    assert.equal(counts[6], 2);
    assert.equal(random.draws(), 2);
});
test('deferred Radiant rewards finish every requested roll without claiming Tomorrow', () => {
    const config={moonIndices:[0,1,2,3,4,5,6],rewardIndex:7},state={moons:63,rewardClaimed:false};
    const current=batch(50,[1],[6]);
    current.winCounts=new Float64Array(8);current.breakthroughCounts=new Float64Array(8);
    const combined={selection:core.buildWeightedSelection([1]),auraIndices:[6],breakthroughIndices:[-1]};
    current.radiantSelections=Array(8).fill(combined);
    const counts=new Float64Array(8),random=entropy();
    const runner=core.createRunner([current],counts,random,null,null,{config,state,checkpoints:true,deferReward:true,rewardBatchIndex:0});
    assert.equal(runner.runSlice(Infinity,()=>0),1);
    assert.equal(runner.checkpoint,'radiant-ready');
    assert.equal(runner.runSlice(Infinity,()=>0),50);
    assert.equal(runner.done,true);assert.equal(state.rewardClaimed,false);assert.equal(counts[7],0);assert.equal(counts[6],50);assert.equal(random.draws(),50);
});
