# Sports Betting Dashboard

A static dashboard for NFL, MLB, NCAAF, and UFC picks and parlay ideas. [Open the live dashboard](https://sc337.github.io/NFL-parlay-generator/).

## What it shows

- A featured pick, sport-specific recommendations, and a parlay builder for the selected sport. NFL also has same-game and multi-game modes.
- Moneyline, spread, total, and supported player-prop markets when those markets are available. Picks show their game or fight, and team or player imagery where available.
- **More Analysis** for secondary picks, market consensus, and the pick-history report.
- **Bankroll Builder** is the first, standalone tab and a compact cross-sport straight-bet watchlist. Enter a bankroll and the exact sportsbook odds for the *same line* to see a provisional stake or a clear pass. Alt lines qualify only if they are listed as their own market. NCAAF remains ineligible until its prospective independent estimates have at least 30 settled games and beat the market on Brier score. Parlays are not sized without a real combined offer and a tested joint probability.

Bankroll Builder starts with no balance rather than assuming a $100 bankroll. A provisional positive-EV straight is capped at 0.5% of available cash and 2% in total daily stakes. These limits do not guarantee safety or profitability; the sport models are not yet proven. Only bets you explicitly **Record bet placed** enter the private browser ledger. Manually mark a recorded bet Win, Loss, or Void; pending stakes are reserved, voids are refunded, and the trend shows balance changes. Editing the bankroll creates an adjustment separate from betting profit. Export a JSON backup under **History & trend** before clearing browser storage or changing devices. There is no sportsbook sync or automatic settlement, and the published pick-history audit is separate from your actual bets.

The dashboard uses current market snapshots. If a sport has no qualifying pregame pick or its data is unavailable, it says so instead of showing demo bets. Suggested parlays are ideas; check the exact line and price at your sportsbook before deciding whether to place one.

## Data and probabilities

A scheduled GitHub Actions workflow refreshes Kalshi snapshots and free sports context for all four sports. Market consensus can also compare Kalshi with public Polymarket data. The Odds API is optional: requests are made only after you enter your own key in Settings. The key is stored in your browser, not in the repository. GitHub Pages cannot keep a browser-entered key secret from the browser's network requests.

**Market probability** comes from quoted prices. **Model probability** is an independent estimate only where enough sport-specific context exists; otherwise the pick is a market-quality signal. NCAAF now shows explicitly **experimental** pregame estimates when completed ESPN scores and SportsDataverse team box scores cover both teams. Outdoor games may also use a National Weather Service forecast matched to the venue city. The model does not use Kalshi prices as an input. NCAAF picks remain ranked by market quality, and its experimental estimates are not claimed as proven edge or EV. Some MLB and UFC markets also lack an independent projection. **Edge** is the model probability minus the market-implied probability; **EV** also uses the offered payout. A positive estimate is not a guarantee of profit.

## Pick history and calibration

The scheduled job saves selected featured **pregame straight picks** to `data/pick-history.json` and later settles them against the original Kalshi contract. It records the first observed probability for a contract and side. Pending and void picks do not count as wins or losses. It does not track every displayed parlay or a bet you personally place.

**More Analysis → Forecast check** shows the selected sport's history. Accuracy metrics appear after 30 settled picks of the same forecast type. A separate calibration job may adjust future independent model probabilities for a sport and market group after at least 30 earlier settled events and 20 later validation events, and only if the later probability error improves. It stays off when there is too little data or validation fails. Market-only picks do not train that adjustment. This is prospective tracking, not a backtest or a guarantee of better future results.

The scheduled job also records the first pregame quote and forecast for every liquid market with a verifiable start time in `data/forecast-audit.json`. It settles contracts and publishes `data/forecast-report.json` with pregame timing checks, model-versus-market Brier and log-loss scores, calibration bins, and gross return for positive-EV forecasts by sport and market. NCAAF experimental estimates are tracked separately from validated models and never counted as positive-EV picks. NFL totals also compare the model and market with final scores and retain no-weather/no-form forecasts for feature tests. The dashboard waits for 30 distinct settled model events before displaying an accuracy comparison. This audit does not change recommendations or train calibration. Markets without a reliable start time or quote are excluded; earlier events are never reconstructed from later data. The return check excludes fees and is not a ledger of placed bets.

## Run and deploy

No build step is required. To view the site locally from the repository root:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. The local view uses the committed snapshots. GitHub Pages serves `main` from the repository root; `.github/workflows/update-kalshi.yml` refreshes the generated data on a schedule or through a manual workflow run.

For the focused checks used by this project:

```bash
node tests/prediction-model.test.js
node tests/pick-history.test.js
node tests/model-calibration.test.js
node tests/forecast-audit.test.js
python -m unittest discover -s tests -p 'test_settle_history.py'
```
