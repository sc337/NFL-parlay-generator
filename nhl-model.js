// Experimental count model. Forecast inputs are official stats, never quotes.
(()=>{'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const PROPS=['goals','assists','points','shots','saves'];
function validStats(s,fields){return s&&num(s.games)>0&&fields.every(k=>num(s[k])!==null&&s[k]>=0)}
function blend(profile,field,baseline){
 const a=profile?.current,b=profile?.prior;
 const current=validStats(a,[field])?a:null,prior=validStats(b,[field])&&b.games>=20?b:null;
 if(!prior&&(!current||current.games<10))return null;
 const priorRate=prior?(prior[field]*prior.games+10*baseline)/(prior.games+10):baseline;
 const weight=current?current.games/(current.games+25):0;
 return {rate:priorRate*(1-weight)+(current?.[field]||0)*weight,games:current?.games||0,priorGames:prior?.games||0};
}
function distribution(mean,shape=null,max=60){
 if(!(mean>0)||!Number.isFinite(mean))return null;
 const values=[shape?Math.pow(shape/(shape+mean),shape):Math.exp(-mean)];
 for(let k=1;k<=max;k++)values.push(values[k-1]*(shape?(k-1+shape)/k*mean/(shape+mean):mean/k));
 const sum=values.reduce((a,b)=>a+b,0);if(sum<.999999)return null;
 return values.map(p=>p/sum);
}
function matchup(m,context){
 const now=Date.now(),updated=Date.parse(context?.updated_at||''),statsAt=Date.parse(context?.stats_at||'');
 const g=context?.games?.[String(m?.context_game_id||'')],start=Date.parse(g?.start||'');
 if(!g||!Number.isFinite(updated)||!Number.isFinite(statsAt)||updated>now+300000||statsAt>now+300000||now-updated>4*3600000||now-statsAt>24*3600000||updated>=start||start<=now||m.game_status!=='pre'||Math.abs(start-Date.parse(m.game_time||''))>300000||![2,3].includes(g.season_type))return null;
 const teamCodes=(m.teams||[]).map(t=>t.code);
 if(!teamCodes.includes(g.home)||!teamCodes.includes(g.away))return null;
 const avg=num(context.league?.goals_for),shots=num(context.league?.shots_for);
 if(!(avg>1&&avg<5&&shots>15&&shots<45))return null;
 const rates={};
 for(const side of ['away','home']){
  const p=context.teams?.[g[side]],off=blend(p,'goals_for',avg),def=blend(p,'goals_against',avg),sf=blend(p,'shots_for',shots),sa=blend(p,'shots_against',shots);
  if(!off||!def||!sf||!sa)return null;
  rates[side]={off:off.rate,def:def.rate,shotsFor:sf.rate,shotsAgainst:sa.rate,games:off.games};
 }
 const away=clamp(rates.away.off*rates.home.def/avg*(g.neutral?1:.97),1,6),home=clamp(rates.home.off*rates.away.def/avg*(g.neutral?1:1.03),1,6);
 return {g,away,home,rates,league:avg,leagueShots:shots,coverage:clamp(.5+.25*Math.min(rates.away.games,rates.home.games)/30,.5,.75)};
}
function scoreForecast(m,match){
 const a=distribution(match.away,null,25),h=distribution(match.home,null,25);if(!a||!h)return null;
 const named=m.team_code===match.g.home?'home':m.team_code===match.g.away?'away':null;
 if(m.kind!=='total'&&!named)return null;
 if(m.kind!=='moneyline'&&(num(m.line)===null||m.line%1!==.5))return null;
 let probability=0,ties=0;
 const win=(av,hv)=>{
  if(m.kind==='moneyline')return named==='home'?hv>av:av>hv;
  if(m.kind==='total')return m.side==='no'?av+hv<m.line:av+hv>m.line;
  // Normalized NO spread is the opponent plus the same half-goal line.
  const margin=named==='home'?hv-av:av-hv;
  return margin+(m.side==='no'?m.line:-m.line)>0;
 };
 for(let av=0;av<a.length;av++)for(let hv=0;hv<h.length;hv++){
  const mass=a[av]*h[hv];
  if(av===hv){ties+=mass;probability+=mass*((win(av+1,hv)?1:0)+(win(av,hv+1)?1:0))/2}
  else if(win(av,hv))probability+=mass;
 }
 return {modelP:probability,projectedAway:match.away+ties/2,projectedHome:match.home+ties/2,projectedTotal:match.away+match.home+ties,coverage:match.coverage};
}
function propForecast(m,context,match){
 if(!m.player_verified||!m.player_id||num(m.line)===null||m.line<.5||m.line%1!==.5)return null;
 const roster=(context.rosters||[]).find(p=>p.id===String(m.player_id)&&p.team===m.team_code&&p.name===m.player);
 if(!roster)return null;
 // Saves require a confirmed starting goalie and goalie-specific usage data.
 // The current free feed does not establish either; never assume a starter.
 if(m.kind==='saves')return null;
 const profile=context.players?.[String(m.player_id)],c=profile?.current,p=profile?.prior;
 const fields=['goals','assists','points','shots','toi'];
 const current=validStats(c,fields)?c:null,prior=validStats(p,fields)&&p.games>=20?p:null;
 if(!prior&&(!current||current.games<15))return null;
 const stat=m.kind==='shots'?'shots':m.kind,baseline=roster.position==='D'?{goals:.1,assists:.25,points:.35,shots:1.5}:{goals:.22,assists:.3,points:.52,shots:2};
 const priorRate=prior?(prior[stat]+10*baseline[stat])/(prior.games+10):baseline[stat];
 const weight=current?current.games/(current.games+20):0;
 let mean=priorRate*(1-weight)+(current?current[stat]/current.games:0)*weight;
 // A player's new role may change TOI. Apply a bounded usage adjustment.
 const priorTOI=prior?.toi||current?.toi,currentTOI=current?.toi||priorTOI;
 if(!(priorTOI>=300&&currentTOI>=300))return null;
 const usage=clamp((priorTOI*(1-weight)+currentTOI*weight)/priorTOI,.8,1.2);
 const side=m.team_code===match.g.home?'home':m.team_code===match.g.away?'away':null;if(!side)return null;
 const opposite=side==='home'?'away':'home';
 const opponent=m.kind==='shots'?match.rates[opposite].shotsAgainst/match.leagueShots:match.rates[opposite].def/match.league;
 mean=clamp(mean*usage*clamp(opponent,.75,1.3),.02,10);
 const counts=distribution(mean,m.kind==='shots'?8:4);if(!counts)return null;
 const under=counts.reduce((sum,p,k)=>sum+(k<m.line?p:0),0);
 return {modelP:m.side==='no'?under:1-under,projectedLine:mean,coverage:Math.min(match.coverage,.5+.2*weight),conditionalOnPlaying:true};
}
function estimate(m,context){
 const match=matchup(m,context);if(!match)return null;
 const result=PROPS.includes(m.kind)?propForecast(m,context,match):['moneyline','spread','total'].includes(m.kind)?scoreForecast(m,match):null;
 if(!result||!Number.isFinite(result.modelP))return null;
 const p=clamp(result.modelP,.001,.999),ask=num(m.yes_ask),marketP=num(m.probability);
 return {...result,modelP:p,rawModelP:p,experimental:true,betEV:null,
  estimatedEV:ask>0&&ask<1?p/ask-1:null,edge:marketP>0&&marketP<1?p-marketP:null,
  projectedLine:result.projectedLine??(m.kind==='total'?result.projectedTotal:null),
  sources:context.source,goalieNote:'Team-average goaltending; starters unconfirmed',
  method:PROPS.includes(m.kind)?'Negative-binomial player counts':'Poisson team scores; tied score resolved 50/50 with one deciding goal'};
}
window.NHL_MODEL={estimate,matchup,distribution,PROPS};
})();
