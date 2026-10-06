/* Normalize malformed declarations in attributed wiki title templates. */
((global) => {
    'use strict';
    const keyframeNames = ['rainbow_animation', 'rainbowstroke', 'GlitchedEggShadow', 'GlitchedEggTitle', 'GlitchedEggStroke'];
    const keyframes = new Set(keyframeNames);
    function repairStyle(style) {
        return style.split(';').map(part => {
            const colon = part.indexOf(':');
            if (colon < 0) return '';
            let property = part.slice(0, colon).trim().toLowerCase();
            let value = part.slice(colon + 1).trim();
            if (!property || !value || ['quality', 'fps', 'bugs', '-moz-background-clip', '-ms-background-clip', '-o-background-clip'].includes(property)) return '';
            if (/^padding(?:-(?:top|right|bottom|left))?$/.test(property) && value === 'auto') return '';
            if (property === 'webkit-text-stroke') property = '-webkit-text-stroke';
            if (property === 'font-style' && value === 'bold') property = 'font-weight';
            if (property === 'font-family') {
                value = value.split(',').map(family => {
                    const name = family.trim().replace(/^["']|["']$/g, '');
                    if (name === 'default') return 'inherit';
                    return /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|unset|revert)$/i.test(name) ? name : `'${name}'`;
                }).join(',');
            }
            if (property === '-webkit-text-stroke') value = value.replace(/pxpx\b/g, 'px');
            if (property === 'filter') value = value.replace(/drop-shadow\(([^(),]+)\)/g, (match, shadow) => {
                const parts = shadow.trim().split(/\s+/);
                if (parts.length === 5 && parts.slice(0, 4).every(part => /^[-.\d]+(?:px|em|rem)?$/.test(part))) parts.splice(3, 1);
                return `drop-shadow(${parts.join(' ')})`;
            });
            if (/(^|-)animation(?:-name)?$/.test(property)) value = value.replace(/[\w-]+/g, token => keyframes.has(token) ? `wiki-${token}` : token);
            return `${property}:${value}`;
        }).filter(Boolean).join(';');
    }
    function repairMarkup(markup) {
        return markup.replace(/\bstyle=(["'])([\s\S]*?)\1/g, (_, quote, style) => {
            const decoded = style.replace(/&quot;/g, '"').replace(/&#(?:39|x27);|&apos;/gi, "'").replace(/&amp;/g, '&');
            const repaired = repairStyle(decoded).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `style="${repaired}"`;
        });
    }
    const api = Object.freeze({ repairStyle, repairMarkup, keyframeNames });
    global.WikiTitleRepairs = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
