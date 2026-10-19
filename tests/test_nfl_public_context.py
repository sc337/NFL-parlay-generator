import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts import enrich_snapshot_context as context
from scripts.update_public_odds import enrich
from tests.test_public_odds import fixture, NOW

class PublicNflContext(unittest.TestCase):
    def test_new_public_game_keeps_local_event_date_for_context(self):
        snapshot=enrich('nfl', {'games':[]}, [fixture()], {}, NOW)
        self.assertEqual(snapshot['games'][0]['event_date'], '2026-10-17')

    def test_missing_public_context_is_enriched_without_touching_quotes_or_existing_context(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'snapshot.json'
            existing={'id':'native','context':{'available':True,'updated_at':'original'}}
            fallback={'id':'public','away':'Away','home':'Home','commence_time':'2026-10-19T00:20:00Z','markets':[{'price':-110,'quotedAt':'original'}]}
            path.write_text(json.dumps({'games':[existing,fallback]}))
            event={'id':'event','competitions':[{'competitors':[{'team':{'displayName':'Away'}},{'team':{'displayName':'Home'}}]}]}
            with patch.object(context,'SNAPSHOT',path), patch.object(context,'team_index',return_value={'Away':'1','Home':'2'}), patch.object(context,'scoreboard',return_value={'events':[event]}) as scoreboard, patch.object(context,'fetch_json',return_value={'injuries':[]}), patch.object(context,'completed_form',return_value={'available':True,'games':4}):
                context.main(only_missing=True)
            games=json.loads(path.read_text())['games']
            scoreboard.assert_called_once_with('2026-10-18')
            self.assertEqual(games[0],existing)
            self.assertTrue(games[1]['context']['available'])
            self.assertEqual(games[1]['context']['recent_form']['Away']['games'],4)
            self.assertEqual(games[1]['markets'],fallback['markets'])

if __name__=='__main__': unittest.main()
