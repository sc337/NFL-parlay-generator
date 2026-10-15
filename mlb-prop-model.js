(()=>{'use strict';
const keys={hits:'hits',home_runs:'homeRuns',rbi:'rbi',total_bases:'totalBases',strikeouts:'strikeOuts'};
function estimate(m,ctx){
 const stat=keys[m.kind],L=window.MODEL_LEARNING;if(!stat||!L)return null;
 const at=Date.parse(ctx.updated_at),now=Date.now(),start=Date.parse(m.game_time);
 if(!(at<=now&&now-at<=4*3600000&&start>now))return null;
 const name=m.player||String(m.label||'').split(':')[0].trim(),pid=ctx.players?.[name],g=(ctx.games||[]).find(g=>String(g.gamePk)===String(m.game_id));
 if(!pid||!g)return null;
 const logs=(ctx.playerLogs?.[String(pid)]||[]).filter(r=>Date.parse(r.date)<now&&Date.parse(r.date)<start&&Date.parse(r.date)>now-45*86400000),team=logs.at(-1)?.teamId;
 if(![g.homeId,g.awayId].includes(team))return null;
 if(m.kind==='strikeouts'&&![g.homeProbable?.id,g.awayProbable?.id].includes(pid))return null;
 if(m.kind!=='strikeouts'&&g.lineupsConfirmed&&!g.lineupPlayerIds?.includes(pid))return null;
 const exposure=m.kind==='strikeouts'?'battersFaced':'plateAppearances',rows=logs.filter(r=>r.teamId===team&&Number.isFinite(r[stat])&&r[exposure]>0).slice(-10);
 const opportunity=L.opportunity(rows.map(r=>r[stat]),rows.map(r=>r[exposure]));if(!opportunity||!(opportunity.projection>0))return null;
 const line=window.PICK_QUALITY?.line(m);if(!(line>=.5&&line%1===.5))return null;
 const mean=opportunity.projection,avg=opportunity.simpleMean,variance=rows.reduce((s,r)=>s+(r[stat]-avg)**2,0)/Math.max(1,rows.length-1);
 function under(mu){const shape=variance>mu?Math.max(.5,mu*mu/(variance-mu)):null;let mass=shape?Math.pow(shape/(shape+mu),shape):Math.exp(-mu),sum=mass;for(let k=1;k<line;k++){mass*=shape?(k-1+shape)/k*mu/(shape+mu):mu/k;sum+=mass}return Math.max(0,Math.min(1,sum));}
 const low=m.side==='no'||m.side==='under',p=under(mean),simple=under(avg);
 return {modelP:low?p:1-p,rawModelP:low?p:1-p,marketP:m.probability,baselines:{market:m.probability,simpleMean:low?simple:1-simple},
  projectedLine:mean,playerId:pid,player:name,opportunity,roleChange:opportunity.role,coverage:.5,experimental:true,uncertainty:.6,betEV:null,
  context:{coverage:.5,why:exposure+' × observed production per opportunity'},method:'Recent same-team '+exposure+' × production per opportunity'};
}
window.MLB_PROP_MODEL={estimate};
})();
