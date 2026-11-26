// Token Launch Radar — renders window.TOKEN_RADAR (embedded in data.js, no fetch,
// no network). Detail + filters run entirely client-side.
(function () {
  'use strict';
  var D = window.TOKEN_RADAR;
  var rows = D.rows;

  // Same quartile bands as main.ts (research.md §5.2); range = TVL x p25 … TVL x p75.
  var QUARTILES = {
    'Lending': [0.033, 0.423], 'Dexs': [0.068, 1.524], 'Liquid Staking': [0.032, 0.186],
    'Yield': [0.121, 1.0], 'CEX': [0.034, 0.182], 'RWA': [0.14, 0.415],
    'Canonical Bridge': [0.317, 1.344], 'Basis Trading': [0.204, 0.998], 'Bridge': [0.052, 0.989]
  };
  var FALLBACK_Q = [0.032, 0.317];
  var CATEGORY_MULTIPLE = {}; // categories with >= 5 comparables use their own multiple
  rows.forEach(function (r) { if (r.multiple !== 0.082) CATEGORY_MULTIPLE[r.category] = true; });

  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function compact(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function growthOf(r) { return r.change_7d === null ? 1 : 1 + Math.max(-50, Math.min(100, r.change_7d)) / 100; }
  function breadthOf(r) { return 1 + 0.02 * Math.min(r.chain_count, 10); }
  function rangeOf(r) {
    var q = CATEGORY_MULTIPLE[r.category] ? QUARTILES[r.category] : FALLBACK_Q;
    return [Math.round(r.tvl_usd * q[0]), Math.round(r.tvl_usd * q[1])];
  }
  function chainText(r) {
    var t = r.chains.join(', ');
    return r.chain_count > r.chains.length ? t + ' +' + (r.chain_count - r.chains.length) + ' more' : t;
  }

  // ---- stats strip ----
  var watch = rows.filter(function (r) { return r.tier === 'watchlist'; });
  var watchTvl = watch.reduce(function (s, r) { return s + r.tvl_usd; }, 0);
  var totalImplied = watch.reduce(function (s, r) { return s + r.implied_mcap_usd; }, 0);
  document.getElementById('stats').innerHTML =
    '<div class="stat"><b>' + rows.length + '</b><span>protocols ranked</span></div>' +
    '<div class="stat"><b>' + compact(watchTvl) + '</b><span>watchlist TVL (40 rows)</span></div>' +
    '<div class="stat"><b>' + compact(totalImplied) + '</b><span>total implied circ. mcap, watchlist</span></div>' +
    '<div class="stat"><b>0.082</b><span>fallback multiple (median, TVL ≥ $50M)</span></div>';

  // ---- filter controls ----
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  var catSel = document.getElementById('cat');
  cats.forEach(function (c) { catSel.insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });
  var chainSel = document.getElementById('chain');
  chains.forEach(function (c) { chainSel.insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });

  var qEl = document.getElementById('q');
  var watchEl = document.getElementById('watchonly');
  var tbody = document.getElementById('rows');
  var countEl = document.getElementById('count');
  var emptyEl = document.getElementById('empty');
  var detailEl = document.getElementById('detail');
  var selected = null;

  function filtered() {
    var q = qEl.value.trim().toLowerCase();
    var cat = catSel.value, ch = chainSel.value, wo = watchEl.checked;
    return rows.filter(function (r) {
      if (wo && r.tier !== 'watchlist') return false;
      if (cat && r.category !== cat) return false;
      if (ch && r.chains.indexOf(ch) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function render() {
    var list = filtered();
    countEl.textContent = list.length + ' of ' + rows.length + ' shown';
    emptyEl.hidden = list.length > 0;
    tbody.innerHTML = list.map(function (r) {
      var cls = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      return '<tr data-slug="' + esc(r.slug) + '"' + (selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="rank' + (r.rank <= 3 ? ' top3' : '') + '">' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) +
          '<span class="tier ' + (r.tier === 'watchlist' ? 'watch' : 'below') + '">' +
          (r.tier === 'watchlist' ? 'Watchlist' : 'Below floor') + '</span>' +
          '<span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(r.category) + '</td>' +
        '<td class="chains" title="' + esc(chainText(r)) + '">' + esc(chainText(r)) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num imp">' + money(r.implied_mcap_usd) + '</td>' +
        '<td class="num">' + money(r.score) + '</td></tr>';
    }).join('');
  }

  function showDetail(slug) {
    var r = rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    selected = slug;
    var range = rangeOf(r);
    var age = r.listed_at === null ? 'unknown (not in snapshot)' : r.listed_at;
    detailEl.innerHTML =
      '<h2>' + esc(r.name) +
        '<span class="tier ' + (r.tier === 'watchlist' ? 'watch' : 'below') + '">' +
        (r.tier === 'watchlist' ? 'Watchlist' : 'Below $50M floor') + '</span></h2>' +
      '<p class="slugline">Rank #' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category) + ' · ' +
        'tracked since ' + esc(age) + '</p>' +
      '<div class="kv">' +
        '<div><b>' + money(r.tvl_usd) + '</b><span>Total value locked</span></div>' +
        '<div><b>' + money(r.implied_mcap_usd) + '</b><span>Implied circulating mcap</span></div>' +
        '<div><b>' + money(range[0]) + ' – ' + money(range[1]) + '</b><span>Implied range (p25–p75 multiple)</span></div>' +
        '<div><b>' + money(r.score) + '</b><span>Score (rank key)</span></div>' +
        '<div><b>' + r.multiple.toFixed(4) + '×</b><span>Category multiple (mcap/TVL)</span></div>' +
        '<div><b class="' + (r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg')) + '">' + pct(r.change_7d) + '</b><span>TVL change, 7 days</span></div>' +
        '<div><b>' + growthOf(r).toFixed(4) + '×</b><span>Growth factor</span></div>' +
        '<div><b>' + breadthOf(r).toFixed(2) + '×</b><span>Breadth factor · ' + r.chain_count + ' chain' + (r.chain_count === 1 ? '' : 's') + '</span></div>' +
      '</div>' +
      '<p class="note"><b>Chains:</b> ' + esc(chainText(r)) + '</p>' +
      '<p class="farm"><b>Farm plan</b>' + esc(r.farm_plan) + '</p>' +
      '<p class="note">Implied value is a <b>circulating market cap, never FDV</b>. ' +
        'No token exists for this protocol in the snapshot; nothing here claims it will launch one. ' +
        'Points status is unverified.</p>' +
      '<p class="note">Look it up: <a href="https://defillama.com/protocol/' + esc(r.slug) + '" target="_blank" rel="noopener">' +
        'defillama.com/protocol/' + esc(r.slug) + '</a> (link constructed from the public URL pattern, not in the snapshot).</p>';
    render();
    detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });
  [qEl, catSel, chainSel, watchEl].forEach(function (el) { el.addEventListener('input', render); });

  render();
  // Deep-link: #slug opens that protocol's detail.
  if (location.hash.length > 1) showDetail(decodeURIComponent(location.hash.slice(1)));
})();
