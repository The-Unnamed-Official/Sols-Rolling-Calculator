const test = require('node:test');
const assert = require('node:assert/strict');
const { extract } = require('../fetch/fetch-aura-wiki.cjs');
const { article } = require('../lib/aura-history-parser.cjs');
const { currentMusic } = require('../lib/aura-soundtracks.cjs');
const { discover, updateProfile, mediaItem } = require('../fetch/refresh-aura-directory.cjs');

function page(text, title = 'Test aura') {
    return { title, revisions: [{ revid: 123, timestamp: '2026-11-04T12:00:00Z', slots: { main: { content: text } } }] };
}
function image(file) {
    return { file, caption: 'In game', url: `https://example.com/${file}`, mime: 'image/gif' };
}
function upload(file, mime = 'image/gif') {
    return { url: `https://example.com/${file}`, thumburl: `https://example.com/thumb/${file}.png`,
        descriptionurl: `https://example.com/wiki/File:${file}`, width: 1200, height: 900,
        thumbwidth: 640, thumbheight: 480, mime, timestamp: '2026-11-03T00:00:00Z' };
}

test('wiki requirements embedded in rarity survive numeric rarity formatting', () => {
    const trueAura = extract(page('{{NewAura Infobox|aura_rarity=Obtainable after rolling all Jade variants<br>1 in 10,250,000}}'));
    assert.equal(trueAura.obtainment, 'After rolling all Jade variants');
    const tomorrow = extract(page('{{NewAura Infobox|aura_rarity=Obtained after collecting The 7 Radiant Moons}}'));
    assert.equal(tomorrow.obtainment, 'After collecting The 7 Radiant Moons');
    assert.equal(extract(page('{{Aura Infobox|aura_rarity=1 in 100|obtainment=Complete the quest}}')).obtainment, 'Complete the quest');
});

test('a plain File: infobox image resolves to the upload without a duplicate namespace', () => {
    assert.equal(article(page('{{Aura Infobox|image1=File:Duke_Ingame.png}}')).images[0].media[0].file, 'Duke Ingame.png');
    assert.equal(article(page('{{Aura Infobox|image1=[[Image:Duke_Ingame.png]]}}')).images[0].media[0].file, 'Duke Ingame.png');
});

test('discovery checks the registry and all category pages as well as navigation', async () => {
    const calls = [];
    const titles = await discover({ pages: [{ title: 'Existing article' }] }, async parameters => {
        calls.push(parameters);
        if (parameters.titles) return { query: { pages: [page('[[Navigation article|{{Aura|Navigation article}}]]')] } };
        if (!parameters.cmcontinue) return { query: { categorymembers: [{ title: 'Category-only article' }] }, continue: { cmcontinue: 'next' } };
        return { query: { categorymembers: [{ title: 'Second category page' }] } };
    });
    for (const name of ['Existing article', 'Navigation article', 'Category-only article', 'Second category page', 'Tomorrow']) assert.ok(titles.includes(name), name);
    assert.equal(calls.filter(call => call.list === 'categorymembers').length, 2);
});

test('current placeholder soundtrack takes precedence over the earlier tab', () => {
    assert.equal(currentMusic('<tabber>Previous=Old song|-|Current (Placeholder)=New song</tabber>'), 'New song');
});

test('current profiles refresh fully while historical records and distinct old galleries survive', () => {
    const a = article(page(`{{Aura Infobox
|image1=<gallery>
Current.gif|In game
Old2.gif|Old
</gallery>
|music_name=<tabber>Previous=Old song [[File:Old.mp3]]|-|Current (Placeholder)=New song [[File:New.mp3]]</tabber>
|creator=Artist
}}
{{Quote|A full new description, with all of its words.|Description}}
==Cutscene==
[[File:New.webm]]`));
    const old = { id: 'version-1', label: 'Old', media: [image('Old1.gif')], description: 'Archived words',
        descriptionMarkup: 'Archived words', facts: { rarity: '1 in 10' }, soundtracks: [{ file: 'Old.mp3', url: 'https://archive.example/old.mp3' }], showcases: [] };
    const previous = { versions: [{ id: 'current', media: [image('Stale.gif')], timestamp: '2026-10-01T00:00:00Z' }, old] };
    const assets = { 'Current.gif': upload('Current.gif'), 'Old2.gif': upload('Old2.gif') };
    const audio = { 'New.mp3': { file: 'New.mp3', url: 'https://example.com/new.mp3' }, 'Old.mp3': { file: 'Old.mp3', url: 'https://new-cdn.example/old.mp3' } };
    const videos = { 'New.webm': { file: 'New.webm', url: 'https://example.com/new.webm', mime: 'video/webm' } };
    const result = updateProfile(a, previous, assets, audio, videos);
    assert.equal(result.versions[0].description, 'A full new description, with all of its words.');
    assert.equal(result.versions[0].descriptionTruncated, false);
    assert.equal(result.versions[0].media[0].file, 'Current.gif');
    assert.equal(result.versions[0].soundtracks[0].file, 'New.mp3');
    assert.equal(result.versions[0].showcases[0].file, 'New.webm');
    assert.deepEqual(result.versions[1], old);
    assert.equal(result.versions[2].media[0].file, 'Old2.gif');
    assert.equal(result.versions.length, 3, 'The archived track is deduplicated by file even when its CDN URL changes');
    assert.deepEqual(updateProfile(a, result, assets, audio, videos), result, 'A cached refresh is idempotent');
});

test('gallery videos keep their video URL and old-only galleries stay historical', () => {
    assert.equal(mediaItem({ file: 'Aura.webm' }, upload('Aura.webm', 'video/webm')).url, 'https://example.com/Aura.webm');
    const a = article(page('{{Aura Infobox|image1=<gallery>Old.gif|Old</gallery>}}'));
    const profile = updateProfile(a, null, { 'Old.gif': upload('Old.gif') }, {}, {});
    assert.deepEqual(profile.versions[0].media, []);
    assert.equal(profile.versions[1].media[0].file, 'Old.gif');
});
