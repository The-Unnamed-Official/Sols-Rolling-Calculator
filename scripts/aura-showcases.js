/* Wiki showcase videos fetch only after their disclosure is opened. */
(() => {
    'use strict';
    const showcases=[...document.querySelectorAll('[data-aura-showcase]')];
    const videos=showcases.map(showcase=>showcase.querySelector('video'));
    function broadcast() {
        document.dispatchEvent(new CustomEvent('aura-showcase-playback',{detail:{active:videos.some(video=>!video.paused&&!video.ended)}}));
    }
    function reflectMute() { videos.forEach(video=>{const player=globalThis.AuraVideoPlayer?.getController(video);if(player)player.applyMute();else video.muted=Boolean(globalThis.AuraAudio?.getMasterMuted());}); }
    showcases.forEach(showcase=>{
        const video=showcase.querySelector('video'),error=showcase.querySelector('[data-showcase-error]');
        showcase.addEventListener('toggle',()=>{
            if(!showcase.open) {if(!globalThis.AuraVideoPlayer?.isFloating(video))video.pause();return;}
            if(!video.getAttribute('src')) {video.preload='metadata';video.src=video.dataset.showcaseSrc;video.load();}
        });
        video.addEventListener('play',()=>{
            videos.forEach(other=>{if(other!==video)other.pause();});
            document.querySelectorAll('[data-aura-soundtrack] audio').forEach(audio=>audio.pause());
            broadcast();
        });
        for(const event of ['pause','ended']) video.addEventListener(event,broadcast);
        video.addEventListener('error',()=>{error.hidden=false;video.pause();broadcast();});
        video.addEventListener('loadeddata',()=>{error.hidden=true;});
        showcase.querySelector('[data-showcase-retry]').addEventListener('click',()=>{error.hidden=true;video.load();});
    });
    document.addEventListener('aura-version-change',()=>videos.forEach(video=>{if(video.closest('[hidden]')&&!globalThis.AuraVideoPlayer?.isFloating(video))video.pause();}));
    document.addEventListener('aura-audio-settings-change',reflectMute);
    window.addEventListener('pagehide',()=>videos.forEach(video=>video.pause()));
    reflectMute();
})();
