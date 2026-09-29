import unittest
from datetime import datetime, timezone
from scripts.update_mlb_context import scoring_form


class MlbScoringFormTests(unittest.TestCase):
    def test_only_completed_past_scores_count_once(self):
        def game(game_id, when, state, home, away, scores=True):
            return {'gamePk': game_id, 'gameDate': when,
                    'status': {'abstractGameState': state},
                    'teams': {'home': {'team': {'id': home}, **({'score': 6} if scores else {})},
                              'away': {'team': {'id': away}, **({'score': 2} if scores else {})}}}
        old=game(1,'2026-09-27T20:00:00Z','Final',10,20)
        schedule={'dates':[{'games':[old,old,game(2,'2026-09-29T20:00:00Z','Preview',10,30),
                                      game(3,'2026-09-28T20:00:00Z','Final',20,30),
                                      game(4,'2026-09-27T21:00:00Z','Live',10,20),
                                      game(5,'2026-09-27T22:00:00Z','Final',10,20,False)]}]}
        form=scoring_form(schedule,datetime(2026,9,28,12,tzinfo=timezone.utc))
        self.assertEqual(form['league'],{'games':1,'runs_per_team':4.0})
        self.assertEqual(form['teams']['10'],{'games':1,'runs_for':6,'runs_against':2})
        self.assertEqual(form['teams']['20'],{'games':1,'runs_for':2,'runs_against':6})
        self.assertNotIn('30',form['teams'])


if __name__=='__main__': unittest.main()
