"""Surface attributed, dated source facts separately from opinions and forecasts.

No model/staking inputs are changed. Source failures clear the current evidence;
existing collectors' timestamps are retained instead of renewed by this adapter.
"""
import json
import re
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
from lxml import html
from update_analyst_consensus import instant, norm

SPORTS=('nba','nhl','mlb','ncaaf','ufc')
ALIASES={'GS':'GSW','NO':'NOP','NY':'NYK','SA':'SAS','PHO':'PHX','UTAH':'UTA','WSH':'WAS','NJD':'NJ','LAK':'LA','SJS':'SJ','TBL':'TB'}
HOSTS={'official.nba.com','ak-static.cms.nba.com','www.actionnetwork.com','vsin.com','stats.vsinstats.com','www.teamrankings.com','www.secsports.com'}

def get(url):
    u=urlparse(url)
    if u.scheme!='https' or u.hostname not in HOSTS:raise ValueError('Unexpected source host')
    with urlopen(Request(url,headers={'User-Agent':'sports-dashboard/1.0','Accept':'text/html,application/pdf'}),timeout=18) as r:
        if urlparse(r.url).hostname not in HOSTS:raise ValueError('Unexpected redirect')
        return r.read(8_000_000)

def load(name):
    try:return json.loads(Path('data/'+name+'.json').read_text())
    except (OSError,ValueError):return {}

def recent(at,now,hours=2):
    d=instant(at)
    return bool(d and now-timedelta(hours=hours)<=d<=now+timedelta(minutes=5))

def same_time(a,b):
    x,y=instant(a),instant(b)
    return bool(x and y and abs((x-y).total_seconds())<=300)

def code(s):return ALIASES.get(str(s).upper(),str(s).upper())

def health(name,url,now,state='available',note=''):
    return {'source':name,'sourceUrl':url,'checkedAt':now.isoformat(),'state':state,'note':note}

def fact(source,url,checked,label,value,hours=2,published=None):
    return {'source':source,'sourceUrl':url,'checkedAt':checked,'publishedAt':published,'label':label,'text':value,'maxAgeHours':hours}

def probe(name,url,now,read=get):
    try:
        raw=read(url)
        if not raw:raise ValueError('Empty source')
        # Availability of the page alone does not validate an opinion adapter.
        return health(name,url,now,'review_only','Public page available; automated pick collection not verified')
    except Exception:
        return health(name,url,now,'unavailable','Automated access unavailable; no opinions counted')

def report_links(raw,now):
    links=html.fromstring(raw).xpath('//a/@href');out=[]
    for url in links:
        m=re.fullmatch(r'https://ak-static.cms.nba.com/referee/injury/Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf',url)
        if not m:continue
        at=datetime.strptime(' '.join(m.groups()),'%Y-%m-%d %I %M %p').replace(tzinfo=ZoneInfo('America/New_York'))
        if now-timedelta(hours=24)<=at<=now+timedelta(minutes=5):out.append((at,url))
    return sorted(set(out),reverse=True)

def parse_report(text,games,now):
    """Read Poppler layout fields across variable-width pages; carry merged cells.
    Dates, both participants, team name, and game clock must all match uniquely.
    """
    day=None;clock=None;matchup=None;team=None;rows=[]
    team_names={t['name'] for g in games for t in g.get('teams',[])}
    for line in text.splitlines():
        if 'Injury Report:' in line or 'Player Name' in line or re.search(r'Page \d+ of',line):continue
        date=re.search(r'\b(\d{2}/\d{2}/\d{4})\b',line)
        time=re.search(r'\b(\d{2}:\d{2}) \(ET\)',line)
        pair=re.search(r'\b([A-Z]{2,4}@[A-Z]{2,4})\b',line)
        if date:day=date[1]
        if time:clock=time[1]
        if pair:matchup=pair[1];team=None
        status_match=re.search(r'\b(Out|Doubtful|Questionable|Probable|Available)\b(?=\s{2,}|$)',line)
        prefix=line[:status_match.start()] if status_match else line
        present=[n for n in team_names if re.search(r'(?<![A-Za-z])'+r'\s+'.join(re.escape(w) for w in n.split())+r'(?![A-Za-z])',prefix)]
        if len(present)==1:team=present[0]
        if not status_match:continue
        pieces=re.split(r'\s{2,}',prefix.strip())
        player=pieces[-1] if pieces else ''
        status=status_match[1]
        if not day or not clock or not matchup or not team or ',' not in player:continue
        candidates=[]
        for game in games:
            at=instant(game.get('startAt'))
            if not at or at<=now:continue
            local=at.astimezone(ZoneInfo('America/New_York'))
            if local.strftime('%m/%d/%Y')!=day or local.minute!=int(clock[3:]) or local.hour%12!=int(clock[:2])%12:continue
            if {code(t['code']) for t in game['teams']}!={code(x) for x in matchup.split('@')}:continue
            if norm(team) not in {norm(t['name']) for t in game['teams']}:continue
            candidates.append(game)
        if len(candidates)==1:rows.append({'eventId':candidates[0]['eventId'],'team':team,'player':player,'status':status})
    return rows

def official_nba(games,now,read=get):
    page='https://official.nba.com/nba-injury-report-'+str(now.year if now.month>=7 else now.year-1)+'-'+str((now.year+1 if now.month>=7 else now.year)%100).zfill(2)+'-season/'
    try:
        links=report_links(read(page),now)
        if not links:raise ValueError('No current report')
        at,url=links[0]
        with tempfile.TemporaryDirectory() as folder:
            pdf=Path(folder)/'report.pdf';txt=Path(folder)/'report.txt';pdf.write_bytes(read(url))
            subprocess.run(['pdftotext','-layout',str(pdf),str(txt)],check=True,timeout=20,capture_output=True)
            rows=parse_report(txt.read_text(),games,now)
        return rows,health('NBA Official',url,now),at.isoformat()
    except Exception:
        return [],health('NBA Official',page,now,'unavailable','Current official injury report unavailable'),None

def starter_facts(game,sport,cache,now):
    result=[]; grouped={}
    for r in cache.get('records',[]):
        if r.get('sport')!=sport or not recent(r.get('checked_at'),now) or not same_time(r.get('start_time'),game['startAt']):continue
        teams=[t for t in game['teams'] if code(t['code'])==code(r.get('team'))]
        if len(teams)!=1:continue
        role=r.get('role');players=r.get('players') or []
        if role not in ('lineup','availability','goalie','line','powerplay') or not players:continue
        url=r.get('source_url','');expected='www.rotowire.com' if sport=='nba' else 'www.dailyfaceoff.com'
        if urlparse(url).hostname!=expected:continue
        assignment=r.get('assignment')
        if role=='line' and assignment not in ('f1','d1'):continue
        if role=='powerplay' and assignment!='pp1':continue
        status=r.get('status','unknown')
        label={'lineup':'Starting lineup','availability':'Availability','goalie':'Starting goalie','line':'Line assignment','powerplay':'Power-play role'}[role]
        if role in ('lineup','goalie') and status!='confirmed':status='projected / unconfirmed'
        if assignment:label += ' · '+assignment.upper()
        key=(teams[0]['code'],role,assignment,r['checked_at'])
        grouped.setdefault(key,{'source':'RotoWire' if sport=='nba' else 'Daily Faceoff','url':url,'label':label,'checked':r['checked_at'],'published':r.get('announced_at'),'values':[]})['values'].append(', '.join(players[:5])+' — '+status)
    for key,g in grouped.items():
        value=key[0]+': '+'; '.join(dict.fromkeys(g['values']))
        result.append(fact(g['source'],g['url'],g['checked'],g['label'],value,published=g['published']))
    return result

def cached_facts(game,sport,data,now):
    rows=[]
    if sport=='mlb' and recent(data.get('updated_at'),now):
        matches=[g for g in data.get('games',[]) if same_time(g.get('gameDate'),game['startAt']) and {norm(g.get('home')),norm(g.get('away'))}=={norm(t['name']) for t in game['teams']}]
        if len(matches)==1:
            g=matches[0]
            for side in ('awayProbable','homeProbable'):
                pid=str((g.get(side) or {}).get('id') or '');p=data.get('pitchers',{}).get(pid,{});sc=p.get('recent30') or {}
                if sc.get('pitches',0)>=1 and p.get('name'):
                    values=[str(sc['pitches'])+' pitches / '+str(sc.get('days',30))+' days']
                    for k,label in [('kRate','K rate'),('bbRate','BB rate'),('hardHitRate','Hard-hit rate')]:
                        if isinstance(sc.get(k),(int,float)):values.append(label+' '+str(round(sc[k]*100,1))+'%')
                    rows.append(fact('Baseball Savant','https://baseballsavant.mlb.com/savant-player/'+pid,data['updated_at'],'Pitcher Statcast',p['name']+': '+' · '.join(values)))
    if sport=='ufc':
        for t in game['teams']:
            matches=[p for n,p in data.get('fighter_stats',{}).items() if norm(n)==norm(t['name']) and p.get('identity_verified') is True and recent(p.get('fetched_at'),now,48)]
            if len(matches)!=1:continue
            p=matches[0];values=[]
            for key,label in [('slpm','significant strikes landed/min'),('sapm','absorbed/min'),('td_avg','takedowns/15 min')]:
                if isinstance(p.get(key),(int,float)):values.append(str(p[key])+' '+label)
            if values:rows.append(fact('UFC.com',p['url'],p['fetched_at'],'Fighter statistics',t['name']+': '+' · '.join(values),48))
    return rows

def enrich(feeds,now,read=get,root=Path('data')):
    def local(name):
        try:return json.loads((root/(name+'.json')).read_text())
        except (OSError,ValueError):return {}
    starters=local('starter-status');contexts={s:local('kalshi-ufc' if s=='ufc' else s+'-context') for s in SPORTS}
    nba_rows,nba_check,published=official_nba(feeds['nba'].get('games',[]),now,read)
    attempts=[('Action Network','https://www.actionnetwork.com/'),('VSiN','https://stats.vsinstats.com/pageviewer/vsinstats.php?pageid=propicks&filter=sport&sportid=nba'),('TeamRankings','https://www.teamrankings.com/ncf/rankings/'),('SEC availability','https://www.secsports.com/fbreports')]
    with ThreadPoolExecutor(max_workers=4) as pool:checks=list(pool.map(lambda pair:probe(*pair,now,read),attempts))
    if checks[3]['state']=='review_only':checks[3]['note']='Interactive availability report; game-specific statuses require review. No starter confirmation inferred.'
    for sport in SPORTS:
        feed=feeds[sport]
        for g in feed.get('games',[]):
            rows=starter_facts(g,sport,starters,now) if sport in ('nba','nhl') else cached_facts(g,sport,contexts[sport],now)
            if sport=='nba':
                matched=[r for r in nba_rows if r['eventId']==g['eventId']]
                for team in g['teams']:
                    players=[r['player']+' — '+r['status'] for r in matched if norm(r['team'])==norm(team['name'])]
                    if players:rows.insert(0,fact('NBA Official',nba_check['sourceUrl'],now.isoformat(),'Official availability',team['code']+': '+'; '.join(players[:8]),2,published))
            g['additionalIntel']=rows
            sources=[dict(checks[0])]
            if sport=='nba':sources.append(nba_check)
            if sport=='ncaaf':sources.extend([checks[2],checks[3]])
            if sport=='nba':sources.append(checks[1])
            for source in ('RotoWire','Daily Faceoff','Baseball Savant','UFC.com'):
                found=[r for r in rows if r['source']==source]
                if found:sources.append(health(source,found[0]['sourceUrl'],now,'available','Matched, dated evidence'))
            g['additionalSourceChecks']=sources
        feed['additionalCollection']={'checkedAt':now.isoformat(),'sources':checks}
        feed['lastAttemptAt']=now.isoformat()
    return feeds

def main():
    now=datetime.now(timezone.utc);feeds={s:load('espn-intel-'+s) for s in SPORTS}
    enriched=enrich(feeds,now)
    for sport,feed in enriched.items():
        path=Path('data/espn-intel-'+sport+'.json');temp=path.with_suffix('.tmp');temp.write_text(json.dumps(feed,separators=(',',':'))+'\n');temp.replace(path)
        print(sport,'additional facts',sum(len(g.get('additionalIntel',[])) for g in feed.get('games',[])))
if __name__=='__main__':main()
