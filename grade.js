// Sunday Open - grade the weekend prices against Monday's open.
// Run on Monday AFTER the US open:  node grade.js
// Uses: Friday-evening snapshot (baseline), last snapshot before the Monday open (weekend forecast), first snapshot after the open (actual).
'use strict';
const fs = require('fs');
if (!fs.existsSync('data/snapshots.jsonl')) { console.log('No data yet.'); process.exit(0); }
const snaps = fs.readFileSync('data/snapshots.jsonl', 'utf8').split(/\r?\n/).filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  .filter((s) => s.rows.some((r) => r.p2 != null)).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

// Times in UTC. US cash open Mon 5 Oct 2026 = 13:30 UTC.
const OPEN = Date.parse(process.env.OPEN_UTC || '2026-10-05T13:30:00Z');
const FRI_START = Date.parse(process.env.FRI_START_UTC || '2026-10-02T20:00:00Z'); // after the Friday close
const FRI_END = Date.parse(process.env.FRI_END_UTC || '2026-10-03T00:00:00Z');
const ts = (s) => Date.parse(s.t);
const base = [...snaps].reverse().find((s) => ts(s) >= FRI_START && ts(s) < FRI_END);
const weekend = [...snaps].reverse().find((s) => ts(s) < OPEN && ts(s) > FRI_END);
const monday = snaps.find((s) => ts(s) >= OPEN + 3 * 60000);
const need = [['Friday-evening baseline', base], ['weekend forecast (before open)', weekend], ['Monday after open', monday]];
const dow = (x) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(x.t).getUTCDay()];
for (const [n, s] of need) console.log(n.padEnd(32) + (s ? s.t + '  (' + dow(s) + ')' : 'MISSING'));
if (monday && Date.parse(monday.t) > OPEN + 6 * 3600000) console.log('NOTE: the "after open" snapshot is ' + Math.round((Date.parse(monday.t) - OPEN) / 3600000) + 'h after the open, not at the open. Say so in the report.');
if (!base || !weekend || !monday) { console.log('\nA snapshot is missing. Take it with node recorder.js (Ctrl+C after the first line), then run node grade.js again.'); process.exit(0); }

// Mean reference price per underlying ticker in a snapshot. liveOnly = only tokens with a fresh price.
const byUnder = (s, liveOnly) => {
  const m = {};
  for (const r of s.rows) {
    if (!r.under || !(r.ref2 > 0)) continue;
    if (liveOnly && !(r.updAgeMin != null && r.updAgeMin <= 60)) continue;
    (m[r.under] = m[r.under] || []).push(r.ref2);
  }
  const o = {}; for (const [k, v] of Object.entries(m)) o[k] = v.reduce((a, b) => a + b, 0) / v.length; return o;
};
const F = byUnder(base, false), W = byUnder(weekend, true), M = byUnder(monday, false);
const rows = [], anomalies = [];
for (const u of Object.keys(W)) {
  if (!(u in F) || !(u in M)) continue;
  const wkMove = (W[u] / F[u] - 1) * 100, actual = (M[u] / F[u] - 1) * 100;
  const rec = { u, F: F[u], W: W[u], M: M[u], wkMove, actual, errW: Math.abs(W[u] / M[u] - 1) * 100, errN: Math.abs(F[u] / M[u] - 1) * 100 };
  if (Math.abs(actual) > 50) anomalies.push(rec); else rows.push(rec);
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
console.log('\nStocks graded (live all weekend, priced at all 3 points): ' + rows.length);
if (!rows.length) process.exit(0);
const beat = rows.filter((r) => r.errW < r.errN).length;
console.log('Median miss, weekend price vs Monday:   ' + med(rows.map((r) => r.errW)).toFixed(3) + '%');
console.log('Median miss, "just use Friday" vs Monday: ' + med(rows.map((r) => r.errN)).toFixed(3) + '%');
console.log('Weekend price closer to Monday than Friday was: ' + beat + ' of ' + rows.length);
const dirRows = rows.filter((r) => Math.abs(r.wkMove) >= 0.1 && Math.abs(r.actual) >= 0.02);
const hits = dirRows.filter((r) => Math.sign(r.wkMove) === Math.sign(r.actual)).length;
console.log('Direction right (weekend move >= 0.1%): ' + hits + ' of ' + dirRows.length);
const upN = dirRows.filter((r) => r.actual > 0).length;
console.log('Naive "everything goes up" would be right: ' + upN + ' of ' + dirRows.length + '   <- beat THIS, not 50%');
const mAct = med(rows.map((r) => r.actual)), mWk = med(rows.map((r) => r.wkMove));
const adj = rows.map((r) => ({ w: r.wkMove - mWk, a: r.actual - mAct })).filter((r) => Math.abs(r.w) >= 0.1 && Math.abs(r.a) >= 0.02);
const adjHits = adj.filter((r) => Math.sign(r.w) === Math.sign(r.a)).length;
console.log('Direction right after removing market-wide drift: ' + adjHits + ' of ' + adj.length + '   (chance is about half)');
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const xs = rows.map((r) => r.wkMove), ys = rows.map((r) => r.actual), mx = mean(xs), my = mean(ys);
const den = Math.sqrt(xs.reduce((t, x) => t + (x - mx) ** 2, 0) * ys.reduce((t, y) => t + (y - my) ** 2, 0));
if (den > 0) console.log('Correlation, weekend move vs later move: ' + (xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / den).toFixed(2));
console.log('Market median move since Friday: ' + mAct.toFixed(2) + '%  (stocks up: ' + rows.filter((r) => r.actual > 0).length + ' of ' + rows.length + ')');
if (anomalies.length) console.log('Excluded as likely data anomalies (>50% move): ' + anomalies.map((r) => r.u + ' ' + r.actual.toFixed(0) + '%').join(', '));
console.log('\nTicker   Fri         Weekend     Monday      wkMove   actual   missW   missFri');
[...rows].sort((a, b) => Math.abs(b.wkMove) - Math.abs(a.wkMove)).forEach((r) =>
  console.log(r.u.padEnd(8) + r.F.toFixed(2).padEnd(12) + r.W.toFixed(2).padEnd(12) + r.M.toFixed(2).padEnd(12) +
    (r.wkMove.toFixed(2) + '%').padEnd(9) + (r.actual.toFixed(2) + '%').padEnd(9) + (r.errW.toFixed(2) + '%').padEnd(8) + r.errN.toFixed(2) + '%'));
console.log('\nPaste everything above to Claude.');
