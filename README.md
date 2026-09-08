# NFL Parlay Generator

A lightweight, mobile-first NFL parlay generator designed for GitHub Pages.

## Modes

### Same Game Parlay
Builds 2-6 leg SGPs and explicitly rewards logical positive correlation, including:
- QB passing + WR receiving
- Favorite ML/spread + favorite-team player production
- Game over + offensive overs
- Passing volume + scoring legs

The generator penalizes redundant team-line combinations such as stacking a moneyline and spread for the same team.

### Multi-Game Parlay
Selects strong legs across different games to diversify game-specific exposure.

## Risk profiles
The risk slider changes which legs can make it into a build. Results are shown as:
- Safer
- Best Balance
- Longshot

## Data
The app can use FanDuel team markets through The Odds API. Because GitHub Pages is static, API keys cannot be securely hidden in front-end code. The key is entered in Settings and stored only in browser localStorage.

Without a key, the app uses demo market data so the UI and generation logic remain testable.

## GitHub Pages
Repository settings:
1. Settings → Pages
2. Source: Deploy from a branch
3. Branch: main / root


## Live player props

When an API key is connected, the app now lazily requests FanDuel event-level NFL player props only when they are needed. Supported live categories include passing yards/TDs/attempts/completions, rushing yards/attempts, receiving yards/receptions, and anytime TD.

SGP correlation currently rewards:
- Same-player volume combinations
- Same-player yardage + touchdown combinations
- Passing + receiving game scripts
- Game Over + offensive Over props

Player-team correlation is intentionally not inferred from names alone because the odds response does not provide a normalized team field for player outcomes. A roster-mapping layer can be added separately.


## Context enrichment: ESPN + nflverse

The parlay engine now enriches live player-prop outcomes with roster/team/position context.

- ESPN Site API is used as the current-roster layer for the two teams in a selected matchup.
- nflverse season roster data is loaded from the official nflverse-data GitHub release as an open fallback.
- ESPN matches take priority when both sources identify the same player.
- Enriched player props receive team, position, and context-source metadata before SGP construction.

This improves same-team QB/WR/TE correlation, favorite-control rushing scripts, and underdog pass-volume scripts.

ESPN's Site API endpoints are not a formally supported public developer API, so the integration is defensive and gracefully falls back to nflverse if ESPN changes or is unavailable.
