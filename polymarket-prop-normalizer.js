(() => {
  const PATCH_VERSION='v3';
  const PATCH_KEY='nflParlayPolyPropNormalizer';
  const originalFetch=window.fetch.bind(window);
  const STAT_PATTERNS=[
    ['passing yards','passing yards'],['passing touchdowns','passing TDs'],['passing touchdown','passing TDs'],['pass attempts','pass attempts'],['passing attempts','pass attempts'],['pass completions','completions'],['passing completions','completions'],['rushing yards','rushing yards'],['rush attempts','rush attempts'],['rushing attempts','rush attempts'],['carries','rush attempts'],['receiving yards','receiving yards'],['receptions','receptions'],['catches','receptions']
  ];
  function statHit(raw=''){const s=String(raw).toLowerCase();return STAT_PATTERNS.find(([needle])=>s.includes(needle))||null;}
  function cleanPlayer(s=''){return String(s).replace(/^(?:will|does|if|when)\s+/i,'').replace(/\s+/g,' ').trim();}
  function extractProp(raw=''){
    const text=String(raw).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();if(!text)return null;
    const patterns=[
      /(?:if|when|will)?\s*([A-Z][A-Za-z.'’\-]+(?:\s+[A-Z][A-Za-z.'’\-]+){1,3})\s+(?:records?|record|have|has|finish(?:es)? with|throws?|rush(?:es)? for|receives? for)\s+(?:more than|over|at least|less than|under|fewer than)\s+(\d+(?:\.\d+)?)\s+([a-z ]{3,40}?)(?=\?|\.|,|;|\s+in (?:the|this) game|\s+against\b|\s+versus\b|\s+vs\.?\b|$)/i,
      /([A-Z][A-Za-z.'’\-]+(?:\s+[A-Z][A-Za-z.'’\-]+){1,3})[^.?!]{0,35}?\b(over|under|more than|less than|at least|fewer than)\s+(\d+(?:\.\d+)?)\s+([a-z ]{3,40}?)(?=\?|\.|,|;|$)/i
    ];
    let m=text.match(patterns[0]);
    if(m){const hit=statHit(m[3]);if(hit)return {player:cleanPlayer(m[1]),point:Number(m[2]),stat:hit[1],side:/less than|under|fewer than/i.test(m[0])?'under':'over'};}
    m=text.match(patterns[1]);
    if(m){const hit=statHit(m[4]);if(hit)return {player:cleanPlayer(m[1]),point:Number(m[3]),stat:hit[1],side:/under|less than|fewer than/i.test(m[2])?'under':'over'};}
    const td=text.match(/(?:if|when|will)?\s*([A-Z][A-Za-z.'’\-]+(?:\s+[A-Z][A-Za-z.'’\-]+){1,3})\s+(?:scores?|record(?:s)?|have|has)\s+(?:at least\s+)?(?:one|a|an)?\s*(?:touchdown|td)/i);if(td)return {player:cleanPlayer(td[1]),td:true,stat:'anytime touchdown',side:'yes'};
    return null;
  }
  function allText(m){return [m.description,m.rules,m.resolutionSource,m.question,m.groupItemTitle,m.subtitle,m.title,m.slug].filter(Boolean).join(' ');}
  function normalizeMarket(m){if(!m||typeof m!=='object')return m;const prop=extractProp(allText(m));if(!prop)return m;const synthetic=prop.td?`${prop.player} anytime touchdown`:`${prop.player} ${prop.side==='under'?'Under':'Over'} ${prop.point} ${prop.stat}`;return {...m,groupItemTitle:synthetic,question:`${synthetic}${m.question?' • '+m.question:''}`,_nflPropNormalized:true};}
  function transform(value){if(Array.isArray(value))return value.map(transform);if(!value||typeof value!=='object')return value;const out={...value};if(Array.isArray(out.markets))out.markets=out.markets.map(normalizeMarket).map(transform);if(Array.isArray(out.events))out.events=out.events.map(transform);return out;}
  window.fetch=async function(input,init){const raw=typeof input==='string'?input:input?.url;const res=await originalFetch(input,init);if(!raw)return res;let url;try{url=new URL(raw,location.href);}catch{return res;}if(url.hostname!=='gamma-api.polymarket.com')return res;const type=res.headers.get('content-type')||'';if(!type.includes('application/json'))return res;try{const json=await res.clone().json(),normalized=transform(json),headers=new Headers(res.headers);headers.set('content-type','application/json');return new Response(JSON.stringify(normalized),{status:res.status,statusText:res.statusText,headers});}catch(err){console.warn('Polymarket prop normalization skipped',err);return res;}};
  try{if(localStorage.getItem(PATCH_KEY)!==PATCH_VERSION){for(const key of Object.keys(localStorage)){if(key.startsWith('nflParlayPolymarketFallback:'))localStorage.removeItem(key);}localStorage.setItem(PATCH_KEY,PATCH_VERSION);}}catch{}
  window.NFL_POLYMARKET_PROP_NORMALIZER={extractProp,version:PATCH_VERSION};
})();