const SHARE_IMAGE_BASE_NAME_STYLE = Object.freeze({
    font: '600 28px "Sarpanch", sans-serif',
    fill: '#f6fbff',
    letterSpacing: 0,
    shadowLayers: [
        { color: 'rgba(14, 22, 38, 0.55)', blur: 12, offsetX: 0, offsetY: 4 }
    ],
    lineHeightMultiplier: 1.35
});

const SHARE_IMAGE_BASE_PREFIX_STYLE = Object.freeze({
    font: '600 20px "Sarpanch", sans-serif',
    fill: '#7fe3ff',
    letterSpacing: 0.5,
    shadowLayers: [
        { color: 'rgba(127, 227, 255, 0.45)', blur: 10, offsetX: 0, offsetY: 3 }
    ],
    lineHeightMultiplier: 1.2
});

const SHARE_IMAGE_BASE_COUNT_STYLE = Object.freeze({
    font: '500 22px "Sarpanch", sans-serif',
    fill: '#cfe7ff',
    letterSpacing: 0.5,
    shadowLayers: [
        { color: 'rgba(12, 32, 60, 0.65)', blur: 8, offsetX: 0, offsetY: 3 }
    ],
    lineHeightMultiplier: 1.25
});

const SHARE_IMAGE_BASE_SUBTITLE_STYLE = Object.freeze({
    font: 'italic 500 20px "Sarpanch", sans-serif',
    fill: 'rgba(199, 219, 255, 0.72)',
    letterSpacing: 1.6,
    shadowLayers: [],
    lineHeightMultiplier: 1.2
});

const SHARE_IMAGE_RARITY_STYLES = Object.freeze({
    'rarity-tier-basic': {
        fill: '#d8ddea',
        shadows: [
            { color: 'rgba(220, 230, 255, 0.25)', blur: 6 },
            { color: 'rgba(14, 22, 38, 0.75)', blur: 2 }
        ]
    },
    'rarity-tier-epic': {
        fill: '#815482',
        shadows: [
            { color: 'rgba(129, 84, 130, 0.32)', blur: 8 },
            { color: 'rgba(15, 6, 24, 0.8)', blur: 2 }
        ]
    },
    'rarity-tier-unique': {
        fill: '#dba738',
        shadows: [
            { color: 'rgba(219, 167, 56, 0.35)', blur: 10 },
            { color: 'rgba(32, 16, 0, 0.82)', blur: 3 }
        ]
    },
    'rarity-tier-legendary': {
        fill: '#3df1cf',
        shadows: [
            { color: 'rgba(61, 241, 207, 0.35)', blur: 12 },
            { color: 'rgba(0, 22, 18, 0.78)', blur: 3 }
        ]
    },
    'rarity-tier-mythic': {
        fill: '#df1ab0',
        shadows: [
            { color: 'rgba(223, 26, 176, 0.38)', blur: 14 },
            { color: 'rgba(30, 0, 22, 0.82)', blur: 4 }
        ]
    },
    'rarity-tier-exalted': {
        fill: '#10477c',
        shadows: [
            { color: 'rgba(16, 71, 124, 0.35)', blur: 12 },
            { color: 'rgba(0, 12, 28, 0.85)', blur: 3 }
        ]
    },
    'rarity-tier-glorious': {
        fill: '#851010',
        shadows: [
            { color: 'rgba(133, 16, 16, 0.4)', blur: 12 },
            { color: 'rgba(26, 0, 0, 0.8)', blur: 3 }
        ]
    },
    'rarity-tier-transcendent': {
        fill: '#b7f5f5',
        shadows: [
            { color: 'rgba(183, 245, 245, 0.42)', blur: 14 },
            { color: 'rgba(18, 30, 36, 0.72)', blur: 3 }
        ]
    },
    'rarity-tier-challenged': {
        fill: '#080808',
        shadows: [
            { color: 'rgba(255, 255, 255, 0.65)', blur: 6 },
            { color: 'rgba(0, 0, 0, 0.85)', blur: 2 }
        ]
    },
    'rarity-tier-limbo': {
        fill: '#d7d7d7',
        shadows: [
            { color: 'rgba(40, 40, 40, 0.95)', blur: 6 },
            { color: 'rgba(10, 10, 10, 0.9)', blur: 12 },
            { color: 'rgba(0, 0, 0, 0.95)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(0, 0, 0, 0.95)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(0, 0, 0, 0.95)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(0, 0, 0, 0.95)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    }
});

function createShareEventOutlineStyle({ fill = '#ffffff', outline, accent, depth }) {
    return {
        fill,
        stroke: { color: accent, width: 3.4 },
        shadowLayers: [
            { color: outline, blur: 0, offsetX: 2, offsetY: 0 },
            { color: outline, blur: 0, offsetX: -2, offsetY: 0 },
            { color: outline, blur: 0, offsetX: 0, offsetY: 2 },
            { color: outline, blur: 0, offsetX: 0, offsetY: -2 },
            { color: accent, blur: 5 },
            { color: depth, blur: 2, offsetX: 0, offsetY: 3 }
        ],
        replaceShadows: true
    };
}

function createShareBiomeOutlineStyle({ fill, outline, accent, depth, glow = accent }) {
    return {
        fill,
        stroke: { color: accent, width: 3.2 },
        shadowLayers: [
            { color: outline, blur: 0, offsetX: 2, offsetY: 0 },
            { color: outline, blur: 0, offsetX: -2, offsetY: 0 },
            { color: outline, blur: 0, offsetX: 0, offsetY: 2 },
            { color: outline, blur: 0, offsetX: 0, offsetY: -2 },
            { color: glow, blur: 5 },
            { color: depth, blur: 2, offsetX: 0, offsetY: 3 }
        ],
        replaceShadows: true
    };
}

const SHARE_IMAGE_OUTLINE_STYLES = Object.freeze({
    'sigil-outline-empty': {
        fill: '#080808',
        shadows: [
            { color: 'rgba(255, 255, 255, 0.72)', blur: 0, offsetX: 1, offsetY: 0 },
            { color: 'rgba(255, 255, 255, 0.72)', blur: 0, offsetX: -1, offsetY: 0 },
            { color: 'rgba(255, 255, 255, 0.62)', blur: 0, offsetX: 0, offsetY: 1 },
            { color: 'rgba(255, 255, 255, 0.62)', blur: 0, offsetX: 0, offsetY: -1 }
        ]
    },
    'sigil-outline-halloween': createShareEventOutlineStyle({
        fill: '#fff0dc',
        outline: '#7a2d00',
        accent: '#ff8b24',
        depth: 'rgba(60, 20, 0, 0.84)'
    }),
    'sigil-outline-xyz': {
        shadows: [
            { color: 'rgba(80, 170, 255, 0.85)', blur: 4 },
            { color: 'rgba(20, 110, 220, 0.7)', blur: 8 },
            { color: 'rgba(5, 40, 120, 0.9)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(5, 40, 120, 0.9)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(5, 40, 120, 0.9)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(5, 40, 120, 0.9)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-valentine-2024': createShareEventOutlineStyle({
        fill: '#fff0f9',
        outline: '#731450',
        accent: '#ff6fbd',
        depth: 'rgba(70, 8, 45, 0.84)'
    }),
    'sigil-outline-valentine-2026': createShareEventOutlineStyle({
        fill: '#ffe9f7',
        outline: '#85195f',
        accent: '#ff58b4',
        depth: 'rgba(90, 10, 58, 0.84)'
    }),
    'sigil-outline-easter-2026': createShareEventOutlineStyle({
        fill: '#effff9',
        outline: '#0b6a50',
        accent: '#52e8b6',
        depth: 'rgba(5, 75, 58, 0.82)'
    }),
    'sigil-outline-april': createShareEventOutlineStyle({
        fill: '#ffffff',
        outline: '#444444',
        accent: '#b9c0ca',
        depth: 'rgba(35, 35, 35, 0.84)'
    }),
    'sigil-outline-summer': createShareEventOutlineStyle({
        fill: '#fffed4',
        outline: '#777c00',
        accent: '#f2ef3d',
        depth: 'rgba(77, 82, 0, 0.84)'
    }),
    'sigil-outline-innovator': createShareEventOutlineStyle({
        fill: '#f4e8ff',
        outline: '#461478',
        accent: '#bc73ff',
        depth: 'rgba(45, 8, 80, 0.84)'
    }),
    'sigil-outline-winter': createShareEventOutlineStyle({
        fill: '#edf9ff',
        outline: '#285a8c',
        accent: '#79cfff',
        depth: 'rgba(15, 55, 95, 0.84)'
    }),
    'sigil-outline-winter-2026': createShareEventOutlineStyle({
        fill: '#eaffff',
        outline: '#196b98',
        accent: '#46d9ff',
        depth: 'rgba(15, 70, 105, 0.84)'
    }),
    'sigil-outline-winter-garden': {
        font: '600 35px "Parisienne", "Sarpanch", cursive',
        letterSpacing: 0.25,
        lineHeightMultiplier: 1.3,
        shadowLayers: [],
        replaceShadows: true,
        fill: (ctx, x, y, width, height) => {
            const gradient = ctx.createLinearGradient(x, y, x, y + height);
            gradient.addColorStop(0.22, '#7ef1ff');
            gradient.addColorStop(0.35, '#8980ff');
            gradient.addColorStop(0.5, '#7c68cf');
            gradient.addColorStop(0.75, '#e0d8fa');
            return gradient;
        }
    },
    'sigil-outline-dream-traveler': {
        font: '700 italic 35px "Jura", "Sarpanch", sans-serif',
        lineHeightMultiplier: 1.3,
        shadowLayers: [],
        replaceShadows: true,
        fill: (ctx, x, y, width, height) => {
            const gradient = createAngleGradient(ctx, x, y, width, height, 170);
            gradient.addColorStop(0.27, '#2e1885');
            gradient.addColorStop(0.33, '#c5aefe');
            gradient.addColorStop(0.42, '#41307a');
            gradient.addColorStop(0.46, '#fdeef4');
            gradient.addColorStop(0.52, '#f3daf3');
            gradient.addColorStop(0.7, '#6f1930');
            gradient.addColorStop(0.75, '#c26181');
            gradient.addColorStop(0.9, '#f1a9cb');
            return gradient;
        }
    },
    'sigil-outline-frostveil': {
        font: '600 34px "Kings", "Sarpanch", serif',
        lineHeightMultiplier: 1.3,
        shadowLayers: [],
        replaceShadows: true,
        fill: (ctx, x, y, width, height) => {
            const gradient = ctx.createLinearGradient(x, y, x, y + height);
            gradient.addColorStop(0.35, '#a9afff');
            gradient.addColorStop(0.5, '#7594f9');
            gradient.addColorStop(0.7, '#a2dbff');
            return gradient;
        }
    },
    'sigil-outline-lamenthyr': {
        font: 'italic 700 26px "Kings", "Sarpanch", sans-serif',
        letterSpacing: 3.12,
        lineHeightMultiplier: 1.25,
        transform: text => text.toUpperCase(),
        shadowLayers: [
            { color: 'rgba(0, 0, 0, 0.35)', blur: 6, offsetX: 0, offsetY: 3 }
        ],
        replaceShadows: true,
        fill: (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.4);
            gradient.addColorStop(0.35, '#420000');
            gradient.addColorStop(0.5, '#ffc3b6');
            gradient.addColorStop(0.6, '#420000');
            return gradient;
        }
    },
    'sigil-outline-cryogenic': {
        fill: '#e9f8ff',
        shadows: [
            { color: 'rgba(150, 230, 255, 0.95)', blur: 6 },
            { color: 'rgba(90, 190, 255, 0.9)', blur: 14 },
            { color: 'rgba(20, 110, 160, 0.95)', blur: 0, offsetX: 2, offsetY: 2 },
            { color: 'rgba(20, 110, 160, 0.95)', blur: 0, offsetX: -2, offsetY: 2 },
            { color: 'rgba(20, 110, 160, 0.95)', blur: 0, offsetX: 2, offsetY: -2 },
            { color: 'rgba(20, 110, 160, 0.95)', blur: 0, offsetX: -2, offsetY: -2 }
        ]
    },
    'sigil-outline-blood': createShareEventOutlineStyle({
        fill: '#ffe8e8',
        outline: '#730707',
        accent: '#ff4651',
        depth: 'rgba(45, 0, 0, 0.86)'
    }),
    'sigil-outline-illusionary': {
        fill: '#f7fbff',
        shadows: [
            { color: 'rgba(255, 255, 255, 0.95)', blur: 12 },
            { color: 'rgba(176, 216, 255, 0.88)', blur: 22 },
            { color: 'rgba(255, 255, 255, 0.95)', blur: 0, offsetX: 4, offsetY: 0 },
            { color: 'rgba(134, 194, 255, 0.95)', blur: 0, offsetX: -4, offsetY: 0 },
            { color: 'rgba(255, 255, 255, 0.92)', blur: 0, offsetX: 0, offsetY: 4 },
            { color: 'rgba(134, 194, 255, 0.92)', blur: 0, offsetX: 0, offsetY: -4 },
            { color: 'rgba(255, 255, 255, 0.8)', blur: 0, offsetX: 6, offsetY: 2 },
            { color: 'rgba(176, 216, 255, 0.82)', blur: 0, offsetX: -6, offsetY: -2 }
        ]
    },
    'sigil-outline-glitch': createShareBiomeOutlineStyle({
        fill: '#d7c2ff',
        outline: '#6e2bb6',
        accent: '#190d25',
        glow: 'rgba(151, 75, 255, 0.92)',
        depth: 'rgba(0, 0, 0, 0.92)'
    }),
    'sigil-outline-dreamspace': createShareBiomeOutlineStyle({
        fill: '#fff0fc',
        outline: '#710650',
        accent: '#ff5ecb',
        depth: 'rgba(85, 4, 62, 0.86)'
    }),
    'sigil-outline-cyberspace': createShareBiomeOutlineStyle({
        fill: '#eaf5ff',
        outline: '#073d7a',
        accent: '#58a8ff',
        depth: 'rgba(5, 27, 68, 0.86)'
    }),
    'sigil-outline-singularity': createShareBiomeOutlineStyle({
        fill: '#fff0df',
        outline: '#6d1906',
        accent: '#ff7b32',
        depth: 'rgba(54, 9, 13, 0.88)'
    }),
    'sigil-outline-windy': createShareBiomeOutlineStyle({
        fill: '#e8f9ff',
        outline: '#075c96',
        accent: '#43b9ff',
        depth: 'rgba(0, 48, 86, 0.84)'
    }),
    'sigil-outline-snowy': createShareBiomeOutlineStyle({
        fill: '#ffffff',
        outline: '#3a8b99',
        accent: '#aaf7ff',
        depth: 'rgba(35, 91, 103, 0.8)'
    }),
    'sigil-outline-rainy': createShareBiomeOutlineStyle({
        fill: '#eaf2ff',
        outline: '#153a78',
        accent: '#4d8dff',
        depth: 'rgba(8, 37, 85, 0.84)'
    }),
    'sigil-outline-sandstorm': createShareBiomeOutlineStyle({
        fill: '#fff0bd',
        outline: '#64370e',
        accent: '#e9a43a',
        depth: 'rgba(73, 36, 4, 0.84)'
    }),
    'sigil-outline-starfall': createShareBiomeOutlineStyle({
        fill: '#f6ecff',
        outline: '#3a1679',
        accent: '#a875ff',
        depth: 'rgba(28, 5, 70, 0.86)'
    }),
    'sigil-outline-hell': createShareBiomeOutlineStyle({
        fill: '#ffe3d7',
        outline: '#6f0c02',
        accent: '#ff4d2e',
        depth: 'rgba(79, 5, 0, 0.88)'
    }),
    'sigil-outline-corruption': createShareBiomeOutlineStyle({
        fill: '#f7e8ff',
        outline: '#51006e',
        accent: '#ce4dff',
        depth: 'rgba(55, 0, 77, 0.88)'
    }),
    'sigil-outline-null': createShareBiomeOutlineStyle({
        fill: '#f2f5f5',
        outline: '#1b252a',
        accent: '#93a6ae',
        depth: 'rgba(7, 12, 15, 0.9)'
    }),
    'sigil-outline-day': createShareBiomeOutlineStyle({
        fill: '#fff8bf',
        outline: '#6f5c00',
        accent: '#ffe35a',
        depth: 'rgba(55, 43, 0, 0.82)'
    }),
    'sigil-outline-night': createShareBiomeOutlineStyle({
        fill: '#f1eaff',
        outline: '#32105e',
        accent: '#a86cff',
        depth: 'rgba(18, 0, 42, 0.86)'
    }),
    'sigil-outline-heaven': createShareBiomeOutlineStyle({
        fill: '#fff8ce',
        outline: '#725600',
        accent: '#ffd65a',
        depth: 'rgba(78, 50, 0, 0.82)'
    }),
    'sigil-outline-limbo': createShareBiomeOutlineStyle({
        fill: '#070707',
        outline: '#555555',
        accent: '#f0f0f0',
        depth: 'rgba(0, 0, 0, 0.92)'
    }),
    'sigil-outline-leviathan': {
        fill: '#000000',
        shadows: [
            { color: 'rgba(0, 117, 87, 0.95)', blur: 10 },
            { color: 'rgba(0, 155, 57, 0.88)', blur: 18 },
            { color: 'rgba(0, 166, 122, 0.8)', blur: 32 },
            { color: 'rgba(0, 186, 149, 0.96)', blur: 0, offsetX: 1, offsetY: 0 },
            { color: 'rgba(0, 101, 98, 0.96)', blur: 0, offsetX: -1, offsetY: 0 },
            { color: 'rgba(95, 255, 204, 0.96)', blur: 0, offsetX: 0, offsetY: 1 },
            { color: 'rgba(0, 172, 154, 0.94)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-monarch': {
        fill: '#000000',
        shadows: [
            { color: 'rgba(81, 3, 154, 0.9)', blur: 4 },
            { color: 'rgba(68, 9, 149, 0.75)', blur: 8 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    }
});

function cloneShareShadowLayer(layer) {
    return {
        color: layer.color,
        blur: layer.blur ?? 0,
        offsetX: layer.offsetX ?? 0,
        offsetY: layer.offsetY ?? 0,
        fill: layer.fill || null
    };
}

function cloneShareStyle(style) {
    return {
        ...style,
        shadowLayers: style.shadowLayers ? style.shadowLayers.map(cloneShareShadowLayer) : [],
        baseShadow: style.baseShadow ? { ...style.baseShadow } : null,
        stroke: style.stroke ? { ...style.stroke } : null,
        decorations: style.decorations ? { ...style.decorations } : null
    };
}

function parseFontSize(font) {
    const match = /([0-9]+(?:\.[0-9]+)?)px/.exec(font);
    if (!match) return 24;
    const value = Number.parseFloat(match[1]);
    return Number.isFinite(value) ? value : 24;
}

function computeLineHeight(font, multiplier) {
    const size = parseFontSize(font);
    const factor = Number.isFinite(multiplier) ? multiplier : 1.3;
    return Math.ceil(size * factor);
}

function applyRarityStyle(style, className) {
    const config = SHARE_IMAGE_RARITY_STYLES[className];
    if (!config) return;
    if (config.fill) {
        style.fill = config.fill;
    }
    if (config.stroke) {
        style.stroke = { ...config.stroke };
    }
    if (Array.isArray(config.shadows)) {
        style.shadowLayers.push(...config.shadows.map(cloneShareShadowLayer));
    }
}

function applyOutlineStyle(style, className) {
    const config = SHARE_IMAGE_OUTLINE_STYLES[className];
    if (!config) return;
    if (config.font) {
        style.font = config.font;
    }
    if (Number.isFinite(config.letterSpacing)) {
        style.letterSpacing = config.letterSpacing;
    }
    if (typeof config.lineHeightMultiplier === 'number') {
        style.lineHeightMultiplier = config.lineHeightMultiplier;
    }
    if (typeof config.transform === 'function') {
        style.transform = config.transform;
    }
    if (config.fill) {
        style.fill = config.fill;
    }
    if (config.stroke) {
        style.stroke = { ...config.stroke };
    }
    if (Array.isArray(config.shadows)) {
        style.shadowLayers.push(...config.shadows.map(cloneShareShadowLayer));
    }
    if (Array.isArray(config.shadowLayers)) {
        if (config.replaceShadows) {
            style.shadowLayers = config.shadowLayers.map(cloneShareShadowLayer);
        } else {
            style.shadowLayers.push(...config.shadowLayers.map(cloneShareShadowLayer));
        }
    }
}

const SHARE_IMAGE_EFFECT_HANDLERS = Object.freeze({
    'sigil-effect-oblivion': styleSet => {
        styleSet.name.shadowLayers = [
            { color: 'rgba(187, 122, 255, 0.45)', blur: 16, offsetX: 0, offsetY: 3 }
        ];
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.25);
            gradient.addColorStop(0, '#bb7aff');
            gradient.addColorStop(0.4, '#401768');
            gradient.addColorStop(1, '#26063c');
            return gradient;
        };
    },
    'sigil-effect-memory': styleSet => {
        styleSet.name.shadowLayers = [
            { color: 'rgba(200, 140, 255, 0.55)', blur: 20, offsetX: 0, offsetY: 4 }
        ];
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.3);
            gradient.addColorStop(0, '#f3d9ff');
            gradient.addColorStop(0.45, '#a26bff');
            gradient.addColorStop(1, '#3b1061');
            return gradient;
        };
    },
    'sigil-effect-neferkhaf': styleSet => {
        styleSet.name.shadowLayers = [
            { color: 'rgba(11, 8, 5, 0.82)', blur: 8, offsetX: 0, offsetY: 2 },
            { color: 'rgba(217, 170, 92, 0.55)', blur: 22, offsetX: 0, offsetY: 8 }
        ];
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.25);
            gradient.addColorStop(0, '#0b0805');
            gradient.addColorStop(0.5, '#f1d7a5');
            gradient.addColorStop(1, '#c7903e');
            return gradient;
        };
    },
    'sigil-effect-pixelation': styleSet => {
        styleSet.name.font = '700 22px "Press Start 2P", "Sarpanch", sans-serif';
        styleSet.name.letterSpacing = 2.6;
        styleSet.name.lineHeightMultiplier = 1.45;
        styleSet.name.shadowLayers = [
            { color: 'rgba(0, 0, 0, 0.85)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(255, 255, 255, 0.55)', blur: 8, offsetX: 0, offsetY: 0 }
        ];
        styleSet.name.fill = '#ff004c';
        styleSet.name.transform = text => text.toUpperCase();
    },
    'sigil-effect-megaphone': styleSet => {
        const font = '700 24px "Press Start 2P", "Sarpanch", sans-serif';
        styleSet.name.font = font;
        styleSet.name.letterSpacing = 1.8;
        styleSet.name.lineHeightMultiplier = 1.2;
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.2);
            gradient.addColorStop(0, '#a7ffe7');
            gradient.addColorStop(0.45, '#6bf5c6');
            gradient.addColorStop(1, '#38c9a2');
            return gradient;
        };
        styleSet.name.transform = text => text.toUpperCase();
        if (styleSet.subtitle) {
            styleSet.subtitle.font = '600 16px "Sarpanch", sans-serif';
            styleSet.subtitle.fill = 'rgba(140, 244, 214, 0.9)';
            styleSet.subtitle.letterSpacing = 1.2;
            styleSet.subtitle.lineHeightMultiplier = 1.2;
        }
    },
    'sigil-effect-luminosity': styleSet => {
        styleSet.name.shadowLayers = [
            { color: 'rgba(142, 230, 255, 0.85)', blur: 18, offsetX: 0, offsetY: 3 }
        ];
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.2);
            gradient.addColorStop(0, '#f7fdff');
            gradient.addColorStop(0.4, '#6ad6ff');
            gradient.addColorStop(0.7, '#e4f7ff');
            gradient.addColorStop(1, '#ffffff');
            return gradient;
        };
    },
    'sigil-effect-equinox': styleSet => {
        const font = '700 26px "Noto Serif TC", "Noto Serif", "Songti TC", serif';
        styleSet.name.font = font;
        styleSet.name.letterSpacing = Number.parseFloat((0.3 * parseFontSize(font)).toFixed(2));
        styleSet.name.lineHeightMultiplier = 1.6;
        styleSet.name.transform = text => text.toUpperCase();
        styleSet.name.shadowLayers = [
            { color: 'rgba(99, 99, 99, 0.9)', blur: 1, offsetX: 0, offsetY: 1 },
            { color: 'rgba(12, 21, 43, 0.58)', blur: 18, offsetX: 0, offsetY: 6 }
        ];
        styleSet.name.fill = '#ffffff';
        styleSet.name.decorations = {
            before: '『',
            after: '』',
            font,
            letterSpacing: 0
        };
        if (styleSet.subtitle) {
            styleSet.subtitle.font = 'italic 500 18px "Noto Serif TC", "Noto Serif", serif';
            styleSet.subtitle.fill = 'rgba(214, 228, 255, 0.78)';
            styleSet.subtitle.letterSpacing = 1.4;
            styleSet.subtitle.lineHeightMultiplier = 1.25;
        }
    },
    'sigil-effect-nyctophobia': styleSet => {
        const baseFill = SHARE_IMAGE_BASE_NAME_STYLE.fill;
        const hasCustomFill = styleSet.name.fill !== baseFill;
        styleSet.name.shadowLayers.push(
            { color: 'rgba(255, 255, 255, 0.82)', blur: 6, offsetX: 0, offsetY: 0 },
            { color: 'rgba(0, 0, 0, 0.9)', blur: 0, offsetX: 1, offsetY: 1 }
        );
        if (!hasCustomFill) {
            styleSet.name.fill = '#000000';
        }
        const nyctoFrames = [
            'N̵̮̖͎͐Y̸̱̝͕̏̔͆C̶̫̒̀͌T̵̻̪̓͛̕O̸̪͗͌͝P̷̳̙̏͘H̶͔̮͒̓͝O̵̱̲̎̽͗B̸̗̤̅͐͝I̷͎̫̠̐̏͝Ḁ̶̯̺͋',
            'N̵̗̙̊̒Y̴̢͕͕͋̑͠C̵̘͛̐͘T̴̢͉͂͌O̷̺͇̐̕̚P̵̮̾̅̓H̸̦̫̑̀͠O̸̘͚̾͂B̵̨̮̈́͌Ḭ̵̱̇̓͠A̸̯̼̓̊',
            'N̸̺̯̓̑Y̷̪͓̆̿͝C̷̼̫̍̿̚T̸̯̘̿̿̕Ǫ̶̖̅͘P̵̨̩͋͌̕H̴̰̺̎͘͝O̵̠̺̒͛͝B̴̖͕̾̑̕I̵̙̖̐͠A̵̤͕͗̒̕',
            'Ṅ̷̢̤̗Y̷̡̯͂̎͝C̷̢̛̘̏͗T̴̥͚̽̋O̷̢͖͌͘P̶̫̥͋̿H̶̖̦͂̓́O̵̪͂̍̈́B̴̥̃̔̔I̵̪̩͒̕A̷̯̞͗͠',
            'N̵͚̠̟̯͂Ỵ̷̱̊̌C̸̣̈́Ṱ̸̣̌̂̉͂O̵P̷̬͒Ḩ̷̤̉̾̀O̶͈͙̕B̸̻͑I̸͓̩̥͐̈́͝A̶̱̣̟̝̎'
        ];
        styleSet.name.transform = () => nyctoFrames[0];
        if (styleSet.subtitle) {
            styleSet.subtitle.fill = 'rgba(255, 255, 255, 0.82)';
        }
    },
    'sigil-effect-lamenthyr': styleSet => {
        const font = 'italic 700 26px "Kings", "Sarpanch", sans-serif';
        styleSet.name.font = font;
        styleSet.name.letterSpacing = Number.parseFloat((0.12 * parseFontSize(font)).toFixed(2));
        styleSet.name.lineHeightMultiplier = 1.25;
        styleSet.name.shadowLayers = [
            { color: 'rgba(0, 0, 0, 0.35)', blur: 6, offsetX: 0, offsetY: 3 }
        ];
        styleSet.name.transform = text => text.toUpperCase();
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.4);
            gradient.addColorStop(0.35, '#420000');
            gradient.addColorStop(0.5, '#ffc3b6');
            gradient.addColorStop(0.6, '#420000');
            return gradient;
        };
    },
    'sigil-effect-breakthrough': styleSet => {
        const font = '700 24px "Arial", "Sarpanch", sans-serif';
        styleSet.name.font = font;
        styleSet.name.letterSpacing = Number.parseFloat((0.1 * parseFontSize(font)).toFixed(2));
        styleSet.name.lineHeightMultiplier = 1.35;
        styleSet.name.shadowLayers = [];
        styleSet.name.transform = text => text.toUpperCase();
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.6);
            gradient.addColorStop(0.1, '#f2fdfe');
            gradient.addColorStop(0.19, '#cfd5e3');
            gradient.addColorStop(0.2, '#252a48');
            gradient.addColorStop(0.35, '#312d40');
            gradient.addColorStop(0.35, '#cdd0e9');
            gradient.addColorStop(0.4, '#c4c6e9');
            gradient.addColorStop(0.45, '#bac3f1');
            gradient.addColorStop(0.5, '#272930');
            gradient.addColorStop(0.55, '#d0d5f1');
            gradient.addColorStop(0.7, '#30303e');
            gradient.addColorStop(0.71, '#eef4fa');
            gradient.addColorStop(0.75, '#e0e6ef');
            gradient.addColorStop(0.8, '#e9ebfc');
            return gradient;
        };
    }
});

function applyEffectStyle(styleSet, effectClass) {
    const handler = SHARE_IMAGE_EFFECT_HANDLERS[effectClass];
    if (handler) {
        handler(styleSet);
    }
}

function applyEventStyle(styleSet) {
    if (!styleSet || !styleSet.name) return;
    styleSet.name.fill = '#ffffff';
    styleSet.name.stroke = { color: 'rgba(0, 0, 0, 0.82)', width: 2.2 };
    styleSet.name.shadowLayers = [
        { color: 'rgba(0, 0, 0, 0.58)', blur: 1, offsetX: 0, offsetY: 2 }
    ];
}

function ensureStyleLineHeights(styleSet) {
    if (styleSet.name) {
        styleSet.name.lineHeight = computeLineHeight(styleSet.name.font, styleSet.name.lineHeightMultiplier);
    }
    if (styleSet.prefix) {
        styleSet.prefix.lineHeight = computeLineHeight(styleSet.prefix.font, styleSet.prefix.lineHeightMultiplier);
    }
    if (styleSet.count) {
        styleSet.count.lineHeight = computeLineHeight(styleSet.count.font, styleSet.count.lineHeightMultiplier);
    }
    if (styleSet.subtitle) {
        styleSet.subtitle.lineHeight = computeLineHeight(styleSet.subtitle.font, styleSet.subtitle.lineHeightMultiplier);
    }
}

function replaceShareAuraTitle(text, displayTitle) {
    const source = typeof text === 'string' ? text : '';
    const chanceMatch = /\s+-\s+\d[\d,]*/.exec(source);
    return chanceMatch
        ? `${displayTitle}${source.slice(chanceMatch.index)}`
        : displayTitle;
}

function createWikiShareGradient(stops, angle = 180) {
    return (context, x, y, width, height) => {
        const gradient = angle === 180
            ? context.createLinearGradient(x, y, x, y + height)
            : createAngleGradient(context, x, y, width, height, angle);
        stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
        return gradient;
    };
}

function applyWikiAuraCanvasStyle(styleSet, record) {
    if (!styleSet?.name || !record?.aura?.name) return;
    const canonicalName = record.aura.name.includes(' - ')
        ? record.aura.name.split(' - ')[0].trim()
        : record.aura.name.trim();
    if (!wikiAuraSigilNames.has(canonicalName)) return;

    const nameStyle = styleSet.name;
    nameStyle.decorations = null;
    nameStyle.shadowLayers = [];
    nameStyle.stroke = null;
    nameStyle.lineHeightMultiplier = 1.4;

    const setStyle = ({ title, font, letterSpacing = 0, stops, angle = 180, stroke = null, shadows = [] }) => {
        nameStyle.font = font;
        nameStyle.letterSpacing = letterSpacing;
        nameStyle.transform = text => replaceShareAuraTitle(text, title);
        nameStyle.fill = createWikiShareGradient(stops, angle);
        nameStyle.stroke = stroke;
        nameStyle.shadowLayers = shadows;
    };

    switch (canonicalName) {
        case '★':
        case '★★':
        case '★★★':
            setStyle({
                title: canonicalName, font: '700 38px Arial, sans-serif',
                stops: [[0.25, '#ed77f8'], [0.35, '#eb75f7'], [0.4, '#ffebff'], [0.5, '#e064ef'], [0.6, '#ffedff'], [0.7, '#dc61ed'], [0.75, '#db5feb']],
                stroke: { color: '#000000', width: 0.6 }
            });
            break;
        case 'Attorney':
        case 'Verdict':
            setStyle({
                title: canonicalName.toUpperCase(), font: 'italic 700 29px "Playfair Display", serif',
                stops: [[0.37, '#48291a'], [0.4, '#c59568'], [0.42, '#fffaf4'], [0.53, '#fffaf4'], [0.55, '#c99f76'], [0.58, '#6b4023'], [0.71, '#2a2225']], angle: 175,
                stroke: { color: '#dcb79a', width: 2 }
            });
            break;
        case 'Empty':
            setStyle({
                title: 'Empty', font: 'italic 500 29px "Noto Sans TC", sans-serif',
                stops: [[0, '#ffffff'], [0.3, '#ffffff'], [0.3, '#050505'], [0.5, '#000000'], [0.5, '#d8d8d8'], [0.72, '#ffffff'], [0.72, '#050505'], [1, '#000000']], angle: 120
            });
            break;
        case 'Monarch':
            setStyle({
                title: 'MONARCH', font: 'italic 600 30px "Kings", serif', letterSpacing: 7.5,
                stops: [[0.2, '#04003b'], [0.3, '#2b04c5'], [0.5, '#010035'], [0.65, '#010035'], [0.75, '#3c08c9']], angle: 185,
                stroke: { color: '#7e3eea', width: 2 }
            });
            break;
        case 'Equinox':
            setStyle({
                title: '『EQUINOX』', font: 'italic 700 27px "Noto Serif TC", serif', letterSpacing: 5.4,
                stops: [[0.48, '#000916'], [0.5, '#ffffff']], angle: 177,
                stroke: { color: '#c9cdd2', width: 1.5 }
            });
            break;
        case 'Equinox : youareanidiot':
            setStyle({
                title: '『YOU ARE AN IDIOT』', font: 'italic 700 25px "Fuzzy Bubbles", sans-serif',
                stops: [[0.3, '#000000'], [0.47, '#060606'], [0.5, '#aaaaaa'], [0.51, '#ffffff'], [0.7, '#fdfdfd']], angle: 172,
                stroke: { color: '#c8c8c8', width: 2 }
            });
            break;
        case 'DreamCatcher':
            setStyle({
                title: 'dreamcatcher', font: '400 36px "Parisienne", cursive',
                stops: [[0.2, '#b4a7f5'], [0.3, '#fcf9ff'], [0.5, '#ffffff']],
                stroke: { color: '#7064b7', width: 1 }
            });
            break;
        case 'Dream Traveler':
            setStyle({
                title: 'Dream \u200e \u200e Traveler \u200e', font: 'italic 700 29px "Jura", sans-serif',
                stops: [[0.27, '#2e1885'], [0.33, '#c5aefe'], [0.42, '#41307a'], [0.46, '#fdeef4'], [0.52, '#f3daf3'], [0.7, '#6f1930'], [0.75, '#c26181'], [0.9, '#f1a9cb']], angle: 170,
                stroke: { color: '#b89ffa', width: 1.5 }
            });
            break;
        case 'Sky Festival':
            setStyle({
                title: '[ Sky Festival ]', font: 'italic 700 38px "Tangerine", cursive',
                stops: [[0.16, '#b7a045'], [0.24, '#544334'], [0.35, '#b79a58'], [0.41, '#7c81ff'], [0.5, '#413afc'], [0.6, '#303985'], [0.75, '#5f4cff']], angle: 170,
                stroke: { color: 'rgba(0, 0, 0, 0.55)', width: 2 }
            });
            break;
        case 'Breakthrough':
            setStyle({
                title: 'BREAKTHROUGH', font: 'italic 600 27px "Josefin Sans", sans-serif', letterSpacing: 5.4,
                stops: [[0.17, '#ffffff'], [0.25, '#323a4d'], [0.3, '#0d0d0c'], [0.38, '#fefeff'], [0.49, '#9cb2cf'], [0.57, '#0c0c0d'], [0.67, '#ffffff']], angle: 174,
                stroke: { color: '#d3e0f6', width: 1 }
            });
            break;
        case 'Y.O.L.K.E.G.G.':
            setStyle({
                title: 'Y.O.L.K.E.G.G.', font: 'italic 700 25px "Michroma", sans-serif',
                stops: [[0.25, '#9983dd'], [0.3, '#0b1adc'], [0.4, '#183fe9'], [0.48, '#2511ff'], [0.55, '#ba6dff'], [0.7, '#0c146f'], [0.82, '#7d58af']], angle: 182,
                stroke: { color: '#d4b2ff', width: 2 }
            });
            break;
        case 'Astraios':
            setStyle({
                title: 'ASTRAIOS', font: 'italic 600 29px "Playfair Display", serif', letterSpacing: 4.35,
                stops: [[0.2, '#58685d'], [0.35, '#517064'], [0.5, '#42c297'], [0.65, '#67e1c1']],
                stroke: { color: '#7a786b', width: 2 }
            });
            break;
        case 'Leviathan':
            setStyle({
                title: 'LEVIATHAN', font: '600 29px "Playfair Display", serif', letterSpacing: 4.35,
                stops: [[0.3, '#4dd0cc'], [0.38, '#153a3e'], [0.4, '#9dfdfd'], [0.5, '#124245'], [0.52, '#2ed4d2'], [0.8, '#518488']], angle: 178,
                stroke: { color: '#21474a', width: 2.5 }
            });
            break;
        case 'Winter Garden':
            setStyle({
                title: 'Winter Garden', font: '600 36px "Parisienne", cursive',
                stops: [[0.2, '#a2b9ea'], [0.35, '#8980ff'], [0.5, '#7c68cf'], [0.75, '#e0d8fa']],
                stroke: { color: '#302544', width: 2 }
            });
            break;
        case 'Luminosity':
            setStyle({
                title: '[ LUMINOSITY ]', font: 'italic 600 31px "Kings", serif', letterSpacing: 5.2,
                stops: [[0.3, '#8dbbed'], [0.4, '#7e9fe1'], [0.55, '#14232c'], [0.6, '#d2e4fb'], [0.65, '#203976'], [0.7, '#6ca1e7']],
                stroke: { color: '#dcecff', width: 2 }
            });
            break;
        case 'Erebus':
            setStyle({
                title: 'EREBUS', font: 'italic 700 29px "Noto Serif TC", serif',
                stops: [[0.2, '#523123'], [0.3, '#882b19'], [0.45, '#801b1b'], [0.5, '#c03946'], [0.67, '#6c1730'], [0.75, '#850546']],
                stroke: { color: '#44150e', width: 2 }
            });
            break;
        case 'Aegis : Eggis':
            setStyle({
                title: '✿ EGGIS ✿', font: 'italic 700 29px "Playfair Display", serif',
                stops: [[0.3, '#f7fff3'], [0.38, '#daffd4'], [0.42, '#4a8f46'], [0.5, '#f1ffef'], [0.6, '#bf5d0c'], [0.7, '#fffff2'], [0.8, '#fffad9']],
                stroke: { color: 'rgba(9, 13, 2, 0.7)', width: 2 }
            });
            break;
        case 'Pixelation':
            setStyle({
                title: '▣ PIXELATION ▣', font: 'italic 700 22px "Press Start 2P", monospace',
                stops: [[0, '#e24545'], [0.25, '#8edd7c'], [0.5, '#4082e5'], [0.75, '#9456e9'], [1, '#e21d5c']], angle: 90,
                stroke: { color: '#000000', width: 1.5 }
            });
            break;
        case 'Nyctophobia':
            setStyle({
                title: 'nyctophobia', font: 'italic 100 28px "Roboto Mono", monospace', letterSpacing: 11.2,
                stops: [[0, '#f9f9fa'], [1, '#f9f9fa']],
                shadows: [{ color: 'rgba(0, 0, 0, 0.85)', blur: 2, offsetX: 1, offsetY: 1 }]
            });
            break;
        case 'Lamenthyr':
            setStyle({
                title: 'LAMENTHYR', font: 'italic 700 29px "Kings", serif',
                stops: [[0.35, '#420000'], [0.45, '#420000'], [0.5, '#ffc3b6'], [0.6, '#420000']], angle: 178,
                stroke: { color: '#b6322c', width: 2 }
            });
            break;
        case "A Fool's Experience":
            setStyle({
                title: "A fool's experience...", font: '700 25px "Sarpanch", sans-serif',
                stops: [[0.3, '#effdff'], [0.65, '#a8d5fd']],
                stroke: { color: '#2f4d6f', width: 2 }
            });
            break;
        case 'P.U.K.E.K.O.G.O.D.':
            setStyle({
                title: 'P. U. K. E. K. O. G. O. D.', font: '700 25px "Jura", sans-serif',
                stops: [[0, '#9f0924'], [.25, '#b4143c'], [.5, '#f694b1'], [.75, '#a91241'], [1, '#811d3a']],
                stroke: { color: '#6f2636', width: 1 }
            });
            break;
        case 'Eostre':
            setStyle({
                title: 'Eostre', font: '700 40px "Tangerine", cursive',
                stops: [[0.3, '#d6f9c2'], [.59, '#cbf8af'], [.6, '#8ade5f'], [.7, '#b3f06f']]
            });
            break;
        case 'Sovereign : Frostveil':
            setStyle({
                title: 'SOVEREIGN : Frostveil', font: '600 32px "Kings", serif',
                stops: [[.3, '#c4c4ff'], [.5, '#6390ef'], [.65, '#bdf8ff']],
                stroke: { color: '#123c76', width: 2.5 }
            });
            break;
        case 'Ascendant':
            setStyle({
                title: 'ASCENDANT', font: 'italic 600 29px "Playfair Display", serif',
                stops: [[.25, '#ffeddd'], [.3, '#fffff7'], [.42, '#fff8dc'], [.6, '#fff3d1'], [.63, '#f3b07e'], [.66, '#47130e'], [.75, '#fff3d2'], [.84, '#ffcd9b']],
                stroke: { color: '#7c321c', width: 1.5 }
            });
            break;
    }
}

function computeAuraCanvasStyles(record) {
    const baseStyles = {
        name: cloneShareStyle(SHARE_IMAGE_BASE_NAME_STYLE),
        prefix: cloneShareStyle(SHARE_IMAGE_BASE_PREFIX_STYLE),
        count: cloneShareStyle(SHARE_IMAGE_BASE_COUNT_STYLE),
        subtitle: record && record.subtitle ? cloneShareStyle(SHARE_IMAGE_BASE_SUBTITLE_STYLE) : null
    };

    if (record && record.classes) {
        if (record.classes.rarity) {
            applyRarityStyle(baseStyles.name, record.classes.rarity);
        }

        if (Array.isArray(record.classes.special) && record.classes.special.length > 0) {
            record.classes.special
                .filter(token => token.startsWith('sigil-outline-'))
                .forEach(token => applyOutlineStyle(baseStyles.name, token));

            record.classes.special
                .filter(token => token.startsWith('sigil-effect-'))
                .forEach(token => applyEffectStyle(baseStyles, token));
        }

        if (record.classes.event && (!Array.isArray(record.classes.special) || record.classes.special.length === 0)) {
            applyEventStyle(baseStyles);
        }
    }

    if (Array.isArray(record?.classes?.special) && record.classes.special.includes('sigil-outline-leviathan')) {
        const font = '600 28px "Playfair Display", "Sarpanch", serif';
        baseStyles.name.font = font;
        baseStyles.name.letterSpacing = Number.parseFloat((0.15 * parseFontSize(font)).toFixed(2));
        baseStyles.name.transform = text => text.toUpperCase();
    }

    applyWikiAuraCanvasStyle(baseStyles, record);

    if (record && record.prefix) {
        baseStyles.prefix = cloneShareStyle(baseStyles.name);
        baseStyles.prefix.font = baseStyles.name.font;
        baseStyles.prefix.letterSpacing = baseStyles.name.letterSpacing || 0;
        baseStyles.prefix.lineHeightMultiplier = baseStyles.name.lineHeightMultiplier;
    }

    ensureStyleLineHeights(baseStyles);
    return baseStyles;
}

function measureStyledSegmentWidth(context, text, style) {
    if (!text || !style) return 0;
    context.save();
    context.font = style.font;
    let width = 0;
    if (style.letterSpacing && style.letterSpacing !== 0) {
        const spacing = style.letterSpacing;
        for (let i = 0; i < text.length; i++) {
            width += context.measureText(text[i]).width;
            if (i < text.length - 1) {
                width += spacing;
            }
        }
    } else {
        width = context.measureText(text).width;
    }
    context.restore();
    return width;
}

function measureStyledTextWidth(context, text, style) {
    if (!text || !style) return 0;
    const segments = [];
    const baseText = style.transform ? style.transform(text) : text;
    if (style.decorations && style.decorations.before) {
        segments.push({
            text: style.decorations.before,
            style: {
                ...style,
                font: style.decorations.font || style.font,
                letterSpacing: style.decorations.letterSpacing ?? style.letterSpacing ?? 0,
                decorations: null,
                transform: null
            }
        });
    }
    segments.push({
        text: baseText,
        style: { ...style, decorations: null }
    });
    if (style.decorations && style.decorations.after) {
        segments.push({
            text: style.decorations.after,
            style: {
                ...style,
                font: style.decorations.font || style.font,
                letterSpacing: style.decorations.letterSpacing ?? style.letterSpacing ?? 0,
                decorations: null,
                transform: null
            }
        });
    }

    return segments.reduce((total, segment) => total + measureStyledSegmentWidth(context, segment.text, segment.style), 0);
}

function drawTextWithSpacing(context, text, x, y, letterSpacing) {
    if (!text) return;
    if (!letterSpacing) {
        context.fillText(text, x, y);
        return;
    }
    let cursor = x;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        context.fillText(char, cursor, y);
        cursor += context.measureText(char).width;
        if (i < text.length - 1) {
            cursor += letterSpacing;
        }
    }
}

function strokeTextWithSpacing(context, text, x, y, letterSpacing) {
    if (!text) return;
    if (!letterSpacing) {
        context.strokeText(text, x, y);
        return;
    }
    let cursor = x;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        context.strokeText(char, cursor, y);
        cursor += context.measureText(char).width;
        if (i < text.length - 1) {
            cursor += letterSpacing;
        }
    }
}

function resolveFillStyle(style, context, x, y, width, height) {
    if (typeof style.fill === 'function') {
        return style.fill(context, x, y, width, height);
    }
    return style.fill || '#ffffff';
}

function renderStyledSegment(context, text, x, y, style) {
    if (!text || !style) return 0;
    context.save();
    context.font = style.font;
    const letterSpacing = style.letterSpacing || 0;
    const width = measureStyledSegmentWidth(context, text, { ...style, decorations: null, transform: null });
    const fill = resolveFillStyle(style, context, x, y, width, style.lineHeight || computeLineHeight(style.font));

    if (Array.isArray(style.shadowLayers) && style.shadowLayers.length > 0) {
        for (const layer of style.shadowLayers) {
            context.shadowColor = layer.color || 'rgba(0, 0, 0, 0)';
            context.shadowBlur = layer.blur ?? 0;
            context.shadowOffsetX = layer.offsetX ?? 0;
            context.shadowOffsetY = layer.offsetY ?? 0;
            context.fillStyle = layer.fill || fill;
            drawTextWithSpacing(context, text, x, y, letterSpacing);
        }
    }

    if (style.stroke && typeof style.stroke.color === 'string' && Number.isFinite(style.stroke.width)) {
        context.shadowColor = 'rgba(0, 0, 0, 0)';
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.strokeStyle = style.stroke.color;
        context.lineWidth = style.stroke.width;
        context.lineJoin = 'round';
        context.miterLimit = 2;
        strokeTextWithSpacing(context, text, x, y, letterSpacing);
    }

    if (style.baseShadow) {
        context.shadowColor = style.baseShadow.color || 'rgba(0, 0, 0, 0)';
        context.shadowBlur = style.baseShadow.blur ?? 0;
        context.shadowOffsetX = style.baseShadow.offsetX ?? 0;
        context.shadowOffsetY = style.baseShadow.offsetY ?? 0;
    } else {
        context.shadowColor = 'rgba(0, 0, 0, 0)';
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
    }

    context.fillStyle = fill;
    drawTextWithSpacing(context, text, x, y, letterSpacing);
    context.restore();
    return width;
}

function renderStyledText(context, text, x, y, style) {
    if (!text || !style) return 0;
    const segments = [];
    const baseText = style.transform ? style.transform(text) : text;
    if (style.decorations && style.decorations.before) {
        segments.push({
            text: style.decorations.before,
            style: {
                ...style,
                font: style.decorations.font || style.font,
                letterSpacing: style.decorations.letterSpacing ?? style.letterSpacing ?? 0,
                decorations: null,
                transform: null
            }
        });
    }
    segments.push({ text: baseText, style: { ...style, decorations: null } });
    if (style.decorations && style.decorations.after) {
        segments.push({
            text: style.decorations.after,
            style: {
                ...style,
                font: style.decorations.font || style.font,
                letterSpacing: style.decorations.letterSpacing ?? style.letterSpacing ?? 0,
                decorations: null,
                transform: null
            }
        });
    }

    let cursorX = x;
    for (const segment of segments) {
        cursorX += renderStyledSegment(context, segment.text, cursorX, y, segment.style);
    }
    return cursorX - x;
}

function createAngleGradient(context, x, y, width, height, angleDeg) {
    const radians = (angleDeg * Math.PI) / 180;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const halfDiagonal = Math.sqrt(width * width + height * height) / 2;
    const dx = Math.cos(radians) * halfDiagonal;
    const dy = Math.sin(radians) * halfDiagonal;
    return context.createLinearGradient(centerX - dx, centerY - dy, centerX + dx, centerY + dy);
}

function createAuraBlock(context, record) {
    const styles = computeAuraCanvasStyles(record);
    const prefixText = record && record.prefix ? `${record.prefix}` : '';
    const nameText = record && record.displayName ? record.displayName : '';
    const subtitleText = record && record.subtitle ? record.subtitle : '';
    const countText = record && record.countLabel ? record.countLabel : '';
    const hasBreakthroughBorder = Boolean(record?.classes?.special?.includes('sigil-border-breakthrough'));
    const hasBreakthroughEffect = Boolean(record?.classes?.special?.includes('sigil-effect-breakthrough'));
    const [breakthroughTitle, ...breakthroughSuffixParts] = hasBreakthroughEffect ? nameText.split(' - ') : [nameText];
    const breakthroughSuffix = hasBreakthroughEffect && breakthroughSuffixParts.length > 0
        ? ` - ${breakthroughSuffixParts.join(' - ')}`
        : '';
    const breakthroughSuffixStyle = hasBreakthroughEffect
        ? {
            ...styles.name,
            letterSpacing: 0,
            transform: null
        }
        : null;

    const prefixWidth = prefixText ? measureStyledTextWidth(context, prefixText, styles.prefix) : 0;
    const prefixGap = prefixText ? 12 : 0;
    const breakthroughTitleWidth = hasBreakthroughEffect
        ? measureStyledTextWidth(context, breakthroughTitle, styles.name)
        : 0;
    const breakthroughSuffixWidth = hasBreakthroughEffect && breakthroughSuffixStyle
        ? measureStyledTextWidth(context, breakthroughSuffix, breakthroughSuffixStyle)
        : 0;
    const nameWidth = hasBreakthroughEffect
        ? breakthroughTitleWidth + breakthroughSuffixWidth
        : measureStyledTextWidth(context, nameText, styles.name);
    const combinedNameWidth = prefixWidth + prefixGap + nameWidth;
    const nameLineHeight = styles.name.lineHeight;
    const countLineHeight = countText ? styles.count.lineHeight : 0;
    const countGap = countText ? 28 : 0;
    const subtitleLineHeight = subtitleText && styles.subtitle ? styles.subtitle.lineHeight : 0;

    const firstLineHeight = Math.max(nameLineHeight, countLineHeight);
    const contentHeight = firstLineHeight + subtitleLineHeight;

    return {
        contentHeight,
        gapAfter: 22,
        draw(ctx, x, y) {
            let currentY = y;
            const nameX = prefixText ? x + prefixWidth + prefixGap : x;
            if (hasBreakthroughBorder) {
                ctx.save();
                ctx.font = styles.name.font;
                const metricsText = nameText || prefixText || '';
                const metrics = metricsText ? ctx.measureText(metricsText) : { actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 };
                const fontSize = parseFontSize(styles.name.font);
                const padding = Math.ceil(fontSize * 0.1);
                const ascent = metrics.actualBoundingBoxAscent || Math.ceil(fontSize * 0.8);
                const descent = metrics.actualBoundingBoxDescent || Math.ceil(fontSize * 0.2);
                const borderWidth = 1;
                const boxX = x - padding;
                const boxY = currentY - ascent - padding;
                const boxWidth = combinedNameWidth + padding * 2;
                const boxHeight = ascent + descent + padding * 2;
                const innerX = boxX + borderWidth;
                const innerY = boxY + borderWidth;
                const innerWidth = boxWidth - borderWidth * 2;
                const innerHeight = boxHeight - borderWidth * 2;
                const bgGradient = createAngleGradient(ctx, innerX, innerY, innerWidth, innerHeight, 150);
                bgGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
                bgGradient.addColorStop(0.15, 'rgba(0, 0, 0, 0)');
                bgGradient.addColorStop(0.25, '#00000d');
                bgGradient.addColorStop(1, '#00000d');
                ctx.fillStyle = bgGradient;
                ctx.fillRect(innerX, innerY, innerWidth, innerHeight);

                const borderGradient = createAngleGradient(ctx, boxX, boxY, boxWidth, boxHeight, 290);
                borderGradient.addColorStop(0.05, '#666680');
                borderGradient.addColorStop(0.1, '#636c88');
                borderGradient.addColorStop(0.2, 'rgba(0, 0, 0, 0)');
                borderGradient.addColorStop(0.9, 'rgba(0, 0, 0, 0)');
                borderGradient.addColorStop(0.95, 'rgba(132, 135, 157, 0.7)');
                borderGradient.addColorStop(1, 'rgba(132, 135, 157, 0.7)');
                ctx.strokeStyle = borderGradient;
                ctx.lineWidth = borderWidth;
                ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);
                ctx.restore();
            }
            if (prefixText) {
                renderStyledText(ctx, prefixText, x, currentY, styles.prefix);
            }
            if (hasBreakthroughEffect) {
                renderStyledText(ctx, breakthroughTitle, nameX, currentY, styles.name);
                if (breakthroughSuffix && breakthroughSuffixStyle) {
                    renderStyledText(ctx, breakthroughSuffix, nameX + breakthroughTitleWidth, currentY, breakthroughSuffixStyle);
                }
            } else {
                renderStyledText(ctx, nameText, nameX, currentY, styles.name);
            }
            if (countText) {
                const countX = nameX + nameWidth + countGap;
                renderStyledText(ctx, countText, countX, currentY, styles.count);
            }
            currentY += firstLineHeight;
            if (subtitleText && styles.subtitle) {
                renderStyledText(ctx, subtitleText, nameX, currentY, styles.subtitle);
                currentY += subtitleLineHeight;
            }
        }
    };
}

async function ensureShareFontsLoaded() {
    if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.load !== 'function') {
        return;
    }
    const requests = [
        document.fonts.load('700 48px "Sarpanch"'),
        document.fonts.load('600 28px "Sarpanch"'),
        document.fonts.load('500 22px "Sarpanch"'),
        document.fonts.load('italic 500 20px "Sarpanch"'),
        document.fonts.load('600 28px "Playfair Display"'),
        document.fonts.load('700 26px "Noto Serif TC"'),
        document.fonts.load('700 22px "Press Start 2P"'),
        document.fonts.load('600 35px "Parisienne"'),
        document.fonts.load('700 italic 35px "Jura"'),
        document.fonts.load('600 34px "Kings"')
    ];
    try {
        await Promise.allSettled(requests);
    } catch (error) {
        console.warn('Font loading for share image failed', error);
    }
}



async function generateShareImage(summary, mode = 'download') {
    if (typeof document === 'undefined') {
        return false;
    }

    await ensureShareFontsLoaded();

    const canvas = document.createElement('canvas');
    const width = 1260;
    canvas.width = width;
    let context = canvas.getContext('2d');
    if (!context) {
        return false;
    }

    const margin = 64;
    const maxWidth = width - margin * 2;
    const headerFont = '700 48px "Sarpanch", sans-serif';
    const detailFont = '500 26px "Sarpanch", sans-serif';
    const auraFont = '400 22px "Noto Serif TC", serif';
    const milestoneFont = '500 22px "Sarpanch", sans-serif';

    const eventSummary = summary.eventLabels && summary.eventLabels.length > 0
        ? summary.eventLabels.join(', ')
        : EVENT_SUMMARY_EMPTY_LABEL;
    const auraFilterSummary = summary.auraFilterSummary || getAuraFilterSummaryText();
    const luckSummary = summary.luckLabel || formatWithCommas(summary.luck);
    const potionSummary = Array.isArray(summary.potionBatches) && summary.potionBatches.length > 0
        ? formatPotionBatchList(summary.potionBatches, { includeLuck: true })
        : null;

    const detailEntries = [
        `Rolls: ${formatWithCommas(summary.rolls)}`,
        `Potion Mode: ${summary.potionMode === POTION_SIMULATION_MODE.MULTIPLE ? 'Multiple' : 'Single'}`,
        ...(summary.potionMode === POTION_SIMULATION_MODE.MULTIPLE
            ? [`Compatible Potion Stacking: ${summary.potionStackingEnabled ? 'Enabled' : 'Disabled'}`]
            : []),
        ...(summary.potionMode === POTION_SIMULATION_MODE.MULTIPLE
            ? [`Device Preset: ${summary.devicePresetName || 'None'}`]
            : []),
        ...(potionSummary ? [`Potions: ${potionSummary}`] : []),
        `Luck: ${luckSummary}`,
        `Biome: ${summary.biomeLabel}`,
        `Rune: ${summary.runeLabel || 'None'}`,
        `Time: ${summary.timeLabel || 'Neutral'}`,
        `Events: ${eventSummary}`,
        `Included Aura Tiers: ${auraFilterSummary}`,
        `Duration: ${Math.max(0, Math.round(summary.executionSeconds))}s`,
        `Total XP: ${formatWithCommas(summary.xpTotal)}`
    ];

    const milestoneEntries = summary.xpLines && summary.xpLines.length > 0
        ? summary.xpLines.slice()
        : [];

    const auraVisuals = Array.isArray(summary.shareVisuals) && summary.shareVisuals.length > 0
        ? summary.shareVisuals.slice()
        : null;

    const drawQueue = [];
    drawQueue.push({ type: 'text', text: 'Sols Roll Result', font: headerFont, color: '#f6fbff', lineHeight: 58 });
    drawQueue.push({ type: 'spacer', size: 22 });

    context.font = detailFont;
    detailEntries.forEach(entry => {
        wrapTextLines(context, entry, maxWidth).forEach(line => {
            drawQueue.push({ type: 'text', text: line, font: detailFont, color: '#cfe7ff', lineHeight: 36 });
        });
    });

    drawQueue.push({ type: 'spacer', size: 30 });
    drawQueue.push({ type: 'text', text: 'Auras Rolled', font: detailFont, color: '#f6c361', lineHeight: 36 });

    const auraBlocks = [];
    if (auraVisuals && auraVisuals.length > 0) {
        auraVisuals.forEach(record => {
            const block = createAuraBlock(context, record);
            auraBlocks.push(block);
        });
        if (auraBlocks.length > 0) {
            auraBlocks[auraBlocks.length - 1].gapAfter = 0;
            auraBlocks.forEach(block => {
                drawQueue.push({ type: 'aura', block });
            });
        }
    } else {
        const fallbackAuras = summary.shareRecords && summary.shareRecords.length > 0
            ? summary.shareRecords.slice()
            : ['No auras were rolled.'];
        context.font = auraFont;
        fallbackAuras.forEach(entry => {
            wrapTextLines(context, entry, maxWidth).forEach(line => {
                drawQueue.push({ type: 'text', text: line, font: auraFont, color: '#ffffff', lineHeight: 32 });
            });
        });
    }

    if (milestoneEntries.length > 0) {
        drawQueue.push({ type: 'spacer', size: 30 });
        drawQueue.push({ type: 'text', text: 'Milestones', font: detailFont, color: '#7fe3ff', lineHeight: 36 });
        context.font = milestoneFont;
        milestoneEntries.forEach(entry => {
            wrapTextLines(context, entry, maxWidth).forEach(line => {
                drawQueue.push({ type: 'text', text: line, font: milestoneFont, color: '#dbefff', lineHeight: 32 });
            });
        });
    }

    let totalHeight = margin;
    drawQueue.forEach(command => {
        if (command.type === 'spacer') {
            totalHeight += command.size;
        } else if (command.type === 'aura') {
            totalHeight += command.block.contentHeight + command.block.gapAfter;
        } else {
            totalHeight += command.lineHeight;
        }
    });
    totalHeight += margin;

    canvas.height = Math.max(560, Math.ceil(totalHeight));
    context = canvas.getContext('2d');
    if (!context) {
        return false;
    }

    const gradient = context.createLinearGradient(0, 0, width, canvas.height);
    gradient.addColorStop(0, '#050a18');
    gradient.addColorStop(1, '#0b1530');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, canvas.height);

    context.strokeStyle = 'rgba(127, 227, 255, 0.45)';
    context.lineWidth = 2;
    context.strokeRect(margin - 30, margin - 30, width - (margin - 30) * 2, canvas.height - (margin - 30) * 2);

    context.textBaseline = 'top';

    let cursorY = margin;
    drawQueue.forEach(command => {
        if (command.type === 'spacer') {
            cursorY += command.size;
            return;
        }
        if (command.type === 'aura') {
            command.block.draw(context, margin, cursorY);
            cursorY += command.block.contentHeight + command.block.gapAfter;
            return;
        }
        context.font = command.font;
        context.fillStyle = command.color;
        context.fillText(command.text, margin, cursorY);
        cursorY += command.lineHeight;
    });

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
        return 'failed';
    }

    let fallbackFromCopy = false;
    if (mode === 'copy') {
        const copied = await copyImageBlobToClipboard(blob);
        if (copied) {
            return 'copied';
        }
        mode = 'download';
        fallbackFromCopy = true;
    }

    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'sols-roll-result.png';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    } finally {
        if (typeof window !== 'undefined') {
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
            URL.revokeObjectURL(url);
        }
    }

    if (mode === 'download') {
        return fallbackFromCopy ? 'downloaded-fallback' : 'downloaded';
    }
    return 'failed';
}

function wrapTextLines(context, text, maxWidth) {
    const sanitized = typeof text === 'string' ? text : String(text ?? '');
    const baseLines = sanitized.split(/\n/);
    const lines = [];

    baseLines.forEach(segment => {
        const words = segment.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            lines.push('');
            return;
        }

        let currentLine = '';
        words.forEach(word => {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (context.measureText(candidate).width <= maxWidth) {
                currentLine = candidate;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                }
                currentLine = word;
            }
        });

        if (currentLine) {
            lines.push(currentLine);
        }
    });

    return lines;
}
