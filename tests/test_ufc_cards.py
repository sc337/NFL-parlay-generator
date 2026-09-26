"""The official event feed supplies dates, names and start windows."""
import ast
import html
import re
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/update_kalshi_ufc.py'
module = ast.parse(SOURCE.read_text())
function = next(node for node in module.body if isinstance(node, ast.FunctionDef) and node.name == 'official_cards')
namespace = {'re': re, 'html': html, 'datetime': datetime, 'timezone': timezone, 'timedelta': timedelta, 'ZoneInfo': ZoneInfo}
exec(compile(ast.Module(body=[function], type_ignores=[]), str(SOURCE), 'exec'), namespace)

class Response:
    def read(self):
        return b'''<h3 class="c-card-event--result__headline"><a href="/event/ufc-fight-night-september-26-2026">Rosas Jr. vs Barcelos</a></h3>
        <div data-main-card-timestamp="1790467200" data-prelims-card-timestamp="1790456400"></div>
        <h3 class="c-card-event--result__headline"><a href="/event/ufc-332">Silva vs Wang</a></h3>
        <div data-main-card-timestamp="1791072000" data-prelims-card-timestamp="1791061200"></div>'''
    def __enter__(self): return self
    def __exit__(self, *args): return False

class OfficialCardTests(unittest.TestCase):
    def test_official_names_and_utc_windows(self):
        import urllib.request
        namespace['urllib'] = __import__('urllib')
        with patch.object(urllib.request, 'urlopen', return_value=Response()):
            cards = namespace['official_cards']()
        self.assertEqual(cards['2026-09-26']['title'], 'UFC Fight Night: Rosas Jr. vs Barcelos')
        self.assertEqual(cards['2026-09-26']['firstBell'], '2026-09-26T21:00:00Z')
        self.assertEqual(cards['2026-10-03']['title'], 'UFC 332: Silva vs Wang')

if __name__ == '__main__': unittest.main()
