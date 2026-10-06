// Only videos explicitly documented under an aura's cutscene or ability section.
const fs=require('node:fs');
const path=require('node:path');
const {templates,plainText}=require('./fetch-aura-wiki.cjs');
const {fileKey}=require('./aura-history-parser.cjs');
const target=path.join(__dirname,'../data/auras/showcases.json');
const uploads=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{};
function htmlTabbers(text) {
    for(const body of templates(text,'#tag:tabber')) {
        text=text.replace('{{'+body+'}}','<tabber>'+htmlTabbers(body.replace(/^\s*#tag:tabber\s*\|/i,''))+'</tabber>');
    }
    return text.replace(/\{\{!\}\}-\{\{!\}\}/g,'|-|').replace(/<tabber>\s*([^\s|=\n<>][^=\n<>]*)=/gi,'<tabber>|-|$1=');
}
function candidates(text='') {
    text=htmlTabbers(text.replace(/<!--[\s\S]*?-->/g,''));
    const headings=[...text.matchAll(/^(={2,6})([^\n]+?)\1\s*$/gm)].map(match=>({start:match.index,end:match.index+match[0].length,level:match[1].length,title:plainText(match[2])}));
    const results=[];
    for(const heading of headings.filter(h=>/\b(?:cutscenes?|abilit(?:y|ies))\b/i.test(h.title)).sort((a,b)=>b.level-a.level||a.start-b.start)) {
        const kind=/cutscene/i.test(heading.title)?'cutscene':'ability';
        const end=headings.find(h=>h.start>heading.start&&h.level<=heading.level)?.start??text.length;
        const section=text.slice(heading.end,end),labels=[];
        const tokens=/<\/?tabber\b[^>]*>|\|-\|\s*([^=\n]+)=|\[\[(?:File|Image):([^|\]]+\.(?:mp4|webm|mov|mkv))(?=[|\]])/gi;
        for(const match of section.matchAll(tokens)) {
            if(/^<\/tabber/i.test(match[0])) labels.pop();
            else if(/^<tabber/i.test(match[0])) labels.push('');
            else if(match[1]) labels[labels.length-1]=plainText(match[1]);
            else if(match[2]) {
                const label=labels.filter(Boolean).join(' · ')||heading.title.replace(/^Ability\s*:\s*/i,'')||'Current';
                if(/\b(?:leaked?|concept|teaser|submission|bugged|scrapped)\b/i.test(label)) continue;
                const file=match[2].trim().replace(/_/g,' ');
                if(!results.some(item=>item.kind===kind&&fileKey(item.file)===fileKey(file))) results.push({file,kind,label});
            }
        }
    }
    return results.sort((a,b)=>a.kind.localeCompare(b.kind));
}
function showcases(a,{historical=false}={}) {
    return candidates(a.text).map(item=>{
        const key=fileKey(item.file);
        const media=(historical&&uploads[key+'|'+a.timestamp])||uploads[key];
        if(historical&&(!media?.timestamp||media.timestamp>a.timestamp)) return null;
        return media?{...item,...media,articleSource:a.source+'?oldid='+a.revisionId}:null;
    }).filter(Boolean);
}
module.exports={candidates,showcases};
