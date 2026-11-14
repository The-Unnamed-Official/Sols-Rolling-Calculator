const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

test('v2.220 simulator and aura pages', { timeout: 60000 }, async t => {
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

    await t.test('release notes open at v2.220 and fit a mobile viewport', async () => {
        assert.equal(await page.locator('meta[name="app-build"]').getAttribute('content'), '2.220');
        if (await page.locator('#versionChangelogOverlay').getAttribute('hidden') !== null) {
            await page.locator('#versionInfoButton').click();
        }
        await page.locator('#changelog-panel-v2220').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#changelog-panel-v2220 .changelog-eon130__auras > li').count(), 16);
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
            assert.match(await page.locator('#versionInfoButton').innerText(), /2\.220/);
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
