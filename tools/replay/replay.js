#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Real-data replay for ICT Gold Bot Pro (added 2026-10-24)
//
//  Runs the REAL bot-engine.js over historical XAUUSD M1 bars on a virtual
//  clock, against a fake MetaAPI broker that fills stops / targets bar by bar
//  (stop first when one bar touches both), applies MetaAPI's server-side
//  stop ladder, keeps XM's trading hours (server time GMT+3 while New York is
//  on daylight saving, else GMT+2) and charges a spread for every hour of the
//  week. Then it asks the one question that matters: do the bot's entries
//  beat random entries that use exactly the same exits? (see verdict.js)
//
//  Usage (from the project root):
//    node tools/replay/replay.js --data tools/replay/data/xauusd-2024.csv.gz \
//         --from 2024-01-01 --to 2025-01-01 --out tools/replay/results/2024.json
//  Options:
//    --cycle 3            minutes between bot cycles (the live bot: 3)
//    --spreads FILE       spread table JSON ({"wd-h": dollars} or the live
//                         bot's /api/v1/spreads output); default: built-in
//    --spread-mult 1      scale every spread (e.g. 2.2 ≈ an XM Standard account)
//    --slippage 0         extra $ against every market fill
//    --balance 90000 --currency ZAR --rate 18   account (rate = account units per $)
//    --random 1000        random-entry replicates for the edge test (0 = off)
//    --env "K=V;K2=V2"    bot settings for this run (a "variant")
//    --synthetic --seed N use a random-walk market instead of data (control run)
//  Output: one JSON file with every trade, summary stats and the random-entry
//  replicate sums, read by verdict.js.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const PROJ = path.resolve(arg('project', path.join(__dirname, '..', '..')));
const FROM = Date.parse(arg('from', '2024-01-01') + (String(arg('from', '')).length <= 10 ? 'T00:00:00Z' : ''));
const TO = Date.parse(arg('to', '2025-01-01') + (String(arg('to', '')).length <= 10 ? 'T00:00:00Z' : ''));
const OUT = path.resolve(arg('out', 'replay-out.json'));
const CYCLE_MIN = parseFloat(arg('cycle', '3'));
const SPREAD_MULT = parseFloat(arg('spread-mult', '1'));
const SLIPPAGE = parseFloat(arg('slippage', '0'));
const BALANCE = parseFloat(arg('balance', '90000'));
const CURRENCY = String(arg('currency', 'ZAR'));
const RATE = parseFloat(arg('rate', '18'));
const RANDOM_K = parseInt(arg('random', '1000'), 10);
const SYNTHETIC = !!arg('synthetic', false);
const SEED = parseInt(arg('seed', '1'), 10);
const WARMUP_DAYS = 70;
const LABEL = String(arg('label', ''));
const t0Real = Date.now();

// ── bot environment (isolated state, frozen v1 unless --env says otherwise) ──
const STATE = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ictreplay-'));
fs.mkdirSync(STATE + '/data', { recursive: true });
Object.assign(process.env, {
  META_TOKEN: 'replay', META_ACC_ID: 'replay', META_REGION: 'new-york', TELEGRAM_BOT_TOKEN: 'replay', TELEGRAM_CHAT_ID: '1',
  BOT_SYMBOL: 'XAUUSD', BOT_CURRENCY: CURRENCY, BOT_RISK: '2', BOT_MODE: 'normal', LOG_LEVEL: 'error', NODE_ENV: 'production',
  JOURNAL_PATH: STATE + '/journal.json', ZONE_MEMORY_FILE: STATE + '/zm.json', TP_FIX_STATE_FILE: STATE + '/tpf.json', SEASONALITY_FILE: STATE + '/season.json',
  AB_TESTING_FILE: STATE + '/ab.json', ERROR_CACHE_FILE: STATE + '/err.json', COUNTERFACTUAL_FILE: STATE + '/cf.json', DATA_DIR: STATE + '/data',
  BACKTEST_DB_PATH: STATE + '/bt.db', RENDER_VOLUME_PATH: STATE, GOLD_MODEL_PATH: STATE + '/gold_model.json',
});
delete process.env.DATABASE_URL; delete process.env.DRY_RUN; delete process.env.HEARTBEAT_URL;
const VARIANT_ENV = {};
for (const kv of String(arg('env', '') || '').split(/[;,\n]/)) { const m = kv.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) VARIANT_ENV[m[1]] = m[2]; }
Object.assign(process.env, VARIANT_ENV);

// ── XM clock ────────────────────────────────────────────────────────────────
function usDst(ms) {
  const y = new Date(ms).getUTCFullYear(), nth = (m, n) => { const f = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - f) % 7) + (n - 1) * 7; };
  return ms >= Date.UTC(y, 2, nth(2, 2), 7) && ms < Date.UTC(y, 10, nth(10, 1), 6);
}
const srvOff = ms => (usDst(ms) ? 3 : 2) * 3600000;
function srvParts(ms) { const t = new Date(ms + srvOff(ms)); return { wd: t.getUTCDay(), h: t.getUTCHours(), mod: t.getUTCHours() * 60 + t.getUTCMinutes() }; }
function xmOpen(ms) { const s = srvParts(ms); if (s.wd === 6 || s.wd === 0) return false; return !(s.mod >= 23 * 60 + 55 || s.mod < 65); }
// v1's own entry windows / flatten rule, for the random-entry test
function entryAllowed(ms) { const s = srvParts(ms); if (!xmOpen(ms)) return false; if (s.mod >= 23 * 60 + 35 || s.mod < 85) return false; if (s.wd === 1 && s.mod < 130) return false; if (s.wd === 5 && s.mod >= 22 * 60 + 50) return false; return true; }
const flattenDue = ms => { const s = srvParts(ms); return xmOpen(ms) && s.mod >= 23 * 60 + 35; };

// ── spreads by server hour of the week ──────────────────────────────────────
// Default ≈ XM Ultra Low gold: ~$0.20 in London/New York hours, wider in Asia,
// much wider next to the daily break and at the Monday open. --spreads takes
// a measured table (the live bot learns one: /api/v1/spreads).
let SPREAD_TABLE = null;
if (arg('spreads', null)) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.resolve(arg('spreads')), 'utf8')), tbl = raw.table || raw;
    SPREAD_TABLE = {}; for (const k of Object.keys(tbl)) { const v = typeof tbl[k] === 'object' ? tbl[k].ema : tbl[k]; if (v > 0) SPREAD_TABLE[k] = +v; }
  } catch (e) { console.error('spreads file unreadable, using the default model:', e.message); }
}
function spreadAt(ms) {
  const s = srvParts(ms);
  let sp = SPREAD_TABLE && SPREAD_TABLE[s.wd + '-' + s.h];
  if (!(sp > 0)) {
    sp = (s.h >= 9 && s.h < 20) ? 0.20 : 0.28;
    if (s.mod >= 23 * 60 + 25 || s.mod < 95) sp = 0.60;
    if (s.wd === 1 && s.mod < 125) sp = 0.80;
  }
  return Math.round(sp * SPREAD_MULT * 100) / 100;
}

// ── data ────────────────────────────────────────────────────────────────────
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function loadBars() {
  const lo = FROM - WARMUP_DAYS * 86400000, hi = TO + 2 * 86400000, out = [];
  if (SYNTHETIC) {
    const rnd = mulberry32(SEED), g = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    let p = 2000;
    for (let t = Math.floor(lo / 60000) * 60000; t < hi; t += 60000) {
      if (!xmOpen(t)) continue;
      const h = new Date(t).getUTCHours(), m = (h >= 7 && h < 17) ? 1.25 : (h >= 22 || h < 6) ? 0.6 : 0.9, sig = 0.00018 * p * m;
      const o = p, c = o + sig * g(), hh = Math.max(o, c) + Math.abs(g()) * sig * 0.5, ll = Math.min(o, c) - Math.abs(g()) * sig * 0.5;
      out.push([t, +o.toFixed(2), +hh.toFixed(2), +ll.toFixed(2), +c.toFixed(2), 100 + Math.round(rnd() * 400)]); p = c;
    }
    return out;
  }
  const file = path.resolve(arg('data', ''));
  let txt = fs.readFileSync(file);
  if (/\.gz$/.test(file)) txt = zlib.gunzipSync(txt);
  for (const line of txt.toString('utf8').split('\n')) {
    if (!line || line[0] < '0' || line[0] > '9') continue;
    const a = line.split(','), t = +a[0];
    if (t < lo || t > hi) continue;
    const o = +a[1], h = +a[2], l = +a[3], c = +a[4];
    if (!(o > 0 && h > 0 && l > 0 && c > 0) || h < l) continue;
    out.push([t, o, h, l, c, +a[5] || 0]);
  }
  out.sort((x, y) => x[0] - y[0]);
  return out;
}

class DataMarket {
  constructor(rows) {
    const n = rows.length;
    this.n = n; this.t = new Float64Array(n); this.o = new Float64Array(n); this.h = new Float64Array(n); this.l = new Float64Array(n); this.c = new Float64Array(n); this.v = new Float64Array(n);
    rows.forEach((r, i) => { this.t[i] = r[0]; this.o[i] = r[1]; this.h[i] = r[2]; this.l[i] = r[3]; this.c[i] = r[4]; this.v[i] = r[5]; });
    this.tf = {}; this._forming = {};
    for (const tf of ['5m', '15m', '30m', '1h', '4h', '1d', '1w']) this._build(tf);
  }
  static span(tf) { return { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 }[tf] * 60000; }
  // H4/D1/W1 bars start at XM server midnight (MT5 convention); shorter ones align the same in UTC.
  static bucket(t, tf) {
    if (tf === '1w') { const off = srvOff(t), d = new Date(t + off), day = d.getUTCDay(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) - off; }
    const sp = DataMarket.span(tf);
    if (tf === '4h' || tf === '1d') { const off = srvOff(t); return Math.floor((t + off) / sp) * sp - off; }
    return Math.floor(t / sp) * sp;
  }
  _build(tf) {
    const bs = [], i0 = [], i1 = [];
    for (let i = 0; i < this.n; i++) { const b = DataMarket.bucket(this.t[i], tf); if (!bs.length || bs[bs.length - 1] !== b) { bs.push(b); i0.push(i); i1.push(i); } else i1[i1.length - 1] = i; }
    this.tf[tf] = { bs, i0, i1 };
  }
  idxAt(ms) { let lo = 0, hi = this.n - 1, ans = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (this.t[mid] <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1; } return ans; }
  bid(ms) { const i = this.idxAt(ms); return i < 0 ? this.o[0] : this.c[i]; }
  _bar(i0, i1) { let hi = -Infinity, lo = Infinity, v = 0; for (let i = i0; i <= i1; i++) { if (this.h[i] > hi) hi = this.h[i]; if (this.l[i] < lo) lo = this.l[i]; v += this.v[i]; } return { open: this.o[i0], high: hi, low: lo, close: this.c[i1], vol: v }; }
  candles(tf, limit, now) {
    const idx = this.idxAt(now);
    if (idx < 0) return [];
    const mk = (bs, b) => ({ symbol: 'XAUUSD', timeframe: tf, time: new Date(bs).toISOString(), brokerTime: new Date(bs + srvOff(bs)).toISOString().replace('T', ' ').slice(0, 23),
      open: b.open, high: +b.high.toFixed(2), low: +b.low.toFixed(2), close: b.close, tickVolume: Math.max(1, Math.round(b.vol)), spread: Math.round(spreadAt(now) * 100), volume: 0 });
    if (tf === '1m') { const out = []; for (let i = Math.max(0, idx - limit + 1); i <= idx; i++) out.push(mk(this.t[i], { open: this.o[i], high: this.h[i], low: this.l[i], close: this.c[i], vol: this.v[i] })); return out; }
    const T = this.tf[tf]; if (!T) return [];
    // bucket holding bar idx
    let lo = 0, hi = T.bs.length - 1, k = -1; const bnow = DataMarket.bucket(this.t[idx], tf);
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (T.bs[mid] <= bnow) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    if (k < 0) return [];
    const out = [];
    for (let j = Math.max(0, k - limit + 1); j < k; j++) out.push(mk(T.bs[j], this._complete(tf, j)));
    out.push(mk(T.bs[k], this._bar(T.i0[k], idx))); // the forming bar, up to "now"
    return out;
  }
  _complete(tf, j) { const key = tf + ':' + j; let b = this._cache && this._cache[key]; if (b) return b; this._cache = this._cache || {}; const T = this.tf[tf]; b = this._bar(T.i0[j], T.i1[j]); this._cache[key] = b; return b; }
  // ATR(14) of completed M15 bars before ms (for random-entry stops)
  atr15(ms) {
    const T = this.tf['15m'], bnow = DataMarket.bucket(ms, '15m');
    let lo = 0, hi = T.bs.length - 1, k = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (T.bs[mid] < bnow) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    if (k < 15) return null;
    let s = 0; for (let j = k - 13; j <= k; j++) { const b = this._complete('15m', j), pc = this._complete('15m', j - 1).close; s += Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)); }
    return s / 14;
  }
}

// Signal study (added 2026-10-30, rule S1 in RULES.md): the price move in the
// trade's direction 15, 30, 60 and 120 minutes after entry, in R (the move ÷
// the stop distance), before costs and ignoring the trade's stop, targets and
// exits. drift is the same move for a buy at the same clock time on the 5
// trading days either side, so a market that simply rose all year doesn't
// count as skill for buys. A horizon past the end of the data is left out.
const FWD_MIN = [15, 30, 60, 120];
function forwardMoves(mk, ts, dir, risk) {
  if (!(ts > 0) || !dir || !(risk > 0)) return null;
  const last = mk.t[mk.n - 1], out = { risk: +risk.toFixed(2) };
  const move = (a, h) => (a + h * 60000 <= last && mk.idxAt(a) >= 0) ? mk.bid(a + h * 60000) - mk.bid(a) : null;
  for (const h of FWD_MIN) {
    const own = move(ts, h);
    if (own === null) continue;
    let s = 0, k = 0;
    for (let d = -7; d <= 7 && k < 10; d++) {
      if (!d) continue;
      const a = ts + d * 86400000, wd = new RealDate(a).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      const m = move(a, h);
      if (m !== null) { s += m; k++; }
    }
    out['r' + h] = +(dir * own / risk).toFixed(4);
    if (k) out['d' + h] = +(dir * (s / k) / risk).toFixed(4);
  }
  return out;
}

// ── virtual clock ───────────────────────────────────────────────────────────
const RealDate = Date;
let VNOW = FROM;
class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(VNOW); else super(...a); } static now() { return VNOW; } }
global.Date = FakeDate;
const realSetImmediate = setImmediate, heap = [];
let seq = 0, quiet = 0, pumping = true;
const mkHandle = h => { h.unref = () => h; h.ref = () => h; h.hasRef = () => false; h.refresh = () => h; h[Symbol.toPrimitive] = () => h.id; return h; };
global.setTimeout = function (fn, ms, ...args) { ms = Math.max(0, +ms || 0); if (ms === 120000) return mkHandle({ id: ++seq, cancelled: true }); const h = mkHandle({ id: ++seq, due: VNOW + ms, fn, args, cancelled: false }); heap.push(h); return h; };
global.clearTimeout = h => { if (h && typeof h === 'object') h.cancelled = true; };
global.setInterval = () => mkHandle({ id: ++seq, cancelled: true }); global.clearInterval = () => {};
(function pump() {
  if (!pumping) return;
  for (let i = heap.length - 1; i >= 0; i--) if (heap[i].cancelled) heap.splice(i, 1);
  if (!heap.length) { quiet = 0; return realSetImmediate(pump); }
  if (++quiet < 6) return realSetImmediate(pump);
  quiet = 0;
  let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i].due < heap[bi].due || (heap[i].due === heap[bi].due && heap[i].id < heap[bi].id)) bi = i;
  const h = heap.splice(bi, 1)[0]; if (h.due > VNOW) VNOW = h.due;
  try { h.fn(...(h.args || [])); } catch (e) { /* bot timers are best-effort */ }
  realSetImmediate(pump);
})();
for (const l of ['log', 'info', 'debug', 'warn']) console[l] = () => {};
const errOut = [];
const realError = console.error; console.error = (...a) => { if (errOut.length < 50) errOut.push(a.map(x => (x && x.stack) || String(x)).join(' ').slice(0, 300)); };
process.on('unhandledRejection', e => { if (errOut.length < 50) errOut.push('unhandledRejection: ' + ((e && e.stack) || e)); });

// ── fake MetaAPI broker ─────────────────────────────────────────────────────
const CONTRACT = 100;
class Broker {
  constructor(mk) { this.mk = mk; this.balance = BALANCE; this.positions = []; this.closed = []; this.deals = {}; this.nextId = 1000; this.last = VNOW; this.rejects = 0; this.requests = 0; this.serverMoves = 0; this.telegram = 0; }
  bid() { return this.mk.bid(VNOW); }
  ask() { return +(this.bid() + spreadAt(VNOW)).toFixed(2); }
  view(p) { const cur = p.type === 'POSITION_TYPE_BUY' ? this.bid() : this.ask(), pr = (p.type === 'POSITION_TYPE_BUY' ? cur - p.openPrice : p.openPrice - cur) * p.volume * CONTRACT * RATE;
    return { id: p.id, positionId: p.id, type: p.type, symbol: 'XAUUSD', openPrice: p.openPrice, volume: p.volume, stopLoss: p.stopLoss, takeProfit: p.takeProfit, comment: p.comment, time: new Date(p.openTime).toISOString(), updateTime: new Date(p.openTime).toISOString(), currentPrice: cur, profit: +pr.toFixed(2), unrealizedProfit: +pr.toFixed(2), swap: 0, commission: 0 }; }
  account() { let u = 0; for (const p of this.positions) u += this.view(p).profit; return { platform: 'mt5', type: 'ACCOUNT_TRADE_MODE_DEMO', currency: CURRENCY, balance: +this.balance.toFixed(2), equity: +(this.balance + u).toFixed(2), margin: 0, freeMargin: +(this.balance + u).toFixed(2), leverage: 100, marginMode: 'ACCOUNT_MARGIN_MODE_RETAIL_HEDGING' }; }
  close(p, price, reason, vol) {
    vol = vol == null ? p.volume : Math.min(vol, p.volume);
    const pnl = (p.type === 'POSITION_TYPE_BUY' ? price - p.openPrice : p.openPrice - price) * vol * CONTRACT * RATE;
    this.balance += pnl;
    (this.deals[p.id] = this.deals[p.id] || []).push({ id: 'D' + (this.nextId++), positionId: p.id, entryType: 'DEAL_ENTRY_OUT', price, volume: vol, profit: +pnl.toFixed(2), commission: 0, swap: 0, reason, time: new Date(VNOW).toISOString() });
    p.volume = +(p.volume - vol).toFixed(2);
    if (p.volume <= 1e-7) { this.positions = this.positions.filter(x => x !== p); this.closed.push({ id: p.id, type: p.type, openPrice: p.openPrice, openTime: p.openTime, closeTime: VNOW, reason, comment: p.comment, sl0: p.sl0, tp0: p.tp0, vol0: p.vol0, pnl: +this.deals[p.id].filter(d => d.entryType === 'DEAL_ENTRY_OUT').reduce((a, d) => a + d.profit, 0).toFixed(2) }); }
  }
  advance() {
    const m = this.mk, i0 = m.idxAt(this.last) + 1, i1 = m.idxAt(VNOW);
    for (let i = i0; i <= i1; i++) {
      const t = m.t[i]; if (!xmOpen(t)) continue;
      const sp = spreadAt(t), o = m.o[i], h = m.h[i], l = m.l[i];
      for (const p of this.positions.slice()) {
        const buy = p.type === 'POSITION_TYPE_BUY';
        if (buy) {
          if (p.stopLoss && l <= p.stopLoss) { this.close(p, Math.min(p.stopLoss, o), 'DEAL_REASON_SL'); continue; }
          if (p.takeProfit && h >= p.takeProfit) { this.close(p, Math.max(p.takeProfit, o), 'DEAL_REASON_TP'); continue; }
        } else {
          if (p.stopLoss && h + sp >= p.stopLoss) { this.close(p, Math.max(p.stopLoss, o + sp), 'DEAL_REASON_SL'); continue; }
          if (p.takeProfit && l + sp <= p.takeProfit) { this.close(p, Math.min(p.takeProfit, o + sp), 'DEAL_REASON_TP'); continue; }
        }
        if (p.trailing) { const ext = buy ? h : l + sp; let sl = p.stopLoss; for (const lv of p.trailing) if (buy ? ext >= lv.threshold : ext <= lv.threshold) { if (buy ? lv.stopLoss > sl : (!sl || lv.stopLoss < sl)) sl = lv.stopLoss; } if (sl !== p.stopLoss) { p.stopLoss = sl; this.serverMoves++; } }
      }
    }
    this.last = VNOW;
  }
  open(type, price, req) { const id = String(this.nextId++); const th = req.trailingStopLoss && req.trailingStopLoss.threshold && req.trailingStopLoss.threshold.thresholds;
    const p = { id, type, openPrice: price, volume: req.volume, vol0: req.volume, stopLoss: req.stopLoss || 0, takeProfit: req.takeProfit || 0, sl0: req.stopLoss || 0, tp0: req.takeProfit || 0, comment: req.comment || '', openTime: VNOW, trailing: th && th.length ? th.map(x => ({ threshold: +x.threshold, stopLoss: +x.stopLoss })) : null };
    this.positions.push(p); (this.deals[id] = []).push({ id: 'D' + (this.nextId++), positionId: id, entryType: 'DEAL_ENTRY_IN', price, volume: req.volume, profit: 0, time: new Date(VNOW).toISOString() }); return p; }
  trade(b) {
    this.requests++;
    const ok = x => Object.assign({ numericCode: 10009, stringCode: 'TRADE_RETCODE_DONE' }, x || {}), rej = (c, s, msg) => { this.rejects++; return { numericCode: c, stringCode: s, message: msg }; };
    const bid = this.bid(), ask = this.ask(), find = () => this.positions.find(x => x.id === String(b.positionId));
    const bad = (buy, sl, tp) => buy ? ((sl && sl >= bid) || (tp && tp <= bid)) : ((sl && sl <= ask) || (tp && tp >= ask));
    if (!xmOpen(VNOW) && /^(ORDER_TYPE|POSITION_)/.test(b.actionType)) return rej(10018, 'TRADE_RETCODE_MARKET_CLOSED', 'Market closed');
    switch (b.actionType) {
      case 'ORDER_TYPE_BUY': case 'ORDER_TYPE_SELL': {
        const buy = b.actionType === 'ORDER_TYPE_BUY';
        if (bad(buy, b.stopLoss, b.takeProfit)) return rej(10016, 'TRADE_RETCODE_INVALID_STOPS', 'Invalid stops');
        const p = this.open(buy ? 'POSITION_TYPE_BUY' : 'POSITION_TYPE_SELL', +(buy ? ask + SLIPPAGE : bid - SLIPPAGE).toFixed(2), b);
        return ok({ orderId: p.id, positionId: p.id });
      }
      case 'POSITION_MODIFY': { const p = find(); if (!p) return rej(10036, 'TRADE_RETCODE_POSITION_CLOSED', 'Position not found');
        const sl = b.stopLoss != null ? b.stopLoss : p.stopLoss, tp = b.takeProfit != null ? b.takeProfit : p.takeProfit;
        if (b.trailingStopLoss && b.trailingStopLoss.threshold) p.trailing = b.trailingStopLoss.threshold.thresholds.map(x => ({ threshold: +x.threshold, stopLoss: +x.stopLoss }));
        if (sl === p.stopLoss && tp === p.takeProfit) return rej(10025, 'TRADE_RETCODE_NO_CHANGES', 'No changes');
        if (bad(p.type === 'POSITION_TYPE_BUY', sl, tp)) return rej(10016, 'TRADE_RETCODE_INVALID_STOPS', 'Invalid stops');
        p.stopLoss = sl; p.takeProfit = tp; return ok({ positionId: p.id }); }
      case 'POSITION_CLOSE_ID': { const p = find(); if (!p) return rej(10036, 'TRADE_RETCODE_POSITION_CLOSED', 'Position not found'); this.close(p, p.type === 'POSITION_TYPE_BUY' ? bid - SLIPPAGE : ask + SLIPPAGE, 'DEAL_REASON_EXPERT'); return ok({ positionId: p.id }); }
      case 'POSITION_PARTIAL': { const p = find(); if (!p) return rej(10036, 'TRADE_RETCODE_POSITION_CLOSED', 'Position not found'); if (!(b.volume > 0) || b.volume >= p.volume) return rej(10014, 'TRADE_RETCODE_INVALID_VOLUME', 'Invalid volume'); this.close(p, p.type === 'POSITION_TYPE_BUY' ? bid - SLIPPAGE : ask + SLIPPAGE, 'DEAL_REASON_EXPERT', b.volume); return ok({ positionId: p.id }); }
      default: return rej(10013, 'TRADE_RETCODE_INVALID', 'Unsupported ' + b.actionType);
    }
  }
}

// US payrolls (first Friday, 08:30 New York) as this week's calendar — the
// only top-tier release whose date follows a fixed rule. Other releases
// (CPI, FOMC...) are not modelled: the replay may take a few trades the live
// bot would skip around them.
function nfpEvents(ms) {
  const out = [];
  for (let dm = -1; dm <= 1; dm++) {
    const d = new Date(ms), y = d.getUTCFullYear(), m = d.getUTCMonth() + dm, first = new Date(Date.UTC(y, m, 1)).getUTCDay(), day = 1 + ((5 - first + 7) % 7);
    const nyMidnight = Date.UTC(y, m, day, 0, 0), at = nyMidnight + (8.5 * 60 + (usDst(nyMidnight + 12 * 3600000) ? 240 : 300)) * 60000;
    if (Math.abs(at - ms) < 8 * 86400000) out.push({ title: 'Non-Farm Employment Change', country: 'USD', impact: 'High', date: new Date(at).toISOString() });
  }
  return out;
}

function makeFetch(broker) {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'content-type': 'application/json' } });
  return async (url, opts) => {
    url = String(url); opts = opts || {};
    broker.advance();
    if (url.includes('api.telegram.org')) { broker.telegram++; return json({ ok: true, result: { message_id: broker.telegram } }); }
    if (url.includes('faireconomy')) return json(nfpEvents(VNOW));
    const m = url.match(/agiliumtrade\.ai\/users\/current\/accounts\/[^/]+(\/[^?]*)(\?.*)?$/);
    if (!m) return new Response('not found', { status: 404 });
    const p = m[1], q = new URLSearchParams((m[2] || '').slice(1));
    let mm;
    if ((mm = p.match(/^\/historical-market-data\/symbols\/([^/]+)\/timeframes\/([^/]+)\/candles$/))) return json(broker.mk.candles(mm[2], parseInt(q.get('limit') || '100', 10), VNOW));
    if (/\/current-price$/.test(p)) { const tv = +(0.01 * CONTRACT * RATE).toFixed(6); return json({ symbol: 'XAUUSD', bid: broker.bid(), ask: broker.ask(), profitTickValue: tv, lossTickValue: tv, time: new Date(VNOW).toISOString(), brokerTime: new Date(VNOW + srvOff(VNOW)).toISOString().replace('T', ' ').slice(0, 23) }); }
    if (/\/specification$/.test(p)) return json({ symbol: 'XAUUSD', tickSize: 0.01, contractSize: CONTRACT, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, stopsLevel: 0, freezeLevel: 0, digits: 2 });
    if (p === '/symbols') return json(['XAUUSD']);
    if (p === '/account-information') return json(broker.account());
    if (p === '/positions') return json(broker.positions.map(x => broker.view(x)));
    if (p === '/orders') return json([]);
    if ((mm = p.match(/^\/history-deals\/position\/(.+)$/))) return json(broker.deals[decodeURIComponent(mm[1])] || []);
    if (p.startsWith('/history-')) return json([]);
    if (p === '/trade' && opts.method === 'POST') return json(broker.trade(JSON.parse(opts.body || '{}')));
    return new Response('not found', { status: 404 });
  };
}

// ── the exit model used for the random-entry test ───────────────────────────
// Same rules as v1 (TP1 lot / breakeven at TP1 / 0.5R ladder / flat before the
// daily break / 8h max), applied bar by bar with the stop checked first.
function ladderFor(o) {
  const sgn = o.isBuy ? 1 : -1, r = o.risk, out = [], rnd = x => Math.round(x * 100) / 100;
  if (!(r > 0)) return out;
  const be = rnd(o.entry + sgn * o.beBuf); out.push({ threshold: rnd(o.tp1), stopLoss: be });
  const lag = Math.max((o.trailAtr || 1) * (o.atr || r), 0.5 * r);
  let prev = be;
  for (let k = 1.5; out.length < 20 && k < 40; k += 0.5) { const th = o.entry + sgn * k * r; if (sgn * (th - o.finalTp) >= -1e-9) break; if (sgn * (th - o.tp1) <= 1e-9) continue; const sl = rnd(th - sgn * lag); if (sgn * (sl - prev) <= 0.005) continue; out.push({ threshold: rnd(th), stopLoss: sl }); prev = sl; }
  return out;
}
function simulateExit(mk, o) {
  // o: { t0, isBuy, entry, risk, tp1, finalTp, legFrac, ladder, maxHoldMs }
  const buy = o.isBuy, sgn = buy ? 1 : -1, sl0 = o.entry - sgn * o.risk;
  let slB = sl0, aOpen = o.legFrac > 0, bOpen = true, exA = null, exB = null;
  const start = mk.idxAt(o.t0) + 1;
  for (let i = start; i < mk.n && (aOpen || bOpen); i++) {
    const t = mk.t[i]; if (!xmOpen(t)) continue;
    const sp = spreadAt(t), O = buy ? mk.o[i] : mk.o[i] + sp, H = buy ? mk.h[i] : mk.h[i] + sp, L = buy ? mk.l[i] : mk.l[i] + sp;
    if (t - o.t0 > o.maxHoldMs || flattenDue(t)) { if (aOpen) { exA = O; aOpen = false; } if (bOpen) { exB = O; bOpen = false; } break; }
    if (aOpen && (buy ? L <= sl0 : H >= sl0)) { exA = buy ? Math.min(sl0, O) : Math.max(sl0, O); aOpen = false; }
    if (bOpen && (buy ? L <= slB : H >= slB)) { exB = buy ? Math.min(slB, O) : Math.max(slB, O); bOpen = false; }
    if (aOpen && (buy ? H >= o.tp1 : L <= o.tp1)) { exA = buy ? Math.max(o.tp1, O) : Math.min(o.tp1, O); aOpen = false; }
    if (bOpen && (buy ? H >= o.finalTp : L <= o.finalTp)) { exB = buy ? Math.max(o.finalTp, O) : Math.min(o.finalTp, O); bOpen = false; }
    if (bOpen) { const ext = buy ? H : L; for (const lv of o.ladder) if (buy ? ext >= lv.threshold : ext <= lv.threshold) { if (buy ? lv.stopLoss > slB : lv.stopLoss < slB) slB = lv.stopLoss; } }
  }
  const last = mk.c[mk.n - 1];
  if (aOpen) exA = last; if (bOpen) exB = last;
  const rA = o.legFrac > 0 ? (exA - o.entry) * sgn / o.risk : 0, rB = (exB - o.entry) * sgn / o.risk;
  return o.legFrac * rA + (1 - o.legFrac) * rB;
}

// ── run ─────────────────────────────────────────────────────────────────────
(async () => {
  const rows = loadBars();
  if (rows.length < 1000) throw new Error('only ' + rows.length + ' M1 bars in range — wrong data file?');
  const mk = new DataMarket(rows);
  const broker = new Broker(mk);
  global.fetch = makeFetch(broker);
  global._botState = { botConfig: { symbol: 'XAUUSD', mode: 'normal', risk: 2, currency: CURRENCY, region: 'new-york' } };
  const be = require(path.join(PROJ, 'bot-engine.js'));
  const JP = process.env.JOURNAL_PATH, captured = {}, trades = [], statuses = {}, blocks = {};
  const capture = (trim) => {
    let j; try { j = JSON.parse(fs.readFileSync(JP, 'utf8')); } catch (e) { return; }
    let changed = false;
    for (const t of j.trades) {
      if (!t || t.outcome === null || captured[t.id]) continue;
      if (t.legAId && !t.legAClosed && broker.positions.some(p => p.id === String(t.legAId))) continue; // wait for its TP1 lot
      captured[t.id] = true;
      trades.push({ id: t.id, ts: t.ts, closedTs: t.closedTs, signal: t.signal, score: t.score, entry: t.fillPrice || t.entryPrice, decision: t.entryPrice, sl: t.sl, tp1: t.tp1, finalTp: t.finalTp || t.tp, lots: t.lots,
        legA: !!t.legAId, risk: Math.abs((t.entryPrice || 0) - (t.sl || 0)), r: t.r, pnl: t.pnl, riskAmount: t.riskAmount, costFrac: t.costFrac, spread: t.spreadAtEntry, slippage: t.slippage,
        session: t.session, hour: t.sessionHour, dur: t.tradeDuration, maeR: t.maeR, mfeR: t.mfeR, version: t.strategyVersion || t.codeVersion,
        // stop size in 15-minute ATRs at entry, and whether V1_MIN_STOP_ATR widened it (2026-10-24)
        stopAtr: (() => { const a = mk.atr15(Date.parse(t.ts)); return a > 0 && t.sl ? Math.round(Math.abs((t.entryPrice || 0) - t.sl) / a * 100) / 100 : null; })(),
        widened: (t.hits || []).some(h => /Stop widened/.test(String(h))),
        // the TP1 lot's own result (two-leg trades: legPnl; runners: partialPnl),
        // so the verdict can re-weight a trade for a different lot cap, and the
        // bot's daily trend at entry (2026-10-24)
        legPnl: typeof t.legPnl === 'number' ? t.legPnl : null, partialPnl: typeof t.partialPnl === 'number' ? t.partialPnl : null, tp1Hit: !!t.tp1Hit,
        d1: (t.macroTrend && t.macroTrend.daily && t.macroTrend.daily.direction) || null,
        // signal study (2026-10-30): how far price went the trade's way after
        // entry, before costs and with no exits, in R
        fwd: forwardMoves(mk, Date.parse(t.ts), t.signal === 'buy' ? 1 : t.signal === 'sell' ? -1 : 0, Math.abs((t.entryPrice || 0) - (t.sl || 0))) });
    }
    if (trim && j.trades.length > 120) {
      // keep the journal small (the bot rewrites it on every change): open
      // trades and the last two days' trades stay, captured older ones go.
      const keepAfter = VNOW - 2 * 86400000;
      const kept = j.trades.filter(t => t.outcome === null || !captured[t.id] || new Date(t.ts).getTime() > keepAfter);
      if (kept.length !== j.trades.length) { j.trades = kept; changed = true; }
    }
    if (changed) fs.writeFileSync(JP, JSON.stringify(j));
  };
  const cycleMs = CYCLE_MIN * 60000;
  // stop where the data stops (e.g. the current year)
  const END = Math.min(TO, mk.t[mk.n - 1] + 3600000);
  let nClosed = 0, cycles = 0, lastTrim = 0;
  for (let t = FROM; t < END; t += cycleMs) {
    if (VNOW < t) VNOW = t;
    if (!xmOpen(VNOW)) continue;
    broker.advance();
    let res;
    try { res = await be.runCycle(); } catch (e) { res = { status: 'THREW', message: e.message }; if (errOut.length < 50) errOut.push('runCycle threw: ' + e.stack); }
    broker.advance(); cycles++;
    statuses[res.status] = (statuses[res.status] || 0) + 1;
    if (res.status === 'v1_blocked') { const k = String(res.message || '').replace('Not placed: ', '').replace(/[-+]?\d+(\.\d+)?/g, '#').replace(/\(.*$/, '').replace(/:.*$/, '').trim().slice(0, 50); blocks[k] = (blocks[k] || 0) + 1; }
    if (broker.closed.length !== nClosed) { nClosed = broker.closed.length; capture(false); }
    if (VNOW - lastTrim > 86400000) { lastTrim = VNOW; capture(true); }
  }
  // close anything still open at the end at market, then record it
  VNOW = Math.max(VNOW, END); broker.advance();
  for (const p of broker.positions.slice()) broker.close(p, p.type === 'POSITION_TYPE_BUY' ? broker.bid() : broker.ask(), 'END');
  try { await be.reconcileClosedTrades(be.getCfg(), []); await be.reconcileClosedTrades(be.getCfg(), []); } catch (e) { /* best effort */ }
  capture(false);
  pumping = false;

  // ── R, sanity checks and the random-entry test ──────────────────────────
  const v1 = trades.filter(t => typeof t.r === 'number');
  const rs = v1.map(t => t.r), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };
  const rnd = mulberry32((SEED * 7919 + new Date(FROM).getUTCFullYear()) | 0);
  const legFracOf = t => t.lots >= 0.02 ? 0.01 / t.lots : 0;
  const pure = [], specs = [];
  for (const t of v1) {
    const t0 = Date.parse(t.ts), isBuy = t.signal === 'buy', atr = mk.atr15(t0) || t.risk / 0.9, sp = spreadAt(t0);
    if (!(t.risk > 0) || !(t.tp1 > 0) || !(t.finalTp > 0)) continue;
    const beBuf = Math.min(3, Math.max(0.5, sp * 2));
    const spec = { t0, isBuy, entry: t.decision, risk: t.risk, tp1: t.tp1, finalTp: t.finalTp, legFrac: legFracOf(t), beBuf, atr, trailAtr: parseFloat(process.env.TRAIL_ATR_MULT || '1') || 1, maxHoldMs: (parseFloat(process.env.V1_MAX_HOLD_HOURS || '8') || 8) * 3600000,
      riskAtr: t.risk / atr, tp1R: Math.abs(t.tp1 - t.decision) / t.risk, finR: Math.abs(t.finalTp - t.decision) / t.risk };
    spec.ladder = ladderFor(spec);
    specs.push(spec); pure.push({ actual: t.r, model: simulateExit(mk, spec) });
  }
  const model = pure.map(x => x.model), actual = pure.map(x => x.actual);
  const corr = (() => { const n = model.length; if (n < 3) return null; const ma = mean(model), mb = mean(actual); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const a = model[i] - ma, b = actual[i] - mb; sab += a * b; saa += a * a; sbb += b * b; } return saa && sbb ? sab / Math.sqrt(saa * sbb) : null; })();
  const repSums = [];
  if (RANDOM_K > 0 && specs.length) {
    for (let k = 0; k < RANDOM_K; k++) {
      let s = 0;
      for (const sp0 of specs) {
        let t1 = sp0.t0;
        for (let tries = 0; tries < 12; tries++) { const d = Math.floor(rnd() * 11) - 5; if (d === 0) continue; const c = sp0.t0 + d * 86400000; if (c > FROM && c < END - 9 * 3600000 && entryAllowed(c)) { t1 = c; break; } }
        const isBuy = rnd() < 0.5, i1 = mk.idxAt(t1), spr = spreadAt(t1), atr1 = mk.atr15(t1) || sp0.atr;
        const entry = isBuy ? mk.c[i1] + spr : mk.c[i1], risk = Math.max(0.5, sp0.riskAtr * atr1), sgn = isBuy ? 1 : -1;
        const o = { t0: t1, isBuy, entry, risk, tp1: entry + sgn * sp0.tp1R * risk, finalTp: entry + sgn * sp0.finR * risk, legFrac: sp0.legFrac, beBuf: Math.min(3, Math.max(0.5, spr * 2)), atr: atr1, trailAtr: sp0.trailAtr, maxHoldMs: sp0.maxHoldMs };
        o.ladder = ladderFor(o);
        s += simulateExit(mk, o);
      }
      repSums.push(Math.round(s * 1000) / 1000);
    }
  }
  const out = {
    label: LABEL, from: new Date(FROM).toISOString(), to: new Date(END).toISOString(), synthetic: SYNTHETIC, seed: SEED,
    settings: { cycleMin: CYCLE_MIN, spreadMult: SPREAD_MULT, slippage: SLIPPAGE, balance: BALANCE, currency: CURRENCY, rate: RATE, spreadTable: !!SPREAD_TABLE, env: VARIANT_ENV },
    bars: mk.n, cycles, statuses, blocks, errors: errOut.slice(0, 20), brokerRejects: broker.rejects, serverStopMoves: broker.serverMoves,
    n: v1.length, meanR: mean(rs), sdR: sd(rs), sumR: rs.reduce((a, b) => a + b, 0),
    model: { n: model.length, sumR: model.reduce((a, b) => a + b, 0), corrWithActual: corr, meanAbsDiff: model.length ? mean(model.map((m, i) => Math.abs(m - actual[i]))) : null },
    random: { k: repSums.length, sums: repSums },
    trades, runSeconds: Math.round((RealDate.now() - t0Real) / 1000),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  process.stdout.write('replay ' + out.from.slice(0, 10) + '..' + out.to.slice(0, 10) + ': ' + out.n + ' trades, mean ' + (out.meanR === null ? '—' : out.meanR.toFixed(3)) + 'R, model corr ' + (corr === null ? '—' : corr.toFixed(2)) + ', ' + out.runSeconds + 's, errors ' + errOut.length + '\n');
  // Also as a GitHub annotation: readable on the run page and through the API
  // (plain log lines and uploaded files aren't, from outside GitHub's UI).
  if (process.env.GITHUB_ACTIONS) {
    const top = o => Object.keys(o || {}).sort((a, b) => o[b] - o[a]).slice(0, 6).map(k => k + ' ' + o[k]).join(', ');
    const wins = rs.filter(r => r > 0).length;
    const msg = out.from.slice(0, 10) + ' → ' + out.to.slice(0, 10) + ': ' + out.n + ' trades, mean ' + (out.meanR === null ? '—' : out.meanR.toFixed(3)) + 'R, total ' + out.sumR.toFixed(1) + 'R, winners ' + (rs.length ? (wins / rs.length * 100).toFixed(0) + '%' : '—') +
      ' | cycles ' + cycles + ': ' + top(statuses) + ' | refused: ' + (top(blocks) || 'none') + ' | exit-model corr ' + (corr === null ? '—' : corr.toFixed(2)) + ' | errors ' + errOut.length + (errOut.length ? ' (first: ' + String(errOut[0]).slice(0, 160) + ')' : '') + ' | ' + out.runSeconds + 's';
    process.stdout.write('::notice title=Replay ' + LABEL + ' ' + out.from.slice(0, 7) + '::' + msg.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A') + '\n');
  }
  try { fs.rmSync(STATE, { recursive: true, force: true }); } catch (e) { /* tmp */ }
  process.exit(0);
})().catch(e => { realError('replay failed:', e && e.stack || e); process.exit(1); });
