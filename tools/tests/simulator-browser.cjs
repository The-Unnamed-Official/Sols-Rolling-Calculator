const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

test('v2.221 simulator and aura pages', { timeout: 60000 }, async t => {
    const server = http.createServer(async (request, response) => {
        try {
            const url = new URL(request.url, 'http://localhost');
            let target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
            if (target !== root && !target.startsWith(root + path.sep)) {
                response.writeHead(403).end();
                return;
            }
            if ((await fs.stat(target)).isDirectory()) target = path.join(target, 'index.html');
            const content = await fs.readFile(target);
            response.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
            response.end(content);
        } catch {
            response.writeHead(404).end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Keep remote fonts, wiki media, and deployment requests outside the smoke test.
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === origin || url.protocol === 'data:' ? route.continue() : route.abort();
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof AURA_BY_NAME !== 'undefined');

    await t.test('real evaluator enforces event access, biome odds, and Vampire Hunter', async () => {
        const checks = await page.evaluate(() => {
            let checks = 0;
            for (const definition of EventData.halloween26.auras.slice(-11)) {
                const aura = AURA_BY_NAME.get(definition.name);
                const native = definition.nativeBiomes.find(biome => biome !== 'glitch');
                const evaluate = (biome, enabled = true, vampireHunter = false) => {
                    const events = new Set(enabled ? ['halloween26'] : []);
                    return determineAuraEffectiveChance(aura, {
                        biome, primaryBiome: biome, timeBiome: 'night', exclusivityBiome: biome,
                        activeBiomes: [biome, 'night'], breakthroughBiomes: [biome, 'night'],
                        glitchLikeBiome: biome === 'glitch', isRoe: false,
                        enabledEventsSet: events, vampireHunter,
                        eventChecker: candidate => getAuraEventIds(candidate).some(id => events.has(id))
                    });
                };
                const cases = [
                    [native, true, false, definition.chance],
                    ['glitch', true, false, definition.chance],
                    ['normal', true, false, Infinity],
                    [native, false, false, Infinity],
                    ['glitch', false, false, Infinity],
                    [native, true, true, definition.chance * 0.8],
                    ['glitch', true, true, definition.chance * 0.8],
                    ...['pumpkinMoon', 'graveyard', 'bloodRain'].filter(biome => biome !== native)
                        .map(biome => [biome, true, false, Infinity])
                ];
                for (const [biome, enabled, vampireHunter, expected] of cases) {
                    const actual = evaluate(biome, enabled, vampireHunter);
                    if (actual !== expected) throw new Error(`${definition.name} in ${biome}: ${actual} != ${expected}`);
                    checks++;
                }
            }
            const entropy = AURA_BY_NAME.get('Entropy - 30,000,000');
            for (const [biome, expected] of [['normal', 30000000], ['lostForest', 15000000], ['glitch', 15000000]]) {
                const actual = determineAuraEffectiveChance(entropy, {
                    biome, primaryBiome: biome, exclusivityBiome: biome,
                    activeBiomes: [biome], breakthroughBiomes: [biome],
                    glitchLikeBiome: biome === 'glitch', isRoe: false,
                    enabledEventsSet: new Set(), eventChecker: () => true
                });
                if (actual !== expected) throw new Error(`Entropy in ${biome}: ${actual} != ${expected}`);
                checks++;
            }
            const clips = getCutsceneAuras().map(aura => aura.cutscene);
            for (const name of ['graftshifter', 'ashraem', 'death', 'hollow']) {
                if (!clips.includes(name + '-cutscene')) throw new Error(`Missing cutscene filter: ${name}`);
            }
            return checks;
        });
        assert.equal(checks, 102);
    });

    await t.test('Red Full Moon includes exactly the enabled Halloween years', async () => {
        const checks = await page.evaluate(() => {
            let checks = 0;
            const auras = AURA_REGISTRY.filter(aura => getAuraEventIds(aura).some(id => HALLOWEEN_EVENT_IDS.includes(id)));
            for (let mask = 0; mask < 2 ** HALLOWEEN_EVENT_IDS.length; mask++) {
                const events = new Set(HALLOWEEN_EVENT_IDS.filter((id, index) => mask & (1 << index)));
                // An unrelated enabled event must not unlock Halloween auras.
                events.add('valentine24');
                const eventChecker = aura => !getAuraEventIds(aura).length || getAuraEventIds(aura).some(id => events.has(id));
                for (const timeBiome of ['day', 'night']) {
                    const batch = prepareSimulationBatch({ count: 1, luckValue: 1 }, {
                        canonicalBiome: 'fullMoon', primaryBiome: 'fullMoon', timeBiome,
                        activeBiomes: ['fullMoon', timeBiome], breakthroughBiomes: ['fullMoon', timeBiome]
                    }, { eventChecker, enabledEventsSet: events });
                    for (const aura of auras) {
                        const expected = getAuraEventIds(aura).some(id => events.has(id));
                        if (batch.combinedSelection.auraIndices.includes(aura.index) !== expected) {
                            throw new Error(`${aura.name}: wrong Full Moon access with ${[...events]}`);
                        }
                        checks++;
                    }
                }
            }
            return checks;
        });
        assert.ok(checks > 500, `${checks} Halloween access checks`);
    });

    await t.test('equipped Vampire Hunter applies in Red Full Moon across all left devices and potion modes', async () => {
        const checks = await page.evaluate(() => {
            const previousGear = { ...equippedGear };
            const events = new Set(HALLOWEEN_EVENT_IDS);
            const eventContext = { enabledEventsSet: events,
                eventChecker: aura => !getAuraEventIds(aura).length || getAuraEventIds(aura).some(id => events.has(id)) };
            const selection = { canonicalBiome: 'fullMoon', primaryBiome: 'fullMoon', timeBiome: 'night',
                activeBiomes: ['fullMoon', 'night'], breakthroughBiomes: ['fullMoon', 'night'] };
            const auras = AURA_REGISTRY.filter(aura => getAuraEventIds(aura).some(id => HALLOWEEN_EVENT_IDS.includes(id)));
            const require = (condition, message) => { if (!condition) throw new Error(message); };
            let checks = 0;
            try {
                equippedGear.right = 'vampire-hunter';
                for (const left of ['none', ...GearLuck.catalog.left.map(item => item.id)]) {
                    equippedGear.left = left;
                    for (const multiple of [false, true]) {
                        const definitions = [{ count: 1100, ...(multiple ? { id: 'heavenly', baseLuck: 150000 } : {}) }];
                        const { batches, sequencePlan } = prepareEquipmentSimulation(definitions, selection, eventContext, multiple);
                        const inputs = getGearLuckInputs(multiple);
                        for (const batch of batches) {
                            require(batch.vampireHunter, `${left}: missing equipped Vampire Hunter effect`);
                            require(batch.luckValue > 0, `${left}: missing device luck`);
                            for (const aura of auras) {
                                require(batch.breakthroughStatsMap.get(aura.name)?.btChance === aura.chance * 0.8,
                                    `${left}/${multiple}: missing 20% reduction on ${aura.name}`);
                                checks++;
                            }
                        }
                        // Resolve actual rolls through the equipment schedule, including cycle changes.
                        const cursor = SimulationCore.createRollCursor(batches, sequencePlan);
                        for (let roll = 1; roll <= 1100; roll++) {
                            const batch = batches[cursor.next(() => 0)];
                            const state = GearLuck.rollState(left, roll);
                            const expectedLuck = GearLuck.totalLuck(inputs.basic, multiple ? 150000 : inputs.special,
                                inputs.finalMultiplier, state, inputs.basicMultiplier);
                            require(batch.luckValue === expectedLuck, `${left}/${multiple}: wrong device effect on roll ${roll}`);
                        }
                        const hollow = AURA_BY_NAME.get('Hollow - 2,666,666,666');
                        const batch = batches[0];
                        const stats = batch.breakthroughStatsMap.get(hollow.name);
                        stats.count = 1;
                        batch.winCounts[hollow.index] = 1;
                        const results = buildResultEntries([hollow], 'fullMoon', batch.breakthroughStatsMap, batch.luckValue,
                            { potionBatch: batch, winCounts: batch.winCounts, includeFiltered: true });
                        require(results.shareRecords[0].includes('(20%)') && !results.shareRecords[0].includes('[Native]'),
                            `${left}/${multiple}: wrong equipped-device result label`);
                    }
                }
                equippedGear.right = 'none';
                equippedGear.left = 'none';
                const { batches } = prepareEquipmentSimulation([{ count: 1 }], selection, eventContext, false);
                require(!batches[0].vampireHunter && auras.every(aura => !batches[0].breakthroughStatsMap.has(aura.name)),
                    'Vampire Hunter must stop applying when unequipped');
                return checks;
            } finally {
                Object.assign(equippedGear, previousGear);
            }
        });
        assert.ok(checks > 1000, `${checks} equipped-device aura checks`);
    });

    await t.test('Vampire Hunter keeps rarities and labels results, live rolls, and shares correctly', async () => {
        const checks = await page.evaluate(() => {
            const previousTrueChance = appState.selectiveTrueChanceDisplay;
            appState.selectiveTrueChanceDisplay = true;
            const fragment = markup => {
                const template = document.createElement('template');
                template.innerHTML = markup;
                return template.content;
            };
            const require = (condition, message) => { if (!condition) throw new Error(message); };
            let checks = 0;
            try {
                const events = new Set(HALLOWEEN_EVENT_IDS);
                const eventContext = { enabledEventsSet: events,
                    eventChecker: aura => !getAuraEventIds(aura).length || getAuraEventIds(aura).some(id => events.has(id)) };
                for (const definition of EventData.halloween26.auras) {
                    const aura = AURA_BY_NAME.get(definition.name);
                    const biome = definition.nativeBiomes.find(id => id !== 'glitch');
                    const selection = { canonicalBiome: biome, primaryBiome: biome, timeBiome: 'night',
                        activeBiomes: [biome, 'night'], breakthroughBiomes: [biome, 'night'] };
                    for (const vampireHunter of [false, true]) {
                        for (const bonusRollApplied of [false, true]) {
                            const batch = prepareSimulationBatch({ count: 2, luckValue: 1236.4,
                                vampireHunter, bonusRollApplied, rollMultiplier: 2 }, selection, eventContext);
                            require(batch.vampireHunter === vampireHunter, 'Lost Vampire Hunter batch metadata');
                            batch.winCounts[aura.index] = 2;
                            const stats = batch.breakthroughStatsMap.get(aura.name);
                            if (stats) stats.count = 2;
                            const result = buildResultEntries([aura], biome, batch.breakthroughStatsMap, batch.luckValue,
                                { potionBatch: batch, winCounts: batch.winCounts, includeFiltered: true });
                            const expectedChance = formatWithCommas(definition.chance * (vampireHunter ? 0.8 : 1));
                            for (const markup of [result.markupList[0],
                                buildLiveRollMarkup(aura, 1, biome, stats, Boolean(stats), batch.luckValue, { potionBatch: batch })]) {
                                const dom = fragment(markup);
                                const text = dom.textContent;
                                require(dom.querySelector('.aura-rarity')?.textContent === ` - ${expectedChance}`, `${aura.name}: missing/wrong rarity`);
                                require(!text.includes('[Native]'), `${aura.name}: spurious Native label`);
                                require((text.match(/\(20%\)/g) || []).length === Number(vampireHunter), `${aura.name}: wrong 20% marker`);
                                if (vampireHunter) {
                                    const marker = text.indexOf('(20%)');
                                    require(marker < text.indexOf('True Chance:') && marker < text.indexOf('Luck'), '20% must precede odds and luck');
                                    if (bonusRollApplied) require(text.indexOf('(2x)') < marker, '20% must follow 2x');
                                    if (text.includes('Times Rolled:')) require(text.indexOf('Times Rolled: 2') < marker, '20% must follow Times Rolled');
                                }
                                checks++;
                            }
                            require(!result.shareRecords[0].includes('[Native]'), 'Spurious Native label in shared text');
                            require(result.shareVisualRecords[0].prefix === null, 'Spurious Native label in shared image');
                            require(result.shareVisualRecords[0].displayName.endsWith(expectedChance), 'Missing rarity in shared image');
                            require(result.shareRecords[0].includes('(20%)') === vampireHunter, 'Wrong marker in shared text');
                            require(result.shareVisualRecords[0].potionSource.includes('(20%)') === vampireHunter, 'Wrong marker in shared image');
                        }
                    }
                }
                const entropy = AURA_BY_NAME.get('Entropy - 30,000,000');
                const nativeStats = { count: 1, btChance: 15000000 };
                const winCounts = new Float64Array(AURA_REGISTRY.length);
                winCounts[entropy.index] = 1;
                const batch = { vampireHunter: true, luckValue: 1236.4 };
                const result = buildResultEntries([entropy], 'lostForest', new Map([[entropy.name, nativeStats]]), batch.luckValue,
                    { potionBatch: batch, winCounts, includeFiltered: true });
                require(fragment(result.markupList[0]).textContent.includes('[Native]'), 'Lost genuine native label');
                require(!result.shareRecords[0].includes('(20%)'), 'Vampire Hunter must only label Halloween auras');
                return checks;
            } finally {
                appState.selectiveTrueChanceDisplay = previousTrueChance;
            }
        });
        assert.equal(checks, 22 * 2 * 2 * 2);
    });

    await t.test('release notes include v2.221 under v2.220 and fit a mobile viewport', async () => {
        assert.equal(await page.locator('meta[name="app-build"]').getAttribute('content'), '2.221');
        if (await page.locator('#versionChangelogOverlay').getAttribute('hidden') !== null) {
            await page.locator('#versionInfoButton').click();
        }
        await page.locator('#changelog-panel-v2220').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#changelog-panel-v2220 .changelog-eon130__auras > li').count(), 16);
        const subupdate = page.locator('#changelog-panel-v2220 .changelog-subupdate-card');
        assert.equal(await subupdate.locator('.changelog-subupdate-card__version').textContent(), 'v2.221');
        await subupdate.click();
        await subupdate.locator('.changelog-modal__list--sub').waitFor({ state: 'visible' });
        await page.setViewportSize({ width: 390, height: 844 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(overflow <= 1, `Mobile horizontal overflow: ${overflow}px`);
    });

    await t.test('directory search resolves one canonical Phasmophobia profile', async () => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(origin + '/auras/', { waitUntil: 'domcontentloaded' });
        await page.locator('#aura-search').fill('Phasmophobia');
        await page.waitForFunction(() => document.querySelector('#aura-result-count')?.textContent.includes('1 aura'));
        assert.equal(await page.locator('#aura-list [data-aura-row]:visible').count(), 1);
    });

    await t.test('new reward profiles and Rotato load without script errors', async () => {
        for (const slug of ['hollow', 'exanimatus', 'devotee', 'sinister-s', 'sinister-p', 'entropy', 'wraith-phasmophobia']) {
            await page.goto(`${origin}/auras/${slug}/`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.documentElement.dataset.auraLayout !== 'loading');
            assert.equal(await page.locator('article.aura-detail').count(), 1, slug);
            assert.match(await page.locator('#versionInfoButton').innerText(), /2\.221/);
            if (slug === 'hollow') assert.match(await page.locator('body').innerText(), /2,666,666,666/);
            if (slug === 'sinister-p') {
                assert.match(await page.locator('body').innerText(), /Obtainment details are awaiting documentation/);
                assert.doesNotMatch(await page.locator('body').innerText(), /roll details are available in the simulator/);
            }
        }
        await page.goto(origin + '/rotatosimulator/', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof AURA_BY_NAME !== 'undefined');
        assert.equal(await page.evaluate(() => AURA_BY_NAME.has('Hollow - 2,666,666,666')), true);
        assert.deepEqual(errors, []);
    });
});
