/* Carry a directory return URL only through profiles opened from that directory. */
(() => {
    'use strict';
    const back=document.querySelector('[data-aura-directory-return]');
    const value=new URL(location.href).searchParams.get('return');
    if(!back||!value) return;
    try {
        const fallback=new URL(back.href), target=new URL(value,document.baseURI);
        const directoryPath=path=>path.replace(/\/index(?:\.html)?$/i,'/').replace(/\/?$/,'/');
        if(target.origin!==fallback.origin||directoryPath(target.pathname)!==directoryPath(fallback.pathname)||target.username||target.password) return;
        target.pathname=directoryPath(fallback.pathname);
        target.hash='';back.href=target.href;
        document.querySelectorAll('.aura-mutation-link').forEach(link=>{
            const profile=new URL(link.href);profile.pathname=directoryPath(profile.pathname);profile.searchParams.set('return',target.pathname+target.search);link.href=profile.href;
        });
    } catch {}
})();
