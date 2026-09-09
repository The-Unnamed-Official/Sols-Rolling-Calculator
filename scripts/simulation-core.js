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

function createRunner(batches, winCounts, sampleEntropy, breakthroughCounts = null) {
    let batchIndex = 0;
    let batchRoll = 0;
    let currentRoll = 0;
    const total = batches.reduce((sum, batch) => sum + batch.count, 0);
    // Validate mappings once per run, outside the per-roll hot loop.
    const mappings = batches.map(batch => {
        const validIndex = index => Number.isInteger(index) && index >= 0 && index < winCounts.length ? index : -1;
        return {
            aura: Int32Array.from(batch.combinedSelection.auraIndices, validIndex),
            breakthrough: Int32Array.from(batch.combinedSelection.breakthroughIndices, validIndex)
        };
    });
    return {
        get currentRoll() { return currentRoll; },
        get done() { return currentRoll >= total; },
        runSlice(budgetMs, now) {
            const deadline = now() + budgetMs;
            do {
                while (batchIndex < batches.length && batchRoll >= batches[batchIndex].count) {
                    batchIndex++;
                    batchRoll = 0;
                }
                const batch = batches[batchIndex];
                if (!batch) break;
                const selection = batch.combinedSelection.selection;
                const mapping = mappings[batchIndex];
                const count = Math.min(4096, batch.count - batchRoll);
                for (let roll = 0; roll < count; roll++) {
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
                batchRoll += count;
                currentRoll += count;
            } while (currentRoll < total && now() < deadline);
            return currentRoll;
        }
    };
}

global.SimulationCore = Object.freeze({ buildWeightedSelection, selectWeightedIndex, buildCumulativeSelectionFromProbabilities, buildCombinedSimulationSelection, createRunner });
})(globalThis);
