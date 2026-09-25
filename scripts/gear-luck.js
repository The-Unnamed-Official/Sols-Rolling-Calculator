/* Equipment and roll timing. Pure functions shared by previews and simulations. */
(function (global) {
    'use strict';
    const gear = (id, name, luck = 0, effect = '', event = false) => Object.freeze({ id, name, luck, effect, event });
    const right = Object.freeze([
        gear('luck-glove', 'Luck Glove', 0.25), gear('desire-glove', 'Desire Glove', 0.4),
        gear('solar', 'Solar Device', 0.5), gear('eclipse', 'Eclipse Device', 0.5),
        gear('exo', 'Exo Gauntlet', 1), gear('windstorm', 'Windstorm Device', 1.15),
        gear('subzero', 'Subzero Device', 1.5), gear('frozen', 'Frozen Gauntlet', 1.5),
        gear('shining-star', 'Shining Star', 0.5, '+2.5 luck during Starfall; +0.5 otherwise.'),
        gear('galactic', 'Galactic Device', 2.5), gear('volcanic', 'Volcanic Device', 2.9),
        gear('exoflex', 'Exoflex Device', 3.4), gear('hologrammer', 'Hologrammer', 3.95),
        gear('ragnaroker', 'Ragnaröker', 4.55, '+4.55 luck, plus +0.45 during Windy, Rainy or Hell.'),
        gear('starshaper', 'Starshaper', 7), gear('neurolyzer', 'Neurolyzer', 8.5),
        gear('genesis', 'Genesis Drive', 12), gear('heavenly', 'Heavenly Device', 15),
        gear('singularity', 'Singularity Device', 22),
        gear('snow-rider', 'Snow Rider', 3, '', true),
        gear('vampire-hunter', 'Vampire Hunter', 2.4, '+2.4 luck; Halloween aura rarities reduced by 20% in Halloween 2025/2026 biomes and Glitched.', true)
    ]);
    const left = Object.freeze([
        gear('gemstone', 'Gemstone Gauntlet', 0, 'After 10 rolls, choose +0.00–0.30 luck (0.01 steps) for the next 10 rolls; reroll every 10 rolls.'),
        gear('jackpot', 'Jackpot Gauntlet', 0.77),
        gear('flesh', 'Flesh Device', 0, 'Every roll is a ×1.3 bonus roll.'),
        gear('gravitational', 'Gravitational Device', 0, '×6 bonus luck every 10th roll.'),
        gear('darkshader', 'Darkshader', 0, '×2 every 5th roll. After every 20th roll, the next 10 rolls gain ×2.5 basic luck.'),
        gear('pole-light', 'Pole Light Core Device', 5),
        gear('the-thing', 'The Thing', 0, '×11 bonus luck every 10th roll.'),
        gear('unfathomable', 'Unfathomable Ruins', 0, 'No bonus rolls. 1,000 normal rolls, then 100 rolls with ×14 basic luck; repeats.'),
        gear('present-giver', 'Present Giver', 0, '×5 bonus luck every 11th roll.', true),
        gear('xmas-champion', 'X-mas Champion', 0, '×4 bonus luck every 6th roll.', true),
        gear('tide', 'Tide Gauntlet', 0, '×2 every 10th roll, with native Rainy rarity for nonexclusive Rainy auras.', true),
        gear('blessed-tide', 'Blessed Tide Gauntlet', 0, '×3 every 6th roll, with native Rainy rarity for nonexclusive Rainy auras.', true),
        gear('ominous-coffin', 'Ominous Coffin', 0, '×1.35 basic luck before potions and VIP; normal bonus rolls remain.', true)
    ]);
    const pocket = Object.freeze([
        gear('sunstone', 'Sunstone Talisman', 1, '+1 luck during daytime only.'),
        gear('moonstone', 'Moonstone Talisman', 1, '+1 luck during nighttime only.'),
        gear('day-night', 'Day and Night Talisman', 1.25, '+1.25 luck during daytime or nighttime.'),
        gear('overtime', 'Overtime Talisman', 2), gear('soul-collector', "Soul Collector's Talisman", 4),
        gear('soul-master', "Soul Master's Talisman", 7.5)
    ]);
    const catalog = Object.freeze({ right, left, pocket });
    const find = (slot, id) => catalog[slot]?.find(item => item.id === id) || null;
    function basicLuck(loadout, base = 1, buffs = 0, biome = 'normal', time = 'none') {
        const rightItem = find('right', loadout.right);
        let rightLuck = rightItem?.luck || 0;
        if (loadout.right === 'shining-star' && biome === 'starfall') rightLuck = 2.5;
        if (loadout.right === 'ragnaroker' && ['windy', 'rainy', 'hell'].includes(biome)) rightLuck += 0.45;
        let pocketLuck = find('pocket', loadout.pocket)?.luck || 0;
        const day = time === 'day' || biome === 'day';
        const night = time === 'night' || biome === 'night';
        if ((loadout.pocket === 'sunstone' && !day) || (loadout.pocket === 'moonstone' && !night)
            || (loadout.pocket === 'day-night' && !day && !night)) pocketLuck = 0;
        return Math.max(0, base) + Math.max(0, buffs) + rightLuck + (find('left', loadout.left)?.luck || 0) + pocketLuck;
    }
    function bonusRule(leftId) {
        const rules = { flesh: [1, 1.3], gravitational: [10, 6], darkshader: [5, 2],
            'the-thing': [10, 11], 'present-giver': [11, 5], 'xmas-champion': [6, 4],
            'blessed-tide': [6, 3], unfathomable: [0, 1] };
        const [interval, multiplier] = rules[leftId] || [10, 2];
        return { interval, multiplier };
    }
    function rollState(leftId, roll, extraLuck = 0) {
        const { interval, multiplier } = bonusRule(leftId);
        const bonus = interval > 0 && roll % interval === 0;
        let basicMultiplier = leftId === 'ominous-coffin' ? 1.35 : 1;
        if (leftId === 'darkshader' && roll > 20 && (roll - 1) % 20 < 10) basicMultiplier = 2.5;
        if (leftId === 'unfathomable' && (roll - 1) % 1100 >= 1000) basicMultiplier = 14;
        return { basicMultiplier, bonusMultiplier: bonus ? multiplier : 1, extraLuck,
            bonus, rainyNative: bonus && ['tide', 'blessed-tide'].includes(leftId) };
    }
    function totalLuck(basic, special, finalMultiplier, state) {
        return ((basic + state.extraLuck) * state.basicMultiplier * state.bonusMultiplier + special) * finalMultiplier;
    }
    // A bounded schedule keeps trillion-roll runs from allocating per-roll records.
    // Gemstone holds one random hundredth-step buff throughout each ten-roll block.
    function schedule(leftId) {
        const states = [];
        const indices = new Map();
        const index = state => {
            const key = JSON.stringify(state);
            if (!indices.has(key)) { indices.set(key, states.length); states.push(state); }
            return indices.get(key);
        };
        const period = leftId === 'unfathomable' ? 1100 : leftId === 'darkshader' ? 20 : bonusRule(leftId).interval || 1;
        const at = roll => leftId === 'gemstone' && roll > 10
            ? Array.from({ length: 31 }, (_, extra) => index(rollState(leftId, roll, extra / 100)))
            : index(rollState(leftId, roll));
        const prefixLength = leftId === 'darkshader' ? 20 : leftId === 'gemstone' ? 10 : 0;
        const prefix = Array.from({ length: prefixLength }, (_, i) => at(i + 1));
        const pattern = Array.from({ length: period }, (_, i) => at(prefix.length + i + 1));
        return { states, prefix, pattern, heldRandomEvery: leftId === 'gemstone' ? 10 : 0 };
    }
    function describe(leftId) {
        return find('left', leftId)?.effect || `×${bonusRule(leftId).multiplier} bonus luck every ${bonusRule(leftId).interval}th roll.`;
    }
    function statesInRange(timing, start, count) {
        const indices = new Set();
        const add = entry => (Array.isArray(entry) ? entry : [entry]).forEach(index => indices.add(index));
        const end = start + count;
        for (let roll = start; roll < Math.min(end, timing.prefix.length); roll++) add(timing.prefix[roll]);
        const cycleStart = Math.max(start, timing.prefix.length);
        for (let roll = cycleStart; roll < Math.min(end, cycleStart + timing.pattern.length); roll++) {
            add(timing.pattern[(roll - timing.prefix.length) % timing.pattern.length]);
        }
        return [...indices];
    }
    global.GearLuck = Object.freeze({ catalog, find, basicLuck, bonusRule, rollState, totalLuck, schedule, statesInRange, describe });
})(globalThis);
