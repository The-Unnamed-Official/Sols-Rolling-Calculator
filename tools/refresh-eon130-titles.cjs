// Refresh the twelve Eon 1-30 aura titles from the wiki's actual Aura template.
// Dependencies: pnpm add --dir test-results/wiki-tools cheerio
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require(path.join(process.env.WIKI_STYLE_DEPS || path.resolve(__dirname, '../test-results/wiki-tools/node_modules'), 'cheerio'));
const repairs = require('../scripts/wiki-title-repairs.js');
const root = path.resolve(__dirname, '..');
const names = ['Watcher', 'Rekindle', 'Moonchild', 'Cor Lunae', 'True Jade', 'True Kyawthuite', 'True Twilight', 'Tomorrow', 'Tree House', 'Hasuen', 'Veylune', 'Artifact'];
const allowedTags = new Set(['span', 'b', 'i', 'big', 'small', 'br']);
const allowedAttributes = new Set(['style', 'class', 'data-text', 'data-textstroke', 'data-gradient', 'data-colors', 'data-width', 'data-color']);
function sanitize(markup) {
    const $ = cheerio.load(markup, {}, false);
    $('script,style,iframe,img,svg,object,embed').remove();
    $('*').each((_, element) => {
        if (!allowedTags.has(element.name)) { $(element).replaceWith($(element).contents()); return; }
        for (const name of Object.keys(element.attribs)) if (!allowedAttributes.has(name)) $(element).removeAttr(name);
        if (element.attribs.class) $(element).attr('class', element.attribs.class.split(/\s+/).filter(Boolean).map(name => 'wiki-ref-' + name).join(' '));
        if (element.attribs.style) {
            const style = element.attribs.style.split(';').map(part => {
                const colon = part.indexOf(':');
                if (colon < 0) return '';
                const property = part.slice(0, colon).trim().toLowerCase();
                let value = part.slice(colon + 1).trim();
                if (!property || !value || /url\s*\(|expression\s*\(|javascript:|@import/i.test(value) || /^(behavior|-moz-binding)$/.test(property)) return '';
                if (property === 'position' && /fixed|sticky/.test(value)) value = 'relative';
                return property + ':' + value;
            }).filter(Boolean).join(';');
            $(element).attr('style', repairs.repairStyle(style));
        }
    });
    return $.html().replace(/[\u200e\u200f]/g, '').trim();
}
async function refresh() {
    const text = names.map((name, index) => `<div data-aura-index="${index}">{{Aura|${name}}}</div>`).join('\n');
    const params = new URLSearchParams({ action: 'parse', text, contentmodel: 'wikitext', prop: 'text', format: 'json' });
    const response = await fetch('https://sol-rng.fandom.com/api.php?' + params);
    if (!response.ok) throw new Error('Wiki API returned ' + response.status);
    const data = await response.json();
    if (data.error) throw new Error(data.error.info);
    const $ = cheerio.load(data.parse.text['*']);
    const titles = {};
    const overridesPath = path.join(__dirname, 'wiki-title-overrides.json');
    const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    const context = {};
    const outputPath = path.join(root, 'scripts/wiki-title-data.js');
    vm.runInNewContext(fs.readFileSync(outputPath, 'utf8'), context);
    const effects = fs.readFileSync(path.join(root, 'styles/wiki-title-effects.css'), 'utf8');
    const unstyled = [];
    names.forEach((name, index) => {
        const element = $(`[data-aura-index="${index}"]`);
        if (!element.length || !element.text().trim()) throw new Error('Missing wiki title: ' + name);
        const markup = sanitize(element.html());
        for (const match of markup.matchAll(/class="([^"]*)"/g)) {
            for (const className of match[1].split(/\s+/)) {
                if (!effects.includes('.' + className)) throw new Error('Review new wiki effect before importing: ' + className);
            }
        }
        const source = 'https://sol-rng.fandom.com/wiki/' + encodeURI(name.replace(/ /g, '_'));
        titles[name] = { source, markup };
        // Keep the full title compiler in sync with this targeted refresh.
        overrides[name] = { name, url: source, markup: element.html().replace(/[\u200e\u200f]/g, '').trim() };
        if (!/style=|class=/.test(markup)) unstyled.push(name);
    });
    Object.assign(context.WikiTitleData.auras, titles);
    fs.writeFileSync(outputPath, '// Generated wiki title artwork; targeted refreshes use tools/refresh-eon130-titles.cjs.\n// Sol’s RNG Wiki contributors, CC BY-SA 3.0; see data/auras/README.md.\n' +
        'globalThis.WikiTitleData = ' + JSON.stringify(context.WikiTitleData, null, 2) + ';\n');
    fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n');
    const fontPath = path.join(root, 'styles/wiki-title-fonts.css');
    const fontCss = fs.readFileSync(fontPath, 'utf8');
    if (!/family=Caveat(?:&|;|['"])/.test(fontCss)) fs.writeFileSync(fontPath, "@import url('https://fonts.googleapis.com/css2?family=Caveat&display=swap');\n" + fontCss);
    console.log(`Refreshed all ${names.length} titles. Wiki currently returns plain text for: ${unstyled.join(', ') || 'none'}.`);
}
refresh().catch(error => { console.error(error); process.exitCode = 1; });
