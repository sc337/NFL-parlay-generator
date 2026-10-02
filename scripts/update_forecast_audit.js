// Immutable first-observed, pregame forecasts for evaluation, not pick selection.
const fs=require('node:fs');
const path=require('node:path');
const {candidates}=require('./update_pick_history');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'data/forecast-audit.json');
const months={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
const finite=x=>x!=null&&x!==''&&Number.isFinite(Number(x))?Number(x):null;

function mlbStart(ticker){
  const match=String(ticker||'').match(/-(\d{2})([A-Z]{3})(\d{2})(\d{2})(\d{2})/);
  if(!match||months[match[2]]==null)return null;
  const local=Date.UTC(2000+Number(match[1]),months[match[2]],Number(match[3]),Number(match[4]),Number(match[5]));
  if(!Number.isFinite(local))return null;
  const zone=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(new Date(local)).find(x=>x.type==='timeZoneName')?.value;
  const offset=zone?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if(!offset)return null;
  const minutes=(Number(offset[2])*60+Number(offset[3]||0))*(offset[1]==='+'?1:-1);
  return new Date(local-minutes*60000).toISOString();
}
function start(sport,m,g,snapshot){
  if(sport==='nfl')return g.commence_time;
  if(sport==='mlb')return m.game_time||mlbStart(m.event_ticker);
  if(sport==='ncaaf')return m.game_time;
  if(sport==='ufc'){
    const x=String(m.event_ticker||'').match(/-(\d{2})([A-Z]{3})(\d{2})/);
    const day=x&&months[x[2]]!=null?new Date(Date.UTC(2000+Number(x[1]),months[x[2]],Number(x[3]))).toISOString().slice(0,10):'';
    return snapshot.cards?.[day]?.firstBell||null;
  }
  return null;
}
function record(sport,entry,snapshot,now){
  const m=entry.market||{},f=entry.forecast||{},g=entry.game||{};
  const ticker=String(m.ticker||''),side=m.quoteSide==='no'||m.side==='no'?'no':'yes';
  const eventTime=start(sport,m,g,snapshot),closeTime=m.close_time||eventTime;
  const marketP=finite(m.prob??m.probability??m.marketProbability);
  const ask=finite(sport==='nfl'?m.quoteProbability:m.yes_ask);
  if(!ticker||!Number.isFinite(Date.parse(eventTime))||Date.parse(eventTime)<=now||
     !Number.isFinite(Date.parse(closeTime))||Date.parse(closeTime)<=now||
     !(marketP>0&&marketP<1)||!(ask>0&&ask<1))return null;
  if(sport==='nfl'){
    if((finite(m.sourceQuality)||0)<60||m._invalidRoster===true)return null;
  }else if((finite(m.volume)||0)<25||!(finite(m.spread)>=0&&finite(m.spread)<=.16)||
           m.game_status==='Final'||m.game_status==='Live'||m.game_status==='in'||m.game_status==='post')return null;
  const modelP=finite(f.modelP),rawModelP=finite(f.rawModelP);
  const coverage=finite(f.coverage??f.context?.coverage??f.match?.coverage)||0;
  const projectedLine=finite(f.projectedLine);
  const independent=sport==='nfl'?coverage>=.2&&(!m.player||projectedLine!=null):
    sport==='mlb'?m.kind==='moneyline'&&coverage>=.45:
    sport==='ufc'?m.kind==='moneyline'&&coverage>0:false;
  const experimental=(sport==='ncaaf'&&f.experimental===true&&coverage>=.6)||
    (sport==='mlb'&&m.kind==='total'&&f.experimental===true&&coverage>=.45)||
    (sport==='nfl'&&m.type==='td'&&f.experimental===true&&coverage>=.3);
  const hasModel=(independent||experimental)&&modelP>0&&modelP<1;
  return {id:[sport,ticker,side].join('|'),sport,ticker,side,event:g.away&&g.home?g.away+' @ '+g.home:m.game_label||m.fight||'',
    eventId:g.context?.event_id||m.game_id||null,eventTime,closeTime,recordedAt:new Date(now).toISOString(),
    market:m.marketKey||m.kind||m.type,marketGroup:sport==='nfl'?(m.type==='td'?'touchdown_scorer':m.player?'player_prop':m.type==='h2h'?'moneyline':m.type):m.kind,
    selection:m.name||m.label||m.title||'',point:finite(m.point),projectedLine:hasModel?projectedLine:null,
    marketP,modelP:hasModel?modelP:marketP,rawModelP:hasModel?rawModelP:null,coverage,
    forecastType:hasModel?(experimental?'experimental':'model'):'market_only',ask,volume:finite(m.volume),
    quotedEV:hasModel&&!experimental?modelP/ask-1:null,
    ablations:hasModel&&f.ablations?Object.fromEntries(Object.entries(f.ablations).filter(([,p])=>finite(p)>0&&finite(p)<1)):null,
    snapshotAt:snapshot.updated_at||snapshot.generated_at||null,result:null};
}
async function main(){
  const now=Date.now(),old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{records:[]};
  const rows=Array.isArray(old.records)?old.records:[],seen=new Set(rows.map(r=>r.id)),added={};
  for(const sport of ['nfl','mlb','ncaaf','ufc']){
    try{
      const {snapshot,rows:choices}=await candidates(sport,{all:true});
      const updated=Date.parse(snapshot.updated_at||snapshot.generated_at);
      if(!Number.isFinite(updated)||updated>now+60000||now-updated>90*60000)throw Error('Snapshot is stale or future dated');
      for(const choice of choices){const r=record(sport,choice,snapshot,now);if(r&&!seen.has(r.id)){rows.push(r);seen.add(r.id);added[sport]=(added[sport]||0)+1}}
    }catch(error){console.warn('Audit candidates unavailable for',sport,error)}
  }
  const pending=rows.filter(r=>!r.result),settled=rows.filter(r=>r.result).slice(-30000);
  fs.writeFileSync(file,JSON.stringify({updated_at:new Date(now).toISOString(),records:[...settled,...pending]},null,2)+'\n');
  console.log('Forecast audit',rows.length,'records;',JSON.stringify(added),'new');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={record,mlbStart,start};
