# Sports Betting Dashboard

A static dashboard for NFL, MLB, NCAAF, UFC, and NHL picks and parlay ideas. [Open the live dashboard](https://sc337.github.io/NFL-parlay-generator/).

## What it shows

Each sport opens with a shared Today / Next slate / Choose date filter and Pick of the Day. The same date applies to straights and parlays. Parlay controls are grouped in Parlay options, with labeled Conservative / Balanced / Lotto buttons where multiple profiles are supported. Settings offers American, decimal, or Kalshi-cent odds display while preserving source labels. Empty Extra Picks sections are hidden.

- A featured pick, sport-specific recommendations, and a parlay builder for the selected sport. NFL also has same-game and multi-game modes.
- Moneyline, spread, total, and supported player-prop markets when those markets are available. Picks show their game or fight, and team or player imagery where available.
- **More Analysis** for secondary picks, market consensus, and the pick-history report.
- **Bankroll Builder** is the first, standalone tab and a compact cross-sport straight-bet watchlist. Enter a bankroll and the exact sportsbook odds for the *same line* to see a provisional stake or a clear pass. Alt lines qualify only if they are listed as their own market. NCAAF remains ineligible until its prospective independent estimates have at least 30 settled games and beat the market on Brier score. Parlays are not sized without a real combined offer and a tested joint probability.

Bankroll Builder starts with no balance rather than assuming a $100 bankroll. A provisional positive-EV straight is capped at 0.5% of available cash and 2% in total daily stakes. These limits do not guarantee safety or profitability; the sport models are not yet proven. Only bets you explicitly **Record bet placed** enter the private browser ledger. Manually mark a recorded bet Win, Loss, or Void; pending stakes are reserved, voids are refunded, and the trend shows balance changes. Editing the bankroll creates an adjustment separate from betting profit. Export a JSON backup under **History & trend** before clearing browser storage or changing devices. There is no sportsbook sync or automatic settlement, and the published pick-history audit is separate from your actual bets.

Generate chooses the highest-ranked qualifying build for the selected leg count. Repeated clicks keep the same picks until market data, eligibility, or settings change. It never rotates to weaker combinations just to show something new.

The dashboard uses current market snapshots. If a sport has no qualifying pregame pick or its data is unavailable, it says so instead of showing demo bets. Suggested parlays are ideas; check the exact line and price at your sportsbook before deciding whether to place one.

## Data and probabilities

A scheduled GitHub Actions workflow refreshes Kalshi snapshots and free sports context for all five sports. Market consensus can also compare Kalshi with public Polymarket data. The Odds API is optional: requests are made only after you enter your own key in Settings. NFL uses FanDuel team lines and supported player props when the key is available, with Kalshi as the fallback for unavailable keys, exhausted quota, or failed requests. Fresh, matching snapshot context enriches FanDuel picks without copying exchange prices. API Saver caches price requests for no more than 25 minutes in Saver and Ultra modes. The key is stored in your browser, not in the repository. GitHub Pages cannot keep a browser-entered key secret from the browser's network requests.

**Market probability** comes from quoted prices. **Model probability** is an independent estimate only where enough sport-specific context exists; otherwise the pick is a market-quality signal. MLB game and team totals use 20,000 repeatable run simulations per game, using completed games from the last 30 days and available probable-pitcher context. They show projected team/game runs and a middle-80% game-score range. They are experimental, require sufficient recent scores and a fresh pregame matchup, and otherwise say “Market-only; no run projection.” NCAAF likewise shows **experimental** pregame estimates when completed ESPN scores and SportsDataverse team box scores cover both teams. Outdoor games may also use a National Weather Service forecast matched to the venue city. Neither experimental model uses Kalshi prices as a simulation input; their displayed EV at a quoted ask is not a validated betting advantage. Some other MLB and UFC markets lack an independent projection. **Edge** is the model probability minus the market-implied probability; **EV** also uses the offered payout. A positive estimate is not a guarantee of profit.

NHL currently supports schedule-verified pregame moneylines, puck lines, and goal totals, including alternate lines available in the feed. NHL Markets includes a local-calendar date filter and Standard / ALT only / Both line modes (Both by default). ALT selections are labeled on featured picks and parlay/prop tiles. Puck lines other than ±1.5 are alternate; for totals and props, the quoted threshold nearest 50% is the reference, not a sportsbook-designated main line. Line mode is remembered independently of NFL; date selection resets to All dates on reload. Filters never synthesize quotes. ALT recommendations require a model estimate of at least 55%, coverage of at least 0.45, an ask no higher than 80 cents, an estimate at least three percentage points above ask, and quotes at most 30 minutes old. Maximum reference-line shifts are one goal for totals/puck lines/goals/assists/points, two shots, or three saves; unmodeled ALT markets are excluded. These are product guardrails, not validated evidence of profit. All modeled NHL markets rank using price-adjusted edge and model coverage alongside probability and quote quality. The NHL Markets controls separately toggle moneylines, puck lines, game totals, goals, assists, points, shots on goal, and goalie saves. They sit outside the collapsed Parlay options panel, filter the featured pick, parlay, and prop list, and are saved independently of NFL settings. Modeled props must have an estimated chance above the current ask price to qualify; they rank by coverage-weighted price edge, win chance and quote quality rather than raw probability alone. Unmodeled props remain explicitly market-only, and the list does not force an over/under mix. These experimental comparisons exclude fees and are not a validated betting edge. Markets without current quotes are disabled; selecting a category does not fabricate lines or add missing model coverage. Its multi-game builder uses one selection per matchup and supports 2–6 legs, with verified goals, assists, and points props where quoted. NHL has an experimental independent Poisson score model and negative-binomial player production model using official NHL regular-season stats, prior-season shrinkage, shot rates, current rosters, and ice time. Quotes never enter projected scores or player counts. Market prices are used separately for comparison and estimated return. Tied scores use a 50/50 deciding goal; team defense reflects average historical goaltending, without assuming a starting goalie. Player probabilities assume participation. Saves stay market-only without confirmed starter and usage data. Preseason, stale context, small samples, and unverified players do not receive model probabilities. Forecasts are tracked prospectively as experimental; no validated betting edge or bankroll sizing is implied. Expired feeds clear the NHL picks; use the refresh button to retrieve current quotes.

## Pick history and calibration

The scheduled job saves selected featured **pregame straight picks** to `data/pick-history.json` and later settles them against the original Kalshi contract. It records the first observed probability for a contract and side. Pending and void picks do not count as wins or losses. It does not track every displayed parlay or a bet you personally place.

**More Analysis → Forecast check** shows the selected sport's history. Accuracy metrics appear after 30 settled picks of the same forecast type. A separate calibration job may adjust future independent model probabilities for a sport and market group after at least 30 earlier settled events and 20 later validation events, and only if the later probability error improves. It stays off when there is too little data or validation fails. Market-only picks do not train that adjustment. This is prospective tracking, not a backtest or a guarantee of better future results.

The scheduled job also records the first pregame quote and forecast for every liquid market with a verifiable start time in `data/forecast-audit.json`. It settles contracts and publishes `data/forecast-report.json` with pregame timing checks, model-versus-market Brier and log-loss scores, calibration bins, and gross return for positive-EV forecasts by sport and market. NCAAF and MLB-total experimental estimates are tracked separately from validated models and never counted as positive-EV picks in that audit. NFL totals also compare the model and market with final scores and retain no-weather/no-form forecasts for feature tests. The dashboard waits for 30 distinct settled model events before displaying an accuracy comparison. This audit does not change recommendations or train calibration. Markets without a reliable start time or quote are excluded; earlier events are never reconstructed from later data. The return check excludes fees and is not a ledger of placed bets.

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
# October 14: shared evidence upgrades and NBA

Sport tabs are alphabetized: MLB, NBA, NCAAF, NFL, NHL, UFC. NFL remains the
default landing sport, and saved sport/leg/market preferences remain separate.

- Details distinguish estimated likelihood, input coverage and unresolved
  availability. These are not measured confidence percentages.
- First-observed forecasts remain immutable. Market-anchored NFL suggestions
  are recorded as `market_supported`, not independent model/EV evidence. NBA,
  player-history and other experimental estimates keep separate cohorts.
- Multi-game builds search complete combinations, reject repeated games or
  players, penalize the weakest input coverage and pass when a full build cannot
  qualify. This objective is not a validated joint win-probability model.
- NFL no longer derives player yardage from another offered attempts/receptions
  threshold using generic rates. Completed-play history is required instead.
- MLB uses available pitcher strikeout/walk rates alongside ERA. College
  margins use leave-one-game-out opponent strength. NHL uses observed rest and
  available special-teams percentages with bounded adjustments. UFC adds a
  grappling-style interaction and rejects stale timestamped fighter profiles.

NBA uses schedule-verified Kalshi quotes, ESPN completed box scores and current
rosters. Team projections use estimated possessions, shrunk offensive/defensive
efficiency, pace, home court and rest. Props use same-team per-minute production,
projected minutes, paired combination-stat variance and discrete count tails.
Supported menus: moneyline, spread, total, points, rebounds, assists, threes,
PRA, points/rebounds, points/assists, rebounds/assists, steals and blocks. Menus
are disabled when real quotes are unavailable; unsupported/ambiguous identities
are excluded. Reference lines are the nearest-to-50% exchange threshold, not a
verified sportsbook main. Nearby ALT props support overs only.

NBA refreshes in an isolated worker. Preseason, thin history, uncertain player
availability, unstable minutes, stale prices and unmatched schedules yield a
pass. No model is promoted to validated without the existing later-event
holdout test. Confirmed NBA/NHL starters, advanced shot-quality data and richer
NFL route/snap data are not fabricated when the current feeds cannot establish
them. Prices remain source quotes, not a guarantee of Caesars availability.

### Pick quality policy (October 15, 2026)

All six sports use the same price-age, event-start, compatibility, evidence and
uncertainty checks. Market-supported NFL estimates no longer bypass the edge
buffer. Missing sport context widens that buffer without adding a favorable
projection adjustment. Inside 90 minutes of kickoff, unconfirmed participation
blocks featured picks and parlay legs. Early conditional estimates remain
explicitly unvalidated. Existing saved preferences are retained; new NFL sessions
default to model-screened recommendations and two legs. Explicit Kalshi parlay
ideas remain available as reference-only exploration.

- **Straights:** estimated likelihood, a named selection buffer (not a statistical
  confidence interval), missing inputs, and the minimum acceptable odds are in
  Details. Passing a gate does not establish profitability.
- **Parlays:** Risk & price check shows combined likelihood and accepts a current
  combined sportsbook price for the exact displayed selections. The check expires
  after 15 minutes and never replaces any feed price. Multi-game probabilities
  assume independence. SGP prices are never calculated by multiplying leg odds.
- **NFL SGPs:** 24,000 deterministic scenario trials share pace, scoring, passing,
  rushing and player factors across legs. Three assumed-dependence settings form
  a sensitivity range, not a confidence interval. Loadings are not fitted or
  validated; the scenarios cannot certify SGP value. Unsupported or mismatched
  games produce no joint estimate. Simulations run only for selected builds,
  not every search candidate.
- **Profiles:** Conservative is estimated hit chance >=30%, Balanced >=15%,
  Lotto <15%. These are product policy thresholds, not historical win rates.
  Screened NFL profiles must satisfy their aggregate likelihood category;
  otherwise that profile passes. Higher odds alone do not establish quality.
- **Sport inputs:** NFL role stability uses opportunity variation and recent
  declines instead of market breadth. NBA estimates expose projected minutes,
  collect used possessions, and reject large recent minute changes. MLB collects
  official weather, confirmed lineups and three-day relief-pitcher workload;
  bounded experimental temperature, directional wind and bullpen adjustments
  enter run means. NCAA small samples and unconfirmed quarterbacks widen
  uncertainty. NHL flags goalie and line-role gaps. UFC tracks recent sample,
  weight-class and opponent-adjustment coverage without fabricating missing data.
- **Unavailable inputs:** the free feeds do not consistently verify NHL starters,
  line/power-play assignments, NCAA starting quarterbacks, or opponent-adjusted
  UFC histories. These remain explicitly missing; they are not advertised as
  completed data integrations. NHL saves remain unsupported.
- **Prospective audit:** new records freeze the qualification decision, buffer,
  missing inputs, model version and source commit before kickoff. Historical
  records are not reclassified. Diagnostics separates qualified selections from
  rejected/all-market forecasts and reports calibration, reference returns,
  closing-price movement, and captured parlay outcomes. SGP returns require actual
  combined prices and are not synthesized. Reference returns exclude fees and
  are hypothetical, not a placed-bet ledger. Build outcomes overlap and must not
  be treated as independent trials. Accuracy and profitability remain unproven.

Validation: Node behavior/regression suite, Python feed/identity/settlement suite,
and offline builder capture against the saved six-sport feeds.

### Forward model learning and paper tracking

The `learning-20261015` model version adds separate opportunity and efficiency
projections: NFL carries/targets (including catch rate for receiving yards), NBA
minutes, MLB plate appearances/batters faced, and NHL ice time when recent
same-team logs are available. Five observations are required for decomposition.
Thin data keeps its existing experimental fallback. Material shifts between the
last two opportunities and the earlier baseline are labeled rising/falling and
block qualified picks until the role stabilizes.

`scripts/train_model_learning.js` fits dated artifacts in
`data/model-learning.js`. It only accepts frozen forecasts from this exact model
version, with known settlement timestamps before training/validation cutoffs.
Entire events and UTC dates stay together, and scoring gives every game equal
weight rather than letting alternate-line ladders dominate. Three chronological
evaluation windows compare market, simple-production and available ablation
baselines. Validated selection status additionally requires held-out improvement
over the market and available simple/ablation forecasts.

Empirical selection buffers and NFL pair-correlation rules require at least 60
earlier training events and 30 later validation events. Buffer bins also need 25
training events and sufficient later coverage. A learned buffer replaces the fixed
base only when its held-out checks pass; missing-context penalties remain.
Historical SGP correlations activate only when every required pair relationship
has adequate metadata and improves later joint log loss over independence.
Positive-definite shrinkage keeps scenario matrices usable. Full SGP probabilities
and betting value remain unvalidated. With insufficient evidence, the dashboard
says evidence is collecting and retains the labeled experimental assumptions.
Older forecasts are never retroactively assigned the new model version.

**Paper tracking:** expand a straight's Details or a parlay's Risk & price check,
then Track paper pick. Enter the exact sportsbook, current combined odds, offer
terms and fee per $1 stake. No wager is placed. Records are saved on this device;
export them from Settings → Diagnostics → Forward paper ledger. Entries are
immutable and must precede every event. Later manual price observations must
match the same sportsbook, lines and offer terms and occur before kickoff;
only the last 15 minutes qualify as a near-start closing observation. The app
does not claim an automated Caesars closing-price feed.

Confirm the final result at the same book after the events have started.
Results are explicitly user-confirmed paper outcomes, not verified placed bets.
Net paper returns include the entered fees. Unknown fees or revised payouts after
partially voided parlays remain unavailable. Straights, multi-game parlays and SGPs
have separate metrics; overlapping builds are not independent trials. No claimed
edge or future profit follows from a small paper sample.

### Public starter checks (October 16, 2026)

The dashboard reads today's public RotoWire NBA lineup cards and Daily Faceoff
NHL goalie/line-combination pages without an additional API subscription. The
isolated `starter-checks` worker refreshes every five minutes while running;
GitHub scheduling/publication can delay delivery. It follows robots.txt, uses no
credentials and never calls those sites' private APIs or subscriber pages.

Evidence is matched to the scheduled game, team and current roster. NBA cards
need exactly five unique roster matches and an explicit Confirmed Lineup status.
NHL goalies need an explicit confirmation in that game's reporting window.
Practice/last-game lines remain reported, not confirmed. Fetch failures remove
that source's confirmations; records expire after 30 minutes without a new
check. Public source links and last-check times appear in Settings → Starter checks.

Open a sport to load its games, then use Settings → Starter checks for a sourced
manual check. These are labeled user-confirmed, saved only on that device, expire
within two hours or at game time and can be cleared. Conflicting confirmations
block affected selections. Manual checks cannot bypass injuries, thin history,
unstable minutes or other eligibility requirements. Changing evidence refreshes
the active sport's recommendations and invalidates displayed offer checks.

NCAAF QB confirmation remains manual from a game-specific school/coach
announcement; the panel links conference availability reports for reference.
Depth-chart rank or availability alone never confirms the QB. There is no
universal automated school-announcement parser. NHL goalie confirmation does not
yet add individual-goalie performance to the team-average score model, and goalie
saves remain unsupported. Starting-status evidence does not validate a model or
establish a profitable edge. No paid feed has been connected.

### Expanded college-football coverage

NCAAF combines Kalshi markets with ESPN's upcoming FBS schedule and the current DraftKings moneylines, signed spreads and totals supplied by ESPN. The public feed uses no paid Odds API quota. A collapsed Full NCAAF Slate lists schedule-only games and exclusions for the selected date. The rolling price worker refreshes the source along with NCAAF markets.

Public sportsbook prices are labeled references with their retrieval time, rather than an asserted bookmaker update time. Missing current prices never fall back to opening lines. Source failures retain available Kalshi coverage. Reference prices still require independent context and the existing uncertainty checks, expire after 30 minutes, and must be checked at the user's book. Supported full-game public references are tracked prospectively and settled against verified ESPN finals in a separate public-source evaluation cohort. More schedule coverage does not imply validated model accuracy.

### Public schedule and sportsbook gap filling (all sports)

Every sport's rolling refresh now checks ESPN's upcoming scoreboard after the primary pipeline. Fresh native selection/line quotes take precedence. ESPN's current attributed sportsbook odds (usually DraftKings) fill missing, expired, wide or unusable exchange selections. NFL, NBA, NHL, MLB and NCAAF support moneyline, spread/run/puck line, and total references when ESPN supplies actual current prices. The public UFC scoreboard currently provides fight schedules without odds; those fights remain schedule-only. No player props, specialty markets, opening-price substitutes, fabricated exchange bids or liquidity are generated.

Official NHL and MLB context IDs require matching both participants and kickoff, including separate doubleheader start times. All reference rows keep their actual source and retrieval timestamp, expire after 30 minutes, retain model and starter checks, and use a separately identified ESPN final-score settlement contract when the full-game participants, direction and line are verified. Original native quote timestamps survive public-source refreshes. A primary failure can recover through public references; if both sources fail, the worker restores prior data. The collapsed Full Slate display respects the selected sport and date.

### Availability, recent usage and source-aware results

Rolling refreshes attach dated injury reports to unique exact player/team matches and compare recent completed-game workload with earlier workload. Report dates remain separate from fetch times; reports older than 14 days require confirmation rather than blocking a current pick. Current unavailable or questionable statuses and material usage changes block affected props through the shared browser/server quality gate. Missing reports do not establish that a player is healthy or starting. The collapsed Availability & Usage panel displays affected players and the check time. NFL opportunity history retains its original nflverse attribution; NBA minutes come from the existing ESPN histories, and other supported sports use bounded completed ESPN box-score refreshes. Missing samples stay incomplete.

First-observed supported sportsbook-reference forecasts now retain exact ESPN event IDs, participants, signed lines, source prices and a full-game settlement descriptor. Verified final scores grade moneyline, spread and total forecasts; pushes are preserved and excluded from binary calibration. Postponements, mismatches, tied moneylines and shortened baseball games remain pending for rule review. Original Kalshi contracts keep their existing contract settlement. Public-reference calibration groups have a `:public` suffix, and the forecast report includes source counts; collecting these results does not itself validate a model. These are hypothetical reference returns, not records of placed wagers.
