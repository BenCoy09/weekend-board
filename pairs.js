// Sunday Open - weekend disagreement between issuers (Ondo vs bStock) for the same stock.
// Run: node pairs.js
'use strict';
const fs = require('fs');
if (!fs.existsSync('data/snapshots.jsonl')) { console.log('No data yet.'); process.exit(0); }
const snaps = fs.readFileSync('data/snapshots.jsonl', 'utf8').split(/\r?\n/).filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  .filter((s) => s.rows.some((r) => r.p2 != null));
const s = snaps[snaps.length - 1];
if (!s) { console.log('No priced snapshots yet.'); process.exit(0); }
console.log('Snapshot: ' + s.t + '\n');
const live = s.rows.filter((r) => r.updAgeMin != null && r.updAgeMin <= 60 && r.ref2 && r.under);
const by = {};
for (const r of live) { (by[r.under] = by[r.under] || {})[r.plat] = r; }
const pairs = [];
for (const [u, g] of Object.entries(by)) {
  if (g.ondo && g.bstock) {
    const spread = (g.ondo.ref2 / g.bstock.ref2 - 1) * 100;
    pairs.push({ u, ondo: g.ondo.ref2, bst: g.bstock.ref2, spread, usd: g.ondo.ref2 - g.bstock.ref2 });
  }
}
console.log('Stocks live on BOTH issuers: ' + pairs.length + '  (live tokens: ' + live.length + ')');
if (!pairs.length) { console.log('No pairs. Paste this to Claude.'); process.exit(0); }
const abs = pairs.map((p) => Math.abs(p.spread)).sort((a, b) => a - b);
console.log('|spread| median ' + abs[Math.floor(abs.length / 2)].toFixed(3) + '%   max ' + abs[abs.length - 1].toFixed(3) + '%');
console.log('Ondo higher than bStock in ' + pairs.filter((p) => p.spread > 0).length + ' of ' + pairs.length + ' pairs\n');
console.log('Ticker   Ondo        bStock      spread');
[...pairs].sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread)).forEach((p) =>
  console.log(String(p.u).padEnd(8) + String(p.ondo).padEnd(12) + String(p.bst).padEnd(12) + (p.spread >= 0 ? '+' : '') + p.spread.toFixed(3) + '%'));
console.log('\nPaste everything above to Claude.');
