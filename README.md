# Sports Betting Dashboard

A static dashboard for NFL, MLB, NCAAF, and UFC picks and parlay ideas. [Open the live dashboard](https://sc337.github.io/NFL-parlay-generator/).

## What it shows

- A featured pick, sport-specific recommendations, and a parlay builder for the selected sport. NFL also has same-game and multi-game modes.
- Moneyline, spread, total, and supported player-prop markets when those markets are available. Picks show their game or fight, and team or player imagery where available.
- **More Analysis** for secondary picks, market consensus, and the pick-history report.

The dashboard uses current market snapshots. If a sport has no qualifying pregame pick or its data is unavailable, it says so instead of showing demo bets. Suggested parlays are ideas; check the exact line and price at your sportsbook before deciding whether to place one.

## Data and probabilities

A scheduled GitHub Actions workflow refreshes Kalshi snapshots and free sports context for all four sports. Market consensus can also compare Kalshi with public Polymarket data. The Odds API is optional: requests are made only after you enter your own key in Settings. The key is stored in your browser, not in the repository. GitHub Pages cannot keep a browser-entered key secret from the browser's network requests.

**Market probability** comes from quoted prices. **Model probability** is an independent estimate only where enough sport-specific context exists; otherwise the pick is a market-quality signal. NCAAF currently has no independent projection, and some MLB and UFC markets also lack one. **Edge** is the model probability minus the market-implied probability. **EV** uses both the model probability and the offered payout; the dashboard should not treat a market-only signal as proven positive EV. A positive estimate is not a guarantee of profit.

## Pick history and calibration

The scheduled job saves selected featured **pregame straight picks** to `data/pick-history.json` and later settles them against the original Kalshi contract. It records the first observed probability for a contract and side. Pending and void picks do not count as wins or losses. It does not track every displayed parlay or a bet you personally place.

**More Analysis → Forecast check** shows the selected sport's history. Accuracy metrics appear after 30 settled picks of the same forecast type. A separate calibration job may adjust future independent model probabilities for a sport and market group after at least 30 earlier settled events and 20 later validation events, and only if the later probability error improves. It stays off when there is too little data or validation fails. Market-only picks do not train that adjustment. This is prospective tracking, not a backtest or a guarantee of better future results.

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
python -m unittest discover -s tests -p 'test_settle_history.py'
```
