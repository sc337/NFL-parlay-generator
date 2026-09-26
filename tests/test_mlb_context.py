import json
import os
import tempfile
import unittest
from pathlib import Path
from scripts.attach_game_context import attach_mlb

class MlbContextTests(unittest.TestCase):
    def test_only_same_eastern_date_preview_is_attached(self):
        games=[
            {'gamePk':1,'gameDate':'2026-09-25T23:35:00Z','status':'Final','away':'New York Mets','home':'Washington Nationals'},
            {'gamePk':2,'gameDate':'2026-09-26T16:35:00Z','status':'Preview','away':'New York Mets','home':'Washington Nationals'},
            {'gamePk':3,'gameDate':'2026-09-27T19:05:00Z','status':'Preview','away':'New York Mets','home':'Washington Nationals'},
        ]
        markets=[{'event_ticker':'KXMLBGAME-26SEP261235NYMWSH','kind':'moneyline'},
                 {'event_ticker':'KXMLBGAME-26SEP271505NYMWSH','kind':'moneyline'},
                 {'event_ticker':'KXMLBGAME-26SEP261915CHCBOS','kind':'moneyline'}]
        with tempfile.TemporaryDirectory() as root:
            old=os.getcwd()
            try:
                os.chdir(root);Path('data').mkdir()
                Path('data/kalshi-mlb.json').write_text(json.dumps({'markets':markets}))
                Path('data/mlb-context.json').write_text(json.dumps({'games':games}))
                attach_mlb()
                result=json.loads(Path('data/kalshi-mlb.json').read_text())['markets']
            finally:os.chdir(old)
        self.assertEqual(result[0]['game_id'],'2')
        self.assertEqual(result[1]['game_id'],'3')
        self.assertNotIn('game_time',result[2])

if __name__=='__main__':unittest.main()
