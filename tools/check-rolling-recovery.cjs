// Exercise actual roll controls on a mobile viewport with browser/worker faults.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const before = process.argv.includes('--before');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((request, response) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (file !== root && !file.startsWith(root + path.sep)) return response.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return response.writeHead(404).end();
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        async function open(fault) {
            const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
            await page.addInitScript(({ fault, before }) => {
                localStorage.setItem('solsRollingCalculator:lastSeenChangelogVersion', 'v2.210');
                window.testRollFault = fault;
                window.testWorkers = [];
                const NativeWorker = window.Worker;
                const nativeTimeout = window.setTimeout.bind(window);
                // Keep the production 10-second watchdog short in this test.
                if (!before && fault !== 'cancel') window.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, delay === 10000 ? 100 : delay, ...args);
                window.Worker = class {
                    constructor(url, options) {
                        if (!window.testRollFault) return new NativeWorker(url, options);
                        window.testWorkers.push(this);
                    }
                    postMessage(message) {
                        if (message.type === 'resume' && window.testRollFault === 'checkpoint-wait') {
                            this.complete(this.startMessage, true);
                            return;
                        }
                        if (message.type !== 'start') return;
                        this.startMessage = message;
                        if (window.testRollFault === 'send-throws') throw new DOMException('Worker message unavailable', 'DataCloneError');
                        if (window.testRollFault === 'decode-error') nativeTimeout(() => this.onmessageerror?.({ data: null }), 10);
                        if (window.testRollFault === 'stops-progress') nativeTimeout(() => this.onmessage?.({ data: { type: 'progress', currentRoll: 1 } }), 10);
                        if (window.testRollFault === 'healthy-slow') {
                            for (let step = 1; step <= 5; step++) nativeTimeout(() => {
                                if (this.terminated) return;
                                if (step === 5) this.complete(message);
                                else this.onmessage?.({ data: { type: 'progress', currentRoll: step * 1000 } });
                            }, step * 50);
                        }
                        if (window.testRollFault === 'checkpoint-wait') nativeTimeout(() => this.onmessage?.({ data: {
                            type: 'radiant-reward', currentRoll: 1, radiantState: { moons: 127, rewardClaimed: true }
                        } }), 10);
                    }
                    complete(message, reward = false) {
                        if (this.terminated) return;
                        this.completed = true;
                        const wins = new Float64Array(message.auraCount);
                        wins[window.testCommonIndex] = message.total - (reward ? 1 : 0);
                        if (reward) wins[message.radiant.config.rewardIndex] = 1;
                        this.onmessage?.({ data: {
                            type: 'complete', currentRoll: message.total, winCounts: wins,
                            breakthroughCounts: new Float64Array(message.auraCount),
                            batchWinCounts: message.batches.map((_, index) => index ? new Float64Array(message.auraCount) : wins),
                            batchBreakthroughCounts: message.batches.map(() => new Float64Array(message.auraCount))
                        } });
                    }
                    terminate() { this.terminated = true; }
                };
            }, { fault, before });
            await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => {
                document.querySelectorAll('.modal-overlay, .cutscene-warning-overlay, #introOverlay').forEach(element => element.hidden = true);
                appState.cinematic = false;
                appState.qualityPreferences.disableShakes = true;
                rotationPromptManager.shouldPrompt = () => false;
                window.testOriginalPreparation = prepareEquipmentSimulation;
                window.testOriginalEntropy = drawEntropy;
                window.testCommonIndex = AURA_REGISTRY.find(aura => aura.name.startsWith('Common - ')).index;
                if (window.testRollFault === 'setup-error') prepareEquipmentSimulation = () => { throw new Error('Injected preparation failure'); };
                if (window.testRollFault === 'entropy-error') window.drawEntropy = () => { throw new Error('Injected calculation failure'); };
            });
            return { page, errors };
        }
        for (const [fault, count, method] of [
            ['silent', 5000, 'unnamed'], ['stops-progress', 5000, 'unnamed'],
            ['send-throws', 5000, 'unnamed'], ['decode-error', 5000, 'unnamed'],
            ['setup-error', 20, 'unnamed'], ['entropy-error', 20, 'unnamed'],
            ['entropy-error', 3, 'sols-like']
        ]) {
            const { page, errors } = await open(fault);
            await page.evaluate(({ count, method }) => {
                setSimulationMethod(method, { playAudio: false });
                applyRollPreset(count);
            }, { count, method });
            await page.locator('.roll-trigger').tap();
            if (before) {
                await page.waitForTimeout(250);
                const state = await page.evaluate(() => ({ active: simulationActive, disabled: uiHandles.rollTriggerButton.disabled, label: document.querySelector('.roll-console__armed-text')?.textContent, feed: feedContainer.textContent }));
                assert(state.active && state.disabled, `${fault}: reproduce the locked Rolling state`);
                console.log('Reproduced:', fault, method, JSON.stringify(state), errors);
            } else {
                await page.waitForFunction(() => !simulationActive, { timeout: 8000 });
                assert.equal(await page.locator('.roll-trigger').isEnabled(), true, fault + ': Start Rolling recovers');
                assert.equal(await page.locator('#rollCancelButton').isVisible(), false);
                const workerFailure = !['setup-error', 'entropy-error'].includes(fault);
                if (workerFailure) {
                    assert.equal(await page.evaluate(() => auraWinCounts.reduce((sum, value) => sum + value, 0)), count, 'Fallback finishes the entire roll exactly once');
                    assert.equal(await page.evaluate(() => testWorkers.at(-1).terminated), true);
                } else {
                    assert.match(await page.locator('#simulation-feed').textContent(), /could not finish.*try/i, 'A calculation failure gives a retry message');
                }
                assert.deepEqual(errors, [], 'Failures are handled without unhandled browser errors');
                // The same page must accept and complete another small roll.
                await page.evaluate(() => {
                    window.testRollFault = null;
                    prepareEquipmentSimulation = window.testOriginalPreparation;
                    window.drawEntropy = window.testOriginalEntropy;
                    setSimulationMethod('unnamed', { playAudio: false });
                    applyRollPreset(20);
                });
                await page.locator('.roll-trigger').tap();
                await page.waitForFunction(() => !simulationActive);
                assert.equal(await page.evaluate(() => auraWinCounts.reduce((sum, value) => sum + value, 0)), 20);
                console.log('Passed:', fault, method, 'recovery and retry');
            }
            await page.close();
        }
        if (!before) {
            for (const fault of ['healthy-slow', 'checkpoint-wait']) {
                const { page, errors } = await open(fault);
                await page.evaluate(fault => {
                    if (fault === 'checkpoint-wait') {
                        setRadiantForestPreset();
                        radiantForestState.moons = 127;
                        window.playAuraSequence = () => new Promise(resolve => setTimeout(() => {
                            window.testCutsceneFinished = true;
                            resolve();
                        }, 350));
                    }
                    applyRollPreset(5000);
                }, fault);
                await page.locator('.roll-trigger').tap();
                await page.waitForFunction(() => !simulationActive);
                assert.equal(await page.evaluate(() => testWorkers[0].completed), true, fault + ': healthy work is not replaced by fallback');
                if (fault === 'checkpoint-wait') {
                    assert.equal(await page.evaluate(() => window.testCutsceneFinished), true);
                    assert.equal(await page.evaluate(() => readAuraWinCount(AURA_BY_NAME.get('Tomorrow'))), 1);
                }
                assert.deepEqual(errors, []);
                await page.close();
                console.log('Passed:', fault, 'does not trigger a false worker timeout.');
            }
            const { page, errors } = await open('cancel');
            await page.evaluate(() => applyRollPreset(5000));
            await page.locator('.roll-trigger').tap();
            await page.locator('#rollCancelButton').tap();
            await page.waitForFunction(() => !simulationActive);
            assert.match(await page.locator('#simulation-feed').textContent(), /canceled/i);
            assert.equal(await page.locator('.roll-trigger').isEnabled(), true);
            assert.equal(await page.evaluate(() => testWorkers.at(-1).terminated), true);
            assert.deepEqual(errors, []);
            await page.close();
            console.log('Passed: cancelling an unresponsive worker restores the mobile controls.');
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
