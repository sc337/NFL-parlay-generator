// Unpriced Caesars-compatible research targets. Never synthesize bookmaker odds.
(()=>{'use strict';
const labels={points:'Points',rebounds:'Rebounds',assists:'Assists',threes:'Threes',pra:'Pts + Reb + Ast',double_double:'Double Double',triple_double:'Triple Double'};
const caps={points:80,rebounds:35,assists:25,threes:15,pra:120};
const registered=new WeakSet();
function isTarget(m){return !!m&&registered.has(m)}
function expand(rows,context){
 const bases=new Map(),out=[];
 for(const m of rows)if(m.player_verified===true&&m.player_id&&m.player&&m.game_status==='pre'&&!m.context_unmatched&&!m._invalidRoster){
  const p=context.players?.[String(m.player_id)];if(p?.team===m.team_code)bases.set([m.game_id,m.player_id].join('|'),m);
 }
 for(const base of bases.values())for(const [kind,label] of Object.entries(labels)){
  const milestone=kind==='double_double'||kind==='triple_double';
  const create=line=>{
   // Whitelist identity fields; never inherit quote, liquidity or contract metadata.
   const m={};for(const k of ['game_id','game_time','game_status','game_label','team_code','teams','player','player_id','player_verified','headshot','season_type'])m[k]=base[k];
   Object.assign(m,{kind,line,side:'yes',modelOnly:true,isAltLine:true,source:'Model estimate',referenceOnly:false,
    selection_id:['NBA-TARGET',base.game_id,base.player_id,kind,milestone?'yes':line+.5].join(':'),
    label:base.player+' '+(milestone?label:'Over '+line+' '+label)});
   registered.add(m);return m;
  };
  const probe=create(milestone?null:.5),forecast=window.NBA_MODEL.estimate(probe,context);if(!forecast)continue;
  if(milestone){out.push(probe);continue}
  const maximum=Math.min(caps[kind],Math.max(1,Math.ceil(forecast.projectedLine*1.5+3)));
  for(let target=1;target<=maximum;target++){
   const m=target===1?probe:create(target-.5),f=target===1?forecast:window.NBA_MODEL.estimate(m,context);
   // Avoid trivial milestones and very speculative tails; profile buffers still apply.
   if(f&&f.modelP>=.50&&f.modelP<=.92)out.push(m);
  }
 }
 return out;
}
window.NBA_PROP_TARGETS={expand,isTarget,labels};
})();
