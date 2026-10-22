'use strict';

const buildQuery = new URL(self.location.href).search;
importScripts(`utils.js${buildQuery}`, `simulation-core.js${buildQuery}`);
let activeRunId = 0;
let cancelRequested = false;
let activeContinuation = null;
let resumeCheckpoint = null;

function closeContinuation() {
    resumeCheckpoint = null;
    if (!activeContinuation) return;
    activeContinuation.port1.close();
    activeContinuation.port2.close();
    activeContinuation = null;
}

self.onmessage = event => {
    const message = event.data || {};
    if (message.type === 'cancel') {
        cancelRequested = true;
        resumeCheckpoint?.();
        return;
    }
    if (message.type === 'resume') {
        resumeCheckpoint?.();
        return;
    }
    if (message.type !== 'start') return;
    closeContinuation();
    const runId = ++activeRunId;
    cancelRequested = false;
    try {
        const auraCount = Number.isFinite(message.auraCount) && message.auraCount > 0
            ? Math.floor(message.auraCount) : 0;
        const progressIntervalMs = Number.isFinite(message.progressIntervalMs) && message.progressIntervalMs > 0
            ? message.progressIntervalMs : 100;
        const { buildWeightedSelection, buildCombinedSimulationSelection, createRunner } = SimulationCore;
        const array = value => Array.isArray(value) ? value : [];
        const batchMessages = Array.isArray(message.batches) && message.batches.length
            ? message.batches : [message];
        const batches = batchMessages.map(batch => ({
            count: Number.isFinite(batch.total) && batch.total > 0 ? Math.floor(batch.total) : 0,
            winCounts: new Float64Array(auraCount),
            breakthroughCounts: new Float64Array(auraCount),
            radiantSelections: batch.radiantSelections || null,
            combinedSelection: buildCombinedSimulationSelection([
                { selection: buildWeightedSelection(array(batch.prerollAuraRatios)),
                    auraIndices: array(batch.prerollAuraIndices) },
                { selection: buildWeightedSelection(array(batch.lucklessAuraRatios)),
                    auraIndices: array(batch.lucklessAuraIndices),
                    breakthroughIndices: array(batch.lucklessBreakthroughIndices) },
                { selection: buildWeightedSelection(array(batch.luckAffectedAuraRatios)),
                    auraIndices: array(batch.luckAffectedAuraIndices),
                    breakthroughIndices: array(batch.luckAffectedBreakthroughIndices) }
            ])
        })).filter(batch => batch.count > 0);
        const winCounts = new Float64Array(auraCount);
        const breakthroughCounts = new Float64Array(auraCount);
        const runner = createRunner(batches, winCounts, drawEntropy, breakthroughCounts, message.sequencePlan, message.radiant);
        const continuation = new MessageChannel();
        activeContinuation = continuation;
        let lastProgressAt = performance.now();
        const processSlice = () => {
            if (runId !== activeRunId) return;
            try {
                if (cancelRequested) {
                    closeContinuation();
                    self.postMessage({ type: 'cancelled', currentRoll: runner.currentRoll, radiantState: message.radiant?.state, winCounts });
                    return;
                }
                runner.runSlice(12, () => performance.now());
                if (runner.checkpoint) {
                    resumeCheckpoint = () => {
                        resumeCheckpoint = null;
                        continuation.port2.postMessage(null);
                    };
                    self.postMessage({ type: runner.checkpoint, currentRoll: runner.currentRoll, radiantState: message.radiant.state, winCounts });
                    return;
                }
                const now = performance.now();
                if (!runner.done) {
                    if (now - lastProgressAt >= progressIntervalMs) {
                        lastProgressAt = now;
                        self.postMessage({ type: 'progress', currentRoll: runner.currentRoll, radiantState: message.radiant?.state, winCounts });
                    }
                    continuation.port2.postMessage(null);
                    return;
                }
                const batchWinCounts = batches.map(batch => batch.winCounts);
                const batchBreakthroughCounts = batches.map(batch => batch.breakthroughCounts);
                closeContinuation();
                self.postMessage({
                    type: 'complete', currentRoll: runner.currentRoll,
                    radiantState: message.radiant?.state,
                    winCounts, breakthroughCounts, batchWinCounts, batchBreakthroughCounts
                }, [winCounts, breakthroughCounts, ...batchWinCounts, ...batchBreakthroughCounts]
                    .map(counts => counts.buffer));
            } catch (error) {
                closeContinuation();
                self.postMessage({ type: 'error', error: error?.message || String(error) });
            }
        };
        continuation.port1.onmessage = processSlice;
        processSlice();
    } catch (error) {
        closeContinuation();
        self.postMessage({ type: 'error', error: error?.message || String(error) });
    }
};
