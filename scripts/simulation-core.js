(function (global) {
'use strict';
function buildWeightedSelection(ratios) {
    const count = Array.isArray(ratios) ? ratios.length : 0;
    if (!count) {
        return null;
    }

    const cumulativeWeights = new Float64Array(count);
    let remainingProbability = 1;
    let totalProbability = 0;

    for (let index = 0; index < count; index++) {
        const ratio = ratios[index];
        const weight = remainingProbability * ratio;
        totalProbability += weight;
        cumulativeWeights[index] = totalProbability;
        remainingProbability *= (1 - ratio);

        if (remainingProbability <= 0) {
            for (let tailIndex = index + 1; tailIndex < count; tailIndex++) {
                cumulativeWeights[tailIndex] = totalProbability;
            }
            break;
        }
    }

    return indexSelection({ cumulativeWeights, totalProbability });
}

function selectWeightedIndex(selection, randomValue) {
    if (!selection || selection.totalProbability <= 0 || randomValue >= selection.totalProbability) {
        return -1;
    }

    const { cumulativeWeights } = selection;
    const bucket = Math.min(255, Math.max(0, Math.floor(randomValue * 256)));
    let low = selection.searchStarts ? selection.searchStarts[bucket] : 0;
    let high = selection.searchStarts
        ? Math.min(cumulativeWeights.length - 1, selection.searchStarts[bucket + 1])
        : cumulativeWeights.length - 1;

    while (low < high) {
        const mid = (low + high) >> 1;
        if (randomValue < cumulativeWeights[mid]) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }

    return low;
}

function buildCumulativeSelectionFromProbabilities(probabilities) {
    const count = Array.isArray(probabilities) ? probabilities.length : 0;
    if (!count) {
        return null;
    }

    const cumulativeWeights = new Float64Array(count);
    let totalProbability = 0;
    for (let index = 0; index < count; index++) {
        const probability = probabilities[index];
        if (Number.isFinite(probability) && probability > 0) {
            totalProbability += probability;
        }
        cumulativeWeights[index] = totalProbability;
    }

    if (totalProbability <= 0) {
        return null;
    }

    return indexSelection({ cumulativeWeights, totalProbability });
}

function buildCombinedSimulationSelection(groups) {
    const auraIndices = [];
    const breakthroughIndices = [];
    const probabilities = [];
    let remainingProbability = 1;

    groups.forEach(group => {
        const selection = group?.selection;
        if (!selection || selection.totalProbability <= 0 || remainingProbability <= 0) {
            return;
        }

        let previousCumulative = 0;
        for (let index = 0; index < selection.cumulativeWeights.length; index++) {
            const cumulative = selection.cumulativeWeights[index];
            const localProbability = cumulative - previousCumulative;
            previousCumulative = cumulative;
            const probability = remainingProbability * localProbability;
            if (probability <= 0) {
                continue;
            }

            auraIndices.push(group.auraIndices[index]);
            probabilities.push(probability);
            breakthroughIndices.push(group.breakthroughIndices ? group.breakthroughIndices[index] : -1);
        }

        remainingProbability *= Math.max(0, 1 - selection.totalProbability);
    });

    return {
        auraIndices,
        breakthroughIndices,
        selection: buildCumulativeSelectionFromProbabilities(probabilities)
    };
}


function indexSelection(selection) {
    // Dyadic boundaries are exact. Hints only narrow the original binary search;
    // no weights, random draws, or threshold comparisons are changed.
    const weights = selection.cumulativeWeights;
    if (weights.length < 16) return selection;
    const searchStarts = new Uint32Array(257);
    let index = 0;
    for (let bucket = 0; bucket <= 256; bucket++) {
        while (index < weights.length && weights[index] <= bucket / 256) index++;
        searchStarts[bucket] = index;
    }
    selection.searchStarts = searchStarts;
    return selection;
}

function createRollCursor(batches, sequencePlan = null) {
    const plan = sequencePlan || batches.map((batch, index) => ({ count: batch.count, pattern: [index], prefix: [], startRoll: 0 }));
    let groupIndex = 0;
    let groupRoll = 0;
    let currentRoll = 0;
    let randomBlock = -1;
    let heldChoice = 0;
    const total = plan.reduce((sum, group) => sum + group.count, 0);
    return {
        get currentRoll() { return currentRoll; },
        get total() { return total; },
        get done() { return currentRoll >= total; },
        next(sampleEntropy) {
            while (groupIndex < plan.length && groupRoll >= plan[groupIndex].count) { groupIndex++; groupRoll = 0; }
            const group = plan[groupIndex];
            if (!group) return -1;
            const roll = (group.startRoll || 0) + groupRoll;
            const prefix = group.prefix || [];
            const entry = roll < prefix.length ? prefix[roll] : group.pattern[(roll - prefix.length) % group.pattern.length];
            groupRoll++;
            currentRoll++;
            if (!Array.isArray(entry)) return entry;
            if (group.heldRandomEvery) {
                const block = Math.floor((roll - prefix.length) / group.heldRandomEvery);
                if (block !== randomBlock) {
                    randomBlock = block;
                    heldChoice = Math.min(entry.length - 1, Math.floor(sampleEntropy() * entry.length));
                }
                return entry[heldChoice];
            }
            return entry[Math.min(entry.length - 1, Math.floor(sampleEntropy() * entry.length))];
        }
    };
}

function createRunner(batches, winCounts, sampleEntropy, breakthroughCounts = null, sequencePlan = null) {
    const cursor = createRollCursor(batches, sequencePlan);
    // Validate mappings once per run, outside the per-roll hot loop.
    const mappings = batches.map(batch => {
        const validIndex = index => Number.isInteger(index) && index >= 0 && index < winCounts.length ? index : -1;
        return {
            aura: Int32Array.from(batch.combinedSelection.auraIndices, validIndex),
            breakthrough: Int32Array.from(batch.combinedSelection.breakthroughIndices, validIndex)
        };
    });
    return {
        get currentRoll() { return cursor.currentRoll; },
        get done() { return cursor.done; },
        runSlice(budgetMs, now) {
            const deadline = now() + budgetMs;
            do {
                const count = Math.min(4096, cursor.total - cursor.currentRoll);
                for (let roll = 0; roll < count; roll++) {
                    const batchIndex = cursor.next(sampleEntropy);
                    const batch = batches[batchIndex];
                    const selection = batch.combinedSelection.selection;
                    const mapping = mappings[batchIndex];
                    const selected = selectWeightedIndex(selection, sampleEntropy());
                    if (selected < 0) continue;
                    const auraIndex = mapping.aura[selected];
                    if (auraIndex >= 0) {
                        winCounts[auraIndex]++;
                        batch.winCounts[auraIndex]++;
                    }
                    const btIndex = mapping.breakthrough[selected];
                    if (btIndex >= 0) {
                        batch.breakthroughCounts[btIndex]++;
                        if (breakthroughCounts) breakthroughCounts[btIndex]++;
                    }
                }
            } while (!cursor.done && now() < deadline);
            return cursor.currentRoll;
        }
    };
}

global.SimulationCore = Object.freeze({ buildWeightedSelection, selectWeightedIndex, buildCumulativeSelectionFromProbabilities, buildCombinedSimulationSelection, createRollCursor, createRunner });
})(globalThis);
