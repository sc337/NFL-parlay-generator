const fs=require('node:fs'),path=require('node:path');
const {start}=require('./update_forecast_audit');
const root=path.resolve(__dirname,'..');
const read=(dir,name)=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
function checkSport(sport,snapshot,previous,now,context){
 const alerts=[],at=snapshot.updated_at||snapshot.generated_at,age=now-Date.parse(at);
 const add=(code,severity,message)=>alerts.push({id:sport+':'+code,sport,code,severity,message});
 if(!Number.isFinite(age)||age< -300000)add('timestamp','critical','Feed timestamp is missing, invalid, or in the future.');
 else if(age>1800000)add('stale',age>7200000?'critical':'warning','Feed is '+Math.round(age/60000)+' minutes old.');
 if(sport==='nfl'?!Array.isArray(snapshot.games):!Array.isArray(snapshot.markets)){add('schema','critical','Feed has no valid market collection.');return {summary:{snapshotAt:at},alerts}}
 const entries=sport==='nfl'?snapshot.games.flatMap(g=>(g.markets||[]).map(m=>({m,g}))):snapshot.markets.map(m=>({m,g:{}}));
 const futureEvents=new Map(),playerCounts={},families={},unknown=[],props=[];let quotes=0;
 for(const {m,g} of entries){
  const time=start(sport,m,g,snapshot)||g.commence_time||m.game_time||m.start_time;
  const startAt=Date.parse(time),closed=Date.parse(m.close_time);
  if(['Live','Final','in','post'].includes(m.game_status)||['in','post'].includes(g.game_status)||Number.isFinite(startAt)&&startAt<=now||Number.isFinite(closed)&&closed<=now)continue;
  const id=String(g.id||m.game_id||m.event_ticker||''),kind=m.type||m.kind||'unknown';families[kind]=(families[kind]||0)+1;
  if(!Number.isFinite(startAt))unknown.push(m);else futureEvents.set(id,{id,time});
  const ask=Number(sport==='nfl'?m.quoteProbability:m.yes_ask);if(ask>0&&ask<1)quotes++;
  const isPlayer=!!m.player||!['h2h','spreads','totals','moneyline','spread','total'].includes(kind)&&sport!=='ufc';
  if(isPlayer){props.push(m);playerCounts[id]=(playerCounts[id]||0)+1}
 }
 const active=Object.values(families).reduce((a,b)=>a+b,0);
 // Empty offseason feeds are normal. Alert only on malformed data or a loss of
 // previously available markets for games that still have not started.
 const prior=(previous?.futureEvents||[]).filter(e=>Date.parse(e.time)>now);
 if(previous?.snapshotAt&&now-Date.parse(previous.snapshotAt)<7200000&&prior.length>=2){
  const lost=prior.filter(e=>!futureEvents.has(e.id));if(lost.length>=2&&lost.length/prior.length>=.5)add('market-drop','warning',lost.length+' of '+prior.length+' previously available upcoming games disappeared.');
  const propEvents=prior.filter(e=>(previous.playerCounts?.[e.id]||0)>0&&futureEvents.has(e.id));
  if(propEvents.length&&propEvents.every(e=>!playerCounts[e.id]))add('props-missing','warning','Player props disappeared for games that still have team markets.');
 }
 if(active&&quotes===0)add('quotes-missing','critical','Upcoming markets have no executable reference ask prices.');
 if(unknown.length>=5&&unknown.length/Math.max(1,active)>.2)add('starts-missing','warning',unknown.length+' upcoming markets lack verified start times.');
 if(props.length){
  const missing=props.filter(m=>sport==='nfl'?m._invalidRoster===true||m._rosterVerified!==true:sport==='nhl'?!m.player_id:sport==='mlb'?!context?.players?.[String(m.label||'').split(':')[0].trim()]:false).length;
  if(missing/props.length>.5)add('player-data','warning',missing+' of '+props.length+' player markets lack verified player data.');
 }
 const expectedEvents=new Map(futureEvents),expectedPlayerCounts={...playerCounts};
 if(previous?.snapshotAt&&now-Date.parse(previous.snapshotAt)<7200000)for(const event of prior){
  if(!expectedEvents.has(event.id))expectedEvents.set(event.id,event);
  if(!expectedPlayerCounts[event.id]&&previous.playerCounts?.[event.id])expectedPlayerCounts[event.id]=previous.playerCounts[event.id];
 }
 return {summary:{snapshotAt:at,ageMinutes:Number.isFinite(age)?Math.round(age/60000):null,markets:active,quotedMarkets:quotes,playerMarkets:props.length,families,futureEvents:[...expectedEvents.values()],playerCounts:expectedPlayerCounts},alerts};
}
function build(data,previous={},now=Date.now(),refreshStatus='success'){
 const sports={},alerts=[];
 if(refreshStatus!=='success')alerts.push({id:'pipeline:refresh-failed',sport:null,code:'refresh-failed',severity:'critical',message:'The scheduled refresh pipeline failed. Check the GitHub Actions run.'});
 for(const sport of ['nfl','mlb','ncaaf','nhl','ufc']){
  try{const snapshot=data['kalshi-'+sport+'.json'];if(!snapshot)throw Error('Snapshot missing or unreadable');const checked=checkSport(sport,snapshot,previous.sports?.[sport],now,data[sport+'-context.json']);sports[sport]=checked.summary;alerts.push(...checked.alerts)}
  catch(error){sports[sport]={error:error.message};alerts.push({id:sport+':unavailable',sport,code:'unavailable',severity:'critical',message:error.message})}
 }
 const archive=data['daily-picks.json'];
 if(!archive||!Number.isFinite(Date.parse(archive.updated_at))||now-Date.parse(archive.updated_at)>1800000)alerts.push({id:'archive:stale',sport:null,code:'archive-stale',severity:'warning',message:'Daily recommendation archive has not refreshed successfully.'});
 for(const [sport,status] of Object.entries(archive?.sports||{}))if(status.error)alerts.push({id:sport+':capture-failed',sport,code:'capture-failed',severity:'warning',message:'Recommendation capture failed: '+status.error});
 const old=new Map((previous.alerts||[]).map(a=>[a.id,a]));
 for(const alert of alerts){alert.firstSeen=old.get(alert.id)?.firstSeen||new Date(now).toISOString();alert.changedAt=old.get(alert.id)?.severity===alert.severity?old.get(alert.id)?.changedAt||alert.firstSeen:new Date(now).toISOString()}
 return {schemaVersion:1,updated_at:new Date(now).toISOString(),status:alerts.some(a=>a.severity==='critical')?'critical':alerts.length?'warning':'healthy',sports,alerts,
  resolved:(previous.alerts||[]).filter(a=>!alerts.some(b=>b.id===a.id)).map(a=>({id:a.id,resolvedAt:new Date(now).toISOString()})),runUrl:process.env.GITHUB_RUN_ID?'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID:null};
}
function main({dataDir=process.env.SNAPSHOT_DATA_DIR||path.join(root,'data'),now=Date.now(),refreshStatus=process.env.REFRESH_STATUS||'success'}={}){
 const file=path.join(dataDir,'dashboard-health.json'),data={};let previous={};try{previous=read(dataDir,'dashboard-health.json')}catch{}
 for(const sport of ['nfl','mlb','ncaaf','nhl','ufc'])for(const name of ['kalshi-'+sport+'.json',sport+'-context.json'])try{data[name]=read(dataDir,name)}catch{}
 try{data['daily-picks.json']=read(dataDir,'daily-picks.json')}catch{}
 const report=build(data,previous,now,refreshStatus);fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
 for(const alert of report.alerts)console.log('::'+(alert.severity==='critical'?'error':'warning')+' title=Dashboard health::'+alert.sport+' '+alert.message.replace(/\r?\n/g,' '));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n### Dashboard health: '+report.status+'\n\n'+(report.alerts.length?report.alerts.map(a=>'- **'+a.severity+'** '+(a.sport||'Pipeline')+': '+a.message).join('\n'):'All feed and recommendation checks passed.')+'\n');
 console.log('Dashboard health:',report.status,report.alerts.length,'alerts');return report;
}
if(require.main===module)main();
module.exports={main,build,checkSport};
