(() => {
  // Read generated JSON independently of the GitHub Pages deployment queue.
  const nativeFetch = window.fetch.bind(window);
  const root = 'https://raw.githubusercontent.com/sc337/NFL-parlay-generator/main/';
  const files = new Set(['kalshi-nfl.json','kalshi-mlb.json','kalshi-ncaaf.json',
    'kalshi-nhl.json','kalshi-ufc.json','daily-picks.json','dashboard-health.json',
    'nhl-context.json','mlb-context.json','ncaaf-context.json','sports-media.json']);
  window.fetch = async function(input, init) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, document.baseURI);
    const file = url.pathname.split('/').pop();
    const method = (init?.method || input?.method || 'GET').toUpperCase();
    if (url.origin !== location.origin || !url.pathname.includes('/data/') ||
        !files.has(file) || method !== 'GET') return nativeFetch(input, init);
    const controller = new AbortController();
    const signal = init?.signal || input?.signal;
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const remote = new URL(root + 'data/' + file);
      remote.searchParams.set('refresh', String(Math.floor(Date.now() / 60000)));
      const response = await nativeFetch(remote.href, {cache:'no-store', signal:controller.signal});
      if (!response.ok) throw new Error('Snapshot HTTP ' + response.status);
      // Validate before falling back: consumers retain their freshness/schema guards.
      const data = await response.clone().json();
      if (!data || typeof data !== 'object') throw new Error('Invalid snapshot JSON');
      return response;
    } catch (error) {
      if (signal?.aborted) throw error;
      return nativeFetch(input, init);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
})();
