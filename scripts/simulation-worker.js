'use strict';

try {
    importScripts('utils.js');
} catch (error) {
    // Fall back to Math.random if the shared entropy helper is unavailable.
}

let cancelRequested = false;
let activeRunId = 0;

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

    return { cumulativeWeights, totalProbability };
}

function selectWeightedIndex(selection, randomValue) {
    if (!selection || selection.totalProbability <= 0 || randomValue >= selection.totalProbability) {
        return -1;
    }

    const { cumulativeWeights } = selection;
    let low = 0;
    let high = cumulativeWeights.length - 1;

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

    return { cumulativeWeights, totalProbability };
}

function buildCombinedSelection(groups) {
    const auraIndices = [];
    const breakthroughIndices = [];
    const probabilities = [];
    let remainingProbability = 1;

    groups.forEach(group => {
        const selection = group && group.selection;
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
            breakthroughIndices.push(group.breakthroughIndices ? group.breakthroughIndices[index] : -1);
            probabilities.push(probability);
        }

        remainingProbability *= Math.max(0, 1 - selection.totalProbability);
    });

    return {
        auraIndices,
        breakthroughIndices,
        selection: buildCumulativeSelectionFromProbabilities(probabilities)
    };
}

function createZeroCounts(length) {
    const size = Number.isFinite(length) && length > 0 ? Math.floor(length) : 0;
    return new Float64Array(size);
}

function readNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

self.onmessage = event => {
    const message = event.data || {};

    if (message.type === 'cancel') {
        cancelRequested = true;
        return;
    }

    if (message.type !== 'start') {
        return;
    }

    const runId = ++activeRunId;
    cancelRequested = false;

    try {
        const total = Number.isFinite(message.total) && message.total > 0
            ? Math.floor(message.total)
            : 0;
        const auraCount = Number.isFinite(message.auraCount) && message.auraCount > 0
            ? Math.floor(message.auraCount)
            : 0;
        const progressIntervalMs = Number.isFinite(message.progressIntervalMs) && message.progressIntervalMs > 0
            ? message.progressIntervalMs
            : 100;

        const prerollAuraIndices = Array.isArray(message.prerollAuraIndices) ? message.prerollAuraIndices : [];
        const prerollAuraRatios = Array.isArray(message.prerollAuraRatios) ? message.prerollAuraRatios : [];
        const lucklessAuraIndices = Array.isArray(message.lucklessAuraIndices) ? message.lucklessAuraIndices : [];
        const lucklessAuraRatios = Array.isArray(message.lucklessAuraRatios) ? message.lucklessAuraRatios : [];
        const lucklessBreakthroughIndices = Array.isArray(message.lucklessBreakthroughIndices) ? message.lucklessBreakthroughIndices : [];
        const luckAffectedAuraIndices = Array.isArray(message.luckAffectedAuraIndices) ? message.luckAffectedAuraIndices : [];
        const luckAffectedAuraRatios = Array.isArray(message.luckAffectedAuraRatios) ? message.luckAffectedAuraRatios : [];
        const luckAffectedBreakthroughIndices = Array.isArray(message.luckAffectedBreakthroughIndices) ? message.luckAffectedBreakthroughIndices : [];

        const prerollSelection = buildWeightedSelection(prerollAuraRatios);
        const lucklessSelection = buildWeightedSelection(lucklessAuraRatios);
        const luckAffectedSelection = buildWeightedSelection(luckAffectedAuraRatios);
        const combinedSelection = buildCombinedSelection([
            {
                selection: prerollSelection,
                auraIndices: prerollAuraIndices,
                breakthroughIndices: null
            },
            {
                selection: lucklessSelection,
                auraIndices: lucklessAuraIndices,
                breakthroughIndices: lucklessBreakthroughIndices
            },
            {
                selection: luckAffectedSelection,
                auraIndices: luckAffectedAuraIndices,
                breakthroughIndices: luckAffectedBreakthroughIndices
            }
        ]);

        const sampleEntropy = typeof drawEntropy === 'function' ? drawEntropy : Math.random;
        const winCounts = createZeroCounts(auraCount);
        const breakthroughCounts = createZeroCounts(auraCount);

        let currentRoll = 0;
        let lastProgressTimestamp = readNow();
        const batchSize = Math.min(5000000, Math.max(250000, Math.ceil(Math.max(total, 1) / 180)));

        const applySelectionHit = () => {
            const selectedIndex = selectWeightedIndex(combinedSelection.selection, sampleEntropy());
            if (selectedIndex === -1) {
                return false;
            }

            const auraIndex = combinedSelection.auraIndices[selectedIndex];
            if (Number.isInteger(auraIndex) && auraIndex >= 0 && auraIndex < auraCount) {
                winCounts[auraIndex] += 1;
            }

            const breakthroughIndex = combinedSelection.breakthroughIndices[selectedIndex];
            if (Number.isInteger(breakthroughIndex) && breakthroughIndex >= 0 && breakthroughIndex < auraCount) {
                breakthroughCounts[breakthroughIndex] += 1;
            }

            return true;
        };

        const postProgressIfNeeded = force => {
            const now = readNow();
            if (!force && (now - lastProgressTimestamp) < progressIntervalMs) {
                return;
            }
            lastProgressTimestamp = now;
            self.postMessage({
                type: 'progress',
                currentRoll
            });
        };

        const processBatch = () => {
            if (runId !== activeRunId) {
                return;
            }

            if (cancelRequested) {
                self.postMessage({
                    type: 'cancelled',
                    currentRoll
                });
                return;
            }

            const batchTarget = Math.min(total, currentRoll + batchSize);
            while (currentRoll < batchTarget) {
                applySelectionHit();
                currentRoll += 1;
            }

            if (currentRoll < total) {
                postProgressIfNeeded(false);
                setTimeout(processBatch, 0);
                return;
            }

            postProgressIfNeeded(true);
            self.postMessage({
                type: 'complete',
                currentRoll,
                winCounts,
                breakthroughCounts
            }, [winCounts.buffer, breakthroughCounts.buffer]);
        };

        processBatch();
    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error && error.message ? error.message : String(error)
        });
    }
};
