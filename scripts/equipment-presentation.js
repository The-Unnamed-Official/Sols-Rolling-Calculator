/* Shared colors for equipment effects in loadouts, help, and release notes. */
(() => {
    'use strict';
    const escape = text => String(text).replace(/[&<>"']/g, value => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[value]));
    const tokens = /([+]?\d[\d,]*(?:\.\d+)?(?:[–-]\d+(?:\.\d+)?)?\s+(?:basic\s+)?luck\b|\bbasic luck\b|[+]\d+(?:\.\d+)?)|(×\d+(?:\.\d+)?|\b\d+(?:\.\d+)?x\b)|(\bbonus (?:luck|rolls?|multiplier)\b)|(\bevery \d+(?:st|nd|rd|th)?(?: rolls?)?|\b(?:next )?\d[\d,]* (?:normal )?rolls?\b)|(\b\d+(?:\.\d+)?%)|(\b(?:Halloween|Summer|Winter)(?: 20\d{2}(?:\/20\d{2})?)?\b|\b(?:Starfall|Windy|Rainy|Hell|Glitch(?:ed)?|day(?:time)?|night(?:time)?)\b)/gi;
    const classes = ['luck', 'multiplier', 'bonus', 'cycle', 'reduction', 'condition'];
    const conditionSigils = Object.freeze({
        starfall: 'starfall', windy: 'windy', rainy: 'rainy', hell: 'hell',
        glitch: 'glitch', glitched: 'glitch', day: 'day', daytime: 'day',
        night: 'night', nighttime: 'night', halloween: 'halloween', summer: 'summer', winter: 'winter'
    });
    function format(text) {
        let result = '', offset = 0;
        for (const match of String(text).matchAll(tokens)) {
            result += escape(String(text).slice(offset, match.index));
            const kind = classes[match.slice(1).findIndex(Boolean)];
            const condition = kind === 'condition' ? match[0].toLowerCase().split(' ')[0] : null;
            const sigil = condition ? (match[0].toLowerCase() === 'winter 2026' ? 'winter-2026' : conditionSigils[condition]) : null;
            result += `<span class="equipment-effect equipment-effect--${kind}${sigil ? ` sigil-outline-${sigil}` : ''}">${escape(match[0])}</span>`;
            offset = match.index + match[0].length;
        }
        return result + escape(String(text).slice(offset));
    }
    function initialize(root = document) {
        root.querySelectorAll('.changelog-equipment__effect, [data-equipment-effect-copy]').forEach(element => {
            if (element.dataset.equipmentEffectRendered) return;
            element.dataset.equipmentEffectRendered = 'true';
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            const nodes = [];
            while (walker.nextNode()) {
                if (!walker.currentNode.parentElement.closest('[data-wiki-item], .wiki-title, [class*="sigil-outline-"]')) nodes.push(walker.currentNode);
            }
            nodes.forEach(node => {
                const template = document.createElement('template');
                template.innerHTML = format(node.textContent);
                node.replaceWith(template.content);
            });
        });
    }
    globalThis.EquipmentPresentation = Object.freeze({ format, initialize });
    document.addEventListener('DOMContentLoaded', () => initialize());
})();
