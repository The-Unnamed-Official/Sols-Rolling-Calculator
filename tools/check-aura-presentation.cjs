// Verify safe wiki descriptions and reciprocal mutation navigation across the roster.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const {createRichText, safeStyle} = require('./aura-rich-text.cjs');
const rich = createRichText({
    biomes: [{labels: ['Rainy'], sigil: 'biome-sigil--rainy'}],
    auras: {Poseidon: {markup: '<span>Poseidon</span>'}},
    items: {'Heavenly Potion': {markup: '<span>Heavenly Potion</span>'}}
});
const description = rich.markup(`<center>'''{{Biome|Rainy}}'''<br><span style="color: #110d61; -webkit-text-stroke: 1px #272da3" onclick="alert(1)">hunter</span> {{Aura|Poseidon}} {{Item|Heavenly Potion}} {{Rarity|Dimensional}}</center>`);
for (const snippet of ['<strong>', '<br>', 'biome-sigil--rainy', 'wiki-title--aura', 'wiki-title--item', 'rarity-tier-dimensional', '-webkit-text-stroke:1px #272da3']) assert(description.includes(snippet), snippet);
assert.doesNotMatch(description, /onclick|\u0000/);
const unsafe = rich.markup('<script>alert(1)</script><img src=x onerror="alert(2)"><span class="arbitrary" style="color:red;background:url(javascript:alert(3))" onmouseover="alert(4)">safe</span> &lt;iframe&gt;');
assert.doesNotMatch(unsafe, /<script|<img|<iframe|onerror|onmouseover|javascript:|class="arbitrary"/);
assert.match(unsafe, /&lt;iframe&gt;/);
assert.equal(safeStyle('color:red;position:fixed;background:url(https://example.com)'), 'color:red');
const history = JSON.parse(read('data/auras/history.json'));
const quote = rich.description(history.profiles['Abyssal Hunter'].versions[0]);
assert.match(quote, /unknown hunter/);
assert.match(quote, /-webkit-text-stroke:/);
const catalogue = JSON.parse(read('data/auras/catalogue.json'));
const familyMembers = new Map();
for (const aura of catalogue) {
    const html = read(`auras/${aura.slug}/index.html`);
    const navigation = /<nav class="aura-mutations"[\s\S]*?<\/nav>/.exec(html)?.[0];
    if (!navigation) continue;
    const members = [...navigation.matchAll(/href="\.\.\/([^/]+)\/index.html"/g)].map(match => match[1]).sort();
    assert.equal((navigation.match(/aria-current="page"/g) || []).length, 1, `${aura.title}: one active family member`);
    assert(members.includes(aura.slug), `${aura.title}: active aura must appear in its family`);
    assert.equal(new Set(members).size, members.length, `${aura.title}: duplicate mutation links`);
    familyMembers.set(aura.slug, members);
}
for (const [slug, members] of familyMembers) for (const member of members) assert.deepEqual(familyMembers.get(member), members, `${slug}: ${member} must link back to the same family`);
assert(familyMembers.get('astral').includes('astral-legendarium'));
assert(familyMembers.get('poseidon').includes('poseidon-atlantis'));
console.log(`Passed: styled descriptions are safely rendered and ${familyMembers.size} profiles have reciprocal mutation navigation.`);
