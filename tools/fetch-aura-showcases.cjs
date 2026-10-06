// Resolve video metadata through the public MediaWiki API, without downloading videos.
const fs=require('node:fs');
const path=require('node:path');
const {candidates}=require('./aura-showcases.cjs');
const {article,fileKey}=require('./aura-history-parser.cjs');
const root=path.resolve(__dirname,'..');
async function fetchShowcases() {
    const cache=path.join(root,'test-results/aura-history');
    const pages=JSON.parse(fs.readFileSync(path.join(cache,'articles.json'),'utf8'));
    const snapshots=['snapshots.json','gallery-snapshots.json'].flatMap(file=>JSON.parse(fs.readFileSync(path.join(cache,file),'utf8'))).filter(s=>s.page.revisions).map(s=>s.page);
    pages.push(...snapshots);
    const files=new Map();
    for(const page of pages) for(const item of candidates(page.revisions?.[0]?.slots.main.content||'')) files.set(fileKey(item.file),item.file);
    const target=path.join(root,'data/auras/showcases.json');
    const resolved=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{};
    const missing=[...files].filter(([key])=>!resolved[key]?.timestamp);
    for(let offset=0;offset<missing.length;offset+=100) {
        const batches=await Promise.all([missing.slice(offset,offset+50),missing.slice(offset+50,offset+100)].filter(chunk=>chunk.length).map(async chunk=>{
            const query=new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'imageinfo',iiprop:'url|mime|size|timestamp',titles:chunk.map(([,file])=>'File:'+file).join('|')});
            const response=await fetch('https://sol-rng.fandom.com/api.php?'+query,{signal:AbortSignal.timeout(30000)});
            if(!response.ok) throw new Error('Wiki video HTTP '+response.status);
            const data=await response.json();
            if(data.error) throw new Error(data.error.info);
            return data.query.pages;
        }));
        for(const pages of batches) for(const page of pages) {
            const info=page.imageinfo?.[0];
            if(!info||!/^video\//.test(info.mime)) continue;
            const file=page.title.replace(/^File:/,'');
            resolved[fileKey(file)]={file,url:info.url,source:info.descriptionurl,mime:info.mime,timestamp:info.timestamp};
        }
        fs.writeFileSync(target,JSON.stringify(resolved,null,2)+'\n');
        console.log(`Resolved ${Object.keys(resolved).length} showcase uploads`);
    }
    const archived=new Map();
    for(const page of snapshots) {
        const a=article(page);
        for(const item of candidates(a.text)) {
            const key=fileKey(item.file),archiveKey=key+'|'+a.timestamp;
            if(resolved[key]?.timestamp>a.timestamp&&!resolved[archiveKey]) archived.set(archiveKey,{file:item.file,timestamp:a.timestamp});
        }
    }
    for(const [archiveKey,item] of archived) {
        const query=new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'imageinfo',iiprop:'url|mime|timestamp',iilimit:'1',iistart:item.timestamp,titles:'File:'+item.file});
        const response=await fetch('https://sol-rng.fandom.com/api.php?'+query,{signal:AbortSignal.timeout(30000)});
        if(!response.ok) throw new Error('Wiki archived video HTTP '+response.status);
        const data=await response.json();
        if(data.error) throw new Error(data.error.info);
        const info=data.query.pages[0]?.imageinfo?.[0];
        if(info&&/^video\//.test(info.mime)&&info.timestamp<=item.timestamp) resolved[archiveKey]={file:item.file,url:info.url,source:info.descriptionurl,mime:info.mime,timestamp:info.timestamp};
    }
    fs.writeFileSync(target,JSON.stringify(resolved,null,2)+'\n');
    console.log(`Resolved ${Object.keys(resolved).length} current and archived showcase uploads`);
}
if(require.main===module)fetchShowcases().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fetchShowcases};
