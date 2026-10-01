const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');

test('Explore stake reads the saved available ledger and hides unsupported amounts',()=>{
 const window={};
 vm.runInNewContext(fs.readFileSync('bankroll-builder-core.js','utf8'),{window,Date});
 const ledger={initialized:false,opening:350,bets:[],adjustments:[]};
 window.BANKROLL_BUILDER={ledger:()=>ledger};
 const card={classList:{contains:()=>false},suggestion:null,querySelector(selector){
  if(selector==='.score')return {textContent:'Confidence 70/100'};
  if(selector==='.stake-suggestion')return this.suggestion;
  return null;
 },appendChild(node){this.suggestion=node}};
 const document={addEventListener(){},querySelectorAll(selector){return selector==='#results .parlay-card'?[card]:[]},createElement(){return {dataset:{},remove(){card.suggestion=null}}}};
 vm.runInNewContext(fs.readFileSync('risk-bankroll.js','utf8'),{window,document,localStorage:{getItem:()=>null},Date});
 assert.equal(window.NFL_BANKROLL.current(),0);
 window.NFL_BANKROLL.refresh();
 assert.equal(card.suggestion,null);
 ledger.initialized=true;
 assert.equal(window.NFL_BANKROLL.current(),350);
 window.NFL_BANKROLL.refresh();
 assert.match(card.suggestion.innerHTML,/\$1\.00/);
 ledger.bets.push({createdAt:new Date().toISOString(),stake:7,status:'pending'});
 assert.equal(window.NFL_BANKROLL.current(),343);
 window.NFL_BANKROLL.refresh();
 assert.equal(card.suggestion,null);
});
