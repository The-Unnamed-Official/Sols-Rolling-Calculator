// The home page embeds these partials; aura pages fetch them at runtime.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function header(prefix, home = false) {
    const controls = read(home ? 'partials/home-header-controls.html' : 'partials/aura-header-controls.html');
    let result = read('partials/header.html').replace('{{pageControls}}', controls).replaceAll('{{assetPrefix}}', prefix);
    if (!home) result = result.replace(/<button([^>]*id="versionInfoButton"[^>]*)>([\s\S]*?)<\/button>/,
        (_, attributes, content) => `<a${attributes.replace(/ type="button"| aria-haspopup="dialog"| aria-expanded="false"/g, '')} href="${prefix}index.html#versionInfoButton">${content}</a>`);
    return result;
}
function qualityPreferences(home = false) {
    let result = read('partials/quality-preferences.html');
    if (!home) result = result.replace(/\s*<button\b[^>]*data-quality-option="(\w+)"[^>]*>[\s\S]*?<\/button>/g,
        (button, key) => ['disableUiAnimations', 'disableRollAndSigilAnimations', 'disableWikiAuraStyles'].includes(key) ? button : '');
    return result;
}
function buildHomeLayout() {
    const file = path.join(root, 'index.html');
    const source = fs.readFileSync(file, 'utf8');
    let result = source.replace(/<header class="surface interface-header masthead-console"[^>]*>[\s\S]*?<\/header>/, header('', true))
        .replace(/<div id="qualityPreferencesOverlay"[\s\S]*?(?=\s*<div id="rollingSettingsOverlay")/, qualityPreferences(true));
    if (!result.includes('scripts/aura-directory-preferences.js')) result = result.replace('</head>', '    <script src="scripts/aura-directory-preferences.js" defer></script>\n</head>');
    if (source !== result) fs.writeFileSync(file, result);
}
function buildAuraFragments() {
    const files = ['header.html', 'aura-header-controls.html', 'aura-body.html', 'aura-head.html', 'aura-footer.html', 'aura-profile-navigation.html', 'quality-preferences.html', 'aura-audio.html'];
    const fragments = Object.fromEntries(files.map(file => [file, read('partials/' + file)]));
    const target = path.join(root, 'scripts/aura-layout-fragments.js');
    const result = '// Generated from partials by tools/shared-layout.cjs. Shared fallback for file previews and failed HTML requests.\n' +
        'globalThis.AuraLayoutFragments = Object.freeze(' + JSON.stringify(fragments, null, 2) + ');\n';
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== result) fs.writeFileSync(target, result);
}
module.exports = { header, qualityPreferences, buildHomeLayout, buildAuraFragments };
