const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const window={};let urls=[];
const document={addEventListener(){},querySelector(){return null},body:{classList:{add(){},remove(){}}}};
const futureDate=new Date(Date.now()+7*86400000),eventDate=String(futureDate.getUTCFullYear()).slice(-2)+futureDate.toLocaleString('en-US',{month:'short',timeZone:'UTC'}).toUpperCase()+String(futureDate.getUTCDate()).padStart(2,'0');
const snapshot={updated_at:new Date().toISOString(),markets:[
 {kind:'moneyline',event_ticker:'KXNCAAFGAME-'+eventDate+'ARMYTEM',ticker:'KXNCAAFGAME-'+eventDate+'ARMYTEM-ARMY',title:'Army wins',label:'Army',probability:.62,yes_bid:.60,yes_ask:.64,volume:500},
 {kind:'moneyline',event_ticker:'KXNCAAFGAME-'+eventDate+'ARMYTEM',ticker:'KXNCAAFGAME-'+eventDate+'ARMYTEM-TEM',title:'Temple wins',label:'Temple',probability:.38,yes_bid:.36,yes_ask:.40,volume:500}
]};
const context={window,document,localStorage:{getItem:()=>''},Date,Math,URL,setTimeout(){},fetch:async url=>{urls.push(String(url));if(String(url).includes('kalshi-ncaaf'))return{ok:true,json:async()=>snapshot};return{ok:false,status:403}}};
vm.runInNewContext(fs.readFileSync('market-guards.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('prediction-model.js','utf8'),context);
(async()=>{
 const data=await window.PREDICTION_MODEL.load('ncaaf');
 assert.equal(data.rows.length,2);
 assert.equal(data.rows.find(x=>x.side==='Army').estimate,.62);
 assert(urls.every(u=>!u.includes('the-odds-api')),'No key must mean no Odds API requests');
 const fixture={names:['New Orleans Saints','Las Vegas Raiders'],side:'New Orleans Saints',p:.55,time:Date.parse('2026-09-27T20:00:00Z')};
 const poly=[{title:'Las Vegas Raiders vs New Orleans Saints',startTime:'2026-09-27T20:00:00Z',markets:[{outcomes:'["New Orleans Saints","Las Vegas Raiders"]',outcomePrices:'["0.60","0.40"]'}]}];
 assert.equal(window.PREDICTION_MODEL.poly(poly,fixture,'nfl'),.60);
 const offered=[{home_team:'New Orleans Saints',away_team:'Las Vegas Raiders',commence_time:'2026-09-27T20:00:00Z',bookmakers:[{key:'fanduel',title:'FanDuel',last_update:new Date().toISOString(),markets:[{key:'h2h',outcomes:[{name:'New Orleans Saints',price:-110},{name:'Las Vegas Raiders',price:+100}]}]}]}];
 const matched=window.PREDICTION_MODEL.apiMatches(offered,fixture,'nfl');
 assert.equal(matched.length,1);
 assert.equal(window.PREDICTION_MODEL.forecast(fixture,null,matched).priced[0].ev,null,'One reference feed cannot establish EV');
 assert(window.PREDICTION_MODEL.forecast(fixture,.60,matched).priced[0].ev>0);
 const valued=window.PREDICTION_MODEL.forecast({...fixture,key:'one',volume:200},.60,matched);
 const sameGame={...valued,key:'one',side:'Las Vegas Raiders',estimate:.79,priced:[]};
 const second={...valued,key:'two',side:'Buffalo Bills',estimate:.63,volume:180,priced:[]};
 const picks=window.PREDICTION_MODEL.choose([valued,sameGame,second]);
 assert.equal(picks.best.key,'one','Positive EV takes priority over a larger unpriced win chance');
 assert.equal(picks.legs.length,2);
 assert.notEqual(picks.legs[0].key,picks.legs[1].key,'Parlay legs must be different games');
 const panel={innerHTML:'Previous sport'};
 document.querySelector=selector=>selector==='#predictionPanel'?panel:null;
 window.__ACTIVE_SPORT='mlb';window.__SPORT_TOKEN=1;
 const stale=window.PREDICTION_MODEL.activate('mlb');
 assert.match(panel.innerHTML,/Loading market consensus/);
 window.__ACTIVE_SPORT='ncaaf';window.__SPORT_TOKEN=2;
 panel.innerHTML='NCAAF content';
 await stale;
 assert.equal(panel.innerHTML,'NCAAF content','A failed old request must not replace the current sport');
 console.log('Prediction model fixtures passed');
})().catch(e=>{console.error(e);process.exitCode=1});
