import importlib.util
import unittest
from pathlib import Path
from datetime import datetime,timezone

def load(name):
 spec=importlib.util.spec_from_file_location(name,Path(__file__).resolve().parents[1]/('scripts/'+name+'.py'))
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
mlb=load('update_mlb_context');nhl=load('update_nhl_context')
now=datetime(2026,10,15,12,tzinfo=timezone.utc)

class OpportunityLogs(unittest.TestCase):
 def test_mlb_logs_preserve_opportunities_and_team_identity_without_future_games(self):
  raw={'stats':[{'splits':[{'date':date,'team':{'id':1},'stat':{'plateAppearances':4,'hits':2,'totalBases':3}} for date in ['2026-10-14','2026-10-15','2026-10-16']]}]}
  rows=mlb.player_log(raw,now);self.assertEqual(len(rows),1);self.assertEqual(rows[0]['plateAppearances'],4);self.assertEqual(rows[0]['teamId'],1)
 def test_nhl_ice_time_logs_convert_seconds_and_exclude_current_and_future_days(self):
  raw={'gameLog':[{'gameDate':date,'teamAbbrev':'LAK','toi':'18:30','goals':1,'assists':2,'shots':4} for date in ['2026-10-14','2026-10-15','2026-10-16']]}
  rows=nhl.recent_logs(raw,now);self.assertEqual(len(rows),1);self.assertEqual(rows[0]['toi'],1110);self.assertEqual(rows[0]['team'],'LA');self.assertEqual(rows[0]['points'],3)
 def test_invalid_or_old_logs_do_not_create_usage(self):
  self.assertEqual(mlb.player_log({'stats':[{'splits':[{'date':'2020-01-01','stat':{}}]}]},now),[])
  self.assertEqual(nhl.recent_logs({'gameLog':[{'gameDate':'2026-10-14','toi':'unknown'}]},now),[])

if __name__=='__main__':unittest.main()
