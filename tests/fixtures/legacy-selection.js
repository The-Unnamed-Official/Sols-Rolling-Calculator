// Selection reference from v2.030; retained for exact regression comparisons.
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

