import unittest
from datetime import date
from unittest.mock import patch, MagicMock
from scripts.attach_game_context import college_matches, college_name, scoreboard

class CollegeScheduleMatching(unittest.TestCase):
    def event(self, **patches):
        return {'id':'espn', 'date':'2026-10-24T19:00:00Z',
                'competitions':[{'competitors':[
                    {'team':{'location':'NC State','shortDisplayName':'NC State'}},
                    {'team':{'location':'Miami','shortDisplayName':'Miami'}}]}], **patches}

    def test_exact_aliases_and_eastern_date_without_invented_kickoff(self):
        names={college_name('NC St.'),college_name('Miami (FL)')}
        self.assertEqual(len(college_matches(names,date(2026,10,24),[self.event()])),1)
        self.assertEqual(college_matches(names,date(2026,10,25),[self.event()]),[])
        self.assertEqual(college_matches(names,date(2026,10,24),[self.event(date=None)]),[])
        self.assertEqual(college_matches({college_name('Miami (OH)'),college_name('NC St.')},date(2026,10,24),[self.event()]),[])

    def test_duplicate_providers_collapse_but_conflicting_times_do_not(self):
        names={college_name('NC St.'),college_name('Miami (FL)')}
        events=[self.event(),self.event(id='ncaa',source='NCAA')]
        self.assertEqual(college_matches(names,date(2026,10,24),events)[0]['id'],'espn')
        events[1]['date']='2026-10-24T20:00:00Z'
        self.assertEqual(len(college_matches(names,date(2026,10,24),events)),2)

    def test_college_schedule_requests_full_fbs_and_fcs_separately(self):
        response=MagicMock();response.__enter__.return_value.read.return_value=b'{"events": [{"id":"game"}, {}]}'
        with patch('urllib.request.urlopen',return_value=response) as fetch:
            self.assertEqual(len(scoreboard('football/college-football',[date(2026,10,24)])),2)
        urls=[call.args[0].full_url for call in fetch.call_args_list]
        self.assertTrue(all('limit=500' in url for url in urls))
        self.assertTrue(any('groups=80' in url for url in urls))
        self.assertTrue(any('groups=81' in url for url in urls))
