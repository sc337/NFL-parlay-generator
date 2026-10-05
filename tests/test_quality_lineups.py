import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('mlb_context',Path(__file__).resolve().parents[1]/'scripts/update_mlb_context.py')
mlb=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mlb)
class Lineups(unittest.TestCase):
 def fixture(self):
  row={'gamePk':1,'status':'Preview','awayProbable':{'id':50},'homeProbable':{'id':60}}
  teams={side:{'battingOrder':list(range(base,base+9)),'players':{'starter':{'person':{'id':pid},'gameStatus':{'isCurrentPitcher':True}}}} for side,pid,base in [('away',50,1),('home',60,20)]}
  return row,{'liveData':{'boxscore':{'teams':teams}}}
 def test_confirmed_assignment_and_both_lineups(self):
  row,live=self.fixture();result=mlb.confirm_lineup(row,lambda _:live)
  self.assertTrue(result['startersConfirmed']);self.assertTrue(result['lineupsConfirmed']);self.assertEqual(len(result['lineupPlayerIds']),18)
 def test_probable_alone_and_missing_lineups_never_confirm(self):
  row,live=self.fixture();live['liveData']['boxscore']['teams']['home']['players']={};live['liveData']['boxscore']['teams']['away']['battingOrder']=[]
  result=mlb.confirm_lineup(row,lambda _:live);self.assertFalse(result['startersConfirmed']);self.assertFalse(result['lineupsConfirmed'])
 def test_feed_failure_and_started_games_fail_closed(self):
  row,_=self.fixture()
  def failed(_):raise OSError('offline')
  self.assertFalse(mlb.confirm_lineup(row,failed)['startersConfirmed'])
  row['status']='Live';self.assertFalse(mlb.confirm_lineup(row,lambda _:self.fail('should not fetch'))['lineupsConfirmed'])
