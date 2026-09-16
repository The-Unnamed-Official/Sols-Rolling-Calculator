// Run with PLAYWRIGHT_PATH pointing to an installed playwright package.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const baselineRef = process.env.BASELINE_REF || '08e799b';
const baselineFiles = new Map();
for (const file of ['index.html', 'scripts/main.js', 'scripts/utils.js', 'scripts/state.js', 'scripts/overlays.js', 'scripts/simulation-worker.js']) {
    baselineFiles.set(file, execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: root, maxBuffer: 4e6 }));
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer((req, res) => {
    let file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    const baseline = file.startsWith('baseline/');
    if (baseline) file = file.slice(9);
    if (!file) file = 'index.html';
    const fullPath = path.resolve(root, file);
    if (!fullPath.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
        const data = baseline && baselineFiles.has(file) ? baselineFiles.get(file) : fs.readFileSync(fullPath);
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Last-Modified': 'Tue, 08 Sep 2026 10:00:00 GMT' });
        res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404).end(); }
});

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
    const errors = [];
    const results = {};
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    try {
        const pages = [];
        for (const variant of ['baseline', 'current']) {
            const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
            page.on('pageerror', error => errors.push(`${variant}: ${error.message}`));
            await page.addInitScript(() => {
                localStorage.setItem('solsRollingCalculator:lastSeenChangelogVersion', location.pathname.includes('baseline') ? 'v2.030' : 'v2.1.1');
                localStorage.setItem('solsRollingCalculator:cacheMigration:2.1.0', 'done');
            });
            await page.goto(`${origin}/${variant === 'baseline' ? 'baseline/' : ''}`, { waitUntil: 'load' });
            await page.waitForFunction(() => typeof runRollSimulation === 'function' && typeof AURA_REGISTRY !== 'undefined');
            results[variant] = await page.evaluate(() => ({
                auraCount: AURA_REGISTRY.length,
                startupScriptBytes: performance.getEntriesByType('resource').filter(r => /scripts\//.test(r.name)).reduce((sum, r) => sum + r.decodedBodySize, 0),
                imageModuleLoaded: performance.getEntriesByType('resource').some(r => r.name.includes('share-image.js'))
            }));
            await page.evaluate(() => {
                beginSimulationExperience();
                appState.audio.masterMuted = true;
                document.getElementById('introOverlay')?.setAttribute('hidden', '');
            });
            pages.push(page);
        }
        const [baseline, page] = pages;
        // Potion priority must survive layout changes in both stacking modes.
        results.potionPriority = await page.evaluate(() => {
            const grid = document.querySelector('.multi-potion-grid');
            const originalFields = [...grid.children];
            const inputs = [...grid.querySelectorAll('[data-multi-potion]')];
            const originalCounts = inputs.map(input => getNumericInputValue(input));
            const quantities = { 'pump-kings-blood': 3, oblivion: 2, 'tutorial-potion': 1, heavenly: 4, godlike: 2 };
            const luckState = { deviceLuckBonus: 0, finalLuckMultiplier: 1 };
            try {
                grid.append(...originalFields.slice().reverse());
                inputs.forEach(input => setNumericInputValue(input, quantities[input.dataset.multiPotion] || 0));
                return [false, true].map(stackCompatiblePotions => collectMultiplePotionBatches(
                    luckState, { stackCompatiblePotions }
                ).map(batch => ({ id: batch.id, count: batch.count, blocksRunes: Boolean(batch.blocksRunes) })));
            } finally {
                inputs.forEach((input, index) => setNumericInputValue(input, originalCounts[index]));
                grid.append(...originalFields);
            }
        });
        const specialPotionBatches = [
            { id: 'pump-kings-blood', count: 3, blocksRunes: true },
            { id: 'oblivion', count: 2, blocksRunes: true },
            { id: 'tutorial-potion', count: 1, blocksRunes: true }
        ];
        assert.deepEqual(results.potionPriority, [
            [...specialPotionBatches, { id: 'heavenly', count: 4, blocksRunes: false }, { id: 'godlike', count: 2, blocksRunes: false }],
            [...specialPotionBatches, { id: 'stacked:heavenly+godlike', count: 2, blocksRunes: false }, { id: 'heavenly', count: 2, blocksRunes: false }]
        ]);
        results.incineratorTime = await page.evaluate(() => {
            const primary = document.getElementById(BIOME_PRIMARY_SELECT_ID);
            const time = document.getElementById(BIOME_TIME_SELECT_ID);
            const original = { primary: primary.value, time: time.value };
            const states = [];
            const capture = () => states.push({
                biome: primary.value, time: time.value,
                incineratorDisabled: primary.querySelector('[value="incinerator"]').disabled,
                nightDisabled: time.querySelector('[value="night"]').disabled
            });
            try {
                primary.value = 'normal';
                time.value = 'night';
                updateBiomeControlConstraints({ source: BIOME_TIME_SELECT_ID });
                capture();
                primary.value = 'incinerator';
                updateBiomeControlConstraints({ source: BIOME_PRIMARY_SELECT_ID });
                capture();
                for (const value of ['day', 'night']) {
                    time.value = value;
                    updateBiomeControlConstraints({ source: BIOME_TIME_SELECT_ID });
                    capture();
                }
                return states;
            } finally {
                primary.value = original.primary;
                time.value = original.time;
                updateBiomeControlConstraints();
            }
        });
        assert.deepEqual(results.incineratorTime, [
            { biome: 'normal', time: 'night', incineratorDisabled: false, nightDisabled: false },
            { biome: 'incinerator', time: 'night', incineratorDisabled: false, nightDisabled: false },
            { biome: 'incinerator', time: 'day', incineratorDisabled: false, nightDisabled: false },
            { biome: 'incinerator', time: 'night', incineratorDisabled: false, nightDisabled: false }
        ]);
        // Rules and formatting comparison across every aura and representative biome/luck contexts.
        const captureRules = async p => p.evaluate(() => {
            const result = [];
            for (const biome of ['normal', 'rainy', 'glitch', 'limbo', 'cyberspace', 'incinerator']) {
                const state = { ...collectBiomeSelectionState(), canonicalBiome: biome, primaryBiome: biome };
                for (const luckValue of [0, 1, 100, 1000000]) {
                    const batch = prepareSimulationBatch({ count: 10, luckValue }, state, { eventChecker: () => true, enabledEventsSet: new Set(EVENT_LIST.map(e => e.id)) });
                    result.push({ biome, luckValue,
                        weights: Array.from(batch.combinedSelection.selection?.cumulativeWeights || []),
                        indices: batch.combinedSelection.auraIndices,
                        bt: batch.combinedSelection.breakthroughIndices });
                }
                for (const potion of [
                    { dune: true, luckValue: 100000 },
                    { oblivion: true, luckValue: 1000000 },
                    { blocksRunes: true, luckValue: 1000000 }
                ]) {
                    const batch = prepareSimulationBatch({ count: 10, ...potion }, state, {
                        eventChecker: () => true, enabledEventsSet: new Set(EVENT_LIST.map(e => e.id))
                    });
                    result.push({ biome, potion,
                        weights: Array.from(batch.combinedSelection.selection?.cumulativeWeights || []),
                        indices: batch.combinedSelection.auraIndices,
                        bt: batch.combinedSelection.breakthroughIndices });
                }
            }
            return result;
        });
        assert.deepEqual(await captureRules(page), await captureRules(baseline));
        results.rulesAndSigils = 'exact match for all 42 rule/potion contexts';
        results.wikiTitleCoverage = await page.evaluate(() => AURA_REGISTRY.map(aura => {
            const fragment = document.createElement('div');
            fragment.innerHTML = formatAuraNameMarkup(aura);
            const title = fragment.querySelector('.wiki-title--aura');
            return { name: aura.name.split(' - ')[0], label: title?.getAttribute('aria-label'),
                art: Boolean(title?.querySelector('[aria-hidden="true"]')?.innerHTML.trim()),
                source: WikiTitleData.auras[aura.name.split(' - ')[0]]?.source };
        }));
        assert.equal(results.wikiTitleCoverage.length, 391);
        results.wikiTitleCoverage.forEach(({name,label,art,source}) => {
            assert.equal(label,name); assert.ok(art,name); assert.match(source,/^https:\/\/sol-rng\.fandom\.com\/wiki\//);
        });
        results.wikiTitleCoverage = `${results.wikiTitleCoverage.length} of ${results.wikiTitleCoverage.length} aura titles have source-backed art and accessible names`;
        // Compare real workers using the app's own compiled candidates. Median
        // includes worker startup; no synthetic probability model is substituted.
        for (let i = 0; !process.env.SKIP_BENCHMARK && i < pages.length; i++) {
            results[i ? 'current' : 'baseline'].workerBenchmarks = await pages[i].evaluate(async () => {
                const results = [];
                for (const luckValue of [1, 1000, 1000000]) {
                    const batch = prepareSimulationBatch({ count: 10000000, luckValue }, collectBiomeSelectionState(), {
                        eventChecker: () => true, enabledEventsSet: new Set(EVENT_LIST.map(e => e.id))
                    });
                    const message = { type: 'start', auraCount: AURA_REGISTRY.length, total: batch.count,
                        prerollAuraIndices: batch.prerollAuraIndices, prerollAuraRatios: batch.prerollAuraRatios,
                        lucklessAuraIndices: batch.lucklessCandidateConfig.auraIndices,
                        lucklessAuraRatios: batch.lucklessCandidateConfig.ratios,
                        lucklessBreakthroughIndices: batch.lucklessCandidateConfig.breakthroughIndices,
                        luckAffectedAuraIndices: batch.luckAffectedCandidateConfig.auraIndices,
                        luckAffectedAuraRatios: batch.luckAffectedCandidateConfig.ratios,
                        luckAffectedBreakthroughIndices: batch.luckAffectedCandidateConfig.breakthroughIndices };
                    const times = [];
                    for (let repeat = 0; repeat < 3; repeat++) {
                        times.push(await new Promise((resolve, reject) => {
                            const worker = new Worker(SIMULATION_WORKER_PATH);
                            const start = performance.now();
                            worker.onmessage = event => {
                                if (event.data.type === 'complete') {
                                    worker.terminate(); resolve(performance.now() - start);
                                } else if (event.data.type === 'error') { worker.terminate(); reject(new Error(event.data.error)); }
                            };
                            worker.onerror = error => { worker.terminate(); reject(new Error(error.message)); };
                            worker.postMessage(message);
                        }));
                    }
                    results.push({ luck: luckValue, rolls: batch.count, medianMs: Math.round(times.sort((a,b) => a-b)[1]) });
                }
                return results;
            });
        }
        results.workerCancellationMs = await page.evaluate(() => new Promise((resolve, reject) => {
            const worker = new Worker(SIMULATION_WORKER_PATH);
            let cancelAt;
            worker.onmessage = event => {
                if (event.data.type === 'progress' && cancelAt === undefined) {
                    cancelAt = performance.now(); worker.postMessage({ type: 'cancel' });
                }
                if (event.data.type === 'cancelled') { worker.terminate(); resolve(performance.now() - cancelAt); }
                if (event.data.type === 'error') { worker.terminate(); reject(new Error(event.data.error)); }
            };
            worker.postMessage({ type: 'start', auraCount: 1, total: 1e12, progressIntervalMs: 10,
                luckAffectedAuraIndices: [0], luckAffectedAuraRatios: [1], luckAffectedBreakthroughIndices: [-1] });
        }));
        assert.ok(results.workerCancellationMs < 250);
        // Real default worker, final summary, then fallback and live lifecycle.
        for (const p of pages) {
            await p.evaluate(() => runRollSimulation({ totalOverride: 1000000, bypassRollWarning: true, bypassRotationPrompt: true }));
            await p.waitForFunction(() => !simulationActive, null, { timeout: 30000 });
            assert.equal(await p.evaluate(() => lastSimulationSummary.rolls), 1000000);
        }
        await page.evaluate(() => {
            createSimulationWorker = () => null;
            runRollSimulation({ totalOverride: 50000, bypassRollWarning: true, bypassRotationPrompt: true });
        });
        await page.waitForFunction(() => !simulationActive);
        assert.equal(await page.evaluate(() => lastSimulationSummary.rolls), 50000);
        // Force an asynchronous worker failure; the same run must recover locally.
        await page.evaluate(() => {
            createSimulationWorker = () => {
                const fake = { postMessage() { setTimeout(() => fake.onerror({ message: 'injected test failure' }), 0); }, terminate() {} };
                return fake;
            };
            runRollSimulation({ totalOverride: 20000, bypassRollWarning: true, bypassRotationPrompt: true });
        });
        await page.waitForFunction(() => !simulationActive);
        assert.equal(await page.evaluate(() => lastSimulationSummary.rolls), 20000);
        await page.evaluate(() => {
            setSimulationMethod('sols-like', { playAudio: false });
            rollingSettingsPreference.solsLikeRollsPerSecond = 1000;
            const original = buildLiveRollMarkup;
            window.liveMarkupBuilds = 0;
            buildLiveRollMarkup = (...args) => { window.liveMarkupBuilds++; return original(...args); };
            window.livePeakRows = 0;
            window.liveRowObserver = new MutationObserver(() => {
                window.livePeakRows = Math.max(window.livePeakRows, document.querySelectorAll('.live-roll-feed__entry').length);
            });
            window.liveRowObserver.observe(feedContainer, { childList: true, subtree: true });
            runRollSimulation({ totalOverride: 12000, bypassRollWarning: true, bypassRotationPrompt: true });
        });
        await page.waitForFunction(() => document.querySelectorAll('.live-roll-feed__entry').length > 20);
        await page.evaluate(() => activeSolLikeSimulationController.togglePause());
        const pausedCount = await page.locator('.live-roll-feed__entry').count();
        await page.waitForTimeout(100);
        assert.equal(await page.locator('.live-roll-feed__entry').count(), pausedCount);
        await page.evaluate(() => activeSolLikeSimulationController.togglePause());
        await page.waitForFunction(() => liveRollFeed.length >= 6000, null, { timeout: 30000 });
        await page.evaluate(() => {
            feedContainer.scrollTop = 0;
            feedContainer.dispatchEvent(new Event('scroll'));
        });
        const reviewingRoll = await page.locator('.live-roll-feed__entry').first().getAttribute('data-roll-number');
        await page.waitForTimeout(250);
        assert.equal(await page.locator('.live-roll-feed__entry').first().getAttribute('data-roll-number'), reviewingRoll);
        await page.evaluate(() => activeSolLikeSimulationController.followLatest());
        await page.waitForFunction(() => !simulationActive, null, { timeout: 30000 });
        assert.equal(await page.evaluate(() => lastSimulationSummary.rolls), 12000);
        const rollNumbers = await page.locator('.live-roll-feed__entry').evaluateAll(entries => entries.map(e => Number(e.dataset.rollNumber)));
        results.liveTemplates = { entries: rollNumbers.length, history: await page.evaluate(() => liveRollFeed.length),
            peakRows: await page.evaluate(() => window.livePeakRows), builds: await page.evaluate(() => window.liveMarkupBuilds) };
        assert.equal(results.liveTemplates.history, 12000);
        assert.equal(results.liveTemplates.entries, 100);
        assert.ok(results.liveTemplates.peakRows <= 100);
        assert.ok(results.liveTemplates.builds < results.liveTemplates.history / 5);
        assert.equal(rollNumbers[0], 11901);
        assert.equal(rollNumbers.at(-1), 12000);
        assert.ok(rollNumbers.every((n, i) => i === 0 || n > rollNumbers[i - 1]));
        await page.locator('#rollFeedSearch').fill('no-such-aura-test');
        await page.waitForFunction(() => [...document.querySelectorAll('.live-roll-feed__entry')].every(e => e.hidden));
        await page.locator('#rollFeedSearch').fill('');
        await page.waitForFunction(() => document.querySelectorAll('.live-roll-feed__entry').length === 100);
        await page.locator('#rollFeedHistoryPrevious').click();
        assert.equal(await page.locator('.live-roll-feed__entry').first().getAttribute('data-roll-number'), '11801');
        await page.locator('#rollFeedHistoryLatest').click();
        assert.equal(await page.locator('.live-roll-feed__entry').last().getAttribute('data-roll-number'), '12000');
        await page.evaluate(() => applyRollFeedSort('recent'));
        assert.equal(await page.locator('.live-roll-feed__entry').first().getAttribute('data-roll-number'), '1');
        const firstAura = await page.locator('.live-roll-feed__entry').first().getAttribute('data-aura-name');
        await page.locator('#rollFeedSearch').fill(decodeURIComponent(firstAura).split(' - ')[0]);
        await page.waitForFunction(() => document.querySelector('.live-roll-feed__entry')?.dataset.rollNumber === '1'
            && getRollFeedSearchQuery().length > 0);
        await page.evaluate(() => applyRollFeedSort('alphabetical'));
        assert.ok(await page.locator('.live-roll-feed__entry').count() <= 100);
        await page.locator('#rollFeedSearch').fill('');
        await page.evaluate(() => { applyRollFeedSearchFilter(); applyRollFeedSort('rarity'); });
        assert.ok(await page.locator('.live-roll-feed__entry').count() <= 100);
        await page.evaluate(() => window.liveRowObserver.disconnect());
        await page.evaluate(() => {
            runRollSimulation({ totalOverride: 100000000, bypassRollWarning: true, bypassRotationPrompt: true });
            activeSolLikeSimulationController.cancel();
        });
        await page.waitForFunction(() => !simulationActive);
        // Lazy export module uses the same Wiki title artwork.
        await page.evaluate(() => AppRuntime.loadScript('scripts/share-image.js'));
        assert.equal(await page.evaluate(() => typeof generateShareImage), 'function');
        const downloadPromise = page.waitForEvent('download');
        await page.evaluate(() => generateShareImage(lastSimulationSummary, 'download'));
        const download = await downloadPromise;
        await download.saveAs(path.join(root, 'test-results/export.png'));
        assert.equal(await download.failure(), null);
        // Deterministic history stress: old-only matches, every sort, stable review,
        // mobile layout, and bounded mounted rows far beyond the reported slowdown.
        await page.setViewportSize({ width: 390, height: 844 });
        results.liveHistoryStress = await page.evaluate(async () => {
            resetLiveRollFeed();
            resetRollFeedVisibilityObserver();
            feedContainer.textContent = '';
            const makePresentation = (name, priority) => {
                const element = document.createElement('span');
                element.className = 'live-roll-feed__entry';
                element.setAttribute('data-roll-feed-entry', '');
                element.textContent = name;
                return { element, auraName: name, alphabeticalName: name, priority, searchText: name.toLowerCase() };
            };
            const old = makePresentation('Ancient test aura', 1000);
            const common = makePresentation('Common test aura with a long mobile wrapping label', 2);
            liveRollFeed = createLiveRollFeed(() => {});
            const timings = [];
            let peak = 0;
            for (let batch = 0; batch < 100; batch++) {
                const entries = Array.from({ length: 500 }, (_, i) => ({
                    presentation: batch === 0 && i === 0 ? old : common,
                    originalOrder: batch * 500 + i + 1
                }));
                const started = performance.now();
                liveRollFeed.append(entries);
                timings.push(performance.now() - started);
                peak = Math.max(peak, feedContainer.querySelectorAll('.live-roll-feed__entry').length);
                await new Promise(requestAnimationFrame);
            }
            const endRoll = listLastRoll();
            function listLastRoll() { return Number(feedContainer.querySelector('.live-roll-feed__window').lastElementChild.dataset.rollNumber); }
            document.getElementById('rollFeedHistoryPrevious').click();
            const reviewed = listLastRoll();
            liveRollFeed.append([{ presentation: common, originalOrder: 50001 }]);
            const reviewStable = reviewed === listLastRoll();
            rollFeedSearchInput.value = 'ancient';
            liveRollFeed.search();
            const oldMatch = listLastRoll();
            rollFeedSearchInput.value = '';
            liveRollFeed.search();
            const firstBySort = {};
            for (const mode of ['rarity', 'alphabetical', 'recent']) {
                liveRollFeed.sort(mode);
                firstBySort[mode] = Number(feedContainer.querySelector('.live-roll-feed__entry').dataset.rollNumber);
            }
            const navigation = document.getElementById('rollFeedHistory').getBoundingClientRect();
            const mobileFits = navigation.left >= 0 && navigation.right <= innerWidth;
            liveRollFeed.followLatest();
            const latestRoll = listLastRoll();
            const total = liveRollFeed.length;
            const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
            return { total, peak, endRoll, latestRoll, reviewStable, oldMatch, firstBySort, mobileFits,
                firstTenMedianMs: median(timings.slice(0, 10)), lastTenMedianMs: median(timings.slice(-10)) };
        });
        assert.equal(results.liveHistoryStress.total, 50001);
        assert.equal(results.liveHistoryStress.peak, 100);
        assert.equal(results.liveHistoryStress.endRoll, 50000);
        assert.equal(results.liveHistoryStress.latestRoll, 50001);
        assert.equal(results.liveHistoryStress.reviewStable, true);
        assert.equal(results.liveHistoryStress.oldMatch, 1);
        assert.deepEqual(results.liveHistoryStress.firstBySort, { rarity: 1, alphabetical: 1, recent: 1 });
        assert.equal(results.liveHistoryStress.mobileFits, true);
        await page.locator('#rollFeedHistory').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(root, 'test-results/live-feed-mobile.png') });
        await page.setViewportSize({ width: 1440, height: 1000 });
        // Preparation is shared, errors release the in-flight entry, and playback
        // consumes the warmed media with normal skip-all cleanup.
        results.cutscene = await page.evaluate(async () => {
            const video = document.getElementById('memory-cutscene');
            const first = prepareCutsceneVideo(video);
            const second = prepareCutsceneVideo(video);
            const shared = first === second;
            await Promise.all([first, second]);
            const fake = document.createElement('video');
            const failure = prepareCutsceneVideo(fake).then(() => false, () => true);
            fake.dispatchEvent(new Event('error'));
            const rejected = await failure;
            return { shared, ready: video.readyState >= 2, rejected, released: !cutscenePreparationRequests.has(fake) };
        });
        assert.deepEqual(results.cutscene, { shared: true, ready: true, rejected: true, released: true });
        await page.evaluate(() => {
            requestFullscreen = async () => false;
            appState.cinematic = true;
            window.testCutsceneSequence = playAuraSequence(['memory-cutscene', 'frostveil-cutscene']);
        });
        await page.waitForFunction(() => appState.videoPlaying && document.getElementById('memory-cutscene').readyState >= 2);
        await page.locator('#skip-all-cinematic-button').click();
        assert.equal(await page.evaluate(async () => (await window.testCutsceneSequence).skippedAll), true);
        assert.equal(await page.evaluate(() => appState.videoPlaying), false);
        // Observe/unobserve dynamically inserted sigils and feed nodes, including
        // nodes already visible when a run's final summary is appended.
        await page.evaluate(() => {
            const element = document.createElement('span');
            element.id = 'observer-test-sigil';
            element.className = 'sigil-outline-glitch';
            element.textContent = 'GLITCH';
            element.style.cssText = 'position:fixed;top:10px;left:10px;z-index:999999;';
            document.body.appendChild(element);
        });
        await page.waitForFunction(() => visibleGlitchSigils.has(document.getElementById('observer-test-sigil')));
        await page.evaluate(() => {
            window.removedTestSigil = document.getElementById('observer-test-sigil');
            window.removedTestSigil.remove();
        });
        await page.waitForFunction(() => !visibleGlitchSigils.has(window.removedTestSigil));
        const localPage = await browser.newPage();
        localPage.on('pageerror', error => errors.push(`file: ${error.message}`));
        await localPage.goto(require('node:url').pathToFileURL(path.join(root, 'index.html')).href);
        await localPage.evaluate(() => {
            appState.audio.masterMuted = true;
            setNumericInputValue(uiHandles.rollCountInput, 1000.5);
            runRollSimulation({ bypassRollWarning: true, bypassRotationPrompt: true });
        });
        await localPage.waitForFunction(() => !simulationActive);
        assert.equal(await localPage.evaluate(() => lastSimulationSummary.rolls), 1000);
        await localPage.close();
        // No automatic worker setup is needed for the common one-roll action.
        assert.equal(await page.evaluate(() => {
            appState.cinematic = false;
            setSimulationMethod('unnamed', { playAudio: false });
            createSimulationWorker = () => { throw new Error('Small rolls should not start a worker'); };
            runRollSimulation({ totalOverride: 1, bypassRollWarning: true, bypassRotationPrompt: true });
            return lastSimulationSummary.rolls;
        }), 1);
        await page.evaluate(() => ensureChangelogTabsReady());
        assert.equal(await page.locator('[data-changelog-tab="v2.1.0"]').count(), 1);
        assert.equal(await page.locator('[data-changelog-tab="v2.1.1"]').count(), 1);
        assert.equal(await page.locator('#versionInfoButton').getAttribute('data-version-id'), 'v2.1.1');
        assert.equal(await page.locator('[data-changelog-tab]').first().getAttribute('data-changelog-tab'), 'v2.1.1');
        assert.equal(await page.locator('#changelog-panel-v210 .changelog-subupdate-card').count(), 0);
        // The bottom switch updates already-mounted and future titles, persists,
        // and leaves item artwork independent of the aura preference.
        const auraSwitch = page.getByRole('switch', { name: 'Full Aura Style Rework', exact: true });
        await page.locator('#optionsMenuToggle').click();
        await page.locator('#qualityPreferencesToggle').click();
        assert.equal(await auraSwitch.getAttribute('aria-checked'), 'true');
        await page.evaluate(() => {
            const fixture = document.createElement('div');
            fixture.id = 'aura-preference-test';
            fixture.innerHTML = Object.keys(WikiTitleData.auras).map(name => WikiTitles.aura(name, '1 in 1,000')).join(' ')
                + WikiTitles.item('Rune of Heavens') + WikiTitles.item('Oblivion');
            document.body.append(fixture);
            window.preferenceFixture = fixture;
        });
        await auraSwitch.click();
        assert.equal(await auraSwitch.getAttribute('aria-checked'), 'false');
        results.auraPreference = await page.evaluate(() => {
            const titles = [...window.preferenceFixture.querySelectorAll('.wiki-title--aura,.wiki-title--rarity')];
            return {
                plainTitles: titles.length,
                allPlain: titles.every(title => getComputedStyle(title.querySelector('.wiki-title__art')).display === 'none'
                    && getComputedStyle(title.querySelector('.wiki-title__plain')).display !== 'none'),
                separateStyledRarities: window.preferenceFixture.querySelectorAll('.wiki-title--rarity').length,
                itemsStillStyled: [...window.preferenceFixture.querySelectorAll('.wiki-title--item .wiki-title__art')]
                    .filter(art => getComputedStyle(art).display !== 'none').length,
                preservedNode: document.getElementById('aura-preference-test') === window.preferenceFixture
            };
        });
        assert.deepEqual(results.auraPreference, {
            plainTitles: 394, allPlain: true, separateStyledRarities: 3, itemsStillStyled: 2, preservedNode: true
        });
        assert.equal(await page.evaluate(() => {
            window.preferenceFixture.insertAdjacentHTML('beforeend', WikiTitles.aura('Common'));
            return getComputedStyle(window.preferenceFixture.lastElementChild.querySelector('.wiki-title__art')).display;
        }), 'none');
        await page.reload();
        await page.waitForFunction(() => typeof WikiTitles !== 'undefined' && document.body.classList.contains('quality-simple-auras'));
        await page.locator('#optionsMenuToggle').click();
        await page.locator('#qualityPreferencesToggle').click();
        assert.equal(await auraSwitch.getAttribute('aria-checked'), 'false');
        await page.setViewportSize({ width: 375, height: 812 });
        await auraSwitch.scrollIntoViewIfNeeded();
        const switchBounds = await auraSwitch.boundingBox();
        assert.ok(switchBounds.x >= 0 && switchBounds.x + switchBounds.width <= 375);
        await page.screenshot({ path: path.join(root, 'test-results/aura-preference-mobile.png') });
        await auraSwitch.press('Space');
        assert.equal(await auraSwitch.getAttribute('aria-checked'), 'true');
        assert.equal(await page.evaluate(() => document.body.classList.contains('quality-simple-auras')), false);
        await page.locator('#qualityPreferencesClose').click();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({ path: path.join(root, 'test-results/current.png'), fullPage: false });
        assert.deepEqual(errors, []);
        results.browserErrors = errors;
        results.lifecycle = 'worker, cancellation, worker-error recovery, file fallback, live pause/resume/search/completion/cancel, image download, cutscene prepare/error/skip-all, observer cleanup, small rolls, changelog passed';
        fs.writeFileSync(path.join(root, 'test-results/browser.json'), JSON.stringify(results, null, 2));
        console.log(JSON.stringify(results, null, 2));
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
