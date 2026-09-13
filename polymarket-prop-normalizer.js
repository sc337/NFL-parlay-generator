(() => {
  const PATCH_VERSION='v2';
  const PATCH_KEY='nflParlayPolyPropNormalizer';
  const originalFetch=window.fetch.bind(window);

  const STAT_PATTERNS=[
    ['passing yards','passing yards'],
    ['passing touchdowns','passing TDs'],
    ['passing touchdown','passing TDs'],
    ['pass attempts','pass attempts'],
    ['passing attempts','pass attempts'],
    ['pass completions','completions'],
    ['passing completions','completions'],
    ['rushing yards','rushing yards'],
    ['rush attempts','rush attempts'],
    ['rushing attempts','rush attempts'],
    ['carries','rush attempts'],
    ['receiving yards','receiving yards'],
    ['receptions','receptions'],
    ['catches','receptions']
  ];

  function extractProp(description=''){
    const text=String(description).replace(/\s+/g,' ').trim();
    if(!text) return null;

    // Polymarket NFL resolution language commonly reads:
    // "... resolve to Over if Cam Ward records more than 49.5 rushing yards ..."
    const record=text.match(/(?:if|when)\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,3})\s+records?\s+(?:more than|over|at least)\s+(\d+(?:\.\d+)?)\s+([a-z ]{3,30}?)(?:\s+in this game|\.|,| and | overtime|$)/i);
    if(record){
      const player=record[1].trim();
      const point=Number(record[2]);
      const rawStat=record[3].trim().toLowerCase();
      const hit=STAT_PATTERNS.find(([needle])=>rawStat.includes(needle));
      if(hit && Number.isFinite(point)) return {player,point,stat:hit[1]};
    }

    // Alternate wording: "Will X have/record over 4.5 receptions?"
    const alt=text.match(/(?:will\s+)?([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,3})\s+(?:record|records|have|finish with)\s+(?:more than|over|at least)\s+(\d+(?:\.\d+)?)\s+([a-z ]{3,30}?)(?:\?|\.|,|$)/i);
    if(alt){
      const player=alt[1].trim();
      const point=Number(alt[2]);
      const rawStat=alt[3].trim().toLowerCase();
      const hit=STAT_PATTERNS.find(([needle])=>rawStat.includes(needle));
      if(hit && Number.isFinite(point)) return {player,point,stat:hit[1]};
    }

    // Anytime TD language.
    const td=text.match(/(?:if|will)\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,3})\s+(?:scores?|record(?:s)?|have)\s+(?:at least\s+)?(?:one|a|an)?\s*(?:touchdown|td)/i);
    if(td) return {player:td[1].trim(),td:true,stat:'anytime touchdown'};

    return null;
  }

  function normalizeMarket(m){
    if(!m || typeof m!=='object') return m;
    const description=[m.description,m.rules,m.resolutionSource,m.question].filter(Boolean).join(' ');
    const prop=extractProp(description);
    if(!prop) return m;

    const synthetic=prop.td
      ? `${prop.player} anytime touchdown`
      : `${prop.player} ${prop.point} ${prop.stat}`;

    return {
      ...m,
      groupItemTitle: synthetic,
      question: `${synthetic}${m.question ? ' • '+m.question : ''}`,
      _nflPropNormalized:true
    };
  }

  function transform(value){
    if(Array.isArray(value)) return value.map(transform);
    if(!value || typeof value!=='object') return value;
    const out={...value};
    if(Array.isArray(out.markets)) out.markets=out.markets.map(normalizeMarket).map(transform);
    if(Array.isArray(out.events)) out.events=out.events.map(transform);
    return out;
  }

  window.fetch=async function(input,init){
    const raw=typeof input==='string'?input:input?.url;
    const res=await originalFetch(input,init);
    if(!raw) return res;
    let url;
    try{url=new URL(raw,location.href);}catch{return res;}
    if(url.hostname!=='gamma-api.polymarket.com') return res;
    const type=res.headers.get('content-type')||'';
    if(!type.includes('application/json')) return res;
    try{
      const json=await res.clone().json();
      const normalized=transform(json);
      const headers=new Headers(res.headers);
      headers.set('content-type','application/json');
      return new Response(JSON.stringify(normalized),{status:res.status,statusText:res.statusText,headers});
    }catch(err){
      console.warn('Polymarket prop normalization skipped',err);
      return res;
    }
  };

  // Bust old fallback caches once when this parser version changes.
  try{
    if(localStorage.getItem(PATCH_KEY)!==PATCH_VERSION){
      for(const key of Object.keys(localStorage)){
        if(key.startsWith('nflParlayPolymarketFallback:')) localStorage.removeItem(key);
      }
      localStorage.setItem(PATCH_KEY,PATCH_VERSION);
    }
  }catch{}

  window.NFL_POLYMARKET_PROP_NORMALIZER={extractProp,version:PATCH_VERSION};
})();
