const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function header(prefix, home = false) {
    const controls = read(home ? 'partials/home/home-header-controls.html' : 'partials/auras/aura-header-controls.html');
    let result = read('partials/shared/header.html').replace('{{pageControls}}', controls).replaceAll('{{assetPrefix}}', prefix);
    if (!home) result = result.replace(/<button([^>]*id="versionInfoButton"[^>]*)>([\s\S]*?)<\/button>/,
        (_, attributes, content) => `<a${attributes.replace(/ type="button"| aria-haspopup="dialog"| aria-expanded="false"/g, '')} href="${prefix}#versionInfoButton">${content}</a>`);
    return result;
}
function qualityPreferences(home = false) {
    let result = read('partials/shared/quality-preferences.html');
    if (!home) result = result.replace(/\s*<button\b[^>]*data-quality-option="(\w+)"[^>]*>[\s\S]*?<\/button>/g,
        (button, key) => ['disableUiAnimations', 'disableRollAndSigilAnimations', 'disableWikiAuraStyles'].includes(key) ? button : '');
    return result;
}
function buildHomeLayout() {
    const file = path.join(root, 'index.html');
    const source = fs.readFileSync(file, 'utf8');
    let result = source.replace(/<header class="surface interface-header masthead-console"[^>]*>[\s\S]*?<\/header>/, header('', true))
        .replace(/<div id="qualityPreferencesOverlay"[\s\S]*?(?=\s*<div id="rollingSettingsOverlay")/, qualityPreferences(true));
    if (!result.includes('scripts/auras/aura-directory-preferences.js')) result = result.replace('</head>', '    <script src="scripts/auras/aura-directory-preferences.js" defer></script>\n</head>');
    if (source !== result) fs.writeFileSync(file, result);
}
function buildAuraFragments() {
    const files = ['shared/header.html', 'auras/aura-header-controls.html', 'auras/aura-body.html', 'auras/aura-head.html', 'auras/aura-footer.html', 'auras/aura-profile-navigation.html', 'shared/quality-preferences.html', 'auras/aura-audio.html'];
    const fragments = Object.fromEntries(files.map(file => [file, read('partials/' + file)]));
    const target = path.join(root, 'scripts/auras/aura-layout-fragments.js');
    const result = 'globalThis.AuraLayoutFragments = Object.freeze(' + JSON.stringify(fragments, null, 2) + ');\n';
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== result) fs.writeFileSync(target, result);
}
module.exports = { header, qualityPreferences, buildHomeLayout, buildAuraFragments };
