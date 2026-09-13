(() => {
  const KEY='nflParlayDiagnostics:v2';
  const MAX=80;
  let rows=[];
  try{rows=JSON.parse(sessionStorage.getItem(KEY))||[]}catch{}
  const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify(rows.slice(-MAX)))}catch{}};
  function classify(url){try{const u=new URL(url,location.href);if(u.hostname==='gamma-api.polymarket.com')return'Polymarket';if(u.hostname==='api.the-odds-api.com')return'Caesars/OddsAPI';if(u.hostname==='site.api.espn.com')return'ESPN';if(u.hostname.includes('github.com')&&u.pathname.includes('nflverse'))return'nflverse';}catch{}return null}
  function add(r){rows.push({...r,time:new Date().toISOString()});rows=rows.slice(-MAX);save();window.dispatchEvent(new CustomEvent('nfl-diagnostics-updated'));}
  const original=window.fetch.bind(window);
  window.fetch=async function(input,init){const raw=typeof input==='string'?input:input?.url,source=raw&&classify(raw);if(!source)return original(input,init);const start=performance.now();try{const res=await original(input,init);let count='';try{const type=res.headers.get('content-type')||'';if(type.includes('application/json')){const j=await res.clone().json();count=Array.isArray(j)?j.length:(j.events?.length??j.markets?.length??j.bookmakers?.length??'')}}catch{}add({source,url:String(raw).replace(/apiKey=[^&]+/,'apiKey=***'),status:res.status,ok:res.ok,count,ms:Math.round(performance.now()-start)});return res}catch(err){add({source,url:String(raw).replace(/apiKey=[^&]+/,'apiKey=***'),status:'ERR',ok:false,error:String(err?.message||err),ms:Math.round(performance.now()-start)});throw err}}
  window.NFL_DIAGNOSTICS={rows:()=>rows.slice(),clear:()=>{rows=[];save();window.dispatchEvent(new CustomEvent('nfl-diagnostics-updated'))},add};
})();