(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.MATCHUP_PROP_INTEL=api;})(()=>{'use strict';
const feeds=new Map(),pending=new Map(),loaded=new Map(),TTL=2*3600000;
const key=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const person=v=>{const p=String(v||'').split(',');return key(p.length===2?p[1]+' '+p[0]:v)};
const aliases={GS:'GSW',NO:'NOP',WSH:'WAS',NY:'NYK',SA:'SAS',UTAH:'UTA',PHO:'PHX'},code=v=>aliases[v]||v;
const fresh=(at,now,max=TTL)=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=now+300000&&now-Date.parse(at)<=max;
function safe(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&['www.espn.com','espn.com','ak-static.cms.nba.com'].includes(u.hostname)?u.href:null}catch{return null}}
function register(s,feed){feeds.set(s,feed||{})}
function inspect(s,m,ctx={},now=Date.now()){
 const empty={blocked:null,warnings:[],note:'',label:'Status unconfirmed',checked:false};
 if(!m.player||s==='nfl')return empty; // NFL keeps its existing ESPN availability/usage checks.
 const start=Date.parse(m.game_time||ctx.games?.[m.game_id]?.start),id=String(m.espn_game_id||m.context_game_id||m.game_id||'');
 if(!(start>now))return empty;
 const candidates=(feeds.get(s)?.games||[]).filter(g=>g.sport===s&&String(g.eventId)===id&&Math.abs(Date.parse(g.startAt)-start)<60000);
 if(candidates.length!==1)return empty;
 const g=candidates[0],team=code(m.team_code||ctx.players?.[m.player_id]?.team),teams=(g.teams||[]).filter(t=>code(t.code)===team);
 if(teams.length!==1)return empty;
 const rows=[];
 for(const r of g.propAvailability||[]){if(r.teamId!==teams[0].id||person(r.player)!==person(m.player)||!safe(r.sourceUrl)||!fresh(r.checkedAt,now)||!fresh(r.publishedAt,now,24*3600000))continue;rows.push(r)}
 if(g.status==='ok'&&fresh(g.checkedAt,now)&&safe(g.url))for(const r of g.injuries||[]){if(String(r.teamId)!==String(teams[0].id)||person(r.player)!==person(m.player)||!fresh(r.reportedAt,now,14*86400000))continue;rows.push({...r,source:'ESPN',sourceUrl:g.url,checkedAt:g.checkedAt})}
 if(!rows.length)return empty;
 const classify=status=>/\b(out|doubtful|inactive|suspended)\b|injured reserve/i.test(status)?'out':/questionable|day.to.day|game.time/i.test(status)?'uncertain':/^(available|active|probable)$/i.test(status)?'available':'unknown';
 const states=new Set(rows.map(r=>classify(r.status))),conflict=states.has('available')&&(states.has('out')||states.has('uncertain'));
 const blocked=conflict?'Conflicting matchup availability reports':states.has('out')?'Matchup report: player unavailable':states.has('uncertain')?'Matchup report: player availability uncertain':null;
 const checked=!blocked&&states.has('available');
 return {blocked,checked,label:blocked|| (checked?'Availability reported · Role unconfirmed':'Status unconfirmed'),warnings:checked?[]:blocked?[blocked]:['Matchup status unconfirmed'],note:rows.map(r=>r.source+': '+r.status+' · Checked '+new Date(r.checkedAt).toLocaleString()+' · '+r.sourceUrl).join('; '),sources:rows};
}
async function load(s=typeof window!=='undefined'?window.__ACTIVE_SPORT:null,force=false){
 if(!['nba','nhl','mlb','ncaaf','ufc'].includes(s))return;
 if(pending.has(s))return pending.get(s);if(!force&&Date.now()-(loaded.get(s)||0)<60000)return;
 const p=(async()=>{try{const r=await fetch('data/espn-intel-'+s+'.json?ts='+Date.now(),{cache:'no-store',signal:typeof AbortSignal!=='undefined'?AbortSignal.timeout(10000):undefined});if(!r.ok)throw Error('Source unavailable');const d=await r.json();if(!Array.isArray(d.games))throw Error('Invalid intel');register(s,d);loaded.set(s,Date.now())}catch{register(s,{})}finally{pending.delete(s)}})();pending.set(s,p);return p;
}
if(typeof window!=='undefined'&&window.STARTER_STATUS){const original=window.STARTER_STATUS.load;window.STARTER_STATUS.load=async function(force=false){const [r]=await Promise.all([original(force),load(window.__ACTIVE_SPORT,force)]);return r}}
return {inspect,register,load};
});
