const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node {
 constructor(tag='div',cls=''){this.tagName=tag.toUpperCase();this.nodeType=1;this.className=cls;this.childNodes=[];this.dataset={};this.events={};this.attrs={};this.classList={contains:k=>this.className.split(' ').includes(k),add:k=>{if(!this.classList.contains(k))this.className+=' '+k},remove:k=>this.className=this.className.split(' ').filter(x=>x!==k).join(' ')};this.textContent=''}
 get isConnected(){return this.root===true||!!this.parentNode?.isConnected}
 get parentElement(){return this.parentNode}
 append(...nodes){for(const n of nodes){n.remove();n.parentNode=this;this.childNodes.push(n)}}
 remove(){if(this.parentNode)this.parentNode.childNodes=this.parentNode.childNodes.filter(n=>n!==this);this.parentNode=null}
 insertBefore(n,ref){n.remove();const i=this.childNodes.indexOf(ref);n.parentNode=this;this.childNodes.splice(i,0,n)}
 replaceWith(n){const p=this.parentNode;p.insertBefore(n,this);this.remove()}
 replaceChildren(){for(const n of [...this.childNodes])n.remove()}
 matches(s){return s.split(',').some(k=>k.trim().startsWith('.')?this.classList.contains(k.trim().slice(1)):k.trim().startsWith('#')?this.id===k.trim().slice(1):this.tagName===k.trim().toUpperCase())}
 closest(s){return this.matches(s)?this:this.parentNode?.closest(s)||null}
 querySelector(s){for(const n of this.childNodes){if(n.matches(s))return n;const found=n.querySelector(s);if(found)return found}return null}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(k,f){this.events[k]=f}
 focus(o){this.focused=o}
 showModal(){this.open=true}
 close(){this.open=false;this.events.close()}
 set innerHTML(v){const frame=new Node('div','details-sheet-frame'),header=new Node('header'),h=new Node('h2'),button=new Node('button'),scroll=new Node('div','details-sheet-scroll'),content=new Node('div','details-sheet-content');header.append(h,button);scroll.append(content);frame.append(header,scroll);this.append(frame)}
}
function runtime(sport='nhl',cls='card-explanation'){
 const body=new Node('body');body.root=true;body.dataset.sport=sport;const results=new Node();results.id='results';const card=new Node('article','parlay-card'),title=new Node('h3','parlay-name');title.textContent='Best 3-Leg';const details=new Node('details',cls),summary=new Node('summary'),analysis=new Node('p','summary');analysis.textContent='Experimental; verify playing status.';details.append(summary,analysis);card.append(title,details);results.append(card);body.append(results);
 let dialog,observe;const events={},styles=new Map(),restored=[];const document={body,documentElement:{style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)}},createElement:tag=>{dialog=new Node(tag);return dialog},createComment:()=>{const n=new Node();n.nodeType=8;return n},addEventListener:(k,f)=>events[k]=f};const window={scrollY:510,scrollTo:o=>restored.push(o)};class Observer{constructor(f){observe=f}observe(){}}
 vm.runInNewContext(fs.readFileSync('details-sheet.js','utf8'),{window,document,MutationObserver:Observer});let prevented=false;return{body,source:details,summary,analysis,window,styles,restored,card,open:()=>{events.click({target:summary,preventDefault:()=>prevented=true});return dialog},prevented:()=>prevented,observe:()=>observe()}
}
test('all five sports open the same modal and restore the original detail nodes and scroll',()=>{for(const sport of ['nfl','mlb','ncaaf','ufc','nhl']){const r=runtime(sport),dialog=r.open();assert.equal(dialog.open,true);assert.equal(r.prevented(),true);assert.equal(r.source.open,false);assert.equal(dialog.querySelector('h2').textContent,sport.toUpperCase()+' · Best 3-Leg');assert.equal(r.analysis.parentNode,dialog.querySelector('.details-sheet-content'));assert.equal(r.styles.get('--details-scroll-offset'),'-510px');dialog.querySelector('button').events.click();assert.equal(r.analysis.parentNode,r.source);assert.deepEqual(r.source.childNodes,[r.summary,r.analysis]);assert.equal(r.body.classList.contains('details-sheet-open'),false);assert.equal(r.restored[0].top,510);assert.equal(r.summary.focused.preventScroll,true)}});
test('feed replacement and sport switches close the modal instead of leaving stale details',()=>{for(const switchSport of [false,true]){const r=runtime(),dialog=r.open();if(switchSport)r.body.dataset.sport='mlb';else r.card.remove();r.observe();assert.equal(dialog.open,false);assert.equal(r.body.classList.contains('details-sheet-open'),false);assert.equal(dialog.querySelector('.details-sheet-content').childNodes.length,0)}});
test('Extra Picks uses the shared bottom sheet in every sport and restores its suggestions',()=>{for(const sport of ['nfl','mlb','ncaaf','ufc','nhl']){const r=runtime(sport,'extra-picks-details'),d=r.open();assert.equal(d.querySelector('h2').textContent,sport.toUpperCase()+' · Extra Picks');assert.equal(r.analysis.parentNode,d.querySelector('.details-sheet-content'));d.close();assert.equal(r.analysis.parentNode,r.source)}});
test('Escape/native close, backdrop dismissal and added context preserve a single scroll surface',()=>{const r=runtime('nfl','ticket-details'),d=r.open(),extra=new Node('div','supporting-note');d.querySelector('.details-sheet-content').append(extra);d.events.click({target:d});assert.equal(d.open,false);assert.equal(extra.parentNode,r.source);const next=r.open();next.close();assert.equal(r.analysis.parentNode,r.source);const css=fs.readFileSync('details-sheet.css','utf8');assert.match(css,/\.details-sheet-scroll\{[^}]*overflow-y:auto/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/prefers-reduced-motion/);assert.match(fs.readFileSync('index.html','utf8'),/details-sheet.js/)});
