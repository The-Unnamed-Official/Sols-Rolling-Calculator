/* Inline soundtrack controls; audio loads only when Play is pressed. */
(() => {
    'use strict';
    const key='solsRollingCalculator:auraSoundtrackVolume';
    let volume=.5, lastVolume=.5;
    try { const saved=localStorage.getItem(key); if(saved!==null&&Number.isFinite(Number(saved))) volume=Math.max(0,Math.min(1,Number(saved))); } catch {}
    if(volume>0) lastVolume=volume;
    const players=[...document.querySelectorAll('[data-aura-soundtrack]')];
    const time=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
    const progress=(input,percent)=>{
        input.style.setProperty('--audio-slider-progress',percent+'%');
        input.closest('.audio-slider__control').style.setProperty('--audio-slider-thumb-progress',percent+'%');
    };
    function broadcast() {
        const active=players.some(player=>{const audio=player.querySelector('audio');return !audio.paused&&!audio.ended;});
        document.dispatchEvent(new CustomEvent('aura-soundtrack-playback',{detail:{active}}));
    }
    function reflectVolume() {
        players.forEach(player=>{
            const audio=player.querySelector('audio'),slider=player.querySelector('[data-soundtrack-volume]'),button=player.querySelector('[data-soundtrack-mute]');
            audio.volume=volume;audio.muted=Boolean(globalThis.AuraAudio?.getMasterMuted());
            slider.value=Math.round(volume*100);slider.setAttribute('aria-valuetext',slider.value+' percent');progress(slider,volume*100);
            button.setAttribute('aria-label',volume?'Mute soundtrack':'Unmute soundtrack');
            button.querySelector('i').className='fa-solid '+(volume===0?'fa-volume-xmark':volume>.66?'fa-volume-high':volume>.33?'fa-volume-low':'fa-volume-off');
        });
    }
    function setVolume(next) {
        volume=Math.max(0,Math.min(1,next));if(volume>0)lastVolume=volume;
        try {localStorage.setItem(key,String(volume));}catch{}
        reflectVolume();
    }
    players.forEach(player=>{
        const audio=player.querySelector('audio'),play=player.querySelector('[data-soundtrack-play]'),seek=player.querySelector('[data-soundtrack-seek]'),error=player.querySelector('[data-soundtrack-error]');
        function reflectPlayback() {
            const playing=!audio.paused&&!audio.ended;
            play.setAttribute('aria-label',playing?'Pause soundtrack':'Play soundtrack');play.setAttribute('aria-pressed',String(playing));
            play.querySelector('i').className='fa-solid '+(playing?'fa-pause':'fa-play');broadcast();
        }
        function reflectTime() {
            const known=Number.isFinite(audio.duration)&&audio.duration>0;
            seek.disabled=!known;seek.max=known?audio.duration:100;seek.value=audio.currentTime;
            progress(seek,known?100*audio.currentTime/audio.duration:0);
            seek.setAttribute('aria-valuetext',time(audio.currentTime)+(known?' of '+time(audio.duration):''));
            player.querySelector('[data-soundtrack-time]').textContent=time(audio.currentTime)+' / '+(known?time(audio.duration):'--:--');
        }
        play.addEventListener('click',()=>{
            if(!audio.paused) {audio.pause();return;}
            players.forEach(other=>{if(other!==player)other.querySelector('audio').pause();});
            document.querySelectorAll('[data-aura-showcase] video').forEach(video=>video.pause());
            globalThis.AuraVideoPlayer?.pauseFloating();
            error.hidden=true;
            if(!audio.getAttribute('src')) audio.src=audio.dataset.soundtrackSrc;
            else if(audio.error) audio.load();
            audio.play().catch(()=>{error.hidden=false;reflectPlayback();});
        });
        seek.addEventListener('input',()=>{if(Number.isFinite(audio.duration)){audio.currentTime=Number(seek.value);reflectTime();}});
        player.querySelector('[data-soundtrack-volume]').addEventListener('input',event=>setVolume(Number(event.target.value)/100));
        player.querySelector('[data-soundtrack-mute]').addEventListener('click',()=>setVolume(volume?0:lastVolume));
        for(const event of ['play','pause','ended']) audio.addEventListener(event,reflectPlayback);
        for(const event of ['loadedmetadata','durationchange','timeupdate']) audio.addEventListener(event,reflectTime);
        audio.addEventListener('error',()=>{error.hidden=false;reflectPlayback();});
        progress(seek,0);
    });
    document.addEventListener('aura-version-change',()=>players.forEach(player=>{if(player.closest('[hidden]'))player.querySelector('audio').pause();}));
    document.addEventListener('aura-audio-settings-change',reflectVolume);
    window.addEventListener('pagehide',()=>players.forEach(player=>player.querySelector('audio').pause()));
    window.addEventListener('storage',event=>{if(event.key===key){const next=Number(event.newValue);if(Number.isFinite(next)){volume=Math.max(0,Math.min(1,next));reflectVolume();}}});
    reflectVolume();
})();
