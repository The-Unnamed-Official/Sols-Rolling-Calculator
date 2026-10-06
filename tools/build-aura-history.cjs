// Compile attributable, per-version records from the audited wiki sources.
const fs=require('node:fs');
const path=require('node:path');
const {article,fileKey:key}=require('./aura-history-parser.cjs');
const {plainText}=require('./fetch-aura-wiki.cjs');
const {soundtracks,currentMusic}=require('./aura-soundtracks.cjs');
const {showcases}=require('./aura-showcases.cjs');
const musicFor=a=>a.infobox.music_name||a.infobox.music||'';
const root=path.resolve(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,'test-results/aura-history',file),'utf8'));
// MediaWiki only folds the first character of a file title. InGame and Ingame
// are different uploads; lowercasing the whole name swaps historical previews.
function facts(a) {
    const music=plainText(currentMusic(musicFor(a))).split(/\s+/).slice(0,25).join(' ');
    return {rarity:a.rarity,nativeRarity:a.nativeRarity,tier:a.tier,required:a.required,obtainment:a.obtainment,music,creator:plainText(a.infobox.creator||'')};
}
function mediaItem(item,info) {
    if(!info || !/^(image|video)\//.test(info.mime)) return null;
    return {file:item.file,caption:item.caption,url:info.thumburl||info.url,...(info.thumburl && info.thumburl!==info.url?{originalUrl:info.url}:{}),source:info.descriptionurl,width:info.thumbwidth||info.width,height:info.thumbheight||info.height,mime:info.mime,timestamp:info.timestamp};
}
function buildHistory() {
    const pages=read('articles.json').map(article);
    const snapshots=[...read('snapshots.json'),...read('gallery-snapshots.json')].filter(snapshot=>snapshot.page.revisions).map(snapshot=>({...snapshot,art:article(snapshot.page)}));
    const media=read('media.json'), archives=read('archived-media.json');
    const mediaLookup=new Map(Object.entries(media).map(([name,info])=>[key(name),info]));
    const profiles={},audit=[];
    const overrides=JSON.parse(fs.readFileSync(path.join(root,'tools/aura-history-overrides.json'),'utf8'));
    for(const a of pages) {
        const ownSnapshots=snapshots.filter(snapshot=>snapshot.title===a.title);
        const groups=a.images.map(group=>({...group,media:group.media.map(item=>mediaItem(item,mediaLookup.get(key(item.file)))).filter(Boolean)}));
        // The first gallery group is the wiki's main appearance, including galleries
        // whose main group is named for an era rather than literally "Current".
        let currentGroup=groups[0];
        const pastGroups=groups.filter(group=>group!==currentGroup && group.media.length);
        const allowedCurrent=overrides[a.title]?.currentFiles;
        const currentCandidates=(currentGroup?.media||[]).filter(item=>!allowedCurrent||allowedCurrent.some(file=>key(file)===key(item.file)));
        const currentFresh=currentCandidates.filter(item=>!/(?:\bTBU\b|to be updated|outdated|needs? update)/i.test(item.caption));
        const currentMedia=currentFresh.length?currentFresh:currentCandidates;
        const current={id:'current',label:'Current',description:a.description,descriptionMarkup:a.descriptionMarkup,descriptionTruncated:a.descriptionTruncated,media:currentMedia,facts:facts(a),revisionId:a.revisionId,source:a.source,timestamp:a.timestamp};
        current.soundtracks=soundtracks(musicFor(a));
        current.showcases=showcases(a);
        const versions=[current];
        for(const group of pastGroups) {
            const matching=ownSnapshots.filter(snapshot=>{
                const top=snapshot.art.images.find(group=>group.label==='Current')||snapshot.art.images[0];
                return top?.media.some(item=>group.media.some(image=>key(image.file)===key(item.file)));
            });
            const snapshot=matching.sort((x,y)=>y.art.timestamp.localeCompare(x.art.timestamp))[0];
            versions.push({id:'version-'+versions.length,label:group.label==='Current'?'Previous':group.label,media:group.media,soundtracks:snapshot?soundtracks(musicFor(snapshot.art)):[],showcases:snapshot?showcases(snapshot.art,{historical:true}):[],
                description:snapshot?.art.description||'',descriptionMarkup:snapshot?.art.descriptionMarkup||'',descriptionTruncated:snapshot?.art.descriptionTruncated||false,
                facts:snapshot?facts(snapshot.art):null,revisionId:snapshot?.art.revisionId||a.revisionId,source:a.source,
                timestamp:snapshot?.art.timestamp||null,before:snapshot?.before||null,descriptionRecorded:Boolean(snapshot),sourceKind:snapshot?'revision':'gallery'});
        }
        // Explicit overrides resolve differing gallery/quote version labels.
        for(const description of a.descriptionVersions) {
            const mappedLabel=overrides[a.title]?.descriptions?.[description.label]||description.label;
            let version=versions.slice(1).find(version=>version.label===mappedLabel);
            if(!version && versions.length===2 && !/Oldest|Older/.test(mappedLabel)) version=versions[1];
            if(!version) {
                version={id:'version-'+versions.length,label:mappedLabel,media:[],facts:null,source:a.source,revisionId:a.revisionId,sourceKind:'description'};
                versions.push(version);
            }
            if(!version.description || !overrides[a.title]?.keepSnapshotDescription?.includes(version.label)) Object.assign(version,description,{label:version.label,descriptionRecorded:true,descriptionRevisionId:a.revisionId});
        }
        for(const snapshot of ownSnapshots.filter(snapshot=>snapshot.kind!=='gallery')) {
            const top=snapshot.art.images.find(group=>group.label==='Current')||snapshot.art.images[0];
            const archive=archives[a.title+'|'+snapshot.before]||{};
            const preview=top?.media.map(item=>mediaItem(item,archive[item.file])).filter(Boolean)||[];
            const mappedLabel=overrides[a.title]?.snapshots?.[snapshot.before];
            const existing=versions.slice(1).find(version=>mappedLabel?version.label===mappedLabel:preview.some(item=>version.media.some(image=>image.url===item.url||key(image.file)===key(item.file))));
            if(existing) {
                if(mappedLabel) existing.media.push(...preview.filter(item=>!existing.media.some(image=>image.url===item.url)));
                if(!existing.facts) Object.assign(existing,{facts:facts(snapshot.art),soundtracks:soundtracks(musicFor(snapshot.art)),showcases:showcases(snapshot.art,{historical:true}),revisionId:snapshot.art.revisionId,timestamp:snapshot.art.timestamp,before:snapshot.before,sourceKind:'revision'});
                if(!existing.descriptionRecorded) Object.assign(existing,{description:snapshot.art.description,descriptionMarkup:snapshot.art.descriptionMarkup,descriptionTruncated:snapshot.art.descriptionTruncated,descriptionRecorded:true});
                continue;
            }
            // Never present a current upload as a historical appearance.
            const distinct=preview.filter(item=>!current.media.some(image=>image.url===item.url));
            if(!distinct.length && !snapshot.art.description) continue;
            const sameDescription=versions.some(version=>version.description===snapshot.art.description);
            // Editors sometimes update an article before the game's dated rework.
            // Such a revision contains the new appearance already, not an older
            // version. Never duplicate it as a historical preview.
            const previousFacts=facts(snapshot.art);
            const changedDetails=['rarity','nativeRarity','music'].some(field=>previousFacts[field] && current.facts[field] && previousFacts[field]!==current.facts[field]);
            if(!distinct.length && sameDescription && !changedDetails) continue;
            versions.push({id:'version-'+versions.length,label:'Before '+snapshot.before,media:distinct,soundtracks:soundtracks(musicFor(snapshot.art)),showcases:showcases(snapshot.art,{historical:true}),
                description:snapshot.art.description,descriptionMarkup:snapshot.art.descriptionMarkup,descriptionTruncated:snapshot.art.descriptionTruncated,descriptionRecorded:true,
                facts:previousFacts,revisionId:snapshot.art.revisionId,source:a.source,timestamp:snapshot.art.timestamp,before:snapshot.before,sourceKind:'revision'});
        }
        for(const oldMusic of a.musicVersions) {
            let version=versions.slice(1).find(version=>version.label===oldMusic.label);
            if(!version && versions.length===2) version=versions[1];
            if(version) { version.facts={...version.facts,music:oldMusic.music}; version.soundtracks=soundtracks(oldMusic.musicMarkup); version.musicRevisionId=a.revisionId; }
        }
        for(const title of overrides[a.title]?.predecessors||[]) {
            const predecessor=pages.find(page=>page.title===title);
            if(!predecessor) throw new Error('Missing predecessor source: '+title);
            const preview=predecessor.images[0]?.media.map(item=>mediaItem(item,mediaLookup.get(key(item.file)))).filter(Boolean)||[];
            versions.push({id:'version-'+versions.length,label:title.replace(/^.*? : /,''),media:preview,soundtracks:soundtracks(musicFor(predecessor)),showcases:showcases(predecessor),
                description:predecessor.description,descriptionMarkup:predecessor.descriptionMarkup,descriptionTruncated:predecessor.descriptionTruncated,descriptionRecorded:true,
                facts:{tier:'Developer exclusive'},revisionId:predecessor.revisionId,source:predecessor.source,sourceKind:'predecessor'});
        }
        // A lone image labelled "original" is not evidence of a second version.
        const hasHistory=versions.length>1;
        profiles[a.title]={source:a.source,revisionId:a.revisionId,mutationOf:a.mutationOf,relatedAuras:a.relatedAuras,versions};
        audit.push({title:a.title,revisionId:a.revisionId,status:hasHistory?'archived-versions':a.reworkDates.length?'rework-without-recoverable-version':'no-documented-older-version',versionCount:versions.length-1,reworkDates:a.reworkDates});
    }
    for(const [successor,override] of Object.entries(overrides)) for(const title of override.predecessors||[]) {
        const audited=audit.find(aura=>aura.title===title);
        if(audited && audited.status!=='archived-versions') Object.assign(audited,{status:'historical-predecessor',successor});
    }
    const reviewedOn=process.argv.find(arg=>arg.startsWith('--reviewed-on='))?.slice(14)||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const history={schemaVersion:2,reviewedOn,auditedCount:pages.length,source:'https://sol-rng.fandom.com/wiki/Template:Auras',profiles,audit};
    fs.writeFileSync(path.join(root,'data/auras/history.json'),JSON.stringify(history,null,2)+'\n');
    console.log(`Compiled ${Object.keys(profiles).length} profiles with ${Object.values(profiles).reduce((total,profile)=>total+profile.versions.length-1,0)} historical versions; audited ${audit.length} auras.`);
    return history;
}
module.exports={buildHistory,key};
if(require.main===module)buildHistory();
