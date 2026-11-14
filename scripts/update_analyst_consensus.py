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
    return u.scheme == 'https' and u.hostname in ('www.covers.com', 'covers.com')


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


def parse_page(raw, sport, games, now):
    tree = html.fromstring(raw)
    for node in tree.xpath('//script|//style'):
        node.drop_tree()
    output = []
    groups = tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," picks-card ")]')
    for group in groups:
        headers = group.xpath('.//*[contains(@class,"picks-card-header")]')
        if not headers:
            continue
        header = headers[0]
        names = [s.removesuffix(' image thumbnail') for s in header.xpath('.//img/@alt') if s.endswith(' image thumbnail')]
        if sport == 'ufc':
            headings = header.xpath('.//h3')
            names = re.split(r'\s+vs\s+', text(headings[0])) if headings else []
        if len(names) != 2 or norm(names[0]) == norm(names[1]):
            continue
        date = re.search(r'\b([A-Z][a-z]{2}) (\d{1,2})\s*•(?:\s*(\d{1,2}:\d{2} [AP]M) ET)?', text(header))
        if not date or sport != 'ufc' and not date[3]:
            continue
        # Resolve year against upcoming verified schedules, not the machine's year.
        matches = []
        for game in games:
            at = instant(game.get('startAt'))
            if not at or not now < at <= now+timedelta(days=8) or game.get('status') != 'ok':
                continue
            if {norm(t['name']) for t in game.get('teams', [])} != {norm(n) for n in names}:
                continue
            local = at.astimezone(ET)
            if local.strftime('%b') != date[1] or local.day != int(date[2]):
                continue
            if date[3]:
                scheduled = datetime.strptime(date[3], '%I:%M %p')
                if abs((local.hour*60+local.minute)-(scheduled.hour*60+scheduled.minute)) > 5:
                    continue
            matches.append(game)
        if len(matches) != 1:
            continue
        game = matches[0]
        for card in group.xpath('.//*[@data-pick and contains(@class,"pick-cards-expert-component")]'):
            authors = card.xpath('.//a[contains(@href,"/writers/")]')
            titles = card.xpath('.//div[contains(@class,"fw-bold") and contains(@class,"small")]')
            ages = card.xpath('.//span[contains(@class,"badge-style-time-only")]')
            if not authors or not titles or not ages:
                continue
            author = text(authors[0])
            published = re.sub(r'^Pick made:\s*', '', text(ages[0]))
            if not author or not source_age(published):
                continue
            title = titles[0]
            for node in title.xpath('.//span[contains(@class,"ProfileAvatar")]'):
                node.drop_tree()
            label = text(title)
            kind = card.get('data-pick-types', '')
            selected_team = card.get('data-pick-teams', '')
            participant = next((t for t in game['teams'] if norm(t['name']) == norm(selected_team)), None)
            odds = re.search(r'\(([+-]\d{3,6})\)$', label)
            if not odds:
                continue
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
                supported = {'Total':'total', 'Points Scored':'points', 'Total Rebounds':'rebounds', 'Assists':'assists', '3-Pointers Made':'threes', 'Points':'player_points', 'Goals Scored':'goals', 'Shots On Goal':'shots', 'Rushing Yards':'rushing_yards', 'Passing Yards':'passing_yards', 'Receiving Yards':'receiving_yards', 'Strikeouts':'strikeouts', 'Hits':'hits', 'Total Bases':'total_bases', 'Runs Batted In':'rbi'}
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
            article = next((u for u in reversed(urls) if safe_url(u) and '/'+sport+'/' in u and '/sport/' not in u), None)
            output.append({'eventId':game['eventId'], 'startAt':game['startAt'], 'sport':sport, 'author':author,
                'source':'Covers', 'sourceUrl':article or 'https://www.covers.com/picks/'+sport,
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


def enrich(feed, sport, now, get=fetch):
    result={**feed,'games':[{**g,'analystConsensus':[]} for g in feed.get('games',[])]}
    status='ok'
    try:
        raw=get('https://www.covers.com/picks/'+sport)
        page=html.fromstring(raw)
        canonical=page.xpath('//link[@rel="canonical"]/@href')
        expected='https://www.covers.com/picks/'+sport
        if not any(u.rstrip('/')==expected for u in canonical) or not ('ExpertPicks' in raw or 'pick-cards-expert-component' in raw):
            raise ValueError('Unrecognized source page')
        rows=parse_page(raw,sport,result['games'],now)
    except Exception:
        rows=[];status='unavailable'
    for game in result['games']:
        game['analystConsensus']=consensus([r for r in rows if r['eventId']==game['eventId']])
        game['analystCoverage']={'source':'Covers','status':status,'checkedAt':now.isoformat()}
    result['analystCollection']={'source':'Covers','status':status,'checkedAt':now.isoformat(),'picks':len(rows)}
    # Publication helper uses the collection attempt, independently of ESPN data ages.
    result['lastAttemptAt']=now.isoformat()
    return result


def main():
    now=datetime.now(timezone.utc)
    def update(sport):
        path=Path('data/espn-intel-'+sport+'.json')
        feed=json.loads(path.read_text())
        result=enrich(feed,sport,now)
        temp=path.with_suffix('.tmp');temp.write_text(json.dumps(result,separators=(',',':'))+'\n');temp.replace(path)
        print(sport,result['analystCollection'])
    with ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(update,SPORTS))


if __name__=='__main__':main()
