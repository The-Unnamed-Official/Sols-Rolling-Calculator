(function (global) {
    'use strict';

    const DEFAULT_AUDIO_LEVEL = 0.5;

    const uiHandles = {
        rollTriggerButton: document.querySelector('.roll-trigger'),
        cancelRollButton: document.getElementById('rollCancelButton'),
        brandMark: document.querySelector('.banner__emblem'),
        rollCountInput: document.getElementById('roll-total'),
        biomeSelector: document.getElementById('biome-dropdown'),
        progressPanel: document.querySelector('.loading-indicator'),
        progressBarFill: document.querySelector('.loading-indicator__fill'),
        progressLabel: document.querySelector('.loading-indicator__value'),
        audio: {
            roll: document.getElementById('rollLoopSound'),
            k1: document.getElementById('thousandSound'),
            k10: document.getElementById('tenThousandSound'),
            k100: document.getElementById('hundredThousandSound'),
            m10: document.getElementById('tenMillionSound'),
            m100: document.getElementById('hundredMillionSound'),
            explosion: document.getElementById('explosionSoundFx'),
            limbo99m: document.getElementById('limbo99mSoundFx')
        }
    };

    const appState = {
        audio: {
            roll: true,
            obtain: true,
            ui: true,
            musicVolume: DEFAULT_AUDIO_LEVEL,
            obtainVolume: DEFAULT_AUDIO_LEVEL,
            obtainLastVolume: DEFAULT_AUDIO_LEVEL,
            uiVolume: DEFAULT_AUDIO_LEVEL,
            uiLastVolume: DEFAULT_AUDIO_LEVEL,
            cutsceneVolume: DEFAULT_AUDIO_LEVEL,
            masterMuted: false,
            context: null,
            bufferCache: new Map(),
            bufferPromises: new Map(),
            gainMap: new WeakMap(),
            fallbackPlayers: new Set()
        },
        cinematic: false,
        glitch: true,
        reduceMotion: false,
        backgroundRolling: false,
        videoPlaying: false,
        scrollLock: null,
        auraTierFilters: {
            basic: false,
            epic: false,
            unique: false,
            legendary: false,
            mythic: false,
            exalted: false,
            glorious: false,
            transcendent: false,
            challenged: false,
            limbo: false
        }
    };

    global.DEFAULT_AUDIO_LEVEL = DEFAULT_AUDIO_LEVEL;
    global.uiHandles = uiHandles;
    global.appState = appState;
})(typeof window !== 'undefined' ? window : globalThis);
