const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
let server;
let origin;
let browser;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
before(async () => {
    server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/simulator\//, '/');
        const target = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
        if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) { response.writeHead(404).end(); return; }
        response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
        fs.createReadStream(target).pipe(response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });

async function fixture(local = false, { fullscreenPrompt = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(prompt => {
        localStorage.setItem('solsRollingCalculator:lastSeenChangelogVersion', prompt ? 'v2.214' : 'v2.215');
        if (prompt) localStorage.removeItem('solsRollingCalculator:fullscreenCutscenePrompt:v2.215');
        else localStorage.setItem('solsRollingCalculator:fullscreenCutscenePrompt:v2.215', 'true');
    }, fullscreenPrompt);
    await context.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(origin) || url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        if (url.startsWith('https://blocked-fonts.example/')) return route.fulfill({ status: 200, contentType: 'text/css', body: '@font-face{font-family:Unavailable;src:url(font.woff2)}' });
        return route.fulfill({ status: 200, contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/plain', body: '' });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    const warnings = [];
    const missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(origin)) missing.push(response.url()); });
    await page.goto(local ? pathToFileURL(path.join(root, 'index.html')).href : origin + '/', { waitUntil: 'load' });
    await page.evaluate(async () => {
        const auras = ['Equinox', 'Quartz', 'Meta'].map(name => AURA_BY_CANONICAL_NAME.get(name));
        const counts = new Float64Array(AURA_REGISTRY.length);
        for (const aura of auras) counts[aura.index] = 3;
        setSelectiveTrueChanceDisplayEnabled(false, { persistPreference: false });
        const results = buildResultEntries(auras, 'normal', new Map(), 45.6, {
            winCounts: counts, potionBatch: { luckValue: 45.6, bonusRollApplied: true, rollMultiplier: 2 }
        });
        lastSimulationSummary = {
            rolls: 9, luck: 45.6, potionMode: POTION_SIMULATION_MODE.SINGLE,
            biomeLabel: 'Normal', runeLabel: 'None', timeLabel: 'Day',
            eventLabels: ['Halloween 2026'], executionSeconds: 1, xpTotal: 100,
            xpLines: [], shareRecords: results.shareRecords, shareVisuals: results.shareVisualRecords
        };
        const original = CanvasRenderingContext2D.prototype.fillText;
        window.exportedText = [];
        window.exportedDraws = [];
        CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
            window.exportedText.push(text);
            window.exportedDraws.push({ text, x: args[0], y: args[1], color: this.fillStyle });
            return original.call(this, text, ...args);
        };
        await AppRuntime.loadScript('scripts/vendor/html-to-image.js');
        const rasterize = htmlToImage.toCanvas;
        htmlToImage.toCanvas = async (element, options) => {
            if (element.matches('[data-result-export]')) window.exportedSummary = {
                text: element.textContent,
                metrics: [...element.querySelectorAll('[data-result-metric]')].map(metric => ({ text: metric.querySelector('dd').textContent, color: getComputedStyle(metric.querySelector('dd')).color })),
                styles: [...element.querySelectorAll('[class*="sigil-outline-"], .wiki-title--item, .equipment-effect--luck')].map(item => item.className),
                overflow: element.scrollWidth > element.clientWidth
            };
            return rasterize(element, options);
        };
    });
    return { context, page, errors, warnings, missing };
}
async function imageOptions(page) {
    await page.locator('#feedShareButton').click();
    await page.locator('[data-share-format="image"]').click();
}
async function download(page, mode = 'download', filename = 'share-image.png') {
    const pending = page.waitForEvent('download');
    await page.locator(`[data-image-share-mode="${mode}"]`).click();
    const image = await pending;
    assert.equal(await image.failure(), null);
    assert.equal(image.suggestedFilename(), 'sols-roll-result.png');
    const target = path.join(root, '.cache/verification/2.215', filename);
    await image.saveAs(target);
    const data = fs.readFileSync(target);
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.equal(data.readUInt32BE(16), 1260);
    assert.ok(data.readUInt32BE(20) >= 560);
    assert.ok(data.length > 10000);
}

test('Download works when CSS rules are inaccessible and font requests are blocked', async () => {
    const { context, page, errors, warnings, missing } = await fixture();
    try {
        await page.evaluate(() => {
            const link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = 'https://blocked-fonts.example/fonts.css';
            document.head.append(link);
            Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', { configurable: true, get() { throw new DOMException('Cannot access rules', 'SecurityError'); } });
        });
        await imageOptions(page);
        await download(page, 'download', 'share-image-blocked-styles.png');
        await page.waitForFunction(() => document.getElementById('feedShareButton').textContent === 'Image downloaded!');
        assert.deepEqual(errors, []);
        assert.deepEqual(missing, []);
        assert.equal(warnings.some(message => message.includes('Styled aura export unavailable')), false);
    } finally { await context.close(); }
});
test('image sharing works when index.html is opened directly as a local file', async () => {
    const { context, page, errors, warnings } = await fixture(true);
    try {
        const inaccessible = await page.evaluate(() => {
            try { return [...document.styleSheets].find(sheet => sheet.href?.includes('wiki-title-fonts.css')).cssRules.length; }
            catch (error) { return error.name; }
        });
        assert.equal(inaccessible, 'SecurityError');
        await imageOptions(page);
        await download(page, 'download', 'share-image-local-file.png');
        await page.waitForFunction(() => document.getElementById('feedShareButton').textContent === 'Image downloaded!');
        assert.deepEqual(errors, []);
        assert.equal(warnings.some(message => message.includes('Styled aura export unavailable')), false);
    } finally { await context.close(); }
});
test('a styled-rendering failure still downloads a PNG with all aura and luck details', async () => {
    const { context, page, errors, warnings } = await fixture();
    try {
        await page.evaluate(async () => {
            await AppRuntime.loadScript('scripts/vendor/html-to-image.js');
            htmlToImage.toCanvas = async () => { throw new DOMException('Canvas blocked', 'SecurityError'); };
        });
        await imageOptions(page);
        await download(page, 'download', 'share-image-text-fallback.png');
        const text = await page.evaluate(() => exportedText.join('\n'));
        assert.match(text, /Equinox/);
        assert.match(text, /Quartz/);
        assert.match(text, /Meta/);
        assert.match(text, /45\.6 Luck/);
        assert.match(text, /1 Luck/);
        assert.equal(warnings.some(message => message.includes('Styled aura export unavailable')), true);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
test('Copy exports an actual PNG blob through the clipboard option', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            async write(items) { const blob = await items[0].getType('image/png'); window.copiedImage = { type: blob.type, size: blob.size, bytes: [...new Uint8Array(await blob.arrayBuffer()).slice(0, 8)] }; }
        } }));
        await imageOptions(page);
        await page.locator('[data-image-share-mode="copy"]').click();
        await page.waitForFunction(() => document.getElementById('feedShareButton').textContent === 'Image copied to clipboard!');
        const copied = await page.evaluate(() => copiedImage);
        assert.equal(copied.type, 'image/png');
        assert.ok(copied.size > 10000);
        assert.deepEqual(copied.bytes, [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
test('denied clipboard permission downloads the image instead of failing', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            async write() { throw new DOMException('Permission denied', 'NotAllowedError'); }
        } }));
        await imageOptions(page);
        await download(page, 'copy', 'share-image-clipboard-fallback.png');
        await page.waitForFunction(() => document.getElementById('feedShareButton').textContent.includes('image downloaded instead'));
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
test('sorted icons resolve in the simulator and generated aura layouts', async () => {
    const { context, page, errors, missing } = await fixture();
    try {
        assert.equal(fs.readdirSync(path.join(root, 'files/images/icons'), { withFileTypes: true }).filter(entry => entry.isFile()).length, 0);
        const failures = await page.evaluate(async () => {
            const sources = new Set([...document.querySelectorAll('img[src*="files/images/icons/"],option[data-icon]')].map(element => element.getAttribute('src') || element.dataset.icon));
            for (const option of document.getElementById('biome-primary-dropdown').options) sources.add(getBiomeIconSource(option.value));
            for (const biome of ['anotherRealm', 'mastermind', 'edict', 'fullMoon']) sources.add(`files/images/icons/buffs/${biome}Buff.png`);
            return (await Promise.all([...sources].filter(Boolean).map(async source => { const response = await fetch(source); return response.ok ? null : source; }))).filter(Boolean);
        });
        assert.deepEqual(failures, []);
        for (const pathname of ['/auras/', '/simulator/auras/quartz/']) {
            await page.goto(origin + pathname, { waitUntil: 'load' });
            await page.waitForFunction(() => document.documentElement.dataset.auraLayout === 'ready');
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(missing, []);
    } finally { await context.close(); }
});
test('Halloween 2026 auras have linked profiles, correct roll details and prepared sigil titles', async () => {
    const event = JSON.parse(fs.readFileSync(path.join(root, 'data/events/halloween2026.json'), 'utf8'));
    const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'data/auras/catalogue.json'), 'utf8'));
    const { context, page, errors, missing } = await fixture();
    try {
        const registered = await page.evaluate(names => names.map(name => {
            const aura = AURA_BY_NAME.get(name);
            const label = name.replace(/\s+-\s+[\d,]+$/, '');
            return { chance: aura?.chance, href: AuraLinks.href(name), title: WikiTitleData.auras[label] };
        }), event.auras.map(aura => aura.name));
        await page.evaluate(names => {
            const auras = names.map(name => AURA_BY_NAME.get(name));
            const counts = new Float64Array(AURA_REGISTRY.length);
            for (const aura of auras) counts[aura.index] = 1;
            const results = buildResultEntries(auras, 'bloodRain', new Map(), 45.6, { winCounts: counts });
            lastSimulationSummary.shareVisuals = results.shareVisualRecords;
            lastSimulationSummary.shareRecords = results.shareRecords;
            lastSimulationSummary.rolls = auras.length;
        }, event.auras.map(aura => aura.name));
        await imageOptions(page);
        await download(page, 'download', 'share-image-halloween-auras.png');
        for (const [index, aura] of event.auras.entries()) {
            const name = aura.name.replace(/\s+-\s+[\d,]+$/, '');
            const entry = catalogue.find(entry => entry.name === name);
            assert.ok(entry, name);
            assert.equal(entry.simulatorChance, aura.chance);
            assert.ok(entry.events.includes('Halloween 2026'));
            assert.equal(entry.kind, 'Event');
            assert.equal(registered[index].chance, aura.chance);
            assert.equal(registered[index].href, origin + `/auras/${entry.slug}/`);
            assert.equal(registered[index].title.pending, true);
            assert.match(registered[index].title.markup, /wiki-ref-halloween26-/);
            assert.ok(entry.background.includes(aura.nativeBiomes.find(biome => biome !== 'glitch')));
            await page.goto(origin + `/auras/${entry.slug}/`, { waitUntil: 'load' });
            await page.waitForFunction(() => document.documentElement.dataset.auraLayout === 'ready');
            assert.equal(await page.locator('h1 .wiki-title--aura').count(), 1, name);
            assert.equal(await page.locator('h1 .wiki-title__plain').isVisible(), false, name);
            assert.equal(await page.locator('h1 .wiki-title__art').isVisible(), true, name);
            assert.equal(await page.locator('.aura-fact__odds').textContent(), '1 in ' + aura.chance.toLocaleString('en-US'));
            assert.match(await page.locator('.aura-event').textContent(), /Halloween 2026/);
            if (entry.wikiPending) assert.match(await page.locator('.aura-reference').textContent(), /Halloween 2026/);
            else {
                assert.ok((await page.locator('.aura-reference').textContent()).includes(entry.reviewedOn));
                assert.ok((await page.locator('.aura-reference a').getAttribute('href')).endsWith('?oldid=' + entry.revisionId));
            }
            assert.equal(await page.locator('a[href=""]').count(), 0);
            if (name.includes(' : ')) {
                assert.equal(await page.locator('.aura-mutation-link[aria-current="page"]').count(), 1);
                assert.ok(await page.locator('.aura-mutation-link').count() >= 2);
            }
            if (name === 'Harvester : Necromancy') await page.locator('.aura-detail').screenshot({ path: path.join(root, '.cache/verification/2.215/halloween-necromancy-profile.png') });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.locator('.aura-detail').evaluate(element => element.scrollWidth > element.clientWidth), false);
        await page.locator('.aura-detail').screenshot({ path: path.join(root, '.cache/verification/2.215/halloween-gaze-mobile.png') });
        await page.goto(origin + '/auras/?event=Halloween+2026&size=18', { waitUntil: 'load' });
        await page.waitForFunction(() => document.documentElement.dataset.auraLayout === 'ready');
        const eventEntries = catalogue.filter(entry => entry.events.includes(event.label));
        await page.waitForFunction(count => document.querySelectorAll('#aura-list [data-aura-row]').length === Math.min(18, count), eventEntries.length);
        assert.equal(await page.locator('#aura-event option[value="Halloween 2026"]').getAttribute('data-sigil'), 'sigil-outline-blood');
        const listed = await page.locator('#aura-list [data-aura-row]').evaluateAll(rows => rows.map(row => row.dataset.name).sort());
        assert.deepEqual(listed, eventEntries.slice(0, 18).map(entry => entry.name).sort());
        await page.goto(pathToFileURL(path.join(root, 'auras/ghost/index.html')).href, { waitUntil: 'load' });
        await page.waitForFunction(() => document.documentElement.dataset.auraLayout === 'ready');
        assert.equal(await page.locator('h1 .wiki-title--aura').count(), 1);
        assert.deepEqual(errors, []);
        assert.deepEqual(missing, []);
    } finally { await context.close(); }
});

test('layered and wide aura titles stay above rarity and count text in exported images', async () => {
    const { context, page, errors, warnings } = await fixture();
    try {
        await page.evaluate(async () => {
            const auras = ['Kyawthuite : Remembrance', 'True Kyawthuite', 'Equinox'].map(name => AURA_BY_CANONICAL_NAME.get(name));
            const counts = new Float64Array(AURA_REGISTRY.length);
            for (const aura of auras) counts[aura.index] = 1;
            const results = buildResultEntries(auras, 'normal', new Map(), 45.6, { winCounts: counts });
            lastSimulationSummary.shareVisuals = results.shareVisualRecords;
            lastSimulationSummary.shareRecords = results.shareRecords;
            await AppRuntime.loadScript('scripts/vendor/html-to-image.js');
            const original = htmlToImage.toCanvas;
            window.shareLayout = [];
            htmlToImage.toCanvas = (row, options) => {
                const title = row.querySelector('[data-share-aura-title]');
                const bounds = title.getBoundingClientRect();
                const titleLayers = [...title.querySelectorAll('.wiki-title,.wiki-title__art,.wiki-title__art *')]
                    .map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
                const stats = row.querySelector('.aura-count').parentElement.getBoundingClientRect();
                shareLayout.push({
                    name: title.textContent, titleBottom: bounds.bottom, statsTop: stats.top,
                    contentTop: Math.min(...titleLayers.map(rect => rect.top)),
                    contentBottom: Math.max(...titleLayers.map(rect => rect.bottom)),
                    titleTop: bounds.top, titleWidth: bounds.width,
                    frameWidth: title.querySelector('.aura-title-frame')?.getBoundingClientRect().width,
                    rarity: row.querySelector('.aura-rarity').textContent,
                    rarityFont: getComputedStyle(row.querySelector('.aura-rarity')).fontFamily
                });
                return original(row, options);
            };
        });
        await imageOptions(page);
        await download(page, 'download', 'share-image-title-layout.png');
        const rows = await page.evaluate(() => shareLayout);
        assert.equal(rows.length, 3);
        for (const row of rows) {
            assert.ok(row.statsTop >= row.titleBottom + 6, row.name);
            assert.ok(row.contentTop >= row.titleTop, row.name);
            assert.ok(row.contentBottom <= row.titleBottom, row.name);
            assert.ok(row.frameWidth > 0 && row.frameWidth <= row.titleWidth, row.name);
            assert.match(row.rarityFont, /Arial/);
        }
        assert.ok(rows.some(row => row.rarity.includes('450,000,000')));
        assert.deepEqual(errors, []);
        assert.equal(warnings.some(message => message.includes('Styled aura export unavailable')), false);
    } finally { await context.close(); }
});
test('Apostolos gets its two-times native rarity only in Edict', async () => {
    const { context, page, errors } = await fixture();
    try {
        const result = await page.evaluate(() => {
            const aura = AURA_BY_CANONICAL_NAME.get('Apostolos');
            const rarity = biome => determineAuraEffectiveChance(aura, createAuraEvaluationContext({
                canonicalBiome: biome, primaryBiome: biome, timeBiome: 'day',
                activeBiomes: [biome], breakthroughBiomes: [biome]
            }, { eventChecker: () => true, luckValue: 1 }));
            return { bonuses: [...aura.breakthroughs], heavenMultiplier: NATIVE_BREAKTHROUGH_MULTIPLIERS.heaven,
                edict: rarity('edict'), heaven: rarity('heaven'), normal: rarity('normal') };
        });
        assert.deepEqual(result.bonuses, [['edict', 2]]);
        assert.equal(result.heavenMultiplier, 5);
        assert.equal(result.edict, 222000000);
        assert.equal(result.heaven, 444000000);
        assert.equal(result.normal, 444000000);
        const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'data/auras/catalogue.json'), 'utf8'));
        const entry = catalogue.find(aura => aura.title === 'Apostolos');
        assert.match(entry.nativeRarity, /222,000,000/);
        assert.deepEqual(entry.nativeBiomes, ['The Citadel Of Orders']);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
test('unfiltered tiers use ALL in results, saved summaries, text sharing, and images', async () => {
    const { context, page, errors } = await fixture();
    try {
        const result = await page.evaluate(() => {
            for (const tier of AURA_TIER_FILTERS) appState.auraTierFilters[tier.key] = false;
            const all = getAuraFilterSummaryText();
            lastSimulationSummary.auraFilterSummary = AURA_TIER_FILTERS.map(formatAuraTierLabel).join(', ');
            const plain = createPlainShareText(lastSimulationSummary);
            const discord = createDiscordShareText(lastSimulationSummary);
            appState.auraTierFilters.basic = true;
            const filtered = getAuraFilterSummaryText();
            for (const tier of AURA_TIER_FILTERS) appState.auraTierFilters[tier.key] = true;
            const none = getAuraFilterSummaryText();
            for (const tier of AURA_TIER_FILTERS) appState.auraTierFilters[tier.key] = false;
            return { all, plain, discord, filtered, none };
        });
        assert.equal(result.all, 'ALL');
        assert.match(result.plain, /Included Aura Tiers: ALL/);
        assert.match(result.discord, /Included Tiers:\*\* ALL/);
        assert.notEqual(result.filtered, 'ALL');
        assert.doesNotMatch(result.filtered, /Basic/);
        assert.equal(result.none, 'None');
        await imageOptions(page);
        await download(page, 'download', 'share-image-all-tiers.png');
        assert.ok(await page.evaluate(() => exportedSummary.text.includes('Included Aura TiersALL')));
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
test('shared run details and XP are grouped below auras with distinct metric colors', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(async () => {
            const potion = [...MULTI_POTION_CONFIG_BY_ID.values()][0];
            Object.assign(lastSimulationSummary, {
                executionSeconds: .186, xpTotal: 1250, xpLines: ['Reached Epic: +1,000 XP'],
                devicePresetName: getEquipmentSummary(), bonusDescription: '×2 luck every 10th roll',
                equipment: { right: 'singularity', left: 'gravitational', pocket: 'none' },
                biomeId: 'radiantForest', primaryBiomeId: 'radiantForest', biomeLabel: 'The Radiant Forest', runeId: 'roe', runeLabel: 'Rune of Everything', timeId: 'night', timeLabel: 'Night',
                luckLabel: '150,045.6–150,091.2 (varies by roll)',
                potionMode: POTION_SIMULATION_MODE.MULTIPLE, potionStackingEnabled: true,
                potionBatches: [{ id: potion.id, label: potion.label, count: 9, luckValue: 150045.6 }]
            });
            await AppRuntime.loadScript('scripts/titles/wiki-title-export.js');
            const original = WikiTitleExport.blocks;
            const capture = WikiTitleExport.capture;
            globalThis.WikiTitleExport = { async capture(...args) {
                const block = await capture(...args);
                return { ...block, draw(context, x, y) {
                    window.sharedSummaryTop = y;
                    block.draw(context, x, y);
                } };
            }, async blocks(...args) {
                const blocks = await original(...args);
                return blocks.map(block => ({ ...block, draw(context, x, y) {
                    block.draw(context, x, y);
                    window.lastSharedAuraBottom = Math.max(window.lastSharedAuraBottom || 0, y + block.contentHeight);
                } }));
            } };
        });
        await imageOptions(page);
        await download(page, 'download', 'share-image-grouped-summary.png');
        const result = await page.evaluate(() => ({
            bottom: lastSharedAuraBottom, top: sharedSummaryTop, summary: exportedSummary,
            plain: createPlainShareText(lastSimulationSummary), discord: createDiscordShareText(lastSimulationSummary)
        }));
        assert.ok(result.top > result.bottom);
        for (const label of ['Rolls', 'Execution time', 'Total XP', 'Biome', 'Rune', 'Time', 'Events', 'Included Aura Tiers', 'Luck', 'Equipment', 'Roll Cycle', 'Potion Mode', 'Potions']) assert.ok(result.summary.text.includes(label), label);
        assert.ok(result.summary.text.includes('186 ms'));
        assert.equal(new Set(result.summary.metrics.map(metric => metric.color)).size, 3);
        assert.ok(result.summary.styles.some(value => value.includes('sigil-outline-radiant-forest')));
        assert.ok(result.summary.styles.some(value => value.includes('sigil-outline-night')));
        assert.ok(result.summary.styles.some(value => value.includes('wiki-title--item')));
        assert.ok(result.summary.styles.some(value => value.includes('equipment-effect--luck')));
        assert.equal(result.summary.overflow, false);
        for (const text of [result.plain, result.discord]) {
            assert.ok(text.indexOf('Auras Rolled') < text.indexOf('Run summary'.toUpperCase()) || text.includes('**Run summary**'));
            assert.ok(text.indexOf('Equinox') < text.indexOf('Potion Mode'));
            assert.match(text, /186 ms/);
        }
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
test('completed results keep the responsive setup and reward panels after the aura list', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => {
            localStorage.setItem('solsCutsceneWarningDismissed', 'true');
            for (const aura of AURA_REGISTRY) if (aura.cutscene) rollingSettingsPreference.cutscenePlaybackFilters[aura.cutscene] = false;
            runRollSimulation({ totalOverride: 100, bypassRollWarning: true, bypassRotationPrompt: true });
        });
        await page.waitForFunction(() => lastSimulationSummary?.rolls === 100 && !simulationActive);
        const order = await page.evaluate(() => {
            const list = document.querySelector('.roll-feed__results-list');
            const summary = document.querySelector('[data-result-summary]');
            return !!list && !!summary && !!(list.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        assert.equal(order, true);
        assert.equal(await page.locator('[data-result-summary] [data-result-metric]').count(), 3);
        assert.equal(await page.locator('[data-result-section]').count(), 3);
        assert.equal(await page.locator('#simulation-feed [data-result-navigation] button').count(), 1);
        await page.locator('#simulation-feed').evaluate(feed => { feed.scrollTop = 0; });
        const pageScroll = await page.evaluate(() => window.scrollY);
        await page.locator('[data-result-navigation] button').click();
        await page.waitForFunction(() => {
            const feed = document.getElementById('simulation-feed');
            const bounds = feed.getBoundingClientRect();
            const top = bounds.top + (feed.clientTop + parseFloat(getComputedStyle(feed).paddingTop)) * bounds.height / feed.offsetHeight;
            return Math.abs(document.querySelector('[data-result-summary] h2').getBoundingClientRect().top - top) <= 2;
        }).catch(async () => assert.fail(JSON.stringify(await page.evaluate(() => {
            const feed = document.getElementById('simulation-feed');
            return { top: feed.getBoundingClientRect().top, padding: getComputedStyle(feed).paddingTop, height: feed.clientHeight, scroll: feed.scrollTop, scrollHeight: feed.scrollHeight, heading: document.querySelector('[data-result-summary] h2').getBoundingClientRect().top, spacer: document.querySelector('[data-result-scroll-space]').style.height };
        }))));
        assert.equal(await page.evaluate(() => document.activeElement.id), 'simulation-statistics');
        assert.equal(await page.evaluate(() => window.scrollY), pageScroll);
        await page.locator('[data-result-navigation] button').click();
        assert.equal(await page.locator('[data-result-scroll-space]').count(), 1);
        await page.locator('[data-result-summary]').screenshot({ path: path.join(root, '.cache/verification/2.215/result-summary-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('[data-result-summary]').scrollIntoViewIfNeeded();
        const overflow = await page.locator('[data-result-summary]').evaluate(element => element.scrollWidth > element.clientWidth);
        assert.equal(overflow, false);
        assert.equal(await page.locator('.result-summary__metric').first().evaluate(element => getComputedStyle(element).borderTopLeftRadius), '0px');
        await page.locator('[data-result-summary]').screenshot({ path: path.join(root, '.cache/verification/2.215/result-summary-mobile.png') });
        await page.locator('[data-result-summary]').evaluate(summary => {
            [...summary.children].filter(child => !child.classList.contains('result-summary__heading')).forEach(child => { child.style.display = 'none'; });
            const feed = document.getElementById('simulation-feed');
            feed.scrollTop = 0;
        });
        await page.locator('[data-result-navigation] button').click();
        await page.waitForFunction(() => {
            const feed = document.getElementById('simulation-feed');
            const bounds = feed.getBoundingClientRect();
            const top = bounds.top + (feed.clientTop + parseFloat(getComputedStyle(feed).paddingTop)) * bounds.height / feed.offsetHeight;
            return Math.abs(document.querySelector('[data-result-summary] h2').getBoundingClientRect().top - top) <= 2;
        });
        assert.ok(await page.locator('[data-result-scroll-space]').evaluate(element => element.offsetHeight > 0));
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('pumpkin workshop supports carving, undo, saved previews and a square mobile layout', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.locator('#open-pumpkin-carver').click();
        await page.locator('#pumpkin-carver').waitFor({ state: 'visible' });
        await page.locator('[data-pumpkin-shape="eyes"]').click();
        assert.equal(await page.locator('[data-pumpkin-cut-count]').textContent(), '2');
        await page.locator('[data-pumpkin-shape="star"]').click();
        assert.equal(await page.locator('[data-pumpkin-cut-count]').textContent(), '3');
        await page.locator('#pumpkin-undo').click();
        assert.equal(await page.locator('[data-pumpkin-cut-count]').textContent(), '2');
        await page.locator('#pumpkin-reset').click();
        assert.equal(await page.locator('[data-pumpkin-cut-count]').textContent(), '0');
        await page.locator('#pumpkin-undo').click();
        const bounds = await page.locator('#pumpkin-canvas').boundingBox();
        const point = (x, y) => [bounds.x + x * bounds.width, bounds.y + y * bounds.height];
        await page.mouse.move(...point(.4, .58));
        await page.mouse.down();
        await page.mouse.move(...point(.6, .58), { steps: 8 });
        await page.mouse.move(...point(.5, .72), { steps: 8 });
        await page.mouse.move(...point(.4, .58), { steps: 8 });
        await page.mouse.up();
        assert.equal(await page.locator('[data-pumpkin-cut-count]').textContent(), '3');
        await page.locator('#pumpkin-carver').screenshot({ path: path.join(root, '.cache/verification/2.215/pumpkin-workshop-desktop.png') });
        await page.locator('#pumpkin-done').click();
        assert.ok((await page.locator('#pumpkin-thumbnail').getAttribute('src')).startsWith('data:image/png'));
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('solsRollingCalculator:pumpkin:2026:v1')).length), 3);
        await page.reload({ waitUntil: 'load' });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#open-pumpkin-carver').click();
        await page.locator('#pumpkin-carver').waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-pumpkin-cut-count]').textContent(), '3');
        assert.equal(await page.locator('#pumpkin-carver').evaluate(element => element.scrollWidth > element.clientWidth), false);
        assert.equal(await page.locator('#pumpkin-done').evaluate(element => getComputedStyle(element).borderTopLeftRadius), '0px');
        await page.locator('#pumpkin-carver').screenshot({ path: path.join(root, '.cache/verification/2.215/pumpkin-workshop-mobile.png') });
        await page.locator('#pumpkin-done').click();
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
test('image sharing permits 50 displayed entries and blocks 51 while text stays available', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => {
            lastSimulationSummary.rolls = 1000000000;
            for (const tier of AURA_TIER_FILTERS) appState.auraTierFilters[tier.key] = false;
            for (const name of Object.keys(appState.auraFilters)) appState.auraFilters[name] = false;
            refreshActiveAuraFilterCounts();
            window.imageLimitAuras = AURA_REGISTRY.slice(0, 51);
            window.imageLimitCounts = new Float64Array(AURA_REGISTRY.length);
            for (const aura of imageLimitAuras) imageLimitCounts[aura.index] = 1;
            const results = buildResultEntries(imageLimitAuras, 'normal', new Map(), 45.6, { winCounts: imageLimitCounts });
            lastSimulationSummary.shareVisuals = results.shareVisualRecords;
            lastSimulationSummary.shareRecords = results.shareRecords;
        });
        assert.equal(await page.evaluate(() => getImageShareEntryCount(lastSimulationSummary)), 51);
        await page.locator('#feedShareButton').click();
        assert.equal(await page.locator('[data-share-format="image"]').isDisabled(), true);
        assert.match(await page.locator('#feedShareImageLimit').textContent(), /50 displayed aura entries/);
        assert.equal(await page.locator('[data-share-format="plain"]').isEnabled(), true);
        assert.equal(await page.locator('[data-share-format="markdown"]').isEnabled(), true);
        const guarded = await page.evaluate(async () => {
            await handleShareAction('image');
            await AppRuntime.loadScript('scripts/export/share-image.js');
            return generateShareImage(lastSimulationSummary);
        });
        assert.equal(guarded, 'limit-exceeded');
        assert.equal(await page.locator('#feedShareImageMenu').isHidden(), true);
        await page.locator('#feedShareButton').click();
        await page.evaluate(() => {
            appState.auraFilters[imageLimitAuras[0].name] = true;
            refreshActiveAuraFilterCounts();
            const results = buildResultEntries(imageLimitAuras, 'normal', new Map(), 45.6, { winCounts: imageLimitCounts });
            lastSimulationSummary.shareVisuals = results.shareVisualRecords;
            lastSimulationSummary.shareRecords = results.shareRecords;
        });
        assert.equal(await page.evaluate(() => getImageShareEntryCount(lastSimulationSummary)), 50);
        await page.locator('#feedShareButton').click();
        assert.equal(await page.locator('[data-share-format="image"]').isEnabled(), true);
        assert.equal(await page.locator('#feedShareImageLimit').isHidden(), true);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('image preparation shows progress inside the button and clears it after success or failure', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(async () => {
            await AppRuntime.loadScript('scripts/titles/wiki-title-export.js');
            const blocks = WikiTitleExport.blocks;
            globalThis.WikiTitleExport = { ...WikiTitleExport, async blocks(...args) {
                window.imageRenderCalls = (window.imageRenderCalls || 0) + 1;
                args[2].onProgress(.5);
                await new Promise(resolve => { window.resumeImagePreparation = resolve; });
                return blocks(...args);
            } };
        });
        await imageOptions(page);
        const downloaded = page.waitForEvent('download');
        await page.locator('[data-image-share-mode="download"]').click();
        const bar = page.locator('#feedShareButton [role="progressbar"]');
        await page.waitForFunction(() => document.querySelector('#feedShareButton [role="progressbar"]')?.getAttribute('aria-valuenow') === '45');
        assert.equal(await page.locator('#feedShareButton').getAttribute('aria-busy'), 'true');
        assert.equal(await page.locator('#feedShareButton').isDisabled(), true);
        assert.equal(await bar.evaluate(element => getComputedStyle(element).borderTopLeftRadius), '0px');
        await page.locator('#feedShareButton').screenshot({ path: path.join(root, '.cache/verification/2.215/share-image-progress.png') });
        await page.evaluate(async () => {
            await handleShareAction('image');
            window.resumeImagePreparation();
        });
        assert.equal(await (await downloaded).failure(), null);
        await page.waitForFunction(() => document.getElementById('feedShareButton').textContent === 'Image downloaded!');
        assert.equal(await page.evaluate(() => imageRenderCalls), 1);
        assert.equal(await bar.count(), 0);
        assert.equal(await page.locator('#feedShareButton').getAttribute('aria-busy'), null);
        assert.equal(await page.locator('#feedShareButton').isEnabled(), true);
        await page.evaluate(() => { generateShareImage = async () => { throw new Error('Forced export failure'); }; });
        await imageOptions(page);
        await page.locator('[data-image-share-mode="download"]').click();
        await page.waitForFunction(() => document.getElementById('feedShareButton').textContent === 'Share failed');
        assert.equal(await bar.count(), 0);
        assert.equal(await page.locator('#feedShareButton').getAttribute('aria-busy'), null);
        assert.equal(await page.locator('#feedShareButton').isEnabled(), true);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('the X cancels image preparation while its module is still loading', async () => {
    const { context, page, errors } = await fixture();
    try {
        let request;
        let received;
        const pending = new Promise(resolve => { received = resolve; });
        await page.route('**/scripts/export/share-image.js*', route => { request = route; received(); });
        const downloads = [];
        page.on('download', download => downloads.push(download));
        await imageOptions(page);
        await pending;
        await page.locator('[data-image-share-mode="download"]').click();
        await page.locator('#feedShareCancel').click();
        await page.waitForFunction(() => document.getElementById('feedShareButton').textContent === 'Image preparation cancelled');
        assert.equal(await page.locator('#feedShareCancel').isHidden(), true);
        assert.equal(await page.locator('#feedShareButton').isEnabled(), true);
        assert.equal(await page.locator('#feedShareButton').getAttribute('aria-busy'), null);
        await request.continue();
        await page.waitForFunction(() => typeof generateShareImage === 'function');
        assert.equal(await page.evaluate(() => exportedText.length), 0);
        assert.equal(downloads.length, 0);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('cancelling a rendered image stops remaining auras, cleans up, and permits another export', async () => {
    for (const mode of ['download', 'copy']) {
        const { context, page, errors, warnings } = await fixture();
        try {
            const downloads = [];
            page.on('download', download => downloads.push(download));
            await page.evaluate(() => {
                window.clipboardWrites = 0;
                Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async () => { window.clipboardWrites++; } } });
                const original = htmlToImage.toCanvas;
                window.restoreImageRasterizer = () => { htmlToImage.toCanvas = original; };
                htmlToImage.toCanvas = async (...args) => {
                    window.cancelRasterCalls = (window.cancelRasterCalls || 0) + 1;
                    if (cancelRasterCalls === 1) {
                        await new Promise(resolve => { window.releaseCancelledRaster = resolve; });
                        window.cancelledRasterFinished = true;
                        return document.createElement('canvas');
                    }
                    return original(...args);
                };
            });
            await imageOptions(page);
            await page.locator(`[data-image-share-mode="${mode}"]`).click();
            await page.waitForFunction(() => typeof releaseCancelledRaster === 'function');
            assert.equal(await page.locator('[data-image-export]').count(), 1);
            await page.setViewportSize({ width: 390, height: 844 });
            const trigger = await page.locator('#feedShareButton').boundingBox();
            const cancel = await page.locator('#feedShareCancel').boundingBox();
            assert.ok(cancel.x >= trigger.x + trigger.width);
            assert.equal(await page.locator('#feedShareControls').evaluate(element => element.scrollWidth > element.clientWidth), false);
            assert.equal(await page.locator('#feedShareCancel').evaluate(element => getComputedStyle(element).borderTopLeftRadius), '0px');
            await page.locator('#feedShareControls').screenshot({ path: path.join(root, `.cache/verification/2.215/share-image-cancel-${mode}.png`) });
            await page.locator('#feedShareCancel').focus();
            await page.locator('#feedShareCancel').press('Enter');
            await page.waitForFunction(() => document.getElementById('feedShareButton').textContent === 'Image preparation cancelled');
            await page.waitForFunction(() => !document.querySelector('[data-image-export]'));
            assert.equal(await page.locator('#feedShareCancel').isHidden(), true);
            assert.equal(await page.locator('#feedShareButton').isEnabled(), true);
            assert.equal(await page.evaluate(() => document.activeElement.id), 'feedShareButton');
            await page.evaluate(() => window.releaseCancelledRaster());
            await page.waitForFunction(() => window.cancelledRasterFinished);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.equal(await page.evaluate(() => cancelRasterCalls), 1);
            assert.equal(await page.evaluate(() => clipboardWrites), 0);
            assert.equal(downloads.length, 0);
            assert.equal(warnings.some(message => message.includes('Styled aura export unavailable')), false);
            await page.evaluate(() => window.restoreImageRasterizer());
            await imageOptions(page);
            await download(page, 'download', `share-image-after-cancel-${mode}.png`);
            assert.equal(await page.locator('#feedShareCancel').isHidden(), true);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
});

test('Memory displays one title face for each naming-style preference', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => {
            const aura = AURA_BY_CANONICAL_NAME.get('Memory');
            const host = document.getElementById('simulation-feed');
            host.innerHTML = `<div data-roll-feed-entry>${formatRollFeedAuraNameMarkup(aura)}<span> | Times Rolled: 9</span></div>`;
            AuraTitleLayout.prepare(host);
        });
        const title = page.locator('#simulation-feed .wiki-title--aura');
        await page.addStyleTag({ content: '#simulation-feed .wiki-title__plain { display: inline-block; }' });
        await page.locator('#simulation-feed [data-roll-feed-entry]').screenshot({ path: path.join(root, '.cache/verification/2.215/memory-title-styled.png') });
        assert.equal(await title.locator('.wiki-title__plain').isVisible(), false);
        assert.equal(await title.locator('.wiki-title__art').isVisible(), true);
        await page.evaluate(() => { appState.qualityPreferences.disableWikiAuraStyles = true; applyQualityPreferencesState(); AuraTitleLayout.prepare(document.getElementById('simulation-feed')); });
        assert.equal(await title.locator('.wiki-title__plain').isVisible(), true);
        assert.equal(await title.locator('.wiki-title__art').isVisible(), false);
        await page.evaluate(() => { appState.qualityPreferences.disableWikiAuraStyles = false; applyQualityPreferencesState(); AuraTitleLayout.prepare(document.getElementById('simulation-feed')); });
        assert.equal(await title.locator('.wiki-title__plain').isVisible(), false);
        assert.equal(await title.locator('.wiki-title__art').isVisible(), true);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
test('the update offers fullscreen only after the changelog closes', async () => {
    const { context, page, errors } = await fixture(false, { fullscreenPrompt: true });
    try {
        assert.equal(await page.locator('#versionChangelogOverlay').isVisible(), true);
        assert.equal(await page.locator('#cutsceneWarningOverlay').isVisible(), false);
        await page.locator('#versionChangelogClose').click();
        await page.locator('#cutsceneWarningOverlay').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#versionChangelogOverlay').isVisible(), false);
        await page.locator('#cutsceneWarningConfirm').click();
        await page.locator('#cutsceneWarningOverlay').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => rollingSettingsPreference.fullscreenCutscenes), true);
        assert.equal(await page.locator('#rollingFullscreenCutscenesToggle').getAttribute('aria-checked'), 'true');
        assert.equal(await page.evaluate(() => localStorage.getItem('solsRollingCalculator:fullscreenCutscenePrompt:v2.215')), 'true');
        await page.locator('#versionInfoButton').click();
        await page.locator('#versionChangelogClose').click();
        await page.locator('#versionChangelogOverlay').waitFor({ state: 'hidden' });
        assert.equal(await page.locator('#cutsceneWarningOverlay').isVisible(), false);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
test('enabling any cutscene offers fullscreen even when other cutscenes are already on', async () => {
    const { context, page, errors } = await fixture();
    try {
        await page.evaluate(() => {
            rollingSettingsPreference.cutscenePlaybackFilters[AURA_BY_CANONICAL_NAME.get('Memory').name] = false;
            rollingSettingsPreference.cutscenePlaybackFilters[AURA_BY_CANONICAL_NAME.get('Equinox').name] = false;
            showCutscenePlaybackFilterOverlay();
        });
        await page.locator('#cutscenePlaybackFilterList button[data-aura-name="Memory"]').click();
        await page.locator('#cutsceneWarningOverlay').waitFor({ state: 'visible' });
        await page.locator('#cutsceneWarningDismiss').click();
        await page.locator('#cutsceneWarningOverlay').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => rollingSettingsPreference.fullscreenCutscenes), false);
        assert.equal(await page.evaluate(() => isAuraCutscenePlaybackEnabled(AURA_BY_CANONICAL_NAME.get('Memory'))), true);
        await page.locator('#cutscenePlaybackFilterList button[data-aura-name="Equinox - 2,500,000,000"]').click();
        await page.locator('#cutsceneWarningOverlay').waitFor({ state: 'visible' });
        await page.locator('#cutsceneWarningConfirm').click();
        await page.locator('#cutsceneWarningOverlay').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => rollingSettingsPreference.fullscreenCutscenes), true);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
test('cutscenes release their fullscreen, preserve user fullscreen, and tolerate browser denial', async () => {
    const { context, page, errors } = await fixture();
    try {
        const result = await page.evaluate(async () => {
            let current = null, enters = 0, exits = 0, blocked = false, failed = false;
            Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
            Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
            document.documentElement.requestFullscreen = async () => {
                enters++;
                if (blocked) throw new DOMException('Blocked', 'NotAllowedError');
                current = document.documentElement;
                document.dispatchEvent(new Event('fullscreenchange'));
            };
            document.exitFullscreen = async () => { exits++; current = null; document.dispatchEvent(new Event('fullscreenchange')); };
            playAuraVideo = async () => {
                appState.videoPlaying = true;
                await enterCutsceneFullscreen();
                appState.videoPlaying = false;
                if (failed) throw new Error('Playback failed');
                return 'ended';
            };
            await setCutsceneFullscreen(true);
            await playAuraSequence(['memory-cutscene'], { force: true });
            const automatic = { enters, exits, fullscreen: !!current };
            current = document.documentElement;
            await playAuraSequence(['memory-cutscene'], { force: true });
            const preserved = { enters, exits, fullscreen: !!current };
            current = null; blocked = true;
            await playAuraSequence(['memory-cutscene'], { force: true });
            const denied = { enters, exits, fullscreen: !!current };
            blocked = false; failed = true;
            try { await playAuraSequence(['memory-cutscene'], { force: true }); } catch {}
            const failure = { enters, exits, fullscreen: !!current };
            return { automatic, preserved, denied, failure };
        });
        assert.deepEqual(result.automatic, { enters: 1, exits: 1, fullscreen: false });
        assert.deepEqual(result.preserved, { enters: 1, exits: 1, fullscreen: true });
        assert.deepEqual(result.denied, { enters: 2, exits: 1, fullscreen: false });
        assert.deepEqual(result.failure, { enters: 3, exits: 2, fullscreen: false });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
