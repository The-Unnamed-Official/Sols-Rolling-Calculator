const fs=require('node:fs');
const path=require('node:path');
const {tabbers,fileKey}=require('./aura-history-parser.cjs');
const target=path.join(__dirname,'../data/auras/soundtracks.json');
const uploads=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{};
function currentMusic(raw='') {
    const tabs=tabbers(raw);
    if(tabs.length) raw=(tabs.find(tab=>/^(?:current|new|main)$/i.test(tab.label))||tabs[0]).content;
    return raw;
}
function soundtracks(raw='') {
    raw=currentMusic(raw);
    return [...raw.matchAll(/\[\[(?:File|Image):([^|\]]+\.(?:mp3|ogg|wav|m4a|opus))(?=[|\]])/gi)].map(match=>uploads[fileKey(match[1])]).filter(Boolean).filter((track,index,all)=>all.findIndex(other=>other.url===track.url)===index);
}
module.exports={soundtracks,currentMusic};
