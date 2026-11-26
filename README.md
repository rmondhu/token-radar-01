# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rmondhu/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rmondhu/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

**Token Launch Radar** — 100 protocols with no token yet, ranked by implied
circulating market cap, each with a category-generic farm plan. Built for the
make.fun bounty "Build the best token launch radar" ($1,325, top 10 share the pot).

## What it is

A static dashboard (`dashboard/`, no network, works from `file://`) ranking the
40-protocol watchlist from the sealed DefiLlama snapshot (as of **2026-11-14**)
plus the next 60 no-token protocols below the $50M floor by TVL — 100 rows,
every one clickable for a full detail view (TVL, implied value and its p25–p75
range, score factors, chains, farm plan), with filters by category, chain, text
search and a watchlist-only toggle.

## How the ranking works

No fees, revenue or users exist in the snapshot, so the only value anchor is the
market's own multiple: the median **mcap/TVL** of token-bearing protocols in the
same category (128 comparables with a positive circulating mcap). Categories
with fewer than 5 comparables use the fallback multiple **0.082** (median of the
52 comparables with TVL ≥ $50M).

```
implied_mcap_usd = tvl_usd × multiple            (circulating mcap — NEVER FDV)
growth_factor    = 1 + clamp(change_7d, -50, +100) / 100
breadth_factor   = 1 + 0.02 × min(chain_count, 10)
score            = implied × growth × breadth    (rank key)
```

Top 5: **Steakhouse Financial** ($225.8M implied / $265.0M score), **Gauntlet**
($129.4M / $164.0M), **Veda** ($128.2M / $141.1M), **Bittensor dTAO**
($128.8M / $122.7M), **USDD** ($86.6M / $89.2M). Total implied circulating
mcap across the 40 watchlist rows: ~$1.51B on $12.93B TVL.

## Honest limits (read before trusting the board)

- The snapshot is **12 days stale** at build time (2026-11-14) — nothing here is live.
- Implied value is a **circulating market cap, never FDV** — the snapshot has no supply data.
- A protocol being on the board is **not** a claim it will launch a token. The
  snapshot contains no launch signal; several rows are vault/curator businesses,
  stablecoins, chains or networks that may never issue a token.
- **Farm plans are category-generic** (chains + action family + age/TVL/momentum
  context). **Points status is unverified for every row** — the snapshot never
  says whether a protocol has a points program, a yield, or any incentive.
- The watchlist is used **verbatim** from the snapshot; it cannot be recomputed
  (20 child products are excluded only via data not in the file).

## Files

- `main.ts` — the whole build: reads `input/snapshot.json`, computes the board,
  writes `board.json` and `dashboard/data.js` from one computation, then writes
  `dossier.json` via the kit library. Node 22, standard library only, no
  network, deterministic — run `node main.ts` twice and the outputs are
  byte-identical.
- `board.json` — the 100 ranked rows.
- `dashboard/` — `index.html`, `app.css`, `app.js`, `data.js` (embedded data).
- `screenshots/` — `1-board.png` (full board), `2-detail.png` (Steakhouse
  detail), `3-filtered.png` (Risk Curators filter).
- `dossier.json` — the `makefun/dossier/v1` dossier of `dashboard/` +
  `screenshots/`, produced by `vendor/makefun-board.ts`.
- `input/snapshot.json` — the sealed snapshot (data, not code).
- `vendor/makefun-board.ts` — make.fun's dashboard-dossier library, copied as-is.

## Reproduce

```
node main.ts
```

Then open `dashboard/index.html` in any browser (or serve `dashboard/` over
HTTP). No install, no build, no network.

---

Built for the make.fun bounty — see https://make.fun/
