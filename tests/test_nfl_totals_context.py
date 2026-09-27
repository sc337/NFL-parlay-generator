import unittest
from unittest.mock import patch

from scripts import enrich_snapshot_context as context


class NFLTotalsContextTests(unittest.TestCase):
    def test_completed_form_reads_competition_status_and_score_values(self):
        def event(date, points, allowed, completed=True):
            return {'date': date, 'competitions': [{'status': {'type': {'completed': completed}},
                'competitors': [
                    {'team': {'id': '1'}, 'score': {'value': points, 'displayValue': str(points)}},
                    {'team': {'id': '2'}, 'score': {'value': allowed, 'displayValue': str(allowed)}}]}]}
        rows = {'events': [event('2026-09-13', 20, 17), event('2026-09-20', 27, 24),
                           event('2026-09-27', None, None, False)]}
        with patch.object(context, 'fetch_json', return_value=rows):
            form = context.completed_form('1', 2026)
        self.assertEqual(form['games'], 2)
        self.assertEqual(form['avg_points_for'], 23.5)
        self.assertEqual(form['avg_points_against'], 20.5)


if __name__ == '__main__':
    unittest.main()
