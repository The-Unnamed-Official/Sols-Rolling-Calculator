const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../scripts/simulation-core.js');
const core = globalThis.SimulationCore;
const legacy = vm.createContext({ Float64Array });
vm.runInContext(fs.readFileSync(`${__dirname}/fixtures/legacy-selection.js`, 'utf8'), legacy);

function entropy(seed = 12345) {
    return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('indexed search preserves every old threshold and seeded outcome', () => {
    const random = entropy();
    const cases = [[], [0], [1], [0, 0, 1], [1e-15, 0.2, 0.1],
        Array(200).fill(0), Array(100).fill(1 / 100),
        Array.from({ length: 400 }, (_, index) => 1 / (10000000000 / (index + 1)))];
    for (let run = 0; run < 100; run++) cases.push(Array.from({ length: 16 + run * 3 }, () => random() ** 5));
    for (const ratios of cases) {
        const before = legacy.buildWeightedSelection(ratios);
        const after = core.buildWeightedSelection(ratios);
        assert.equal(after?.totalProbability, before?.totalProbability);
        assert.deepEqual(after?.cumulativeWeights, before?.cumulativeWeights);
        const boundaries = Array.from(before?.cumulativeWeights || []);
        const samples = [0, 1, ...boundaries.flatMap(value => [value, value - Number.EPSILON, value + Number.EPSILON]),
            ...Array.from({ length: 257 }, (_, i) => i / 256),
            ...Array.from({ length: 10000 }, random)];
        for (const value of samples.filter(value => value >= 0 && value <= 1)) {
            assert.equal(core.selectWeightedIndex(after, value), legacy.selectWeightedIndex(before, value));
        }
    }
});

test('combined preroll, luckless and luck-affected probability construction is exact', () => {
    const groups = [
        { selection: legacy.buildWeightedSelection([1 / 2000, 1 / 100]), auraIndices: [0, 1] },
        { selection: legacy.buildWeightedSelection([0.01, 0.25]), auraIndices: [2, 3], breakthroughIndices: [-1, 3] },
        { selection: legacy.buildWeightedSelection([0.15, 0.5, 1]), auraIndices: [4, 5, 6], breakthroughIndices: [4, -1, -1] }
    ];
    const before = legacy.buildCombinedSimulationSelection(groups);
    const after = core.buildCombinedSimulationSelection(groups);
    assert.deepEqual(Array.from(after.auraIndices), Array.from(before.auraIndices));
    assert.deepEqual(Array.from(after.breakthroughIndices), Array.from(before.breakthroughIndices));
    assert.deepEqual(after.selection.cumulativeWeights, before.selection.cumulativeWeights);
    assert.equal(after.selection.totalProbability, before.selection.totalProbability);
});

test('sliced runner preserves draws, batch counts, native counts and empty rolls', () => {
    const sample = entropy();
    const referenceSample = entropy();
    const counts = new Float64Array(4);
    const breakthroughs = new Float64Array(4);
    const batches = [0, 19, 25001, 3].map((count, i) => ({
        count, winCounts: new Float64Array(4), breakthroughCounts: new Float64Array(4),
        combinedSelection: core.buildCombinedSimulationSelection([{
            selection: core.buildWeightedSelection(i === 1 ? [] : [0.13, 0.41, 0.3]),
            auraIndices: [0, 1, 2], breakthroughIndices: [-1, 1, 2]
        }])
    }));
    const runner = core.createRunner(batches, counts, sample, breakthroughs);
    let clock = 0;
    while (!runner.done) runner.runSlice(1, () => ++clock);
    let expectedTotal = 0;
    const expectedCounts = new Float64Array(4);
    for (const batch of batches) {
        const expected = new Float64Array(4);
        const expectedBt = new Float64Array(4);
        for (let i = 0; i < batch.count; i++) {
            const hit = legacy.selectWeightedIndex(batch.combinedSelection.selection, referenceSample());
            if (hit >= 0) {
                expected[hit]++;
                expectedCounts[hit]++;
                if (hit > 0) expectedBt[hit]++;
            }
        }
        assert.deepEqual(batch.winCounts, expected);
        assert.deepEqual(batch.breakthroughCounts, expectedBt);
        expectedTotal += batch.count;
    }
    assert.equal(runner.currentRoll, expectedTotal);
    assert.deepEqual(counts, expectedCounts);
    assert.equal(sample(), referenceSample(), 'one entropy draw per roll, including misses');
    assert.equal(breakthroughs[1], counts[1]);
    assert.equal(breakthroughs[2], counts[2]);
});

test('frame commits coalesce updates and cannot write after completion', () => {
    const queued = new Map();
    let nextId = 0;
    const writes = [];
    const context = vm.createContext({
        requestAnimationFrame: callback => { queued.set(++nextId, callback); return nextId; },
        cancelAnimationFrame: id => queued.delete(id)
    });
    vm.runInContext(fs.readFileSync(`${__dirname}/../scripts/runtime.js`, 'utf8'), context);
    const commit = context.AppRuntime.createFrameCommit(value => writes.push(value));
    commit.schedule(1);
    commit.schedule(2);
    assert.equal(queued.size, 1);
    const flush = queued.values().next().value;
    queued.clear();
    flush();
    assert.deepEqual(writes, [2]);
    commit.schedule(3);
    commit.dispose();
    assert.equal(queued.size, 0);
    commit.schedule(4);
    assert.equal(queued.size, 0);
});
