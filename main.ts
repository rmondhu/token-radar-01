// token-radar-01 — build the token launch radar board from input/snapshot.json.
//
// Reads the sealed DefiLlama snapshot (as_of 2026-11-14), ranks the 40 watchlist
// no-token protocols plus the top 60 no-token protocols below the $50M floor by an
// implied-circulating-mcap score, and writes board.json, dashboard/data.js and
// dossier.json. Node 22, standard library only, no network, deterministic:
// running `node main.ts` twice produces byte-identical outputs.
//
// Ranking (see research.md §5 — the only value anchor this file supports):
//   multiple(p) = median mcap/TVL of comparables in p.category, when that category
//                 has >= 5 comparables with mcap_usd > 0; otherwise the fallback
//                 0.0820 (median mcap/TVL of the 52 comparables with TVL >= $50M).
//   implied_value_usd(p) = tvl_usd(p) x multiple(p)        (circulating mcap, NEVER FDV)
//   growth_factor(p)    = 1 + clamp(change_7d, -50, +100) / 100   (null -> 1.0)
//   breadth_factor(p)   = 1 + 0.02 x min(len(chains), 10)
//   score(p)            = tvl x multiple x growth x breadth, rounded to whole dollars.
// Rows are ranked by implied value descending (ties: TVL desc, then slug asc);
// the score adjusts for growth and breadth but does not set the rank.
// The board is the watchlist verbatim (40 rows — never recomputed; 20
// parentProtocol exclusions are invisible in the snapshot) plus the top 60
// no-token protocols below the floor by TVL, tier-labelled.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
// In the grader the repo is mounted read-only at /bot and the sealed input is at
// /input, with a writable /output. Read the snapshot from MAKEFUN_INPUT_DIR and
// write every output to MAKEFUN_OUTPUT_DIR when they are set; locally (env unset)
// fall back to the repo itself, so `node main.ts` still reproduces the committed files.
const SNAPSHOT = process.env.MAKEFUN_INPUT_DIR
  ? join(process.env.MAKEFUN_INPUT_DIR, 'snapshot.json')
  : join(ROOT, 'input', 'snapshot.json');
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? ROOT;
const FLOOR_USD = 50000000;
const FALLBACK_MULTIPLE = 0.082;

// p25–p75 of the mcap/TVL multiple per category (research.md §5.2), used only for
// the displayed implied-value range (TVL x p25 … TVL x p75). Categories with fewer
// than 5 comparables use the fallback band.
const QUARTILES: Record<string, [number, number]> = {
  'Lending': [0.033, 0.423],
  'Dexs': [0.068, 1.524],
  'Liquid Staking': [0.032, 0.186],
  'Yield': [0.121, 1.0],
  'CEX': [0.034, 0.182],
  'RWA': [0.14, 0.415],
  'Canonical Bridge': [0.317, 1.344],
  'Basis Trading': [0.204, 0.998],
  'Bridge': [0.052, 0.989],
};
const FALLBACK_QUARTILES: [number, number] = [0.032, 0.317];

// Category-generic farm action family (research.md §6). The snapshot has no points
// program flag, no yields, no pools and no URLs, so every farm plan is generic and
// labelled "points status unverified".
const ACTIONS: Record<string, string> = {
  'Lending': 'Supply assets and borrow against collateral',
  'Dexs': 'Swap and provide liquidity',
  'RWA': 'Mint or hold the tokenised asset',
  'Risk Curators': 'Deposit into curated vaults',
  'Yield': 'Deposit into yield vaults',
  'Basis Trading': 'Open basis positions',
  'CDP': 'Mint stablecoin against collateral',
  'Restaking': 'Restake assets',
  'Payments': 'Use the network to pay and transact',
  'Chain': 'Use the chain — bridge in and transact',
  'Yield Aggregator': 'Deposit into aggregated yield vaults',
  'Liquid Restaking': 'Restake liquid staking tokens',
  'Staking Pool': 'Stake into the pool',
  'Stablecoin Wrapper': 'Wrap or hold the wrapped stablecoin',
  'Collateral Markets': 'Supply collateral to the market',
  'CeDeFi': 'Deposit into the CeDeFi vaults',
  'Insurance': 'Provide cover or buy cover',
  'Governance Incentives': 'Participate in governance incentives',
};

interface Protocol {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

// Compact dollars for the farm-plan sentence, e.g. $2.75B, $51.3M, $8.4M.
function compactUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
}

// Farm steps: the same farm-plan content as three complete sentences, each
// 20–600 characters (the gate requires 3–12 steps of 20–600 chars per row).
function farmSteps(p: Protocol): string[] {
  const action = ACTIONS[p.category] ?? 'Use the protocol';
  const shown = p.chains.slice(0, 3).join(', ');
  const rest = p.chains.length > 3 ? ` +${p.chains.length - 3} more` : '';
  const change = p.change_7d === null ? 'n/a' : `${p.change_7d > 0 ? '+' : ''}${p.change_7d.toFixed(2)}%`;
  const listed = p.listed_at ?? 'unknown';
  return [
    `${action} on ${shown}${rest}.`,
    `TVL ${compactUsd(p.tvl_usd)}, 7d ${change}, tracked since ${listed}.`,
    'Points status unverified — the snapshot has no points data.',
  ];
}

function main(): void {
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Snapshot;
  const bySlug = new Map(snap.protocols.map((p) => [p.slug, p]));

  // Comparables: token-bearing protocols with a positive circulating mcap.
  // mcap_usd <= 0 (15 rows at 0, 1 at -1) are data errors / unpriced tokens.
  const comps = snap.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
  const byCategory = new Map<string, number[]>();
  for (const p of comps) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(p.category, list);
  }
  const multiples = new Map<string, number>();
  for (const [cat, ratios] of byCategory) {
    if (ratios.length >= 5) multiples.set(cat, round4(median(ratios)));
  }
  const fallback = round4(median(comps.filter((p) => p.tvl_usd >= FLOOR_USD).map((p) => p.mcap_usd! / p.tvl_usd)));
  if (fallback !== FALLBACK_MULTIPLE) {
    throw new Error(`fallback multiple recomputed as ${fallback}, expected ${FALLBACK_MULTIPLE}`);
  }

  const noToken = (p: Protocol): boolean => p.gecko_id === null && p.symbol === null;

  // Board: the watchlist verbatim, then the top 60 no-token protocols below the
  // floor by TVL. Never recompute the watchlist.
  const watchlist = snap.watchlist.map((slug) => {
    const p = bySlug.get(slug);
    if (!p) throw new Error(`watchlist slug not in snapshot: ${slug}`);
    return { p, tier: 'watchlist' as const };
  });
  const belowFloor = snap.protocols
    .filter((p) => noToken(p) && !snap.watchlist.includes(p.slug) && p.tvl_usd < FLOOR_USD)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, 60)
    .map((p) => ({ p, tier: 'below_floor' as const }));
  const picked = [...watchlist, ...belowFloor];

  const rows = picked.map(({ p, tier }) => {
    const hasCategoryMultiple = multiples.has(p.category);
    const multiple = hasCategoryMultiple ? multiples.get(p.category)! : FALLBACK_MULTIPLE;
    const quartiles = hasCategoryMultiple ? QUARTILES[p.category]! : FALLBACK_QUARTILES;
    const impliedRaw = p.tvl_usd * multiple;
    const growth = p.change_7d === null ? 1 : 1 + clamp(p.change_7d, -50, 100) / 100;
    const breadth = 1 + 0.02 * Math.min(p.chains.length, 10);
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      chain_count: p.chains.length,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      tier,
      multiple,
      implied_value_usd: Math.round(impliedRaw),
      implied_low_usd: Math.round(p.tvl_usd * quartiles[0]),
      implied_high_usd: Math.round(p.tvl_usd * quartiles[1]),
      growth_factor: round4(growth),
      breadth_factor: round4(breadth),
      score: Math.round(impliedRaw * growth * breadth),
      farm_steps: farmSteps(p),
    };
  });

  // Rank by implied value (the gate requires ranks 1..N by implied value desc).
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));

  // board.json: the full rows, keys in a fixed order.
  const board = ranked.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    tier: r.tier,
    chains: r.chains,
    chain_count: r.chain_count,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    listed_at: r.listed_at,
    multiple: r.multiple,
    implied_value_usd: r.implied_value_usd,
    implied_low_usd: r.implied_low_usd,
    implied_high_usd: r.implied_high_usd,
    growth_factor: r.growth_factor,
    breadth_factor: r.breadth_factor,
    score: r.score,
    farm_steps: r.farm_steps,
  }));
  writeFileSync(join(OUT, 'board.json'), JSON.stringify(board));

  // dashboard/data.js: the same rows, trimmed only for size — chains to the top 5
  // (chain_count keeps the true count). The derived display fields (growth and
  // breadth factors, implied range) are recomputed in app.js from these same
  // embedded values with the same formulas, so the two outputs stay consistent.
  const dashRows = board.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    tier: r.tier,
    chains: r.chains.slice(0, 5),
    chain_count: r.chain_count,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    listed_at: r.listed_at,
    multiple: r.multiple,
    implied_value_usd: r.implied_value_usd,
    score: r.score,
    farm_steps: r.farm_steps,
  }));
  const data = {
    as_of: snap.as_of,
    // Plain text only: the dashboard must name no http(s) address anywhere.
    source: 'DefiLlama sealed snapshot',
    floor_usd: snap.floor_usd,
    rows: dashRows,
  };
  mkdirSync(join(OUT, 'dashboard'), { recursive: true });
  writeFileSync(join(OUT, 'dashboard', 'data.js'), `window.TOKEN_RADAR = ${JSON.stringify(data)};\n`);

  // dossier.json: the scorer recomputes this byte-for-byte from dashboard/ and
  // screenshots/, so call the kit library exactly as documented — on the output
  // directory, which holds the generated data.js plus copies of the static files.
  if (OUT !== ROOT) {
    mkdirSync(join(OUT, 'screenshots'), { recursive: true });
    for (const f of ['index.html', 'app.js', 'app.css']) copyFileSync(join(ROOT, 'dashboard', f), join(OUT, 'dashboard', f));
    for (const f of ['1-board.png', '2-detail.png', '3-filtered.png']) copyFileSync(join(ROOT, 'screenshots', f), join(OUT, 'screenshots', f));
  }
  writeFileSync(join(OUT, 'dossier.json'), buildDossier(OUT, { text_max_bytes: 65536 }));

  console.log(`board: ${board.length} rows (${watchlist.length} watchlist + ${belowFloor.length} below floor)`);
  console.log(`top 5: ${board.slice(0, 5).map((r) => `#${r.rank} ${r.name} $${r.implied_value_usd.toLocaleString('en-US')} / score $${r.score.toLocaleString('en-US')}`).join(' | ')}`);
}

main();
