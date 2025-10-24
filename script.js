// Reference frequently accessed UI elements at module load
let feedContainer = document.getElementById('simulation-feed');
let luckField = document.getElementById('luck-total');
let simulationActive = false;

const selectWidgetRegistry = new Map();

const decimalFormatter = new Intl.NumberFormat();
const formatWithCommas = value => decimalFormatter.format(value);

const uiHandles = {
    rollTriggerButton: document.querySelector('.roll-trigger'),
    brandMark: document.querySelector('.banner__emblem'),
    rollCountInput: document.getElementById('roll-total'),
    biomeSelector: document.getElementById('biome-dropdown'),
    progressPanel: document.querySelector('.loading-indicator'),
    progressBarFill: document.querySelector('.loading-indicator__fill'),
    progressLabel: document.querySelector('.loading-indicator__value'),
    audio: {
        roll: document.getElementById('rollLoopSound'),
        k1: document.getElementById('thousandSound'),
        k10: document.getElementById('tenThousandSound'),
        k100: document.getElementById('hundredThousandSound'),
        m10: document.getElementById('tenMillionSound'),
        m100: document.getElementById('hundredMillionSound'),
        limbo99m: document.getElementById('limbo99mSoundFx')
    }
};

const OBLIVION_PRESET_IDENTIFIER = 'oblivion';
const OBLIVION_LUCK_TARGET = 600000;
const OBLIVION_AURA_LABEL = 'Oblivion';
const MEMORY_AURA_LABEL = 'Memory';
const OBLIVION_POTION_ODDS = 2000;
const OBLIVION_MEMORY_ODDS = 100;

let oblivionPresetEnabled = false;
let currentOblivionPresetLabel = 'Select preset';
let oblivionAuraData = null;
let memoryAuraData = null;

function handleOblivionPresetSelection(presetKey) {
    const options = {};
    if (presetKey === OBLIVION_PRESET_IDENTIFIER) {
        options.activateOblivionPreset = true;
        options.presetLabel = 'Oblivion Potion Preset';
    } else {
        options.activateOblivionPreset = false;
        options.presetLabel = 'Godlike + Heavenly + Bound';
    }

    applyLuckValue(OBLIVION_LUCK_TARGET, options);

    const dropdown = document.getElementById('oblivion-preset-menu');
    if (dropdown) {
        dropdown.open = false;
        const summary = dropdown.querySelector('.preset-toggle__summary');
        if (summary) {
            summary.focus();
        }
    }
}

function updateOblivionPresetDisplay() {
    const selection = document.getElementById('oblivion-preset-label');
    if (selection) {
        selection.textContent = currentOblivionPresetLabel;
        selection.classList.toggle('preset-toggle__selection--placeholder', currentOblivionPresetLabel === 'Select preset');
    }
}

function applyOblivionPresetOptions(options = {}) {
    oblivionPresetEnabled = options.activateOblivionPreset === true;

    if (typeof options.presetLabel === 'string') {
        currentOblivionPresetLabel = options.presetLabel;
    } else {
        currentOblivionPresetLabel = 'Select preset';
    }

    updateOblivionPresetDisplay();
}

function formatAuraNameMarkup(aura, overrideName) {
    if (!aura) return overrideName || '';
    const baseName = typeof overrideName === 'string' && overrideName.length > 0 ? overrideName : aura.name;
    if (aura.subtitle) {
        return `${baseName} <span class="sigil-subtitle">${aura.subtitle}</span>`;
    }
    return baseName;
}

function determineResultPriority(aura, baseChance) {
    if (!aura) return baseChance;
    if (aura.name === OBLIVION_AURA_LABEL) return Number.POSITIVE_INFINITY;
    if (aura.name === MEMORY_AURA_LABEL) return Number.MAX_SAFE_INTEGER;
    return baseChance;
}

const AURA_LIBRARY = [
    { name: "Oblivion", chance: 2000, requiresOblivionPreset: true, ignoreLuck: true, fixedRollThreshold: 1, subtitle: "The Truth Seeker", cutscene: "oblivion-cutscene", disableRarityClass: true },
    { name: "Memory", chance: 200000, requiresOblivionPreset: true, ignoreLuck: true, fixedRollThreshold: 1, subtitle: "The Fallen", cutscene: "memory-cutscene", disableRarityClass: true },
    { name: "Equinox - 2,500,000,000", chance: 2500000000, cutscene: "equinox-cutscene" },
    { name: "Luminosity - 1,200,000,000", chance: 1200000000, cutscene: "luminosity-cutscene" },
    { name: "Erebus - 1,200,000,000", chance: 1200000000, exclusiveTo: ["glitch", "bloodRain"], cutscene: "erebus-cutscene" },
    { name: "Pixelation - 1,073,741,824", chance: 1073741824, cutscene: "pixelation-cutscene" },
    { name: "Lamenthyr - 1,000,000,000", chance: 1000000000, exclusiveTo: ["glitch", "bloodRain"], cutscene: "lamenthyr-cutscene" },
    { name: "Arachnophobia - 940,000,000", chance: 940000000, exclusiveTo: ["glitch", "pumpkinMoon"] },
    { name: "Ravage - 930,000,000", chance: 930000000, exclusiveTo: ["glitch", "graveyard"] },
    { name: "Dreamscape - 850,000,000", chance: 850000000, exclusiveTo: ["limbo"] },
    { name: "Aegis - 825,000,000", chance: 825000000 },
    { name: "Aegis : Watergun - 825,000,000", chance: 825000000, breakthrough: { blazing: 2 }},
    { name: "Apostolos : Veil - 800,000,000", chance: 800000000, exclusiveTo: ["graveyard", "pumpkinMoon"] },
    { name: "Ruins : Withered - 800,000,000", chance: 800000000 },
    { name: "Sovereign - 750,000,000", chance: 750000000 },
    { name: "Malediction - 730,000,000", chance: 730000000, exclusiveTo: ["glitch", "bloodRain"] },
    { name: "Banshee - 730,000,000", chance: 730000000, exclusiveTo: ["glitch", "graveyard"] },
    { name: "PROLOGUE - 666,616,111", chance: 666616111, exclusiveTo: ["limbo"] },
    { name: "Harvester - 666,000,000", chance: 666000000, exclusiveTo: ["graveyard"] },
    { name: "Apocalypse - 624,000,000", chance: 624000000, exclusiveTo: ["glitch", "graveyard"] },
    { name: "Matrix : Reality - 601,020,102", chance: 601020102 },
    { name: "Sophyra - 570,000,000", chance: 570000000 },
    { name: "Elude - 555,555,555", chance: 555555555, exclusiveTo: ["limbo"] },
    { name: "Dreammetric - 520,000,000", chance: 520000000, exclusiveTo: ["glitch", "dreamspace"], cutscene: "dreammetric-cutscene" },
    { name: "Atlas : Yuletide - 510,000,000", chance: 510000000, breakthrough: { snowy: 3 } },
    { name: "Matrix : Overdrive - 503,000,000", chance: 503000000 },
    { name: "Ruins - 500,000,000", chance: 500000000 },
    { name: "Phantasma - 462,600,000", chance: 462600000, exclusiveTo: ["glitch", "pumpkinMoon"] },
    { name: "Kyawthuite : Remembrance - 450,000,000", chance: 450000000 },
    { name: "unknown - 444,444,444", chance: 444444444, exclusiveTo: ["limbo"] },
    { name: "Apostolos - 444,000,000", chance: 444000000 },
    { name: "Gargantua - 430,000,000", chance: 430000000, breakthrough: { starfall: 5 } },
    { name: "Abyssal Hunter - 400,000,000", chance: 400000000, breakthrough: { rainy: 4 } },
    { name: "Impeached : I'm Peach - 400,000,000", chance: 400000000 },
    { name: "CHILLSEAR - 375,000,000", chance: 375000000, breakthrough: { snowy: 3 } },
    { name: "Flora : Evergreen - 370,073,730", chance: 370073730 },
    { name: "Atlas - 360,000,000", chance: 360000000, breakthrough: { sandstorm: 4 } },
    { name: "Jazz : Orchestra - 336,870,912", chance: 336870912 },
    { name: "LOTUSFALL - 320,000,000", chance: 320000000 },
    { name: "Maelstrom - 309,999,999", chance: 309999999, breakthrough: { windy: 3 } },
    { name: "Manta - 300,000,000", chance: 300000000, breakthrough: { blazing: 2 } },
    { name: "Overture : History - 300,000,000", chance: 300000000 },
    { name: "Bloodlust - 300,000,000", chance: 300000000, breakthrough: { hell: 6 } },
    { name: "Exotic : Void - 299,999,999", chance: 299999999 },
    { name: "Astral : Legendarium - 267,200,000", chance: 267200000, breakthrough: { starfall: 5 } },
    { name: "Archangel - 250,000,000", chance: 250000000 },
    { name: "Surfer : Shard Surfer - 225,000,000", chance: 225000000, breakthrough: { snowy: 3 } },
    { name: "HYPER-VOLT : EVER-STORM - 225,000,000", chance: 225000000 },
    { name: "Oppression - 220,000,000", chance: 220000000, exclusiveTo: ["glitch"], cutscene: "oppression-cutscene" },
    { name: "Impeached - 200,000,000", chance: 200000000, breakthrough: { corruption: 5 } },
    { name: "Nightmare Sky - 190,000,000", chance: 190000000, exclusiveTo: ["pumpkinMoon"] },
    { name: "Twilight : Withering Grace - 180,000,000", chance: 180000000, breakthrough: { night: 10 } },
    { name: "Symphony - 175,000,000", chance: 175000000 },
    { name: "Glock : the glock of the sky - 170,000,000", chance: 170000000 },
    { name: "Overture - 150,000,000", chance: 150000000 },
    { name: "Abominable - 120,000,000", chance: 120000000, breakthrough: { snowy: 3 } },
    { name: "Starscourge : Radiant - 100,000,000", chance: 100000000, breakthrough: { starfall: 5 } },
    { name: "Chromatic : GENESIS - 99,999,999", chance: 99999999 },
    { name: "Express - 90,000,000", chance: 90000000, breakthrough: { snowy: 3 } },
    { name: "Virtual : Worldwide - 87,500,000", chance: 87500000 },
    { name: "Harnessed : Elements - 85,000,000", chance: 85000000 },
    { name: "Accursed - 82,000,000", chance: 82000000, exclusiveTo: ["glitch", "bloodRain"] },
    { name: "Sailor : Flying Dutchman - 80,000,000", chance: 80000000, breakthrough: { rainy: 4 } },
    { name: "Carriage - 80,000,000", chance: 80000000 },
    { name: "Winter Fantasy - 72,000,000", chance: 72000000, breakthrough: { snowy: 3 } },
    { name: "Dullahan - 72,000,000", chance: 72000000, exclusiveTo: ["graveyard"] },
    { name: "Twilight : Iridescent Memory - 60,000,000", chance: 60000000, breakthrough: { night: 10 } },
    { name: "SENTINEL - 60,000,000", chance: 60000000 },
    { name: "Matrix - 50,000,000", chance: 50000000 },
    { name: "Runic - 50,000,000", chance: 50000000 },
    { name: "Exotic : APEX - 49,999,500", chance: 49999500 },
    { name: "Overseer - 45,000,000", chance: 45000000 },
    { name: "Santa Frost - 45,000,000", chance: 45000000, breakthrough: { snowy: 3 } },
    { name: "{J u x t a p o s i t i o n} - 40,440,400", chance: 40440400, exclusiveTo: ["limbo"] },
    { name: "Virtual : Fatal Error - 40,413,000", chance: 40413000 },
    { name: "Chromatic : Kromat1k - 40,000,000", chance: 40000000 },
    { name: "Soul Hunter - 40,000,000", chance: 40000000, exclusiveTo: ["graveyard"] },
    { name: "Ethereal - 35,000,000", chance: 35000000 },
    { name: "Headless : Horseman - 32,000,000", chance: 32000000, exclusiveTo: ["glitch", "pumpkinMoon"] },
    { name: "Innovator - 30,000,000", chance: 30000000 },
    { name: "Arcane : Dark - 30,000,000", chance: 30000000 },
    { name: "Aviator - 24,000,000", chance: 24000000 },
    { name: "Cryptfire - 21,000,000", chance: 21000000, exclusiveTo: ["graveyard"] },
    { name: "Chromatic - 20,000,000", chance: 20000000 },
    { name: "Blizzard - 27,315,000", chance: 27315000, breakthrough: { snowy: 3 } },
    { name: "Lullaby - 17,000,000", chance: 17000000, breakthrough: { night: 10 } },
    { name: "Sinister - 15,000,000", chance: 15000000, exclusiveTo: ["glitch", "pumpkinMoon"] },
    { name: "Arcane : Legacy - 15,000,000", chance: 15000000 },
    { name: "Sirius - 14,000,000", chance: 14000000, breakthrough: { starfall: 5 } },
    { name: "Stormal : Hurricane - 13,500,000", chance: 13500000, breakthrough: { windy: 3 } },
    { name: "Glitch - 12,210,110", chance: 12210110, exclusiveTo: ["glitch"] },
    { name: "Wonderland - 12,000,000", chance: 12000000, breakthrough: { snowy: 3 } },
    { name: "Sailor - 12,000,000", chance: 12000000, breakthrough: { rainy: 4 } },
    { name: "Moonflower - 10,000,000", chance: 10000000, exclusiveTo: ["pumpkinMoon"] },
    { name: "Starscourge - 10,000,000", chance: 10000000, breakthrough: { starfall: 5 } },
    { name: "Stargazer - 9,200,000", chance: 9200000, breakthrough: { starfall: 5 } },
    { name: "Helios - 9,000,000", chance: 9000000 },
    { name: "Nihility - 9,000,000", chance: 9000000, breakthrough: { null: 1000, limbo: 1000 }, exclusiveTo: ["limbo-null"] },
    { name: "Harnessed - 8,500,000", chance: 85000000 },
    { name: "Origin : Onion - 8,000,000", chance: 80000000 },
    { name: "Nautilus : Lost - 7,700,000", chance: 7700000 },
    { name: "Velocity - 7,630,000", chance: 7630000 },
    { name: "HYPER-VOLT - 7,500,000", chance: 7500000 },
    { name: "Anubis - 7,200,000", chance: 7200000, breakthrough: { sandstorm: 4 } },
    { name: "Hades - 6,666,666", chance: 6666666, breakthrough: { hell: 6 } },
    { name: "Oni - 6,666,666", chance: 6666666, exclusiveTo: ["glitch", "bloodRain"] },
    { name: "Origin - 6,500,000", chance: 6500000 },
    { name: "Twilight - 6,000,000", chance: 6000000, breakthrough: { night: 10 } },
    { name: "Vital - 6,000,000", chance: 6000000, exclusiveTo: ["pumpkinMoon"] },
    { name: "Anima - 5,730,000", chance: 5730000, exclusiveTo: ["limbo"] },
    { name: "Galaxy - 5,000,000", chance: 5000000, breakthrough: { starfall: 5 } },
    { name: "Lunar : Full Moon - 5,000,000", chance: 5000000, breakthrough: { night: 10 } },
    { name: "Solar : Solstice - 5,000,000", chance: 5000000, breakthrough: { day: 10 } },
    { name: "Aquatic : Flame - 4,000,000", chance: 4000000 },
    { name: "Poseidon - 4,000,000", chance: 4000000, breakthrough: { rainy: 4 } },
    { name: "Shiftlock - 3,325,000", chance: 3325000, breakthrough: { null: 1000, limbo: 1000 }, exclusiveTo: ["limbo-null"] },
    { name: "Savior - 3,200,000", chance: 3200000 },
    { name: "Headless - 3,200,000", chance: 3200000, exclusiveTo: ["glitch", "graveyard"] },
    { name: "Lunar : Nightfall - 3,000,000", chance: 3000000, exclusiveTo: ["graveyard"] },
    { name: "Parasite - 3,000,000", chance: 3000000, breakthrough: { corruption: 5 } },
    { name: "Virtual - 2,500,000", chance: 2500000 },
    { name: "Undefined : Defined - 2,222,000", chance: 2222000, breakthrough: { null: 1000 } },
    { name: "Bounded : Unbound - 2,000,000", chance: 2000000 },
    { name: "Gravitational - 2,000,000", chance: 2000000 },
    { name: "Cosmos - 1,520,000", chance: 1520000 },
    { name: "Astral - 1,336,000", chance: 1336000, breakthrough: { starfall: 5 } },
    { name: "Rage : Brawler - 1,280,000", chance: 1280000 },
    { name: "Undefined - 1,111,000", chance: 1111000, breakthrough: { null: 1000, limbo: 1000 }, exclusiveTo: ["limbo-null"] },
    { name: "Magnetic : Reverse Polarity - 1,024,000", chance: 1024000 },
    { name: "Flushed : Troll - 1,000,000", chance: 1000000 },
    { name: "Arcane - 1,000,000", chance: 1000000 },
    { name: "Kyawthuite - 850,000", chance: 850000 },
    { name: "Warlock - 666,000", chance: 666000 },
    { name: "Pump : Trickster - 600,000", chance: 600000, exclusiveTo: ["glitch", "pumpkinMoon"] },
    { name: "Prowler - 540,000", chance: 540000, exclusiveTo: ["anotherRealm"] },
    { name: "Raven - 500,000", chance: 500000, exclusiveTo: ["limbo"] },
    { name: "Terror - 400,000", chance: 400000 },
    { name: "Celestial - 350,000", chance: 350000 },
    { name: "Watermelon - 320,000", chance: 320000 },
    { name: "Star Rider : Starfish Rider - 250,000", chance: 250000, breakthrough: { starfall: 10 } },
    { name: "Bounded - 200,000", chance: 200000 },
    { name: "Pump - 200,000", chance: 200000, exclusiveTo: ["pumpkinMoon"] },
    { name: "Aether - 180,000", chance: 180000 },
    { name: "Jade - 125,000", chance: 125000 },
    { name: "Divinus : Angel - 120,000", chance: 120000 },
    { name: "Comet - 120,000", chance: 120000, breakthrough: { starfall: 5 } },
    { name: "Undead : Devil - 120,000", chance: 120000, breakthrough: { hell: 6 } },
    { name: "Diaboli : Void - 100,400", chance: 100400 },
    { name: "Exotic - 99,999", chance: 99999 },
    { name: "Stormal - 90,000", chance: 90000, breakthrough: { windy: 3 } },
    { name: "Flow - 87,000", chance: 87000 , breakthrough: { windy: 3 } },
    { name: "Permafrost - 73,500", chance: 73500, breakthrough: { snowy: 3 } },
    { name: "Nautilus - 70,000", chance: 70000 },
    { name: "Hazard : Rays - 70,000", chance: 70000, breakthrough: { corruption: 5 } },
    { name: "Flushed : Lobotomy - 69,000", chance: 69000 },
    { name: "Solar - 50,000", chance: 50000, breakthrough: { day: 10 } },
    { name: "Lunar - 50,000", chance: 50000, breakthrough: { night: 10 } },
    { name: "Starlight - 50,000", chance: 50000, breakthrough: { starfall: 5 } },
    { name: "Star Rider - 50,000", chance: 50000, breakthrough: { starfall: 5 } },
    { name: "Aquatic - 40,000", chance: 40000 },
    { name: "Watt - 32,768", chance: 32768 },
    { name: "Copper - 29,000", chance: 29000 },
    { name: "Powered - 16,384", chance: 16384 },
    { name: "LEAK - 14,000", chance: 14000 },
    { name: "Rage : Heated - 12,800", chance: 12800 },
    { name: "Corrosive - 12,000", chance: 12000, breakthrough: { corruption: 5 } },
    { name: "Undead - 12,000", chance: 12000, breakthrough: { hell: 6 } },
    { name: "★★★ - 10,000", chance: 10000, exclusiveTo: ["glitch", "dreamspace"] },
    { name: "Atomic : Riboneucleic - 9876", chance: 9876 },
    { name: "Lost Soul - 9,200", chance: 9200 },
    { name: "Honey - 8,335", chance: 8335 },
    { name: "Quartz - 8,192", chance: 8192 },
    { name: "Hazard - 7,000", chance: 7000, breakthrough: { corruption: 5 } },
    { name: "Flushed : Heart Eye - 6,900", chance: 6900 },
    { name: "Flushed - 6,900", chance: 6900 },
    { name: "Megaphone - 5,000", chance: 5000 },
    { name: "Bleeding - 4,444", chance: 4444 },
    { name: "Sidereum - 4,096", chance: 4096 },
    { name: "Flora - 3,700", chance: 3700 },
    { name: "Cola - 3,999", chance: 3999 },
    { name: "Pukeko - 3,198", chance: 3198 },
    { name: "Player - 3,000", chance: 3000 },
    { name: "Fault - 3,000", chance: 3000, exclusiveTo: ["glitch"] },
    { name: "Glacier - 2,304", chance: 2304, breakthrough: { snowy: 3 } },
    { name: "Ash - 2,300", chance: 2300 },
    { name: "Magnetic - 2,048", chance: 2048 },
    { name: "Glock - 1,700", chance: 1700 },
    { name: "Atomic - 1,180", chance: 1180 },
    { name: "Precious - 1,024", chance: 1024 },
    { name: "Diaboli - 1,004", chance: 1004 },
    { name: "★★ - 1,000", chance: 1000, exclusiveTo: ["glitch", "dreamspace"] },
    { name: "Wind - 900", chance: 900, breakthrough: { windy: 3 } },
    { name: "Aquamarine - 900", chance: 900 },
    { name: "Sapphire - 800", chance: 800 },
    { name: "Jackpot - 777", chance: 777, breakthrough: { sandstorm: 4 } },
    { name: "Ink - 700", chance: 700 },
    { name: "Gilded - 512", chance: 512, breakthrough: { sandstorm: 4 } },
    { name: "Emerald - 500", chance: 500 },
    { name: "Forbidden - 404", chance: 404 },
    { name: "Ruby - 350", chance: 350 },
    { name: "Topaz - 150", chance: 150 },
    { name: "Rage - 128", chance: 128 },
    { name: "★ - 100", chance: 100, exclusiveTo: ["glitch", "dreamspace"] },
    { name: "Crystallized - 64", chance: 64 },
    { name: "Divinus : Love - 32", chance: 32 },
    { name: "Divinus - 32", chance: 32 },
    { name: "Rare - 16", chance: 16 },
    { name: "Natural - 8", chance: 8 },
    { name: "Good - 5", chance: 5 },
    { name: "Uncommon - 4", chance: 4 },
    { name: "Common - 2", chance: 1 },
    { name: "Nothing - 1", chance: 1, exclusiveTo: ["limbo"] },
];

const EVENT_LIST = [
    { id: "valentine24", label: "Valentine 2024" },
    { id: "aprilFools24", label: "April Fools 2024" },
    { id: "summer24", label: "Summer 2024" },
    { id: "ria24", label: "RIA Event 2024" },
    { id: "halloween24", label: "Halloween 2024" },
    { id: "winter24", label: "Winter 2024" },
    { id: "aprilFools25", label: "April Fools 2025" },
    { id: "summer25", label: "Summer 2025" },
    { id: "halloween25", label: "Halloween 2025" },
];

const EVENT_AURA_LOOKUP = {
    valentine24: [
        "Divinus : Love - 32",
        "Flushed : Heart Eye - 6,900",
    ],
    aprilFools24: [
        "Undefined : Defined - 2,222,000",
        "Chromatic : Kromat1k - 40,000,000",
        "Impeached : I'm Peach - 400,000,000",
    ],
    summer24: [
        "Star Rider : Starfish Rider - 250,000",
        "Watermelon - 320,000",
        "Surfer : Shard Surfer - 225,000,000",
    ],
    ria24: [
        "Innovator - 30,000,000",
    ],
    halloween24: [
        "Apostolos : Veil - 800,000,000",
        "Harvester - 666,000,000",
        "Nightmare Sky - 190,000,000",
        "Dullahan - 72,000,000",
        "Soul Hunter - 40,000,000",
        "Cryptfire - 21,000,000",
        "Moonflower - 10,000,000",
        "Vital - 6,000,000",
        "Lunar : Nightfall - 3,000,000",
        "Pump - 200,000",
    ],
    winter24: [
        "Atlas : Yuletide - 510,000,000",
        "Abominable - 120,000,000",
        "Express - 90,000,000",
        "Winter Fantasy - 72,000,000",
        "Santa Frost - 45,000,000",
        "Wonderland - 12,000,000",
    ],
    aprilFools25: [
        "Glock : the glock of the sky - 170,000,000",
        "Origin : Onion - 8,000,000",
        "Flushed : Troll - 1,000,000",
        "Pukeko - 3,198",
    ],
    summer25: [
        "Aegis : Watergun - 825,000,000",
        "Manta - 300,000,000",
    ],
    halloween25: [
        "Pump : Trickster - 600,000",
        "Headless - 3,200,000",
        "Oni - 6,666,666",
        "Headless : Horseman - 32,000,000",
        "Sinister - 15,000,000",
        "Accursed - 82,000,000",
        "Phantasma - 462,600,000",
        "Apocalypse - 624,000,000",
        "Malediction - 730,000,000",
        "Banshee - 730,000,000",
        "Ravage - 930,000,000",
        "Arachnophobia - 940,000,000",
        "Lamenthyr - 1,000,000,000",
        "Erebus - 1,200,000,000",
    ],
};

const BIOME_EVENT_CONSTRAINTS = {
    graveyard: ["halloween24", "halloween25"],
    pumpkinMoon: ["halloween24", "halloween25"],
    bloodRain: ["halloween25"],
    blazing: "summer25",
};

const enabledEvents = new Set();
const auraEventIndex = new Map();

const GLITCH_EVENT_WHITELIST = new Set([
    "halloween24",
    "halloween25",
]);

for (const [eventId, auraNames] of Object.entries(EVENT_AURA_LOOKUP)) {
    auraNames.forEach(name => {
        auraEventIndex.set(name, eventId);
    });
}

const CUTSCENE_PRIORITY_SEQUENCE = ["oblivion-cutscene", "memory-cutscene", "equinox-cutscene", "erebus-cutscene", "luminosity-cutscene", "pixelation-cutscene", "lamenthyr-cutscene", "dreammetric-cutscene", "oppression-cutscene"];

oblivionAuraData = AURA_LIBRARY.find(aura => aura.name === OBLIVION_AURA_LABEL) || null;
memoryAuraData = AURA_LIBRARY.find(aura => aura.name === MEMORY_AURA_LABEL) || null;

const ROE_EXCLUSION_SET = new Set([
    "Apostolos : Veil - 800,000,000",
    "Harvester - 666,000,000",
    "Apocalypse - 624,000,000",
    "Dreammetric - 520,000,000",
    "Phantasma - 462,600,000",
    "Oppression - 220,000,000",
    "Nightmare Sky - 190,000,000",
    "Malediction - 730,000,000",
    "Banshee - 730,000,000",
    "Ravage - 930,000,000",
    "Arachnophobia - 940,000,000",
    "Lamenthyr - 1,000,000,000",
    "Erebus - 1,200,000,000",
    "Accursed - 82,000,000",
    "Dullahan - 72,000,000",
    "Soul Hunter - 40,000,000",
    "Cryptfire - 21,000,000",
    "Glitch - 12,210,110",
    "Moonflower - 10,000,000",
    "Vital - 6,000,000",
    "Oni - 6,666,666",
    "Lunar : Nightfall - 3,000,000",
    "Headless - 3,200,000",
    "Prowler - 540,000",
    "Headless : Horseman - 32,000,000",
    "Sinister - 15,000,000",
    "Pump - 200,000",
    "Pump : Trickster - 600,000",
    "★★★ - 10,000",
    "★★ - 1,000",
    "★ - 100"
]);

const ROE_BREAKTHROUGH_BLOCKLIST = new Set([
    "Twilight : Withering Grace - 180,000,000",
    "Aegis : Watergun - 825,000,000",
    "Manta - 300,000,000"
]);

AURA_LIBRARY.forEach(aura => {
    aura.wonCount = 0;
    const eventId = auraEventIndex.get(aura.name);
    if (eventId) {
        aura.event = eventId;
    }
});

const EVENT_SUMMARY_EMPTY_LABEL = "No events enabled";

function gatherActiveEventLabels() {
    return EVENT_LIST
        .filter(event => enabledEvents.has(event.id))
        .map(event => event.label);
}

function updateEventSummary() {
    const summary = document.getElementById('event-selector-summary');
    if (!summary) return;

    const labels = gatherActiveEventLabels();
    let displayText = EVENT_SUMMARY_EMPTY_LABEL;

    if (labels.length === 0) {
        summary.classList.add('form-field__input--placeholder');
    } else {
        summary.classList.remove('form-field__input--placeholder');
        if (labels.length === 1) {
            displayText = labels[0];
        } else if (labels.length === 2) {
            displayText = `${labels[0]}, ${labels[1]}`;
        } else {
            displayText = `${labels[0]}, ${labels[1]} +${labels.length - 2} more`;
        }
    }

    summary.textContent = displayText;
    summary.title = labels.length > 0 ? labels.join(', ') : EVENT_SUMMARY_EMPTY_LABEL;

    const details = document.getElementById('event-selector');
    const isOpen = !!(details && details.open);
    summary.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeOpenSelectMenus(except, options = {}) {
    const { focusSummary = false } = options;
    let hasFocused = false;
    const openSelects = document.querySelectorAll('details.interface-select[open]');
    openSelects.forEach(details => {
        if (except && details === except) return;
        details.open = false;
        const summary = details.querySelector('.interface-select__summary');
        if (summary) {
            summary.setAttribute('aria-expanded', 'false');
            if (focusSummary && !hasFocused) {
                summary.focus();
                hasFocused = true;
            }
        }
        if (details.id === 'event-selector') {
            updateEventSummary();
        }
        const selectId = details.dataset.select;
        if (selectId) {
            const registryEntry = selectWidgetRegistry.get(selectId);
            if (registryEntry && typeof registryEntry.update === 'function') {
                registryEntry.update();
            }
        }
    });
}

document.addEventListener('click', event => {
    const parentSelect = event.target.closest('details.interface-select');
    closeOpenSelectMenus(parentSelect);
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        closeOpenSelectMenus(null, { focusSummary: true });
    }
});

function enforceBiomeEventRestrictions() {
    const biomeSelector = document.getElementById('biome-dropdown');
    if (!biomeSelector) return;

    const currentValue = biomeSelector.value;
    let resetToDefault = false;

    Array.from(biomeSelector.options).forEach(option => {
        const requiredEvent = BIOME_EVENT_CONSTRAINTS[option.value];
        if (!requiredEvent) {
            option.disabled = false;
            option.removeAttribute('title');
            return;
        }
        const requiredEvents = Array.isArray(requiredEvent) ? requiredEvent : [requiredEvent];
        const enabled = requiredEvents.some(eventId => enabledEvents.has(eventId));
        option.disabled = !enabled;
        if (!enabled) {
            const eventLabels = requiredEvents
                .map(eventId => EVENT_LIST.find(event => event.id === eventId)?.label)
                .filter(Boolean);
            if (eventLabels.length > 0) {
                let labelText = eventLabels[0];
                if (eventLabels.length === 2) {
                    labelText = `${eventLabels[0]} or ${eventLabels[1]}`;
                } else if (eventLabels.length > 2) {
                    labelText = `${eventLabels.slice(0, -1).join(', ')}, or ${eventLabels[eventLabels.length - 1]}`;
                }
                option.title = `${labelText} must be enabled to access this biome.`;
            } else {
                option.removeAttribute('title');
            }
        } else {
            option.removeAttribute('title');
        }
        if (!enabled && option.value === currentValue) {
            resetToDefault = true;
        }
    });

    if (resetToDefault) {
        biomeSelector.value = 'normal';
        if (typeof handleBiomeInterface === 'function') {
            handleBiomeInterface();
        }
    }

    refreshCustomSelect('biome-dropdown');
}

function setEventToggleState(eventId, enabled) {
    if (!eventId) return;
    const hasEvent = enabledEvents.has(eventId);
    if (enabled && !hasEvent) {
        enabledEvents.add(eventId);
    } else if (!enabled && hasEvent) {
        enabledEvents.delete(eventId);
    } else {
        return;
    }

    const eventMenu = document.getElementById('event-option-list');
    if (eventMenu) {
        const checkbox = eventMenu.querySelector(`input[type="checkbox"][data-event-id="${eventId}"]`);
        if (checkbox && checkbox.checked !== enabled) {
            checkbox.checked = enabled;
        }
    }

    updateEventSummary();
    enforceBiomeEventRestrictions();
}

function initializeEventSelector() {
    const eventMenu = document.getElementById('event-option-list');
    if (!eventMenu) return;

    const checkboxes = eventMenu.querySelectorAll('input[type="checkbox"][data-event-id]');
    checkboxes.forEach(input => {
        const eventId = input.dataset.eventId;
        input.checked = enabledEvents.has(eventId);
        input.addEventListener('change', () => {
            setEventToggleState(eventId, input.checked);
        });
    });

    const details = document.getElementById('event-selector');
    if (details) {
        details.addEventListener('toggle', () => {
            const summary = document.getElementById('event-selector-summary');
            if (summary) {
                summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
            }
        });
    }

    updateEventSummary();
    enforceBiomeEventRestrictions();
}

document.addEventListener('DOMContentLoaded', initializeEventSelector);
document.addEventListener('DOMContentLoaded', updateOblivionPresetDisplay);

function initializeSingleSelectControl(selectId) {
    const select = document.getElementById(selectId);
    const details = document.querySelector(`details[data-select="${selectId}"]`);
    if (!select || !details) return;

    const summary = details.querySelector('.interface-select__summary');
    const menu = details.querySelector('.interface-select__menu');
    if (!summary || !menu) return;

    const placeholder = summary.dataset.placeholder || summary.textContent.trim();
    menu.innerHTML = '';

    const optionButtons = Array.from(select.options).map(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'interface-select__option-button';
        button.dataset.value = option.value;
        button.textContent = option.textContent;
        button.setAttribute('role', 'option');
        button.addEventListener('click', () => {
            if (option.disabled) return;
            const valueChanged = select.value !== option.value;
            if (valueChanged) {
                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            details.open = false;
            summary.focus();
            updateSummary();
        });
        menu.appendChild(button);
        return { button, option };
    });

    if (!menu.hasAttribute('role')) {
        menu.setAttribute('role', 'listbox');
    }

    function updateSummary() {
        const selectedOption = select.options[select.selectedIndex];
        const label = selectedOption ? selectedOption.textContent : placeholder;
        summary.textContent = label;
        summary.classList.toggle('form-field__input--placeholder', !selectedOption);
        summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');

        optionButtons.forEach(({ button, option }) => {
            const isActive = option.value === select.value;
            button.classList.toggle('interface-select__option-button--active', isActive);
            button.classList.toggle('interface-select__option-button--disabled', option.disabled);
            button.disabled = !!option.disabled;
            if (option.disabled) {
                button.setAttribute('aria-disabled', 'true');
            } else {
                button.removeAttribute('aria-disabled');
            }
        });
    }

    select.addEventListener('change', updateSummary);
    details.addEventListener('toggle', () => {
        summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
    });

    selectWidgetRegistry.set(selectId, { update: updateSummary });

    updateSummary();
}

function refreshCustomSelect(selectId) {
    const registryEntry = selectWidgetRegistry.get(selectId);
    if (registryEntry && typeof registryEntry.update === 'function') {
        registryEntry.update();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeSingleSelectControl('vip-dropdown');
    initializeSingleSelectControl('dave-luck-dropdown');
    initializeSingleSelectControl('biome-dropdown');
});

// XP is awarded once per rarity tier. Landing any aura within an inclusive tier range grants that tier's XP
// a single time per simulation run, regardless of how many qualifying entries in AURA_LIBRARY were rolled in that band.
const XP_RARITY_TABLE = [
    { key: 'tier-9k', min: 9999, max: 99998, xp: 1000, label: '1 in 9,999 – 99,998' },
    { key: 'tier-99k', min: 99999, max: 999998, xp: 2500, label: '1 in 99,999 – 999,998' },
    { key: 'tier-999k', min: 999999, max: 9999998, xp: 5000, label: '1 in 999,999 – 9,999,998' },
    { key: 'tier-9m', min: 9999999, max: 99999998, xp: 7500, label: '1 in 9,999,999 – 99,999,998' },
    { key: 'tier-99m', min: 99999999, max: 999999998, xp: 15000, label: '1 in 99,999,999 – 999,999,998' },
    { key: 'tier-999m', min: 999999999, max: Number.POSITIVE_INFINITY, xp: 30000, label: '1 in 999,999,999+' }
];

function resolveXpTierForChance(chance) {
    if (!Number.isFinite(chance)) return null;
    for (const tier of XP_RARITY_TABLE) {
        if (chance >= tier.min && chance <= tier.max) {
            return tier;
        }
    }
    return null;
}

// Run the roll simulation while keeping the UI responsive
function runRollSimulation() {
    if (simulationActive) return;

    if (!feedContainer) {
        feedContainer = document.getElementById('simulation-feed');
    }
    if (!luckField) {
        luckField = document.getElementById('luck-total');
    }

    if (!feedContainer || !luckField) {
        return;
    }

    const {
        rollTriggerButton,
        brandMark,
        rollCountInput,
        biomeSelector,
        progressPanel,
        progressBarFill,
        progressLabel,
        audio
    } = uiHandles;

    if (!rollTriggerButton || !rollCountInput || !luckField) {
        return;
    }

    simulationActive = true;
    rollTriggerButton.disabled = true;
    rollTriggerButton.style.opacity = '0.5';
    if (brandMark) {
        brandMark.classList.add('banner__emblem--spinning');
    }

    playSoundEffect(audio.roll);

    let total = Number.parseInt(rollCountInput.value, 10);
    if (!Number.isFinite(total) || total <= 0) {
        total = 1;
        rollCountInput.value = '1';
    }

    let parsedLuck = Number.parseFloat(luckField.value);
    if (!Number.isFinite(parsedLuck)) {
        parsedLuck = 1;
        luckField.value = '1';
    }
    const luckValue = Math.max(0, parsedLuck);
    const biome = biomeSelector ? biomeSelector.value : '';

    const eventSnapshot = enabledEvents.size > 0 ? new Set(enabledEvents) : null;
    const isEventAuraEnabled = aura => !aura.event || (eventSnapshot ? eventSnapshot.has(aura.event) : enabledEvents.has(aura.event));

    feedContainer.innerHTML = 'Rolling...';
    let rolls = 0;
    const startTime = performance.now();

    for (const aura of AURA_LIBRARY) {
        aura.wonCount = 0;
        aura.effectiveChance = aura.chance;
    }

    const breakthroughStatsMap = new Map();

    const progressElementsAvailable = progressPanel && progressBarFill && progressLabel;
    const showProgress = progressElementsAvailable && total >= 100000;
    if (progressPanel) {
        progressPanel.style.display = showProgress ? 'grid' : 'none';
        progressPanel.classList.toggle('loading-indicator--active', showProgress);
        if (!showProgress) {
            delete progressPanel.dataset.progress;
        }
    }
    if (progressElementsAvailable) {
        progressBarFill.style.width = '0%';
        progressLabel.textContent = '0%';
        if (showProgress && progressPanel) {
            progressPanel.dataset.progress = '0';
        }
    }

    const effectiveAuras = [];
    if (biome === 'limbo') {
        for (const aura of AURA_LIBRARY) {
            if (aura.requiresOblivionPreset) continue;
            if (!isEventAuraEnabled(aura)) continue;
            if (!aura.exclusiveTo) continue;
            if (!aura.exclusiveTo.includes('limbo') && !aura.exclusiveTo.includes('limbo-null')) continue;

            let effectiveChance = aura.chance;
            if (aura.breakthrough && aura.breakthrough.limbo) {
                effectiveChance = Math.floor(aura.chance / aura.breakthrough.limbo);
            }
            aura.effectiveChance = Math.max(1, effectiveChance);
            effectiveAuras.push(aura);
        }
    } else {
        const isRoe = biome === 'roe';
        const glitchLikeBiome = biome === 'glitch' || isRoe;
        const exclusivityBiome = isRoe ? 'glitch' : biome;

        for (const aura of AURA_LIBRARY) {
            if (aura.requiresOblivionPreset) {
                aura.effectiveChance = Infinity;
                continue;
            }
            if (!isEventAuraEnabled(aura)) {
                aura.effectiveChance = Infinity;
                continue;
            }
            if (isRoe && ROE_EXCLUSION_SET.has(aura.name)) {
                aura.effectiveChance = Infinity;
                continue;
            }
            if (aura.exclusiveTo) {
                if (aura.exclusiveTo.includes('limbo') && !aura.exclusiveTo.includes('limbo-null')) {
                    aura.effectiveChance = Infinity;
                    continue;
                }
                const allowEventGlitchAccess = glitchLikeBiome && aura.event && (eventSnapshot ? eventSnapshot.has(aura.event) : enabledEvents.has(aura.event)) && GLITCH_EVENT_WHITELIST.has(aura.event);
                if (!aura.exclusiveTo.includes('limbo-null') && !aura.exclusiveTo.includes(exclusivityBiome) && !allowEventGlitchAccess) {
                    aura.effectiveChance = Infinity;
                    continue;
                }
            }

            let effectiveChance = aura.chance;
            if (aura.breakthrough) {
                if (glitchLikeBiome && (!isRoe || !ROE_BREAKTHROUGH_BLOCKLIST.has(aura.name))) {
                    let minChance = aura.chance;
                    for (const mult of Object.values(aura.breakthrough)) {
                        minChance = Math.min(minChance, Math.floor(aura.chance / mult));
                    }
                    effectiveChance = minChance;
                } else if (aura.breakthrough[biome]) {
                    effectiveChance = Math.floor(aura.chance / aura.breakthrough[biome]);
                }
            }

            aura.effectiveChance = Math.max(1, effectiveChance);
            if (aura.effectiveChance !== Infinity) {
                effectiveAuras.push(aura);
            }
        }
    }

    effectiveAuras.sort((a, b) => b.effectiveChance - a.effectiveChance);

    const computedAuras = effectiveAuras.map(aura => {
        const usesBreakthrough = aura.effectiveChance !== aura.chance;
        const breakthroughStats = usesBreakthrough ? { count: 0, btChance: aura.effectiveChance } : null;
        if (breakthroughStats) {
            breakthroughStatsMap.set(aura.name, breakthroughStats);
        }

        let successThreshold;
        if (aura.ignoreLuck) {
            const fixedThreshold = Number.isFinite(aura.fixedRollThreshold) ? aura.fixedRollThreshold : 1;
            successThreshold = Math.max(0, Math.min(aura.effectiveChance, fixedThreshold));
        } else {
            successThreshold = Math.min(aura.effectiveChance, luckValue);
        }

        const successRatio = successThreshold > 0 ? successThreshold / aura.effectiveChance : 0;
        return {
            aura,
            successRatio,
            breakthroughStats
        };
    });

    const activeOblivionAura = (oblivionPresetEnabled && luckValue >= OBLIVION_LUCK_TARGET) ? oblivionAuraData : null;
    const activeMemoryAura = (oblivionPresetEnabled && luckValue >= OBLIVION_LUCK_TARGET) ? memoryAuraData : null;
    const memoryProbability = activeMemoryAura ? 1 / OBLIVION_MEMORY_ODDS : 0;
    const oblivionProbability = activeOblivionAura ? 1 / OBLIVION_POTION_ODDS : 0;

    const queueAnimationFrame = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
        ? callback => window.requestAnimationFrame(callback)
        : callback => setTimeout(callback, 0);

    const PROGRESS_ROUNDING_STEP = 1;
    const updateProgress = showProgress
        ? (() => {
            let lastProgressValue = -1;
            return progress => {
                const progressValueRounded = Math.floor(progress / PROGRESS_ROUNDING_STEP) * PROGRESS_ROUNDING_STEP;
                if (progressValueRounded === lastProgressValue && progress < 100) {
                    return;
                }
                lastProgressValue = progressValueRounded;
                progressBarFill.style.width = `${progress}%`;
                progressLabel.textContent = `${progressValueRounded}%`;
                progressPanel.dataset.progress = `${progressValueRounded}`;
            };
        })()
        : null;

    const MAX_FRAME_DURATION = 14;
    const MAX_ROLLS_PER_CHUNK = 40000;
    const CHECK_INTERVAL = 512;
    let currentRoll = 0;

    function performSingleRollCheck() {
        if (memoryProbability > 0 && getRand() < memoryProbability) {
            activeMemoryAura.wonCount++;
            rolls++;
            return;
        }
        if (oblivionProbability > 0 && getRand() < oblivionProbability) {
            activeOblivionAura.wonCount++;
            rolls++;
            return;
        }

        for (let j = 0; j < computedAuras.length; j++) {
            const entry = computedAuras[j];
            if (entry.successRatio > 0 && getRand() < entry.successRatio) {
                entry.aura.wonCount++;
                if (entry.breakthroughStats) {
                    entry.breakthroughStats.count++;
                }
                break;
            }
        }
        rolls++;
    }

    function processRollSequence() {
        const deadline = performance.now() + MAX_FRAME_DURATION;
        let processedThisChunk = 0;

        while (currentRoll < total && processedThisChunk < MAX_ROLLS_PER_CHUNK) {
            performSingleRollCheck();
            currentRoll++;
            processedThisChunk++;

            if (processedThisChunk % CHECK_INTERVAL === 0 && performance.now() >= deadline) {
                break;
            }
        }

        if (updateProgress) {
            const progress = (currentRoll / total) * 100;
            queueAnimationFrame(() => updateProgress(progress));
        }

        if (currentRoll < total) {
            queueAnimationFrame(processRollSequence);
            return;
        }

        if (progressPanel) {
            progressPanel.style.display = 'none';
            progressPanel.classList.remove('loading-indicator--active');
            delete progressPanel.dataset.progress;
        }
        rollTriggerButton.disabled = false;
        rollTriggerButton.style.opacity = '1';
        if (brandMark) {
            brandMark.classList.remove('banner__emblem--spinning');
        }
        simulationActive = false;

        const endTime = performance.now();
        const executionTime = ((endTime - startTime) / 1000).toFixed(0);

        if (cutscenesEnabled) {
            const cutsceneQueue = [];
            for (const videoId of CUTSCENE_PRIORITY_SEQUENCE) {
                const aura = AURA_LIBRARY.find(entry => entry.cutscene === videoId);
                if (aura && aura.wonCount > 0) {
                    cutsceneQueue.push(videoId);
                }
            }
            if (cutsceneQueue.length > 0) {
                playAuraSequence(cutsceneQueue);
            }
        }

        let highestChance = 0;
        for (const aura of AURA_LIBRARY) {
            if (aura.wonCount > 0 && aura.chance > highestChance) {
                highestChance = aura.chance;
            }
        }

        if (highestChance >= 99999999) {
            if (biome === 'limbo') {
                playSoundEffect(audio.limbo99m);
            } else {
                playSoundEffect(audio.m100);
            }
        } else if (highestChance >= 10000000) {
            playSoundEffect(audio.m10);
        } else if (highestChance >= 1000000) {
            playSoundEffect(audio.k100);
        } else if (highestChance >= 100000) {
            playSoundEffect(audio.k10);
        } else if (highestChance >= 1000) {
            playSoundEffect(audio.k1);
        }

        const resultChunks = [
            `Execution time: ${executionTime} seconds. <br>`,
            `Rolls: ${formatWithCommas(rolls)}<br>`,
            `Luck: ${formatWithCommas(luckValue)}<br><br>`
        ];

        const resultEntries = [];
        for (const aura of AURA_LIBRARY) {
            if (aura.wonCount <= 0) continue;

            const rarityClass = determineRarityClass(aura, biome);
            const specialClass = deriveAuraStyleClass(aura);
            const eventClass = aura.event ? 'sigil-event-text' : '';
            const classAttr = [rarityClass, specialClass, eventClass].filter(Boolean).join(' ');
            const formattedName = formatAuraNameMarkup(aura);
            const breakthroughStats = breakthroughStatsMap.get(aura.name);

            if (breakthroughStats && breakthroughStats.count > 0) {
                const btName = aura.name.replace(
                    /-\s*[\d,]+/,
                    `- ${formatWithCommas(breakthroughStats.btChance)}`
                );
                const nativeLabel = formatAuraNameMarkup(aura, btName);
                resultEntries.push({
                    label: `<span class="${classAttr}">[Native] ${nativeLabel} | Times Rolled: ${formatWithCommas(breakthroughStats.count)}</span>`,
                    chance: determineResultPriority(aura, breakthroughStats.btChance)
                });
                if (aura.wonCount > breakthroughStats.count) {
                    resultEntries.push({
                        label: `<span class="${classAttr}">${formattedName} | Times Rolled: ${formatWithCommas(aura.wonCount - breakthroughStats.count)}</span>`,
                        chance: determineResultPriority(aura, aura.chance)
                    });
                }
            } else {
                resultEntries.push({
                    label: `<span class="${classAttr}">${formattedName} | Times Rolled: ${formatWithCommas(aura.wonCount)}</span>`,
                    chance: determineResultPriority(aura, aura.chance)
                });
            }
        }

        resultEntries.sort((a, b) => b.chance - a.chance);
        for (const entry of resultEntries) {
            resultChunks.push(`${entry.label}<br>`);
        }

        let totalXP = 0;
        const xpLines = [];
        const earnedXpTiers = new Set();
        for (const aura of AURA_LIBRARY) {
            if (aura.wonCount > 0) {
                const tier = resolveXpTierForChance(aura.chance);
                if (tier) {
                    earnedXpTiers.add(tier.key);
                }
            }
        }

        for (const tier of XP_RARITY_TABLE) {
            if (earnedXpTiers.has(tier.key)) {
                totalXP += tier.xp;
                xpLines.push(`Reached ${tier.label}: +${formatWithCommas(tier.xp)} XP`);
            }
        }

        resultChunks.push(`<br><strong>Total XP Earned: ${formatWithCommas(totalXP)}</strong><br>`);
        for (const line of xpLines) {
            resultChunks.push(`${line}<br>`);
        }

        feedContainer.innerHTML = resultChunks.join('');
    }

    queueAnimationFrame(processRollSequence);
}

