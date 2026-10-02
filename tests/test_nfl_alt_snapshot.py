import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).parents[1]/'scripts/update_kalshi.py')
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)

class AltSnapshotTest(unittest.TestCase):
    def test_retains_quoted_ladders_and_skips_unquoted_sides(self):
        def quote(ticker, ask, bid):
            return {'ticker':ticker,'yes_ask_dollars':ask,'yes_bid_dollars':bid}
        rows=[(.01,49.5,quote('main',.52,.50),.51,'rushing','rushing yards'),(.3,19.5,quote('alt',.81,.79),.8,'rushing','rushing yards')]
        game={'markets':[],'_candidates':{'totals':[(.01,44.5,quote('total-main',.52,.50),.51),(.2,34.5,quote('total-alt',.72,.70),.71)],'spreads':[],'props':{('RB','player_rush_yds'):rows}}}
        out=snapshot.finalize(game)['markets']
        self.assertEqual(len(out),8)
        alt=[m for m in out if m.get('marketKey')=='player_rush_yds_alternate']
        self.assertEqual(len(alt),2)
        self.assertTrue(all(m['point']==19.5 and m['isAltLine'] for m in alt))
        self.assertEqual(alt[0]['price'],snapshot.american(.81))
        game={'markets':[],'_candidates':{'totals':[], 'spreads':[], 'props':{('RB','player_rush_yds'):[(.01,49.5,{'ticker':'unquoted'},.51,'rushing','rushing yards')]}}}
        self.assertEqual(snapshot.finalize(game)['markets'],[])

if __name__=='__main__': unittest.main()
