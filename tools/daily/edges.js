#!/usr/bin/env node
/**
 * Daily edges: five strategies that trade most days or every few days, tested on
 * 1-minute prices with XM-style costs. Added 31 Oct 2026. Rules, written before any
 * run on real prices: tools/replay/RULES.md, "Daily edges".
 *
 *   ibs-nas, ibs-ger   Internal bar strength (Pagonidis 2013): buy the cash close when
 *                      IBS < 0.2; hold while each new close still has IBS < 0.2.
 *   rsi2               Connors RSI(2) on Nasdaq and DAX together: close > SMA200 and
 *                      RSI(2) < 5 -> buy the close; sell the first close above SMA5.
 *   gold-asia-long     Buy gold 19:15 New York, sell 03:00 New York (London open).
 *   gold-us-short      Sell gold 08:20 New York (COMEX open), buy back 13:30 New York.
 *
 * node tools/daily/edges.js --test ibs-nas --period development --data DIR --md v.md [--out r.json] [--log VARIANTS.md]
 * node tools/daily/edges.js --test ibs-nas --period control --seed 1 --md v.md
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const TEST = args.test;
const PERIOD = args.period || 'development';
const LABEL = args.label || TEST;
const PERIODS = {
  development: ['2015-01-01', '2025-01-01'],
  final: ['2025-01-01', '2026-11-01'],
  control: ['2015-01-01', '2025-01-01'],
};
const [FROM, TO] = PERIODS[PERIOD];
const CONTROL = PERIOD === 'control';

// ---------- markets ----------
// Index CFDs: spreads in index points at the decision minute (the replay's estimates for
// XM's cash session), slippage 0.5 points, long swap 0.025% of price a night (~9% a year).
const MK = {
  nas: { name: 'US100Cash#', inst: 'nsxusd', tz: 'ny', open: 9 * 60 + 30, sig: 15 * 60 + 55, spread: 1.5, slip: 0.5, swap: 0.00025, synth: 5000 },
  ger: { name: 'GER40Cash#', inst: 'grxeur', tz: 'fra', open: 9 * 60, sig: 17 * 60 + 25, spread: 1.8, slip: 0.5, swap: 0.00025, synth: 10000 },
  gold: { name: 'GOLD (XAUUSD)', inst: 'xauusd', slip: 0.10, synth: 1200 },
};
const TESTS = {
  'ibs-nas': { kind: 'mr', rule: 'ibs', markets: ['nas'] },
  'ibs-ger': { kind: 'mr', rule: 'ibs', markets: ['ger'] },
  rsi2: { kind: 'mr', rule: 'rsi2', markets: ['nas', 'ger'] },
  'gold-asia-long': { kind: 'session', dir: 1, start: 19 * 60 + 15, end: 3 * 60, cross: true, markets: ['gold'] },
  'gold-us-short': { kind: 'session', dir: -1, start: 8 * 60 + 20, end: 13 * 60 + 30, cross: false, markets: ['gold'] },
};
const T = TESTS[TEST];
if (!T) { console.error('unknown --test; one of ' + Object.keys(TESTS).join(', ')); process.exit(1); }

// ---------- clocks (all data in UTC ms) ----------
function usDst(ms) {
  const y = new Date(ms).getUTCFullYear(), nth = (m, n) => { const f = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - f) % 7) + (n - 1) * 7; };
  return ms >= Date.UTC(y, 2, nth(2, 2), 7) && ms < Date.UTC(y, 10, nth(10, 1), 6);
}
function euDst(ms) {
  const y = new Date(ms).getUTCFullYear(), last = m => { const d = new Date(Date.UTC(y, m + 1, 0)); return d.getUTCDate() - d.getUTCDay(); };
  return ms >= Date.UTC(y, 2, last(2), 1) && ms < Date.UTC(y, 9, last(9), 1);
}
const nyOff = ms => (usDst(ms) ? -4 : -5) * 3600000;
const fraOff = ms => (euDst(ms) ? 2 : 1) * 3600000;
function local(ms, tz) {
  const t = new Date(ms + (tz === 'fra' ? fraOff(ms) : nyOff(ms)));
  return { day: t.toISOString().slice(0, 10), mod: t.getUTCHours() * 60 + t.getUTCMinutes(), wd: t.getUTCDay() };
}
/** UTC ms of New York local time `mod` minutes on NY date `day` (YYYY-MM-DD). */
function nyToUtc(day, mod) {
  const [y, m, d] = day.split('-').map(Number), base = Date.UTC(y, m - 1, d) + mod * 60000;
  return base - nyOff(base + 5 * 3600000);
}
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// XM gold spread by server time (server = New York + 7h), copied from tools/replay/replay.js.
function goldSpread(ms) {
  const t = new Date(ms + nyOff(ms) + 7 * 3600000), h = t.getUTCHours(), mod = h * 60 + t.getUTCMinutes(), wd = t.getUTCDay();
  let sp = h >= 9 && h < 20 ? 0.20 : 0.28;
  if (mod >= 23 * 60 + 25 || mod < 95) sp = 0.60;
  if (wd === 1 && mod < 125) sp = 0.80;
  return sp;
}

// ---------- prices ----------
function loadInst(inst) {
  if (CONTROL) return synthetic(inst);
  const dir = args.data || 'tools/replay/data';
  const files = fs.readdirSync(dir).filter(f => f.startsWith(inst + '-') && f.endsWith('.csv.gz')).sort();
  if (!files.length) throw new Error(`no ${inst}-*.csv.gz in ${dir}`);
  const rows = [];
  for (const f of files) {
    const lines = zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8').split('\n');
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',');
      if (c.length < 5) continue;
      rows.push([+c[0], +c[1], +c[2], +c[3], +c[4]]);
    }
  }
  rows.sort((a, b) => a[0] - b[0]);
  const D = { t: [], o: [], h: [], l: [], c: [] };
  let last = -1;
  for (const r of rows) {
    if (r[0] === last) continue;
    last = r[0]; D.t.push(r[0]); D.o.push(r[1]); D.h.push(r[2]); D.l.push(r[3]); D.c.push(r[4]);
  }
  return D;
}
function synthetic(inst) {
  let s = ((+args.seed || 1) * 2654435761 + inst.length * 97) % 4294967296;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const D = { t: [], o: [], h: [], l: [], c: [] };
  let p = MK[inst === 'xauusd' ? 'gold' : inst === 'nsxusd' ? 'nas' : 'ger'].synth;
  for (let t = Date.UTC(2013, 9, 15); t < Date.UTC(2025, 0, 6); t += 60000) {
    const wd = new Date(t).getUTCDay();
    if (wd === 6 || (wd === 0 && new Date(t).getUTCHours() < 22) || (wd === 5 && new Date(t).getUTCHours() >= 21)) continue;
    const o = p, a = o * (1 + 0.0003 * g()), b = a * (1 + 0.0003 * g());
    p = b;
    D.t.push(t); D.o.push(o); D.h.push(Math.max(o, a, b)); D.l.push(Math.min(o, a, b)); D.c.push(b);
  }
  return D;
}
function firstAtOrAfter(D, ms) {
  let lo = 0, hi = D.t.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (D.t[m] < ms) lo = m + 1; else hi = m; }
  return lo;
}

// ---------- helpers ----------
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const tstat = a => (a.length > 1 && sd(a) > 0 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : 0);
let seed = 20261031;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const P = (x, d = 1) => (100 * x).toFixed(d) + '%';

// ---------- mean reversion on daily cash-session bars ----------
function cashDays(D, mk) {
  const days = [];
  let cur = null;
  const need = 0.6 * (mk.sig - mk.open);
  for (let i = 0; i < D.t.length; i++) {
    const L = local(D.t[i], mk.tz);
    if (L.mod < mk.open || L.mod >= mk.sig) continue;
    if (!cur || cur.day !== L.day) {
      if (cur && cur.n >= need) days.push(cur);
      cur = { day: L.day, o: D.o[i], h: D.h[i], l: D.l[i], c: D.c[i], n: 0 };
    }
    cur.h = Math.max(cur.h, D.h[i]); cur.l = Math.min(cur.l, D.l[i]); cur.c = D.c[i]; cur.n++;
  }
  if (cur && cur.n >= need) days.push(cur);
  // indicators on the decision-minute closes
  let ag = 0, al = 0;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    d.ibs = d.h > d.l ? (d.c - d.l) / (d.h - d.l) : 0.5;
    if (i >= 199) { let s = 0; for (let k = i - 199; k <= i; k++) s += days[k].c; d.sma200 = s / 200; }
    if (i >= 4) { let s = 0; for (let k = i - 4; k <= i; k++) s += days[k].c; d.sma5 = s / 5; }
    if (i >= 1) {
      const ch = d.c - days[i - 1].c, gain = Math.max(ch, 0), loss = Math.max(-ch, 0);
      if (i <= 2) { ag += gain / 2; al += loss / 2; } else { ag = (ag * 1 + gain) / 2; al = (al * 1 + loss) / 2; }
      if (i >= 2) d.rsi2 = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
  }
  return days;
}
function tradeRet(mk, days, i, j, cm) {
  const e = days[i].c, x = days[j].c, nights = dayDiff(days[i].day, days[j].day);
  return (x - e - (mk.spread + mk.slip) * cm) / e - mk.swap * nights * cm;
}
function runMR(rule, mk, days, cm) {
  const trades = [];
  let pos = -1;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (pos >= 0) {
      const exit = rule === 'ibs' ? d.ibs >= 0.2 : d.sma5 != null && d.c > d.sma5;
      if (exit) {
        trades.push({ market: mk.name, entryDay: days[pos].day, exitDay: d.day, i: pos, j: i, hold: i - pos,
          entry: days[pos].c, exit: d.c, ret: tradeRet(mk, days, pos, i, cm), nights: dayDiff(days[pos].day, d.day) });
        pos = -1;
      }
      continue;
    }
    if (d.day < FROM || d.day >= TO) continue;
    const go = rule === 'ibs' ? d.ibs < 0.2 : d.sma200 != null && d.rsi2 != null && d.c > d.sma200 && d.rsi2 < 5;
    if (go) pos = i;
  }
  return trades;
}

// ---------- gold session trades ----------
function runSession(D, t, cm) {
  const trades = [], seen = new Set();
  const dayOf = ms => local(ms, 'ny');
  for (let i = 0; i < D.t.length; i++) {
    const L = dayOf(D.t[i]);
    if (L.mod < t.start || L.mod > t.start + 10 || seen.has(L.day)) continue;
    // weekdays the window may start: Sun-Thu evenings for the Asian window, Mon-Fri mornings for the US one
    if (t.cross ? !(L.wd >= 0 && L.wd <= 4) : !(L.wd >= 1 && L.wd <= 5)) continue;
    seen.add(L.day);
    const exitDay = t.cross ? addDays(L.day, 1) : L.day;
    if (exitDay < FROM || exitDay >= TO) continue;
    const xi = firstAtOrAfter(D, nyToUtc(exitDay, t.end));
    if (xi >= D.t.length) continue;
    const XL = dayOf(D.t[xi]);
    if (XL.day !== exitDay || XL.mod > t.end + 10) continue;   // data gap: no trade
    const e = D.o[i], x = D.o[xi];
    const cost = ((t.dir > 0 ? goldSpread(D.t[i]) : goldSpread(D.t[xi])) + MK.gold.slip) * cm;
    const ret = (t.dir * (x - e) - cost) / e;
    trades.push({ day: exitDay, entryMs: D.t[i], exitMs: D.t[xi], entry: e, exit: x, ret, dur: D.t[xi] - D.t[i] });
  }
  return trades;
}
/** The same day, same length and direction, starting at a random minute of that XM day (18:05-16:55 New York). */
function placeboSession(D, t, trades, cm) {
  let s = 0, n = 0;
  for (const tr of trades) {
    const L = local(tr.entryMs, 'ny');
    // the XM day that holds the trade starts at 18:05 New York the evening before (or that evening, for 19:15 starts)
    const startDay = L.mod >= 18 * 60 + 5 ? L.day : addDays(L.day, -1);
    const s0 = nyToUtc(startDay, 18 * 60 + 5), s1 = s0 + (22 * 60 + 50) * 60000 - tr.dur;
    if (s1 <= s0) continue;
    const ei = firstAtOrAfter(D, s0 + rnd() * (s1 - s0)), xi = firstAtOrAfter(D, D.t[ei] + tr.dur);
    if (ei >= D.t.length || xi >= D.t.length || D.t[xi] - D.t[ei] > tr.dur + 15 * 60000) continue;
    const e = D.o[ei], x = D.o[xi];
    const cost = ((t.dir > 0 ? goldSpread(D.t[ei]) : goldSpread(D.t[xi])) + MK.gold.slip) * cm;
    s += (t.dir * (x - e) - cost) / e; n++;
  }
  return n ? s / n : 0;
}

// ---------- run ----------
const CM = CONTROL ? 0 : 1;   // control runs are judged before costs
let trades, trades15, randMeans = [], perMarket = {};
if (T.kind === 'mr') {
  trades = []; trades15 = [];
  const all = {};
  for (const m of T.markets) {
    const mk = MK[m], days = cashDays(loadInst(mk.inst), mk);
    all[m] = { mk, days };
    const tr = runMR(T.rule, mk, days, CM);
    trades.push(...tr);
    trades15.push(...runMR(T.rule, mk, days, 1.5 * Math.max(CM, 0)));
    perMarket[mk.name] = tr;
  }
  // random long entries in the same calendar year, held for the same number of sessions
  const byYear = {};
  for (const m of T.markets) {
    const { days } = all[m];
    for (let i = 0; i < days.length; i++) { const y = days[i].day.slice(0, 4); (byYear[m + y] = byYear[m + y] || []).push(i); }
  }
  for (let k = 0; k < 1000; k++) {
    let s = 0, n = 0;
    for (const tr of trades) {
      const m = T.markets.find(mm => MK[mm].name === tr.market), { mk, days } = all[m];
      const pool = byYear[m + tr.entryDay.slice(0, 4)];
      let i = pool[Math.floor(rnd() * pool.length)];
      if (i + tr.hold >= days.length) i = days.length - 1 - tr.hold;
      s += tradeRet(mk, days, i, i + tr.hold, CM); n++;
    }
    randMeans.push(s / n);
  }
} else {
  const D = loadInst('xauusd');
  trades = runSession(D, T, CM);
  trades15 = runSession(D, T, 1.5 * Math.max(CM, 0));
  perMarket[MK.gold.name] = trades;
  for (let k = 0; k < 1000; k++) randMeans.push(placeboSession(D, T, trades, CM));
}

// ---------- stats ----------
const r = trades.map(t => t.ret), r15 = trades15.map(t => t.ret);
const ruleMean = mean(r);
const pct = randMeans.filter(m => ruleMean > m).length / randMeans.length;
const wins = r.filter(x => x > 0), losses = r.filter(x => x <= 0);
const keyDay = t => t.exitDay || t.day;
const byYear = new Map(), byMonth = new Map();
for (const t of trades) {
  const y = keyDay(t).slice(0, 4), mo = keyDay(t).slice(0, 7);
  if (!byYear.has(y)) byYear.set(y, []);
  byYear.get(y).push(t.ret);
  byMonth.set(mo, (byMonth.get(mo) || 0) + t.ret);
}
// equity at 1x, one position per market at a time, compounding trade by trade in exit order
const ordered = [...trades].sort((a, b) => (keyDay(a) < keyDay(b) ? -1 : 1));
let eq = 1, peak = 1, mdd = 0;
for (const t of ordered) { eq *= 1 + t.ret; peak = Math.max(peak, eq); mdd = Math.max(mdd, 1 - eq / peak); }
const years = (Date.parse(TO) - Date.parse(FROM)) / (365.25 * 86400000);
const cagr = Math.pow(Math.max(eq, 1e-9), 1 / years) - 1;
const yearRows = [...byYear].sort().map(([y, a]) => ({ y, n: a.length, ret: a.reduce((s, x) => (1 + s) * (1 + x) - 1, 0), t: tstat(a) }));
const months = [...byMonth.values()];
const posMonths = months.filter(x => x > 0).length / (months.length || 1);
const S = {
  trades: trades.length, win: wins.length / (r.length || 1), avgWin: mean(wins), avgLoss: mean(losses),
  pf: losses.length ? wins.reduce((a, b) => a + b, 0) / -losses.reduce((a, b) => a + b, 0) : Infinity,
  mean: ruleMean, t: tstat(r), mean15: mean(r15), t15: tstat(r15), total: eq - 1, cagr, mdd, posMonths, nMonths: months.length,
  randomPct: pct, randomMedian: [...randMeans].sort((a, b) => a - b)[500],
  holdAvg: T.kind === 'mr' ? mean(trades.map(t => t.hold)) : mean(trades.map(t => t.dur / 3600000)),
};

// ---------- rules ----------
let rules, verdict;
const yearsJudged = yearRows.filter(y => y.n >= (T.kind === 'mr' ? 5 : 30));
const fracYears = yearsJudged.filter(y => y.ret > 0).length / (yearsJudged.length || 1);
if (PERIOD === 'development' && T.kind === 'mr') {
  rules = [
    ['M1', 'at least 100 trades', S.trades >= 100],
    ['M2', 'mean return a trade > 0 after costs and swaps, t ≥ 2.5', S.mean > 0 && S.t >= 2.5],
    ['M3', 'beats ≥ 95% of random long entries (same year, same holding time, same costs)', pct >= 0.95],
    ['M4', 'positive in ≥ 60% of years with 5+ trades', fracYears >= 0.6],
    ['M5', 'still positive with costs and swaps × 1.5', S.mean15 > 0],
  ];
  verdict = S.trades < 100 ? 'TOO FEW TRADES' : rules.every(x => x[2]) ? 'PASS' : 'FAIL';
} else if (PERIOD === 'development') {
  rules = [
    ['G1', 'at least 300 trades', S.trades >= 300],
    ['G2', 'mean return a day > 0 after costs, t ≥ 3', S.mean > 0 && S.t >= 3],
    ['G3', 'beats ≥ 95% of same-length windows at random times of the same days', pct >= 0.95],
    ['G4', 'positive in ≥ 2/3 of years with 30+ trades', fracYears >= 2 / 3],
    ['G5', 'still positive with costs × 1.5', S.mean15 > 0],
    ['G6', 'positive in ≥ 55% of months', posMonths >= 0.55],
  ];
  verdict = S.trades < 300 ? 'TOO FEW TRADES' : rules.every(x => x[2]) ? 'PASS' : 'FAIL';
} else if (PERIOD === 'final') {
  const minT = T.kind === 'mr' ? 30 : 200;
  rules = [
    ['F1', `at least ${minT} trades`, S.trades >= minT],
    ['F2', 'mean > 0 after costs, t ≥ 1.5', S.mean > 0 && S.t >= 1.5],
    ['F3', 'beats ≥ 90% of the random benchmark', pct >= 0.9],
  ];
  verdict = rules.every(x => x[2]) ? 'PASS' : 'FAIL';
} else {
  // A long-only rule on one random path inherits that path's trend, so the control asks whether the
  // rule beats its own random benchmark, not whether it made money.
  const z = (S.mean - S.randomMedian) / (sd(r) / Math.sqrt(r.length || 1));
  S.zVsRandom = z;
  rules = [
    ['C1', '|z| < 2 for the rule against its random benchmark, before costs', Math.abs(z) < 2],
    ['C2', 'random-benchmark percentile between 5% and 95%', pct > 0.05 && pct < 0.95],
  ];
  verdict = rules.every(x => x[2]) ? 'PASS' : 'FAIL';
}

// ---------- report ----------
const unit = T.kind === 'mr' ? 'trade' : 'day';
const md = [
  `# Daily edges — ${LABEL} (${PERIOD}) · ${Object.keys(perMarket).join(' + ')}`,
  '',
  `**${verdict}** · ${FROM} → ${TO} · ${CONTROL ? 'random-walk prices, before costs' : 'real 1-minute prices, XM-style costs'}`,
  '',
  '| | |', '|---|---|',
  `| Trades | ${S.trades} · winners ${P(S.win)} · average hold ${S.holdAvg.toFixed(1)} ${T.kind === 'mr' ? 'sessions' : 'hours'} |`,
  `| Mean a ${unit} after costs | ${P(S.mean, 3)}, t = ${S.t.toFixed(2)} |`,
  `| Average win / loss | ${P(S.avgWin, 2)} / ${P(S.avgLoss, 2)} · profit factor ${S.pf.toFixed(2)} |`,
  `| Total at 1× size | ${P(S.total)} (${P(S.cagr)} a year) · worst drawdown ${P(S.mdd)} |`,
  `| Positive months | ${P(S.posMonths)} of ${S.nMonths} |`,
  `| Costs × 1.5 | mean ${P(S.mean15, 3)} a ${unit}, t = ${S.t15.toFixed(2)} |`,
  `| Random benchmark (1,000 runs) | median ${P(S.randomMedian, 3)} · rule ${P(S.mean, 3)} · rule beats ${P(pct)} |`,
  ...(Object.keys(perMarket).length > 1 ? Object.entries(perMarket).map(([k, a]) => `| ${k} | ${a.length} trades · mean ${P(mean(a.map(x => x.ret)), 3)}, t = ${tstat(a.map(x => x.ret)).toFixed(2)} · winners ${P(a.filter(x => x.ret > 0).length / (a.length || 1))} |`) : []),
  '',
  '## Rules', '',
  ...rules.map(([id, txt, ok]) => `- ${ok ? '✅' : '❌'} ${id}: ${txt}`),
  '',
  '## By year', '',
  '| Year | Trades | Return at 1× | t |', '|---|---|---|---|',
  ...yearRows.map(y => `| ${y.y} | ${y.n} | ${P(y.ret)} | ${y.t.toFixed(2)} |`),
  '',
  T.kind === 'mr'
    ? 'Costs: spread at the decision minute (Nasdaq 1.5, DAX 1.8 points) + 0.5 points slippage a round trip, and 0.025% of price a night held (long swap). Prices are bid; buys pay the spread.'
    : 'Costs: the replay\'s XM gold spread at the minute the spread is paid (buys pay it on entry, sells on exit) + $0.10 slippage. No swap: every trade opens and closes inside one XM day.',
].join('\n');
fs.writeFileSync(args.md || 'verdict.md', md + '\n');
console.log(md);
if (args.out) fs.writeFileSync(args.out, JSON.stringify({ test: TEST, period: PERIOD, summary: S, years: yearRows, trades }, null, 0));
if (args.log) {
  const row = `| ${new Date().toISOString().slice(0, 10)} | ${PERIOD} | ${LABEL} | \`daily-edges ${TEST}\` | ${S.trades} | ${P(S.mean, 3)}/${unit} | ${S.t.toFixed(2)} | ${P(pct)} | ${verdict} |`;
  fs.appendFileSync(args.log, row + '\n');
}
