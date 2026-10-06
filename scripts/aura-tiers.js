/* The same rarity bands used by the simulator's plain aura names. */
(() => {
    const tiers = ['basic', 'epic', 'unique', 'legendary', 'mythic', 'exalted', 'glorious', 'transcendent', 'dimensional', 'challenged', 'challenged-plus', 'event', 'unobtainable', 'dev-exclusive', 'unknown'];
    const labels = { 'challenged-plus': 'Challenged+', 'dev-exclusive': 'Dev Exclusive', unknown: 'Unspecified' };
    const label = key => labels[key] || key[0].toUpperCase() + key.slice(1);
    function resolve(label, chance) {
        const name = String(label || '').toLowerCase().trim().replace('+', '-plus').replace(/\s+/g, '-');
        if (tiers.includes(name)) return name;
        if (!name && !chance) return 'unknown';
        if (chance >= 999999999) return 'transcendent';
        if (chance >= 99999999) return 'glorious';
        if (chance >= 9999999) return 'exalted';
        if (chance >= 999999) return 'mythic';
        if (chance >= 99999) return 'legendary';
        if (chance >= 9999) return 'unique';
        if (chance >= 999) return 'epic';
        return 'basic';
    }
    function sortGroup(tier, kind) {
        if (kind === 'Crafted') return 8;
        const index = tiers.indexOf(tier);
        return index < 0 ? tiers.length + 1 : index < 8 ? index : index + 1;
    }
    globalThis.AuraTiers = Object.freeze({ resolve, sortGroup, label, keys: Object.freeze(tiers) });
})();
