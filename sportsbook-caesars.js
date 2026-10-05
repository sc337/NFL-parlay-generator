(() => {
  const BOOKMAKER_KEY = 'williamhill_us';
  const BOOKMAKER_LABEL = 'Caesars';
  const originalFetch = window.fetch.bind(window);

  function rewriteBookmakerKeys(value){
    if(Array.isArray(value)) return value.map(rewriteBookmakerKeys);
    if(value && typeof value === 'object'){
      const out = {};
      if(value.key===BOOKMAKER_KEY)out.dashboardBookSource=BOOKMAKER_LABEL;
      for(const [k,v] of Object.entries(value)){
        if(k === 'key' && v === BOOKMAKER_KEY) out[k] = 'fanduel';
        else out[k] = rewriteBookmakerKeys(v);
      }
      return out;
    }
    return value;
  }

  window.fetch = async function(input, init){
    let request = input;
    let oddsApiRequest = false;

    try{
      const rawUrl = typeof input === 'string' ? input : input?.url;
      if(rawUrl){
        const url = new URL(rawUrl, window.location.href);
        oddsApiRequest = url.hostname === 'api.the-odds-api.com';
        if(oddsApiRequest){
          // Scope every Odds API request, including event-market discovery, to Caesars.
          url.searchParams.set('bookmakers', BOOKMAKER_KEY);
          request = typeof input === 'string' ? url.toString() : new Request(url.toString(), input);
        }
      }
    }catch(err){
      console.warn('Caesars sportsbook request rewrite skipped', err);
    }

    const res = await originalFetch(request, init);
    if(!oddsApiRequest) return res;

    const contentType = res.headers.get('content-type') || '';
    if(!contentType.includes('application/json')) return res;

    try{
      const data = await res.clone().json();
      const transformed = rewriteBookmakerKeys(data);
      const headers = new Headers(res.headers);
      headers.set('content-type','application/json');
      return new Response(JSON.stringify(transformed), {
        status: res.status,
        statusText: res.statusText,
        headers
      });
    }catch(err){
      console.warn('Caesars response transform skipped', err);
      return res;
    }
  };

  window.NFL_PARLAY_SPORTSBOOK = {
    key: BOOKMAKER_KEY,
    label: BOOKMAKER_LABEL,
    paidPlanRequired: true
  };
})();

