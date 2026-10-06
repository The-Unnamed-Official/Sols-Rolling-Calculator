// Extract documented aura versions, keeping concepts and other auras out of the gallery.
const { templates, fields, plainText, extract } = require('./fetch-aura-wiki.cjs');
const normalize = text => text.replace(/_/g, ' ').trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const fileKey = file => { const name=file.replace(/_/g,' ').replace(/[\u200e\u200f]/g,'').trim();return (name[0]?.toUpperCase()||'')+name.slice(1); };
const historical = /\b(?:old(?:er|est)?|previous|original|pre[- ]?rework)\b/i;
const excluded = /\b(?:curation|submission|concept|whitelist|teaser|bugged|storage|card|icon|comparison|inventory|chat|message|cutscene|opening|official art|model|pre[- ]?release)\b/i;
function tabbers(text) {
    const blocks = [];
    const tags = /<\/?tabber\b[^>]*>/gi;
    let opening, depth = 0, tag;
    while ((tag = tags.exec(text))) {
        if (/^<\//.test(tag[0])) {
            if (depth && --depth === 0) blocks.push(text.slice(opening, tag.index));
        } else { if (depth++ === 0) opening = tags.lastIndex; }
    }
    return blocks.flatMap(body => body.split(/\|-\|/).flatMap(part => {
        const match = /^\s*([^=\n]+)=([\s\S]*)$/.exec(part);
        return match ? [{ label: plainText(match[1]), content: match[2].trim() }] : [];
    }));
}
function gallery(text, fromInfobox = true) {
    const result = [];
    const bodies = [...text.matchAll(/<gallery\b[^>]*>([\s\S]*?)<\/gallery>/gi)].map(match=>match[1]);
    for (const body of bodies) for (const line of body.split('\n')) {
        const match = /^\s*(?:File:|Image:)?([^|<>]+\.(?:gif|png|jpe?g|webp|mp4|webm))\s*(?:\|([\s\S]*))?$/i.exec(line);
        if (!match) continue;
        if (/^placeholder\./i.test(match[1].trim())) continue;
        const caption = plainText((match[2]||'Aura preview').replace(/^\{\{!\}\}/,''));
        if (excluded.test(caption)) continue;
        // General galleries contain other auras; only explicitly historical media qualify.
        if (!fromInfobox && !historical.test(caption)) continue;
        result.push({ file: match[1].trim().replace(/_/g,' '), caption, originalCaption: (match[2]||'').trim() });
    }
    return result;
}
function versionLabel(caption) {
    const era = /\b(?:Era|Eon)\s*\d[\w .-]*(?:\s*[-–]\s*(?:Era|Eon)\s*\d[\w .-]*)?/i.exec(caption)?.[0]?.trim().replace(/[).]+$/,'');
    if (era) return era.replace(/Eon(?=\d)/i,'Eon ');
    if (/\boldest\b/i.test(caption)) return 'Oldest';
    if (/\bolder\b/i.test(caption)) return 'Older';
    if (/\bprevious\b/i.test(caption)) return 'Previous';
    if (/\boriginal\b/i.test(caption)) return 'Original';
    if (/\bpre[- ]?rework\b/i.test(caption)) return 'Before rework';
    if (/\bold\b/i.test(caption)) return /old rarity/i.test(caption) ? 'Previous rarity' : 'Old';
    return 'Current';
}
function versionDescription(text) {
    return { description: plainText(text), descriptionMarkup: text, descriptionTruncated: false };
}
function descriptionVersions(text) {
    const quotes = templates(text,'Quote').map(fields).filter(quote=>/description/i.test(plainText(quote[2]||'')));
    const versions = [];
    for (const quote of quotes) {
        const tabs = tabbers(quote[1]||'');
        for (const tab of tabs) if (historical.test(tab.label)) versions.push({ label: versionLabel(tab.label), ...versionDescription(tab.content) });
    }
    return versions;
}
function reworkDates(text, title) {
    const histories = templates(text,'Changelogs?');
    const events = [];
    for (const history of histories) {
        let date = null;
        for (const line of history.split('\n')) {
            const dateMatch = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i.exec(plainText(line));
            if (dateMatch) { const parsed = Date.parse(`${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]} UTC`); date = Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0,10) : null; }
            if (!date || !/rework|revamp|visual change|new description|description.{0,25}(?:change|update)|(?:change|update).{0,25}description/i.test(line)) continue;
            if (/cutscene|opening|ability|potential|whitelist|accepted|unreleased/i.test(line)) continue;
            const subject = /\{\{\s*Aura\s*\|\s*([^|}]+)/i.exec(line)?.[1];
            if (subject && normalize(subject) !== normalize(title)) continue;
            events.push({ date, kind: /rework|revamp|visual change/i.test(line) ? 'rework' : 'description' });
        }
    }
    return [...new Map(events.map(event=>[event.date,event])).values()].sort((a,b)=>b.date.localeCompare(a.date));
}
function article(page) {
    const text = page.revisions?.[0]?.slots.main.content || '';
    const infobox = fields(templates(text,'(?:New)?Aura[ _]?Infobox')[0]||'');
    const media = gallery(infobox.image1||'');
    // A number of developer and removed auras use a bare file or [[File:...]],
    // rather than a gallery. These are real profile previews too.
    if (!media.length) {
        const file = /^\s*(?:\[\[(?:File:|Image:))?([^|\[\]<>]+\.(?:gif|png|jpe?g|webp|mp4|webm))(?:\|[^\]]*)?(?:\]\])?\s*$/i.exec(infobox.image1||'')?.[1];
        if (file && !/^Placeholder\./i.test(file)) media.push({file:file.trim().replace(/_/g,' '),caption:'Aura preview',originalCaption:''});
    }
    // An unreleased aura may only have a submission. Label it accurately rather
    // than inventing an in-game view or substituting another aura's picture.
    if (!media.length && /submission/i.test(infobox.image1||'')) {
        const file = /(?:File:)?([^|\n<>]+\.(?:gif|png|jpe?g|webp))\s*\|Submission/i.exec(infobox.image1)?.[1];
        if (file) media.push({file:file.trim().replace(/_/g,' '),caption:'Submission concept · unreleased',originalCaption:'Submission',concept:true});
    }
    if (!media.length) {
        const character = fields(templates(text,'Character')[0]||'');
        if (character.image?.startsWith('https://static.wikia.nocookie.net/sol-rng/images/')) {
            const file = decodeURIComponent(new URL(character.image).pathname.split('/').pop()).replace(/_/g,' ');
            media.push({file,caption:'In-game',originalCaption:'In-game'});
        }
    }
    const groups = new Map();
    for (const item of media) {
        const label = versionLabel(item.caption);
        if (!groups.has(label)) groups.set(label,[]);
        groups.get(label).push(item);
    }
    // Infobox version labels are the authoritative mapping. General galleries
    // often use "old" for several different eras, so guessing a stage by its
    // position mixes up appearances. Only revision-matched previews are added
    // outside this list by the history compiler.
    const musicVersions=tabbers(infobox.music_name||infobox.music||'').filter(tab=>historical.test(tab.label)).map(tab=>({label:versionLabel(tab.label),music:plainText(tab.content).split(/\s+/).slice(0,25).join(' '),musicMarkup:tab.content}));
    const profileText=text.split(/==\s*Profile\s*==/i)[1]?.split(/\n===/)[0]||text.slice(0,6000);
    const mutationOf=/(?:mutation|variant|mutated version)\s+(?:of|from)\s+(?:\[\[(?:[^|\]]+\|)?\s*)?\{\{\s*Aura\s*\|\s*([^|}]+)/i.exec(profileText)?.[1]?.trim()||'';
    const relatedAuras=[...String(infobox['skin(s)']||infobox.skins||'').matchAll(/\[\[([^|[\]]+)\|/g)].map(match=>match[1].trim().replace(/^:/,''));
    return { ...extract(page, {fullDescription:true}), mutationOf,relatedAuras,timestamp:page.revisions?.[0]?.timestamp, images:[...groups].map(([label,media])=>({label,media})), descriptionVersions:descriptionVersions(text), musicVersions, reworkDates:reworkDates(text,page.title), infobox, text };
}
module.exports={article,gallery,versionLabel,descriptionVersions,versionDescription,normalize,historical,tabbers,fileKey};
