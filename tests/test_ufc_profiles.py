"""Official athlete parsing must preserve identity, percentages and result ownership."""
import ast
import html
import re
import unicodedata
import unittest
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/update_kalshi_ufc.py'
NAMES = {'fighter_key', 'official_identity', 'official_recent_fights', 'recent_summary', 'parse_official_profile'}
ns = {'re': re, 'html': html, 'unicodedata': unicodedata, 'datetime': datetime, 'timezone': timezone}
tree = ast.parse(SOURCE.read_text())
nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in NAMES or isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in {'PROFILE_ALIASES', 'PROFILE_VERSION'} for t in n.targets)]
exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), ns)
AT = datetime(2026, 10, 20, tzinfo=timezone.utc)
URL = 'https://www.ufc.com/athlete/alexander-volkanovski'

def bout(day, red, blue, red_result='win', blue_result='loss'):
 return f'''<article class="c-card-event--athlete-results"><div class="c-card-event--athlete-results__image {red_result}"><a href="{red}">Red</a></div><div class="c-card-event--athlete-results__image {blue_result}"><a href="{blue}">Blue</a></div><h3><a href="{red}">Red</a><a href="{blue}">Blue</a></h3><div class="c-card-event--athlete-results__date">{day}</div></article>'''

class ProfileTests(unittest.TestCase):
 def test_nested_percentages_and_verified_alias(self):
  page = '''<h1 class="hero-profile__name">Alexander Volkanovski</h1><p class="hero-profile__division-body">28-4-0 (W-L-D)</p><p class="hero-profile__division-title">Featherweight Division</p><div class="c-stat-compare__number">59<div class="c-stat-compare__percent">%</div></div><div class="c-stat-compare__label">Sig. Str. Defense</div><div class="c-stat-compare__number">69<div class="c-stat-compare__percent">%</div></div><div class="c-stat-compare__label">Takedown Defense</div>'''
  profile = ns['parse_official_profile'](page, 'Alex Volkanovski', URL, AT)
  self.assertEqual(profile['str_def'], 59)
  self.assertEqual(profile['td_def'], 69)
  self.assertEqual(profile['canonical_name'], 'Alexander Volkanovski')
  self.assertIsNone(profile['slpm'], 'missing values must never become zero')
  self.assertIsNone(ns['parse_official_profile'](page, 'Alexander Other', URL, AT))
 def test_result_is_owned_by_exact_profile_link_on_either_side(self):
  other = 'https://www.ufc.com/athlete/opponent'
  page = bout('Jan. 31, 2026', URL, other) + bout('Apr. 12, 2025', other, URL) + bout('Oct. 24, 2026', URL, other)
  rows = ns['official_recent_fights'](page, URL, AT)
  self.assertEqual([r['result'] for r in rows], ['W', 'L'])
  self.assertEqual(len(rows), 2, 'future results cannot enter projections')
  summary = ns['recent_summary'](rows + rows)
  self.assertEqual(summary['count'], 2)
  self.assertEqual(summary['winRate'], .5)
 def test_only_explicit_aliases_are_resolved(self):
  self.assertEqual(ns['official_identity']('Daniel Gustavo Santos'), 'Daniel Santos')
  self.assertEqual(ns['official_identity']('Jasmin Lucindo'), 'Iasmin Lucindo')
  self.assertEqual(ns['official_identity']('Unknown Santos'), 'Unknown Santos')

if __name__ == '__main__': unittest.main()
