// Paper records only. No wagers are placed. Entry forecasts/prices never change;
// later observations and explicitly confirmed settlement are separate fields.
(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.PAPER_LEDGER=api;})(()=>{'use strict';
const KEY='sportsForwardPaperV1',VERSION='learning-20261015';
const num=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const decimal=o=>o>0?1+o/100:1+100/Math.abs(o),validOdds=o=>num(o)!=null&&Math.abs(o)>=100&&Math.abs(o)<=100000;
function hash(s){let n=2166136261;for(const c of s){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}return(n>>>0).toString(16)}
function signature(legs){return JSON.stringify(legs.map(l=>[l.sport,l.eventId,l.eventTime,l.market,l.player||l.team||'',l.direction,l.line]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))}
function create(old,input,now=Date.now()){
 if(!Array.isArray(old))throw Error('Paper ledger unreadable');
 const {legs,book,odds,quoteAt,mode='straight',sport,terms='standard'}=input;
 const at=Date.parse(quoteAt),fees=num(input.feesPerUnit);
 if(!Array.isArray(legs)||!legs.length||!sport||!['straight','multi','sgp'].includes(mode)||mode==='straight'&&legs.length!==1||mode!=='straight'&&(legs.length<2||legs.length>4))throw Error('Complete selections required');
 if(!book||!validOdds(odds)||!Number.isFinite(at)||at>now||now-at>15*60000)throw Error('Current exact sportsbook price required');
 if(fees!=null&&(fees<0||fees>1))throw Error('Fees must be between 0 and 1 per unit');
 if(legs.some(l=>!l.eventId||!l.eventTime||!l.market||!l.selection||!(Date.parse(l.eventTime)>now)))throw Error('Paper entries must be frozen before every event starts');
 const lineKey=signature(legs),key=[sport,mode,book,terms,VERSION,lineKey].join('|');
 const existing=old.find(r=>r.entryKey===key);if(existing)return {rows:old,record:existing,added:false};
 if(old.length>=5000)throw Error('Export your ledger before adding more entries');
 const record={id:hash(key),entryKey:key,sport,mode,book:String(book),terms:String(terms),lineKey,modelVersion:VERSION,
  recordedAt:new Date(now).toISOString(),quoteAt:new Date(at).toISOString(),odds:Number(odds),feesPerUnit:fees,
  modelP:num(input.modelP),method:input.method||'Unvalidated estimate',legs:JSON.parse(JSON.stringify(legs)),result:null,
  observations:[],settlement:null,paper:true};
 return {rows:[...old,record],record,added:true};
}
function observe(record,input,now=Date.now()){
 const at=Date.parse(input.at),start=Math.min(...record.legs.map(l=>Date.parse(l.eventTime)));
 if(input.book!==record.book||input.terms!==record.terms||input.lineKey!==record.lineKey)throw Error('Same sportsbook, offer terms and exact lines required');
 if(!validOdds(input.odds)||!Number.isFinite(at)||at>now||now-at>15*60000||at>=start||at<Date.parse(record.recordedAt))throw Error('Only fresh pregame observations are accepted');
 const old=record.observations||[];if(old.length&&at<=Date.parse(old.at(-1).at))throw Error('Observation must be newer');
 const observation={odds:Number(input.odds),at:new Date(at).toISOString(),nearStart:start-at<=15*60000,source:'User-observed same-book exact offer'};
 return {...record,observations:[...old,observation]};
}
function settle(record,input,now=Date.now()){
 if(record.result)return record;
 if(!input.confirmed||!['win','loss','void','partial_void'].includes(input.result)||now<=Math.max(...record.legs.map(l=>Date.parse(l.eventTime))))throw Error('Confirm the final same-book result after the events start');
 // Voiding an SGP leg changes the book's combined payout. Do not manufacture
 // revised odds by multiplying or dividing reference leg prices.
 const gross=input.result==='win'?decimal(record.odds)-1:input.result==='loss'?-1:input.result==='void'?0:null;
 const net=gross==null||record.feesPerUnit==null?null:gross-(input.result==='void'?0:record.feesPerUnit);
 return {...record,result:input.result,settlement:{at:new Date(now).toISOString(),source:'User-confirmed final same-book paper result',grossReturnPerUnit:gross,netReturnPerUnit:net}};
}
function metrics(rows){
 const out={};for(const r of rows){const key=r.sport+'|'+r.mode;(out[key]??=[]).push(r)}
 return Object.fromEntries(Object.entries(out).map(([key,part])=>{const settled=part.filter(r=>['win','loss'].includes(r.result)),priced=part.filter(r=>Number.isFinite(r.settlement?.netReturnPerUnit)),scored=settled.filter(r=>r.modelP>0&&r.modelP<1),closing=part.map(r=>({r,c:r.observations?.filter(x=>x.nearStart).at(-1)})).filter(x=>x.c);
  return [key,{recorded:part.length,settled:settled.length,winRate:settled.length?settled.filter(r=>r.result==='win').length/settled.length:null,
   netReturnPerUnit:priced.length?priced.reduce((s,r)=>s+r.settlement.netReturnPerUnit,0)/priced.length:null,netPriced:priced.length,
   brier:scored.length?scored.reduce((s,r)=>s+(r.modelP-(r.result==='win'?1:0))**2,0)/scored.length:null,
   closingCount:closing.length,meanPriceAdvantage:closing.length?closing.reduce((s,{r,c})=>s+decimal(r.odds)/decimal(c.odds)-1,0)/closing.length:null,
   distinctEvents:new Set(part.flatMap(r=>r.legs.map(l=>l.eventId+'|'+l.eventTime))).size,source:'Paper, user-confirmed prices/results; overlapping builds are not independent trials'}];}));
}
function descriptors(s,entries){return entries.map(e=>{const m=e.market,g=e.game||window.PICK_QUALITY?.gameFor(s,m)||{};return {sport:s,id:m.ticker?[s,m.ticker,m.quoteSide==='no'||m.side==='no'?'no':'yes'].join('|'):null,eventId:String(g.id||m.game_id||m.gameId||''),eventTime:g.commence_time||m.game_time||m.kickoff||m.start_time,market:m.marketKey||m.kind||m.type,player:m.player||e.forecast?.player||null,team:m.team||m.team_code||null,direction:m.side||m.quoteSide||'yes',line:window.PICK_QUALITY?.line(m)??null,selection:m.name||m.label||m.title}})}
function storage(){return typeof localStorage!=='undefined'?localStorage:window.localStorage}
function read(){const raw=storage().getItem(KEY);if(!raw)return[];const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error('Paper ledger unreadable');return rows}
function write(rows){storage().setItem(KEY,JSON.stringify(rows));render();}
function add(input){const result=create(read(),input);write(result.rows);return result}
function controls(host,s,entries,{mode='straight',modelP=null,method='Unvalidated estimate'}={}){
 if(!host?.appendChild||typeof document==='undefined')return;
 const details=document.createElement('details'),summary=document.createElement('summary');details.className='card-explanation paper-controls';summary.textContent='Track paper pick';
 const note=document.createElement('p');note.textContent='No wager is placed. Record the exact same selections and current book offer before kickoff. Saved on this device; export from Diagnostics.';
 const field=(labelText,type,value)=>{const label=document.createElement('label'),input=document.createElement('input');input.type=type;input.value=value;input.setAttribute('aria-label',labelText);label.textContent=labelText;label.append(input);details.append(label);return input};
 details.append(summary,note);const book=field('Sportsbook','text','Caesars'),odds=field('American odds','number',''),terms=field('Offer terms','text','standard'),fee=field('Fee per $1 stake (0 if none)','number','0');fee.step='.001';
 const button=document.createElement('button'),status=document.createElement('p');button.type='button';button.textContent='Save paper pick';
 button.addEventListener('click',()=>{try{const result=add({sport:s,mode,modelP,method,legs:descriptors(s,entries),book:book.value.trim(),odds:num(odds.value),terms:terms.value.trim()||'standard',feesPerUnit:num(fee.value),quoteAt:new Date().toISOString()});status.textContent=result.added?'Paper pick saved. Entry price and forecast are frozen.':'Already tracked; original entry preserved.'}catch(e){status.textContent='Not saved: '+e.message}});
 details.append(button,status);host.append(details);
}
function render(){
 if(typeof document==='undefined')return;const host=document.querySelector('#settingsDiagnosticsBody');if(!host?.appendChild)return;
 let panel=document.querySelector('#paperLedgerPanel');if(!panel){panel=document.createElement('section');panel.id='paperLedgerPanel';panel.className='calibration-panel';host.append(panel)}panel.replaceChildren();
 const h=document.createElement('h3');h.textContent='Forward paper ledger';panel.append(h);
 let rows;try{rows=read()}catch(e){const p=document.createElement('p');p.textContent=e.message;panel.append(p);return}
 const note=document.createElement('p');note.textContent='Paper records on this device. Entry prices and predictions are frozen. Closing comparisons require the same book, lines and offer terms. Results are user-confirmed; overlapping bets are not independent evidence.';panel.append(note);
 for(const [key,x] of Object.entries(metrics(rows))){const p=document.createElement('p');p.textContent=key.replace('|',' · ').toUpperCase()+': '+x.recorded+' tracked · '+x.settled+' settled'+(x.netReturnPerUnit!=null?' · net paper return '+(x.netReturnPerUnit*100).toFixed(1)+'% across '+x.netPriced+' priced results':' · net return unavailable')+' · '+x.closingCount+' near-start price checks'+(x.meanPriceAdvantage!=null?' · price advantage '+(x.meanPriceAdvantage*100).toFixed(1)+'%':'');panel.append(p)}
 const download=document.createElement('button');download.type='button';download.textContent='Export paper ledger';download.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),records:read()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sports-paper-ledger.json';a.click();URL.revokeObjectURL(url)});panel.append(download);
 for(const record of rows.slice(-12).reverse()){
  const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=record.sport.toUpperCase()+' '+record.mode+' · '+record.book+' '+(record.odds>0?'+':'')+record.odds+' · '+(record.result||'pending');detail.append(summary);
  const desc=document.createElement('p');desc.textContent=record.legs.map(l=>l.selection).join(' + ')+' · '+record.terms;detail.append(desc);
  const input=document.createElement('input'),button=document.createElement('button'),status=document.createElement('p');input.type='number';input.placeholder='Current same-offer odds';input.setAttribute('aria-label','Current same-book same-line same-terms odds');button.type='button';button.textContent='Record latest exact price';
  button.addEventListener('click',()=>{try{const all=read(),index=all.findIndex(r=>r.entryKey===record.entryKey);all[index]=observe(all[index],{odds:num(input.value),book:record.book,terms:record.terms,lineKey:record.lineKey,at:new Date().toISOString()});write(all)}catch(e){status.textContent=e.message}});detail.append(input,button);
  if(!record.result){const select=document.createElement('select');select.setAttribute('aria-label','Confirmed final paper result');for(const [value,label] of [['','Choose final result'],['win','Win'],['loss','Loss'],['void','All void'],['partial_void','Some legs void (revised payout unknown)']]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o)}const confirm=document.createElement('button');confirm.type='button';confirm.textContent='Confirm final result at this book';confirm.addEventListener('click',()=>{try{const all=read(),index=all.findIndex(r=>r.entryKey===record.entryKey);all[index]=settle(all[index],{result:select.value,confirmed:true});write(all)}catch(e){status.textContent=e.message}});detail.append(select,confirm)}
  detail.append(status);panel.append(detail);
 }
}
if(typeof document!=='undefined')document.addEventListener('click',e=>{if(e.target.closest?.('#settingsBtn,#settingsDiagnostics > summary'))render()});
return {VERSION,signature,create,observe,settle,metrics,descriptors,read,add,controls,render};
});
