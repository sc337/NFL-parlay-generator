const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime({viewport=true}={}){
 const values=new Map(),classes=new Set(),events={},vevents={},devents={},media={matches:true,addEventListener:(n,f)=>events.media=f},dialog={open:false,addEventListener:(n,f)=>devents[n]=f};let observe,queued=[],restored=[];
 const root={style:{setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}};
 const document={readyState:'complete',documentElement:root,body:{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}},querySelector:()=>dialog};
 const window={innerHeight:844,scrollY:520,matchMedia:()=>media,addEventListener:(n,f)=>events[n]=f,scrollTo:o=>restored.push(o)};
 if(viewport)window.visualViewport={height:844,offsetTop:0,scale:1,addEventListener:(n,f)=>vevents[n]=f};
 class Observer{constructor(f){observe=f}observe(){}}
 vm.runInNewContext(fs.readFileSync('iphone-layout.js','utf8'),{window,document,MutationObserver:Observer,requestAnimationFrame:f=>{queued.push(f);return queued.length}});
 const flush=()=>{const work=queued;queued=[];work.forEach(f=>f())};flush();
 return {window,values,classes,events,vevents,dialog,media,restored,observe:()=>observe(),flush,queued:()=>queued.length};
}
test('keyboard resizing positions the sheet above the keyboard and batches viewport events',()=>{const r=runtime();Object.assign(r.window.visualViewport,{height:490,offsetTop:10});r.vevents.resize();r.vevents.scroll();assert.equal(r.queued(),1);r.flush();assert.equal(r.values.get('--iphone-visible-height'),'490px');assert.equal(r.values.get('--iphone-keyboard-inset'),'344px');Object.assign(r.window.visualViewport,{height:844,offsetTop:0});r.vevents.resize();r.flush();assert.equal(r.values.get('--iphone-keyboard-inset'),'0px')});
test('pinch zoom is preserved and absent visualViewport uses the layout viewport',()=>{const r=runtime();Object.assign(r.window.visualViewport,{height:300,scale:2});r.vevents.resize();r.flush();assert.equal(r.values.get('--iphone-visible-height'),'844px');const fallback=runtime({viewport:false});fallback.window.innerHeight=600;fallback.events.resize();fallback.flush();assert.equal(fallback.values.get('--iphone-visible-height'),'600px');assert.equal(fallback.values.get('--iphone-keyboard-inset'),'0px')});
test('mobile settings lock the background and restore the prior scroll on close or rotation',()=>{const r=runtime();r.dialog.open=true;r.observe();assert.ok(r.classes.has('iphone-settings-open'));assert.equal(r.values.get('--iphone-scroll-offset'),'-520px');r.window.scrollY=0;r.observe();r.dialog.open=false;r.observe();assert.equal(r.classes.size,0);assert.equal(r.restored[0].top,520);assert.equal(r.values.has('--iphone-scroll-offset'),false);r.window.scrollY=280;r.dialog.open=true;r.observe();r.media.matches=false;r.events.media();assert.equal(r.classes.size,0);assert.equal(r.restored[1].top,280);r.observe();assert.equal(r.restored.length,2)});
