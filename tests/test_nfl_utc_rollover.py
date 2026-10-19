import unittest
from datetime import datetime, date, timezone
from scripts.update_kalshi import candidate_day

class NflUtcRollover(unittest.TestCase):
    def test_us_evening_markets_survive_utc_midnight_before_kickoff(self):
        day=date(2026,10,18)
        for now in ['2026-10-18T23:59:00+00:00','2026-10-19T00:02:00+00:00','2026-10-19T00:19:00+00:00']:
            self.assertTrue(candidate_day(day,datetime.fromisoformat(now)))
    def test_old_days_and_events_beyond_horizon_remain_excluded(self):
        now=datetime(2026,10,19,0,2,tzinfo=timezone.utc)
        self.assertFalse(candidate_day(date(2026,10,17),now))
        self.assertFalse(candidate_day(date(2026,11,3),now))
        self.assertTrue(candidate_day(date(2026,11,2),now))

if __name__=='__main__': unittest.main()
