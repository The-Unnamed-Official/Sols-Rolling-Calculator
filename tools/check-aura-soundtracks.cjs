const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const history=JSON.parse(read('data/auras/history.json'));
const catalogue=JSON.parse(read('data/auras/catalogue.json'));
let profiles=0,tracks=0;
for(const aura of catalogue) {
    const profile=history.profiles[aura.title],html=read(`auras/${aura.slug}/index.html`);
    const audio=profile.versions.flatMap(version=>version.soundtracks||[]);
    if(audio.length) profiles++;
    tracks+=audio.length;
    assert.equal((html.match(/data-aura-soundtrack>/g)||[]).length,audio.length,`${aura.title}: each sourced track needs its own player`);
    for(const track of audio) {
        assert.equal(new URL(track.url).hostname,'static.wikia.nocookie.net');
        assert.equal(new URL(track.source).hostname,'sol-rng.fandom.com');
        assert.match(track.mime,/^audio\//);
        assert(html.includes('data-soundtrack-src="'+track.url.replaceAll('&','&amp;')+'"'));
    }
    for(const tag of html.matchAll(/<audio[^>]+>/g)) {
        assert.match(tag[0],/preload="none"/,'Soundtracks must leave download bandwidth to the image until Play');
        assert.doesNotMatch(tag[0],/\ssrc=|\sautoplay/);
    }
}
const chromatic=history.profiles.Chromatic.versions;
assert.match(chromatic[0].soundtracks[0].file,/Panorama/);
assert.match(chromatic.find(version=>version.label==='Old').soundtracks[0].file,/ReConstruct/);
assert.equal(history.profiles.Common.versions[0].soundtracks.length,0);
console.log(`Passed: ${tracks} playable, attributed soundtrack sources across ${profiles} aura profiles; current and historical tracks remain separate.`);
