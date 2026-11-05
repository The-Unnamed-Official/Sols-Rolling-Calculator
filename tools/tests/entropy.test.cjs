const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../scripts/core/utils.js'), 'utf8');
function originalEngine(a, b, c, d) {
    const word = value => (value >>> 0) & 0xffffffff;
    return () => {
        a = word(a); b = word(b); c = word(c); d = word(d);
        const t = (word(a + b) + d) | 0;
        d = (d + 1) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        c = (c + t) | 0;
        return (t >>> 0) / 0x100000000;
    };
}
function toolkit(seeds) {
    let index = 0;
    const context = { Intl, crypto:{getRandomValues(buffer) {buffer[0] = seeds[index++]; return buffer;}} };
    vm.runInNewContext(source, context);
    return context;
}
test('entropy optimization preserves one million original sfc32 outputs across overflow seeds', () => {
    for (const seeds of [[0,0,0,0], [0xffffffff,0xffffffff,0xffffffff,0xffffffff],
        [0x80000000,0x7fffffff,0,0xffffffff], [1,2,3,4], [19313,761,127,1013904223]]) {
        const expected = originalEngine(...seeds), actual = toolkit(seeds).drawEntropy;
        for (let warmup = 0; warmup < 12; warmup++) expected();
        for (let draw = 0; draw < 200000; draw++) assert.equal(actual(), expected());
    }
});
test('integer and decimal helpers preserve stream order and edge behavior', () => {
    const seeds = [1,2,3,4], expected = originalEngine(...seeds), actual = toolkit(seeds);
    for (let warmup = 0; warmup < 12; warmup++) expected();
    assert.equal(actual.randomIntegerBetween(7, 7), 7);
    assert.equal(actual.randomIntegerBetween(10, 0), 10);
    for (let draw = 0; draw < 10000; draw++) {
        assert.equal(actual.randomIntegerBetween(-3.4, 20.8), -3 + Math.floor(expected() * 24));
        assert.equal(actual.randomDecimalBetween(.1, 100.5), expected() * 100.4 + .1);
        assert.equal(actual.drawEntropy(), expected());
    }
});
