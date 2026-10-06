// Guard the shared-layout contract across every generated aura page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const catalogue = JSON.parse(read('data/auras/catalogue.json'));
const pages = ['auras/index.html', ...catalogue.map(aura => `auras/${aura.slug}/index.html`)];
let profileTitleBytes = 0;
for (const file of pages) {
    const html = read(file);
    assert.match(html, /scripts\/aura-page-layout\.js/);
    assert.match(html, /<html[^>]*data-aura-layout="loading"/, `${file}: hide unstyled content before the loader executes`);
    assert.match(html, /color-scheme: dark; background: #050a14/, `${file}: dark first paint must not depend on a network request`);
    if (file !== 'auras/index.html') assert.match(html, /data-aura-details[\s\S]*<dt>Tier<\/dt>[\s\S]*<dt>Availability<\/dt>/, `${file}: all current profiles need consistent detail fields`);
    assert.doesNotMatch(html, /banner__game-version-name|data-version-id|\?v=[\d.]+/,
        `${file} must not embed shared build metadata or asset versions`);
    for (const name of ['header', 'footer', 'quality']) assert(html.includes(`data-aura-fragment="${name}"`), `${file}: missing ${name}`);
    assert(html.includes('data-aura-shell'), `${file}: missing shared shell`);
    assert(html.includes('data-aura-page="directory"') || html.includes('data-aura-fragment="navigation"'), `${file}: missing profile navigation`);
    if (file !== 'auras/index.html') {
        const json = /<script type="application\/json" data-aura-title-reference>(.*?)<\/script>/.exec(html)?.[1];
        assert(json, `${file}: missing local title artwork`);
        const titles = Object.entries(JSON.parse(json));
        assert.equal(titles.length, 1, `${file}: profile must contain only its own artwork`);
        assert.equal(typeof titles[0][1]?.markup, 'string', `${file}: missing title markup`);
        assert(html.includes(`data-aura-title="${titles[0][0].replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])}"`), `${file}: profile title data must match its heading`);
        profileTitleBytes += Buffer.byteLength(json);
    }
    for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        if (/^(https?:|#)/.test(url)) continue;
        assert(fs.existsSync(path.resolve(root, path.dirname(file), url)), `${file}: broken ${url}`);
    }
}
const partials = ['header', 'aura-header-controls', 'aura-body', 'aura-head', 'aura-footer', 'aura-profile-navigation', 'quality-preferences', 'aura-audio'];
const bundle = {};
vm.runInNewContext(read('scripts/aura-layout-fragments.js'), bundle);
let assets = 0;
for (const name of partials) {
    assert.equal(bundle.AuraLayoutFragments[`${name}.html`], read(`partials/${name}.html`), `${name}: refresh the fallback bundle with the aura build`);
    for (const [, url] of read(`partials/${name}.html`).matchAll(/(?:href|src)="\{\{assetPrefix\}\}([^"]+)"/g)) {
        assert(fs.existsSync(path.join(root, url.split(/[?#]/)[0])), `${name}: broken ${url}`);
        assets++;
    }
}
const header = read('partials/header.html');
const version = /data-version-id="v([^"]+)"/.exec(header)?.[1];
assert(version, 'The shared header must provide the simulator version');
assert(header.includes(`Version ${version}`), 'Visible version and asset cache version must agree');
assert(read('partials/aura-footer.html').includes('{{appVersion}}'));
assert.doesNotMatch(read('partials/aura-head.html'), /\?v=[\d.]+/);
for (const script of ['wiki-title-data', 'directory-title-data', 'interface-select']) {
    assert.match(read('partials/aura-head.html'), new RegExp(`<script data-aura-page="directory" src="[^\"]*scripts/${script}\\.js`));
}
const gameBuild = /banner__game-version-name">([^<]+)</.exec(header)?.[1];
assert.equal(gameBuild, /banner__game-version-name">([^<]+)</.exec(read('index.html'))?.[1], 'Home and shared aura header game builds must agree');
assert.match(read('partials/quality-preferences.html'), /type="range"[^>]*min="9"[^>]*max="90"/, 'Page size must support 9–90 auras');
assert.match(read('partials/quality-preferences.html'), /max="90" step="3"/, 'Page size must snap to multiples of three');
assert.match(read('index.html'), /scripts\/aura-directory-preferences\.js/, 'Home Settings must save the same page size');
assert.equal((read('auras/index.html').match(/data-aura-pagination/g)||[]).length, 2, 'The directory needs pagination above and below the cards');
const tiers = {};
vm.runInNewContext(read('scripts/aura-tiers.js'), tiers);
for (const aura of catalogue) assert.equal(aura.tierKey, tiers.AuraTiers.resolve(aura.tier, aura.rarityValue));
assert(tiers.AuraTiers.sortGroup('challenged', 'Special obtainment') > tiers.AuraTiers.sortGroup('transcendent', 'Standard'));
assert(catalogue.findIndex(aura=>aura.title==='Memory') > catalogue.findIndex(aura=>aura.title==='Luminosity'), 'Memory belongs after regular rarity tiers');
assert.equal(catalogue.find(aura=>aura.title==='Poseidon').background, 'files/images/backgrounds/rainyBiomeImage.jpg');
for (const aura of catalogue) {
    // Artwork can be added after the pages are built. The shared resolver
    // discovers alternate formats and supplies a scene for pending images.
    if (aura.background) assert.match(aura.background, /^files\/(?:images\/backgrounds|videos\/biomes)\/[^/]+\.(?:png|jpe?g|webp|avif|webm|mp4|ogv|ogg)$/, `${aura.title}: invalid background asset path`);
}
assert.match(read('styles/auras.css'), /\.aura-pages \{ isolation: isolate;/, 'The dark body must not cover its negative-z-index backdrop');
const extraEffects=read('partials/aura-head.html').split('\n').find(line=>line.includes('styles/directory-title-effects.css'));
assert(extraEffects.includes('data-layout-critical')&&!extraEffects.includes('data-aura-page='), 'Additional title effects must be available on profiles as well as the directory');
assert.match(read('styles/directory-title-fonts.css'), /Faster\+One/, 'Layers needs its wiki font on profiles');
assert.doesNotMatch(read('styles/directory-title-effects.css'), /@import/, 'Title effects must not wait for remote font CSS before revealing a profile');
console.log(`Passed: ${pages.length} pages use runtime partials; ${partials.length} shared fragments and ${assets} local assets are valid. Current game build: ${gameBuild}.`);
console.log(`Profile title data averages ${Math.round(profileTitleBytes / catalogue.length)} bytes; full title registries are directory-only.`);
