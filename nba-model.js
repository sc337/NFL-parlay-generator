// Pregame basketball projections. Thin-history team markets use an explicitly labeled two-way market fallback.
(()=>{'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),num=x=>x!=null&&x!==''&&Number.isFinite(+x)?+x:null;
const PROPS=['points','rebounds','assists','threes','pr','pa','ra','steals','blocks','pra','double_double','triple_double'];
const fields={points:['points'],rebounds:['rebounds'],assists:['assists'],threes:['threes'],pr:['points','rebounds'],pa:['points','assists'],ra:['rebounds','assists'],steals:['steals'],blocks:['blocks'],pra:['points','rebounds','assists']};
const moneylineGroups=new WeakMap();
const milestoneFields=['points','rebounds','assists','steals','blocks'];
function cdf(z){const t=1/(1+.2316419*Math.abs(z)),d=.3989423*Math.exp(-z*z/2),p=1-d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>=0?p:1-p}
function form(rows,now,start){return (rows||[]).filter(r=>[2,3].includes(r.season_type)&&Date.parse(r.date)<Math.min(now,start)&&Date.parse(r.date)>start-240*86400000)}
function team(rows,now,start){
 const valid=form(rows,now,start).filter(r=>['points','allowed','possessions'].every(k=>num(r[k])!==null)&&r.possessions>=70&&r.possessions<=140).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-12);
 if(valid.length<5)return null;
 const seasonStart=Date.UTC(new Date(start).getUTCFullYear()-(new Date(start).getUTCMonth()<6?1:0),6,1);
 const weights=valid.map(r=>Math.pow(.5,Math.max(0,now-Date.parse(r.date))/(60*86400000))*(Date.parse(r.date)<seasonStart?.15:1));
 const effectiveN=weights.reduce((a,b)=>a+b,0),sum=k=>valid.reduce((v,r,i)=>v+r[k]*weights[i],0),poss=sum('possessions'),w=effectiveN/(effectiveN+12);
 const last=Date.parse(valid.at(-1).date),recent=valid.filter(r=>Date.parse(r.date)>=seasonStart&&now-Date.parse(r.date)<=45*86400000).length;
 return {pace:100*(1-w)+poss/effectiveN*w,off:113*(1-w)+sum('points')/poss*100*w,def:113*(1-w)+sum('allowed')/poss*100*w,n:valid.length,effectiveN,recent,last,ageDays:(now-last)/86400000};
}
function rosterEvidence(ctx,teams){
 const players=Object.values(ctx.players||{}).filter(p=>teams.includes(p.team));let minutes=0,retained=0;const keyAbsences=[];
 for(const p of players){const rows=(p.games||[]).slice(-5),avg=rows.reduce((sum,r)=>sum+(num(r.minutes)||0),0)/Math.max(1,rows.length);minutes+=avg;retained+=avg*rows.filter(r=>r.team===p.team).length/Math.max(1,rows.length);if(avg>=20&&/out|doubtful|questionable|suspended|inactive/i.test(p.injury_status||''))keyAbsences.push(p.name||p.id)}
 return {continuity:minutes>0?retained/minutes:null,keyAbsences};
}
function matchup(m,ctx){
 const now=Date.now(),at=Date.parse(ctx?.updated_at),g=ctx?.games?.[String(m.game_id)],start=Date.parse(g?.start);
 if(!g||!Number.isFinite(at)||at>now+300000||now-at>4*3600000||!Number.isFinite(start)||start<=now||at>=start||m.game_status!=='pre'||Math.abs(start-Date.parse(m.game_time))>300000||![2,3].includes(g.season_type))return null;
 const away=team(ctx.teams?.[g.away]?.games,now,start),home=team(ctx.teams?.[g.home]?.games,now,start);
 // A market fallback can cover missing team samples, never invalid game identity or context.
 if((!away||!home)&&!['moneyline','spread','total'].includes(m.kind))return null;
 const neutral={pace:100,off:113,def:113,n:0,recent:0,last:0,ageDays:Infinity};
 const roster=rosterEvidence(ctx,[g.away,g.home]),a=away||neutral,h=home||neutral,pace=(a.pace+h.pace)/2,rest=t=>start-t.last<36*3600000?-1:0;
 return {g,start,pace,away:pace*(a.off+h.def)/200+rest(a),home:pace*(h.off+a.def)/200+(g.neutral?0:2)+rest(h),roster,thinHistory:Math.min(a.recent,h.recent)<5||roster.keyAbsences.length>0||roster.continuity!==null&&roster.continuity<.8,historyAgeDays:Math.max(a.ageDays,h.ageDays),recentGames:Math.min(a.recent,h.recent),coverage:clamp(.4+.012*Math.min(a.n,h.n),.45,.65)};
}
function marketFallback(m,match){
 const Q=window.PICK_QUALITY;if(!Q?.markets||!Q?.quote)return null;
 // Reference sides have distinct IDs; pair only the same verified provider,
 // event, market family and normalized threshold. Never mix book/exchange sides.
 const pairKeyFor=row=>{if(row.referenceOnly){const id=String(row.ticker||'').match(/^ESPN:(\d+):(\d+):(spread|total):(home|away|over|under):[-\d.]+$/);if(!id||id[1]!==String(row.game_id)||id[3]!==row.kind||!window.ESPN_EVIDENCE?.contract('nba',row))return null;return ['reference',row.source,id[1],id[2],row.kind,num(row.line)].join('|')}return row.kind+'|'+String(row.game_id)+(row.kind==='moneyline'?'':'|'+row.ticker+'|'+num(row.line))};
 const rows=Q.markets('nba');let groups=moneylineGroups.get(rows);if(!groups){groups=new Map();for(const row of rows)if(['moneyline','spread','total'].includes(row.kind)){const key=pairKeyFor(row);if(key===null)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}moneylineGroups.set(rows,groups)}
 const usable=x=>x.context_unmatched!==true&&x._invalidRoster!==true&&x.game_status==='pre'&&Math.abs(Date.parse(x.game_time)-match.start)<=300000;
 const pairKey=pairKeyFor(m);
 const candidates=(groups.get(pairKey)||[]).filter(x=>m.referenceOnly?x.referenceOnly&&num(x.line)===num(m.line):m.kind==='moneyline'||m.ticker&&x.ticker===m.ticker&&num(x.line)===num(m.line));
 const quotes=predicate=>candidates.filter(x=>usable(x)&&predicate(x)).map(x=>({m:x,q:Q.quote('nba',x)})).filter(({m:x,q})=>q.p>0&&q.p<1&&Date.now()-Date.parse(q.checkedAt)>=-300000&&Date.now()-Date.parse(q.checkedAt)<=30*60000&&(x.referenceOnly?!!window.ESPN_EVIDENCE?.contract('nba',x):Number(x.volume)>=50&&num(x.spread)!==null&&x.spread>=0&&x.spread<=.08)).sort((a,b)=>Date.parse(b.q.checkedAt)-Date.parse(a.q.checkedAt)||a.m.spread-b.m.spread||String(a.m.selection_id).localeCompare(String(b.m.selection_id)));
 const a=quotes(x=>m.kind==='moneyline'?x.team_code===match.g.away&&x.side==='yes':x.side==='yes')[0],h=quotes(x=>m.kind==='moneyline'?x.team_code===match.g.home&&x.side==='yes':x.side==='no')[0];if(!a||!h)return null;
 const sum=a.q.p+h.q.p;if(sum<.97||sum>1.15||a.q.source!==h.q.source||Math.abs(Date.parse(a.q.checkedAt)-Date.parse(h.q.checkedAt))>5*60000)return null;
 const marketP=(m.kind==='moneyline'?(m.team_code===match.g.home?h.q.p:a.q.p):(m.side==='no'?h.q.p:a.q.p))/sum;
 return {marketP,independentWeight:Math.min(.25,match.recentGames/20)*(match.roster.continuity??.5)*(match.roster.keyAbsences.length?.5:1),reason:match.roster.keyAbsences.length?'Key-player availability uncertain':match.roster.continuity!==null&&match.roster.continuity<.8?'Roster continuity uncertain':'Thin current-season history',policy:'Two-way quoted prices normalized; unvalidated policy blend'};
}
function estimate(m,ctx){const match=matchup(m,ctx);if(!match)return null;let marketBasis=null,modelP,projectedLine,projectedMinutes=null,usageRate=null,opportunity=null,roleChange=null,sensitivity=null,baselines={market:num(m.probability)},roleStability=1,conditionalOnPlaying=false;const line=num(m.line),named=m.team_code===match.g.home?'home':m.team_code===match.g.away?'away':null;if(PROPS.includes(m.kind)){
 const milestone=m.kind==='double_double'||m.kind==='triple_double',required=milestone?milestoneFields:fields[m.kind];
 if(m.player_verified!==true||!m.player_id||!named||(!milestone&&(line===null||line%1!==.5)))return null;
 const player=ctx.players?.[String(m.player_id)];if(!player||player.team!==m.team_code)return null;
 if(/out|doubtful|questionable|suspended|inactive/i.test(player.injury_status||''))return null;
 const rows=form(player.games,Date.now(),match.start).filter(r=>r.team===m.team_code&&num(r.minutes)>0&&required.every(k=>num(r[k])!==null)).slice(-12);if(rows.length<(milestone?8:5))return null;
 const minutes=rows.map(r=>r.minutes),meanMin=minutes.reduce((s,x)=>s+x,0)/rows.length,recent=minutes.slice(-3).reduce((s,x)=>s+x,0)/3;
 const sdMin=Math.sqrt(minutes.reduce((s,x)=>s+(x-meanMin)**2,0)/rows.length);roleStability=clamp(1-sdMin/Math.max(meanMin,1),0,1);if(meanMin<18||roleStability<.6)return null;
 if(milestone){if(Math.abs(recent/meanMin-1)>.20&&!window.MODEL_LEARNING)return null;const needed=m.kind==='double_double'?2:3,results=rows.map(r=>milestoneFields.filter(k=>r[k]>=10).length>=needed?1:0),successes=results.reduce((s,x)=>s+x,0),rate=(successes+.5)/(results.length+1);modelP=m.side==='no'?1-rate:rate;conditionalOnPlaying=true;const observed=successes/results.length,sd=Math.sqrt(Math.max(observed*(1-observed),.01)/results.length);sensitivity={policy:'advisory',scenarios:[{name:'Lower historical rate',modelP:clamp(rate-sd,0,1)},{name:'Smoothed historical rate',modelP:rate},{name:'Higher historical rate',modelP:clamp(rate+sd,0,1)}]};baselines.historical=rate;projectedLine=null;}else{
 const sum=r=>fields[m.kind].reduce((s,k)=>s+r[k],0),perMinute=rows.reduce((s,r)=>s+sum(r),0)/minutes.reduce((s,x)=>s+x,0);
 const expectedMin=clamp(meanMin*.7+recent*.3,meanMin*.85,meanMin*1.15),paceFactor=clamp(match.pace/100,.9,1.1);projectedLine=perMinute*expectedMin*paceFactor;
 projectedMinutes=expectedMin;
 opportunity=window.MODEL_LEARNING?.opportunity(rows.map(sum),minutes);
 roleChange=window.MODEL_LEARNING?.roleChange(minutes);
 if(opportunity){projectedMinutes=opportunity.projectedExposure;projectedLine=opportunity.projection*paceFactor;}
 const simpleMean=rows.reduce((s,r)=>s+sum(r),0)/rows.length;
 const sampleSD=Math.sqrt(Math.max(1,rows.reduce((s,r)=>s+(sum(r)-simpleMean)**2,0)/(rows.length-1)));
 baselines.simpleMean=m.side==='no'?cdf((line-simpleMean)/sampleSD):1-cdf((line-simpleMean)/sampleSD);
 baselines.noPace=m.side==='no'?cdf((line-(opportunity?.projection??perMinute*expectedMin))/sampleSD):1-cdf((line-(opportunity?.projection??perMinute*expectedMin))/sampleSD);
 const usage=rows.filter(r=>num(r.usedPossessions)!==null&&r.minutes>0);
 if(usage.length>=5)usageRate=usage.reduce((s,r)=>s+r.usedPossessions,0)/usage.reduce((s,r)=>s+r.minutes,0);
 // A recent role change is uncertainty, not permission to extrapolate a spike.
 if(Math.abs(recent/meanMin-1)>.20&&!window.MODEL_LEARNING)return null;
 const avg=rows.reduce((s,r)=>s+sum(r),0)/rows.length,variance=rows.reduce((s,r)=>s+(sum(r)-avg)**2,0)/(rows.length-1),sd=Math.sqrt(Math.max(variance,projectedLine*.8,1));
 // Discrete counts preserve zero outcomes, including low-line threes/blocks.
 const shape=variance>projectedLine?clamp(projectedLine*projectedLine/(variance-projectedLine),.5,100):null;
 let mass=shape?Math.pow(shape/(shape+projectedLine),shape):Math.exp(-projectedLine),under=mass;
 for(let k=1;k<line;k++){mass*=shape?(k-1+shape)/k*projectedLine/(shape+projectedLine):projectedLine/k;under+=mass;}
 modelP=m.side==='no'?under:1-under;conditionalOnPlaying=true;
 function countUnder(mu){const shape=variance>mu?clamp(mu*mu/(variance-mu),.5,100):null;let mass=shape?Math.pow(shape/(shape+mu),shape):Math.exp(-mu),sum=mass;for(let k=1;k<line;k++){mass*=shape?(k-1+shape)/k*mu/(shape+mu):mu/k;sum+=mass}return sum}
 const minuteScenarios=[projectedMinutes*.85,projectedMinutes,projectedMinutes*1.15,...(roleChange?.status==='rising'?[roleChange.baseline,roleChange.recent]:[])];
 sensitivity={policy:'advisory',scenarios:minuteScenarios.map(minutes=>({name:Math.round(minutes)+' minutes',modelP:m.side==='no'?countUnder(projectedLine*minutes/projectedMinutes):1-countUnder(projectedLine*minutes/projectedMinutes)}))};
 const simple=countUnder(avg),noPace=countUnder(opportunity?.projection??perMinute*expectedMin);
 baselines.simpleMean=m.side==='no'?simple:1-simple;baselines.noPace=m.side==='no'?noPace:1-noPace;}
 }else{if(m.kind!=='total'&&!named)return null;const margin=named==='home'?match.home-match.away:match.away-match.home;if(m.kind==='moneyline')modelP=cdf(margin/12);else if(m.kind==='spread'&&line!==null&&line%1===.5)modelP=cdf((margin+(m.side==='no'?line:-line))/12);else if(m.kind==='total'&&line!==null&&line%1===.5){projectedLine=match.home+match.away;modelP=m.side==='no'?cdf((line-projectedLine)/18):1-cdf((line-projectedLine)/18)}else return null;
 if(match.thinHistory){marketBasis=marketFallback(m,match);if(!marketBasis)return null;modelP=marketBasis.marketP*(1-marketBasis.independentWeight)+modelP*marketBasis.independentWeight;}}
 return {marketAnchored:!!marketBasis,marketBasis,historyAgeDays:match.historyAgeDays,recentGames:match.recentGames,rosterEvidence:match.roster,selectionMode:['moneyline','spread','total'].includes(m.kind)?'ideas':undefined,modelP:clamp(modelP,.01,.99),rawModelP:clamp(modelP,.01,.99),marketP:num(m.probability),projectedLine:marketBasis?null:projectedLine,projectedMinutes,usageRate,opportunity,roleChange,sensitivity,baselines,modelVersion:window.MODEL_LEARNING?.VERSION,projectedTotal:marketBasis?null:match.home+match.away,projectedMargin:marketBasis?null:match.home-match.away,pace:match.pace,coverage:match.coverage,roleStability,conditionalOnPlaying,experimental:true,uncertainty:match.thinHistory?.8:.55,betEV:null,method:marketBasis?'Market-informed likelihood; '+marketBasis.reason.toLowerCase()+', value unverified':m.kind==='double_double'||m.kind==='triple_double'?'Recent verified box-score rate for 10+ in two or three of points, rebounds, assists, steals and blocks':PROPS.includes(m.kind)?'Recent same-team per-minute production, projected minutes and paired-stat variance':'Possession-based offense/defense, pace, home court and rest',sources:ctx.sources};
}
window.NBA_MODEL={estimate,matchup,team,PROPS,cdf};
})();
