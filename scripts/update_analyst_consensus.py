"""Collect named public Covers opinions. Research only; never a model input.

Exact participants + scheduled time (or unique UFC pairing/date) are required.
Only compact selection facts are retained, never article prose or computer picks.
"""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlparse, urljoin
from zoneinfo import ZoneInfo
from lxml import html

SPORTS = ('nba', 'nhl', 'mlb', 'ncaaf', 'ufc')
ET = ZoneInfo('America/New_York')
SBR_SPORT = {'nba':'nba', 'nhl':'nhl', 'mlb':'mlb', 'ncaaf':'college-football', 'ufc':'ufc'}


def instant(value):
    try:
        d = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return d if d.tzinfo else None
    except ValueError:
        return None


def norm(value):
    return re.sub(r'[^a-z0-9]', '', str(value).lower())


def text(node):
    return ' '.join(node.text_content().split())


def safe_url(url):
    u = urlparse(url)
    return u.scheme == 'https' and u.hostname in ('www.covers.com', 'covers.com', 'www.sportsbookreview.com')


def fetch(url):
    if not safe_url(url):
        raise ValueError('Unexpected analyst host')
    with urlopen(Request(url, headers={'User-Agent':'sports-dashboard/1.0', 'Accept':'text/html'}), timeout=20) as response:
        if not safe_url(response.url):
            raise ValueError('Unexpected redirect')
        return response.read(4_000_000).decode('utf-8')


def source_age(label):
    """Relative publication labels remain verbatim; never invent exact timestamps."""
    label = label.lower().strip()
    if label in ('just now', 'today', 'a minute ago', 'an hour ago', 'yesterday'):
        return True
    m = re.fullmatch(r'(\d+) (minute|hour|day)s? ago', label)
    return bool(m and int(m[1]) <= {'minute':120, 'hour':168, 'day':7}[m[2]])


def parse_page(raw, sport, games, now, diagnostics=None, source='Covers'):
    diagnostics = diagnostics if diagnostics is not None else {}
    def reject(reason):
        reasons=diagnostics.setdefault("rejected",{})
        reasons[reason]=reasons.get(reason,0)+1
    tree = html.fromstring(raw)
    for node in tree.xpath('//script|//style'):
        node.drop_tree()
    output = []
    groups = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," picks-card ")]')
    diagnostics["pageGroups"]=len(groups)
    diagnostics["expertCards"]=len(tree.xpath('//*[@data-pick and contains(@class,"pick-cards-expert-component")]'))
    for group in groups:
        headers = group.xpath('.//*[contains(@class,"picks-card-header")]')
        if not headers:
            reject("missing_header");continue
        header = headers[0]
        names = [s.removesuffix(' image thumbnail') for s in header.xpath('.//img/@alt') if s.endswith(' image thumbnail')]
        if sport == 'ufc':
            headings = header.xpath('.//h3')
            names = re.split(r'\s+vs\s+', text(headings[0])) if headings else []
        if len(names) != 2 or norm(names[0]) == norm(names[1]):
            reject('participant_labels');continue
        date = re.search(r'\b([A-Z][a-z]{2}) (\d{1,2})\s*•(?:\s*(\d{1,2}:\d{2} [AP]M) ET)?', text(header))
        relative = re.search(r'\b(Today|Tomorrow)\s*•\s*(\d{1,2}:\d{2} [AP]M) ET', text(header))
        if not date and not relative or sport != 'ufc' and not (date and date[3] or relative):
            reject('schedule_label');continue
        # Resolve year against upcoming verified schedules, not the machine's year.
        matches = []
        for game in games:
            at = instant(game.get('startAt'))
            if not at or not now < at <= now+timedelta(days=8) or game.get('status') != 'ok':
                continue
            if {norm(t['name']) for t in game.get('teams', [])} != {norm(n) for n in names}:
                continue
            local = at.astimezone(ET)
            day = now.astimezone(ET).date() + timedelta(days=int(relative[1]=='Tomorrow')) if relative else None
            if date and (local.strftime('%b') != date[1] or local.day != int(date[2])) or relative and local.date() != day:
                continue
            clock = date[3] if date else relative[2]
            if clock:
                scheduled = datetime.strptime(clock, '%I:%M %p')
                if abs((local.hour*60+local.minute)-(scheduled.hour*60+scheduled.minute)) > 5:
                    continue
            matches.append(game)
        if len(matches) != 1:
            reject('unmatched_schedule')
            samples=diagnostics.setdefault('scheduleSamples',[])
            if len(samples)<3:samples.append({'participants':names,'dateLabel':(date or relative)[0], 'matchingParticipantGames':[{'startAt':g['startAt'],'status':g.get('status')} for g in games if {norm(t['name']) for t in g.get('teams',[])}=={norm(n) for n in names}][:2]})
            continue
        game = matches[0]
        for card in group.xpath('.//*[@data-pick and contains(@class,"pick-cards-expert-component")]'):
            authors = card.xpath('.//a[contains(@href,"/writers/")]')
            titles = card.xpath('.//div[contains(@class,"fw-bold") and contains(@class,"small")]')
            ages = card.xpath('.//span[contains(@class,"badge-style-time-only")]')
            if not authors or not titles or source=='Covers' and not ages:
                reject('missing_author_selection_or_publication');continue
            author = text(authors[0])
            published = re.sub(r'^Pick made:\s*', '', text(ages[0])) if ages else 'Time not shown'
            if not author or source=='Covers' and not source_age(published):
                reject('publication_label');continue
            title = titles[0]
            for node in title.xpath('.//span[contains(@class,"ProfileAvatar")]'):
                node.drop_tree()
            label = text(title)
            kind = card.get('data-pick-types', '')
            selected_team = card.get('data-pick-teams', '')
            participant = next((t for t in game['teams'] if norm(t['name']) == norm(selected_team)), None)
            odds = re.search(r'\(([+-]\d{3,6})\)$', label)
            if not odds:
                reject('selection_odds');continue
            selection = label[:odds.start()].strip()
            player = None; line = None; side = None; period = 'game'
            if kind in ('Moneyline', 'Fight Winner'):
                if sport == 'ufc':
                    participant = next((t for t in game['teams'] if norm(t['name']) == norm(selection)), None)
                if not participant:
                    continue
                market = 'moneyline'; side = participant['id']; selection = participant['name']+' ML'
            elif kind == 'Spread':
                m = re.search(r'([+-]\d+(?:\.\d+)?)$', selection)
                if not participant or not m:
                    continue
                market = 'spread'; side = participant['id']; line = float(m[1])
                selection = participant['name']+' '+format(line, '+g')
            else:
                # Only explicit over/under lines can be aggregated. Specials and
                # quarter/half bets stay out rather than borrowing full-game labels.
                supported = {'Total':'total', 'Points Scored':'points', 'Total Rebounds':'rebounds', 'Assists':'assists', '3-Pointers Made':'threes', 'Points':'player_points', 'Total Points, Rebounds, and Assists':'pra', 'Goals Scored':'goals', 'Shots On Goal':'shots', 'Rushing Yards':'rushing_yards', 'Passing Yards':'passing_yards', 'Receiving Yards':'receiving_yards', 'Strikeouts':'strikeouts', 'Hits':'hits', 'Total Bases':'total_bases', 'Runs Batted In':'rbi'}
                market = supported.get(kind)
                if sport == 'ufc' and re.fullmatch(r'\d+(?:\.\d+)? Total Rounds', kind):
                    market = 'total_rounds'
                m = re.fullmatch(r'(.*?)\s*([ou])\s*(\d+(?:\.\d+)?)(?:\s+.*)?', selection, re.I)
                if not market or not m:
                    continue
                side = 'over' if m[2].lower() == 'o' else 'under'; line = float(m[3])
                if market not in ('total', 'total_rounds'):
                    player = m[1].strip()
                    if not player or not participant:
                        continue
                selection = (player+' ' if player else '')+side.title()+' '+format(line,'g')+' '+(kind if player else 'rounds' if sport=='ufc' else '')
            urls = card.xpath('.//a[contains(@href,"covers.com/" )]/@href')
            article = next((u for u in reversed(urls) if safe_url(u) and '/'+sport+'/' in u and '/sport/' not in u), None) if source=='Covers' else None
            source_url=article or ('https://www.covers.com/picks/'+sport if source=='Covers' else 'https://www.sportsbookreview.com/picks/'+SBR_SPORT[sport]+'/')
            output.append({'eventId':game['eventId'], 'startAt':game['startAt'], 'sport':sport, 'author':author,
                'source':source, 'sourceUrl':source_url,
                'publishedLabel':published, 'publishedAt':None, 'checkedAt':now.isoformat(),
                'market':market, 'period':period, 'player':player, 'teamId':participant['id'] if participant else None,
                'line':line, 'side':side, 'selection':selection.strip(), 'odds':int(odds[1])})
    return output


def consensus(rows):
    groups = {}
    # Latest observed pick from each analyst at each exact market/line. If a
    # source simultaneously conflicts, omit that analyst instead of voting twice.
    for row in rows:
        key = (row['market'], row['period'], norm(row.get('player') or ''), abs(row['line']) if row['market']=='spread' else row['line'])
        groups.setdefault(key, {}).setdefault(norm(row['author']), []).append(row)
    result = []
    for key, authors in sorted(groups.items(), key=lambda x:str(x[0])):
        valid=[]
        for opinions in authors.values():
            choices={(r['side'],r['line']) for r in opinions}
            if len(choices)==1: valid.append(opinions[0])
        if not valid:continue
        votes={}
        for row in valid:
            vote=(row['side'],row['line']);votes[vote]=votes.get(vote,0)+1
        best=max(votes.values()); winners=[v for v,n in votes.items() if n==best]
        label='Single opinion' if len(valid)==1 else 'Split opinions' if len(winners)>1 else 'Strong agreement' if len(valid)>=3 and best/len(valid)>=.75 else 'Agreement' if best==len(valid) else 'Mixed opinions'
        leader=next((r['selection'] for r in valid if (r['side'],r['line'])==winners[0]),None) if len(winners)==1 else None
        result.append({'market':key[0], 'period':key[1], 'player':valid[0].get('player'), 'line':key[3], 'label':label, 'agree':best, 'total':len(valid), 'selection':leader, 'picks':valid})
    return result


def ufc_schedule_games(snapshot, now):
    """Use the dashboard's independently verified ESPN fight schedule when its
    separate matchup-intel collector has no bout entries. Never use expiry as start."""
    slate=snapshot.get('slate') or {}
    checked=instant(slate.get('updated_at'))
    if not checked or not now-timedelta(hours=2)<=checked<=now+timedelta(minutes=5):
        return []
    games=[]
    for row in slate.get('games',[]):
        at=instant(row.get('game_time'))
        names=[row.get('fighter1'),row.get('fighter2')]
        if row.get('source')!='ESPN' or row.get('game_status')!='pre' or not row.get('espn_game_id') or not at or not now<at<=now+timedelta(days=8) or not all(names) or norm(names[0])==norm(names[1]):
            continue
        games.append({'sport':'ufc','eventId':'schedule:'+str(row['espn_game_id']), 'startAt':row['game_time'],
            'checkedAt':slate['updated_at'],'status':'ok','eventName':row.get('card_name','UFC'),
            'teams':[{'id':'ufc:'+norm(n),'name':n,'code':n,'side':side} for n,side in zip(names,('away','home'))],
            'probabilities':[],'statistics':[],'injuries':[],'expertPicks':[], 'url':'https://www.espn.com/mma/schedule'})
    return games


def enrich(feed, sport, now, get=fetch, schedule=None):
    result={**feed,'games':[{**g,'analystConsensus':[]} for g in feed.get('games',[])]}
    if sport=='ufc' and schedule:
        existing={(frozenset(norm(t['name']) for t in g['teams']),instant(g['startAt'])) for g in result['games']}
        result['games'] += [g for g in ufc_schedule_games(schedule,now) if (frozenset(norm(t['name']) for t in g['teams']),instant(g['startAt'])) not in existing]
    rows=[];sources={}
    for source,url in (('Covers','https://www.covers.com/picks/'+sport),('Sportsbook Review','https://www.sportsbookreview.com/picks/'+SBR_SPORT[sport]+'/')):
        diagnostics={};status='ok'
        try:
            raw=get(url)
            page=html.fromstring(raw)
            canonical=page.xpath('//link[@rel="canonical"]/@href')
            if not any(u.rstrip('/')==url.rstrip('/') for u in canonical) or not ('ExpertPicks' in raw or 'pick-cards-expert-component' in raw):
                raise ValueError('Unrecognized source page')
            selected=parse_page(raw,sport,result['games'],now,diagnostics,source=source)
            rows.extend(selected)
        except Exception:
            selected=[];status='unavailable'
        sources[source]={'status':status,'picks':len(selected),'diagnostics':diagnostics}
    status='ok' if any(v['status']=='ok' for v in sources.values()) else 'unavailable'
    for game in result['games']:
        game['analystConsensus']=consensus([r for r in rows if r['eventId']==game['eventId']])
        game['analystCoverage']={'source':'Covers + Sportsbook Review','status':status,'checkedAt':now.isoformat(),'sources':{k:v['status'] for k,v in sources.items()}}
    result['analystCollection']={'source':'Covers + Sportsbook Review','status':status,'checkedAt':now.isoformat(),'picks':len(rows),'sources':sources}
    # Publication helper uses the collection attempt, independently of ESPN data ages.
    result['lastAttemptAt']=now.isoformat()
    return result


def main():
    now=datetime.now(timezone.utc)
    def update(sport):
        path=Path('data/espn-intel-'+sport+'.json')
        feed=json.loads(path.read_text())
        schedule_path=Path('data/kalshi-ufc.json')
        schedule=json.loads(schedule_path.read_text()) if sport=='ufc' and schedule_path.exists() else None
        result=enrich(feed,sport,now,schedule=schedule)
        temp=path.with_suffix('.tmp');temp.write_text(json.dumps(result,separators=(',',':'))+'\n');temp.replace(path)
        print(sport,result['analystCollection'])
    with ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(update,SPORTS))


if __name__=='__main__':main()
