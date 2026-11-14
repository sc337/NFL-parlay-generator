const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('compact layout keeps all NBA profile cards visible and removes old analysis clones',()=>{
 let removed=0,cloned=0;
 const cards=Array.from({length:3},()=>({style:{display:'none'},classList:{remove(){},contains(){return false}},cloneNode(){cloned++;return {dataset:{},classList:{add(){}}}}}));
 const secondary={querySelectorAll:()=>[{remove(){removed++}}],appendChild(){}},drawer={querySelector:()=>secondary};
 const document={body:{dataset:{}},readyState:'loading',addEventListener(){},querySelector:s=>s==='#moreAnalysis'?drawer:null,querySelectorAll:()=>cards};
 const window={__ACTIVE_SPORT:'nba'},MutationObserver=class{};
 vm.runInNewContext(fs.readFileSync('compact-ui.js','utf8'),{window,document,MutationObserver});window.COMPACT_UI.compactResults();
 assert.equal(removed,1);assert.equal(cloned,0);assert.ok(cards.every(card=>card.style.display===''));
});
test('line buttons dispatch the original bubbling change and follow selected/disabled options',()=>{
 const nodes=new Map(),events=[];
 const source={id:'nbaLinesSelect',value:'both',options:['standard','alt','both'].map(value=>({value})),classList:{add(){}},after(group){nodes.set('#'+group.id,group)},dispatchEvent(event){events.push({value:this.value,bubbles:event.bubbles})}};
 const document={readyState:'loading',addEventListener(){},querySelector:s=>nodes.get(s),querySelectorAll:()=>[source],createElement:()=>({dataset:{},children:[],attributes:{},setAttribute(k,v){this.attributes[k]=v},append(child){this.children.push(child)},addEventListener(type,fn){this.click=fn},querySelectorAll(){return this.children}})};
 const window={};vm.runInNewContext(fs.readFileSync('selection-ui.js','utf8'),{window,document,Event});window.SELECTION_UI.mountLines();
 const group=nodes.get('#nbaLinesSelectButtons');assert.deepEqual(group.children.map(b=>b.textContent),['Standard','ALT','Both']);assert.equal(group.children[2].attributes['aria-pressed'],'true');
 const alt=group.children[1];group.click({target:{closest:()=>alt}});assert.deepEqual(events,[{value:'alt',bubbles:true}]);assert.equal(alt.attributes['aria-pressed'],'true');assert.equal(group.children[2].attributes['aria-pressed'],'false');
 source.options[1].disabled=true;window.SELECTION_UI.mountLines();assert.equal(alt.disabled,true);group.click({target:{closest:()=>alt}});assert.equal(events.length,1);assert.equal(group.children.length,3);
});
test('carousel remains enabled for NFL/NBA and detail edits preserve swipe position',()=>{
 const card=()=>({innerHTML:'original',classList:{contains:name=>name==='parlay-card',remove(){}}}),a=card(),b=card(),classes=new Set();
 const grid={children:[a,b],dataset:{},scrollLeft:0,classList:{toggle(name,on){on?classes.add(name):classes.delete(name)}},setAttribute(){}};
 const document={readyState:'loading',addEventListener(){},querySelector:s=>s==='#results'?grid:null,querySelectorAll:()=>[]};
 const window={__ACTIVE_SPORT:'nfl'},MutationObserver=class{observe(){}};
 vm.runInNewContext(fs.readFileSync('terminal-qol.js','utf8'),{window,document,MutationObserver});window.TERMINAL_QOL.enhance();assert.equal(classes.has('nfl-carousel'),true);
 grid.scrollLeft=420;a.innerHTML='details enhanced';window.TERMINAL_QOL.enhance();assert.equal(grid.scrollLeft,420);
 window.__ACTIVE_SPORT='nba';window.TERMINAL_QOL.enhance();assert.equal(classes.has('nfl-carousel'),true);grid.children=[card(),card()];window.TERMINAL_QOL.enhance();assert.equal(grid.scrollLeft,0);
 window.__ACTIVE_SPORT='nhl';window.TERMINAL_QOL.enhance();assert.equal(classes.has('nfl-carousel'),false);
});

test('shared builder reuses controls and keeps the same order across every sport',()=>{
 const nodes=new Map();
 class Node{
  constructor(id=''){this.id=id;this.children=[];this.dataset={};this.attributes={};this.classes=new Set();this.classList={add(){},toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k)};if(id)nodes.set('#'+id,this)}
  append(...items){for(const node of items){node.remove();node.parentElement=this;this.children.push(node)}}
  prepend(node){node.remove();node.parentElement=this;this.children.unshift(node)}
  remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null}}
  after(node){node.remove();const p=this.parentElement;node.parentElement=p;p.children.splice(p.children.indexOf(this)+1,0,node)}
  get nextElementSibling(){const p=this.parentElement;return p?.children[p.children.indexOf(this)+1]}
  set innerHTML(value){if(this.id==='sharedBuilder'){nodes.set('#sharedBuilder',this);const row=new Node();this.append(row,new Node('builderGame'));row.append(new Node('builderMode'),new Node('builderLegs'));nodes.get('#builderMode').append(new Node('builderModeOptions'))}}
  setAttribute(k,v){this.attributes[k]=v}
  addEventListener(k,v){this[k]=v}
 }
 const controls=new Node('parlayControls'),quality=new Node(),nflMode=new Node(),nbaField=new Node(),source=new Node('nbaModeSelect');source.value='multi';source.options=[{value:'sgp',textContent:'Same Game'},{value:'multi',textContent:'Multi-Game'}];source.closest=()=>nbaField;source.dispatchEvent=e=>{source.changed=e.bubbles};nbaField.append(source);
 nodes.set('.quality-settings',quality);nodes.set('.mode-tabs',nflMode);
 controls.append(quality,nflMode,nbaField,new Node('nflParlayFilters'),new Node('sharedSportFilters'),new Node('generateBtn'),new Node('gameChooserWrap'),new Node('nbaGameField'),new Node('ufcCardWrap'));
 const document={readyState:'loading',addEventListener(){},querySelector:s=>nodes.get(s),createElement:()=>new Node()};const window={};
 vm.runInNewContext(fs.readFileSync('selection-ui.js','utf8'),{window,document,Event,requestAnimationFrame(){}});
 for(const sport of ['nfl','nba','mlb','ncaaf','nhl','ufc','nba','nfl']){
  window.SELECTION_UI.mountBuilder(sport);const shell=nodes.get('#sharedBuilder'),filters=nodes.get(sport==='nfl'?'#nflParlayFilters':'#sharedSportFilters');
  assert.equal(shell.nextElementSibling,filters);assert.equal(filters.nextElementSibling,nodes.get('#generateBtn'));assert.equal(quality.parentElement,nodes.get('#builderLegs'));assert.equal(nflMode.hidden,sport!=='nfl');assert.equal(nbaField.hidden,sport!=='nba');assert.equal(nodes.get('#ufcCardWrap').parentElement,nodes.get('#builderGame'));assert.equal(nodes.get('#ufcCardWrap').classes.has('builder-inactive-game'),sport!=='ufc');
 }
 const active=new Node();active.dataset.mode='sgp';nodes.set('.mode-tabs .tab.active',active);window.SELECTION_UI.mountBuilder('nfl');assert.equal(nodes.get('#gameChooserWrap').classes.has('builder-inactive-game'),false);active.dataset.mode='multi';window.SELECTION_UI.mountBuilder('nfl');assert.equal(nodes.get('#gameChooserWrap').classes.has('builder-inactive-game'),true);
 const group=source.nextElementSibling;assert.equal(group.children.length,2);group.click({target:{closest:()=>group.children[0]}});assert.equal(source.value,'sgp');assert.equal(source.changed,true);
});
