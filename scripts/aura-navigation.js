/* Carry a directory return URL only through profiles opened from that directory. */
(() => {
    'use strict';
    const back=document.querySelector('[data-aura-directory-return]');
    const value=new URL(location.href).searchParams.get('return');
    if(!back||!value) return;
    try {
        const fallback=new URL(back.href), target=new URL(value,document.baseURI);
        if(target.origin!==fallback.origin||target.pathname!==fallback.pathname||target.username||target.password) return;
        target.hash='';back.href=target.href;
        document.querySelectorAll('.aura-mutation-link').forEach(link=>{
            const profile=new URL(link.href);profile.searchParams.set('return',target.pathname+target.search);link.href=profile.href;
        });
    } catch {}
})();
