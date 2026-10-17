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

    def test_walk_forward_errors_cannot_use_target_future_or_same_window_games(self):
        target = event('target', NOW-timedelta(days=2))
        prior = [event(str(i), NOW-timedelta(days=2+7*i)) for i in range(1, 5)]
        boxes = {(str(i), team): {'totalYards': '420' if team == '1' else '280'}
                 for i in range(1, 5) for team in ('1', '2')}
        baseline = ctx.margin_errors(prior+[target], boxes, NOW)
        target_row = next(r for r in baseline['rows'] if r['event_id'] == 'target')
        # A later final, target box score and another game starting an hour
        # earlier must not alter the inputs used to predict this target.
        poison = event('future', NOW-timedelta(days=1))
        overlap = event('overlap', ctx.instant(target['date'])-timedelta(hours=1))
        for e in (poison, overlap):
            e['competitions'][0]['competitors'][0]['score'] = '100'
        extra_boxes = {**boxes, ('target', '1'): {'totalYards': '9999'}, ('future', '1'): {'totalYards': '9999'}}
        changed = ctx.margin_errors(prior+[target, poison, overlap, target], extra_boxes, NOW)
        row = next(r for r in changed['rows'] if r['event_id'] == 'target')
        self.assertEqual(row, target_row)
        self.assertEqual(sum(r['event_id'] == 'target' for r in changed['rows']), 1)
        self.assertEqual(ctx.margin_errors(prior+[target], {}, NOW)['rows'], [])

    def test_python_margin_matches_browser_formula(self):
        import json
        import subprocess
        home = {'available': True, 'games': 5, 'box_games': 4, 'margin': 10,
                'opponent_adjusted_margin': 12.3, 'yards_for': 410, 'yards_against': 290}
        away = {**home, 'games': 4, 'margin': -4, 'opponent_adjusted_margin': -1.5,
                'yards_for': 320, 'yards_against': 390}
        script = "const fs=require('fs'),vm=require('vm'),window={};vm.runInNewContext(fs.readFileSync('ncaaf-model.js','utf8'),{window});const [h,a]=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify([false,true].map(n=>window.NCAAF_MODEL.margin(h,a,n))))"
        actual = json.loads(subprocess.check_output(['node', '-e', script], input=json.dumps([home, away]).encode()))
        self.assertEqual(actual, [ctx.projected_margin(home, away, False), ctx.projected_margin(home, away, True)])


if __name__ == '__main__':
    unittest.main()
