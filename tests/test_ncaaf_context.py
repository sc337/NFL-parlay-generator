import unittest
from datetime import datetime, timedelta, timezone

from scripts import update_ncaaf_context as ctx


NOW = datetime(2026, 9, 28, tzinfo=timezone.utc)


def event(game_id, when, home='1', away='2', final=True):
    return {'id': game_id, 'date': when.isoformat(),
            'competitions': [{'status': {'type': {'completed': final}}, 'neutralSite': False,
                'venue': {'indoor': False, 'address': {'city': 'Athens', 'state': 'GA'}},
                'competitors': [
                    {'homeAway': 'home', 'team': {'id': home, 'displayName': 'Home Tigers', 'location': 'Home'}, 'score': '31'},
                    {'homeAway': 'away', 'team': {'id': away, 'displayName': 'Away Bears', 'location': 'Away'}, 'score': '20'}]}]}


class NCAAFContextTests(unittest.TestCase):
    def test_completed_requires_final_and_past_date(self):
        self.assertIsNone(ctx.completed(event('1', NOW, final=True), NOW))
        self.assertIsNone(ctx.completed(event('2', NOW-timedelta(days=2), final=False), NOW))
        self.assertEqual(ctx.completed(event('3', NOW-timedelta(days=2)), NOW), {'1': 31, '2': 20})

    def test_build_only_uses_completed_pregame_scores_and_boxes(self):
        past = [event(str(i), NOW-timedelta(days=7*i)) for i in range(1, 5)]
        upcoming = event('99', NOW+timedelta(days=3), final=False)
        future_final = event('100', NOW+timedelta(days=4))
        boxes = {(str(i), team): {'totalYards': '420' if team == '1' else '280', 'turnovers': '1'}
                 for i in range(1, 5) for team in ('1', '2')}
        snapshot = {'markets': [{'game_id': '99', 'game_time': upcoming['date']}]} 
        result = ctx.build(snapshot, past+[upcoming, future_final], boxes, NOW, weather_fn=lambda *args: {'wind_mph': 17})
        game = result['games']['99']
        self.assertEqual(game['home']['form']['games'], 4)
        self.assertEqual(game['home']['form']['points_for'], 31)
        self.assertEqual(game['away']['form']['points_for'], 20)
        self.assertEqual(game['home']['form']['box_games'], 4)
        self.assertEqual(result['league_points_per_team'], 25.5)
        self.assertEqual(game['weather']['wind_mph'], 17)


if __name__ == '__main__':
    unittest.main()
