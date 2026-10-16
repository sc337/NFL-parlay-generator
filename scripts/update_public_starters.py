"""Read public HTML only; never call private endpoints or infer confirmations.

NBA: RotoWire's dated, public lineup cards. NHL: Daily Faceoff's public
page hydration (goalies and reported line combos). College confirmations are
sourced manually: availability reports and depth charts alone are insufficient.
Only normalized names/status/evidence metadata are retained, not article text.
"""
import argparse
import json
import re
import time
import unicodedata
from datetime import datetime, timezone, timedelta
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
from zoneinfo import ZoneInfo

AGENT = 'SportsDashboardStarterCheck/1.0 (+https://github.com/sc337/NFL-parlay-generator)'
ROOT = Path(__file__).resolve().parents[1]
TARGET = 'data/starter-status.json'
RW = 'https://www.rotowire.com/basketball/nba-lineups.php'
DFO = 'https://www.dailyfaceoff.com'
ALIASES = {'NY': 'NYK', 'NO': 'NOP', 'SA': 'SAS', 'GS': 'GSW', 'PHO': 'PHX',
           'UTAH': 'UTA', 'WSH': 'WAS', 'LAK': 'LA', 'NJD': 'NJ', 'SJS': 'SJ', 'TBL': 'TB'}


def key(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value or '')).casefold() if c.isalnum() and not unicodedata.combining(c))


def instant(value):
    try:
        result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return result.astimezone(timezone.utc) if result.tzinfo else None
    except ValueError:
        return None


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children, self.parts = tag, dict(attrs), [], []

    def has(self, cls):
        return cls in self.attrs.get('class', '').split()

    def find(self, cls):
        return [n for n in self.walk() if n.has(cls)]

    def walk(self):
        for child in self.children:
            yield child
            yield from child.walk()

    def text(self):
        return ' '.join(' '.join(self.parts).split())


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        for node in self.stack:
            node.parts.append(data.strip())


def next_data(html):
    match = re.search(r'<script\b[^>]*\bid=[\"\']__NEXT_DATA__[\"\'][^>]*>(.*?)</script>', html, re.S)
    if not match:
        raise ValueError('Public page format changed: hydration missing')
    return json.loads(match[1])['props']['pageProps']


class Reader:
    def __init__(self):
        self.robots = {}

    def raw(self, url):
        with urlopen(Request(url, headers={'User-Agent': AGENT}), timeout=15) as response:
            # No credentials, paywall handling, proxies, or challenge bypass.
            if urlparse(response.url).hostname != urlparse(url).hostname:
                raise ValueError('Unexpected redirect')
            return response.read(3_000_000).decode('utf-8')

    def get(self, url):
        host = urlparse(url)
        if host.scheme != 'https' or host.hostname not in ('www.rotowire.com', 'www.dailyfaceoff.com') or host.path.startswith('/api/'):
            raise ValueError('Unapproved public page')
        origin = host.scheme+'://'+host.netloc
        if origin not in self.robots:
            rules = RobotFileParser()
            rules.parse(self.raw(origin+'/robots.txt').splitlines())
            self.robots[origin] = rules
        if not self.robots[origin].can_fetch(AGENT, url):
            raise ValueError('Public page disallowed by robots.txt')
        return self.raw(url)


def record(sport, gid, game, team, role, names, status, now, url, **extra):
    return dict(sport=sport, game_id=str(gid), start_time=game.get('start') or game.get('kickoff'),
                team=team, role=role, players=names, status=status, checked_at=now.isoformat(),
                source_url=url, method='public_page', **extra)


def parse_nba(html, ctx, now, url=RW):
    page = Page(html).root
    dates = {n.attrs['data-gamedate'] for n in page.walk() if 'data-gamedate' in n.attrs}
    if len(dates) != 1:
        raise ValueError('NBA page date missing or ambiguous')
    day = next(iter(dates)); out = []
    for card in page.find('lineup'):
        if not card.has('is-nba'):
            continue
        abbrs = card.find('lineup__abbr')
        if len(abbrs) != 2:
            continue
        away, home = [ALIASES.get(n.text(), n.text()) for n in abbrs]
        matches = [(gid, g) for gid, g in ctx.get('games', {}).items()
                   if g.get('away') == away and g.get('home') == home and instant(g.get('start'))
                   and instant(g['start']).astimezone(ZoneInfo('America/New_York')).date().isoformat() == day]
        if len(matches) != 1:
            continue
        gid, game = matches[0]
        for side, team in [('is-visit', away), ('is-home', home)]:
            lists = [n for n in card.find('lineup__list') if n.has(side)]
            if len(lists) != 1:
                continue
            listing = lists[0]; statuses = listing.find('lineup__status')
            # Explicit class AND text required. 'Unconfirmed' cannot match.
            confirmed = len(statuses) == 1 and statuses[0].has('is-confirmed') and statuses[0].text().strip() == 'Confirmed Lineup'
            expected = len(statuses) == 1 and statuses[0].has('is-expected') and statuses[0].text().strip() == 'Expected Lineup'
            if not (confirmed or expected):
                continue
            names = []
            # Only the starters before the first secondary/MAY NOT PLAY section.
            for child in listing.children:
                if child.has('lineup__title'):
                    break
                if child.has('lineup__player'):
                    links = [n for n in child.walk() if n.tag == 'a' and n.attrs.get('title')]
                    if len(links) == 1:
                        names.append(links[0].attrs['title'])
            if len(names) != 5 or len({key(n) for n in names}) != 5:
                continue
            roster = [p for p in ctx.get('players', {}).values() if p.get('team') == team]
            if any(sum(key(p.get('name')) == key(name) for p in roster) != 1 for name in names):
                continue
            out.append(record('nba', gid, game, team, 'lineup', names, 'confirmed' if confirmed else 'projected', now, url))
    return out


def parse_goalies(html, ctx, now, url):
    data = next_data(html); out = []; slugs = {}
    if not isinstance(data.get('data'), list):
        raise ValueError('Goalie page format changed')
    for row in data['data']:
        start = instant(row.get('dateGmt'))
        if not start or start <= now:
            continue
        # Map BOTH team names to the official same-time matchup using rosters/team metadata.
        matches = []
        for gid, game in ctx.get('games', {}).items():
            if not instant(game.get('start')) or abs((instant(game['start'])-start).total_seconds()) > 300:
                continue
            ok = True
            for side in ('home', 'away'):
                team = game[side]
                goalies = [p for p in ctx.get('rosters', []) if p.get('team') == team and p.get('position') == 'G']
                if sum(key(p.get('name')) == key(row.get(side+'GoalieName')) for p in goalies) != 1:
                    ok = False
            if ok:
                matches.append((gid, game))
        if len(matches) != 1:
            continue
        gid, game = matches[0]
        for side in ('home', 'away'):
            status = str(row.get(side+'NewsStrengthName') or '').lower()
            source_at = instant(row.get(side+'NewsCreatedAt'))
            # Explicit confirmation must be from this game's reporting window.
            confirmed = status == 'confirmed' and source_at and start-timedelta(hours=36) <= source_at <= now
            names = [row[side+'GoalieName']]
            out.append(record('nhl', gid, game, game[side], 'goalie', names, 'confirmed' if confirmed else 'projected', now, url,
                              announced_at=source_at.isoformat() if source_at else None,
                              announcement_url=row.get(side+'NewsSourceUrl')))
            slug = row.get(side+'TeamSlug', '')
            if re.fullmatch('[a-z-]+', slug):
                slugs[game[side]] = slug
    return out, slugs


def parse_lines(html, ctx, team, now, url):
    data = next_data(html).get('combinations') or {}
    abbr = ALIASES.get(data.get('teamAbbreviation'), data.get('teamAbbreviation'))
    if abbr != team:
        raise ValueError('Line page team mismatch')
    at = instant(data.get('updatedAt')); out = []
    if not at or at > now or now-at > timedelta(hours=36):
        return out
    roster = [p for p in ctx.get('rosters', []) if p.get('team') == team]
    for gid, game in ctx.get('games', {}).items():
        start = instant(game.get('start'))
        if team not in (game.get('home'), game.get('away')) or not start or not now < start < now+timedelta(hours=30):
            continue
        for p in data.get('players', []):
            if sum(key(r.get('name')) == key(p.get('name')) for r in roster) != 1:
                continue
            cat = p.get('categoryIdentifier'); group = p.get('groupIdentifier')
            if cat not in ('ev', 'pp') or not group:
                continue
            # Last-game/practice line combos remain REPORTED, never confirmed.
            out.append(record('nhl', gid, game, team, 'powerplay' if cat == 'pp' else 'line', [p['name']], 'reported', now, url,
                              assignment=group, announced_at=at.isoformat(), source_label=data.get('sourceName')))
    return out


def collect(now, reader=None):
    reader = reader or Reader(); rows = []; checks = []
    def attempt(source, fn):
        try:
            result = fn(); checks.append({'source': source, 'ok': True, 'checked_at': now.isoformat()}); return result
        except Exception as error:
            checks.append({'source': source, 'ok': False, 'checked_at': now.isoformat(), 'error': str(error)[:160]}); return None
    def context(s):
        try:
            return json.loads((ROOT/('data/'+s+'-context.json')).read_text())
        except (OSError, ValueError):
            return {}
    nba, nhl = context('nba'), context('nhl')
    # Today's public cards only; tomorrow's subscriber content is never requested.
    result = attempt('RotoWire NBA', lambda: parse_nba(reader.get(RW), nba, now))
    rows.extend(result or [])
    url = DFO+'/starting-goalies'
    result = attempt('Daily Faceoff goalies', lambda: parse_goalies(reader.get(url), nhl, now, url))
    if result:
        goalie_rows, slugs = result; rows.extend(goalie_rows)
        for team, slug in slugs.items():
            url = DFO+'/teams/'+slug+'/line-combinations'
            rows.extend(attempt('Daily Faceoff '+team+' lines', lambda u=url, t=team: parse_lines(reader.get(u), nhl, t, now, u)) or [])
    # Do not retain previous confirmed rows on a failed fetch, nor retimestamp them.
    return {'schemaVersion': 1, 'updated_at': now.isoformat(), 'records': rows, 'checks': checks,
            'college_status': 'Official game-specific QB announcements require sourced manual review; availability is not starting status.'}


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--minutes', type=int, default=0)
    parser.add_argument('--interval', type=int, default=300); parser.add_argument('--publish', action='store_true')
    args = parser.parse_args(); deadline = time.monotonic()+args.minutes*60
    while True:
        (ROOT/TARGET).write_text(json.dumps(collect(datetime.now(timezone.utc)), indent=2)+'\n')
        if args.publish:
            try:
                from scripts.refresh_price_worker import publish, run
            except ModuleNotFoundError:
                from refresh_price_worker import publish, run
            run(['git', 'config', 'user.name', 'github-actions[bot]'])
            run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
            publish([TARGET])
        if time.monotonic()+args.interval >= deadline:
            break
        time.sleep(max(60, args.interval))

if __name__ == '__main__':
    main()
