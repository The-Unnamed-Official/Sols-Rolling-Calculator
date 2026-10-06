const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts/aura-video-player.js'), 'utf8');
const context = {
    URL, Map, AbortController,
    location: { href: 'https://example.com/simulator/auras/poseidon/index.html' },
    document: {
        currentScript: { src: 'https://example.com/simulator/scripts/aura-video-player.js' },
        baseURI: 'https://example.com/simulator/auras/poseidon/index.html',
        title: 'Poseidon · Aura profile',
        querySelectorAll: () => [], addEventListener() {}
    },
    localStorage: { getItem: () => null }, addEventListener() {}
};
context.window = context;
context.parent = context;
vm.runInNewContext(script, context);
const player = context.AuraVideoPlayer;
for (const route of ['/simulator/', '/simulator/index.html', '/simulator/index.html#versionInfoButton', '/simulator/auras/index.html?q=rainy&page=2&scroll=450', '/simulator/auras/poseidon/index.html?return=%2Fsimulator%2Fauras%2Findex.html']) {
    assert.equal(player.destination(route)?.href, 'https://example.com' + route, 'PiP navigation must include Home and preserve directory context');
}
for (const route of ['https://other.example/simulator/auras/index.html', '//other.example/simulator/index.html', 'https://user:pass@example.com/simulator/auras/index.html', '/outside/index.html', '/simulator/auras-other/index.html', 'javascript:alert(1)']) {
    assert.equal(player.destination(route), null, 'Do not navigate an unrelated destination through the persistent player');
}
assert.equal(player.destination(undefined), null);
for (const source of ['https://other.example/video.mp4', 'https://static.wikia.nocookie.net/other-wiki/video.mp4', 'https://static.wikia.nocookie.net.evil.example/sol-rng/video.mp4', 'https://user:pass@static.wikia.nocookie.net/sol-rng/video.mp4', 'http://static.wikia.nocookie.net/sol-rng/video.mp4']) {
    assert.equal(player.mediaSource(source), null, 'Reject untrusted video sources');
}
assert.equal(player.mediaSource('/simulator/files/video.mp4'), 'https://example.com/simulator/files/video.mp4');
let count = 0;
for (const directory of fs.readdirSync(path.join(root, 'auras'), { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const html = fs.readFileSync(path.join(root, 'auras', directory.name, 'index.html'), 'utf8');
    for (const match of html.matchAll(/<video\b[^>]*>/g)) {
        const tag = match[0];
        assert(!/\scontrols(?:\s|=|>)/.test(tag), 'Generated aura videos use custom controls');
        assert(tag.includes('disablepictureinpicture') && tag.includes('controlslist="nodownload noremoteplayback"'));
        const source = tag.match(/data-(?:showcase|history)-src="([^"]+)"/)?.[1];
        if (source) assert(player.mediaSource(source.replaceAll('&amp;', '&')), 'Every generated video must be playable through the source validator');
        count++;
    }
}
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(home.includes('scripts/aura-video-player.js?'), 'Home must join the persistent navigation bridge');
assert(home.includes('styles/aura-video-player.css?'));
const eon = home.slice(home.indexOf('<span class="largeClass">Eon 1-29</span>'));
const card = eon.slice(0, eon.indexOf('</ul>'));
const background = card.indexOf('Reworked biome backgrounds globally with day and night combinations');
assert(background >= 0 && background < card.indexOf('[CONTENT DELETED]'), 'The biome update belongs inside Eon 1-29 above Content Deleted');
console.log(`Passed: Home/aura PiP routes, source validation, ${count} custom video elements, and Eon 1-29 changelog placement.`);
