(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.ESPN_EVIDENCE=api;})(()=>{'use strict';
const feeds=new Map(),num=v=>v!==null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
function inspect(m,now=Date.now()){
 const e=m.espnEvidence,warnings=[];if(!e)return {blocked:null,warnings,note:''};
 const age=now-Date.parse(e.checkedAt),fresh=Number.isFinite(age)&&age>=-300000&&age<=2*3600000;
 if(!fresh)return {blocked:null,warnings:['ESPN availability unconfirmed; check expired'],note:'ESPN check expired'};
 if(e.sourceUnavailable)warnings.push('ESPN availability unconfirmed; source unavailable');
 const a=e.availability;let blocked=null;
 for(const alert of e.teamAlerts||[])warnings.push('Quarterback availability: '+alert.name+' ('+alert.status+')');
 if(a){const reportAge=now-Date.parse(a.reportedAt),current=Number.isFinite(reportAge)&&reportAge>=-300000&&reportAge<=14*86400000;
  if(!current)warnings.push('ESPN injury report needs current confirmation');
  else if(/\b(out|doubtful|inactive|suspended)\b|injured reserve|(?:day|term).*\bil\b/i.test(a.status||''))blocked='ESPN reports player unavailable: '+a.status;
  else if(/questionable|day.to.day|game.time/i.test(a.status||''))blocked='ESPN availability uncertain: '+a.status;
 }
 const u=e.usage;let role=null;
 if(u){const rows=(u.rows||[]).filter(r=>Date.parse(r.date)<now&&Date.parse(r.date)<Date.parse(m.game_time||m.kickoff||e.eventTime)&&Date.parse(r.date)>now-45*86400000);
  const values=rows.map(r=>num(r.value));
  if(values.length>=5&&values.every(v=>v!==null&&v>=0)){
   const base=values.slice(0,-2).reduce((s,v)=>s+v,0)/(values.length-2),recent=(values.at(-1)+values.at(-2))/2,ratio=base>0?recent/base:null;
   const old=values.slice(0,-2),median=a=>{const s=[...a].sort((a,b)=>a-b);return (s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2},noise=1.4826*median(old.map(v=>Math.abs(v-median(old))));
   const material=base>0&&Math.abs(recent-base)>=Math.max(1,base*.25,noise);
   role={status:base<=0?'insufficient':material&&ratio<.7?'falling':material&&ratio>1.3?'rising':'stable',baseline:base,recent,ratio,sample:values.length,metric:u.metric};
   if(['falling','rising'].includes(role.status))blocked=blocked||'Recent '+u.metric+' changed; reassess playing time';
  }else warnings.push('Recent ESPN usage sample incomplete');
 }
 return {blocked,warnings,role,note:[a?'ESPN '+a.status:'No matching injury report; availability unconfirmed',role?'Recent '+role.metric+': '+role.recent.toFixed(1)+' vs '+role.baseline.toFixed(1)+' baseline ('+role.status+')':'', 'Checked '+new Date(e.checkedAt).toLocaleString()].filter(Boolean).join(' · ')};
}
function contract(s,m,g={},now=Date.now()){
 if(!m.referenceOnly||!/^\d+$/.test(String(m.espn_game_id||''))||m.player)return null;
 const kind=m.kind||({h2h:'moneyline',spreads:'spread',totals:'total'}[m.type]);if(!['moneyline','spread','total'].includes(kind))return null;
 const at=Date.parse(m.quotedAt),start=Date.parse(m.game_time||g.commence_time);if(!Number.isFinite(at)||at>now+300000||now-at>1800000||!(start>now))return null;
 const teams=(m.teams||[]).map(t=>String(t.id||'')).sort();if(teams.length!==2||new Set(teams).size!==2||teams.some(t=>!/^\d+$/.test(t)))return null;
 const line=num(m.point);if(kind!=='moneyline'&&line===null)return null;
 const teamId=m.team_id==null?null:String(m.team_id);if(kind!=='total'&&!teams.includes(teamId))return null;
 const direction=kind==='total'?(m.side==='under'||m.side==='no'?'under':'over'):null;
 return {provider:'ESPN',sport:s,eventId:String(m.espn_game_id),teams,teamId,kind,line,direction,scope:'full_game',eventTime:new Date(start).toISOString()};
}
let host;
function prepare(s,markets){feeds.set(s,markets||[])}
function render(){if(typeof document==='undefined')return;const s=window.__ACTIVE_SPORT||'nfl',rows=feeds.get(s)||[],seen=new Set(),items=[];
 for(const m of rows){if(!m.espnEvidence)continue;const name=m.player||m.espnEvidence.player||(m.espnEvidence.teamAlerts||[]).map(a=>a.name).join(', ');if(!name)continue;const key=name+'|'+(m.team||m.team_code);if(seen.has(key))continue;seen.add(key);const x=inspect(m);if(x.blocked||x.role||x.warnings.length)items.push({m:{...m,player:name},x});}
 if(!items.length){if(host)host.hidden=true;return}
 const esc=window.MARKET_GUARDS?.esc;if(!esc)return;if(!host){host=document.createElement('section');host.id='espnEvidencePanel';document.querySelector('#results')?.after(host)}
 const html='<details class="parlay-card"><summary>Availability &amp; Usage · '+items.length+' players</summary>'+items.slice(0,12).map(({m,x})=>'<div class="leg"><div class="leg-title">'+esc(m.player)+'</div><div class="leg-sub">'+esc(x.blocked||[...x.warnings,x.note].filter(Boolean).join(' · '))+'</div></div>').join('')+'</details>';
 host.hidden=false;if(host.__markup!==html){host.__markup=html;host.innerHTML=html}
}
if(typeof document!=='undefined'){const init=()=>{if(typeof MutationObserver==='undefined')return;const o=new MutationObserver(render),r=document.querySelector('#results');if(r)o.observe(r,{childList:true});o.observe(document.body,{attributes:true,attributeFilter:['data-sport']})};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();}
return {inspect,contract,prepare,render};
});
