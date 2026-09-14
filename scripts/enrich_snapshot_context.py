import json, re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SNAPSHOT=Path('data/kalshi-nfl.json')
SCOREBOARD='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
SUMMARY='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary'
TEAMS='https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40'
TEAM_SCHEDULE='https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{}/schedule'


def fetch_json(url,timeout=20):
    req=Request(url,headers={'User-Agent':'NFL-parlay-generator/1.0','Accept':'application/json'})
    with urlopen(req,timeout=timeout) as r:return json.loads(r.read().decode())

def team_index():
    try: raw=fetch_json(TEAMS)
    except Exception as e:
        print('WARN teams',e);return {}
    entries=(((raw.get('sports') or [{}])[0].get('leagues') or [{}])[0].get('teams') or [])
    out={}
    for entry in entries:
        t=entry.get('team') or entry
        if t.get('displayName') and t.get('id'):out[t['displayName']]=str(t['id'])
    return out

def normalize_name(s): return re.sub(r'[^a-z0-9]','',str(s or '').lower())

def scoreboard(day):
    try:return fetch_json(SCOREBOARD+'?'+urlencode({'dates':day.replace('-',''),'limit':100}))
    except Exception as e:
        print('WARN scoreboard',day,e);return {}

def completed_form(team_id,season):
    try: raw=fetch_json(TEAM_SCHEDULE.format(team_id)+'?'+urlencode({'season':season}))
    except Exception as e:
        print('WARN schedule',team_id,e);return {'available':False}
    rows=[]
    for ev in raw.get('events') or []:
        try:
            comp=(ev.get('competitions') or [])[0]
            st=(ev.get('status') or {}).get('type') or {}
            if not st.get('completed'):continue
            cs=comp.get('competitors') or []
            mine=next((c for c in cs if str((c.get('team') or {}).get('id'))==str(team_id)),None)
            opp=next((c for c in cs if c is not mine),None)
            if not mine or not opp:continue
            pf=float(mine.get('score') or 0);pa=float(opp.get('score') or 0)
            rows.append({'date':ev.get('date'),'pf':pf,'pa':pa,'margin':pf-pa,'win':pf>pa})
        except Exception:continue
    rows=sorted(rows,key=lambda x:x.get('date') or '')[-5:]
    if not rows:return {'available':False}
    return {'available':True,'games':len(rows),'wins':sum(1 for r in rows if r['win']),'avg_points_for':round(sum(r['pf'] for r in rows)/len(rows),1),'avg_points_against':round(sum(r['pa'] for r in rows)/len(rows),1),'avg_margin':round(sum(r['margin'] for r in rows)/len(rows),1)}

def extract_event(raw,away,home):
    wanted={away,home}
    for ev in raw.get('events') or []:
        try:
            comp=(ev.get('competitions') or [])[0]
            names={((c.get('team') or {}).get('displayName')) for c in (comp.get('competitors') or [])}
            if wanted==names:return ev
        except Exception:continue
    return None

def injury_rows(summary):
    out=[]
    for team_block in summary.get('injuries') or []:
        team=(team_block.get('team') or {}).get('displayName') or (team_block.get('team') or {}).get('name')
        for row in team_block.get('injuries') or []:
            athlete=row.get('athlete') or {}
            status=str(row.get('status') or row.get('type') or '').lower()
            out.append({'player':athlete.get('displayName') or athlete.get('fullName'),'team':team,'status':status,'detail':row.get('details') or row.get('description') or ''})
    return out

def weather_context(comp,summary):
    w=comp.get('weather') or summary.get('weather') or {}
    venue=comp.get('venue') or {}
    indoor=venue.get('indoor')
    temp=w.get('temperature');wind=w.get('windSpeed') or w.get('wind')
    precip=w.get('precipitation') or w.get('precipitationProbability')
    return {'available':bool(w) or indoor is not None,'indoor':indoor,'temperature_f':temp,'wind_mph':wind,'precipitation':precip,'condition':w.get('displayValue') or w.get('conditionId') or w.get('condition')}

def main():
    if not SNAPSHOT.exists():raise SystemExit('Snapshot not found')
    data=json.loads(SNAPSHOT.read_text());ids=team_index();score_cache={};summary_cache={};form_cache={};now=datetime.now(timezone.utc)
    for g in data.get('games') or []:
        day=g.get('event_date')
        if day not in score_cache:score_cache[day]=scoreboard(day)
        ev=extract_event(score_cache[day],g.get('away'),g.get('home')) if day else None
        if not ev:
            g['context']={'available':False};continue
        comp=(ev.get('competitions') or [{}])[0];event_id=str(ev.get('id') or '')
        summary={}
        if event_id:
            try:
                if event_id not in summary_cache:summary_cache[event_id]=fetch_json(SUMMARY+'?'+urlencode({'event':event_id}))
                summary=summary_cache[event_id]
            except Exception as e:print('WARN summary',event_id,e)
        injuries=injury_rows(summary)
        season=datetime.fromisoformat(str(g.get('commence_time')).replace('Z','+00:00')).year if g.get('commence_time') else now.year
        form={}
        for team in (g.get('away'),g.get('home')):
            tid=ids.get(team)
            key=(tid,season)
            if key not in form_cache:form_cache[key]=completed_form(tid,season) if tid else {'available':False}
            form[team]=form_cache[key]
        player_market_counts={}
        for m in g.get('markets') or []:
            if m.get('player'):player_market_counts[m['player']]=player_market_counts.get(m['player'],0)+1
        for m in g.get('markets') or []:
            player=m.get('player')
            if not player:continue
            hit=next((x for x in injuries if normalize_name(x.get('player'))==normalize_name(player)),None)
            m['contextSignals']={'injury_status':hit.get('status') if hit else 'none_reported','injury_detail':hit.get('detail') if hit else '','market_breadth':player_market_counts.get(player,1)}
        g['context']={'available':True,'event_id':event_id,'weather':weather_context(comp,summary),'injuries':injuries,'recent_form':form,'updated_at':now.isoformat()}
    data['context_enrichment']={'updated_at':now.isoformat(),'source':'ESPN','games_enriched':sum(1 for g in data.get('games') or [] if (g.get('context') or {}).get('available'))}
    SNAPSHOT.write_text(json.dumps(data,separators=(',',':')))
    print('context enriched',data['context_enrichment']['games_enriched'],'games')

if __name__=='__main__':main()