// Basic and final multipliers must stay separate around special potion luck.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const main = read('scripts/main.js');
const context = vm.createContext({});
const functions = ['getDevAdminAbuseConfig', 'getSelectedDevAdminAbuseVariant', 'getDevAdminAbuseMultiplier', 'getDevAdminAbuseBasicMultiplier'];
vm.runInContext(read('scripts/gear-luck.js') + '\n'
    + main.slice(main.indexOf('const DEV_ADMIN_ABUSE_DEFAULT_VARIANT'), main.indexOf('const ROE_NATIVE_BIOMES')) + '\n'
    + functions.map(name => {
        const start = main.indexOf(`function ${name}(`);
        assert(start >= 0);
        return main.slice(start, main.indexOf('\n}', start) + 2);
    }).join('\n'), context);
const basic = () => context.getDevAdminAbuseBasicMultiplier('edict');
const final = () => context.getDevAdminAbuseMultiplier('edict');
const luck = (base, potion, state = context.GearLuck.rollState('none', 1)) => context.GearLuck.totalLuck(base, potion, final(), state, basic());
assert.equal(basic(), 1.5);
assert.equal(final(), 1.5);
assert.equal(luck(1, 0), 2.25);
assert.equal(luck(10, 100), 172.5, 'The basic boost must not multiply special potion luck');
assert.equal(luck(10, 100, context.GearLuck.rollState('none', 10)), 195);
assert.equal(luck(10, 100, context.GearLuck.rollState('ominous-coffin', 1)), 180.375, 'Device and biome basic multipliers stack');
assert(Math.abs(luck(10, 100, context.GearLuck.rollState('gemstone', 11, 0.3)) - 173.175) < 1e-9);
vm.runInContext("devAdminAbuseVariantSelections.edict = 'old';", context);
assert.equal(basic(), 1);
assert.equal(final(), 1.2);
assert.equal(luck(10, 100), 132);
for (const [biome, multiplier] of [['normal', 1], ['anotherRealm', 1.2], ['mastermind', 1.2], ['fullMoon', 1.5]]) {
    assert.equal(context.getDevAdminAbuseBasicMultiplier(biome), 1);
    assert.equal(context.getDevAdminAbuseMultiplier(biome), multiplier);
}
assert.equal(context.GearLuck.totalLuck(10, 100, 1.2, context.GearLuck.rollState('none', 1)), 132, 'Existing callers keep the same default calculation');
console.log('Passed: New/Old Word, basic-before-potion ordering, bonus rolls, device multiplier stacking, Gemstone luck, and other developer biome effects.');
