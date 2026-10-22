(() => {
    'use strict';
    const key = 'solsRollingCalculator:audioSettings';
    const overlay = document.getElementById('audioSettingsOverlay');
    if (!overlay) return;
    const opener = document.getElementById('audioSettingsButton');
    const music = document.getElementById('ambientMusic');
    const click = document.getElementById('clickSoundFx');
    const hover = document.getElementById('hoverSoundFx');
    const defaultMusic = music.dataset.src;
    const clamp = value => Math.max(0, Math.min(1, value));
    function stored() { try { const value = JSON.parse(localStorage.getItem(key)||'{}'); return value && typeof value==='object' ? value : {}; } catch { return {}; } }
    function read() {
        const saved = stored();
        const level = value => Number.isFinite(value) ? clamp(value) : .5;
        return {musicVolume:level(saved.musicVolume),uiVolume:level(saved.uiVolume),serverVolume:level(saved.serverVolume??saved.obtainVolume),effectsVolume:level(saved.effectsVolume??saved.cutsceneVolume),cutsceneVolume:level(saved.cutsceneVolume??saved.effectsVolume),masterMuted:Boolean(saved.masterMuted)};
    }
    let settings = read(), activated = Boolean(navigator.userActivation?.hasBeenActive), previousFocus;
    let musicSource = '', soundtrackPlaying = false, showcasePlaying = false, floatingPlaying = false, shellActive = false;
    function playMusic() {
        music.volume = settings.musicVolume * Number(music.dataset.volume);
        music.muted = settings.masterMuted || music.volume===0;
        if (!activated || music.muted || document.hidden || soundtrackPlaying || showcasePlaying || floatingPlaying || shellActive) { music.pause(); return; }
        if (!music.getAttribute('src')) music.src = musicSource || defaultMusic;
        music.play().catch(()=>{});
    }
    function setMusic(source = '') {
        const next = new URL(source || defaultMusic, document.baseURI).href;
        if (next===musicSource) return;
        musicSource = next; music.pause(); music.removeAttribute('src'); music.load(); playMusic();
    }
    function reflect() {
        overlay.querySelectorAll('input[type="range"]').forEach(input=>{
            const channel=input.dataset.audioChannel, percent=Math.round(settings[channel+'Volume']*100);
            input.value=percent; input.setAttribute('aria-valuetext',percent+' percent');
            input.style.setProperty('--audio-slider-progress',percent+'%');
            input.closest('.audio-slider__control').style.setProperty('--audio-slider-thumb-progress',percent+'%');
            overlay.querySelector(`[data-audio-value="${channel}"]`).textContent=percent+'%';
            overlay.querySelector(`[data-audio-icon="${channel}"] i`).className='fa-solid '+(percent===0?'fa-volume-xmark':percent<=33?'fa-volume-off':percent<=66?'fa-volume-low':'fa-volume-high');
        });
        const master=overlay.querySelector('#masterMuteToggle');
        master.textContent=settings.masterMuted?'Unmute':'Mute';master.setAttribute('aria-pressed',String(settings.masterMuted));
        if(settings.masterMuted||settings.uiVolume===0) {click.pause();hover.pause();}
        playMusic();
        document.dispatchEvent(new CustomEvent('aura-audio-settings-change', {detail:{...settings}}));
    }
    function persist() { try { localStorage.setItem(key,JSON.stringify({...stored(),...settings})); } catch {} reflect(); }
    function sound(element) {
        if(!activated||settings.masterMuted||!settings.uiVolume||document.hidden) return;
        if(!element.getAttribute('src')) element.src=element.dataset.src;
        element.volume=Number(element.dataset.volume)*settings.uiVolume;
        element.currentTime=0;element.play().catch(()=>{});
    }
    function activate() { activated=true;playMusic(); }
    document.addEventListener('pointerdown',activate,{once:true,capture:true});
    document.addEventListener('keydown',activate,{once:true,capture:true});
    let lastClick=0;
    document.addEventListener('click',event=>{
        const target=event.target.closest('button,a,summary,input');
        if(!target||target.disabled||event.timeStamp-lastClick<50) return;
        lastClick=event.timeStamp;sound(click);
    });
    document.addEventListener('change',event=>{if(event.target.matches('select,input[type="range"]')) sound(click);});
    document.addEventListener('mouseover',event=>{
        const target=event.target.closest('button,a,summary,input,select');
        if(target&&!target.disabled&&!target.contains(event.relatedTarget)) sound(hover);
    });
    document.addEventListener('visibilitychange',playMusic);
    document.addEventListener('aura-soundtrack-playback',event=>{soundtrackPlaying=event.detail.active;playMusic();});
    document.addEventListener('aura-showcase-playback',event=>{showcasePlaying=event.detail.active;playMusic();});
    document.addEventListener('aura-floating-playback',event=>{floatingPlaying=event.detail.active;playMusic();});
    document.addEventListener('aura-video-shell-state',event=>{shellActive=event.detail.active;playMusic();});
    window.addEventListener('pagehide',()=>{music.pause();click.pause();hover.pause();});
    window.addEventListener('pageshow',playMusic);
    window.addEventListener('storage',event=>{if(event.key===key){settings=read();reflect();}});
    overlay.querySelectorAll('input[type="range"]').forEach(input=>input.addEventListener('input',()=>{
        const channel=input.dataset.audioChannel;settings[channel+'Volume']=clamp(Number(input.value)/100);
        persist();
    }));
    overlay.querySelector('#masterMuteToggle').addEventListener('click',()=>{settings.masterMuted=!settings.masterMuted;persist();});
    document.addEventListener('keydown',event=>{
        if(event.defaultPrevented||!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing||event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"]'))return;
        if(event.code==='KeyM'){event.preventDefault();if(!event.repeat){settings.masterMuted=!settings.masterMuted;persist();}return;}
        if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;
        event.preventDefault();const direction=event.key==='ArrowUp'?1:-1;
        for(const channel of ['music','ui','server','effects','cutscene'])settings[channel+'Volume']=clamp(Math.round(settings[channel+'Volume']*100+direction*5)/100);
        if(direction>0)settings.masterMuted=false;
        persist();
    });
    function close() {
        opener.setAttribute('aria-expanded','false');
        globalThis.concealOverlay(overlay,{onHidden:()=>{document.body.classList.remove('modal-open');previousFocus?.focus();}});
    }
    opener.addEventListener('click',()=>{
        previousFocus=document.getElementById('optionsMenuToggle');
        document.getElementById('optionsMenu').classList.remove('options-menu--open');previousFocus.setAttribute('aria-expanded','false');
        globalThis.revealOverlay(overlay);opener.setAttribute('aria-expanded','true');document.body.classList.add('modal-open');
        overlay.querySelector('input').focus();
    });
    overlay.querySelector('#audioSettingsClose').addEventListener('click',close);
    overlay.addEventListener('click',event=>{if(event.target===overlay) close();});
    overlay.addEventListener('keydown',event=>{
        if(event.key==='Escape') { event.stopPropagation();close(); }
        if(event.key!=='Tab') return;
        const controls=[...overlay.querySelectorAll('input,button')],first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    globalThis.AuraAudio=Object.freeze({setMusic,getMasterMuted:()=>settings.masterMuted,getVolume:channel=>settings.masterMuted?0:settings[channel+'Volume']??1});
    setMusic(document.body.dataset.auraMusic);reflect();
})();
