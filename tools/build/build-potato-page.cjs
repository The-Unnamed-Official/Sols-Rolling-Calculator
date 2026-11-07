// Share the full simulator's markup, styles and controls. Rotato Simulator adds only
// an effects-off layer so its layout and control sizes cannot drift.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function replaceBlock(html, opening, replacement = '') {
    const match = opening.exec(html);
    if (!match) throw new Error(`Missing minimal-page source block: ${opening}`);
    const tag = /^<(\w+)/.exec(match[0])[1];
    const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    tags.lastIndex = match.index;
    let depth = 0;
    for (let token; (token = tags.exec(html));) {
        depth += token[0].startsWith('</') ? -1 : 1;
        if (depth === 0) return html.slice(0, match.index) + replacement + html.slice(tags.lastIndex);
    }
    throw new Error(`Unclosed minimal-page source block: ${opening}`);
}

function buildPotatoPage() {
    let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const version = /name="app-build" content="([^"]+)"/.exec(html)[1];
    html = html.replace('<html lang="en">', '<html lang="en" data-simulator-mode="minimal">')
        .replace('<head>', '<head>\n    <base href="../">')
        .replace(/<title>[^<]*<\/title>/, '<title>Rotato Simulator</title>')
        .replace('</head>', `    <link rel="stylesheet" href="styles/core/minimal.css?v=${version}.layout2">\n</head>`)
        .replace('<body>', '<body class="reduce-motion quality-no-particles quality-no-ui-animations quality-no-shakes quality-no-roll-sigil-animations quality-no-glitch">')
        .replace(/\s*<script src="scripts\/events\/pumpkin-carver\.js[^>]*><\/script>/g, '')
        .replace('files/images/other/theUnnamed-flipped.gif', 'files/images/other/theUnnamed.png')
        .replace(/href="#/g, 'href="rotatosimulator/#')
        .replace('<span>Simulation Interface</span>', '<span>Rotato Simulator</span>');
    html = replaceBlock(html, /<div\b[^>]*class="interface-backdrop"[^>]*>/,
        '<div class="interface-backdrop" aria-hidden="true"><div class="interface-backdrop__veil"></div></div>');
    for (const name of ['glitch-signal', 'glitch-entry-errors', 'event-atmosphere', 'snow-field']) {
        html = replaceBlock(html, new RegExp(`<div\\b[^>]*class="${name}(?: [^"]*)?"[^>]*>`));
    }
    html = replaceBlock(html, /<aside\b[^>]*id="pumpkin-decoration"[^>]*>/);
    html = replaceBlock(html, /<dialog\b[^>]*id="pumpkin-carver"[^>]*>/);
    html = html.replace(/\s*<button\b[^>]*data-quality-option="(?:removeParticles|disableUiAnimations|disableShakes|disableRollAndSigilAnimations|reduceGlitchEffects|removeGlitchEffects)"[^>]*>[\s\S]*?<\/button>/g, '')
        .replace('<div class="quality-settings__menu" id="qualityPreferencesMenu" role="menu">', '<div class="quality-settings__menu" id="qualityPreferencesMenu" hidden>')
        .replace('Fine tune visual performance settings and effects.', 'Visual effects and animations stay off in Rotato Simulator.')
        .replace(/<input\b[^>]*data-potato-switch[^>]*>/g, input => input
            .replace('data-potato-target="rotatosimulator/"', 'data-potato-target="./"')
            .replace(/>$/, ' checked>'));
    const target = path.join(root, 'rotatosimulator/index.html');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== html) fs.writeFileSync(target, html);
}

if (require.main === module) buildPotatoPage();
module.exports = { buildPotatoPage };
