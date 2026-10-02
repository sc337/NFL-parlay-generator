import unittest
from datetime import datetime, timezone
from scripts.update_kalshi_nhl import normalize_prop, official_game
from scripts.update_nhl_context import player_stats, team_stats, schedule_games, name_key
import test_nhl_markets

class NhlPropsTests(unittest.TestCase):
    def setUp(self):
        self.events=test_nhl_markets.NhlMarketsTests().events()
        self.context={'games': {'1': {'id':'1','away':'BOS','home':'NYR','start':'2026-10-03T23:00:00+00:00','season_type':2}},
            'rosters':[{'id':'100','name':'Test Player','key':name_key('Test Player'),'team':'BOS','position':'C','headshot':''}]}
        self.market=test_nhl_markets.NhlMarketsTests().market('KXNHLPTS','BOSTPLAYER100-2',title='Test Player: 2+ points',floor_strike=1.5,strike_type='greater')
    def test_prop_sides_are_roster_verified_with_exact_half_line(self):
        over,under=normalize_prop(self.market,'KXNHLPTS',self.events,self.context)
        self.assertEqual(over['label'],'Test Player Over 1.5 Points')
        self.assertEqual(under['label'],'Test Player Under 1.5 Points')
        self.assertEqual(over['context_game_id'],'1')
        self.assertTrue(over['player_verified'])
        self.assertEqual((over['yes_ask'],under['yes_ask']),(.58,.46))
    def test_unknown_ambiguous_and_wrong_club_players_are_excluded(self):
        for roster in [[], self.context['rosters']*2,[{**self.context['rosters'][0],'team':'COL'}]]:
            self.assertEqual(normalize_prop(self.market,'KXNHLPTS',self.events,{**self.context,'rosters':roster}),[])
    def test_wrong_metric_integer_strike_first_goal_and_bad_schedule_are_excluded(self):
        for patch in [{'title':'Test Player: 2+ goals'},{'floor_strike':2},{'title':'Test Player first goal'},{'status':'closed'}]:
            self.assertEqual(normalize_prop({**self.market,**patch},'KXNHLPTS',self.events,self.context),[])
        context={**self.context,'games':{'1':{**self.context['games']['1'],'start':'2026-10-04T23:00:00+00:00'}}}
        self.assertIsNone(official_game(self.events[0],context))
    def test_only_goaltenders_receive_saves_markets(self):
        saves={**self.market,'title':'Test Player: 20+ saves','floor_strike':19.5}
        self.assertEqual(normalize_prop(saves,'KXNHLSAVE',self.events,self.context),[])
    def test_context_keeps_only_numeric_stats_and_strips_market_odds(self):
        self.assertEqual(player_stats([{'playerId':100,'gamesPlayed':0}]),{})
        self.assertEqual(team_stats([{'teamId':1,'gamesPlayed':20,'goalsForPerGame':float('nan')}],{1:'BOS'}),{})
        now=datetime(2026,10,2,tzinfo=timezone.utc)
        game={'id':1,'startTimeUTC':'2026-10-03T23:00:00Z','gameState':'FUT','gameScheduleState':'OK','gameType':2,
            'awayTeam':{'abbrev':'BOS','odds':[{'value':'+120'}]},'homeTeam':{'abbrev':'NYR'}}
        result=schedule_games({'gameWeek':[{'games':[game]}]},now)
        self.assertNotIn('odds',str(result))
        self.assertEqual(schedule_games({'gameWeek':[{'games':[{**game,'gameState':'LIVE'}]}]},now),{})

if __name__=='__main__':unittest.main()
