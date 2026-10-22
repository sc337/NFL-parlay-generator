import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).parents[1]/'scripts/update_kalshi.py')
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)

class AltSnapshotTest(unittest.TestCase):
    def test_failed_family_does_not_discard_other_fresh_families(self):
        def fetch(series):
            if series == 'bad': raise RuntimeError('upstream timeout')
            return [{'ticker': series}]
        with patch.object(snapshot,'SERIES',['good','bad']), patch.object(snapshot,'fetch_series',side_effect=fetch):
            captures,errors=snapshot.collect_families()
        self.assertEqual(captures,{'good':[{'ticker':'good'}]})
        self.assertEqual(errors,{'bad':'upstream timeout'})
        with patch.object(snapshot,'SERIES',['bad']), patch.object(snapshot,'fetch_series',side_effect=RuntimeError('outage')):
            with self.assertRaises(RuntimeError):snapshot.collect_families()
    def test_receptions_series_has_its_own_category(self):
        self.assertEqual(snapshot.PROP_SERIES['KXNFLREC'][0], 'receptions')
        self.assertEqual(snapshot.PROP_SERIES['KXNFLRECYDS'][0], 'receiving')
        self.assertEqual(snapshot.PROP_SERIES['KXNFLPASSTDS'][0], 'passing_tds')
    def test_passing_td_ladders_keep_exact_count_thresholds_and_prices(self):
        rows=[(.1,.5,{'ticker':'one','yes_ask_dollars':.8,'yes_bid_dollars':.78},.79,'passing_tds','passing touchdowns'),(.01,1.5,{'ticker':'two','yes_ask_dollars':.52,'yes_bid_dollars':.5},.51,'passing_tds','passing touchdowns')]
        game={'markets':[],'_candidates':{'totals':[], 'spreads':[], 'props':{('QB','player_pass_tds'):rows}}}
        out=snapshot.finalize(game)['markets']
        self.assertEqual(len(out),4)
        self.assertEqual({m['point'] for m in out},{.5,1.5})
        self.assertTrue(all(m['type']=='passing_tds' for m in out))
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
