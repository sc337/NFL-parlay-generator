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
