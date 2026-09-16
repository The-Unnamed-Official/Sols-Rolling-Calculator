// Compile reviewed, DOM-extracted wiki title references into local presentation assets.
// npm install --prefix test-results/wiki-tools cheerio postcss postcss-selector-parser
// node tools/build-wiki-titles.cjs <reference-directory> <asset-bundle-directory>
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deps = process.env.WIKI_STYLE_DEPS || path.resolve(__dirname, '../test-results/wiki-tools/node_modules');
const cheerio = require(path.join(deps, 'cheerio'));
const postcss = require(path.join(deps, 'postcss'));
const selectorParser = require(path.join(deps, 'postcss-selector-parser'));
const root = path.resolve(__dirname, '..');
const referenceDirectory = path.resolve(process.argv[2] || path.join(root, 'test-results'));
const assetDirectory = path.resolve(process.argv[3]);
const reference = JSON.parse(fs.readFileSync(path.join(referenceDirectory, 'wiki-aura-reference.json'), 'utf8'));
const itemReference = JSON.parse(fs.readFileSync(path.join(referenceDirectory, 'wiki-item-reference.json'), 'utf8'));
const main = fs.readFileSync(path.join(root, 'scripts/main.js'), 'utf8');
const context = { nativeBreakthroughs: () => ({}) };
for (const match of main.matchAll(/const\s+(\w+)\s*=\s*('([^'\\]|\\.)*'|"([^"\\]|\\.)*")/g)) {
    try { context[match[1]] = vm.runInNewContext(match[2]); } catch {}
}
const start = main.indexOf('const AURA_BLUEPRINT_SOURCE =');
const blueprint = vm.runInNewContext(main.slice(start, main.indexOf(']);', start) + 3) + '; AURA_BLUEPRINT_SOURCE', context);
const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || value.trim();
const aliases = {
    '赤月の破片': 'Fragments of the Crimson Moon',
    'Breakthrough': 'Breakthrough (Aura)',
    'Aegis : Eggis': 'Eggis',
    'P.U.K.E.K.O.G.O.D.': 'Pukeko : P.U.K.E.K.O.G.O.D.',
    'Gravitational : Point Zero': 'Point : Zero',
    'Surfer : Shard Surfer': 'Shard Surfer',
    'Aether : Dissapointment': 'Aether : Disappointment',
    'ゴシック': 'Gothic',
    '紅月を求めし者': 'Seeker of the Crimson Moon',
    '紅月の観測者': 'Observer of the Crimson Moon',
    'Star Rider : Starfish Rider': 'StarRider : Starfish',
    'LEAK': 'Ink : Leak',
    'Atomic : Riboneucleic': 'Atomic : Ribonucleic'
};
const sourceByName = new Map(reference.titles.map(title => [normalize(title.name), title]));
const usedClasses = new Set();
const allowedTags = new Set(['span', 'b', 'i', 'big', 'small', 'br']);
const allowedAttributes = new Set(['style', 'class', 'data-text', 'data-textstroke', 'data-gradient', 'data-colors', 'data-width', 'data-color']);
const fontText = new Map();
const animationNames = new Set();
const cssSources = [...reference.styles, ...itemReference.styles];
const manifest = JSON.parse(fs.readFileSync(path.join(assetDirectory, 'manifest.json'), 'utf8'));
const assets = manifest.assets;
for (const asset of assets.filter(asset => /(?:AuraKeyframes|site.styles|TextFonts|AuraLinkFonts)/.test(asset.url))) {
    cssSources.push(fs.readFileSync(asset.path, 'utf8'));
}
const parsedSources = [];
for (const source of cssSources) {
    try { parsedSources.push(postcss.parse(source)); } catch {}
}
for (const source of parsedSources) source.walkAtRules(/keyframes$/i, rule => animationNames.add(rule.params));
function rewriteAnimations(value) {
    return value.replace(/[\w-]+/g, token => animationNames.has(token) ? `wiki-${token}` : token);
}
function sanitizeStyle(style) {
    // Parse individual declarations so one invalid wiki gradient does not discard its neighbours.
    return style.split(';').map(part => {
        const colon = part.indexOf(':');
        if (colon < 0) return '';
        const property = part.slice(0, colon).trim().toLowerCase();
        let value = part.slice(colon + 1).trim();
        if (!property || !value || /url\s*\(|expression\s*\(|javascript:|@import/i.test(value)) return '';
        if (['behavior', '-moz-binding'].includes(property)) return '';
        if (property === 'position' && /fixed|sticky/i.test(value)) value = 'relative';
        // Some wiki templates omit the final gradient parenthesis (e.g. Hydrogen).
        const missingClosers = (value.match(/\(/g) || []).length - (value.match(/\)/g) || []).length;
        if (missingClosers > 0) value += ')'.repeat(missingClosers);
        if (/(^|-)animation/.test(property)) value = rewriteAnimations(value);
        return `${property}:${value}`;
    }).filter(Boolean).join(';');
}
function sanitizeMarkup(markup) {
    const $ = cheerio.load(markup, {}, false);
    $('*').each((_, element) => {
        if (!allowedTags.has(element.name)) { $(element).remove(); return; }
        for (const attribute of Object.keys(element.attribs)) {
            if (!allowedAttributes.has(attribute)) $(element).removeAttr(attribute);
        }
        if (element.attribs.style) $(element).attr('style', sanitizeStyle(element.attribs.style));
        if (element.attribs.class) {
            $(element).attr('class', element.attribs.class.split(/\s+/).filter(Boolean).map(name => {
                usedClasses.add(name);
                return `wiki-ref-${name}`;
            }).join(' '));
        }
        if (element.attribs['data-textstroke']) {
            const direction = element.attribs['data-gradient'] || 'to bottom';
            const colors = element.attribs['data-colors'];
            const width = Number(element.attribs['data-width']) || 1;
            if (colors) $(element).attr('style', sanitizeStyle(`${element.attribs.style || ''};position:absolute;background:linear-gradient(${direction},${colors});-webkit-background-clip:text!important;-webkit-text-fill-color:transparent;-webkit-text-stroke:${width}px transparent`));
        }
    });
    $('.wiki-ref-NyctoReworkAnimation > span').each((index, element) => {
        $(element).attr('style', `${element.attribs.style || ''};animation-delay:${index * 0.005}s`);
    });
    const text = $.root().text();
    $('[style]').each((_, element) => {
        const family = /(?:^|;)font-family:([^;]+)/i.exec(element.attribs.style)?.[1];
        if (!family) return;
        const firstFamily = family.split(',')[0].replace(/["']/g, '').trim();
        fontText.set(firstFamily, (fontText.get(firstFamily) || '') + text);
    });
    return $.html();
}
const auras = {};
for (const aura of blueprint) {
    const name = aura.name.split(' - ')[0].trim();
    const source = sourceByName.get(normalize(aliases[name] || name));
    if (!source) throw new Error(`Missing wiki title: ${name}`);
    auras[name] = { source: source.url, markup: sanitizeMarkup(source.markup) };
    if (['Illusionary', 'Cryogenic', 'Meta'].includes(name)) {
        auras[name].rarityMarkup = auras[name].markup.replace(new RegExp(name, 'gi'), '__RARITY__');
        // Keep class names intact when replacing the displayed Illusionary text.
        auras[name].rarityMarkup = auras[name].rarityMarkup.replace('ColorChange-__RARITY__', 'ColorChange-Illusionary');
    }
}
const items = {};
const itemNames = new Set([
    'Heavenly Potion', "Pump King's Blood", 'Oblivion Potion', 'Godlike Potion',
    'Red Moon Potion I', 'Red Moon Potion II', 'Potion of Bound', 'Potion of the Dune',
    'Popping Potion', 'Void Heart', 'Forbidden Potion I', 'Forbidden Potion II', 'Forbidden Potion III',
    'Heavenly Device', 'Pole Light Core Device', 'Singularity Gauntlet', "Soul Master's Talisman",
    'Rune of Everything', 'Rune of Wind', 'Rune of Frost', 'Rune of Rainstorm', 'Rune of Dust',
    'Rune of Hell', 'Rune of Galaxy', 'Rune of Heaven', 'Rune of Corruption', 'Rune of Nothing', 'Rune of Eclipse'
]);
for (const item of itemReference.links) {
    if (!/<(?:b|span)\b/.test(item.markup)) continue;
    const name = item.text.replace(/[\u200e\u200f]/g, '').trim();
    if (!itemNames.has(name) || items[name]) continue;
    items[name] = { source: item.url, markup: sanitizeMarkup(item.markup) };
}
items['Tutorial Potion'] = { source: 'https://sol-rng.fandom.com/wiki/Tutorial_Potion', markup: '<b style="font-family:Sarpanch">Tutorial Potion</b>' };
// These are buffs, rather than item-link templates; keep their recognisable in-game palettes.
items['Candy Corn'] = { source: 'https://sol-rng.fandom.com/wiki/Effects', markup: '<b style="font-family:Sarpanch;background:linear-gradient(to bottom,#fff8de 25%,#ffdd59 45%,#ff8b2b 75%);background-clip:text;-webkit-background-clip:text;color:transparent">Candy Corn</b>' };
items['Godlike!'] = { source: 'https://sol-rng.fandom.com/wiki/Effects', markup: '<b style="font-family:Sarpanch;color:#fff947">Godlike!</b>' };
const extractedCss = postcss.root();
const seenRules = new Set();
const neededAnimations = new Set();
for (const entry of [...Object.values(auras), ...Object.values(items)]) {
    for (const name of animationNames) if (entry.markup.includes(`wiki-${name}`)) neededAnimations.add(name);
}
for (const source of parsedSources) {
    source.walkRules(rule => {
        if (rule.parent.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
        let matching = [];
        try {
            selectorParser(selectors => {
                selectors.each(selector => {
                    let selected = false;
                    selector.walkClasses(node => { if (usedClasses.has(node.value)) selected = true; });
                    if (!selected) return;
                    selector.walkClasses(node => { node.value = `wiki-ref-${node.value}`; });
                    matching.push(`.wiki-title ${selector.toString()}`);
                });
            }).processSync(rule.selector);
        } catch { return; }
        if (!matching.length) return;
        const cloned = rule.clone({ selector: matching.join(',') });
        cloned.walkDecls(declaration => {
            if (/url\s*\(/i.test(declaration.value)) { declaration.remove(); return; }
            if (/(^|-)animation/.test(declaration.prop)) {
                for (const name of animationNames) if (declaration.value.split(/[^\w-]+/).includes(name)) neededAnimations.add(name);
                declaration.value = rewriteAnimations(declaration.value);
            }
        });
        const key = cloned.toString();
        if (!seenRules.has(key)) { seenRules.add(key); extractedCss.append(cloned); }
    });
}
for (const source of parsedSources) {
    source.walkAtRules(/keyframes$/i, rule => {
        if (!neededAnimations.has(rule.params)) return;
        const cloned = rule.clone({ params: `wiki-${rule.params}` });
        cloned.walkDecls(declaration => { if (/url\s*\(/i.test(declaration.value)) declaration.remove(); });
        const key = cloned.toString();
        if (!seenRules.has(key)) { seenRules.add(key); extractedCss.append(cloned); }
    });
}
const header = '/* Adapted from Sol\'s RNG Wiki contributors, CC BY-SA. See WIKI-STYLES.md. */\n';
fs.writeFileSync(path.join(root, 'scripts/wiki-title-data.js'),
    '// Generated by tools/build-wiki-titles.cjs; see WIKI-STYLES.md for source attribution.\n' +
    'globalThis.WikiTitleData = ' + JSON.stringify({ auras, items }, null, 2) + ';\n');
fs.writeFileSync(path.join(root, 'styles/wiki-title-effects.css'), header + extractedCss.toString());
fs.writeFileSync(path.join(referenceDirectory, 'wiki-font-text.json'), JSON.stringify(Object.fromEntries(fontText), null, 2));
console.log(`Compiled ${Object.keys(auras).length} aura titles, ${Object.keys(items).length} named references, ${neededAnimations.size} animations, ${fontText.size} fonts.`);
