(()=>{'use strict';
let data={ncaaf:{},ncaaf_codes:{},ufc:{}},pending;
const nflTeams={'Arizona Cardinals':'ari','Atlanta Falcons':'atl','Baltimore Ravens':'bal','Buffalo Bills':'buf','Carolina Panthers':'car','Chicago Bears':'chi','Cincinnati Bengals':'cin','Cleveland Browns':'cle','Dallas Cowboys':'dal','Denver Broncos':'den','Detroit Lions':'det','Green Bay Packers':'gb','Houston Texans':'hou','Indianapolis Colts':'ind','Jacksonville Jaguars':'jax','Kansas City Chiefs':'kc','Las Vegas Raiders':'lv','Los Angeles Chargers':'lac','Los Angeles Rams':'lar','Miami Dolphins':'mia','Minnesota Vikings':'min','New England Patriots':'ne','New Orleans Saints':'no','New York Giants':'nyg','New York Jets':'nyj','Philadelphia Eagles':'phi','Pittsburgh Steelers':'pit','San Francisco 49ers':'sf','Seattle Seahawks':'sea','Tampa Bay Buccaneers':'tb','Tennessee Titans':'ten','Washington Commanders':'wsh'};
const key=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function img(url,alt,photo=false){if(!/^https:\/\/(?:a\.espncdn\.com|www\.mlbstatic\.com|img\.mlbstatic\.com)\//.test(url||''))return '';return '<img class="sport-media-img '+(photo?'sport-photo':'sport-logo')+'" src="'+esc(url)+'" alt="'+esc(alt)+'" loading="lazy" onerror="this.remove()">'}
function load(){if(!pending)pending=fetch('data/sports-media.json?ts='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(d=>{data=d;return data}).catch(()=>data);return pending}
function nfl(m){if(m.player){if(Number.isInteger(Number(m.playerId))&&Number(m.playerId)>0)return img('https://a.espncdn.com/i/headshots/nfl/players/full/'+Number(m.playerId)+'.png',m.player+' headshot',true);return ''}const teams=m.type==='totals'?String(m.game||'').split(/\s+@\s+/).filter(t=>nflTeams[t]):m.team&&nflTeams[m.team]?[m.team]:[];return teams.map(t=>img('https://a.espncdn.com/i/teamlogos/nfl/500/'+nflTeams[t]+'.png',t+' logo')).join('')}
const collegeKey=s=>key(String(s||'').replace(/\bSt\.?(?=\s|$)/g,'State'));
function collegeMark(team){
 const name=team.name||team.aliases?.[0]||'Team',aliases=[name,...(team.aliases||[])];
 const logo=/^\d+$/.test(String(team.id||''))?'https://a.espncdn.com/i/teamlogos/ncaa/500/'+team.id+'.png':aliases.map(a=>data.ncaaf?.[key(a)]||data.ncaaf?.[collegeKey(a)]).find(Boolean);
 const initials=name.split(/\s+/).map(w=>w[0]).join('').slice(0,3).toUpperCase();
 const fallback='<span class="sport-logo" role="img" aria-label="'+esc(name)+' team mark" style="display:inline-grid;place-items:center;font-size:10px;font-weight:800;border-radius:7px;background:var(--surface2);color:var(--sport-accent)">'+esc(initials)+'</span>';
 if(!logo)return fallback;
 return '<span style="display:inline-flex;align-items:center">'+img(logo,name+' logo').replace('onerror="this.remove()"','onerror="this.hidden=true;this.nextElementSibling.hidden=false;this.nextElementSibling.style.display=\'inline-grid\'"')+fallback.replace('class="sport-logo"','hidden class="sport-logo"').replace('display:inline-grid;','')+'</span>';
}
function ncaaf(m){
 const name=String(m.label||m.title||'').replace(/\s+wins.*$/i,'').replace(/\s+[+−-]\d.*$/,'').trim();
 let teams=m.college_teams?.filter(Boolean)||[];
 if(!teams.length&&m.game_label)teams=String(m.game_label).split(/\s+(?:at|vs\.?|@)\s+/i).map(name=>({name}));
 if(m.kind!=='total'){
  const wanted=collegeKey(name),team=teams.find(t=>[t.name,...(t.aliases||[])].some(a=>collegeKey(a)===wanted||wanted.length>=4&&collegeKey(a).startsWith(wanted)));
  return collegeMark(team||{name});
 }
 if(teams.length===2)return teams.map(collegeMark).join('');
 const codes=String(m.event_ticker||'').match(/-\d{2}[A-Z]{3}\d{2}(?:\d{4})?([A-Z]+)$/)?.[1];
 const first=codes&&Object.keys(data.ncaaf_codes||{}).sort((a,b)=>b.length-a.length).find(a=>codes.startsWith(a)&&data.ncaaf_codes[codes.slice(a.length)]);
 return first?[first,codes.slice(first.length)].map(c=>img(data.ncaaf_codes[c],c+' logo')).join(''):collegeMark({name:'Game'});
}
function ufc(m){const label=String(m.label||'');const name=Object.keys(data.ufc||{}).find(n=>label===n||label.startsWith(n+' by '));return name?img(data.ufc[name],name+' headshot',true):''}
function nhl(m){const teams=(m.teams||[]).filter(t=>m.kind==='total'||t.code===m.team_code);return teams.map(t=>img(t.logo,t.name+' logo')).join('')}
window.SPORT_MEDIA={load,nfl,ncaaf,ufc,nhl};
})();
