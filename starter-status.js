// Game-scoped public evidence. A roster/depth chart never confirms a starter.
(()=>{'use strict';
const KEY='sportsStarterChecksV1',TTL=30*60000,contexts=new Map();let payload={records:[]},pending=null,lastLoad=0,manual=[];
const key=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const safeURL=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
try{manual=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(manual))manual=[]}catch{manual=[]}
function fresh(r,start){const at=Date.parse(r.checked_at),end=Date.parse(r.start_time),now=Date.now();return Number.isFinite(at)&&at<=now+300000&&now-at<=(r.method==='manual'?2*3600000:TTL)&&Number.isFinite(end)&&end>now&&Math.abs(end-start)<60000&&safeURL(r.source_url)&&(!r.expires_at||Date.parse(r.expires_at)>now)}
function register(s,markets,context,at=null){if(['nba','nhl','ncaaf'].includes(s))contexts.set(s,{markets,context:context||{},at})}
function game(s,m,ctx){return ctx?.games?.[String(m.context_game_id||m.game_id)]}
function teamList(s,g){return s==='ncaaf'?[g?.away?.name,g?.home?.name].filter(Boolean):[g?.away,g?.home].filter(Boolean)}
function nbaLineup(gid,start,team){
 const now=Date.now(),ctx=contexts.get('nba')?.context||{},roster=Object.values(ctx.players||{});
 if(!Number.isFinite(start)||start<=now||!team)return {status:'unknown',basis:'unavailable',rows:[]};
 const valid=r=>r.sport==='nba'&&r.role==='lineup'&&r.team===team&&safeURL(r.source_url)&&Array.isArray(r.players)&&r.players.length===5&&new Set(r.players.map(key)).size===5&&['confirmed','projected'].includes(r.status)&&Date.parse(r.checked_at)<=now+300000;
 const rows=[...(payload.records||[]),...manual].filter(r=>valid(r)&&String(r.game_id)===String(gid)&&Math.abs(Date.parse(r.start_time)-start)<60000&&start>now&&now-Date.parse(r.checked_at)<=24*3600000);
 if(rows.length){
  const at=Math.max(...rows.map(r=>Date.parse(r.checked_at))),latest=rows.filter(r=>Date.parse(r.checked_at)===at);
  if(new Set(latest.map(r=>r.players.map(key).sort().join('|'))).size>1)return {status:'conflicting',rows:latest};
  const r=latest.at(-1),current=fresh(r,start)&&!r.retained;
  return {...r,status:current?r.status:'projected',basis:current?(r.status==='confirmed'?'confirmed':'projected'):'cached',game_context:current?r.game_context:undefined,rows:latest};
 }
 const previous=[...(payload.nba_lineup_history||[])].filter(r=>valid(r)&&Date.parse(r.start_time)<now&&now-Date.parse(r.start_time)<=7*86400000&&r.players.every(name=>roster.filter(p=>p.team===team&&key(p.name)===key(name)).length===1)).sort((a,b)=>Date.parse(b.start_time)-Date.parse(a.start_time)||Date.parse(b.checked_at)-Date.parse(a.checked_at))[0];
 return previous?{...previous,game_id:String(gid),start_time:new Date(start).toISOString(),previous_game_id:previous.game_id,status:'projected',basis:'previous',game_context:undefined,rows:[previous]}:{status:'unknown',basis:'unavailable',rows:[]};
}
// Cache only within one synchronous calculation. Never retain an availability
// decision across user actions, feed updates, or a report's expiry boundary.
let calculation=null;
function withCache(run){
 if(calculation)return run();
 const now=Date.now(),times=[...(payload.records||[]),...(payload.nba_lineup_history||[]),...manual].flatMap(r=>{
  const at=Date.parse(r.checked_at),start=Date.parse(r.start_time);
  return [at-300000,at+(r.method==='manual'?2*3600000:TTL),at+86400000,start,start+7*86400000,Date.parse(r.expires_at)];
 }).filter(t=>Number.isFinite(t)&&t>now);
 calculation={rows:new Map(),evidence:new WeakMap(),until:Math.min(Infinity,...times)};
 try{return run()}finally{calculation=null}
}
function resolve(s,gid,start,team,role,player){
 if(!calculation)return resolveFresh(s,gid,start,team,role,player);
 if(Date.now()>=calculation.until){calculation.rows.clear();calculation.until=Date.now();}
 const k=JSON.stringify([s,gid,start,team,role,player||'']);
 if(calculation.rows.has(k)&&Date.now()<Math.min(start,calculation.until))return calculation.rows.get(k);
 const result=resolveFresh(s,gid,start,team,role,player);calculation.rows.set(k,result);return result;
}
function resolveFresh(s,gid,start,team,role,player){
 if(s==='nba'&&role==='lineup')return nbaLineup(gid,start,team);
 const rows=[...(payload.records||[]),...manual].filter(r=>r.sport===s&&String(r.game_id)===String(gid)&&r.team===team&&r.role===role&&(!['line','powerplay','availability'].includes(role)||!player||(r.players||[]).some(n=>key(n)===key(player)))&&fresh(r,start));
 const names=r=>(r.players||[]).map(key).sort().join('|');
 const confirmed=rows.filter(r=>r.status==='confirmed'),outs=rows.filter(r=>r.status==='out'&&(!player||(r.players||[]).some(p=>key(p)===key(player))));
 const conflicting=new Set(confirmed.map(names)).size>1||confirmed.some(r=>outs.some(o=>(o.players||[]).some(p=>(r.players||[]).some(n=>key(n)===key(p)))));
 if(conflicting)return {status:'conflicting',rows};
 if(outs.length)return {...outs.at(-1),rows};
 if(role==='availability'){const uncertain=rows.filter(r=>['doubtful','questionable'].includes(r.status));if(uncertain.length)return {...uncertain.at(-1),rows};}
 const r=confirmed.at(-1)||rows.filter(r=>r.method==='manual').at(-1)||rows.at(-1);
 return r?{...r,rows}:{status:'unknown',rows:[]};
}
function evidence(s,m,ctx){
 if(!calculation)return evidenceFresh(s,m,ctx);
 const cached=calculation.evidence.get(m),start=Date.parse(game(s,m,ctx)?.start||game(s,m,ctx)?.kickoff||m.game_time);
 if(cached?.sport===s&&cached.context===ctx&&Date.now()<Math.min(start,calculation.until))return cached.result;
 const result=evidenceFresh(s,m,ctx);calculation.evidence.set(m,{sport:s,context:ctx,result});return result;
}
function evidenceFresh(s,m,ctx){
 const g=game(s,m,ctx),gid=String(m.context_game_id||m.game_id||''),start=Date.parse(g?.start||g?.kickoff||m.game_time),teams=teamList(s,g);
 const role=s==='nba'?'lineup':s==='nhl'?'goalie':'qb';
 const sides=teams.map(team=>resolve(s,gid,start,team,role));
 let confirmed=teams.length===2&&sides.every(r=>r.status==='confirmed'&&(s!=='nba'||r.players?.length===5));
 let own=null,line=null,powerplay=null,availability=null;
 if(m.player){
  const team=m.team_code||ctx?.players?.[m.player_id]?.team||ctx?.rosters?.find(p=>String(p.id)===String(m.player_id))?.team;
  own=resolve(s,gid,start,team,role,m.player);availability=resolve(s,gid,start,team,'availability',m.player);
  if(s==='nhl'){line=resolve(s,gid,start,team,'line',m.player);powerplay=resolve(s,gid,start,team,'powerplay',m.player);}
 }
 const contains=r=>r?.players?.some(n=>key(n)===key(m.player));
 const confirmedPlayer=own?.status==='confirmed'&&contains(own)||availability?.status==='confirmed'&&contains(availability);
 const lineConfirmed=line?.status==='confirmed'&&contains(line),powerplayConfirmed=powerplay?.status==='confirmed'&&contains(powerplay);
 const unavailableStarter=sides.some(r=>(r.players||[]).some(name=>['out','doubtful','conflicting'].includes(resolve(s,gid,start,r.team,'availability',name).status)||s==='nba'&&Object.values(ctx?.players||{}).some(p=>p.team===r.team&&key(p.name)===key(name)&&/\b(out|doubtful|inactive|suspended)\b/i.test(p.injury_status||''))));
 if(s==='nba'&&unavailableStarter)confirmed=false;
 const roleBlocked=s==='nba'?null:unavailableStarter?'Starter unavailable; confirm replacement':sides.some(r=>r.status==='out')?'Starting role unavailable; confirm replacement':null;
 const blocked=roleBlocked|| (['out','doubtful'].includes(availability?.status)?'Player unavailable':availability?.status==='questionable'?'Player availability uncertain':availability?.status==='conflicting'?'Conflicting availability reports':sides.some(r=>r.status==='conflicting')||own?.status==='conflicting'||line?.status==='conflicting'||powerplay?.status==='conflicting'?'Conflicting starter reports':own?.status==='out'?'Player unavailable':line?.status==='out'?'Player unavailable':null);
 const notes=sides.filter(r=>r.status!=='unknown').map(r=>r.team+': '+r.status+(r.method==='manual'?' (user-confirmed)':''));
 const lineupLabel=confirmed?'Lineup confirmed':sides.some(r=>r.basis==='previous')?'Previous lineup · Not final':sides.some(r=>r.basis==='cached')?'Latest known lineup · Not final':sides.some(r=>r.status==='projected')?'Projected lineup · Not final':'Lineup pending · Not final';
 if(s==='nba'){
  notes.unshift(lineupLabel);
  for(const r of sides)if(r.checked_at)notes.push(r.team+' last checked '+r.checked_at+(r.changed_at?'; lineup changed '+r.changed_at:''));
  if(availability&&availability.status!=='unknown')notes.push('Availability: '+availability.status);
  const position=Object.entries(own?.positions||{}).find(([name])=>key(name)===key(m.player))?.[1];
  if(position)notes.push('Reported starter position: '+position);
  const publicContext=sides.find(r=>r.method==='public_page'&&r.game_context)?.game_context;
  if(publicContext?.referees?.length)notes.push('Referees: '+publicContext.referees.join(', '));
  const refs=Object.entries(publicContext?.reference_lines||{}).map(([type,r])=>type+' '+r.value+' ('+r.book+')');
  if(refs.length)notes.push('RotoWire reference only: '+refs.join(', '));
 }
 return {confirmed,confirmedPlayer,lineConfirmed,powerplayConfirmed,blocked,sides,line,powerplay,lineupLabel,
  note:notes.join('; ')};
}
function save(entry){
 const s=entry.sport,ctx=contexts.get(s)?.context,g=ctx?.games?.[String(entry.game_id)];
 const start=Date.parse(g?.start||g?.kickoff),now=Date.now(),teams=teamList(s,g);
 if(!['nba','nhl','ncaaf'].includes(s)||!g||!Number.isFinite(start)||start<=now||!teams.includes(entry.team))throw Error('Choose an upcoming verified game and team.');
 const roles=s==='nba'?['lineup','availability']:s==='nhl'?['goalie','line','powerplay']:['qb'];
 const players=(entry.players||[]).map(n=>String(n).trim()).filter(Boolean);
 if(!roles.includes(entry.role)||!['confirmed','projected','out','unknown'].includes(entry.status)||!safeURL(entry.source_url)||!entry.attested)throw Error('Add an HTTPS source and acknowledge that you checked this game.');
 if(!players.length||players.some(n=>n.length<3||n.length>100)||new Set(players.map(key)).size!==players.length||players.length!==(entry.role==='lineup'?5:1))throw Error(entry.role==='lineup'?'Enter five distinct full starter names, separated by commas.':'Enter one full player name.');
 if(s!=='ncaaf'){
  const roster=s==='nba'?Object.values(ctx.players||{}):ctx.rosters||[];
  if(players.some(n=>roster.filter(p=>p.team===entry.team&&key(p.name)===key(n)&&(entry.role!=='goalie'||p.position==='G')).length!==1))throw Error('Names must match the current team roster.');
 }
 if(['line','powerplay'].includes(entry.role)&&!String(entry.assignment||'').trim())throw Error('Enter the reported line or power-play unit.');
 const row={sport:s,game_id:String(entry.game_id),team:entry.team,role:entry.role,players,status:entry.status,assignment:String(entry.assignment||'').slice(0,40),source_url:safeURL(entry.source_url),method:'manual',checked_at:new Date(now).toISOString(),start_time:new Date(start).toISOString(),expires_at:new Date(Math.min(start,now+2*3600000)).toISOString()};
 const next=manual.filter(r=>fresh(r,Date.parse(r.start_time))&&!(r.sport===s&&r.game_id===row.game_id&&r.team===row.team&&r.role===row.role&&(['lineup','goalie','qb'].includes(row.role)||key(r.players?.[0])===key(players[0]))));next.push(row);
 localStorage.setItem(KEY,JSON.stringify(next));manual=next;changed();return row;
}
function clear(s,gid){const next=manual.filter(r=>!(r.sport===s&&r.game_id===String(gid)));localStorage.setItem(KEY,JSON.stringify(next));manual=next;changed()}
function changed(){for(const s of ['NBA','NHL','NCAAF'])if(window.__ACTIVE_SPORT===s.toLowerCase())window[s+'_DASHBOARD']?.refresh?.();window.STARTER_CHECKS_UI?.refresh?.()}
async function load(force=false){if(pending)return pending;if(!force&&Date.now()-lastLoad<60000)return payload;
 pending=(async()=>{try{const r=await fetch('data/starter-status.json?ts='+Date.now(),{cache:'no-store',signal:typeof AbortSignal!=='undefined'?AbortSignal.timeout(10000):undefined});if(!r.ok)throw Error('Starter feed unavailable');const d=await r.json();if(d.schemaVersion!==1||!Array.isArray(d.records))throw Error('Invalid starter feed');payload=d;lastLoad=Date.now();return payload}catch{return payload}finally{pending=null}})();return pending;
}
window.STARTER_STATUS={register,evidence,resolve,withCache,save,clear,load,key,safeURL,teamList,contexts,payload:()=>payload,manual:()=>manual};
})();
