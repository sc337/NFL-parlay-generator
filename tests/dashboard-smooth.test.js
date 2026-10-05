const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(saved={},blocked=false){
 const frames=[],events={},classes=new Set(),storage=new Map([['sportsDashboardUIV2',JSON.stringify(saved)]]);
 const node={style:{},attrs:{},innerHTML:'existing picks',cards:true,value:'3',getBoundingClientRect:()=>({height:440}),querySelector(){return this.cards?{}:null},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}};
 const document={querySelector:s=>['#results','#legsSelect'].includes(s)?node:null,addEventListener:(k,v)=>events[k]=v,body:{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}}};
 const window={__ACTIVE_SPORT:'nfl',__SPORT_TOKEN:1};
 vm.runInNewContext(fs.readFileSync('dashboard-smooth.js','utf8'),{window,document,localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return storage.get(k)},setItem:(k,v)=>{if(blocked)throw Error('blocked');storage.set(k,v)}},requestAnimationFrame:f=>frames.push(f),setTimeout(){}});
 return {ui:window.DASHBOARD_UI,window,node,classes,frames,storage,flush(){while(frames.length)frames.shift()()}};
}
test('preferences preserve independent sport settings and reject invalid counts',()=>{
 const a=setup({sport:'nhl',nfl:{legs:4,mode:'multi',markets:['rushing','bogus']},nhl:{legs:2,date:'2026-10-06'},mlb:{legs:99}});
 assert.equal(a.ui.getSport(),'nhl');assert.equal(a.ui.get('nfl','legs',3),4);assert.equal(a.ui.get('nhl','legs',3),2);assert.equal(a.ui.get('mlb','legs',2),2);assert.deepEqual([...a.ui.get('nfl','markets',[])],['rushing']);
 a.ui.put('mlb','legs',5);a.ui.selectSport('mlb');assert.equal(a.ui.get('nfl','legs',3),4);assert.equal(JSON.parse(a.storage.get('sportsDashboardUIV2')).sport,'mlb');
});
test('quiet refresh preserves cards and reserves height until the newest request settles',()=>{
 const a=setup(),first=a.ui.begin('nfl');a.ui.placeholder('nfl');assert.equal(a.node.innerHTML,'existing picks');assert.equal(a.node.style.minHeight,'440px');assert.equal(a.node.attrs['aria-busy'],'true');
 const second=a.ui.begin('nfl');a.ui.end(first);a.flush();assert.equal(a.ui.isUpdating(),true);a.ui.end(second);a.flush();assert.equal(a.node.style.minHeight,'');assert.equal(a.node.attrs['aria-busy'],undefined);
});
test('sport switching invalidates earlier refresh completion and uses league-specific loading',()=>{
 const a=setup(),old=a.ui.begin('nfl');a.window.__ACTIVE_SPORT='nhl';a.window.__SPORT_TOKEN++;a.ui.selectSport('nhl');a.node.cards=false;a.ui.placeholder('nhl');assert.match(a.node.innerHTML,/NHL recommendations/);const current=a.ui.begin('nhl');a.ui.end(old);a.flush();assert.equal(a.ui.isUpdating(),true);a.ui.end(current);a.flush();assert.equal(a.ui.isUpdating(),false);
});
test('blocked storage does not break controls or loading',()=>{const a=setup({},true);a.ui.put('nfl','legs',4);assert.equal(a.ui.get('nfl','legs',2),4);a.ui.end(a.ui.begin('nfl'));a.flush()});
test('Generate ignores repeated clicks and regenerates once for a changed leg count',async()=>{
 const a=setup(),frames=[],button={setAttribute(){},removeAttribute(){}},select={value:'3'};let count=0,resolve;
 a.window.generate=()=>{count++;return new Promise(r=>resolve=r)};a.window.NFL_NO_DEMO={hasLiveGames:()=>true};
 const doc={readyState:'loading',addEventListener(){},querySelector:s=>s==='#generateBtn'?button:s==='#legsSelect'?select:null};
 vm.runInNewContext(fs.readFileSync('parlay-generator.js','utf8'),{window:a.window,document:doc,requestAnimationFrame:f=>frames.push(f),console});
 const run=a.window.PARLAY_GENERATOR.run();a.window.PARLAY_GENERATOR.run();while(frames.length)frames.shift()();await Promise.resolve();assert.equal(count,1);assert.equal(button.disabled,true);
 select.value='4';a.window.PARLAY_GENERATOR.run();resolve();await run;while(frames.length)frames.shift()();await Promise.resolve();assert.equal(count,2);resolve();await Promise.resolve();
});
