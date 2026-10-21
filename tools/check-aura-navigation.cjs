const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../scripts/aura-navigation.js'),'utf8');
const home='https://example.com/simulator/auras/';
function navigate(value) {
    const back={href:home},mutation={href:'https://example.com/simulator/auras/poseidon-atlantis/'};
    const location={href:'https://example.com/simulator/auras/poseidon/'+(value?'?return='+encodeURIComponent(value):'')};
    vm.runInNewContext(script,{URL,location,document:{baseURI:location.href,querySelector:()=>back,querySelectorAll:()=>[mutation]}});
    return {back:new URL(back.href),mutation:new URL(mutation.href)};
}
const directory='/simulator/auras/?q=astrald&biome=Rainy&page=2&size=18&scroll=1200';
const returned=navigate(directory);
assert.equal(returned.back.href,'https://example.com'+directory);
assert.equal(returned.mutation.searchParams.get('return'),directory,'Mutation navigation must keep the original directory context');
assert.equal(returned.mutation.pathname,'/simulator/auras/poseidon-atlantis/');
for(const legacy of ['/simulator/auras','/simulator/auras/index','/simulator/auras/index.html']) {
    const result=navigate(legacy+'?q=jade&page=2');
    assert.equal(result.back.href,home+'?q=jade&page=2','Existing return links use the clean directory route');
    assert.equal(result.mutation.searchParams.get('return'),'/simulator/auras/?q=jade&page=2');
}
assert.equal(navigate('').back.href,home,'Profiles opened from elsewhere return to a fresh directory');
for(const invalid of ['https://malicious.example/simulator/auras/index.html','https://user:pass@example.com/simulator/auras/index.html','/simulator/index.html','javascript:alert(1)','//malicious.example/simulator/auras/index.html']) assert.equal(navigate(invalid).back.href,home,'Reject return destinations outside the local directory');
console.log('Passed: directory return context survives mutations; unrelated entries start fresh and external return destinations are rejected.');
