import sys,unittest,tempfile,json
from pathlib import Path
from datetime import datetime,timezone,timedelta
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from update_source_intel import parse_report,report_links,starter_facts,cached_facts,probe
NOW=datetime(2026,11,16,16,tzinfo=timezone.utc)
G={'eventId':'g','startAt':'2026-11-17T00:00Z','teams':[{'code':'CHI','name':'Chicago Bulls'},{'code':'CLE','name':'Cleveland Cavaliers'}]}
REPORT='''Injury Report: 11/16/26 11:00 AM
Game Date    Game Time    Matchup   Team                        Player Name         Current Status   Reason
11/16/2026   07:00 (ET)   CHI@CLE   Chicago Bulls               Player, Example     Questionable     Injury
                                                               Other, Person       Out              Injury
                          Cleveland Cavaliers                  NOT YET SUBMITTED
Page 1 of 2
\fInjury Report: 11/16/26 11:00 AM
                 Cleveland Cavaliers     Third, Person   Out    Injury
'''
class SourceTests(unittest.TestCase):
 def test_report_continuation_width_changes_and_exact_identity(self):
  rows=parse_report(REPORT,[G],NOW);self.assertEqual(len(rows),3);self.assertEqual(rows[-1]['team'],'Cleveland Cavaliers')
  self.assertEqual(rows[0]['status'],'Questionable')
  self.assertEqual(parse_report(REPORT,[{**G,'startAt':'2026-11-17T01:00Z'}],NOW),[])
  self.assertEqual(parse_report(REPORT,[G,G],NOW),[])
  self.assertEqual(parse_report(REPORT,[{**G,'teams':[{'code':'X','name':'Other'},{'code':'Y','name':'Else'}]}],NOW),[])
 def test_latest_official_report_links_not_unrelated_or_future_pdfs(self):
  good='https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-16_10_45AM.pdf'
  other=good.replace('10_45AM','11_30AM')
  self.assertEqual(report_links('<a href="'+good+'">Report</a><a href="'+other+'">Future</a><a href="https://evil.test/report.pdf">PDF</a>',NOW)[0][1],good)
 def test_lineup_and_goalie_stay_projected_unless_explicitly_confirmed(self):
  row={'sport':'nba','team':'CHI','role':'lineup','players':['Example'],'status':'projected','start_time':G['startAt'],'checked_at':NOW.isoformat(),'source_url':'https://www.rotowire.com/basketball/nba-lineups.php'}
  r=starter_facts(G,'nba',{'records':[row]},NOW);self.assertIn('projected / unconfirmed',r[0]['text'])
  self.assertEqual(starter_facts(G,'nba',{'records':[{**row,'checked_at':(NOW-timedelta(hours=3)).isoformat()}]},NOW),[])
  self.assertEqual(starter_facts(G,'nba',{'records':[{**row,'source_url':'https://www.rotowire.com.evil.test/'}]},NOW),[])
 def test_blocked_sources_never_create_opinions_or_success(self):
  def fail(url):raise OSError('403')
  self.assertEqual(probe('Action Network','https://www.actionnetwork.com/',NOW,fail)['state'],'unavailable')
 def test_fighter_stats_require_verified_identity_and_own_timestamp(self):
  game={**G,'teams':[{'name':'Fighter One','code':'ONE'},{'name':'Fighter Two','code':'TWO'}]}
  profile={'identity_verified':True,'fetched_at':NOW.isoformat(),'url':'https://www.ufc.com/athlete/fighter-one','slpm':3.2}
  r=cached_facts(game,'ufc',{'fighter_stats':{'Fighter One':profile}},NOW);self.assertEqual(r[0]['checkedAt'],profile['fetched_at'])
  self.assertEqual(cached_facts(game,'ufc',{'fighter_stats':{'Fighter One':{**profile,'identity_verified':False}}},NOW),[])
  self.assertEqual(cached_facts(game,'ufc',{'fighter_stats':{'Fighter One':profile}},NOW+timedelta(days=3)),[])
 def test_statcast_is_matched_to_exact_game_and_never_made_up(self):
  ctx={'updated_at':NOW.isoformat(),'games':[{'gameDate':G['startAt'],'home':'Cleveland Cavaliers','away':'Chicago Bulls','awayProbable':{'id':1}}],'pitchers':{'1':{'name':'Pitcher','recent30':{'pitches':100,'kRate':.3}}}}
  self.assertEqual(cached_facts(G,'mlb',ctx,NOW)[0]['source'],'Baseball Savant')
  self.assertEqual(cached_facts({**G,'startAt':'2026-11-18T00:00Z'},'mlb',ctx,NOW),[])
if __name__=='__main__':unittest.main()
