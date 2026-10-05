(()=>{'use strict';
let busy=false,lastAttempt=0;
async function ensure(){if(busy||document.hidden||(window.__ACTIVE_SPORT||'nfl')!=='nfl'||Date.now()-lastAttempt<30000)return;const feed=window.NFL_KALSHI;if(feed?.lastResult?.().code==='ready'&&feed.age()<20*60000)return;busy=true;lastAttempt=Date.now();try{await window.NFL_NO_DEMO?.load?.()}finally{busy=false}}
function mount(){document.addEventListener('visibilitychange',()=>{if(!document.hidden)ensure()});window.addEventListener?.('online',ensure);setInterval(ensure,60000);setTimeout(ensure,15000)}
window.NFL_FEED_WATCH={ensure};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
})();
