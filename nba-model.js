// Basketball-specific, pregame-only estimates. No quoted price enters a projection.
(()=>{'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),num=x=>x!=null&&x!==''&&Number.isFinite(+x)?+x:null;
const PROPS=['points','rebounds','assists','threes','pra','pr','pa','ra','steals','blocks'];
const fields={points:['points'],rebounds:['rebounds'],assists:['assists'],threes:['threes'],pra:['points','rebounds','assists'],pr:['points','rebounds'],pa:['points','assists'],ra:['rebounds','assists'],steals:['steals'],blocks:['blocks']};
function cdf(z){const t=1/(1+.2316419*Math.abs(z)),d=.3989423*Math.exp(-z*z/2),p=1-d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>=0?p:1-p}
function form(rows,now,start){return (rows||[]).filter(r=>[2,3].includes(r.season_type)&&Date.parse(r.date)<Math.min(now,start)&&Date.parse(r.date)>start-240*86400000)}
function team(rows,now,start){const valid=form(rows,now,start).filter(r=>['points','allowed','possessions'].every(k=>num(r[k])!==null)&&r.possessions>=70&&r.possessions<=140).slice(-12);if(valid.length<5)return null;const poss=valid.reduce((s,r)=>s+r.possessions,0),n=valid.length,w=n/(n+12);return {pace:100*(1-w)+poss/n*w,off:113*(1-w)+valid.reduce((s,r)=>s+r.points,0)/poss*100*w,def:113*(1-w)+valid.reduce((s,r)=>s+r.allowed,0)/poss*100*w,n,last:Date.parse(valid.at(-1).date)}}
function matchup(m,ctx){const now=Date.now(),at=Date.parse(ctx?.updated_at),g=ctx?.games?.[String(m.game_id)],start=Date.parse(g?.start);if(!g||!Number.isFinite(at)||at>now+300000||now-at>4*3600000||!Number.isFinite(start)||start<=now||at>=start||m.game_status!=='pre'||Math.abs(start-Date.parse(m.game_time))>300000||![2,3].includes(g.season_type))return null;const away=team(ctx.teams?.[g.away]?.games,now,start),home=team(ctx.teams?.[g.home]?.games,now,start);if(!away||!home)return null;const pace=(away.pace+home.pace)/2,rest=t=>start-t.last<36*3600000?-1:0,ap=pace*(away.off+home.def)/200+rest(away),hp=pace*(home.off+away.def)/200+(g.neutral?0:2)+rest(home);return {g,start,pace,away:ap,home:hp,coverage:clamp(.4+.012*Math.min(away.n,home.n),.45,.65)}}
function estimate(m,ctx){const match=matchup(m,ctx);if(!match)return null;let modelP,projectedLine,projectedMinutes=null,usageRate=null,roleStability=1,conditionalOnPlaying=false;const line=num(m.line),named=m.team_code===match.g.home?'home':m.team_code===match.g.away?'away':null;if(PROPS.includes(m.kind)){
 if(m.player_verified!==true||!m.player_id||!named||line===null||line%1!==.5)return null;
 const player=ctx.players?.[String(m.player_id)];if(!player||player.team!==m.team_code)return null;
 if(/out|doubtful|questionable|suspended|inactive/i.test(player.injury_status||''))return null;
 const rows=form(player.games,Date.now(),match.start).filter(r=>r.team===m.team_code&&num(r.minutes)>0&&fields[m.kind].every(k=>num(r[k])!==null)).slice(-12);if(rows.length<5)return null;
 const minutes=rows.map(r=>r.minutes),meanMin=minutes.reduce((s,x)=>s+x,0)/rows.length,recent=minutes.slice(-3).reduce((s,x)=>s+x,0)/3;
 const sdMin=Math.sqrt(minutes.reduce((s,x)=>s+(x-meanMin)**2,0)/rows.length);roleStability=clamp(1-sdMin/Math.max(meanMin,1),0,1);if(meanMin<18||roleStability<.6)return null;
 const sum=r=>fields[m.kind].reduce((s,k)=>s+r[k],0),perMinute=rows.reduce((s,r)=>s+sum(r),0)/minutes.reduce((s,x)=>s+x,0);
 const expectedMin=clamp(meanMin*.7+recent*.3,meanMin*.85,meanMin*1.15),paceFactor=clamp(match.pace/100,.9,1.1);projectedLine=perMinute*expectedMin*paceFactor;
 projectedMinutes=expectedMin;
 const usage=rows.filter(r=>num(r.usedPossessions)!==null&&r.minutes>0);
 if(usage.length>=5)usageRate=usage.reduce((s,r)=>s+r.usedPossessions,0)/usage.reduce((s,r)=>s+r.minutes,0);
 // A recent role change is uncertainty, not permission to extrapolate a spike.
 if(Math.abs(recent/meanMin-1)>.20)return null;
 const avg=rows.reduce((s,r)=>s+sum(r),0)/rows.length,variance=rows.reduce((s,r)=>s+(sum(r)-avg)**2,0)/(rows.length-1),sd=Math.sqrt(Math.max(variance,projectedLine*.8,1));
 // Discrete counts preserve zero outcomes, including low-line threes/blocks.
 const shape=variance>projectedLine?clamp(projectedLine*projectedLine/(variance-projectedLine),.5,100):null;
 let mass=shape?Math.pow(shape/(shape+projectedLine),shape):Math.exp(-projectedLine),under=mass;
 for(let k=1;k<line;k++){mass*=shape?(k-1+shape)/k*projectedLine/(shape+projectedLine):projectedLine/k;under+=mass;}
 modelP=m.side==='no'?under:1-under;conditionalOnPlaying=true;
 }else{if(m.kind!=='total'&&!named)return null;const margin=named==='home'?match.home-match.away:match.away-match.home;if(m.kind==='moneyline')modelP=cdf(margin/12);else if(m.kind==='spread'&&line!==null&&line%1===.5)modelP=cdf((margin+(m.side==='no'?line:-line))/12);else if(m.kind==='total'&&line!==null&&line%1===.5){projectedLine=match.home+match.away;modelP=m.side==='no'?cdf((line-projectedLine)/18):1-cdf((line-projectedLine)/18)}else return null;}
 return {modelP:clamp(modelP,.01,.99),rawModelP:clamp(modelP,.01,.99),marketP:num(m.probability),projectedLine,projectedMinutes,usageRate,projectedTotal:match.home+match.away,projectedMargin:match.home-match.away,pace:match.pace,coverage:match.coverage,roleStability,conditionalOnPlaying,experimental:true,uncertainty:.55,betEV:null,method:PROPS.includes(m.kind)?'Recent same-team per-minute production, projected minutes and paired-stat variance':'Possession-based offense/defense, pace, home court and rest',sources:ctx.sources};
}
window.NBA_MODEL={estimate,matchup,team,PROPS,cdf};
})();
