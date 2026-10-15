// Reference-price history only. Caesars observations live in the browser ledger.
const finite=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
function track(rows,snapshot,sport,now=Date.now()){
 const at=Date.parse(snapshot.updated_at||snapshot.generated_at);
 if(!Number.isFinite(at)||at>now+300000||now-at>30*60000)return 0;
 const stamp=new Date(at).toISOString();
 const markets=sport==='nfl'?(snapshot.games||[]).flatMap(g=>(g.markets||[]).map(m=>({...m,eventTime:g.commence_time}))):snapshot.markets||[];
 const index=new Map(markets.map(m=>[[sport,m.ticker,m.quoteSide==='no'||m.side==='no'?'no':'yes'].join('|'),m]));let changed=0;
 for(const row of rows.filter(r=>r.sport===sport&&!r.result)){
  const m=index.get(row.id),start=Date.parse(row.eventTime),recorded=Date.parse(row.recordedAt);
  const quoteAt=Date.parse(m?.quotedAt||snapshot.updated_at||snapshot.generated_at);
  const source=m?.source||'Kalshi',entrySource=row.priceSource||'Kalshi';
  const point=finite(m?.point??m?.line);
  const ask=finite(sport==='nfl'?m?.quoteProbability:m?.yes_ask);
  if(!m||source!==entrySource||point!=null&&finite(row.point)!=null&&point!==finite(row.point)||!(ask>0&&ask<1)||!Number.isFinite(start)||!Number.isFinite(quoteAt)||quoteAt>now+300000||now-quoteAt>30*60000||quoteAt>=start||quoteAt<recorded||quoteAt<=Date.parse(row.latestQuoteAt||row.recordedAt)||['in','post','Live','Final'].includes(m.game_status))continue;
  row.latestAsk=ask;row.latestQuoteAt=new Date(quoteAt).toISOString();row.latestQuoteSource=source;row.priceMovement=ask-row.ask;
  // Never call a stale, post-start, or early quote the closing price.
  if(start-quoteAt<=15*60000){row.closingAsk=ask;row.closingQuoteAt=new Date(quoteAt).toISOString();row.closingQuoteSource=source+' near-start reference';row.clv=ask-row.ask;}
  changed++;
 }
 return changed;
}
module.exports={track};
