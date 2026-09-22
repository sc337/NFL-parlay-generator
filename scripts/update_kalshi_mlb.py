import json, re, urllib.request
from datetime import datetime, timezone
API='https://external-api.kalshi.com/trade-api/v2'
SERIES=['KXMLBGAME','KXMLBSPREAD','KXMLBTOTAL','KXMLBKS','KXMLBHIT','KXMLBHR','KXMLBRBI','KXMLBHRR','KXMLBTB','KXMLBTEAMTOTAL']
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=20) as r:return json.load(r)
def num(m,*keys):
 for k in keys:
  v=m.get(k)
  if v not in (None,''):
   try:return float(v)
   except:pass
 return 0.0
def prob(m):
 cents=num(m,'yes_ask','yes_bid','last_price')
 if cents:return cents/100
 dollars=num(m,'yes_ask_dollars','yes_bid_dollars','last_price_dollars')
 return dollars if dollars else 0
def main():
 out=[]; now=datetime.now(timezone.utc)
 for s in SERIES:
  try:
   d=get(f'{API}/markets?series_ticker={s}&limit=1000')
  except Exception as e:
   print('MLB series fetch failed',s,repr(e)); continue
  print('MLB series',s,'raw',len(d.get('markets',[])))
  for m in d.get('markets',[]):
   if m.get('status') in ('settled','closed','finalized'): continue
   p=prob(m)
   if not(.02<p<.98):continue
   title=m.get('title') or ''; sub=m.get('subtitle') or ''; label=sub or title
   kind='moneyline' if s=='KXMLBGAME' else 'spread' if s=='KXMLBSPREAD' else 'total' if s in ('KXMLBTOTAL','KXMLBTEAMTOTAL') else 'strikeouts' if s=='KXMLBKS' else 'hits' if s=='KXMLBHIT' else 'home_runs' if s=='KXMLBHR' else 'rbi' if s=='KXMLBRBI' else 'total_bases' if s=='KXMLBTB' else 'hrr'
   out.append({'ticker':m.get('ticker'),'event_ticker':m.get('event_ticker'),'series':s,'kind':kind,'title':title,'label':label,'probability':p,'volume':num(m,'volume_fp','volume'),'open_interest':num(m,'open_interest_fp','open_interest'),'spread':((num(m,'yes_ask','yes_ask_dollars')/ (100 if m.get('yes_ask') not in (None,'') else 1))-(num(m,'yes_bid','yes_bid_dollars')/(100 if m.get('yes_bid') not in (None,'') else 1))) if (m.get('yes_ask') not in (None,'') or m.get('yes_ask_dollars') not in (None,'')) and (m.get('yes_bid') not in (None,'') or m.get('yes_bid_dollars') not in (None,'')) else None,'close_time':m.get('close_time')})
 json.dump({'generated_at':now.isoformat(),'markets':out},open('data/kalshi-mlb.json','w'),indent=2)
 print('MLB markets',len(out))
if __name__=='__main__':main()
