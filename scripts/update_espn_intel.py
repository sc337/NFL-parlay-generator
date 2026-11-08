"""Automatic NFL ESPN lookup. Editorial scores remain separate from model inputs.

Discover current stories from the news feed and one level of related links;
join preview sections by ESPN event ID, never by fuzzy team names.
"""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/'
CONTENT = 'https://content.core.api.espn.com/v1/sports/news/'
OUTPUT = Path('data/espn-intel-nfl.json')


def instant(value):
    try:
        date = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return date if date.tzinfo else None
    except ValueError:
        return None


def recent(value, now, days=7):
    date = instant(value)
    return date is not None and now-timedelta(days=days) <= date <= now+timedelta(minutes=5)


def get(url):
    with urlopen(Request(url, headers={'User-Agent': 'NFL-parlay-generator/1.0', 'Accept': 'application/json'}), timeout=12) as response:
        return json.load(response)


def plain(value):
    return ' '.join(unescape(re.sub(r'<[^>]+>', ' ', str(value or ''))).split())


def link(article):
    url = article.get('links', {}).get('web', {}).get('href', '')
    parsed = urlparse(url)
    return url.replace('http://', 'https://', 1) if parsed.scheme in ('https', 'http') and (parsed.hostname == 'espn.com' or (parsed.hostname or '').endswith('.espn.com')) else ''


def article_meta(article):
    return {'title': plain(article.get('headline'))[:220], 'url': link(article),
            'publishedAt': article.get('published'), 'byline': plain(article.get('byline') or article.get('source') or 'ESPN')[:180]}


def candidate(article):
    title = article.get('headline', '').lower()
    return not article.get('premium') and bool(re.search(r'week\s+\d+', title)) and any(x in title for x in ('preview', 'prediction', 'picks'))


def discover(news, now, fetch=get):
    # Related-link discovery finds the weekly guide even after it leaves the news list.
    seeds = [a for a in news.get('articles', []) if candidate(a) and recent(a.get('published'), now)][:6]
    stories = {}; pending = {str(a['id']) for a in seeds if str(a.get('id', '')).isdigit()}
    def read(aid):
        try:
            data = fetch(CONTENT+aid)
            return next((a for a in data.get('headlines', []) if str(a.get('id')) == aid), {})
        except (OSError, ValueError):
            return {}
    for depth in range(2):
        with ThreadPoolExecutor(max_workers=4) as pool:
            found = list(pool.map(read, sorted(pending)[:8]))
        pending = set()
        for article in found:
            if not article or article.get('premium') or not recent(article.get('published'), now):
                continue
            stories[str(article['id'])] = article
            if depth == 0:
                pending.update(str(a['id']) for a in article.get('related', []) if candidate(a) and str(a.get('id', '')).isdigit() and str(a['id']) not in stories)
    return list(stories.values())


def expert_picks(article, event, now):
    if article.get('premium') or not recent(article.get('published'), now) or not link(article):
        return []
    if instant(article['published']) >= instant(event['date']):
        return []
    sections = re.split(r'(<h[23]\b[^>]*>.*?</h[23]>)', article.get('story', ''), flags=re.S | re.I)
    teams = {c['team']['name']: str(c['team']['id']) for c in event['competitions'][0]['competitors']}
    output = []
    for i in range(1, len(sections)-1, 2):
        # The exact game hyperlink is stronger than an article's multi-team tags.
        if not re.search(r'(?:gameId/|gameId=)'+re.escape(str(event['id']))+r'(?:["\'/?&#]|$)', sections[i]):
            continue
        text = plain(sections[i+1])
        pattern = r"([A-Za-zÀ-ž -]+?)[’']s pick:\s*([A-Za-z0-9 .'-]+?)\s+(\d{1,2}),\s*([A-Za-z0-9 .'-]+?)\s+(\d{1,2})"
        for match in re.finditer(pattern, text):
            author, a, sa, b, sb = match.groups()
            # Prefix prose may precede the first author; resolve against the actual byline.
            authors = [n.strip() for n in re.split(r',| and ', article.get('byline', ''))]
            surname = author.strip().split()[-1]
            named = [n for n in authors if n.split() and n.split()[-1] == surname]
            if len(named) != 1 or a not in teams or b not in teams or a == b:
                continue
            scores = {teams[a]: int(sa), teams[b]: int(sb)}
            output.append({'author': named[0], 'scores': scores, 'winnerId': teams[a] if int(sa)>int(sb) else teams[b] if int(sb)>int(sa) else None})
    return output


def normalize(event, summary, stories, now):
    comp = event['competitions'][0]; competitors = comp['competitors']
    teams = [{'id': str(c['team']['id']), 'name': c['team']['displayName'], 'code': c['team']['abbreviation'], 'side': c['homeAway']} for c in competitors]
    ids = {t['id'] for t in teams}
    header = summary.get('header', {})
    actual = (header.get('competitions') or [{}])[0]
    if str(header.get('id')) != str(event['id']) or {str(c.get('team', {}).get('id')) for c in actual.get('competitors', [])} != ids or instant(actual.get('date')) != instant(event['date']):
        raise ValueError('Summary identity mismatch')
    probabilities = []
    for side in ('homeTeam', 'awayTeam'):
        p = summary.get('predictor', {}).get(side, {})
        try:
            value = float(p['gameProjection'])
            if str(p.get('id')) in ids and 0 <= value <= 100:
                probabilities.append({'teamId': str(p['id']), 'percent': value})
        except (KeyError, TypeError, ValueError):
            pass
    if len(probabilities) != 2 or len({p['teamId'] for p in probabilities}) != 2 or not 98 <= sum(p['percent'] for p in probabilities) <= 100.5:
        probabilities = []
    stats = []
    for block in summary.get('boxscore', {}).get('teams', []):
        tid = str(block.get('team', {}).get('id'))
        if tid in ids:
            stats.append({'teamId': tid, 'values': {s['name']: plain(s.get('displayValue')) for s in block.get('statistics', []) if s.get('name') in ('totalPointsPerGame', 'totalPointsPerGameAllowed', 'rushingYardsPerGame', 'rushingYardsPerGameAllowed', 'passingYardsPerGame', 'passingYardsPerGameAllowed')}})
    injuries = []
    for block in summary.get('injuries', []):
        tid = str(block.get('team', {}).get('id'))
        if tid not in ids:
            continue
        for row in block.get('injuries', []):
            athlete = row.get('athlete', {})
            if not recent(row.get('date'), now, 14) or not athlete.get('displayName') or not isinstance(row.get('status'), str):
                continue
            injuries.append({'teamId': tid, 'player': athlete['displayName'], 'position': athlete.get('position', {}).get('abbreviation', ''), 'status': row['status'], 'reportedAt': row['date']})
    injuries.sort(key=lambda r: (r['position'] != 'QB', r['position'] not in ('RB', 'WR', 'TE'), r['player']))
    picks = []; source = None
    for article in sorted(stories, key=lambda a: a.get('published', ''), reverse=True):
        picks = expert_picks(article, event, now)
        if picks:
            source = article_meta(article); break
    preview = summary.get('article', {})
    preview = article_meta(preview) if str(preview.get('gameId')) == str(event['id']) and not preview.get('premium') and recent(preview.get('published'), now) and link(preview) else None
    return {'eventId': str(event['id']), 'startAt': event['date'], 'teams': teams, 'checkedAt': now.isoformat(), 'status': 'ok',
            'probabilities': probabilities, 'statistics': stats, 'injuries': injuries, 'expertPicks': picks, 'expertSource': source,
            'preview': preview, 'url': 'https://www.espn.com/nfl/game/_/gameId/'+str(event['id'])}


def build(previous, now, fetch=get):
    try:
        board = fetch(BASE+'scoreboard')
        if not isinstance(board.get('events'), list):
            raise ValueError('Invalid scoreboard')
    except (OSError, ValueError):
        return {**previous, 'lastAttemptAt': now.isoformat(), 'status': 'unavailable'}
    news_ok = True
    try:
        news = fetch(BASE+'news?limit=50')
        stories = discover(news, now, fetch)
    except (OSError, ValueError):
        stories = []; news_ok = False
    events = [e for e in board['events'] if instant(e.get('date')) and now < instant(e['date']) <= now+timedelta(days=8) and not e['competitions'][0].get('status', {}).get('type', {}).get('completed')][:20]
    old = {g['eventId']: g for g in previous.get('games', [])}
    def one(event):
        try:
            return normalize(event, fetch(BASE+'summary?event='+str(event['id'])), stories, now)
        except (OSError, ValueError, KeyError, TypeError):
            cached = old.get(str(event['id']))
            ids = {str(c['team']['id']) for c in event['competitions'][0]['competitors']}
            if cached and instant(cached.get('startAt')) == instant(event['date']) and {t['id'] for t in cached.get('teams', [])} == ids:
                return {**cached, 'status': 'unavailable'}  # Never renew cached checkedAt.
            return None
    with ThreadPoolExecutor(max_workers=4) as pool:
        games = [g for g in pool.map(one, events) if g]
    return {'schemaVersion': 1, 'updatedAt': now.isoformat(), 'lastAttemptAt': now.isoformat(),
            'status': 'ok' if len(games) == len(events) and all(g['status']=='ok' for g in games) else 'partial',
            'editorialStatus': 'available' if stories else 'unavailable' if not news_ok else 'no-current-stories',
            'games': games}


def main():
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {'schemaVersion': 1, 'games': []}
    result = build(previous, datetime.now(timezone.utc))
    OUTPUT.parent.mkdir(exist_ok=True)
    temp = OUTPUT.with_suffix('.tmp'); temp.write_text(json.dumps(result, separators=(',', ':'))+'\n'); temp.replace(OUTPUT)
    print('ESPN lookup:', result['status'], len(result['games']), 'games;', sum(bool(g.get('expertPicks')) for g in result['games']), 'with expert picks')


if __name__ == '__main__':
    main()
