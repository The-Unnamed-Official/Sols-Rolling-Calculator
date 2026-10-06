// Preserve attributed wiki text styling without allowing executable HTML or CSS.
const {fields,plainText}=require('./fetch-aura-wiki.cjs');
const {tabbers}=require('./aura-history-parser.cjs');
const {repairMarkup}=require('../scripts/wiki-title-repairs.js');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const normalize=value=>String(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const cssProperties=new Set(['color','background','background-image','background-size','background-position','background-clip','-webkit-background-clip','-webkit-text-fill-color','-webkit-text-stroke','text-shadow','font-family','font-weight','font-style','font-size','letter-spacing','text-decoration','text-transform','opacity']);
function safeStyle(style='') {
    return style.split(';').map(declaration=>{
        const colon=declaration.indexOf(':'),property=declaration.slice(0,colon).trim().toLowerCase(),value=declaration.slice(colon+1).trim();
        return colon>0&&cssProperties.has(property)&&value&&!/url\s*\(|expression|javascript|@|[<>\\{}]/i.test(value)?property+':'+value:'';
    }).filter(Boolean).join(';');
}
function createRichText({auras={},items={},biomes=[]}) {
    const auraNames=new Map(Object.keys(auras).map(name=>[normalize(name),name]));
    const biomeNames=new Map();
    biomes.forEach(({labels,sigil})=>labels.forEach(label=>biomeNames.set(normalize(label),{label,sigil})));
    const terms=[...new Set([...biomes.flatMap(b=>b.labels),...Object.keys(items)])].filter(term=>term.length>2).sort((a,b)=>b.length-a.length);
    const termPattern=terms.length?new RegExp('(?<![\\p{L}\\p{N}])('+terms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\p{L}\\p{N}])','gu'):null;
    function sigil(kind,name,label=name) {
        if(kind==='rarity') return `<span class="rarity-tier-${escape(name.toLowerCase().replace('+','-plus').replace(/[^a-z-]/g,''))}">${escape(label)}</span>`;
        if(kind==='biome') {
            const biome=biomeNames.get(normalize(name));
            return biome?`<span class="${escape(biome.sigil)}">${escape(label)}</span>`:escape(label);
        }
        const canonical=kind==='aura'?auraNames.get(normalize(name)):name;
        const art=(kind==='aura'?auras:items)[canonical];
        if(!art) return escape(label);
        const markup=repairMarkup(art.markup);
        return `<span class="aura-inline-sigil"><span class="sigil-wiki wiki-title wiki-title--${kind}" role="img" aria-label="${escape(label)}"><span class="wiki-title__art" aria-hidden="true">${markup}</span><span class="wiki-title__plain" aria-hidden="true">${escape(label)}</span></span></span>`;
    }
    function text(value) {
        const original=String(value??'');
        if(!termPattern) return escape(original);
        let position=0,result='';
        for(const match of original.matchAll(termPattern)) {
            result+=escape(original.slice(position,match.index));
            result+=biomeNames.has(normalize(match[0]))?sigil('biome',match[0]):sigil('item',match[0]);
            position=match.index+match[0].length;
        }
        return result+escape(original.slice(position));
    }
    function markup(input) {
        const tabs=tabbers(input);
        if(tabs.length) input=(tabs.find(tab=>/^description$/i.test(tab.label))||tabs[0]).content;
        const tokens=[];
        const hold=html=>{const token='\u0000'+tokens.length+'\u0000';tokens.push(html);return token;};
        let source=String(input).replace(/<!--[\s\S]*?-->|<(?:script|style|iframe)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe)>|<ref\b[^>]*>[\s\S]*?<\/ref>/gi,'');
        // Balanced templates support nested references without evaluating wiki code.
        for(let start=source.indexOf('{{');start>=0;start=source.indexOf('{{')) {
            let depth=0,end=-1;
            for(let index=start;index<source.length-1;index++) {
                if(source.slice(index,index+2)==='{{'){depth++;index++;}
                else if(source.slice(index,index+2)==='}}'){depth--;index++;if(!depth){end=index+1;break;}}
            }
            if(end<0){source=source.replace('{{','');continue;}
            const body=source.slice(start+2,end-2),name=body.split('|')[0].trim().toLowerCase(),args=fields(body);
            const label=plainText(args[2]||args[1]||'');
            const rendered=['aura','biome','item','rarity'].includes(name)?sigil(name,plainText(args[1]||''),label):name==='!'?'|':text(plainText('{{'+body+'}}'));
            source=source.slice(0,start)+hold(rendered)+source.slice(end);
        }
        source=source.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi,'');
        source=source.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,target,label)=>label||target);
        source=source.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g,(_,label)=>label);
        source=source.replace(/'''([^']+)'''/g,(_,label)=>hold('<strong>'+text(label)+'</strong>')).replace(/''([^']+)''/g,(_,label)=>hold('<em>'+text(label)+'</em>'));
        source=source.replace(/<\/?([\w-]+)\b[^>]*>/g,tag=>{
            const closing=tag.startsWith('</'),name=/^<\/?([\w-]+)/.exec(tag)[1].toLowerCase();
            if(name==='br') return hold('<br>');
            if(name==='center') return hold(closing?'</span>':'<span class="aura-description__center">');
            const allowed={b:'strong',strong:'strong',i:'em',em:'em',u:'u',small:'small',span:'span',s:'s',p:'span'}[name];
            if(!allowed) return '';
            const style=/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
            const css=safeStyle(style?.[1]||style?.[2]||'');
            const classes=(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)?.slice(1).find(Boolean)||'').split(/\s+/).filter(name=>/^(?:sigil-|biome-sigil--|rarity-tier-)[a-z0-9-]+$/i.test(name)).join(' ');
            return hold(closing?`</${allowed}>`:`<${allowed}${classes?' class="'+escape(classes)+'"':''}${css?' style="'+escape(css)+'"':''}>`);
        });
        // Decode text entities before escaping; protected tags cannot be reinterpreted.
        source=source.replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
        const expand=html=>html.replace(/\u0000(\d+)\u0000/g,(_,index)=>tokens[index]===undefined?'':expand(tokens[index]));
        return expand(source.split(/(\u0000\d+\u0000)/).map(part=>/^\u0000\d+\u0000$/.test(part)?part:text(part.replace(/\s+/g,' '))).join(''));
    }
    return {text,description:version=>version.descriptionMarkup?markup(version.descriptionMarkup):text(version.description),markup,sigil};
}
module.exports={createRichText,safeStyle};
