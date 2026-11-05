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
    let group = plan[0];
    let prefix = group?.prefix || [];
    let pattern = group?.pattern;
    return {
        get currentRoll() { return currentRoll; },
        get total() { return total; },
        get done() { return currentRoll >= total; },
        next(sampleEntropy) {
            while (group && groupRoll >= group.count) {
                group = plan[++groupIndex];
                groupRoll = 0;
                prefix = group?.prefix || [];
                pattern = group?.pattern;
            }
            if (!group) return -1;
            const roll = (group.startRoll || 0) + groupRoll;
            const entry = roll < prefix.length ? prefix[roll] : pattern[(roll - prefix.length) % pattern.length];
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

function createRadiantState() {
    return { moons: 0, rewardClaimed: false };
}

function radiantUnlockMask(state) {
    const moons = state.moons;
    return ((moons & 3) === 3 ? 1 : 0)
        | ((moons & 12) === 12 ? 2 : 0)
        | ((moons & 112) === 112 ? 4 : 0);
}

function createRadiantSelector(config, state, sampleEntropy, { deferReward = false } = {}) {
    const moonBits = new Map(config.moonIndices.map((index, moon) => [index, 1 << moon]));
    return batch => {
        if (!deferReward && state.moons === 127 && !state.rewardClaimed) {
            state.rewardClaimed = true;
            return { auraIndex: config.rewardIndex, breakthroughIndex: -1 };
        }
        const combined = batch.radiantSelections[radiantUnlockMask(state)];
        const selected = selectWeightedIndex(combined.selection, sampleEntropy());
        const auraIndex = selected < 0 ? -1 : combined.auraIndices[selected];
        if (moonBits.has(auraIndex)) state.moons |= moonBits.get(auraIndex);
        return { auraIndex, breakthroughIndex: selected < 0 ? -1 : combined.breakthroughIndices[selected] };
    };
}

function createRunner(batches, winCounts, sampleEntropy, breakthroughCounts = null, sequencePlan = null, radiant = null) {
    const cursor = createRollCursor(batches, sequencePlan);
    const total = cursor.total;
    let currentRoll = 0;
    const radiantSelect = radiant ? createRadiantSelector(radiant.config, radiant.state, sampleEntropy, radiant) : null;
    let checkpoint = null;
    const mappings = batches.map(batch => {
        const validIndex = index => Number.isInteger(index) && index >= 0 && index < winCounts.length ? index : -1;
        return {
            selection: batch.combinedSelection.selection,
            wins: batch.winCounts,
            breakthroughs: batch.breakthroughCounts,
            aura: Int32Array.from(batch.combinedSelection.auraIndices, validIndex),
            breakthrough: Int32Array.from(batch.combinedSelection.breakthroughIndices, validIndex)
        };
    });
    // Prepare deterministic schedules once instead of decoding equipment timing
    // per roll. Random/held schedules retain their interleaved entropy draws.
    const plan = sequencePlan || batches.map((batch, index) => ({ count: batch.count, pattern: [index] }));
    const deterministic = !radiant && plan.every(group => !group.count
        || [...(group.prefix || []), ...group.pattern].every(Number.isInteger));
    const segments = [];
    if (deterministic) plan.forEach(group => {
        const prefix = group.prefix || [];
        const start = group.startRoll || 0;
        const prefixCount = Math.min(group.count, Math.max(0, prefix.length - start));
        if (prefixCount) segments.push({ count: prefixCount, position: start, pattern: prefix.map(index => mappings[index]) });
        if (group.count > prefixCount) {
            const pattern = group.pattern.map(index => mappings[index]);
            // Collapse uniform patterns, including the common normal-roll case.
            if (pattern.every(entry => entry === pattern[0])) pattern.length = 1;
            segments.push({ count: group.count - prefixCount,
                position: Math.max(0, start - prefix.length) % pattern.length, pattern });
        }
    });
    let segmentIndex = 0;
    let segmentRoll = 0;
    let position = segments[0]?.position || 0;
    let mapping = null;
    let previousBatch = -1;
    return {
        get currentRoll() { return currentRoll; },
        get done() { return currentRoll >= total; },
        get checkpoint() { return checkpoint; },
        runSlice(budgetMs, now) {
            checkpoint = null;
            const deadline = now() + budgetMs;
            do {
                let count = Math.min(4096, total - currentRoll);
                if (!radiantSelect) {
                    const segment = segments[segmentIndex];
                    if (deterministic) count = Math.min(count, segment?.count - segmentRoll || 0);
                    const pattern = segment?.pattern;
                    for (let roll = 0; roll < count; roll++) {
                        if (deterministic) {
                            mapping = pattern[position];
                            if (++position === pattern.length) position = 0;
                        } else {
                            const batchIndex = cursor.next(sampleEntropy);
                            if (batchIndex !== previousBatch) {
                                previousBatch = batchIndex;
                                mapping = mappings[batchIndex];
                            }
                        }
                        const selected = selectWeightedIndex(mapping.selection, sampleEntropy());
                        if (selected < 0) continue;
                        const auraIndex = mapping.aura[selected];
                        if (auraIndex >= 0) {
                            winCounts[auraIndex]++;
                            mapping.wins[auraIndex]++;
                        }
                        const btIndex = mapping.breakthrough[selected];
                        if (btIndex >= 0) {
                            mapping.breakthroughs[btIndex]++;
                            if (breakthroughCounts) breakthroughCounts[btIndex]++;
                        }
                    }
                    currentRoll += count;
                    if (deterministic) {
                        segmentRoll += count;
                        if (segmentRoll === segment?.count) {
                            segmentIndex++;
                            segmentRoll = 0;
                            position = segments[segmentIndex]?.position || 0;
                        }
                    }
                    continue;
                }
                for (let roll = 0; roll < count; roll++) {
                    let batchIndex = cursor.next(sampleEntropy);
                    currentRoll++;
                    if (!radiant.deferReward && radiant.state.moons === 127 && !radiant.state.rewardClaimed
                        && Number.isInteger(radiant.rewardBatchIndex)) {
                        batchIndex = radiant.rewardBatchIndex;
                    }
                    const batch = batches[batchIndex];
                    const previousMoons = radiant.state.moons;
                    const previousReward = radiant.state.rewardClaimed;
                    const { auraIndex, breakthroughIndex } = radiantSelect(batch);
                    if (auraIndex >= 0) {
                        winCounts[auraIndex]++;
                        batch.winCounts[auraIndex]++;
                    }
                    if (breakthroughIndex >= 0) {
                        batch.breakthroughCounts[breakthroughIndex]++;
                        if (breakthroughCounts) breakthroughCounts[breakthroughIndex]++;
                    }
                    if (radiant.checkpoints) {
                        if (!previousReward && radiant.state.rewardClaimed) checkpoint = 'radiant-reward';
                        else if (previousMoons !== 127 && radiant.state.moons === 127) checkpoint = 'radiant-ready';
                        if (checkpoint) return currentRoll;
                    }
                }
            } while (currentRoll < total && now() < deadline);
            return currentRoll;
        }
    };
}

global.SimulationCore = Object.freeze({ buildWeightedSelection, selectWeightedIndex, buildCumulativeSelectionFromProbabilities, buildCombinedSimulationSelection, createRollCursor, createRunner, createRadiantState, radiantUnlockMask, createRadiantSelector });
})(globalThis);
