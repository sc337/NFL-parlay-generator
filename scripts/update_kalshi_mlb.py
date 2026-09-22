import json, re, urllib.request
from datetime import datetime, timezone
API='https://api.elections.kalshi.com/trade-api/v2'
SERIES=['KXMLB','KXMLBSPREAD','KXMLBTOTAL','KXMLBKS','KXMLBHIT','KXMLBHR','KXMLBRBI','KXMLBHRR','KXMLBTB','KXMLBTEAMTOTAL']
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=20) as r:return json.load(r)
def prob(m):
 y=m.get('yes_ask') or m.get('yes_bid') or m.get('last_price') or 0
 return float(y)/100 if y else 0
def main():
 out=[]; now=datetime.now(timezone.utc)
 for s in SERIES:
  try:
   d=get(f'{API}/markets?series_ticker={s}&limit=1000')
  except Exception: continue
  for m in d.get('markets',[]):
   if m.get('status') in ('settled','closed','finalized'): continue
   p=prob(m)
   if not(.02<p<.98):continue
   title=m.get('title') or ''; sub=m.get('subtitle') or ''; label=sub or title
   kind='moneyline' if s=='KXMLB' else 'spread' if s=='KXMLBSPREAD' else 'total' if s in ('KXMLBTOTAL','KXMLBTEAMTOTAL') else 'strikeouts' if s=='KXMLBKS' else 'hits' if s=='KXMLBHIT' else 'home_runs' if s=='KXMLBHR' else 'rbi' if s=='KXMLBRBI' else 'total_bases' if s=='KXMLBTB' else 'hrr'
   out.append({'ticker':m.get('ticker'),'event_ticker':m.get('event_ticker'),'series':s,'kind':kind,'title':title,'label':label,'probability':p,'volume':m.get('volume') or 0,'open_interest':m.get('open_interest') or 0,'spread':((m.get('yes_ask') or 0)-(m.get('yes_bid') or 0))/100 if m.get('yes_ask') and m.get('yes_bid') else None,'close_time':m.get('close_time')})
 json.dump({'generated_at':now.isoformat(),'markets':out},open('data/kalshi-mlb.json','w'),indent=2)
 print('MLB markets',len(out))
if __name__=='__main__':main()
