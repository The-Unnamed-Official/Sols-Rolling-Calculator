/* Custom media controls and a persistent floating player for the aura pages. */
(() => {
    'use strict';
    const base=new URL('../auras/',document.currentScript.src);
    const home=new URL('../',base);
    const initialURL=location.href;
    const initialTitle=document.title;
    const players=new Map();
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    const time=value=>{
        if(!Number.isFinite(value))return '--:--';
        const hours=Math.floor(value/3600),minutes=Math.floor(value/60)%60,seconds=Math.floor(value%60);
        return (hours?hours+':'+String(minutes).padStart(2,'0'):minutes)+':'+String(seconds).padStart(2,'0');
    };
    function destination(value) {
        if(typeof value!=='string'||!value)return null;
        try {const url=new URL(value,base);const page=url.pathname.startsWith(base.pathname)||url.pathname===home.pathname||url.pathname===home.pathname+'index.html';return url.origin===base.origin&&page&&!url.username&&!url.password?url:null;}catch{return null;}
    }
    function mediaSource(value) {
        try {
            const url=new URL(value,document.baseURI);
            return !url.username&&!url.password&&((url.protocol==='https:'&&url.hostname==='static.wikia.nocookie.net'&&url.pathname.startsWith('/sol-rng/'))||(url.origin===base.origin&&url.pathname.startsWith(new URL('../files/',base).pathname)))?url.href:null;
        }catch{return null;}
    }
    let parentPlayer;
    try {if(parent!==window&&parent.location.origin===location.origin)parentPlayer=parent.AuraVideoPlayer;}catch{}
    const shellOwner=!parentPlayer;
    let floating=null,frame=null,frameTarget=null,pendingReturn=null,navigationSeeded=false;
    let preferredVolume=.5,lastVolume=.5;
    try {const stored=localStorage.getItem('solsRollingCalculator:auraVideoVolume'),saved=Number(stored);if(stored!==null&&saved>=0&&saved<=1){preferredVolume=saved;if(saved>0)lastVolume=saved;}}catch{}
    function event(target,name,detail) {target.dispatchEvent(new target.defaultView.CustomEvent(name,{detail}));}
    function localPlayback() {
        const active=[...players.values()].some(player=>!player.video.paused&&!player.video.ended);
        event(document,'aura-showcase-playback',{active});
        if(shellOwner)notifyFrame();
    }
    function notifyFrame() {
        try {
            if(frame?.contentDocument)event(frame.contentDocument,'aura-floating-playback',{active:Boolean(floating&&!floating.player.video.paused&&!floating.player.video.ended)});
        }catch{}
    }
    function pauseOtherMedia(except) {
        document.querySelectorAll('[data-aura-soundtrack] audio,[data-aura-video-player] video').forEach(media=>{if(media!==except)media.pause();});
        if(parentPlayer)parentPlayer.pauseFloating();
        if(shellOwner&&frame)try{frame.contentDocument.querySelectorAll('[data-aura-soundtrack] audio,[data-aura-video-player] video').forEach(media=>media.pause());}catch{}
    }
    function button(label,icon,attribute) {
        const element=document.createElement('button');element.type='button';element.className='aura-video-button';element.setAttribute('aria-label',label);element.setAttribute(attribute,'');
        const glyph=document.createElement('i');glyph.className='fa-solid '+icon;glyph.setAttribute('aria-hidden','true');element.append(glyph);return element;
    }
    function range(label,attribute,max,value) {
        const control=document.createElement('div');control.className='audio-slider__control';
        const input=document.createElement('input');input.type='range';input.className='audio-slider__input';input.setAttribute('aria-label',label);input.setAttribute(attribute,'');input.min='0';input.max=String(max);input.step=attribute==='data-video-seek'?'0.1':'1';input.value=String(value);
        const thumb=document.createElement('span');thumb.className='audio-slider__thumb';thumb.setAttribute('aria-hidden','true');control.append(input,thumb);return {control,input};
    }
    function progress(input,percent) {
        input.style.setProperty('--audio-slider-progress',percent+'%');input.parentElement.style.setProperty('--audio-slider-thumb-progress',percent+'%');
    }
    function create(video,origin) {
        if(players.has(video))return players.get(video);
        const lifetime=new AbortController();
        video.controls=false;video.removeAttribute('controls');video.controlsList='nodownload noremoteplayback';video.disablePictureInPicture=true;video.disableRemotePlayback=true;video.playsInline=true;
        const root=document.createElement('div');root.className='aura-video-player';root.dataset.auraVideoPlayer='';root.tabIndex=0;root.setAttribute('role','group');root.setAttribute('aria-label',video.getAttribute('aria-label')||'Aura video player');
        video.before(root);root.append(video);
        const status=document.createElement('p');status.className='aura-video-status';status.setAttribute('role','status');status.hidden=true;
        const controls=document.createElement('div');controls.className='aura-video-controls';controls.setAttribute('aria-label','Video controls');
        const seek=range('Video position','data-video-seek',100,0);seek.control.classList.add('aura-video-seek');seek.input.disabled=true;
        const row=document.createElement('div');row.className='aura-video-controls__row';
        const play=button('Play video','fa-play','data-video-play');
        const elapsed=document.createElement('span');elapsed.className='aura-video-time';elapsed.textContent='0:00 / --:--';
        const volume=document.createElement('div');volume.className='aura-video-volume';
        const mute=button('Mute video','fa-volume-low','data-video-mute'),volumeRange=range('Video volume','data-video-volume',100,preferredVolume*100);volume.append(mute,volumeRange.control);
        const speed=document.createElement('details');speed.className='aura-video-speed';
        const speedToggle=document.createElement('summary');speedToggle.textContent='1×';speedToggle.setAttribute('aria-label','Playback speed');
        const speedMenu=document.createElement('div');speedMenu.className='aura-video-speed__menu';speedMenu.setAttribute('role','group');speedMenu.setAttribute('aria-label','Playback speed options');
        for(const rate of [.25,.5,.75,1,1.25,1.5,1.75,2]) {
            const option=document.createElement('button');option.type='button';option.textContent=rate+'×';option.dataset.videoRate=String(rate);option.setAttribute('aria-pressed',String(rate===1));
            option.addEventListener('click',()=>{video.playbackRate=rate;speed.open=false;speedToggle.focus();});speedMenu.append(option);
        }
        speed.append(speedToggle,speedMenu);
        const pip=button('Open picture-in-picture','fa-clone','data-video-pip'),fullscreen=button('Enter fullscreen','fa-expand','data-video-fullscreen');
        row.append(play,elapsed,volume,speed,pip,fullscreen);controls.append(seek.control,row);root.append(status,controls);
        const source=mediaSource(video.dataset.showcaseSrc||video.dataset.historySrc||video.getAttribute('src'));
        let userMuted=false;
        const player={root,video,origin:{...origin,source},placeholder:null};players.set(video,player);
        function load() {if(!source)return false;if(!video.getAttribute('src')){video.preload='metadata';video.src=source;video.load();}return true;}
        function playback() {
            const playing=!video.paused&&!video.ended;root.classList.toggle('is-playing',playing);play.setAttribute('aria-label',playing?'Pause video':'Play video');play.setAttribute('aria-pressed',String(playing));play.firstElementChild.className='fa-solid '+(playing?'fa-pause':'fa-play');localPlayback();
        }
        function timing() {
            const duration=video.duration,known=Number.isFinite(duration)&&duration>0;seek.input.disabled=!known;seek.input.max=known?duration:100;seek.input.value=video.currentTime;progress(seek.input,known?100*video.currentTime/duration:0);
            seek.input.setAttribute('aria-valuetext',time(video.currentTime)+(known?' of '+time(duration):''));elapsed.textContent=time(video.currentTime)+' / '+time(duration);
        }
        function audio() {
            const silent=video.muted||video.volume===0;mute.setAttribute('aria-label',silent?'Unmute video':'Mute video');mute.firstElementChild.className='fa-solid '+(silent?'fa-volume-xmark':video.volume>.66?'fa-volume-high':video.volume>.33?'fa-volume-low':'fa-volume-off');
            volumeRange.input.value=Math.round(video.volume*100);volumeRange.input.setAttribute('aria-valuetext',volumeRange.input.value+' percent');progress(volumeRange.input,video.volume*100);
        }
        function setVolume(value) {video.volume=clamp(value,0,1);preferredVolume=video.volume;if(video.volume>0)lastVolume=video.volume;userMuted=false;video.muted=Boolean(globalThis.AuraAudio?.getMasterMuted());try{localStorage.setItem('solsRollingCalculator:auraVideoVolume',String(video.volume));}catch{}audio();}
        function toggle() {
            if(!video.paused){video.pause();return;}
            if(!load()){status.hidden=false;status.textContent='This video source is unavailable.';return;}
            if(video.error)video.load();status.hidden=true;
            video.play().catch(()=>{status.hidden=false;status.textContent='Press Play to try again.';playback();});
        }
        async function full() {
            const owner=root.ownerDocument;
            try {
                if(root.classList.contains('aura-video-player--expanded'))root.classList.remove('aura-video-player--expanded');
                else if(owner.fullscreenElement)await owner.exitFullscreen();
                else if(root.requestFullscreen)await root.requestFullscreen();
                else root.classList.toggle('aura-video-player--expanded');
            }catch{root.classList.toggle('aura-video-player--expanded');}
            reflectFullscreen();
        }
        function reflectFullscreen() {
            const expanded=Boolean(root.ownerDocument.fullscreenElement===root||root.classList.contains('aura-video-player--expanded'));
            fullscreen.setAttribute('aria-label',expanded?'Exit fullscreen':'Enter fullscreen');fullscreen.firstElementChild.className='fa-solid '+(expanded?'fa-compress':'fa-expand');
        }
        player.state=()=>({time:video.currentTime,volume:video.volume,muted:video.muted,userMuted,rate:video.playbackRate,playing:!video.paused&&!video.ended});
        player.restore=state=>{
            load();video.volume=clamp(Number(state.volume)||0,0,1);userMuted=Boolean(state.userMuted??state.muted);video.muted=userMuted||Boolean(globalThis.AuraAudio?.getMasterMuted());video.playbackRate=clamp(Number(state.rate)||1,.25,2);
            const finish=()=>{if(lifetime.signal.aborted)return;if(Number.isFinite(video.duration))video.currentTime=clamp(Number(state.time)||0,0,video.duration);if(state.playing)video.play().catch(()=>{status.hidden=false;status.textContent='Press Play to resume.';});};
            if(video.readyState>=1)finish();else video.addEventListener('loadedmetadata',finish,{once:true,signal:lifetime.signal});audio();
        };
        player.returnInline=()=>{pip.setAttribute('aria-label','Open picture-in-picture');root.classList.remove('is-floating');};
        player.float=()=>{pip.setAttribute('aria-label','Return to aura');root.classList.add('is-floating');};
        player.load=load;
        player.applyMute=()=>{video.muted=userMuted||Boolean(globalThis.AuraAudio?.getMasterMuted());audio();};
        player.destroy=()=>{lifetime.abort();players.delete(video);};
        play.addEventListener('click',toggle);video.addEventListener('click',toggle);video.addEventListener('dblclick',full);
        seek.input.addEventListener('input',()=>{if(Number.isFinite(video.duration)){video.currentTime=Number(seek.input.value);timing();}});
        volumeRange.input.addEventListener('input',()=>setVolume(Number(volumeRange.input.value)/100));
        mute.addEventListener('click',()=>{if(globalThis.AuraAudio?.getMasterMuted()){status.textContent='Master audio is muted in Audio Settings.';status.hidden=false;return;}if(video.muted||!video.volume){if(!video.volume)setVolume(lastVolume);userMuted=false;}else userMuted=true;video.muted=userMuted;audio();});
        fullscreen.addEventListener('click',full);
        pip.addEventListener('click',()=>{if(parentPlayer)parentPlayer.openFromChild(player.origin,player.state());else if(floating?.player===player)returnToAura();else openFloating(player);});
        for(const name of ['play','pause','ended'])video.addEventListener(name,playback);
        video.addEventListener('play',()=>pauseOtherMedia(video));
        for(const name of ['loadedmetadata','durationchange','timeupdate'])video.addEventListener(name,timing);
        video.addEventListener('volumechange',audio);
        video.addEventListener('ratechange',()=>{speedToggle.textContent=video.playbackRate+'×';speedMenu.querySelectorAll('button').forEach(option=>option.setAttribute('aria-pressed',String(Number(option.dataset.videoRate)===video.playbackRate)));});
        video.addEventListener('waiting',()=>{status.textContent='Loading video…';status.hidden=false;});video.addEventListener('playing',()=>{status.hidden=true;});
        video.addEventListener('error',()=>{status.textContent='This video could not load. Try Play again or view its wiki source.';status.hidden=false;video.pause();});
        root.addEventListener('contextmenu',event=>{if(event.target===video)event.preventDefault();});
        root.addEventListener('keydown',event=>{
            if(event.target.matches('input,button,summary'))return;
            if(event.key===' '||event.key.toLowerCase()==='k'){event.preventDefault();toggle();}
            if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();if(Number.isFinite(video.duration))video.currentTime=clamp(video.currentTime+(event.key==='ArrowRight'?5:-5),0,video.duration);}
            if(event.key.toLowerCase()==='f'){event.preventDefault();full();}
            if(event.key.toLowerCase()==='m'){event.preventDefault();mute.click();}
            if(event.key==='Escape'&&root.classList.contains('aura-video-player--expanded')){root.classList.remove('aura-video-player--expanded');reflectFullscreen();}
        });
        document.addEventListener('fullscreenchange',reflectFullscreen,{signal:lifetime.signal});
        document.addEventListener('aura-audio-settings-change',player.applyMute,{signal:lifetime.signal});
        video.volume=preferredVolume;video.muted=Boolean(globalThis.AuraAudio?.getMasterMuted());audio();timing();playback();return player;
    }
    function connect(doc) {
        doc.addEventListener('click',event=>{
            if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
            const link=event.target.closest('a[href]');if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
            const target=destination(link.href);if(!target)return;
            if(!shellOwner){event.preventDefault();parentPlayer.navigate(target.href);}
            else if(floating||frame){event.preventDefault();navigate(target.href);}
        });
    }
    function navigate(value,push=true) {
        const target=destination(value);if(!target)return false;
        if(pendingReturn&&pendingReturn.origin.pageURL!==target.href)pendingReturn=null;
        frameTarget=target.href;
        if(push)history.pushState({auraVideoShell:true},'',target.href);
        if(!frame) {
            frame=document.createElement('iframe');frame.className='aura-navigation-frame';frame.title='Simulator and aura pages';frame.allow='autoplay; fullscreen';frame.setAttribute('allowfullscreen','');
            frame.addEventListener('load',()=>{notifyFrame();completeReturn();});
            frame.src=target.href;document.body.append(frame);document.body.classList.add('aura-video-shell');event(document,'aura-video-shell-state',{active:true});
        }else {try{frame.contentWindow.location.replace(target.href);}catch{frame.src=target.href;}}
        return true;
    }
    function restoreRootView() {
        // Clear ownership first: the departing directory saves its scroll on
        // pagehide and must not replace the address of the restored profile.
        const previousFrame=frame;frame=null;frameTarget=null;previousFrame?.remove();document.title=initialTitle;document.body.classList.remove('aura-video-shell');event(document,'aura-video-shell-state',{active:false});
    }
    function disposeFloating(pause=true) {
        if(!floating)return;
        pendingReturn=null;
        const {player,dock,bar}=floating;if(pause)player.video.pause();bar.remove();player.returnInline();
        if(player.placeholder?.isConnected){player.placeholder.replaceWith(player.root);player.placeholder=null;}else {player.root.remove();player.destroy();player.video.removeAttribute('src');player.video.load();}
        dock.remove();floating=null;notifyFrame();
    }
    function returnToAura() {
        if(!floating)return;
        const {player}=floating,target=destination(player.origin.pageURL);if(!target)return;
        if(player.placeholder?.isConnected&&target.href===initialURL) {
            history.pushState({auraVideoShell:true},'',target.href);restoreRootView();document.getElementById(player.origin.panelID)?.hidden&&document.querySelector(`[aria-controls="${player.origin.panelID}"]`)?.click();disposeFloating(false);const details=player.root.closest('details');if(details)details.open=true;player.root.scrollIntoView({block:'center'});player.root.focus({preventScroll:true});
        }else {pendingReturn={origin:player.origin,state:player.state()};navigate(target.href);}
    }
    function completeReturn() {
        if(!pendingReturn||!frame?.contentWindow.AuraVideoPlayer)return;
        const request=pendingReturn;
        if(frame.contentWindow.AuraVideoPlayer.restoreInline(request.origin,request.state)){pendingReturn=null;disposeFloating();}
    }
    function openFloating(player) {
        if(!player.origin.source)return;
        if(floating?.player===player)return;
        // Give the first browser Back a same-document directory entry too.
        // Otherwise the browser unloads the player before popstate can run.
        if(shellOwner&&!frame&&!navigationSeeded) {
            const back=destination(document.querySelector('[data-aura-directory-return]')?.href);
            if(back) {const current=location.href,state=history.state;history.replaceState({auraVideoShell:true},'',back.href);history.pushState({...state,auraVideoShell:true},'',current);navigationSeeded=true;}
        }
        disposeFloating();player.load();
        const placeholder=document.createElement('div');placeholder.className='aura-video-placeholder';placeholder.textContent='Playing in picture-in-picture';
        const returnButton=document.createElement('button');returnButton.type='button';returnButton.className='interface-button interface-button--ghost';returnButton.textContent='Return video';returnButton.addEventListener('click',returnToAura);placeholder.append(returnButton);
        player.root.before(placeholder);player.placeholder=placeholder;
        const dock=document.createElement('section');dock.className='aura-video-dock';dock.setAttribute('aria-label','Picture-in-picture');dock.setAttribute('role','region');
        const bar=document.createElement('div');bar.className='aura-video-dock__bar';
        const back=button('Return to aura','fa-arrow-left','data-video-return'),close=button('Close picture-in-picture','fa-xmark','data-video-close');
        const title=document.createElement('span');title.textContent=player.origin.title||'Aura video';title.className='aura-video-dock__title';bar.append(back,title,close);player.root.append(bar);dock.append(player.root);document.body.append(dock);floating={player,dock,bar};player.float();
        back.addEventListener('click',returnToAura);close.addEventListener('click',()=>disposeFloating());
        let drag;
        bar.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;const rect=dock.getBoundingClientRect();drag={x:event.clientX-rect.left,y:event.clientY-rect.top};bar.setPointerCapture(event.pointerId);});
        bar.addEventListener('pointermove',event=>{if(!drag)return;const rect=dock.getBoundingClientRect();dock.style.left=clamp(event.clientX-drag.x,8,innerWidth-rect.width-8)+'px';dock.style.top=clamp(event.clientY-drag.y,8,innerHeight-rect.height-8)+'px';dock.style.right='auto';dock.style.bottom='auto';});
        for(const name of ['pointerup','pointercancel'])bar.addEventListener(name,()=>{drag=null;});
        notifyFrame();
    }
    function openFromChild(origin,state) {
        const pageURL=destination(origin.pageURL),source=mediaSource(origin.source);if(!pageURL||!source||!frame)return false;
        disposeFloating();
        const holder=document.createElement('div');holder.hidden=true;document.body.append(holder);
        const video=document.createElement('video');video.dataset.showcaseSrc=source;video.setAttribute('aria-label',origin.title||'Aura video');holder.append(video);
        const player=create(video,{...origin,pageURL:pageURL.href,source});openFloating(player);player.placeholder?.remove();player.placeholder=null;holder.remove();player.restore(state);return true;
    }
    function restoreInline(origin,state) {
        if(!destination(origin.pageURL)||new URL(origin.pageURL).href!==location.href)return false;
        const source=mediaSource(origin.source),player=[...players.values()].find(player=>player.origin.source===source&&player.origin.panelID===origin.panelID);
        if(!player)return false;
        if(document.getElementById(origin.panelID)?.hidden)document.querySelector(`[aria-controls="${origin.panelID}"]`)?.click();
        const details=player.root.closest('details');if(details)details.open=true;
        player.restore(state);player.root.scrollIntoView({block:'center'});return true;
    }
    function syncAddress(value) {const target=destination(value);if(!target)return;if(parentPlayer)parentPlayer.syncAddress(target.href);else if(frame&&target.pathname===new URL(frameTarget).pathname){frameTarget=target.href;history.replaceState({auraVideoShell:true},'',target.href);}}
    const api=Object.freeze({shellOwner,navigate,openFromChild,restoreInline,notifyFrame,syncAddress,childReady:()=>{if(frame?.contentDocument?.title)document.title=frame.contentDocument.title;notifyFrame();completeReturn();},isFloating:video=>floating?.player.video===video,pauseFloating:()=>floating?.player.video.pause(),destination,mediaSource,getController:video=>players.get(video)});
    globalThis.AuraVideoPlayer=api;
    const auraName=document.title.split(' · ')[0];
    document.querySelectorAll('[data-aura-showcase] video,[data-aura-viewer] video').forEach(video=>{const label=video.getAttribute('aria-label')||'Aura video';create(video,{pageURL:location.href,panelID:video.closest('[data-aura-panel]')?.id,title:label.startsWith(auraName)?label:auraName+' · '+label});});
    connect(document);
    if(parentPlayer)Promise.resolve(globalThis.AuraPageLayout?.ready).then(()=>parentPlayer.childReady());
    window.addEventListener('popstate',()=>{if(!shellOwner||(!frame&&!floating&&!navigationSeeded))return;if(location.href===initialURL)restoreRootView();else navigate(location.href,false);});
    window.addEventListener('pagehide',()=>players.forEach(player=>player.video.pause()));
})();
