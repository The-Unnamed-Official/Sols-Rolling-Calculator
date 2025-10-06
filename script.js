let results = document.getElementById('result-text');
let luck = document.getElementById('luck');
let isRolling = false;

const customSelectRegistry = new Map();


const OBLIVION_PRESET_KEY = 'oblivion';
const OBLIVION_PRESET_LUCK = 600000;
const OBLIVION_AURA_NAME = 'Oblivion';
const OBLIVION_MEMORY_AURA_NAME = 'Memory';
const OBLIVION_POTION_ROLL_ODDS = 2000;
const OBLIVION_MEMORY_ROLL_ODDS = 100;

let isOblivionPresetActive = false;
let activeOblivionPresetLabel = 'Select preset';
let oblivionAuraDefinition = null;
let memoryAuraDefinition = null;

function applyOblivionPreset(presetKey) {
    const options = {};
    if (presetKey === OBLIVION_PRESET_KEY) {
        options.activateOblivionPreset = true;
        options.presetLabel = 'Oblivion Potion Preset';
    } else {
        options.activateOblivionPreset = false;
        options.presetLabel = 'Godlike + Heavenly + Bound';
    }

    setLuck(OBLIVION_PRESET_LUCK, options);

    const dropdown = document.getElementById('oblivion-preset-dropdown');
    if (dropdown) {
        dropdown.open = false;
        const summary = dropdown.querySelector('.preset-dropdown__summary');
        if (summary) {
            summary.focus();
        }
    }
}

function updateOblivionPresetUi() {
    const selection = document.getElementById('oblivion-preset-selection');
    if (selection) {
        selection.textContent = activeOblivionPresetLabel;
        selection.classList.toggle('preset-dropdown__selection--placeholder', activeOblivionPresetLabel === 'Select preset');
    }
}

function handlePresetOptionChange(options = {}) {
    isOblivionPresetActive = options.activateOblivionPreset === true;

    if (typeof options.presetLabel === 'string') {
        activeOblivionPresetLabel = options.presetLabel;
    } else {
        activeOblivionPresetLabel = 'Select preset';
    }

    updateOblivionPresetUi();
}

function renderAuraName(aura, overrideName) {
    if (!aura) return overrideName || '';
    const baseName = typeof overrideName === 'string' && overrideName.length > 0 ? overrideName : aura.name;
    if (aura.subtitle) {
        return `${baseName} <span class="aura-subtitle">${aura.subtitle}</span>`;
    }
    return baseName;
}

function getResultSortChance(aura, baseChance) {
    if (!aura) return baseChance;
    if (aura.name === OBLIVION_AURA_NAME) return Number.POSITIVE_INFINITY;
    if (aura.name === OBLIVION_MEMORY_AURA_NAME) return Number.MAX_SAFE_INTEGER;
    return baseChance;
}

const auras = [
    { name: "Oblivion", chance: 2000, requiresOblivionPreset: true, ignoreLuck: true, fixedRollThreshold: 1, subtitle: "The Truth Seeker", cutscene: "oblivion-cs", disableRarityClass: true },
    { name: "Memory", chance: 200000, requiresOblivionPreset: true, ignoreLuck: true, fixedRollThreshold: 1, subtitle: "The Fallen", cutscene: "memory-cs", disableRarityClass: true },
    { name: "Equinox - 2,500,000,000", chance: 2500000000, cutscene: "equinox-cs" },
    { name: "Luminosity - 1,200,000,000", chance: 1200000000, cutscene: "lumi-cs" },
    { name: "Pixelation - 1,073,741,824", chance: 1073741824, cutscene: "pixelation-cs" },
    { name: "Dreamscape - 850,000,000", chance: 850000000, exclusiveTo: ["limbo"] },
    { name: "Aegis - 825,000,000", chance: 825000000 },
    { name: "Aegis : Watergun - 825,000,000", chance: 825000000, breakthrough: { blazing: 2 }},
    { name: "Apostolos : Veil - 800,000,000", chance: 800000000, exclusiveTo: ["graveyard", "pumpkinMoon"] },
    { name: "Ruins : Withered - 800,000,000", chance: 800000000 },
    { name: "Sovereign - 750,000,000", chance: 750000000 },
    { name: "PROLOGUE - 666,616,111", chance: 666616111, exclusiveTo: ["limbo"] },
    { name: "Matrix : Reality - 601,020,102", chance: 601020102 },
    { name: "Harvester - 666,000,000", chance: 666000000, exclusiveTo: ["graveyard"] },
    { name: "Sophyra - 570,000,000", chance: 570000000 },
    { name: "Elude - 555,555,555", chance: 555555555, exclusiveTo: ["limbo"] },    
    { name: "Dreammetric - 520,000,000", chance: 520000000, exclusiveTo: ["glitch", "dreamspace"], cutscene: "dreammetric-cs" },
    { name: "Matrix : Overdrive - 503,000,000", chance: 503000000 },
    { name: "Ruins - 500,000,000", chance: 500000000 },
    { name: "Atlas : Yuletide - 510,000,000", chance: 510000000, breakthrough: { snowy: 3 } },
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
    { name: "Oppression - 220,000,000", chance: 220000000, exclusiveTo: ["glitch"], cutscene: "oppression-cs" },
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
    { name: "Innovator - 30,000,000", chance: 30000000 },
    { name: "Arcane : Dark - 30,000,000", chance: 30000000 },
    { name: "Aviator - 24,000,000", chance: 24000000 },
    { name: "Cryptfire - 21,000,000", chance: 21000000, exclusiveTo: ["graveyard"] },
    { name: "Chromatic - 20,000,000", chance: 20000000 },
    { name: "Blizzard - 27,315,000", chance: 27315000, breakthrough: { snowy: 3 } },
    { name: "Lullaby - 17,000,000", chance: 17000000, breakthrough: { night: 10 } },
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

const EVENT_DEFINITIONS = [
    { id: "valentine2024", label: "Valentine 2024" },
    { id: "aprilFools2024", label: "April Fools 2024" },
    { id: "summer2024", label: "Summer 2024" },
    { id: "ria2024", label: "RIA Event 2024" },
    { id: "halloween2024", label: "Halloween 2024" },
    { id: "winter2024", label: "Winter 2024" },
    { id: "aprilFools2025", label: "April Fools 2025" },
    { id: "summer2025", label: "Summer 2025" },
];

const EVENT_AURA_MAP = {
    valentine2024: [
        "Divinus : Love - 32",
        "Flushed : Heart Eye - 6,900",
    ],
    aprilFools2024: [
        "Undefined : Defined - 2,222,000",
        "Chromatic : Kromat1k - 40,000,000",
        "Impeached : I'm Peach - 400,000,000",
    ],
    summer2024: [
        "Star Rider : Starfish Rider - 250,000",
        "Watermelon - 320,000",
        "Surfer : Shard Surfer - 225,000,000",
    ],
    ria2024: [
        "Innovator - 30,000,000",
    ],
    halloween2024: [
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
    winter2024: [
        "Atlas : Yuletide - 510,000,000",
        "Abominable - 120,000,000",
        "Express - 90,000,000",
        "Winter Fantasy - 72,000,000",
        "Santa Frost - 45,000,000",
        "Wonderland - 12,000,000",
    ],
    aprilFools2025: [
        "Glock : the glock of the sky - 170,000,000",
        "Origin : Onion - 8,000,000",
        "Flushed : Troll - 1,000,000",
        "Pukeko - 3,198",
    ],
    summer2025: [
        "Aegis : Watergun - 825,000,000",
        "Manta - 300,000,000",
    ],
};

const BIOME_EVENT_REQUIREMENTS = {
    graveyard: ["halloween2024"],
    pumpkinMoon: ["halloween2024"],
    blazing: "summer2025",
};

const activeEvents = new Set();
const auraEventLookup = new Map();

const EVENTS_ALLOWING_GLITCH_ACCESS = new Set([
    "halloween2024",
]);

for (const [eventId, auraNames] of Object.entries(EVENT_AURA_MAP)) {
    auraNames.forEach(name => {
        auraEventLookup.set(name, eventId);
    });
}

const cutscenePriority = ["oblivion-cs", "memory-cs", "equinox-cs", "lumi-cs", "pixelation-cs", "dreammetric-cs", "oppression-cs"];

oblivionAuraDefinition = auras.find(aura => aura.name === OBLIVION_AURA_NAME) || null;
memoryAuraDefinition = auras.find(aura => aura.name === OBLIVION_MEMORY_AURA_NAME) || null;

const ROE_EXCLUDED_AURAS = new Set([
    "Apostolos : Veil - 800,000,000",
    "Harvester - 666,000,000",
    "Dreammetric - 520,000,000",
    "Oppression - 220,000,000",
    "Nightmare Sky - 190,000,000",
    "Dullahan - 72,000,000",
    "Soul Hunter - 40,000,000",
    "Cryptfire - 21,000,000",
    "Glitch - 12,210,110",
    "Moonflower - 10,000,000",
    "Vital - 6,000,000",
    "Lunar : Nightfall - 3,000,000",
    "Prowler - 540,000",
    "Pump - 200,000",
    "★★★ - 10,000",
    "★★ - 1,000",
    "★ - 100"
]);

const ROE_BREAKTHROUGH_EXCLUSIONS = new Set([
    "Twilight : Withering Grace - 180,000,000",
    "Aegis : Watergun - 825,000,000",
    "Manta - 300,000,000"
]);

auras.forEach(aura => {
    aura.wonCount = 0;
    const eventId = auraEventLookup.get(aura.name);
    if (eventId) {
        aura.event = eventId;
    }
});

const EVENT_SUMMARY_NONE = "No events enabled";

function getActiveEventLabels() {
    return EVENT_DEFINITIONS
        .filter(event => activeEvents.has(event.id))
        .map(event => event.label);
}

function updateEventSummary() {
    const summary = document.getElementById('event-summary');
    if (!summary) return;

    const labels = getActiveEventLabels();
    let displayText = EVENT_SUMMARY_NONE;

    if (labels.length === 0) {
        summary.classList.add('field__input--placeholder');
    } else {
        summary.classList.remove('field__input--placeholder');
        if (labels.length === 1) {
            displayText = labels[0];
        } else if (labels.length === 2) {
            displayText = `${labels[0]}, ${labels[1]}`;
        } else {
            displayText = `${labels[0]}, ${labels[1]} +${labels.length - 2} more`;
        }
    }

    summary.textContent = displayText;
    summary.title = labels.length > 0 ? labels.join(', ') : EVENT_SUMMARY_NONE;

    const details = document.getElementById('event-select');
    const isOpen = !!(details && details.open);
    summary.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeAllSelects(except, options = {}) {
    const { focusSummary = false } = options;
    let hasFocused = false;
    const openSelects = document.querySelectorAll('details.ui-select[open]');
    openSelects.forEach(details => {
        if (except && details === except) return;
        details.open = false;
        const summary = details.querySelector('.ui-select__summary');
        if (summary) {
            summary.setAttribute('aria-expanded', 'false');
            if (focusSummary && !hasFocused) {
                summary.focus();
                hasFocused = true;
            }
        }
        if (details.id === 'event-select') {
            updateEventSummary();
        }
        const selectId = details.dataset.select;
        if (selectId) {
            const registryEntry = customSelectRegistry.get(selectId);
            if (registryEntry && typeof registryEntry.update === 'function') {
                registryEntry.update();
            }
        }
    });
}

document.addEventListener('click', event => {
    const parentSelect = event.target.closest('details.ui-select');
    closeAllSelects(parentSelect);
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        closeAllSelects(null, { focusSummary: true });
    }
});

function applyEventBiomeRestrictions() {
    const biomeSelect = document.getElementById('biome-select');
    if (!biomeSelect) return;

    const currentValue = biomeSelect.value;
    let resetToDefault = false;

    Array.from(biomeSelect.options).forEach(option => {
        const requiredEvent = BIOME_EVENT_REQUIREMENTS[option.value];
        if (!requiredEvent) {
            option.disabled = false;
            option.removeAttribute('title');
            return;
        }
        const requiredEvents = Array.isArray(requiredEvent) ? requiredEvent : [requiredEvent];
        const enabled = requiredEvents.some(eventId => activeEvents.has(eventId));
        option.disabled = !enabled;
        if (!enabled) {
            const eventLabels = requiredEvents
                .map(eventId => EVENT_DEFINITIONS.find(event => event.id === eventId)?.label)
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
        biomeSelect.value = 'normal';
        if (typeof handleBiomeUI === 'function') {
            handleBiomeUI();
        }
    }

    refreshCustomSelect('biome-select');
}

function setEventActive(eventId, enabled) {
    if (!eventId) return;
    const hasEvent = activeEvents.has(eventId);
    if (enabled && !hasEvent) {
        activeEvents.add(eventId);
    } else if (!enabled && hasEvent) {
        activeEvents.delete(eventId);
    } else {
        return;
    }

    const eventMenu = document.getElementById('event-menu');
    if (eventMenu) {
        const checkbox = eventMenu.querySelector(`input[type="checkbox"][data-event-id="${eventId}"]`);
        if (checkbox && checkbox.checked !== enabled) {
            checkbox.checked = enabled;
        }
    }

    updateEventSummary();
    applyEventBiomeRestrictions();
}

function initializeEventSelectors() {
    const eventMenu = document.getElementById('event-menu');
    if (!eventMenu) return;

    const checkboxes = eventMenu.querySelectorAll('input[type="checkbox"][data-event-id]');
    checkboxes.forEach(input => {
        const eventId = input.dataset.eventId;
        input.checked = activeEvents.has(eventId);
        input.addEventListener('change', () => {
            setEventActive(eventId, input.checked);
        });
    });

    const details = document.getElementById('event-select');
    if (details) {
        details.addEventListener('toggle', () => {
            const summary = document.getElementById('event-summary');
            if (summary) {
                summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
            }
        });
    }

    updateEventSummary();
    applyEventBiomeRestrictions();
}

document.addEventListener('DOMContentLoaded', initializeEventSelectors);
document.addEventListener('DOMContentLoaded', updateOblivionPresetUi);

function initializeSingleSelect(selectId) {
    const select = document.getElementById(selectId);
    const details = document.querySelector(`details[data-select="${selectId}"]`);
    if (!select || !details) return;

    const summary = details.querySelector('.ui-select__summary');
    const menu = details.querySelector('.ui-select__menu');
    if (!summary || !menu) return;

    const placeholder = summary.dataset.placeholder || summary.textContent.trim();
    menu.innerHTML = '';

    const optionButtons = Array.from(select.options).map(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ui-select__option-button';
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
        summary.classList.toggle('field__input--placeholder', !selectedOption);
        summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');

        optionButtons.forEach(({ button, option }) => {
            const isActive = option.value === select.value;
            button.classList.toggle('ui-select__option-button--active', isActive);
            button.classList.toggle('ui-select__option-button--disabled', option.disabled);
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

    customSelectRegistry.set(selectId, { update: updateSummary });

    updateSummary();
}

function refreshCustomSelect(selectId) {
    const registryEntry = customSelectRegistry.get(selectId);
    if (registryEntry && typeof registryEntry.update === 'function') {
        registryEntry.update();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeSingleSelect('vip-select');
    initializeSingleSelect('dave-luck-select');
    initializeSingleSelect('biome-select');
});

// xp
function getXpForChance(chance) {
    if (chance >= 10000 && chance <= 99998) return 0;
    if (chance >= 99999 && chance <= 999999) return 0;
    if (chance >= 1000000 && chance <= 9999999) return 200;
    if (chance >= 10000000 && chance <= 99999998) return 2000;
    if (chance >= 99999999 && chance <= 1000000000) return 20000;
    if (chance > 1000000000) return 20000;
    return 0; // below 1m gives no XP under current rules
}
// end xp

function roll() {
    if (isRolling) return;

    isRolling = true;
    const rollButton = document.querySelector('.roll-button');
    const brandMark = document.querySelector('.brand__mark');
    rollButton.disabled = true;
    rollButton.style.opacity = '0.5';
    if (brandMark) {
        brandMark.classList.add('brand__mark--spinning');
    }
    
    playSound(document.getElementById('rollSound'));
    if (isNaN(parseInt(document.getElementById('rolls').value))) {
        document.getElementById('rolls').value = 1;
    }
    if (isNaN(parseInt(luck.value))) {
        luck.value = 1;
    }

    const total = parseInt(document.getElementById('rolls').value);
    const luckValue = Math.max(0, Number.parseFloat(luck.value) || 0);
    const biome = document.getElementById('biome-select').value;
    const activeEventSnapshot = new Set(activeEvents);
    const isEventAuraEnabled = aura => !aura.event || activeEventSnapshot.has(aura.event);
    
    results.innerHTML = `Rolling...`;
    let rolls = 0;
    const startTime = performance.now();
    
    auras.forEach(aura => {
        aura.wonCount = 0;
        aura.effectiveChance = aura.chance;
    });

    let btAuras = {};

    const progressContainer = document.querySelector('.progress');
    const progressFill = document.querySelector('.progress__fill');
    const progressText = document.querySelector('.progress__value');
    progressContainer.style.display = total >= 100000 ? 'grid' : 'none';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    let effectiveAuras;
    if (biome === "limbo") {
        effectiveAuras = auras.filter(aura =>
            !aura.requiresOblivionPreset &&
            isEventAuraEnabled(aura) &&
            aura.exclusiveTo && (aura.exclusiveTo.includes("limbo") || aura.exclusiveTo.includes("limbo-null"))
        ).map(aura => {
            let effectiveChance = aura.chance;
            if (aura.breakthrough && aura.breakthrough.limbo) {
                effectiveChance = Math.floor(aura.chance / aura.breakthrough.limbo);
            }
            effectiveChance = Math.max(1, effectiveChance);
            aura.effectiveChance = effectiveChance;
            return aura;
        }).sort((a, b) => b.effectiveChance - a.effectiveChance);
    } else {
        const isRoe = biome === "roe";
        const glitchLikeBiome = biome === "glitch" || isRoe;
        const exclusivityBiome = isRoe ? "glitch" : biome;
        effectiveAuras = auras.map(aura => {
            if (aura.requiresOblivionPreset) {
                aura.effectiveChance = Infinity;
                return aura;
            }
            if (!isEventAuraEnabled(aura)) {
                aura.effectiveChance = Infinity;
                return aura;
            }
            if (isRoe && ROE_EXCLUDED_AURAS.has(aura.name)) {
                aura.effectiveChance = Infinity;
                return aura;
            }
            if (aura.exclusiveTo) {
                if (aura.exclusiveTo.includes("limbo") && !aura.exclusiveTo.includes("limbo-null")) {
                    aura.effectiveChance = Infinity;
                    return aura;
                }
                const allowEventGlitchAccess = glitchLikeBiome && aura.event &&
                    activeEventSnapshot.has(aura.event) &&
                    EVENTS_ALLOWING_GLITCH_ACCESS.has(aura.event);
                if (!aura.exclusiveTo.includes("limbo-null") && !aura.exclusiveTo.includes(exclusivityBiome) && !allowEventGlitchAccess) {
                    aura.effectiveChance = Infinity;
                    return aura;
                }
            }
            let effectiveChance = aura.chance;
            if (aura.breakthrough) {
                if (glitchLikeBiome && (!isRoe || !ROE_BREAKTHROUGH_EXCLUSIONS.has(aura.name))) {
                    let minChance = aura.chance;
                    for (const mult of Object.values(aura.breakthrough)) {
                        minChance = Math.min(minChance, Math.floor(aura.chance / mult));
                    }
                    effectiveChance = minChance;
                } else if (aura.breakthrough[biome]) {
                    effectiveChance = Math.floor(aura.chance / aura.breakthrough[biome]);
                }
            }
            effectiveChance = Math.max(1, effectiveChance);
            aura.effectiveChance = effectiveChance;
            return aura;
        }).sort((a, b) => b.effectiveChance - a.effectiveChance)
        .filter(aura => aura.effectiveChance !== Infinity);
    }

    const activeOblivionAura = (isOblivionPresetActive && luckValue >= OBLIVION_PRESET_LUCK) ? oblivionAuraDefinition : null;
    const activeMemoryAura = (isOblivionPresetActive && luckValue >= OBLIVION_PRESET_LUCK) ? memoryAuraDefinition : null;

    const CHUNK_SIZE = 100000;
    let currentRoll = 0;

    function processChunk() {
        const chunkEnd = Math.min(currentRoll + CHUNK_SIZE, total);
        
        for (let i = currentRoll; i < chunkEnd; i++) {
            if (activeOblivionAura) {
                if (Random(1, OBLIVION_POTION_ROLL_ODDS) === 1) {
                    const specialAura = (activeMemoryAura && Random(1, OBLIVION_MEMORY_ROLL_ODDS) === 1)
                        ? activeMemoryAura
                        : activeOblivionAura;
                    specialAura.wonCount++;
                    rolls++;
                    continue;
                }
            }
            for (let aura of effectiveAuras) {
                let chance = aura.effectiveChance;
                let usedBT = aura.effectiveChance !== aura.chance;
                let btChance = usedBT ? aura.effectiveChance : null;
                
                let successThreshold;
                if (aura.ignoreLuck) {
                    const fixedThreshold = Number.isFinite(aura.fixedRollThreshold) ? aura.fixedRollThreshold : 1;
                    successThreshold = Math.max(0, Math.min(chance, fixedThreshold));
                } else {
                    successThreshold = Math.min(chance, luckValue);
                }
                if (successThreshold > 0 && Random(1, chance) <= successThreshold) {
                    aura.wonCount++;
                    if (usedBT) {
                        if (!btAuras[aura.name]) {
                            btAuras[aura.name] = { count: 0, btChance: btChance };
                        }
                        btAuras[aura.name].count++;
                    }
                    break;
                }
            }
            rolls++;
        }

        currentRoll = chunkEnd;
        const progress = (currentRoll / total) * 100;
        if (total >= 100000) {
            requestAnimationFrame(() => {
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${Math.floor(progress)}%`;
            });
        }

        if (currentRoll < total) {
            setTimeout(processChunk, 0);
        } else {
            progressContainer.style.display = 'none';
            rollButton.disabled = false;
            rollButton.style.opacity = '1';
            if (brandMark) {
                brandMark.classList.remove('brand__mark--spinning');
            }
            isRolling = false;

            const endTime = performance.now();
            const executionTime = ((endTime - startTime) / 1000).toFixed(0);

            if (cutscenesEnabled) {
                const cutsceneQueue = [];
                for (const videoId of cutscenePriority) {
                    const aura = auras.find(entry => entry.cutscene === videoId);
                    if (aura && aura.wonCount > 0) {
                        cutsceneQueue.push(videoId);
                    }
                }
                if (cutsceneQueue.length > 0) {
                    playAuraSequence(cutsceneQueue);
                }
            }

            let highestChance = 0;
            for (let aura of auras) {
                if (aura.wonCount > 0 && aura.chance > highestChance) {
                    highestChance = aura.chance;
                }
            }

            if (highestChance >= 99999999) {
                if (biome === 'limbo') {
                    playSound(document.getElementById('limbo99mSound'));
                } else {
                    playSound(document.getElementById('100mSound'));
                }
            } else if (highestChance >= 10000000) {
                playSound(document.getElementById('10mSound'));
            } else if (highestChance >= 1000000) {
                playSound(document.getElementById('100kSound'));
            } else if (highestChance >= 100000) {
                playSound(document.getElementById('10kSound'));
            } else if (highestChance >= 1000) {
                playSound(document.getElementById('1kSound'));
            }

            let resultText = `
            Execution time: ${executionTime} seconds. <br> 
            Rolls: ${rolls.toLocaleString()}<br>
            Luck: ${parseFloat(luck.value).toLocaleString()}<br><br>
            `;
            let resultEntries = [];
            for (let aura of auras) {
                if (aura.wonCount > 0) {
                    let rarityClass = getRarityClass(aura, biome);
                    let specialClass = getAuraStyleClass(aura);
                    let eventClass = aura.event ? 'aura-event-text' : '';
                    let classAttr = [rarityClass, specialClass, eventClass].filter(Boolean).join(' ');
                    const formattedName = renderAuraName(aura);
                    if (btAuras[aura.name]) {
                        let btName = aura.name.replace(
                            /-\s*[\d,]+/,
                            `- ${btAuras[aura.name].btChance.toLocaleString()}`
                        );
                        const nativeLabel = renderAuraName(aura, btName);
                        resultEntries.push({
                            label: `<span class="${classAttr}">[Native] ${nativeLabel} | Times Rolled: ${btAuras[aura.name].count.toLocaleString()}</span>`,
                            chance: getResultSortChance(aura, btAuras[aura.name].btChance)
                        });
                        if (aura.wonCount > btAuras[aura.name].count) {
                            resultEntries.push({
                                label: `<span class="${classAttr}">${formattedName} | Times Rolled: ${(aura.wonCount - btAuras[aura.name].count).toLocaleString()}</span>`,
                                chance: getResultSortChance(aura, aura.chance)
                            });
                        }
                    } else {
                        resultEntries.push({
                            label: `<span class="${classAttr}">${formattedName} | Times Rolled: ${aura.wonCount.toLocaleString()}</span>`,
                            chance: getResultSortChance(aura, aura.chance)
                        });
                    }
                }
            }
            resultEntries.sort((a, b) => b.chance - a.chance);
            for (let entry of resultEntries) {
                resultText += entry.label + "<br>";
            }

            // xp
            let totalXP = 0;
            let xpLines = [];
            for (let aura of auras) {
                if (aura.wonCount > 0) {
                    const xpPer = getXpForChance(aura.chance);
                    const auraXp = xpPer * aura.wonCount;
                    if (xpPer > 0) {
                        totalXP += auraXp;
                    }
                }
            }

            resultText += `<br><strong>Total XP Earned: ${totalXP.toLocaleString()}</strong><br>`;
            for (let line of xpLines) {
                resultText += line + "<br>";
            }
            // end xp

            results.innerHTML = resultText;
        }
    }

    setTimeout(processChunk, 0);
}

