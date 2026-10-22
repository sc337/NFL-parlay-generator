(()=>{'use strict';
const active=(state,variant='safe')=>state?.mode==='sgp'&&state?.lineMode==='alt'&&variant==='safe';
const families={player_pass_yds:'Passing yards',player_rush_yds:'Rushing yards',player_reception_yds:'Receiving yards',player_receptions:'Receptions'};
const key=m=>String(m.marketKey||'').replace(/_alternate$/,'');
function manualCheck(game,{player,marketKey,milestone,odds},now=Date.now()){
 const n=Number(milestone),yards=marketKey!=='player_receptions';
 if(!families[marketKey]||!Number.isInteger(n)||n<=0||n>(yards?1000:30)||yards&&n%10!==0)return {pass:false,reason:'Enter a supported milestone: yardage in tens, receptions in whole numbers.'};
 if(!(Date.parse(game?.commence_time)>now)||game.game_status!=='pre')return {pass:false,reason:'Verified upcoming game required.'};
 const rows=(game.markets||[]).filter(m=>m.player===player&&key(m)===marketKey),base=rows.find(m=>m._rosterVerified&&!m._invalidRoster&&[game.away,game.home].includes(m.team));
 if(!base)return {pass:false,reason:'Player and current team are not verified for this market.'};
 const injury=String(base.contextSignals?.injury_status||''),contextAt=Date.parse(game.context?.updated_at||'');
 if(!base.contextSignals?.injury_checked||!injury||/out|doubtful|inactive|questionable|suspended|unknown|injured reserve|unconfirmed/i.test(injury)||!Number.isFinite(contextAt)||contextAt>now+60000||now-contextAt>4*3600000)return {pass:false,reason:'Current player availability is not sufficiently confirmed.'};
 const monitored=window.ESPN_EVIDENCE?.inspect(base,now);
 if(monitored?.blocked)return {pass:false,reason:monitored.blocked};
 const h=base.propHistory,values=h?.metrics?.[marketKey],latest=Date.parse(h?.latest_game+'T23:59:59Z');
 if(h?.source!=='nflverse completed plays'||h.played<3||h.games<3||h.played/h.games<.6||!Array.isArray(values)||values.length!==h.games||values.some(v=>!Number.isFinite(v))||!(latest<now&&latest<Date.parse(game.commence_time))||Date.parse(game.commence_time)-latest>28*86400000)return {pass:false,reason:'Insufficient recent verified history.'};
 const exposure=h.opportunities?.[marketKey==='player_rush_yds'?'player_rush_attempts':marketKey==='player_pass_yds'?'player_pass_attempts':'targets'];
 const role=window.MODEL_LEARNING?.roleChange(exposure);
 if(role?.status!=='stable'||!(window.NFL_MODEL_V3?.role(base)>=.6))return {pass:false,reason:'Workload is changing or uncertain; keep this leg out of the study build.'};
 if((odds==null||odds==='')&&n>values.reduce((sum,v)=>sum+v,0)/values.length)return {pass:false,reason:'Milestone exceeds the recent average; enter individual odds for a full likelihood check.'};
 const line={...base,point:n-.5,side:'over',quoteSide:'yes',name:player+' '+n+' '+families[marketKey],marketKey,isAltLine:true,source:'Manual sportsbook',ticker:'manual-unpriced:'+game.id+':'+player+':'+marketKey+':'+n,price:null,prob:null,marketProbability:null,quoteProbability:null,quotedAt:null,spread:null};
 if(odds!==''&&odds!=null){
  if(!window.PICK_QUALITY.odds(Number(odds))||!Number.isInteger(Number(odds)))return {pass:false,reason:'Enter valid American odds or leave the individual price blank.'};
  // A user-entered offer is never written into the feed or reused on another line.
  const p=window.PICK_QUALITY.implied(Number(odds));Object.assign(line,{ticker:'manual:'+game.id+':'+player+':'+marketKey+':'+n+':'+odds,source:'Manual sportsbook',price:Number(odds),prob:p,marketProbability:p,quoteProbability:p,quotedAt:new Date(now).toISOString()});
  const forecast={...window.NFL_MODEL_V3.evaluate(game,line),selectionMode:'likelihood'};
  const q=window.PICK_QUALITY.assess('nfl',line,forecast,{game,parlay:true});
  return {pass:q.pass,reason:q.reason||'Likelihood screen passed; value unchecked.',market:line,forecast,quality:q,modeled:true};
 }
 return {pass:true,reason:'History and availability checked only. Individual price missing; milestone probability unavailable.',market:line,modeled:false};
}
function review(game,legs,offer,now=Date.now()){
 if(!Array.isArray(legs)||legs.length<2||legs.length>4||new Set(legs.map(l=>l.player)).size!==legs.length)return {pass:false,message:'Use 2–4 distinct players.'};
 const checks=legs.map(l=>manualCheck(game,l,now));
 const receivers=new Map();for(const c of checks){const m=c.market;if(m&&['receiving','receptions'].includes(m.type))receivers.set(m.team,(receivers.get(m.team)||0)+1);}
 if([...receivers.values()].some(n=>n>2))return {pass:false,message:'Use at most two receiver props from one offense.',checks};
 const decision=window.STUDY_POLICY.decision({...offer,checks:checks.map(c=>({dataPass:c.pass})),sgp:true,eventTimes:[game?.commence_time]},now);
 return {pass:checks.every(c=>c.pass)&&decision.status==='research',message:decision.message,checks,breakEven:decision.breakEven};
}
function mount(game,state){
 if(typeof document==='undefined')return;
 let panel=document.querySelector('#nflManualAlt');
 if(!panel){panel=document.createElement('details');panel.id='nflManualAlt';panel.className='nfl-prop-coverage';document.querySelector('#nflPropCoverage')?.after(panel);}
 panel.hidden=!active(state)||!game;
 if(panel.hidden||panel.dataset.game===game.id)return;
 panel.dataset.game=game.id;panel.replaceChildren();const summary=document.createElement('summary');summary.textContent='Review sportsbook ALT ticket';panel.append(summary);
 const note=document.createElement('p');note.textContent='Enter exact milestones and the combined sportsbook offer. Missing individual prices stay unpriced; no odds are invented. Research only.';panel.append(note);
 const form=document.createElement('form'),rows=[];
 const select=(label,choices,host=form)=>{const l=document.createElement('label'),s=document.createElement('select');l.textContent=label;for(const [value,text] of choices){const o=document.createElement('option');o.value=value;o.textContent=text;s.append(o);}l.append(s);host.append(l);return s;};
 const input=(label,type,host=form,value='')=>{const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.type=type;i.value=value;l.append(i);host.append(l);return i;};
 const count=select('Legs',[['2','2'],['3','3'],['4','4']]);count.value='3';
 const players=[...new Set((game.markets||[]).filter(m=>m.player&&m._rosterVerified).map(m=>m.player))].sort();
 for(let n=0;n<4;n++){const row=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='Leg '+(n+1);row.append(legend);form.append(row);const player=select('Player',players.map(p=>[p,p]),row),market=select('Market',Object.entries(families),row),milestone=input('Milestone (N+)','number',row),price=input('Individual American odds (optional)','number',row);milestone.min='1';rows.push({row,player,market,milestone,price});}
 const sync=()=>rows.forEach((x,n)=>x.row.hidden=n>=Number(count.value));count.addEventListener('change',sync);sync();
 const book=input('Sportsbook','text',form,'Caesars'),odds=input('Combined American odds','number'),fees=input('Fees per $1 stake','number',form,'0');fees.step='.001';
 const confirmed=input('Current exact selections, lines and offer terms confirmed','checkbox'),button=document.createElement('button'),output=document.createElement('div');button.type='submit';button.textContent='Review ALT ticket';output.setAttribute('role','status');form.append(button,output);panel.append(form);
 form.addEventListener('submit',event=>{event.preventDefault();const current=window.NFL_PARLAY_STATE,currentGame=current?.games?.find(g=>g.id===game.id);if(!currentGame||!active(current)){output.textContent='Select this upcoming game in ALT mode again.';return;}
 const now=Date.now(),result=review(currentGame,rows.slice(0,Number(count.value)).map(x=>({player:x.player.value,marketKey:x.market.value,milestone:x.milestone.value,odds:x.price.value})),{book:book.value,odds:odds.value,feesPerUnit:fees.value,confirmedLines:confirmed.checked,quoteAt:new Date(now).toISOString()},now);
 output.replaceChildren();const status=document.createElement('p');status.textContent=result.message+(result.breakEven!=null?' · Required break-even '+(result.breakEven*100).toFixed(1)+'%':'');output.append(status);for(const [n,c] of (result.checks||[]).entries()){const p=document.createElement('p');p.textContent='Leg '+(n+1)+': '+c.reason;output.append(p);}window.setTimeout?.(()=>{status.textContent='Offer review expired · Recheck exact lines and current sportsbook odds.';},5*60000);
 });
}
window.NFL_ALT_IDEAS={active,manualCheck,review,mount};
})();
