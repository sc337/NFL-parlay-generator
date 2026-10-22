import unittest
from datetime import datetime,timezone
from scripts.refresh_forecast_worker import merge_records
from scripts.settle_pick_history import settle_records

class ForecastWorker(unittest.TestCase):
    def test_racing_publish_preserves_original_prediction_and_new_outcome(self):
        old={'id':'a','recordedAt':'2026-10-20T10:00:00Z','modelP':.6,'ask':.5,'result':None}
        late={**old,'recordedAt':'2026-10-20T11:00:00Z','modelP':.9,'ask':.8,'result':'win','settledAt':'2026-10-21T12:00:00Z'}
        merged=merge_records([old],[late,{'id':'b','result':None}])
        self.assertEqual(len(merged),2)
        self.assertEqual((merged[0]['modelP'],merged[0]['ask'],merged[0]['result']),(.6,.5,'win'))
        self.assertEqual(merge_records(merged,[old])[0]['result'],'win')

    def test_parallel_settlement_deduplicates_contracts_and_prioritizes_screened_rows(self):
        now=datetime(2026,10,22,tzinfo=timezone.utc)
        rows=[{'id':str(i),'ticker':ticker,'eventTime':'2026-10-20T00:00:00Z','side':'yes','qualification':{'pass':ticker=='qualified'}} for i,ticker in enumerate(['legacy','qualified','qualified'])]
        calls=[]
        def fetch(ticker):calls.append(ticker);return {'status':'settled','result':'yes'}
        self.assertEqual(settle_records(rows,fetch,now,limit=1,workers=4),2)
        self.assertEqual(calls,['qualified']);self.assertNotIn('result',rows[0])

    def test_source_outage_leaves_results_pending(self):
        rows=[{'ticker':'a','eventTime':'2026-10-20T00:00:00Z'}]
        def offline(ticker):raise OSError('unavailable')
        self.assertEqual(settle_records(rows,offline,datetime(2026,10,22,tzinfo=timezone.utc),workers=4),0)
        self.assertNotIn('result',rows[0]);self.assertIn('settlementRetryAt',rows[0])
