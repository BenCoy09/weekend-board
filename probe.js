// Sunday Open - step 1: prove your Binance Web3 API key works from your PC.
// Run: node probe.js   (keys live only in .env on YOUR PC)
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');

const BASE = 'https://web3.binance.com/build';
const PATHS = ['/api/v1/dex/market/rwa/tokens', '/api/v1/dex/market/rwa/underlying-market', '/api/v1/dex/market/rwa/price'];

function loadEnv() {
  if (!fs.existsSync('.env')) return {};
  const o = {};
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
}
const ask = (q) => new Promise((r) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); r(a.trim()); }); });

// Signing recipes to try. Timestamp is ISO 8601 (server told us so).
const VARIANTS = [
  { name: 'base64, signed path = /api/...', signPath: (p) => p, enc: 'base64' },
  { name: 'base64, signed path = /build/api/...', signPath: (p) => '/build' + p, enc: 'base64' },
  { name: 'hex, signed path = /api/...', signPath: (p) => p, enc: 'hex' },
  { name: 'hex, signed path = /build/api/...', signPath: (p) => '/build' + p, enc: 'hex' },
  { name: 'base64, signed = full URL', signPath: (p) => BASE + p, enc: 'base64' },
];

function sign(secret, ts, method, requestPath, enc) {
  return crypto.createHmac('sha256', secret).update(ts + method + requestPath).digest(enc);
}

async function call(key, secret, path, v) {
  const ts = new Date().toISOString();
  const res = await fetch(BASE + path, {
    method: 'GET',
    headers: { 'X-OC-APIKEY': key, 'X-OC-TIMESTAMP': ts, 'X-OC-SIGN': sign(secret, ts, 'GET', v.signPath(path), v.enc) },
    signal: AbortSignal.timeout(15000),
  });
  return { status: res.status, text: await res.text() };
}

async function withRetry(fn) {
  let last;
  for (let i = 0; i < 4; i++) {
    last = await fn().catch((e) => ({ status: 0, text: 'network: ' + (e.cause && e.cause.code ? e.cause.code : e.message) }));
    if (last.status !== 0) return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}

const okBody = (r) => r.status === 200;

(async () => {
  let env = loadEnv();
  if (!env.BINANCE_KEY || !env.BINANCE_SECRET) {
    console.log('First run: paste your API key and secret. They are saved only in .env on this PC.');
    const key = await ask('API key: '); const secret = await ask('Secret: ');
    fs.writeFileSync('.env', 'BINANCE_KEY=' + key + '\nBINANCE_SECRET=' + secret + '\n');
    env = { BINANCE_KEY: key, BINANCE_SECRET: secret };
  }
  const out = [];
  let working = null;
  for (const v of VARIANTS) {
    const r = await withRetry(() => call(env.BINANCE_KEY, env.BINANCE_SECRET, PATHS[0], v));
    console.log('[' + v.name + '] -> HTTP ' + r.status + ' ' + r.text.slice(0, 110).replace(/\s+/g, ' '));
    out.push({ variant: v.name, path: PATHS[0], status: r.status, body: r.text.slice(0, 4000) });
    if (okBody(r)) { working = v; break; }
    await new Promise((x) => setTimeout(x, 700));
  }
  if (working) {
    console.log('\nWORKING RECIPE: ' + working.name + '\n');
    for (const p of PATHS.slice(1)) {
      const r = await withRetry(() => call(env.BINANCE_KEY, env.BINANCE_SECRET, p, working));
      console.log(p + ' -> HTTP ' + r.status + ' ' + r.text.slice(0, 160).replace(/\s+/g, ' '));
      out.push({ variant: working.name, path: p, status: r.status, body: r.text.slice(0, 4000) });
    }
  } else {
    console.log('\nNo recipe worked. Paste these lines to Claude.');
  }
  fs.writeFileSync('probe-output.json', JSON.stringify(out, null, 2));
  console.log('\nSaved probe-output.json (public market data only, no keys).');
})();
