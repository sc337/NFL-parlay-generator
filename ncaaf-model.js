// Pregame-only, market-independent NCAAF score model. Experimental until a
// settled holdout demonstrates calibration and value. It never creates bet EV.
(()=>{'use strict';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const sigmoid=x=>1/(1+Math.exp(-x));
function side(label,game){
  const name=norm(label);
  return ['home','away'].find(k=>(game[k]?.aliases||[]).some(alias=>{
    const key=norm(alias);return key===name||key.startsWith(name)&&name.length>=4;
  }))||null;
}
function estimate(m,context){
  const game=context?.games?.[String(m?.game_id||'')];
  const updated=Date.parse(context?.updated_at||'');
  const kickoff=Date.parse(game?.kickoff||'');
  if(!game||!Number.isFinite(updated)||Date.now()-updated>12*3600000||updated>Date.now()+300000||
     !Number.isFinite(kickoff)||kickoff<=updated||kickoff<=Date.now()||
     m?.game_status!=='pre'||!game.home?.form?.available||!game.away?.form?.available)return null;
  const h=game.home.form,a=game.away.form;
  if(h.games<3||a.games<3||h.box_games<2||a.box_games<2)return null;
  const coverage=clamp(.35+.04*Math.min(h.games,a.games)+.08*Math.min(h.box_games,a.box_games),0,.85);
  const shrink=Math.min(h.games,a.games)/(Math.min(h.games,a.games)+3);
  const yardDiff=((h.yards_for-h.yards_against)-(a.yards_for-a.yards_against))/65;
  const margin=clamp((game.neutral_site?0:2.5)+shrink*(.68*(h.margin-a.margin)+clamp(yardDiff,-4,4)),-28,28);
  const leagueTotal=Number(context.league_points_per_team)*2;
  if(!Number.isFinite(leagueTotal)||leagueTotal<25||leagueTotal>90)return null;
  const formTotal=(h.points_for+a.points_against+a.points_for+h.points_against)/2;
  let total=clamp(leagueTotal+(formTotal-leagueTotal)*shrink,28,85);
  const weather=game.weather||{};
  if(weather.indoor===false){
    const wind=Number(weather.wind_mph),precip=Number(weather.precip_probability);
    if(Number.isFinite(wind)&&wind>=15)total-=Math.min(6,(wind-12)*.35);
    if(weather.precip_probability!=null&&Number.isFinite(precip)&&precip>=50)total-=Math.min(3,(precip-40)*.04);
  }
  const title=String(m.title||m.label||'');
  let p;
  if(m.kind==='moneyline'){
    const named=side(title.replace(/\s+wins\s*$/i,''),game);
    if(!named)return null;
    p=sigmoid((named==='home'?margin:-margin)/13);
  }else if(m.kind==='spread'){
    const match=title.match(/^(.+?) wins by over (\d+(?:\.\d+)?) points?$/i);
    const named=match&&side(match[1],game);
    if(!named)return null;
    p=sigmoid(((named==='home'?margin:-margin)-Number(match[2]))/13);
  }else if(m.kind==='total'){
    const match=title.match(/^(Over|Under) (\d+(?:\.\d+)?) points scored$/i);
    if(!match)return null;
    p=sigmoid(((match[1].toLowerCase()==='over'?1:-1)*(total-Number(match[2])))/13);
  }else return null;
  return {modelP:clamp(p,.04,.96),rawModelP:clamp(p,.04,.96),marketP:Number(m.probability),
    coverage,experimental:true,betEV:null,projectedMargin:+margin.toFixed(1),projectedTotal:+total.toFixed(1),
    sources:game.sources||context.sources};
}
window.NCAAF_MODEL={estimate};
})();
