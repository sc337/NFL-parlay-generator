(function(factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(typeof window!=='undefined')window.CONSERVATIVE_POLICY=api;})(()=>{'use strict';
const minProbability=.75,maxPrice=.85;
const families={nfl:new Set(['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_pass_tds']),nba:new Set(['points','rebounds','assists','threes','pra'])};
function milestone(s,m){const family=String(m.marketKey||m.kind||'').replace(/_alternate$/,'');return !!m.player&&families[s]?.has(family)&&['yes','over'].includes(String(m.quoteSide||m.side).toLowerCase())&&Number.isFinite(m.point??m.line);}
const thresholds={safe:.75,balanced:.65,long:.50};
function assessProfile(s,m,q,variant='safe'){
 const minimum=thresholds[variant];
 if(minimum==null)return {pass:false,reason:"Unknown profile",rank:-999};
 if(!q?.pass)return {pass:false,reason:q?.reason||"Selection failed quality checks",rank:-999};
 const p=q.conservativeP,price=q.quote?.p;
 if(s==='nba'&&m.modelOnly===true&&q.modelOnly===true){
  if(!Number.isFinite(p)||p<minimum)return {pass:false,reason:Math.round(minimum*100)+'% buffered likelihood required',rank:-999};
  return {pass:true,rank:100-(p-minimum)*100+(q.coverage||0)*4,reason:null};
 }

 if(!Number.isFinite(p)||p<minimum)return {pass:false,reason:Math.round(minimum*100)+"% buffered likelihood required",rank:-999};
 if(!Number.isFinite(price)||price<=0||price>maxPrice||(variant==='safe'&&price>p))return {pass:false,reason:"Price exceeds buffered likelihood or price limit",rank:-999};
 const rank=variant==='safe'?p*160+(q.coverage||0)*4+(milestone(s,m)?2:0):variant==='balanced'?p*100+(q.coverage||0)*12+(p-price)*20:(1-price)*60+p*45+(q.coverage||0)*12;
 return {pass:true,rank,reason:null};
}
function assess(s,m,q){
 const p=q?.conservativeP,price=q?.quote?.p;
 if(!q?.pass)return {pass:false,reason:q?.reason||'Selection failed quality checks',rank:-999};
 if(!Number.isFinite(p)||p<minProbability)return {pass:false,reason:'Conservative needs at least 75% buffered estimated likelihood',rank:-999};
 if(!Number.isFinite(price)||price<=0||price>maxPrice)return {pass:false,reason:'Conservative quote unavailable or too short',rank:-999};
 if(price>p)return {pass:false,reason:'Price exceeds buffered estimated likelihood',rank:-999};
 // Probability leads; a milestone bonus breaks close comparisons only.
 // These are unvalidated estimates, never a measured hit rate or verified edge.
 return {pass:true,rank:p*160+(q.coverage||0)*4+(milestone(s,m)?2:0),reason:null};
}
return {assess,assessProfile,thresholds,milestone,minProbability,maxPrice,description:'Targets 75%+ buffered estimated likelihood per leg; favors quoted player milestones. Estimates remain unvalidated. Verify exact lines and combined sportsbook odds.'};
});

