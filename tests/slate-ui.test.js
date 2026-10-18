const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(saved){const document={readyState:'loading',addEventListener(){},querySelector(){return null}},window={__ACTIVE_SPORT:'nfl'};vm.runInNewContext(fs.readFileSync('slate-ui.js','utf8'),{window,document,localStorage:{getItem:()=>saved},Date,Map,Set});return window}
function mounted(picker){
 const handlers={},input={value:'',addEventListener:(name,fn)=>handlers[name]=fn,...picker},display={textContent:''};
 const host={setAttribute(){},addEventListener(){},querySelector:s=>s==='input'?input:display,querySelectorAll:()=>[]};
 const document={readyState:'complete',body:{},createElement:()=>host,querySelector:s=>s==='main'?{prepend(){}}:s==='#pickOfDay'?{}:s==='#slateControls'?host:null};
 let refreshes=0;const window={__ACTIVE_SPORT:'nfl',generate:()=>refreshes++};
 vm.runInNewContext(fs.readFileSync('slate-ui.js','utf8'),{window,document,localStorage:{getItem(){}},Date,Map,Set,MutationObserver:class{observe(){}},setTimeout(){}});
 return {window,handlers,input,display,refreshes:()=>refreshes};
}
test('date field opens calendar from a click or keyboard and commits the selected local day',()=>{
 let opened=0,prevented=0;const m=mounted({showPicker:()=>opened++});
 m.handlers.click();m.handlers.keydown({key:'Enter',preventDefault:()=>prevented++});m.handlers.keydown({key:' ',preventDefault:()=>prevented++});m.handlers.keydown({key:'ArrowRight',preventDefault:()=>prevented++});
 assert.equal(opened,3);assert.equal(prevented,2);
 const when=new Date(Date.now()+3*86400000),selected=m.window.SLATE_UI.day(when);
 m.input.value=selected;m.handlers.change({target:m.input});
 assert.equal(m.window.SLATE_UI.date('nfl'),selected);assert.equal(m.input.value,selected);assert.equal(m.refreshes(),1);
 assert.equal(m.window.SLATE_UI.matches('nfl',{game_time:when.toISOString()}),true);
});
test('unsupported or rejected picker calls preserve native keyboard and change behavior',()=>{
 for(const picker of [{},{showPicker(){throw Error('NotAllowedError')}}]){
  const m=mounted(picker);m.handlers.click();m.handlers.keydown({key:'Enter',preventDefault(){assert.fail('native fallback must remain available')}});
  const selected=m.window.SLATE_UI.day(Date.now()+86400000);m.input.value=selected;m.handlers.change({target:m.input});assert.equal(m.window.SLATE_UI.date('nfl'),selected);
 }
});
test('Today, next slate and custom dates share a local-day filter; started and unknown events never match',()=>{
 const w=setup(),api=w.SLATE_UI,now=Date.now(),tomorrow=new Date(now+86400000).toISOString(),later=new Date(now+3*86400000).toISOString(),rows=[{game_time:later},{game_time:tomorrow},{game_time:new Date(now-1000).toISOString()}];
 api.prepare('nfl',rows);assert.equal(api.matches('nfl',rows[0]),false);api.set('nfl','next');assert.equal(api.date('nfl'),api.day(tomorrow));assert.equal(api.matches('nfl',rows[1]),true);assert.equal(api.matches('nfl',rows[2]),false);assert.equal(api.matches('nfl',{}),false);
 api.set('nfl',api.day(later));assert.equal(api.matches('nfl',rows[0]),true);assert.equal(api.matches('nfl',rows[1]),false);
 api.set('nfl','2026-02-31');assert.equal(api.date('nfl'),api.day(later));api.set('nhl','next');api.prepare('nhl',[{game_time:tomorrow}]);assert.equal(api.date('nfl'),api.day(later));assert.equal(api.date('nhl'),api.day(tomorrow));
});
test('NFL game associations resolve times and next slate follows new quotes without retaining yesterday',()=>{const w=setup(),a=w.SLATE_UI,m={ticker:'prop'},time=new Date(Date.now()+86400000).toISOString();a.prepare('nfl',[m],[{commence_time:time,markets:[m]}]);a.set('nfl','next');assert.equal(a.matches('nfl',m),true);a.prepare('nfl',[]);assert.match(a.empty('nfl','Fresh',false),/No upcoming quoted events/);assert.match(a.empty('nfl','Feed unavailable',false),/Feed unavailable/);a.prepare('nfl',[{game_time:time}]);assert.match(a.empty('nfl','Fresh',false),/No qualifying straight/)});
test('odds format conversion preserves actual source and sportsbook quotes are never shown as Kalshi cents',()=>{for(const [saved,expected] of [['american','Kalshi -150'],['decimal','Kalshi 1.67'],['cents','Kalshi 60¢']]){const w=setup(saved);assert.equal(w.ODDS_DISPLAY.label({odds:-150,p:.6,source:'Kalshi'}),expected);assert.match(w.ODDS_DISPLAY.label({odds:150,p:.4,source:'FanDuel'}),/^FanDuel /);assert.doesNotMatch(w.ODDS_DISPLAY.label({odds:150,p:.4,source:'Caesars'}),/¢/);assert.equal(w.ODDS_DISPLAY.label({odds:null,p:null,source:'Kalshi'}),'Quote unavailable')}});
