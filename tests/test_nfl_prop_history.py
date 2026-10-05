import importlib.util,io,csv,unittest
from datetime import datetime,timezone
from pathlib import Path
spec=importlib.util.spec_from_file_location('td',Path(__file__).parents[1]/'scripts/update_nfl_td_context.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class HistoryTests(unittest.TestCase):
 def plays(self):
  rows=[]
  for day,n in [('2026-09-01',80),('2026-09-08',60),('2026-09-15',90),('2026-09-22',70)]:
   rows.append(dict(game_date=day,game_id=day,posteam='NO',season_type='REG',rush_attempt='1',rusher_player_id='R',rusher_player_name='A.Runner',yards_gained=str(n),yardline_100='50'))
   rows.append(dict(game_date=day,game_id=day,posteam='NO',season_type='REG',pass_attempt='1',complete_pass='1',passer_player_id='Q',passer_player_name='Q.Passer',receiver_player_id='C',receiver_player_name='C.Catcher',yards_gained='30',yardline_100='50'))
  keys=set().union(*(r.keys() for r in rows));s=io.StringIO();w=csv.DictWriter(s,fieldnames=list(keys));w.writeheader();w.writerows(rows);s.seek(0);return mod.parse_plays(s)
 def snapshot(self):
  return {'games':[{'commence_time':'2026-10-01T20:00:00Z','home':'New Orleans Saints','away':'Atlanta Falcons','markets':[{'type':'rushing','player':'A.Runner','team':'New Orleans Saints','_rosterVerified':True},{'type':'passing','player':'Q.Passer','team':'New Orleans Saints','_rosterVerified':True},{'type':'receiving','player':'C.Catcher','team':'New Orleans Saints','_rosterVerified':True}]}]}
 def test_official_stat_samples_and_same_game_pass_receive(self):
  data=self.snapshot();mod.attach(data,self.plays(),datetime(2026,9,30,tzinfo=timezone.utc));a,b,c=data['games'][0]['markets'];self.assertEqual(a['propHistory']['metrics']['player_rush_yds'],[80,60,90,70]);self.assertEqual(b['propHistory']['metrics']['player_pass_yds'],[30]*4);self.assertEqual(c['propHistory']['metrics']['player_receptions'],[1]*4);self.assertEqual(data['prop_context']['attached'],3)
 def test_future_and_ambiguous_players_never_get_history(self):
  data=self.snapshot();games=self.plays()
  for row in games.values():row['players']['R2']={**row['players']['R'],'name':'A.Runner'}
  mod.attach(data,games,datetime(2026,9,30,tzinfo=timezone.utc));self.assertNotIn('propHistory',data['games'][0]['markets'][0]);data=self.snapshot();mod.attach(data,self.plays(),datetime(2026,9,10,tzinfo=timezone.utc));self.assertTrue(all('propHistory' not in m for m in data['games'][0]['markets']))
 def test_zero_usage_included_latest_inactivity_blocks(self):
  games=self.plays();del list(games.values())[1]['players']['R'];data=self.snapshot();mod.attach(data,games,datetime(2026,9,30,tzinfo=timezone.utc));h=data['games'][0]['markets'][0]['propHistory'];self.assertEqual(h['metrics']['player_rush_yds'],[80,0,90,70]);self.assertEqual(h['played'],3);del list(games.values())[-1]['players']['R'];data=self.snapshot();mod.attach(data,games,datetime(2026,9,30,tzinfo=timezone.utc));self.assertNotIn('propHistory',data['games'][0]['markets'][0])
if __name__=='__main__':unittest.main()
