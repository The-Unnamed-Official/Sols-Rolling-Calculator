// Run with Playwright installed; BROWSER_EXECUTABLE can select a local browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webm': 'video/webm' };
const server = http.createServer((request, response) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
        ? { executablePath: process.env.BROWSER_EXECUTABLE, headless: true }
        : { channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        // No external account, wiki, soundtrack, or analytics traffic is needed.
        await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
        // Keep collection checks independent of an uploaded Tomorrow video.
        // Forced real playback is exercised explicitly below.
        await page.route('**/files/videos/cutscenes/tomorrowCutscene.webm', route => route.fulfill({ status: 404, body: '' }));
        await page.addInitScript(() => localStorage.setItem('solsRollingCalculator:lastSeenChangelogVersion', 'v2.210'));
        await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            document.querySelectorAll('.modal-overlay, .cutscene-warning-overlay, #introOverlay').forEach(element => element.hidden = true);
            appState.cinematic = false;
            appState.qualityPreferences.disableShakes = true;
            setSingularityPreset();
        });
        for (const id of ['biome-primary-dropdown', 'biome-dropdown']) {
            const order = await page.locator(`#${id} option`).evaluateAll(options => options.map(option => option.value));
            assert.deepEqual(order.slice(order.indexOf('corruption'), order.indexOf('singularity') + 1),
                ['corruption', 'lostForest', 'null', 'radiantForest', 'singularity']);
        }
        assert.equal(await page.locator('#singularityMultiplierOverlay').count(), 0, 'Singularity no longer has a selection popup');
        assert.equal(await page.evaluate(() => getActiveLuckMultipliers().singularity), 1.2);
        assert.equal(await page.evaluate(() => currentLuck), 1.2, 'The Singularity buff changes actual luck');
        assert.equal(await page.locator('[data-biome-buff]:visible').count(), 1);
        await page.waitForFunction(() => document.querySelector('[data-biome-buff="singularity"] img').naturalWidth > 0);
        await page.locator('[data-biome-buff="singularity"]').hover();
        assert.equal(await page.locator('[data-biome-buff-details="singularity"]').isVisible(), true);
        await page.locator('[data-biome-buff="singularity"]').click();
        await page.evaluate(() => {
            setPrimaryBiomeSelection('lostForest');
            updateBiomeControlConstraints({ source: BIOME_PRIMARY_SELECT_ID });
        });
        assert.equal(await page.locator('#biomeBuffs').isVisible(), false);
        assert.equal(await page.locator('#biomeBuffTooltip').isVisible(), false, 'Changing biome clears pinned buff details');
        assert.equal(await page.evaluate(() => getActiveLuckMultipliers().singularity), 1);
        const lostIcon = page.locator('details[data-select="biome-primary-dropdown"] summary img');
        assert((await lostIcon.getAttribute('src')).endsWith('lostForestBiomeIcon.png'));
        await lostIcon.evaluate(img => img.decode());

        await page.evaluate(() => {
            const toggle = document.getElementById('dev-biomes-toggle');
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
        });
        assert.equal(await page.locator('#adminAbuseChoiceOverlay').count(), 0, 'Admin Abuse choices live inside buff details');
        for (const [biome, name, multiplier] of [['anotherRealm', 'Xyz', 1.2], ['mastermind', 'Axis', 1.2], ['fullMoon', 'XC', 1.5], ['edict', 'Word', 2.25]]) {
            await page.evaluate(biome => {
                setPrimaryBiomeSelection(biome);
                updateBiomeControlConstraints({ source: BIOME_PRIMARY_SELECT_ID });
            }, biome);
            assert.equal(await page.locator('[data-biome-buff]:visible').count(), 1);
            assert.equal(await page.locator('[data-dev-buff-multiplier]').textContent(), `×${biome === 'edict' ? 1.5 : multiplier}`);
            assert.equal(await page.evaluate(() => currentLuck), multiplier, name + ' affects actual luck');
            await page.locator('[data-biome-buff="dev"] img').evaluate(img => img.decode());
            await page.locator('[data-biome-buff="dev"]').click();
            assert.equal(await page.locator('[data-biome-buff-details="dev"]').isVisible(), true);
            assert.equal(await page.locator('[data-dev-buff-title]').textContent(), name + ' Admin Abuse');
            await page.locator('[data-dev-buff-variant="old"]').click();
            const oldMultiplier = biome === 'edict' ? 1.2 : 2;
            assert.equal(await page.evaluate(() => currentLuck), oldMultiplier);
            assert.equal(await page.locator('[data-dev-buff-multiplier]').textContent(), `×${oldMultiplier}`);
            assert.equal(await page.locator('[data-dev-buff-variant="old"]').getAttribute('aria-pressed'), 'true');
            assert.equal(await page.locator('[data-biome-buff-details="dev"]').isVisible(), true, 'Choice stays open for inspection');
            await page.locator('[data-dev-buff-variant="new"]').click();
            assert.equal(await page.evaluate(() => currentLuck), multiplier);
            if (biome === 'edict') {
                assert.match(await page.locator('[data-dev-buff-effect]').textContent(), /×1\.5 Basic Luck Multiplier · ×1\.5 Final Luck Multiplier/);
                const luck = await page.evaluate(() => {
                    equippedGear.right = 'exo';
                    equippedGear.left = 'gemstone';
                    additionalBasicBuffs = 3;
                    baseLuck = 106;
                    singleSpecialLuck = 100;
                    recomputeLuckValue();
                    const selection = collectBiomeSelectionState();
                    const events = { eventChecker: () => true, enabledEventsSet: enabledEvents };
                    const single = prepareEquipmentSimulation([{ count: 11 }], selection, events, false).batches;
                    const multiple = prepareEquipmentSimulation([{ count: 1, baseLuck: 100 }], selection, events, true).batches;
                    return {
                        preview: currentLuck, inputs: getGearLuckInputs(),
                        normal: single.find(batch => !batch.bonusRollApplied && !batch.gemstoneLuck).luckValue,
                        bonus: single.find(batch => batch.bonusRollApplied && !batch.gemstoneLuck).luckValue,
                        gemstone: single.find(batch => !batch.bonusRollApplied && batch.gemstoneLuck === 0.3).luckValue,
                        multiPreview: calculateMultiplePotionLuck(100),
                        multiRoll: multiple[0].luckValue,
                        stackedPreview: calculateMultiplePotionLuck(300)
                    };
                });
                assert.equal(luck.inputs.basic, 10);
                assert.equal(luck.inputs.basicMultiplier, 1.5);
                assert.equal(luck.inputs.finalMultiplier, 1.5);
                assert.equal(luck.preview, 172.5, 'Basic luck is boosted before adding the 100 special luck');
                assert.equal(luck.normal, 172.5, 'Prepared rolls match the luck preview');
                assert.equal(luck.bonus, 195, 'Bonus rolls boost basic luck before potions');
                assert(Math.abs(luck.gemstone - 173.175) < 1e-9, 'Gemstone additions receive the basic multiplier');
                assert.equal(luck.multiPreview, 161.25);
                assert.equal(luck.multiRoll, luck.multiPreview);
                assert.equal(luck.stackedPreview, 461.25);
                await page.locator('[data-dev-buff-variant="old"]').click();
                assert.equal(await page.evaluate(() => currentLuck), 132, 'Old Word remains a single 1.2 final multiplier');
                await page.evaluate(() => {
                    equippedGear.right = 'none'; equippedGear.left = 'none';
                    additionalBasicBuffs = 0; baseLuck = 1; singleSpecialLuck = 0;
                });
                await page.locator('[data-dev-buff-variant="new"]').click();
                assert.equal(await page.evaluate(() => currentLuck), 2.25);
            }
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#biomeBuffTooltip').isVisible(), false);
        }
        await page.evaluate(() => resetBiomeChoice());
        assert.equal(await page.locator('#biomeBuffs').isVisible(), false);
        assert.equal(await page.evaluate(() => currentLuck), 1, 'Leaving a developer biome removes its effect');

        fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
        for (const [width, columns] of [[1365, 3], [360, 2]]) {
            await page.setViewportSize({ width, height: 900 });
            const cards = await page.locator('.quick-action-group > button').evaluateAll(buttons => buttons.map(button => {
                const rect = button.getBoundingClientRect();
                return { top: Math.round(rect.top), fits: button.scrollWidth <= button.clientWidth + 1, label: button.textContent.trim(), width: button.clientWidth, contentWidth: button.scrollWidth };
            }));
            assert.equal(cards.length, 6, 'Six biome shortcuts form full rows');
            const rows = new Map();
            cards.forEach(card => rows.set(card.top, (rows.get(card.top) || 0) + 1));
            await page.locator('.parameter-console__module--actions').screenshot({ path: path.join(root, `test-results/environment-shortcuts-${width}.png`) });
            assert([...rows.values()].every(count => count === columns), `Shortcuts have no orphan at ${width}px: ${JSON.stringify(cards)}`);
            assert(cards.every(card => card.fits), `Shortcut labels fit at ${width}px: ${JSON.stringify(cards)}`);
            const utilities = await page.locator('.quick-action-group__utilities button').evaluateAll(buttons => buttons.map(button => ({ top: button.getBoundingClientRect().top, width: button.getBoundingClientRect().width })));
            assert.equal(utilities[0].top, utilities[1].top);
            assert(Math.abs(utilities[0].width - utilities[1].width) < 1, 'RoE and Reset share a balanced row');
        }
        await page.setViewportSize({ width: 1365, height: 900 });
        await page.evaluate(() => {
            setRadiantForestPreset();
        });
        assert.equal(await page.locator('#biome-time-dropdown').inputValue(), 'night');
        assert.equal(await page.locator('#biome-other-dropdown').inputValue(), 'none');
        assert.equal(await page.locator('#biome-time-dropdown option[value="day"]').evaluate(option => option.disabled), true);
        assert.equal(await page.evaluate(() => getActiveLuckMultipliers().moonCatch), 1.2);
        await page.waitForFunction(() => document.querySelector('[data-biome-buff="moonCatch"] img').naturalWidth > 0);
        assert.equal(await page.locator('[data-radiant-count]').textContent(), '0/7');
        assert.equal(await page.locator('[data-biome-buff="moons"]').isVisible(), true, 'The moon buff is available on a single unnamed roll');
        await page.locator('[data-biome-buff="moons"]').hover();
        assert.equal(await page.locator('[data-biome-buff-details="moons"]').isVisible(), true);
        assert.equal(await page.locator('[data-radiant-moon]').count(), 7);
        await page.mouse.move(0, 0);
        await page.waitForFunction(() => document.getElementById('biomeBuffTooltip').hidden);

        // Target intervals in the real prepared distribution so separate
        // one-roll runs and a switch of simulation methods share one collection.
        await page.evaluate(() => {
            window.releaseEntropy = drawEntropy;
            const prepared = prepareSimulationBatch({ count: 1, luckValue: currentLuck }, collectBiomeSelectionState(), {
                eventChecker: () => true, enabledEventsSet: enabledEvents
            });
            const targets = [6, 0, 1, 3, 2, 4, 5];
            drawEntropy = () => {
                const target = targets.shift();
                if (target === undefined) throw new Error('Unexpected entropy draw');
                const combined = prepared.radiantSelections[SimulationCore.radiantUnlockMask(radiantForestState)];
                const index = combined.auraIndices.indexOf(RADIANT_FOREST_CONFIG.moonIndices[target]);
                if (index < 0) throw new Error('Missing moon candidate');
                const end = combined.selection.cumulativeWeights[index];
                const start = index ? combined.selection.cumulativeWeights[index - 1] : 0;
                return (start + end) / 2;
            };
            applyRollPreset(1);
            runRollSimulation({ bypassRollWarning: true, bypassRotationPrompt: true });
        });
        await page.waitForFunction(() => !simulationActive);
        assert.equal(await page.evaluate(() => radiantForestState.moons), 64);
        for (let roll = 0; roll < 3; roll++) {
            await page.evaluate(() => runRollSimulation({ bypassRollWarning: true, bypassRotationPrompt: true }));
            await page.waitForFunction(() => !simulationActive);
        }
        assert.equal(await page.evaluate(() => radiantForestState.moons), 75);
        assert.equal(await page.locator('[data-radiant-unlock]:visible').count(), 1);
        await page.evaluate(() => {
            setSimulationMethod('sols-like', { playAudio: false });
            applyRollPreset(3);
            runRollSimulation({ bypassRollWarning: true, bypassRotationPrompt: true });
        });
        await page.waitForFunction(() => !simulationActive);
        assert.equal(await page.locator('.roll-trigger').textContent(), 'Remember');
        assert.equal(await page.locator('[data-radiant-unlock]:visible').count(), 3);
        await page.evaluate(() => applyRollPreset(1));
        await page.evaluate(() => runRollSimulation({ bypassRollWarning: true, bypassRotationPrompt: true }));
        await page.waitForFunction(() => !simulationActive);
        await page.evaluate(() => { drawEntropy = window.releaseEntropy; delete window.releaseEntropy; });
        assert.equal(await page.evaluate(() => readAuraWinCount(AURA_BY_NAME.get('Tomorrow'))), 1);
        assert.equal(await page.locator('.roll-trigger').textContent(), 'Roll');
        assert.equal(await page.locator('[data-radiant-unlock]:visible').count(), 3);

        // Check touch-sized layout with every buff present, and tap details.
        await page.setViewportSize({ width: 360, height: 800 });
        await page.locator('[data-biome-buff="jade"]').click();
        assert.equal(await page.locator('[data-biome-buff-details="jade"]').isVisible(), true);
        const row = await page.locator('#biomeBuffs').boundingBox();
        assert(row.x >= 0 && row.x + row.width <= 360, 'All buffs fit in one mobile row');
        assert(Math.abs(800 - row.y - row.height - 20) < 1, 'Buffs sit 20px above the bottom');
        const tooltip = await page.locator('#biomeBuffTooltip').boundingBox();
        assert(tooltip.x >= 0 && tooltip.x + tooltip.width <= 360, 'Details fit the viewport');
        fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
        await page.screenshot({ path: path.join(root, 'test-results/eon130-mobile.png') });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#biomeBuffTooltip').isVisible(), false);

        await page.evaluate(() => {
            setPrimaryBiomeSelection('lostForest');
            updateBiomeControlConstraints({ source: BIOME_PRIMARY_SELECT_ID });
        });
        assert.equal(await page.locator('#biomeBuffs').isVisible(), false);
        assert.equal(await page.evaluate(() => radiantForestState.moons), 0);
        assert.equal(await page.evaluate(() => getActiveLuckMultipliers().moonCatch), 1);
        await page.evaluate(() => {
            setPrimaryBiomeSelection('radiantForest');
            updateBiomeControlConstraints({ source: BIOME_PRIMARY_SELECT_ID });
            setSimulationMethod('unnamed', { playAudio: false });
            radiantForestState.moons = 127;
            syncBiomeBuffs();
        });
        assert.equal(await page.locator('.roll-trigger').textContent(), 'Remember', 'Single unnamed rolls display Remember');
        await page.evaluate(() => {
            equippedGear.right = 'singularity';
            equippedGear.left = 'the-thing';
            equippedGear.pocket = 'soul-master';
            baseLuck = 600001;
            singleSpecialLuck = 600000;
            document.getElementById('vip-dropdown').value = '1.2';
            recomputeLuckValue();
        });
        assert.equal(await page.evaluate(() => currentLuck), 1, 'Remember ignores gear, potions, VIP, and biome luck');
        assert.equal(await page.locator('.roll-trigger').evaluate(button => button.classList.contains('roll-trigger--remember')), true);
        const rememberStyle = await page.locator('.roll-trigger').evaluate(button => {
            const style = getComputedStyle(button);
            return { color: style.color, italic: style.fontStyle, transform: style.textTransform };
        });
        assert.deepEqual(rememberStyle, { color: 'rgb(237, 180, 247)', italic: 'italic', transform: 'none' });
        await page.locator('.roll-trigger').screenshot({ path: path.join(root, 'test-results/eon130-remember.png') });
        await page.evaluate(() => runRollSimulation({ bypassRollWarning: true, bypassRotationPrompt: true }));
        await page.waitForFunction(() => !simulationActive);
        assert.equal(await page.evaluate(() => radiantForestState.rewardClaimed), true, 'Single unnamed rolls claim Tomorrow');
        assert.equal(await page.evaluate(() => readAuraWinCount(AURA_BY_NAME.get('Tomorrow'))), 1);
        assert.equal(await page.evaluate(() => lastSimulationSummary.luckLabel), '1');
        assert.equal(await page.evaluate(() => currentLuck > 600000), true, 'Configured luck returns after Remember');
        await page.evaluate(() => {
            radiantForestState.rewardClaimed = false;
            applyRollPreset(5000);
        });
        assert.equal(await page.locator('.roll-trigger').textContent(), 'Remember');
        let workerStarted = false;
        page.on('worker', () => { workerStarted = true; });
        await page.evaluate(() => runRollSimulation({ bypassRollWarning: true, bypassRotationPrompt: true }));
        await page.waitForFunction(() => !simulationActive);
        assert.equal(workerStarted, false, 'An armed Remember always runs one roll');
        assert.equal(await page.evaluate(() => lastSimulationSummary.rolls), 1);
        assert.equal(await page.evaluate(() => lastSimulationSummary.luckLabel), '1');
        assert.equal(await page.evaluate(() => readAuraWinCount(AURA_BY_NAME.get('Tomorrow'))), 1);
        assert.equal(await page.evaluate(() => radiantForestState.rewardClaimed), true);
        assert.equal(await page.locator('.roll-trigger').textContent(), 'Start Rolling');

        // Finish the collection inside a real potion worker, then check that
        // Tomorrow is reported separately with no potion or equipment bonus.
        await page.evaluate(() => {
            radiantForestState.moons = 126;
            radiantForestState.rewardClaimed = false;
            syncBiomeBuffs();
            setPotionSimulationMode('multiple', { playAudio: false });
            setNumericInputValue(document.querySelector('[data-multi-potion="heavenly"]'), 5000, { format: true });
            syncMultiplePotionTotal();
            window.releasePreparation = prepareEquipmentSimulation;
            prepareEquipmentSimulation = (...args) => {
                const prepared = window.releasePreparation(...args);
                window.rememberPrepared = prepared;
                return prepared;
            };
            window.releaseWorkerPostMessage = Worker.prototype.postMessage;
            Worker.prototype.postMessage = function(message, ...args) {
                if (message.type === 'start' && message.radiant) {
                    const moon = message.radiant.config.moonIndices[0];
                    const combined = { auraIndices: [moon], breakthroughIndices: [-1],
                        selection: { cumulativeWeights: new Float64Array([1]), totalProbability: 1 } };
                    message.batches.forEach(batch => { batch.radiantSelections = Array(8).fill(combined); });
                }
                return window.releaseWorkerPostMessage.call(this, message, ...args);
            };
            runRollSimulation({ bypassRollWarning: true, bypassRotationPrompt: true });
        });
        await page.waitForFunction(() => !simulationActive);
        assert.equal(workerStarted, true, 'Collection completion exercises the actual worker');
        assert.equal(await page.evaluate(() => readAuraWinCount(AURA_BY_NAME.get('Tomorrow'))), 1);
        const tomorrowResult = page.locator('[data-roll-feed-entry]').filter({ hasText: 'Tomorrow' });
        assert.doesNotMatch(await tomorrowResult.textContent(), /With|bonus|Gemstone/);
        assert.deepEqual(await page.evaluate(() => {
            const prepared = window.rememberPrepared;
            const reward = prepared.batches[prepared.rewardBatchIndex];
            const index = RADIANT_FOREST_CONFIG.rewardIndex;
            return { luck: reward.luckValue, potion: reward.id, bonus: reward.bonusRollApplied,
                wins: reward.winCounts[index], potionWins: prepared.batches.reduce((sum, batch, batchIndex) =>
                    sum + (batchIndex === prepared.rewardBatchIndex ? 0 : batch.winCounts[index]), 0) };
        }), { luck: 1, potion: null, bonus: false, wins: 1, potionWins: 0 });
        assert.equal(await page.locator('[data-multi-potion="heavenly"]').inputValue(), '5,000');
        await page.evaluate(() => {
            Worker.prototype.postMessage = window.releaseWorkerPostMessage;
            delete window.releaseWorkerPostMessage;
            prepareEquipmentSimulation = window.releasePreparation;
            delete window.releasePreparation;
            delete window.rememberPrepared;
            radiantForestState.rewardClaimed = false;
            syncBiomeBuffs();
            runRollSimulation({ bypassRollWarning: true, bypassRotationPrompt: true });
        });
        await page.waitForFunction(() => !simulationActive);
        assert.deepEqual(await page.evaluate(() => ({ rolls: lastSimulationSummary.rolls,
            luck: lastSimulationSummary.luckLabel, potions: lastSimulationSummary.potionBatches })),
        { rolls: 1, luck: '1', potions: [] }, 'Remember bypasses queued potion quantities');
        await page.evaluate(() => {
            setPotionSimulationMode('single', { playAudio: false });
        });

        // Simulate the future uploaded video without adding a placeholder to
        // the actual project. Real media playback must bypass both filters.
        await page.route('**/files/videos/cutscenes/tomorrowCutscene.webm', route => route.fulfill({
            path: path.join(root, 'files/videos/cutscenes/pukekoGodCutscene.webm'), contentType: 'video/webm'
        }));
        await page.evaluate(() => {
            delete document.getElementById('tomorrow-cutscene').dataset.cutscenePending;
            rollingSettingsPreference.cutscenePlaybackFilters[ RADIANT_REWARD_AURA_NAME ] = false;
            appState.cinematic = false;
        });
        for (const [method, total] of [['unnamed', 1], ['unnamed', 5000], ['sols-like', 1]]) {
            await page.evaluate(({ method, total }) => {
                radiantForestState.rewardClaimed = false;
                setSimulationMethod(method, { playAudio: false });
                applyRollPreset(total);
                runRollSimulation({ bypassRollWarning: true, bypassRotationPrompt: true });
            }, { method, total });
            await page.locator('#tomorrow-cutscene').waitFor({ state: 'visible' });
            await page.waitForFunction(() => !document.getElementById('tomorrow-cutscene').paused);
            assert.equal(await page.evaluate(() => simulationActive), true, 'Rolling waits for the forced Tomorrow cutscene');
            assert.equal(await page.evaluate(() => appState.cinematic), false, 'The user’s cutscene preference is preserved');
            await page.mouse.move(page.viewportSize().width - 30, 25);
            await page.locator('#skip-cinematic-button').click();
            await page.waitForFunction(() => !simulationActive);
            assert.equal(await page.evaluate(() => readAuraWinCount(AURA_BY_NAME.get('Tomorrow'))), 1);
        }
        await page.locator('#versionInfoButton').click();
        await page.locator('#changelog-panel-v2210').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.changelog-eon130__section').count(), 8);
        const rollingCredit = page.locator('#changelog-rolling-recovery .credits-text');
        assert.equal(await rollingCredit.evaluate(element => getComputedStyle(element).textAlign), 'center');
        assert.equal(await rollingCredit.locator('a').getAttribute('href'), 'https://discord.com/users/1093918845544190132');
        assert.equal(await rollingCredit.locator('a').textContent(), 'jhtfe');
        for (const width of [1365, 360]) {
            await page.setViewportSize({ width, height: 900 });
            const modal = page.locator('#versionChangelogOverlay .changelog-modal');
            assert(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `Changelog fits at ${width}px`);
            await modal.screenshot({ path: path.join(root, `test-results/changelog-eon130-${width}.png`) });
        }
        await page.setViewportSize({ width: 1365, height: 900 });
        await page.goto(origin + '/auras/', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('details[data-select="aura-biome"] .sigil-outline-lost-forest'));
        const directoryOptions = await page.locator('#aura-biome option').evaluateAll(options => options.map(option => ({ label: option.value, icon: option.dataset.icon })));
        const corruption = directoryOptions.findIndex(option => option.label === 'Corruption');
        assert.deepEqual(directoryOptions.slice(corruption, corruption + 5).map(option => option.label),
            ['Corruption', 'The Lost Forest', 'Null', 'The Radiant Forest', 'Singularity']);
        assert(directoryOptions.find(option => option.label === 'The Lost Forest').icon.endsWith('lostForestBiomeIcon.png'));
        const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'data/auras/catalogue.json'), 'utf8'));
        for (const biome of ['The Lost Forest', 'The Radiant Forest']) {
            await page.goto(origin + '/auras/?size=90&biome=' + encodeURIComponent(biome), { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.documentElement.dataset.auraLayout === 'ready');
            const expected = catalogue.filter(entry => entry.biomes.includes(biome));
            const visible = await page.locator('#aura-list [data-aura-row]').evaluateAll(rows => rows.map(row => row.dataset.name));
            assert.deepEqual(visible.sort(), expected.map(entry => entry.name).sort(), biome + ' includes every new and existing native');
            for (const entry of expected.filter(entry => entry.nativeRarity && !entry.exclusive)) {
                const row = page.locator('#aura-list [data-aura-row]').filter({ has: page.locator(`a[href*="/${entry.slug}/"]`) });
                assert.equal(await row.locator('.aura-row__native').textContent(), 'Native: ' + entry.nativeRarity);
            }
            const links = await page.locator('#aura-list a.aura-page-link').evaluateAll(links => links.map(link => new URL(link.href).pathname));
            assert(links.every(link => link.endsWith('/') && !link.includes('/index')));
        }
        const lunar = page.locator('#aura-list a[href*="/lunar/"]');
        await lunar.click();
        await page.waitForFunction(() => document.documentElement.dataset.auraLayout === 'ready');
        assert.equal(new URL(page.url()).pathname, '/auras/lunar/');
        assert((await page.locator('.aura-facts').textContent()).includes('The Radiant Forest'));
        await page.locator('[data-aura-directory-return]').click();
        await page.waitForURL(url => url.pathname === '/auras/');
        assert.equal(new URL(page.url()).searchParams.get('biome'), 'The Radiant Forest');
        await page.goto(origin + '/auras/tree-house/');
        await page.waitForFunction(() => document.documentElement.dataset.auraLayout === 'ready');
        const treeTitle = page.locator('h1 [data-aura-title="Tree House"]');
        assert.match(await treeTitle.innerHTML(), /linear-gradient/);
        assert.match(await treeTitle.innerHTML(), /Accanthis ADF Std/);
        await page.locator('.aura-detail__hero').screenshot({ path: path.join(root, 'test-results/tree-house-title.png') });
        assert.deepEqual(errors, [], 'The simulator must run without uncaught browser errors');
        console.log('Passed: biome icons/order, developer buff choices and actual luck, responsive changelog/shortcuts, persistent single-roll moons, forced Tomorrow playback, all forest natives and odds, and clean directory/profile return navigation.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
