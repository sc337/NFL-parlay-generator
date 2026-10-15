import importlib.util
import unittest
from pathlib import Path
from datetime import datetime, timezone

spec=importlib.util.spec_from_file_location('mlb',Path(__file__).resolve().parents[1]/'scripts/update_mlb_context.py')
mlb=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mlb)

class Bullpen(unittest.TestCase):
 def fixture(self):
  now=datetime(2026,10,15,12,tzinfo=timezone.utc)
  game={'gamePk':1,'gameDate':'2026-10-15T01:00:00Z','status':{'abstractGameState':'Final'},
   'teams':{side:{'team':{'id':i}} for side,i in [('away',1),('home',2)]}}
  box={'teams':{side:{'pitchers':[10,11],'players':{'ID10':{'stats':{'pitching':{'numberOfPitches':90}}},'ID11':{'stats':{'pitching':{'numberOfPitches':25}}}}} for side in ['away','home']}}
  return now,{'dates':[{'games':[game]}]},box
 def test_counts_only_relief_pitches_before_forecast(self):
  now,schedule,box=self.fixture()
  out=mlb.bullpen_workload(schedule,now,lambda _:box)
  self.assertEqual(out['1']['pitches3d'],25)
  self.assertEqual(out['1']['pitches24h'],25)
  self.assertTrue(out['1']['available'])
 def test_missing_fetch_is_unavailable_not_zero_fatigue(self):
  now,schedule,_=self.fixture()
  def failed(_):raise OSError('offline')
  self.assertFalse(mlb.bullpen_workload(schedule,now,failed)['1']['available'])
 def test_live_or_future_scores_never_enter_workload(self):
  now,schedule,box=self.fixture()
  game=schedule['dates'][0]['games'][0]
  game['gameDate']='2026-10-16T01:00:00Z'
  self.assertEqual(mlb.bullpen_workload(schedule,now,lambda _:self.fail('future fetch')), {})
  game['gameDate']='2026-10-15T01:00:00Z';game['status']['abstractGameState']='Live'
  self.assertEqual(mlb.bullpen_workload(schedule,now,lambda _:self.fail('live fetch')), {})

if __name__=='__main__':unittest.main()
