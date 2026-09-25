const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { MessageChannel } = require('node:worker_threads');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const context = vm.createContext({});
vm.runInContext(read('scripts/gear-luck.js'), context);
vm.runInContext(read('scripts/simulation-core.js'), context);
const { GearLuck: gear, SimulationCore: core } = context;
const plain = value => JSON.parse(JSON.stringify(value));
const main = read('scripts/main.js');
function loadFunction(name, target) {
    const start = main.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    vm.runInContext(main.slice(start, main.indexOf('\n}', start) + 2), target);
}
const seeded = () => { let seed = 514; return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); };

test('all equipment, conditional luck, and potion ordering', () => {
    assert.deepEqual(Object.values(gear.catalog).map(items => items.length), [21, 13, 6]);
    const loadout = { right: 'shining-star', left: 'jackpot', pocket: 'sunstone' };
    assert.equal(gear.basicLuck(loadout, 1, 0, 'starfall', 'day'), 5.27);
    assert.equal(gear.basicLuck(loadout, 1, 0, 'normal', 'night'), 2.27);
    assert.equal(gear.basicLuck({right:'ragnaroker'}, 1, 0, 'rainy'), 6);
    assert.equal(gear.basicLuck({right:'ragnaroker'}, 1, 0, 'normal'), 5.55);
    assert.equal(gear.totalLuck(30, 150000, 1.3, gear.rollState('the-thing', 10)), 195429);
    assert.equal(gear.totalLuck(30, 150000, 1.3, gear.rollState('the-thing', 9)), 195039);
    assert.equal(gear.totalLuck(30, 150000, 1.3, gear.rollState('ominous-coffin', 10)), 195105.30000000002);
});

test('bonus boundaries and Darkshader / Ruins cycles', () => {
    for (const [id, interval, multiplier] of [['none',10,2],['gravitational',10,6],['the-thing',10,11],['present-giver',11,5],['xmas-champion',6,4],['blessed-tide',6,3]]) {
        assert.equal(gear.rollState(id, interval - 1).bonusMultiplier, 1);
        assert.equal(gear.rollState(id, interval).bonusMultiplier, multiplier);
        assert.equal(gear.rollState(id, interval + 1).bonusMultiplier, 1);
    }
    assert.equal(gear.rollState('flesh', 1).bonusMultiplier, 1.3);
    assert.equal(gear.rollState('flesh', 999).bonusMultiplier, 1.3);
    const dark = Array.from({length: 41}, (_,i) => gear.rollState('darkshader',i+1));
    assert.deepEqual(dark.slice(20,30).map(s => s.basicMultiplier * s.bonusMultiplier), [2.5,2.5,2.5,2.5,5,2.5,2.5,2.5,2.5,5]);
    assert.equal(dark[19].basicMultiplier, 1);
    assert.equal(dark[30].basicMultiplier, 1);
    assert.equal(dark[40].basicMultiplier, 2.5);
    for (const [roll, multiplier] of [[1000,1],[1001,14],[1100,14],[1101,1],[2100,1],[2101,14],[2200,14],[2201,1]]) {
        const state = gear.rollState('unfathomable', roll);
        assert.equal(state.basicMultiplier, multiplier, `Ruins roll ${roll}`);
        assert.equal(state.bonus, false);
    }
});

test('bounded schedules match actual rolls and omit unreachable variants', () => {
    for (const id of ['none', ...gear.catalog.left.map(item => item.id)]) {
        const timing = gear.schedule(id);
        assert.ok(timing.pattern.length <= 1100);
        assert.ok(gear.statesInRange(timing, 0, 1e12).length <= 62);
        if (id === 'gemstone') continue;
        const cursor = core.createRollCursor([], [{...timing, count: 2500, startRoll: 0}]);
        for (let roll = 1; roll <= 2500; roll++) assert.deepEqual(plain(timing.states[cursor.next(seeded())]), plain(gear.rollState(id,roll)), `${id}, roll ${roll}`);
    }
    const timing = gear.schedule('none');
    assert.equal(gear.statesInRange(timing,0,9).length,1);
    assert.equal(gear.statesInRange(timing,9,1).length,1);
    assert.equal(gear.statesInRange(timing,0,10).length,2);
});

test('Gemstone holds hundredth-step luck across potion batch boundaries', () => {
    const timing = gear.schedule('gemstone');
    const plan = [{...timing,count:15,startRoll:0},{...timing,count:16,startRoll:15}];
    const cursor = core.createRollCursor([], plan);
    let draws = 0;
    const choices = [23.1/31,6.1/31,27.1/31];
    const states = Array.from({length:31},()=>timing.states[cursor.next(()=>choices[draws++])]);
    assert.deepEqual(states.slice(0,10).map(s=>s.extraLuck),Array(10).fill(0));
    assert.deepEqual(states.slice(10,20).map(s=>s.extraLuck),Array(10).fill(.23));
    assert.deepEqual(states.slice(20,30).map(s=>s.extraLuck),Array(10).fill(.06));
    assert.equal(states[30].extraLuck,.27);
    assert.equal(states[19].bonusMultiplier,2);
    assert.equal(draws,3);
});

test('prepared potion variants carry cycles without multiplying special luck', () => {
    const target = vm.createContext({GearLuck:gear, equippedGear:{left:'the-thing',right:'none'},
        getGearLuckInputs:()=>({basic:30,special:150000,finalMultiplier:1.3}), prepareSimulationBatch:batch=>batch});
    loadFunction('prepareEquipmentSimulation',target);
    const result = target.prepareEquipmentSimulation([{count:9,baseLuck:150000},{count:2,baseLuck:50000}],{primaryBiome:'normal'},{},true);
    assert.equal(result.batches.length,3);
    const cursor = core.createRollCursor(result.batches,result.sequencePlan);
    const luck = Array.from({length:11},()=>result.batches[cursor.next(seeded())].luckValue);
    assert.equal(luck[8],195039);
    assert.equal(luck[9],65429);
    assert.equal(luck[10],65039);
});

test('single-potion presets and add/remove controls keep basic and special luck separate', () => {
    const target = vm.createContext({baseLuck:1,singleSpecialLuck:0,currentLuck:1,
        LUCK_SELECTION_SOURCE:{STANDARD_PRESET:'standard-preset',DEVICE_PRESET:'device-preset'},
        document:{getElementById:()=>null},setLuckSelectionSource:()=>{},syncLuckVisualEffects:()=>{},
        recomputeLuckValue:()=>{},getActiveLuckMultipliers:()=>({}),getLuckMultiplierTotal:()=>1.3});
    loadFunction('applyLuckValue',target);
    loadFunction('applyLuckDelta',target);
    const options={luckSource:'standard-preset'};
    target.applyLuckValue(150000,options);
    assert.equal(target.baseLuck-target.singleSpecialLuck,1);
    assert.equal(target.singleSpecialLuck,150000);
    target.applyLuckDelta(150000,options);
    assert.equal(target.baseLuck-target.singleSpecialLuck,1);
    assert.equal(target.singleSpecialLuck,300000);
    target.applyLuckDelta(-600000,options);
    assert.equal(target.baseLuck,1);
    assert.equal(target.singleSpecialLuck,0);
    target.baseLuck=30;
    target.applyLuckDelta(150000,options);
    assert.equal(target.baseLuck-target.singleSpecialLuck,30);
    assert.equal(target.singleSpecialLuck,150000);
});

test('Tide lowers Rainy rarity without unlocking exclusives; Vampire supports Halloween 2026', () => {
    const target = vm.createContext({getAuraEventIds:a=>a.events||[],eventAuraBiomeRequirementsMet:()=>true,
        ROE_EXCLUSION_SET:new Set(),ROE_BREAKTHROUGH_BLOCKLIST:new Set(),GLITCH_EVENT_WHITELIST:new Set(['halloween26']),
        HALLOWEEN_EVENT_IDS:['halloween24','halloween25','halloween26'],LEVIATHAN_AURA_NAME:'Leviathan',MONARCH_AURA_NAME:'Monarch',HELLBORN_AURA_NAME:'Hellborn',
        isCyberspaceExclusiveLucklessAura:()=>false,getAuraGlitchBreakthroughMinChance:()=>null});
    for(const name of ['isAuraNativeTo','auraMatchesAnyBiome','readBreakthroughMultiplier','computeStandardEffectiveChance']) loadFunction(name,target);
    const normal = {biome:'normal',exclusivityBiome:'normal',primaryBiome:'normal',activeBiomes:['normal'],breakthroughBiomes:['normal'],enabledEventsSet:new Set(['halloween26']),eventChecker:()=>true};
    const rainy = {name:'Rainy aura',chance:12000,breakthroughs:new Map([['rainy',3]])};
    assert.equal(target.computeStandardEffectiveChance(rainy,normal),12000);
    assert.equal(target.computeStandardEffectiveChance(rainy,{...normal,rainyNative:true}),4000);
    assert.equal(target.computeStandardEffectiveChance({...rainy,nativeBiomes:new Set(['rainy'])},{...normal,rainyNative:true}),Infinity);
    const halloween = {name:'Future aura',chance:100000,events:['halloween26']};
    assert.equal(target.computeStandardEffectiveChance(halloween,{...normal,vampireHunter:true}),80000);
    assert.equal(target.computeStandardEffectiveChance(halloween,normal),100000);
    assert.equal(target.computeStandardEffectiveChance(halloween,{...normal,vampireHunter:true,eventChecker:()=>false}),Infinity);
    assert.equal(target.computeStandardEffectiveChance(rainy,{...normal,vampireHunter:true}),12000);
});

test('True Chance comes first, then the actual multiplier, with optional potion details', () => {
    const target = vm.createContext({getMultiplePotionBatchResultConfigs:b=>b?.id ? [{}] : [],formatMultiplePotionBatchResultMarkup:()=>'<span>With Heavenly</span>'});
    loadFunction('formatRollResultSuffix',target);
    assert.equal(target.formatRollResultSuffix('123',{rollMultiplier:11}), ' <span class="tinyClass">True Chance: 1 in 123 (11x)</span>');
    assert.match(target.formatRollResultSuffix('42',{rollMultiplier:1.3}),/42 \(1.3x\)/);
    assert.match(target.formatRollResultSuffix('42',{rollMultiplier:5,id:'heavenly'}),/True Chance: 1 in 42 \(5x\).*With Heavenly/);
    assert.equal(target.formatRollResultSuffix(null,{rollMultiplier:1}), '');
});

test('worker and main-thread runner agree across 25,000 scheduled rolls', async () => {
    const timing = gear.schedule('gemstone');
    const batchMessages = timing.states.map((state,index)=>({total:25000,prerollAuraRatios:[],prerollAuraIndices:[],lucklessAuraRatios:[],lucklessAuraIndices:[],lucklessBreakthroughIndices:[],luckAffectedAuraRatios:[state.bonus ? .6 : .2,1],luckAffectedAuraIndices:[0,1],luckAffectedBreakthroughIndices:[state.bonus?0:-1,-1]}));
    const plan = [{...timing,count:25000,startRoll:0}];
    const batches = batchMessages.map(b=>({count:b.total,winCounts:new Float64Array(2),breakthroughCounts:new Float64Array(2),combinedSelection:core.buildCombinedSimulationSelection([{selection:core.buildWeightedSelection(b.luckAffectedAuraRatios),auraIndices:b.luckAffectedAuraIndices,breakthroughIndices:b.luckAffectedBreakthroughIndices}])}));
    const wins = new Float64Array(2), breakthroughs = new Float64Array(2);
    const runner = core.createRunner(batches,wins,seeded(),breakthroughs,plan);
    while(!runner.done) runner.runSlice(8,()=>performance.now());
    const result = await new Promise((resolve,reject)=>{
        const timer = setTimeout(()=>reject(new Error('Worker timeout')),5000);
        const worker = vm.createContext({URL,MessageChannel,performance,drawEntropy:seeded(),self:{location:{href:'http://localhost/scripts/simulation-worker.js?v=2.2.0'},postMessage:message=>{
            if(message.type==='complete'){clearTimeout(timer);resolve(message);}
            if(message.type==='error'){clearTimeout(timer);reject(new Error(message.error));}
        }}});
        worker.importScripts=()=>vm.runInContext(read('scripts/simulation-core.js'),worker);
        vm.runInContext(read('scripts/simulation-worker.js'),worker);
        worker.self.onmessage({data:{type:'start',auraCount:2,batches:batchMessages,sequencePlan:plan}});
    });
    assert.equal(result.currentRoll,25000);
    assert.deepEqual([...result.winCounts],[...wins]);
    assert.deepEqual([...result.breakthroughCounts],[...breakthroughs]);
    assert.deepEqual(result.batchWinCounts.map(a=>[...a]),batches.map(b=>[...b.winCounts]));
});

test('Halloween 2026 is scaffolded but disabled, and all requested wiki titles are bundled', () => {
    const event = JSON.parse(read('data/events/halloween2026.json'));
    assert.equal(event.status,'upcoming');
    assert.equal(event.defaultEnabled,false);
    assert.deepEqual(event.auras,[]);
    assert.ok(!main.includes('new Set(["summer26"])'));
    const equipment = JSON.parse(read('tools/wiki-equipment-reference.json'));
    for (const item of Object.values(gear.catalog).flat()) assert.ok(equipment[item.name]?.markup,item.name);
    const overrides = JSON.parse(read('tools/wiki-title-overrides.json'));
    assert.equal(Object.keys(overrides).length,8);
    for(const item of Object.values(overrides)) assert.ok(item.markup && item.url);
});
