import io
import unittest
from datetime import datetime, timezone
from scripts.update_nfl_td_context import parse_plays, attach


class TouchdownContextTest(unittest.TestCase):
    def test_prior_opportunity_and_unambiguous_roster_match(self):
        header='game_id,game_date,season_type,posteam,no_play,two_point_attempt,yardline_100,rush_attempt,pass_attempt,rusher_player_id,rusher_player_name,receiver_player_id,receiver_player_name,rush_touchdown,pass_touchdown\n'
        plays=(
            'g1,2026-09-13,REG,SF,0,0,5,1,0,p1,C.McCaffrey,,,1,0\n'
            'g1,2026-09-13,REG,SF,0,0,18,0,1,,,p2,B.Aiyuk,0,0\n'
            'g2,2026-09-20,REG,SF,0,0,4,1,0,p1,C.McCaffrey,,,1,0\n'
            'g2,2026-09-20,REG,SF,0,0,50,0,1,,,p2,B.Aiyuk,0,0\n'
            'g3,2026-10-04,REG,SF,0,0,4,1,0,p1,C.McCaffrey,,,1,0\n'
            'g2,2026-09-20,REG,SF,1,0,2,1,0,p1,C.McCaffrey,,,1,0\n'
        )
        games=parse_plays(io.StringIO(header+plays))
        market={'type':'td','team':'San Francisco 49ers','player':'Christian McCaffrey','_rosterVerified':True}
        snapshot={'games':[{'away':'San Francisco 49ers','home':'Las Vegas Raiders',
                            'commence_time':'2026-10-04T20:00:00Z','markets':[market]}]}
        count=attach(snapshot,games,datetime(2026,9,30,tzinfo=timezone.utc))
        self.assertEqual(count,1)
        opportunity=market['tdOpportunity']
        self.assertEqual(opportunity['games'],2)
        self.assertEqual(opportunity['ten_rush'],2)
        self.assertEqual(opportunity['team_tds_per_game'],1)
        self.assertGreater(opportunity['share'],0)
        self.assertLess(opportunity['share'],1)

    def test_no_projection_with_one_completed_game(self):
        rows=parse_plays(io.StringIO('game_id,game_date,posteam,yardline_100,rush_attempt,rusher_player_id,rusher_player_name\n'
                                        'g1,2026-09-13,SF,5,1,p1,C.McCaffrey\n'))
        market={'type':'td','team':'San Francisco 49ers','player':'Christian McCaffrey','_rosterVerified':True}
        snapshot={'games':[{'away':'San Francisco 49ers','home':'Las Vegas Raiders',
                            'commence_time':'2026-10-04T20:00:00Z','markets':[market]}]}
        self.assertEqual(attach(snapshot,rows,datetime(2026,9,30,tzinfo=timezone.utc)),0)
        self.assertNotIn('tdOpportunity',market)

if __name__=='__main__':unittest.main()
