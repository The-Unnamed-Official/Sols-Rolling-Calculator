// Resolve audio uploads through the public wiki API; never guess media URLs.
const fs=require('node:fs');
const path=require('node:path');
const {article,fileKey}=require('./aura-history-parser.cjs');
const root=path.resolve(__dirname,'..');
const cache=path.join(root,'test-results/aura-history');
async function fetchSoundtracks() {
    const pages=JSON.parse(fs.readFileSync(path.join(cache,'articles.json'),'utf8'));
    for(const file of ['snapshots.json','gallery-snapshots.json']) pages.push(...JSON.parse(fs.readFileSync(path.join(cache,file),'utf8')).filter(s=>s.page.revisions).map(s=>s.page));
    const files=new Map();
    for(const page of pages) {
        const infobox=article(page).infobox;
        for(const [field,value] of Object.entries(infobox)) if(/music/i.test(field)) for(const match of value.matchAll(/\[\[(?:File|Image):([^|\]]+\.(?:mp3|ogg|wav|m4a|opus))(?=[|\]])/gi)) files.set(fileKey(match[1]),match[1].trim().replace(/_/g,' '));
    }
    const target=path.join(root,'data/auras/soundtracks.json');
    const resolved=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{};
    const missing=[...files].filter(([key])=>!resolved[key]);
    for(let offset=0;offset<missing.length;offset+=100) {
        const results=await Promise.all([missing.slice(offset,offset+50),missing.slice(offset+50,offset+100)].filter(chunk=>chunk.length).map(async chunk=>{
            const query=new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'imageinfo',iiprop:'url|mime|size',titles:chunk.map(([,name])=>'File:'+name).join('|')});
            const response=await fetch('https://sol-rng.fandom.com/api.php?'+query,{signal:AbortSignal.timeout(30000)});
            if(!response.ok) throw new Error('Wiki audio HTTP '+response.status);
            const data=await response.json();
            if(data.error) throw new Error(data.error.info);
            return data.query.pages;
        }));
        for(const pages of results) for(const page of pages) {
            const info=page.imageinfo?.[0];
            if(!info||!/^audio\//.test(info.mime)) continue;
            const file=page.title.replace(/^File:/,'');
            resolved[fileKey(file)]={file,url:info.url,source:info.descriptionurl,mime:info.mime};
        }
        fs.writeFileSync(target,JSON.stringify(resolved,null,2)+'\n');
        console.log(`Resolved ${Object.keys(resolved).length} soundtrack uploads`);
    }
}
if(require.main===module)fetchSoundtracks().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fetchSoundtracks};
