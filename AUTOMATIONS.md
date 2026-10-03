# Dashboard automations

The existing scheduled market refresh also captures recommendations and checks
data health. The date boundary is America/Los_Angeles.

## Daily recommendation archive

- `data/daily-picks.json` contains the current day's builds and archive dates.
- `data/daily-picks/YYYY-MM-DD.json` preserves each day's captured builds.
- Uses the actual browser builders for 2–6 legs. NFL captures Conservative,
  Balanced and Lotto multi-game builds and the next pregame matchup's SGPs.
  Other sports use their default builder, markets, date and card settings.
- Featured straight picks are captured when qualified for the current date.
- Captures default settings, not an individual's browser selections or wagers.
- A build's first quote, estimate, capture time and source commit remain fixed.
  Changes in selected contracts create another record, rather than overwrite it.
- No archive entry is created for a stale feed, missing quote or unverified start.
  Partial builds retain both requested and available leg counts. Passes and
  capture errors remain visible in the current-day diagnostics.
- Outcomes are joined from the existing prospective forecast audit. Same-game
  combined prices are left unavailable; no parlay win probability is fabricated.

## Problem alerts

- `data/dashboard-health.json` records current alerts, first-seen/change times,
  resolved alerts and the GitHub Actions run URL.
- Checks stale feeds (>30 minutes, critical >2 hours), invalid snapshots,
  missing executable prices, unverified start times, missing player data,
  disappeared player markets and large losses of still-upcoming games.
- An empty offseason feed is normal. Unqualified recommendations are passes.
- The health step runs after failures too, produces GitHub annotations and a job
  summary, and uploads a diagnostic artifact retained for 30 days. Failed jobs
  do not publish partial market data; inspect their run/artifact instead.
- The ChatGPT dashboard problem watch checks hourly and reports new or escalated
  issues. It also checks workflow failures and report freshness independently,
  so a stopped refresh cannot hide behind an old healthy report.

Regression cases run before archive generation in the scheduled workflow.
