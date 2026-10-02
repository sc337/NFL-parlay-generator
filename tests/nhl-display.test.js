const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Small DOM fixture exercises the actual shared card transforms without a browser.
class Element {
 constructor(tag='div',className=''){this.tagName=tag;this.className=className;this.children=[];this.dataset={};this.style={};this.attributes={};this._text='';this.classList={contains:c=>this.className.split(' ').includes(c),add:c=>{if(!this.classList.contains(c))this.className+=' '+c},remove:c=>{this.className=this.className.split(' ').filter(x=>x!==c).join(' ')}}}
 get parentElement(){return this.parent}
 get firstElementChild(){return this.children[0]}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 set textContent(v){this._text=String(v);this.children.forEach(c=>c.parent=null);this.children=[]}
 append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node)}}
 appendChild(node){this.append(node)}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null}
 after(node){const parent=this.parent;if(!parent)return;node.remove();node.parent=parent;parent.children.splice(parent.children.indexOf(this)+1,0,node)}
 before(node){const parent=this.parent;if(!parent)return;node.remove();node.parent=parent;parent.children.splice(parent.children.indexOf(this),0,node)}
 setAttribute(k,v){this.attributes[k]=String(v)}
 matches(sel){return sel[0]==='#'?this.id===sel.slice(1):sel[0]==='.'&&this.classList.contains(sel.slice(1))}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null}
 querySelectorAll(sel){if(sel===':scope>.legs>.leg')return (this.children.find(c=>c.classList.contains('legs'))?.children||[]).filter(c=>c.classList.contains('leg'));const nodes=this.children.flatMap(c=>[c,...c.querySelectorAll('*')]);return sel==='*'?nodes:nodes.filter(c=>c.matches(sel))}
 closest(sel){return this.matches(sel)?this:this.parent?.closest(sel)||null}
 cloneNode(){const copy=new Element(this.tagName,this.className);copy._text=this._text;copy.id=this.id;copy.dataset={...this.dataset};copy.style={...this.style};this.children.forEach(c=>copy.append(c.cloneNode()));return copy}
}
const el=(tag,cls,text)=>{const node=new Element(tag,cls);if(text)node.textContent=text;return node};
function slip(withFooter=false){const card=el('article','parlay-card player-props-card'),top=el('div','parlay-top'),title=el('h3','parlay-name','NHL Props'),summary=el('p','summary','Experimental estimates, confirm participation.'),legs=el('div','legs'),leg=el('div','leg sport-visual-leg'),copy=el('div','sport-visual-copy');top.append(title);copy.append(el('div','leg-title','Andrew Copp Under 0.5 Goals'),el('div','leg-sub','Rangers vs Red Wings · Experimental estimate 89% · If playing'));leg.dataset.eventTime='2026-10-02T22:30:00Z';leg.dataset.matchup='Rangers vs Red Wings';leg.append(copy,el('div','leg-quote','Kalshi 79¢'));legs.append(leg);card.append(top,summary,legs);if(withFooter)card.append(el('div','card-footer'));return card}
function display(cards){const roots=cards.map(c=>{const r=el('section','');r.append(c);return r}),document={body:{dataset:{sport:'nhl'}},createElement:tag=>el(tag,''),querySelectorAll:sel=>sel.endsWith('>.summary')?cards.flatMap(c=>c.children.filter(n=>n.classList.contains('summary'))):cards.filter(c=>!c.dataset.compact)};
 const context=vm.createContext({document,window:{},Date});const source=fs.readFileSync('visual-refresh.js','utf8');
 vm.runInContext(source.slice(source.indexOf('function compactDate'),source.indexOf('function dockMatchups')),context);
 return {context,roots,run:()=>{context.compactSummaries();context.compactParlays()}};
}
test('footerless NHL prop cards keep Details inside and produce the shared square tiles',()=>{
 const card=slip(),app=display([card]);app.run();
 const details=card.querySelector('.card-explanation'),tile=card.querySelector('.market-tile');
 assert.equal(details.parentElement,card);assert.equal(app.roots[0].children.length,1);
 assert.equal(tile.querySelector('.market-tile-heading').textContent,'Goals');assert.equal(tile.querySelector('.market-tile-line').textContent,'U 0.5');assert.equal(tile.querySelector('.market-tile-price').textContent,'Kalshi 79¢');
 assert.equal(card.querySelector('.parlay-name').textContent,'NHL Props · 1 pick');
 assert.equal(card.querySelector('.leg-quote'),null);assert.match(card.querySelector('.leg-brief').textContent,/Rangers vs Red Wings/);
 assert.equal(details.querySelector('.leg-sub').parentElement.className,'card-detail-row');
 app.run();assert.equal(card.querySelectorAll('.market-tile').length,1);assert.equal(card.querySelectorAll('.card-explanation').length,1);
});
test('cards with footers retain contained Details and unready cards can retry transformation',()=>{
 const card=slip(true),app=display([card]);app.context.compactParlays();assert.equal(card.dataset.compact,undefined);
 app.run();assert.equal(card.querySelector('.card-explanation').parentElement,card);assert.equal(card.dataset.compact,'1');
});
test('NHL uses the same primary-card and secondary-analysis structure as other sports',()=>{
 const source=fs.readFileSync('compact-ui.js','utf8');
 for(const sport of ['nhl','mlb','ncaaf','ufc']){
  const cards=[slip(true),slip()],secondary=el('div','analysis-secondary'),analysis=el('details','more-analysis');cards[0].classList.remove('player-props-card');secondary.id='analysisSecondary';analysis.append(secondary);
  const window={__ACTIVE_SPORT:sport},document={body:{dataset:{}}},context=vm.createContext({window,document,$:()=>analysis,$$:()=>cards});
  vm.runInContext(source.slice(source.indexOf('function ensureAnalysis'),source.indexOf('function moveConsensus'))+source.slice(source.indexOf('function compactSportResults'),source.indexOf('function tidy')),context);
  context.compactSportResults();assert.equal(cards[0].style.display,'');assert.equal(cards[1].style.display,'none');assert.equal(secondary.children.length,1);assert.equal(secondary.children[0].dataset.compactOrigin,'sport');
 }
});
test('NHL props stay in the secondary drawer even when the main parlay passes',()=>{
 const source=fs.readFileSync('compact-ui.js','utf8'),card=slip(),secondary=el('div','analysis-secondary'),analysis=el('details','more-analysis');secondary.id='analysisSecondary';analysis.append(secondary);
 const context=vm.createContext({window:{__ACTIVE_SPORT:'nhl'},document:{body:{dataset:{}}},$:()=>analysis,$$:()=>[card]});
 vm.runInContext(source.slice(source.indexOf('function ensureAnalysis'),source.indexOf('function moveConsensus'))+source.slice(source.indexOf('function compactSportResults'),source.indexOf('function tidy')),context);
 context.compactSportResults();assert.equal(card.style.display,'none');assert.equal(secondary.children.length,1);
});
test('NHL official player images use the shared photo class and reject unrelated hosts',()=>{
 const window={},context=vm.createContext({window});vm.runInContext(fs.readFileSync('sports-media.js','utf8'),context);
 const html=window.SPORT_MEDIA.nhl({player:'Andrew Copp',headshot:'https://assets.nhle.com/mugs/nhl/20262027/DET/8475168.png'});
 assert.match(html,/sport-photo/);assert.match(html,/Andrew Copp headshot/);
 assert.equal(window.SPORT_MEDIA.nhl({player:'Player',headshot:'https://untrusted.example/image.png'}),'');
});
