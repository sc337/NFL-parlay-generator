const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
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
