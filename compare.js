// Sunday Open - compare the first and last PRICED snapshots in data\snapshots.jsonl
// Run: node compare.js
'use strict';
const fs = require('fs');
if (!fs.existsSync('data/snapshots.jsonl')) { console.log('No data yet. Run node recorder.js first.'); process.exit(0); }
const snaps = fs.readFileSync('data/snapshots.jsonl', 'utf8').split(/\r?\n/).filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  .filter((s) => s.rows.some((r) => r.p2 != null));
console.log('Snapshots with real prices: ' + snaps.length);
if (snaps.length < 2) { console.log('Need at least 2 priced snapshots. Take one more with node recorder.js (Ctrl+C after the first line).'); process.exit(0); }

// "node compare.js last" compares the two most recent priced snapshots; default compares first vs last.
const useLast = process.argv[2] === 'last';
const a = useLast ? snaps[snaps.length - 2] : snaps[0], b = snaps[snaps.length - 1];
const hours = ((Date.parse(b.t) - Date.parse(a.t)) / 3600000).toFixed(1);
console.log('Comparing ' + a.t + '  ->  ' + b.t + '  (' + hours + ' hours apart)\n');

const byAddr = new Map(a.rows.map((r) => [r.addr, r]));
let both = 0, refMoved = 0, tokMoved = 0, premWidened = 0;
const movers = [];
const pct = (x, y) => (x != null && y ? ((x / y - 1) * 100) : null);
for (const r of b.rows) {
  const o = byAddr.get(r.addr); if (!o || r.p2 == null || o.p2 == null) continue;
  both++;
  const refCh = pct(r.ref2, o.ref2), tokCh = pct(r.p2, o.p2);
  if (refCh != null && Math.abs(refCh) > 0.001) refMoved++;
  if (tokCh != null && Math.abs(tokCh) > 0.001) tokMoved++;
  if (r.prem != null && o.prem != null && Math.abs(r.prem) > Math.abs(o.prem) + 0.05) premWidened++;
  movers.push({ sym: r.sym, refCh, tokCh, prem: r.prem, status: r.status, age: r.updAgeMin });
}
const fmt = (x) => (x == null ? 'n/a' : x.toFixed(2) + '%');
console.log('Tokens compared:                 ' + both);
console.log('Reference price changed:         ' + refMoved + ' tokens');
console.log('Token (on-chain) price changed:  ' + tokMoved + ' tokens');
console.log('Premium got wider by >0.05pt:    ' + premWidened + ' tokens');
const premVals = b.rows.map((r) => r.prem).filter((x) => x != null).map(Math.abs).sort((x, y) => x - y);
if (premVals.length) console.log('Latest |premium|: median ' + premVals[Math.floor(premVals.length / 2)].toFixed(3) + '%, max ' + premVals[premVals.length - 1].toFixed(3) + '%');
const stale = b.rows.filter((r) => r.updAgeMin != null && r.updAgeMin > 60).length;
console.log('Tokens with price older than 1h: ' + stale);
// Which kinds of token are moving? Break down by market status.
const bySt = {};
for (const m of movers) { const k = String(m.status); bySt[k] = bySt[k] || { n: 0, moved: 0 }; bySt[k].n++; if (m.refCh != null && Math.abs(m.refCh) > 0.001) bySt[k].moved++; }
console.log('\nMoved, by market status:');
Object.entries(bySt).forEach(([k, v]) => console.log('  ' + k.padEnd(12) + v.moved + ' of ' + v.n + ' moved'));
console.log('\nBiggest reference-price moves:');
movers.filter((m) => m.refCh != null).sort((x, y) => Math.abs(y.refCh) - Math.abs(x.refCh)).slice(0, 5)
  .forEach((m) => console.log('  ' + m.sym + '  ref ' + fmt(m.refCh) + '  token ' + fmt(m.tokCh) + '  premium ' + fmt(m.prem) + '  [' + m.status + ']'));
console.log('\nPaste everything above to Claude.');
