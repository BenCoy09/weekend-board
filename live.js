// Sunday Open - which tokens have a LIVE price right now? (price updated within the last 60 minutes)
// Run: node live.js
'use strict';
const fs = require('fs');
if (!fs.existsSync('data/snapshots.jsonl')) { console.log('No data yet.'); process.exit(0); }
const snaps = fs.readFileSync('data/snapshots.jsonl', 'utf8').split(/\r?\n/).filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  .filter((s) => s.rows.some((r) => r.p2 != null));
const last = snaps[snaps.length - 1];
if (!last) { console.log('No priced snapshots yet.'); process.exit(0); }
console.log('Latest priced snapshot: ' + last.t + '\n');
const fresh = last.rows.filter((r) => r.updAgeMin != null && r.updAgeMin <= 60);
const frozen = last.rows.length - fresh.length;
console.log('Live (price updated in last 60 min): ' + fresh.length + ' of ' + last.rows.length + '   Frozen: ' + frozen);
const groups = {};
for (const r of fresh) { const k = r.plat + ' / ' + r.status; (groups[k] = groups[k] || []).push(r); }
console.log('\nLive tokens by issuer / market status:');
Object.entries(groups).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => console.log('  ' + k.padEnd(26) + v.length));
console.log('\nTop 15 live tokens by 24h volume:');
[...fresh].sort((a, b) => (b.vol24h || 0) - (a.vol24h || 0)).slice(0, 15)
  .forEach((r) => console.log('  ' + String(r.sym).padEnd(9) + String(r.under || '').padEnd(8) + String(r.plat).padEnd(8) + '[' + r.status + '] ref ' + r.ref2 + '  age ' + r.updAgeMin + 'm  vol24h ' + Math.round((r.vol24h || 0) / 1e6) + 'M'));
const all = fresh.map((r) => r.sym).sort();
console.log('\nAll live symbols: ' + all.join(' '));
console.log('\nPaste everything above to Claude.');
