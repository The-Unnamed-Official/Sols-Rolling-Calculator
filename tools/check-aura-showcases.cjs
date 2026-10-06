const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {candidates}=require('./aura-showcases.cjs');
const history=JSON.parse(read('data/auras/history.json'));
const catalogue=JSON.parse(read('data/auras/catalogue.json'));
const escape=value=>value.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
let profiles=0,recordings=0;
for(const aura of catalogue) {
    const html=read(`auras/${aura.slug}/index.html`),versions=history.profiles[aura.title].versions;
    const videos=versions.flatMap(version=>version.showcases||[]);
    if(videos.length) profiles++;
    recordings+=videos.length;
    assert.equal((html.match(/data-aura-showcase\b/g)||[]).length,videos.length,`${aura.title}: missing or repeated showcase`);
    for(const video of videos) {
        assert(['cutscene','ability'].includes(video.kind));
        assert(/^video\//.test(video.mime));
        assert.equal(new URL(video.url).hostname,'static.wikia.nocookie.net');
        assert.equal(new URL(video.source).hostname,'sol-rng.fandom.com');
        assert.equal(new URL(video.articleSource).hostname,'sol-rng.fandom.com');
        assert(new URL(video.articleSource).searchParams.get('oldid'));
        assert(!/\|-\||<tabber>|\{\{/.test(video.label),`${aura.title}: malformed wiki version label`);
        assert(!/\b(?:leaked?|concept|teaser|submission|bugged)\b/i.test(video.label));
        assert(html.includes(`data-showcase-src="${escape(video.url)}"`));
    }
    for(const version of versions.slice(1)) for(const video of version.showcases||[]) {
        if(version.timestamp) assert(video.timestamp<=version.timestamp,`${aura.title}: a newer replacement upload cannot represent this historical version`);
    }
    for(const match of html.matchAll(/<video\b[^>]*data-showcase-src[^>]*>/g)) {
        assert(!/\ssrc=|\sautoplay\b/.test(match[0]),`${aura.title}: showcases must not compete with previews on page load`);
        assert.match(match[0],/controlslist="nodownload noremoteplayback" disablepictureinpicture disableremoteplayback playsinline preload="none"/);
        assert(!/\scontrols(?:\s|=|>)/.test(match[0]),`${aura.title}: native controls must be replaced by custom controls`);
    }
    if(videos.length) assert(html.indexOf('data-aura-viewer')<html.indexOf('class="aura-showcases"')&&html.indexOf('class="aura-showcases"')<html.indexOf('class="aura-version-information"'),`${aura.title}: showcases belong beneath the images`);
}
const current=title=>history.profiles[title].versions[0].showcases;
assert(current('Abyssal Hunter').some(video=>video.kind==='ability'&&video.file==='Abyssal Hunter Form Shift.mp4'));
assert(current('Abyssal Hunter').some(video=>video.label==='Eon 1-29'&&video.file==='Fish cutscene new.mp4'));
assert(current('Archangel').some(video=>video.label==='Current Opening · Collection'&&video.file==='ArchangelOpening.mp4'));
assert(current('Archangel').some(video=>video.label==='Older Opening'&&video.file==='Archangelopening.mp4'));
assert(!current('Archangel').some(video=>/Leak/.test(video.file)));
assert(current('Bloodlust').some(video=>video.kind==='ability'&&video.label==='Bloodthirst'));
assert.equal(current('Common').length,0);
const nyctophobiaOld=history.profiles.Nyctophobia.versions.slice(1).flatMap(version=>version.showcases||[]).find(video=>video.file==='Nyctophobiacutscene.mp4');
assert(nyctophobiaOld,'Nyctophobia needs its recoverable older cutscene');
assert.notEqual(nyctophobiaOld.url,current('Nyctophobia').find(video=>video.file==='Nyctophobiacutscene.mp4')?.url,'Overwritten old cutscenes need their archived upload');
assert.deepEqual(candidates('==Trivia==\n[[File:Other aura cutscene.mp4]]'),[],'Unrelated gallery and trivia media must not become a showcase');
assert.deepEqual(candidates('===Ability===\n<tabber>Current=[[File:Attack.mp4]]|-|Old=[[File:AttackOld.mp4]]</tabber>').map(v=>v.label),['Current','Old']);
console.log(`Verified ${recordings} attributed showcase recordings across ${profiles} profiles; videos load only when opened.`);
