(()=>{'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function estimate(game,market){
 if(market?.type!=='td'||market._rosterVerified!==true||!market.team||market.team==='Player')return null;
 if(/\bout\b|injured reserve|\bir\b|doubtful/i.test(String(market.contextSignals?.injury_status||'')))return null;
 const x=market.tdOpportunity,marketP=Number(market.prob??market.marketProbability);
 if(!x||!Number.isFinite(marketP)||marketP<=0||marketP>=1||
    !Number.isFinite(x.share)||x.share<=0||x.share>=1||x.games<2||
    !Number.isFinite(x.team_tds_per_game)||x.team_tds_per_game<=0)return null;
 const kickoff=Date.parse(game?.commence_time),latest=Date.parse(x.latest_game+'T23:59:59Z');
 if(!Number.isFinite(kickoff)||!Number.isFinite(latest)||latest>=kickoff||kickoff-latest>28*86400000)return null;
 const form=game?.context?.recent_form?.[market.team];
 const points=Number(form?.avg_points_for);
 const projectedPoints=Number.isFinite(points)&&points>0?points:null;
 const scoringFactor=projectedPoints===null?1:clamp(projectedPoints/24,.8,1.2);
 const expectedTeamTds=clamp(x.team_tds_per_game*scoringFactor,.6,4.5);
 const expectedPlayerTds=expectedTeamTds*x.share;
 const opportunityP=clamp(1-Math.exp(-expectedPlayerTds),.025,.9);
 // Early-season opportunity is noisy. Keep the offered market midpoint as a
 // strong prior until prospective results support a larger adjustment.
 const blend=clamp(.12+.025*x.games,.17,.245);
 return {modelP:clamp(marketP*(1-blend)+opportunityP*blend,.025,.95),rawModelP:opportunityP,
   marketP,expectedPlayerTds,opportunityP,coverage:clamp(.2+.06*x.games,.32,.5),
   confidence:0,ev:null,experimental:true,source:'nflverse completed plays',
   projectedLine:null};
}
window.NFL_TD_MODEL={estimate};
})();
