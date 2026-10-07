// Sunday Open - recorder. Polls Binance Web3 RWA token list and logs on-chain price vs reference price.
// Run: node recorder.js        Stop: Ctrl+C       Data: data\snapshots.jsonl
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const BASE = process.env.BASE_URL || 'https://web3.binance.com/build';
const PATH = '/api/v1/dex/market/rwa/tokens';
const QUERY = '?binanceChainId=56';
const INTERVAL_MS = (Number(process.env.INTERVAL_MIN) || 5) * 60 * 1000;

function loadEnv() {
  const o = {};
  if (!fs.existsSync('.env')) return o;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
}
const env = loadEnv();
if (!env.BINANCE_KEY || !env.BINANCE_SECRET) { console.log('No keys found. Run node probe.js first.'); process.exit(1); }

// Whether the query string is part of the signed path. null = unknown, we learn it.
let signWithQuery = null;
let sampleSaved = false;
const sign = (ts, signedPath) => crypto.createHmac('sha256', env.BINANCE_SECRET).update(ts + 'GET' + signedPath).digest('base64');

async function request(withQuery, path = PATH, query = QUERY) {
  const ts = new Date().toISOString();
  const signedPath = '/build' + path + (withQuery ? query : '');
  const res = await fetch(BASE + path + query, {
    headers: { 'X-OC-APIKEY': env.BINANCE_KEY, 'X-OC-TIMESTAMP': ts, 'X-OC-SIGN': sign(ts, signedPath) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function fetchTokens() {
  const order = signWithQuery === null ? [true, false] : [signWithQuery];
  let last;
  for (const w of order) {
    last = await request(w);
    if (last.status === 200 && last.json && last.json.code === 0) { signWithQuery = w; return last.json.data; }
    if (last.status === 401 && last.json && last.json.code === 40102) continue; // wrong signing recipe, try next
    break;
  }
  throw new Error('HTTP ' + last.status + ' ' + last.text.slice(0, 200));
}


const PRICE_PATH = '/api/v1/dex/market/rwa/price';
let batchSize = 50; // shrinks automatically if the server says the URL is too long (HTTP 414)
async function fetchPrices(addrs) {
  const out = new Map();
  for (let i = 0; i < addrs.length; ) {
    const chunk = addrs.slice(i, i + batchSize);
    const q = '?binanceChainId=56&tokenContractAddresses=' + chunk.join(',');
    const r = await request(signWithQuery !== false, PRICE_PATH, q);
    if (r.status === 414 || r.status === 400 && /too long|uri/i.test(r.text)) {
      if (batchSize <= 5) throw new Error('price HTTP 414 even at batch size ' + batchSize);
      batchSize = Math.max(5, Math.floor(batchSize / 2));
      continue; // retry same position with a smaller batch
    }
    if (r.status === 200 && r.json && r.json.code === 0 && Array.isArray(r.json.data)) {
      for (const d of r.json.data) out.set(String(d.tokenContractAddress).toLowerCase(), d);
      i += chunk.length;
      await new Promise((x) => setTimeout(x, 250));
    } else if (r.status === 429) {
      await new Promise((x) => setTimeout(x, 3000)); // rate limited, wait and retry same batch
    } else {
      throw new Error('price HTTP ' + r.status + ' ' + r.text.slice(0, 160));
    }
  }
  return out;
}

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };

function compact(t) {
  const price = num(t.tokenPrice), ref = num(t.referencePrice);
  const si = t.statusInfo || {};
  return {
    sym: t.tokenSymbol, under: t.underlyingTicker, plat: t.platformId, addr: t.tokenContractAddress,
    price, ref, gapPct: price != null && ref ? Math.round(((price - ref) / ref) * 1e6) / 1e4 : null,
    status: si.marketStatus ?? null, open: si.openState ?? null, reason: si.reasonCode ?? null,
    vol24h: num(t.volume24H), ratio: num(t.tokenToShareRatio),
    extra: Object.fromEntries(Object.entries(t).filter(([k, v]) => /mult|ratio|share|split|factor|rebase/i.test(k) && v !== null && typeof v !== 'object')),
  };
}

async function tick() {
  const when = new Date().toISOString();
  try {
    const data = await fetchTokens();
    const raw = Array.isArray(data) ? data : [];
    const rows = raw.map(compact);
    let prices = new Map(), priceNote = '';
    try { prices = await fetchPrices(rows.map((r) => String(r.addr).toLowerCase())); }
    catch (e) { priceNote = ' [price endpoint: ' + e.message + ']'; }
    const nowMs = Date.now();
    for (const r of rows) {
      const d = prices.get(String(r.addr).toLowerCase());
      if (!d) continue;
      r.p2 = num(d.tokenPrice); r.ref2 = num(d.referencePrice); r.upd = num(d.tokenPriceUpdatedAt);
      r.updAgeMin = r.upd ? Math.round((nowMs - r.upd) / 6000) / 10 : null;
      const ratio = r.ratio || 1;
      r.prem = r.p2 != null && r.ref2 ? Math.round(((r.p2 / (r.ref2 * ratio)) - 1) * 1e6) / 1e4 : null;
    }
    if (!sampleSaved && raw.length) {
      const g = (t) => { const a = num(t.tokenPrice), b = num(t.referencePrice); return a != null && b ? Math.abs(a / b - 1) : 0; };
      const worst = [...raw].sort((a, b) => g(b) - g(a)).slice(0, 3);
      fs.mkdirSync('data', { recursive: true });
      fs.writeFileSync('data/raw-sample.json', JSON.stringify({ first: raw.slice(0, 2), biggest_gaps: worst }, null, 2));
      sampleSaved = true;
      if (prices.size) fs.writeFileSync('data/raw-price-sample.json', JSON.stringify([...prices.values()].slice(0, 5), null, 2));
      console.log('Saved data/raw-sample.json (public market data only). Send it to Claude.');
    }
    fs.mkdirSync('data', { recursive: true });
    fs.appendFileSync('data/snapshots.jsonl', JSON.stringify({ t: when, n: rows.length, rows }) + '\n');
    const withP = rows.filter((r) => r.prem != null);
    const moving = withP.filter((r) => Math.abs(r.prem) >= 0.1);
    const stale = withP.filter((r) => r.updAgeMin != null && r.updAgeMin > 60).length;
    const byStatus = {}; rows.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
    const top = [...withP].sort((a, b) => Math.abs(b.prem) - Math.abs(a.prem)).slice(0, 3).map((r) => r.sym + ' ' + r.prem + '%').join(', ');
    console.log(when + ' tokens=' + rows.length + ' priced=' + withP.length + ' premium>=0.1%: ' + moving.length + ' stale>1h: ' + stale + ' status=' + JSON.stringify(byStatus) + (top ? ' top: ' + top : '') + priceNote);
  } catch (e) {
    console.log(when + ' poll failed: ' + e.message + ' (will retry)');
  }
}

console.log('Sunday Open recorder started. Polling every ' + INTERVAL_MS / 60000 + ' min. Keep this window open and stop the PC from sleeping.');
tick();
setInterval(tick, INTERVAL_MS);
