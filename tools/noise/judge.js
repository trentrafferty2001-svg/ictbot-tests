#!/usr/bin/env node
/**
 * Runs the noise-area momentum strategy on saved 1-minute prices and judges it
 * against the rules in tools/replay/RULES.md ("Noise-area momentum"). Added 31 Oct 2026.
 *
 * node tools/noise/judge.js --market nas --period development --data tools/replay/data \
 *      --label noise-nas --md verdict.md [--log tools/replay/VARIANTS.md] [--out results.json]
 * node tools/noise/judge.js --market nas --period control --seed 1 --md verdict.md
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MARKETS, buildSessions, backtest } = require('./noise-momentum');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const market = args.market || 'nas';
const period = args.period || 'development';
const label = args.label || `noise-${market}`;
const mk = MARKETS[market];
const INST = { nas: 'nsxusd', ger: 'grxeur' }[market];
const PERIODS = {
  development: ['2015-01-01', '2025-01-01'],
  final: ['2025-01-01', '2026-11-01'],
  smoke: ['2024-03-01', '2024-04-01'],
  control: ['2015-01-01', '2025-01-01'],
};
const [from, to] = PERIODS[period];

// ---------- prices ----------
function loadCsvGz(file) {
  const txt = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
  const out = [];
  const lines = txt.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < 5) continue;
    out.push({ time: +c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +(c[5] || 0) });
  }
  return out;
}
function synthetic(seed) {
  let s = (+seed || 1) * 2654435761 % 4294967296;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const out = [];
  let p = market === 'nas' ? 5000 : 10000;
  for (let t = Date.UTC(2014, 9, 15); t < Date.UTC(2025, 0, 3); t += 60000) {
    const d = new Date(t).getUTCDay();
    if (d === 0 || d === 6) continue;
    const o = p;
    p *= 1 + 0.0004 * gauss(); // ~1.3% a day on a 24h clock: index-like
    out.push({ time: t, open: o, high: Math.max(o, p), low: Math.min(o, p), close: p, volume: 0 });
  }
  return out;
}
let candles;
if (period === 'control') candles = synthetic(args.seed);
else {
  const dir = args.data || 'tools/replay/data';
  const files = fs.readdirSync(dir).filter(f => f.startsWith(INST + '-') && f.endsWith('.csv.gz')).sort();
  if (!files.length) { console.error(`no ${INST}-*.csv.gz in ${dir}`); process.exit(1); }
  const seen = new Set();
  candles = [];
  for (const f of files) for (const c of loadCsvGz(path.join(dir, f))) if (!seen.has(c.time)) { seen.add(c.time); candles.push(c); }
  candles.sort((a, b) => a.time - b.time);
}
const sessions = buildSessions(candles, mk);

// ---------- stats ----------
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const tstat = a => (a.length > 1 && sd(a) > 0 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : 0);
function summarise(res) {
  const r = res.days.map(d => d.ret);
  let eq = 1, peak = 1, mdd = 0;
  for (const x of r) { eq *= 1 + x; peak = Math.max(peak, eq); mdd = Math.max(mdd, 1 - eq / peak); }
  const byMonth = new Map(), byYear = new Map();
  for (const d of res.days) {
    byMonth.set(d.day.slice(0, 7), (byMonth.get(d.day.slice(0, 7)) || 0) + d.ret);
    const y = d.day.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, { r: [], trades: 0 });
    byYear.get(y).r.push(d.ret); byYear.get(y).trades += d.trades;
  }
  const months = [...byMonth.values()];
  return {
    sessions: r.length, trades: res.trades.length,
    tradeDays: res.days.filter(d => d.trades).length,
    win: res.trades.filter(t => t.net > 0).length / (res.trades.length || 1),
    netPts: mean(res.trades.map(t => t.net)), grossPts: mean(res.trades.map(t => t.gross)),
    meanDay: mean(r), t: tstat(r), sharpe: sd(r) ? mean(r) / sd(r) * Math.sqrt(252) : 0,
    total: eq - 1, years: r.length / 252, cagr: Math.pow(eq, 252 / Math.max(1, r.length)) - 1, mdd,
    posMonths: months.filter(x => x > 0).length / (months.length || 1), nMonths: months.length,
    byYear: [...byYear].map(([y, v]) => ({ y, trades: v.trades, ret: v.r.reduce((a, b) => (1 + a) * (1 + b) - 1, 0), t: tstat(v.r) })),
  };
}

// Control is judged before costs: on random prices only the signal's own bias should show.
const CM = period === 'control' ? 0 : 1;
const base = backtest(sessions, { market, from, to, costMult: CM });
const S = summarise(base);
const S15 = summarise(backtest(sessions, { market, from, to, costMult: 1.5 }));

// Random direction, same entry and exit times, same costs and size: what's left is the direction's skill.
const cost = (mk.spread + mk.slippage) * CM;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const ruleMean = mean(base.trades.map(t => t.ret));
const RUNS = 1000;
let beaten = 0;
const randMeans = [];
for (let k = 0; k < RUNS; k++) {
  let s = 0;
  for (const t of base.trades) {
    const dir = rnd() < 0.5 ? 1 : -1;
    s += t.lev * (dir * (t.exit - t.entry) - cost) / t.entry;
  }
  const m = s / (base.trades.length || 1);
  randMeans.push(m);
  if (ruleMean > m) beaten++;
}
const pct = beaten / RUNS;

// ---------- rules ----------
const yearsPos = S.byYear.filter(y => y.trades >= 30);
const fracYearsPos = yearsPos.filter(y => y.ret > 0).length / (yearsPos.length || 1);
let rules, verdict;
if (period === 'development') {
  rules = [
    ['N1', 'at least 300 trades', S.trades >= 300],
    ['N2', 'mean daily return > 0 after costs, t ≥ 3', S.meanDay > 0 && S.t >= 3],
    ['N3', 'beats ≥ 95% of random-direction runs (same entry and exit times)', pct >= 0.95],
    ['N4', 'positive in ≥ 2/3 of years with 30+ trades', fracYearsPos >= 2 / 3],
    ['N5', 'still positive with costs × 1.5', S15.meanDay > 0],
    ['N6', 'positive in ≥ 55% of months', S.posMonths >= 0.55],
  ];
  verdict = S.trades < 300 ? 'TOO FEW TRADES' : rules.every(r => r[2]) ? 'PASS' : 'FAIL';
} else if (period === 'final') {
  rules = [
    ['F1', 'at least 100 trades', S.trades >= 100],
    ['F2', 'mean daily return > 0, t ≥ 1.5', S.meanDay > 0 && S.t >= 1.5],
    ['F3', 'beats ≥ 95% of random-direction runs', pct >= 0.95],
  ];
  verdict = rules.every(r => r[2]) ? 'PASS' : 'FAIL';
} else if (period === 'control') {
  rules = [
    ['C1', '|t| < 2 on random prices, before costs', Math.abs(S.t) < 2],
    ['C2', 'random-direction percentile between 5% and 95%', pct > 0.05 && pct < 0.95],
  ];
  verdict = rules.every(r => r[2]) ? 'PASS' : 'FAIL';
} else { rules = []; verdict = 'SMOKE (not judged)'; }

// ---------- report ----------
const P = x => (100 * x).toFixed(1) + '%';
const md = [
  `# Noise-area momentum — ${label} (${period}) · ${mk.name}`,
  '',
  `**${verdict}** · ${from} → ${to} · ${period === 'control' ? 'random-walk prices' : `real ${INST.toUpperCase()} 1-minute prices`}`,
  '',
  '| | |', '|---|---|',
  `| Sessions | ${S.sessions} (traded on ${S.tradeDays}, ${P(S.tradeDays / (S.sessions || 1))}) |`,
  `| Trades | ${S.trades} · winners ${P(S.win)} |`,
  `| Points per trade | gross ${S.grossPts.toFixed(2)} · net ${S.netPts.toFixed(2)} (cost ${(mk.spread + mk.slippage) * CM} a round trip) |`,
  `| Mean daily return | ${(100 * S.meanDay).toFixed(3)}%, t = ${S.t.toFixed(2)} |`,
  `| Sharpe (annual) | ${S.sharpe.toFixed(2)} |`,
  `| Total / a year | ${P(S.total)} / ${P(S.cagr)} at up to 4× leverage, 2% daily vol target |`,
  `| Max drawdown | ${P(S.mdd)} |`,
  `| Positive months | ${P(S.posMonths)} of ${S.nMonths} |`,
  `| Costs × 1.5 | mean daily ${(100 * S15.meanDay).toFixed(3)}%, t = ${S15.t.toFixed(2)} |`,
  `| Random direction (${RUNS} runs) | median ${(100 * randMeans.sort((a, b) => a - b)[RUNS / 2]).toFixed(3)}% a trade · rule ${(100 * ruleMean).toFixed(3)}% · rule beats ${P(pct)} |`,
  '',
  '## Rules', '',
  ...rules.map(([id, txt, ok]) => `- ${ok ? '✅' : '❌'} ${id}: ${txt}`),
  '',
  '## By year', '',
  '| Year | Trades | Return | t |', '|---|---|---|---|',
  ...S.byYear.map(y => `| ${y.y} | ${y.trades} | ${P(y.ret)} | ${y.t.toFixed(2)} |`),
  '',
  'Not modelled: overnight swap (none: flat every night), news, slippage beyond the fixed allowance, ',
  'XM minimum lot size. HistData index files have no volume, so VWAP is a time-weighted average.',
].join('\n');
fs.writeFileSync(args.md || 'verdict.md', md + '\n');
console.log(md);
if (args.out) fs.writeFileSync(args.out, JSON.stringify({ summary: S, costs15: S15, randomPct: pct, trades: base.trades }, null, 0));
if (args.log && period !== 'smoke') {
  const row = `| ${new Date().toISOString().slice(0, 10)} | ${period} | ${label} | \`noise-area ${market}\` | ${S.trades} | ${(100 * S.meanDay).toFixed(3)}%/day | ${S.t.toFixed(2)} | ${P(pct)} | ${verdict} |`;
  fs.appendFileSync(args.log, row + '\n');
}
