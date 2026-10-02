import json, re, math, urllib.request, urllib.parse
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
   except (ValueError,TypeError):pass
 return 0.0
def price(m,side,action):
 for field,scale in ((side+'_'+action+'_dollars',1),(side+'_'+action,100)):
  if m.get(field) not in (None,''):
   try:value=float(m[field])/scale
   except (ValueError,TypeError):return None
   return value if math.isfinite(value) and 0<value<1 else None
 # The opposite bid is an executable ask, unlike 1 - the opposite ask.
 opposite='no' if side=='yes' else 'yes'
 for field,scale in ((opposite+'_'+('bid' if action=='ask' else 'ask')+'_dollars',1),
                     (opposite+'_'+('bid' if action=='ask' else 'ask'),100)):
  if m.get(field) not in (None,''):
   try:value=float(m[field])/scale
   except (ValueError,TypeError):return None
   return round(1-value,8) if math.isfinite(value) and 0<value<1 else None
 return None

def opposite_total(text):
 """Only half-run totals have an exact sportsbook Over/Under complement."""
 match=re.search(r'\b(over|under)\s+(\d+(?:\.\d+)?)\s+runs?\b',text,re.I)
 if not match or abs(float(match[2])%1-.5)>.001:return None
 return text[:match.start(1)]+('Under' if match[1].lower()=='over' else 'Over')+text[match.end(1):]

def normalize_market(m,series):
 if m.get('status') in ('settled','closed','finalized'):return []
 title=m.get('title') or '';label=m.get('subtitle') or title
 kind='moneyline' if series=='KXMLBGAME' else 'spread' if series=='KXMLBSPREAD' else 'total' if series in ('KXMLBTOTAL','KXMLBTEAMTOTAL') else 'strikeouts' if series=='KXMLBKS' else 'hits' if series=='KXMLBHIT' else 'home_runs' if series=='KXMLBHR' else 'rbi' if series=='KXMLBRBI' else 'total_bases' if series=='KXMLBTB' else 'hrr'
 selections=[('yes',title,label)]
 inverse=opposite_total(title) if kind=='total' else None
 if inverse:selections.append(('no',inverse,opposite_total(label) or inverse))
 out=[]
 for side,selected_title,selected_label in selections:
  ask=price(m,side,'ask');bid=price(m,side,'bid')
  if ask is None or not .02<ask<.98:continue
  spread=round(ask-bid,8) if bid is not None else None
  if spread is not None and spread<0:continue
  out.append({'ticker':m.get('ticker'),'event_ticker':m.get('event_ticker'),'series':series,'kind':kind,
   'side':side,'quoteSide':side,'selection_id':str(m.get('ticker') or '')+'|'+side,
   'contract_title':title,'title':selected_title,'label':selected_label,'probability':ask,
   # These normalized price fields always refer to the selected side.
   'yes_bid':bid,'yes_ask':ask,'volume':num(m,'volume_fp','volume'),
   'open_interest':num(m,'open_interest_fp','open_interest'),'spread':spread,'close_time':m.get('close_time')})
 return out

def main():
 out=[];now=datetime.now(timezone.utc)
 for series in SERIES:
  cursor=None
  while True:
   params={'series_ticker':series,'status':'open','limit':1000,'mve_filter':'exclude'}
   if cursor:params['cursor']=cursor
   try:d=get(f'{API}/markets?'+urllib.parse.urlencode(params))
   except Exception as e:
    print('MLB series fetch failed',series,repr(e));break
   for market in d.get('markets',[]):out.extend(normalize_market(market,series))
   next_cursor=d.get('cursor')
   if not next_cursor or next_cursor==cursor:break
   cursor=next_cursor
 json.dump({'generated_at':now.isoformat(),'markets':out},open('data/kalshi-mlb.json','w'),indent=2)
 print('MLB selections',len(out),'under totals',sum(m['kind']=='total' and bool(re.search(r'\bunder\b',m['title'],re.I)) for m in out))
if __name__=='__main__':main()
