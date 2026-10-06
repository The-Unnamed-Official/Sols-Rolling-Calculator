// Audit every directory aura through the public MediaWiki API.
// Raw source cache is local; the reviewed history snapshot is build input.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const cache = path.join(root, 'test-results/aura-history');
fs.mkdirSync(cache, { recursive: true });
async function api(parameters) {
    const url = 'https://sol-rng.fandom.com/api.php?' + new URLSearchParams({format:'json', formatversion:'2', ...parameters});
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const response = await fetch(url, {signal:AbortSignal.timeout(30000)});
            if (!response.ok) throw new Error('Wiki HTTP ' + response.status);
            const data = await response.json();
            if (data.error) throw new Error(data.error.info);
            return data;
        } catch (error) { if (attempt === 3) throw error; await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); }
    }
}
async function fetchArticles() {
    const snapshot = JSON.parse(fs.readFileSync(path.join(root,'data/auras/wiki-reference.json'),'utf8'));
    const pages = [];
    for (let offset = 0; offset < snapshot.pages.length; offset += 100) {
        const chunks = [snapshot.pages.slice(offset,offset+50), snapshot.pages.slice(offset+50,offset+100)].filter(chunk=>chunk.length);
        const results = await Promise.all(chunks.map(async (chunk,index)=>{
            const file=path.join(cache,`articles-${offset+index*50}.json`);
            if (fs.existsSync(file) && !process.argv.includes('--refresh')) return JSON.parse(fs.readFileSync(file,'utf8'));
            const data=await api({action:'query',prop:'revisions',rvprop:'ids|timestamp|content',rvslots:'main',titles:chunk.map(page=>page.title).join('|'),redirects:'1'});
            fs.writeFileSync(file,JSON.stringify(data,null,2));
            return data;
        }));
        results.forEach(data=>pages.push(...data.query.pages));
        console.log('Audited ' + pages.length + ' aura articles');
    }
    fs.writeFileSync(path.join(cache,'articles.json'),JSON.stringify(pages,null,2));
    return pages;
}
async function cachedApi(file,parameters) {
    const target=path.join(cache,file);
    if(fs.existsSync(target) && !process.argv.includes('--refresh')) return JSON.parse(fs.readFileSync(target,'utf8'));
    const data=await api(parameters);
    fs.writeFileSync(target,JSON.stringify(data,null,2));
    return data;
}
async function fetchSnapshots(pages) {
    const {article}=require('./aura-history-parser.cjs');
    const jobs=pages.flatMap(page=>article(page).reworkDates.map(event=>({page,event})));
    const snapshots=[];
    for(let offset=0;offset<jobs.length;offset+=3) {
        const results=await Promise.all(jobs.slice(offset,offset+3).map(async({page,event})=>{
            const data=await cachedApi(`snapshot-${page.pageid}-${event.date}.json`,{action:'query',prop:'revisions',titles:page.title,rvprop:'ids|timestamp|content',rvslots:'main',rvlimit:'1',rvstart:event.date+'T00:00:00Z',rvdir:'older'});
            return {title:page.title,before:event.date,kind:event.kind,page:data.query.pages[0]};
        }));
        snapshots.push(...results);
        if(offset%15===0||offset+3>=jobs.length)console.log(`Retrieved ${snapshots.length}/${jobs.length} pre-update revisions`);
    }
    fs.writeFileSync(path.join(cache,'snapshots.json'),JSON.stringify(snapshots,null,2));
    return snapshots;
}
async function fetchGallerySnapshots(pages,media) {
    const {article}=require('./aura-history-parser.cjs');
    const jobs=pages.flatMap(page=>{
        const a=article(page);
        return a.images.slice(1).map((group,index)=>{
            const preceding=a.images[index];
            const dates=preceding.media.map(item=>media[item.file]?.timestamp).filter(Boolean).sort();
            if(!dates.length) return null;
            // Step back before the replacement uploads. File-gallery matching below
            // determines whether that revision actually describes this appearance.
            const cutoff=new Date(Date.parse(dates[0])-2*86400000).toISOString();
            return{page,label:group.label,cutoff};
        }).filter(Boolean);
    });
    const snapshots=[];
    for(let offset=0;offset<jobs.length;offset+=3) {
        const results=await Promise.all(jobs.slice(offset,offset+3).map(async({page,label,cutoff})=>{
            const data=await cachedApi(`gallery-revision-${page.pageid}-${cutoff.slice(0,10)}.json`,{action:'query',prop:'revisions',titles:page.title,rvprop:'ids|timestamp|content',rvslots:'main',rvlimit:'1',rvstart:cutoff,rvdir:'older'});
            return{title:page.title,before:cutoff.slice(0,10),kind:'gallery',label,page:data.query.pages[0]};
        }));
        snapshots.push(...results);
        if(offset%24===0||offset+3>=jobs.length)console.log(`Checked ${snapshots.length}/${jobs.length} gallery-era revisions`);
    }
    fs.writeFileSync(path.join(cache,'gallery-snapshots.json'),JSON.stringify(snapshots,null,2));
    return snapshots;
}
async function fetchMedia(files) {
    const media={};
    const {createHash}=require('node:crypto');
    for(let offset=0;offset<files.length;offset+=50) {
        const titles=files.slice(offset,offset+50).map(file=>'File:'+file).join('|');
        const key=createHash('sha256').update(titles).digest('hex').slice(0,16);
        const data=await cachedApi(`media-files-${key}.json`,{action:'query',prop:'imageinfo',iiprop:'url|size|timestamp|mime',iiurlwidth:'640',titles});
        for(const page of data.query.pages||[]) if(page.imageinfo?.[0]) media[page.title.slice(5)]=page.imageinfo[0];
        console.log(`Resolved ${Math.min(offset+50,files.length)}/${files.length} gallery files`);
    }
    fs.writeFileSync(path.join(cache,'media.json'),JSON.stringify(media,null,2));
    return media;
}
async function fetchArchivedMedia(snapshots,media) {
    const {article,fileKey}=require('./aura-history-parser.cjs');
    const lookup=new Map(Object.entries(media).map(([name,info])=>[fileKey(name),info]));
    const {createHash}=require('node:crypto');
    const results={};
    const jobs=snapshots.filter(snapshot=>snapshot.page.revisions).map(snapshot=>({snapshot,art:article(snapshot.page)}));
    for(let offset=0;offset<jobs.length;offset+=3) {
        await Promise.all(jobs.slice(offset,offset+3).map(async({snapshot,art})=>{
            const files=(art.images.find(g=>g.label==='Current')||art.images[0])?.media.slice(0,4).map(item=>item.file)||[];
            const found={};
            const missing=files.filter(file=>{
                const info=lookup.get(fileKey(file));
                if(info?.timestamp <= art.timestamp) {found[file]=info;return false;}
                return true;
            });
            if(missing.length) {
                const key=createHash('sha256').update(art.timestamp+missing.join('|')).digest('hex').slice(0,16);
                const data=await cachedApi(`archived-files-${key}.json`,{action:'query',prop:'imageinfo',titles:missing.map(file=>'File:'+file).join('|'),iiprop:'url|size|timestamp|mime',iilimit:'1',iistart:art.timestamp,iiurlwidth:'640'});
                const oldLookup=new Map((data.query.pages||[]).filter(page=>page.imageinfo?.[0]).map(page=>[fileKey(page.title.slice(5)),page.imageinfo[0]]));
                for(const file of missing) if(oldLookup.has(fileKey(file)))found[file]=oldLookup.get(fileKey(file));
            }
            results[snapshot.title+'|'+snapshot.before]=found;
        }));
        if(offset%15===0||offset+3>=jobs.length)console.log(`Checked archived media for ${Math.min(offset+3,jobs.length)}/${jobs.length} revisions`);
    }
    fs.writeFileSync(path.join(cache,'archived-media.json'),JSON.stringify(results,null,2));
    return results;
}
module.exports={api,cachedApi,fetchArticles,fetchSnapshots,fetchGallerySnapshots,fetchMedia,fetchArchivedMedia,root,cache};
async function refresh() {
    const {article}=require('./aura-history-parser.cjs');
    const pages=await fetchArticles();
    if(!process.argv.includes('--scan-only')) {
        const snapshots=await fetchSnapshots(pages);
        const parsed=pages.map(article);
        const files=[...new Set([...parsed,...snapshots.filter(s=>s.page.revisions).map(s=>article(s.page))].flatMap(p=>p.images.flatMap(g=>g.media.slice(0,4).map(m=>m.file))))].sort();
        const media=await fetchMedia(files);
        const gallerySnapshots=await fetchGallerySnapshots(pages,media);
        // Additional old filenames may appear only in older article revisions.
        const extras=[...new Set(gallerySnapshots.filter(s=>s.page.revisions).map(s=>article(s.page)).flatMap(p=>p.images.flatMap(g=>g.media.slice(0,4).map(m=>m.file))))].filter(file=>!media[file]);
        Object.assign(media,await fetchMedia(extras));
        fs.writeFileSync(path.join(cache,'media.json'),JSON.stringify(media,null,2));
        await fetchArchivedMedia([...snapshots,...gallerySnapshots],media);
        require('./build-aura-history.cjs').buildHistory();
    }
}
if(require.main===module) refresh().catch(error=>{console.error(error);process.exitCode=1;});
