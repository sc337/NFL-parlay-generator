const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(sport){
 const frames=[],events={},gridClasses=new Set(),dots={children:[],replaceChildren(...nodes){this.children=nodes}},position={textContent:'',hidden:false};
 const hint={hidden:true,dataset:{},querySelector:s=>s==='.carousel-dots'?dots:s==='.carousel-position'?position:null};
 const grid={children:[],dataset:{},scrollLeft:0,classList:{toggle(c,on){on?gridClasses.add(c):gridClasses.delete(c)}},setAttribute(){},getBoundingClientRect:()=>({left:0}),addEventListener:(n,fn)=>events[n]=fn,scrollTo({left}){this.scrollLeft=left;events.scroll?.()}};
 const document={createElement(){return {attributes:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v},addEventListener(n,fn){this[n]=fn}}}};
 const window={__ACTIVE_SPORT:sport,matchMedia:()=>({matches:true})};
 const context=vm.createContext({window,document,$:s=>s==='#results'?grid:s==='#parlaySwipeHint'?hint:null,requestAnimationFrame:fn=>{frames.push(fn);return frames.length}});
 const source=fs.readFileSync('terminal-qol.js','utf8');vm.runInContext(source.slice(source.indexOf('function variants(){'),source.indexOf('function persist(){')),context);
 const flush=()=>{while(frames.length)frames.shift()()};
 function show(names){
  grid.children=names.map((name,index)=>({classList:{contains:c=>c==='parlay-card',remove(){}},querySelector:s=>s==='.parlay-name'?{textContent:name+' · '+sport.toUpperCase()+' · 3 legs'}:null,getBoundingClientRect:()=>({left:index*320-grid.scrollLeft})}));
  context.variants();flush();
 }
 return {show,flush,hint,dots,position,grid,gridClasses};
}
for(const sport of ['nba','nfl'])test(sport+' navigation follows complete profiles through three, two, one and zero results',()=>{
 const r=setup(sport);
 r.show(['Conservative','Balanced','Lotto']);assert.equal(r.hint.hidden,false);assert.equal(r.dots.children.length,3);assert.equal(r.position.textContent,'1 of 3');
 r.dots.children[2].click();r.flush();assert.equal(r.position.textContent,'3 of 3');assert.equal(r.dots.children[2].attributes['aria-current'],'true');
 r.show(['Conservative','Lotto']);assert.deepEqual([...r.dots.children].map(b=>b.textContent),['Conservative','Lotto']);assert.equal(r.position.textContent,'1 of 2');
 r.dots.children[1].click();r.flush();assert.equal(r.position.textContent,'2 of 2');
 r.show(['Balanced']);assert.equal(r.hint.hidden,false);assert.equal(r.dots.children.length,1);assert.equal(r.dots.children[0].textContent,'Balanced');assert.equal(r.position.hidden,true);assert.equal(r.gridClasses.has('nfl-carousel'),false);
 r.show([]);assert.equal(r.hint.hidden,true);assert.equal(r.gridClasses.has('nfl-carousel'),false);
 r.show(['Balanced','Lotto']);r.show(['Conservative','Lotto']);assert.deepEqual([...r.dots.children].map(b=>b.textContent),['Conservative','Lotto']);assert.equal(r.position.hidden,false);
});
