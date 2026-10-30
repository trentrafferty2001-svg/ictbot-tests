#!/usr/bin/env node
'use strict';
// Combines the per-year replay results and applies the pass rules written in
// tools/replay/RULES.md BEFORE any run. Prints a Markdown report (also
// written to --md), optionally sends a short version to Telegram
// (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) and appends one line per run to the
// variant log (--log), because every variant tried counts against the result.
// Usage: node tools/replay/verdict.js --dir results --period development --label v1 [--md out.md] [--log tools/replay/VARIANTS.md]
// Added 2026-10-24.
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };
const dir = path.resolve(arg('dir', 'results'));
const period = arg('period', 'development');
const label = arg('label', 'v1');
// Trend mode (V1_STRATEGY=trend) has its own rules: see RULES.md.
let minTrades = period === 'screen' ? 500 : period === 'rest' ? 250 : 1000;

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.json$/.test(f)) files.push(p); } })(dir);
const runs = files.map(f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }).filter(r => r && Array.isArray(r.trades)).sort((a, b) => a.from < b.from ? -1 : 1);
if (!runs.length) { console.error('no replay results in ' + dir); process.exit(1); }
const isTrend = runs.some(r => String(((r.settings || {}).env || {}).V1_STRATEGY || '').toLowerCase() === 'trend');
if (isTrend) minTrades = period === 'screen' ? 150 : period === 'rest' ? 100 : 300;
// So does the ICT 2022 model (V1_STRATEGY=ict2022), rules I1-I5.
const isIct = runs.some(r => String(((r.settings || {}).env || {}).V1_STRATEGY || '').toLowerCase() === 'ict2022');
if (isIct) minTrades = period === 'screen' || period === 'rest' ? 150 : 300;
// EA strategies (V1_STRATEGY=ea, src/ea/strategies), rules E1-E5. Added 2026-10-30.
const isEa = runs.some(r => String(((r.settings || {}).env || {}).V1_STRATEGY || '').toLowerCase() === 'ea');
const eaId = isEa ? String(((runs[0].settings || {}).env || {}).V1_EA || '') : '';
if (isEa) minTrades = period === 'screen' || period === 'rest' ? 150 : 300;

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const sd = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };
const tstat = a => a.length > 1 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : NaN;
const f2 = x => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(3) : '—');

const trades = [].concat(...runs.map(r => r.trades.filter(t => typeof t.r === 'number')));
const R = trades.map(t => t.r), n = R.length, m = mean(R), t = tstat(R), s = sd(R);
const ci = [m - 1.96 * s / Math.sqrt(n), m + 1.96 * s / Math.sqrt(n)];
const pos = R.filter(r => r > 0), neg = R.filter(r => r < 0);
const pf = neg.length ? pos.reduce((a, b) => a + b, 0) / Math.abs(neg.reduce((a, b) => a + b, 0)) : Infinity;
const costs = trades.map(t => t.costFrac).filter(x => typeof x === 'number');
const R15 = trades.map(t => t.r - 0.5 * (typeof t.costFrac === 'number' ? t.costFrac : 0) + 0.5 * (typeof t.swapR === 'number' ? t.swapR : 0));
const m15 = mean(R15);

// by year
const years = {};
for (const tr of trades) { const y = String(tr.ts).slice(0, 4); (years[y] = years[y] || []).push(tr.r); }
const yearRows = Object.keys(years).sort().map(y => ({ y, n: years[y].length, m: mean(years[y]), t: tstat(years[y]) }));
const judged = yearRows.filter(r => r.n >= 30), posYears = judged.filter(r => r.m > 0).length;

// score bands (thirds)
const byScore = trades.filter(x => typeof x.score === 'number').sort((a, b) => a.score - b.score);
const third = Math.floor(byScore.length / 3);
const low = byScore.slice(0, third).map(x => x.r), high = byScore.slice(byScore.length - third).map(x => x.r);
const bands = {};
for (const tr of trades) { const b = Math.floor(tr.score || 0); (bands[b] = bands[b] || []).push(tr.r); }

// random entries: replicate k of every year is added up, then compared with
// the bot's own entries under the same exit model
let pct = NaN, randMean = NaN, botModel = NaN, modelN = 0, modelSum = 0, corrs = [];
const K = Math.min(...runs.map(r => (r.random && r.random.k) || 0));
for (const r of runs) { modelN += r.model ? r.model.n : 0; modelSum += r.model ? r.model.sumR : 0; if (r.model && Number.isFinite(r.model.corrWithActual)) corrs.push(r.model.corrWithActual); }
if (K > 0 && modelN > 0) {
  const reps = new Array(K).fill(0);
  for (const r of runs) for (let k = 0; k < K; k++) reps[k] += r.random.sums[k];
  const rm = reps.map(x => x / modelN);
  botModel = modelSum / modelN; randMean = mean(rm);
  pct = rm.filter(x => x < botModel).length / K * 100;
}

// ── the rules (see RULES.md — written before the first run) ───────────────
const rules = [];
const add = (id, text, ok) => rules.push({ id, text, ok });
if (period === 'final' && (isTrend || isIct || isEa)) {
  add('F1', 'at least 80 trades', n >= 80);
  add('F2', 'mean R > 0 with t ≥ ' + (isIct || isEa ? 2 : 1.5), m > 0 && t >= (isIct || isEa ? 2 : 1.5));
  add('F3', 'beats ≥ 95% of random-entry runs', pct >= 95);
} else if (period === 'final') {
  add('F1', 'at least 300 trades', n >= 300);
  add('F2', 'mean R > 0 with t ≥ 2', m > 0 && t >= 2);
  add('F3', 'beats ≥ 95% of random-entry runs', pct >= 95);
} else if (period === 'control') {
  add('C1', 'no "edge" on random data (t < 2)', !(t >= 2));
  add('C2', 'random-entry percentile not extreme (5–95)', !(pct > 95 || pct < 5));
} else if (isEa) {
  // an EA strategy's rules (RULES.md, "EA strategies", written before any run)
  add('E1', 'at least ' + minTrades + ' trades', n >= minTrades);
  add('E2', 'mean R > 0 after costs and swaps with t ≥ 3', m > 0 && t >= 3);
  add('E3', 'beats ≥ 95% of random-entry runs (same exits)', pct >= 95);
  const je = yearRows.filter(r => r.n >= 15);
  add('E4', 'positive in ≥ 60% of years (years with ≥ 15 trades)', je.length > 0 && je.filter(r => r.m > 0).length / je.length >= 0.6);
  add('E5', 'still positive with costs and swaps × 1.5', m15 > 0);
} else if (isTrend) {
  // trend mode's rules (RULES.md, written before its first run)
  add('T1', 'at least ' + minTrades + ' trades', n >= minTrades);
  add('T2', 'mean R > 0 after costs and swaps with t ≥ 2.5', m > 0 && t >= 2.5);
  add('T3', 'beats ≥ 95% of random-entry runs (same exits)', pct >= 95);
  const jt = yearRows.filter(r => r.n >= 15);
  add('T4', 'positive in ≥ 60% of years (years with ≥ 15 trades)', jt.length > 0 && jt.filter(r => r.m > 0).length / jt.length >= 0.6);
  add('T5', 'still positive with costs and swaps × 1.5', m15 > 0);
} else if (isIct) {
  // the ICT 2022 model's rules (RULES.md, written before its first run)
  add('I1', 'at least ' + minTrades + ' trades', n >= minTrades);
  add('I2', 'mean R > 0 after costs with t ≥ 3', m > 0 && t >= 3);
  add('I3', 'beats ≥ 95% of random-entry runs (same exits)', pct >= 95);
  add('I4', 'positive in ≥ 2/3 of years (years with ≥ 30 trades)', judged.length > 0 && posYears / judged.length >= 2 / 3);
  add('I5', 'still positive with costs × 1.5', m15 > 0);
} else {
  // screen = 2020–2024 only (84% of v1's development trades, half the
  // GitHub minutes); rest = 2015–2019, judged only together with its screen.
  add('D1', 'at least ' + minTrades.toLocaleString('en-US') + ' trades', n >= minTrades);
  add('D2', 'mean R > 0 after costs with t ≥ 3', m > 0 && t >= 3);
  add('D3', 'beats ≥ 95% of random-entry runs (same exits)', pct >= 95);
  add('D4', 'positive in ≥ 2/3 of years (years with ≥ 30 trades)', judged.length > 0 && posYears / judged.length >= 2 / 3);
  add('D5', 'still positive with costs × 1.5', m15 > 0);
  add('D6', 'higher scores do better (top third > bottom third)', high.length > 20 && mean(high) > mean(low));
}
const enough = period === 'final' ? n >= (isTrend || isIct || isEa ? 80 : 300) : period === 'control' ? n >= 30 : n >= minTrades;
const replayErrors = [].concat(...runs.map(r => r.errors || [])).length;
// smoke = "does the pipeline run": data downloaded, trades taken, no errors.
const verdict = period === 'smoke' ? (replayErrors || !n ? 'SMOKE TEST: PROBLEM (' + (n ? replayErrors + ' errors' : 'no trades') + ')' : 'SMOKE TEST OK — run "development" next')
  : period === 'rest' ? 'PART OF DEVELOPMENT — judge it together with its screen run'
  : !enough ? 'TOO FEW TRADES' : rules.every(r => r.ok) ? (period === 'screen' ? 'SCREEN PASS — run "rest" next' : 'PASS') : (period === 'screen' ? 'SCREEN FAIL' : 'FAIL');

// ── report ─────────────────────────────────────────────────────────────────
const L = [];
L.push('# Replay verdict — ' + label + ' (' + period + ')' + (eaId ? ' · EA strategy ' + eaId : ''), '');
L.push('**' + verdict + '** · ' + runs[0].from.slice(0, 10) + ' → ' + runs[runs.length - 1].to.slice(0, 10) + (runs[0].synthetic ? ' · synthetic control data' : ' · real XAUUSD M1 prices'), '');
L.push('| | |', '|---|---|');
L.push('| Trades | ' + n + ' (' + (n / Math.max(1, Object.keys(years).length)).toFixed(0) + ' a year) |');
L.push('| Mean R after costs | ' + f2(m) + ' (95% range ' + f2(ci[0]) + ' to ' + f2(ci[1]) + '), t = ' + (Number.isFinite(t) ? t.toFixed(2) : '—') + ' |');
L.push('| Winners | ' + (n ? (pos.length / n * 100).toFixed(1) : '—') + '% · profit factor ' + (Number.isFinite(pf) ? pf.toFixed(2) : '—') + ' |');
L.push('| Cost | median ' + (costs.length ? (costs.slice().sort((a, b) => a - b)[Math.floor(costs.length / 2)] * 100).toFixed(1) : '—') + '% of the stop · mean R with costs × 1.5: ' + f2(m15) + ' |');
if (trades.some(t => typeof t.swapR === 'number' && t.swapR !== 0)) { const sw = trades.map(t => t.swapR || 0); L.push('| Overnight swap | mean ' + f2(mean(sw)) + 'R a trade · ' + (sw.filter(x => x < 0).length / n * 100).toFixed(0) + '% of trades held overnight |'); }
L.push('| Random entries (same exits, ' + K + ' runs) | mean ' + f2(randMean) + ' · bot ' + f2(botModel) + ' · bot beats ' + (Number.isFinite(pct) ? pct.toFixed(1) : '—') + '% |');
L.push('| Exit-model check | correlation with the replayed trades ' + (corrs.length ? mean(corrs).toFixed(2) : '—') + ' (should be > 0.8) |', '');
L.push('## Rules', '');
for (const r of rules) L.push('- ' + (r.ok ? '✅' : '❌') + ' ' + r.id + ': ' + r.text);
L.push('', '## By year', '', '| Year | Trades | Mean R | t |', '|---|---|---|---|');
for (const r of yearRows) L.push('| ' + r.y + ' | ' + r.n + ' | ' + f2(r.m) + ' | ' + (Number.isFinite(r.t) ? r.t.toFixed(2) : '—') + ' |');
L.push('', '## By score', '', '| Score | Trades | Mean R |', '|---|---|---|');
for (const b of Object.keys(bands).sort((a, b2) => a - b2)) L.push('| ' + b + ' | ' + bands[b].length + ' | ' + f2(mean(bands[b])) + ' |');

// The same trades with the lot cap at 0.02 (added 2026-10-24): the one 0.01
// lot that comes off at TP1 is then half the trade instead of a fifth. Each
// trade is split into its TP1 lot and the rest and re-weighted. Exact when
// the replay recorded the TP1 lot's own P&L (legPnl / partialPnl); otherwise
// estimated: a trade whose best point (mfeR) reached TP1 banked TP1 minus the
// cost on that lot, and one that never reached TP1 closed in one piece.
// Trade selection is unchanged: lot size doesn't enter any entry check.
const CAP = 0.02;
function tp1Split(t, exactOk) {
  if (!(t.lots > CAP + 1e-9) || typeof t.r !== 'number') return null;
  const fOld = 0.01 / t.lots;
  if (exactOk && (typeof t.legPnl === 'number' || typeof t.partialPnl === 'number') && t.riskAmount > 0 && typeof t.pnl === 'number') {
    const leg = (t.legPnl || 0) + (t.partialPnl || 0);
    return { a: leg / (t.riskAmount * fOld), m: (t.pnl - leg) / (t.riskAmount * (1 - fOld)), exact: true };
  }
  if (!(t.risk > 0 && t.decision > 0 && t.tp1 > 0) || typeof t.mfeR !== 'number') return null;
  const aR = Math.abs(t.tp1 - t.decision) / t.risk;
  if (t.mfeR < aR - 0.02) return { a: t.r, m: t.r, exact: false };
  const a = aR - (typeof t.costFrac === 'number' ? t.costFrac : 0);
  return { a, m: (t.r - fOld * a) / (1 - fOld), exact: false };
}
const reW = (s, f) => f * s.a + (1 - f) * s.m;
const capRows = trades.map(t => { const s = tp1Split(t, true); return { t, s, r: s ? reW(s, 0.01 / CAP) : t.r }; });
const nExact = capRows.filter(x => x.s && x.s.exact).length, nEst = capRows.filter(x => x.s && !x.s.exact).length;
if (nExact + nEst > 0) {
  const Rc = capRows.map(x => x.r), wc = Rc.filter(r => r > 0), lc = Rc.filter(r => r < 0);
  L.push('', '## Same trades with the lot cap at 0.02', '',
    'Half of each trade closes at TP1 instead of a fifth. Mean ' + f2(mean(Rc)) + 'R (t = ' + (Number.isFinite(tstat(Rc)) ? tstat(Rc).toFixed(2) : '—') + ') vs ' + f2(m) + 'R as replayed · winners ' + (wc.length / Rc.length * 100).toFixed(1) + '% · average win ' + f2(mean(wc)) + 'R · average loss ' + f2(mean(lc)) + 'R · mean with costs × 1.5 ' + f2(mean(capRows.map(x => x.r - 0.5 * (typeof x.t.costFrac === 'number' ? x.t.costFrac : 0)))) + 'R',
    '', 'Re-weighted ' + (nExact + nEst) + ' trades (' + nExact + ' exact, ' + nEst + ' estimated from how far they went); ' + (n - nExact - nEst) + ' were already at 0.02 lots or less.');
  // How good is the estimate? Compare it with the exact figure where both exist.
  const both = trades.map(t => { const e = tp1Split(t, true), s = tp1Split(t, false); return e && e.exact && s ? [reW(e, 0.01 / CAP), reW(s, 0.01 / CAP)] : null; }).filter(Boolean);
  if (both.length >= 30) L.push('Check of the estimate on ' + both.length + ' exact trades: mean ' + f2(mean(both.map(x => x[1]))) + 'R estimated vs ' + f2(mean(both.map(x => x[0]))) + 'R exact.');
}
// Where the results come from (added 2026-10-24). Read these as clues for
// what to test next, not as rules to adopt: every split is another chance to
// find a pattern by luck, so a change only counts once it passes as a variant.
const groupBy = keyFn => { const g = {}; for (const tr of trades) { const k = keyFn(tr); if (k == null) continue; (g[k] = g[k] || []).push(tr); } return g; };
const splitTable = (title, g, order) => {
  L.push('', '## ' + title, '', '| | Trades | Mean R | Winners |', '|---|---|---|---|');
  for (const k of (order || Object.keys(g).sort())) if (g[k]) L.push('| ' + k + ' | ' + g[k].length + ' | ' + f2(mean(g[k].map(x => x.r))) + ' | ' + (g[k].filter(x => x.r > 0).length / g[k].length * 100).toFixed(0) + '% |');
};
splitTable('By session', groupBy(t => t.session || null));
splitTable('By direction', groupBy(t => t.signal || null));
// trade type (getTradeDuration): normal = stop 0.9× ATR, sniper = 1.8× ATR
splitTable('By trade type', groupBy(t => t.dur || null));
const medStop = typ => { const a = trades.filter(t => t.dur === typ && t.risk > 0).map(t => t.risk).sort((x, y) => x - y); return a.length ? '$' + a[Math.floor(a.length / 2)].toFixed(2) : '—'; };
if (trades.some(t => t.dur)) L.push('', 'Median stop: normal ' + medStop('normal') + ' · sniper ' + medStop('sniper') + ' · all $' + (() => { const a = trades.filter(t => t.risk > 0).map(t => t.risk).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)].toFixed(2) : '—'; })());
if (trades.some(t => t.d1)) splitTable('By daily trend at entry', groupBy(t => !t.d1 ? null : t.d1 === 'neutral' ? 'daily trend neutral' : (t.signal === 'buy') === (t.d1 === 'bullish') ? 'with the daily trend' : 'against the daily trend'), ['with the daily trend', 'daily trend neutral', 'against the daily trend']);
const costBand = c => typeof c !== 'number' ? null : c < 0.04 ? 'cost under 4% of the stop' : c < 0.06 ? '4–6%' : c < 0.08 ? '6–8%' : '8% or more';
splitTable('By trading cost', groupBy(t => costBand(t.costFrac)), ['cost under 4% of the stop', '4–6%', '6–8%', '8% or more']);
const stopBand = t => !(t.risk > 0) ? null : t.risk < 3 ? 'stop under $3' : t.risk < 5 ? '$3–5' : t.risk < 8 ? '$5–8' : '$8 or more';
splitTable('By stop distance', groupBy(stopBand), ['stop under $3', '$3–5', '$5–8', '$8 or more']);
const atrBand = t => typeof t.stopAtr !== 'number' ? null : t.stopAtr < 0.8 ? 'stop under 0.8× ATR' : t.stopAtr < 1.2 ? '0.8–1.2× ATR' : t.stopAtr < 1.6 ? '1.2–1.6× ATR' : '1.6× ATR or more';
splitTable('By stop size in 15-minute ATRs', groupBy(atrBand), ['stop under 0.8× ATR', '0.8–1.2× ATR', '1.2–1.6× ATR', '1.6× ATR or more']);
const widened = trades.filter(t => t.widened);
if (widened.length) L.push('', 'Stops widened by V1_MIN_STOP_ATR: ' + widened.length + ' of ' + n + ' trades (' + (widened.length / n * 100).toFixed(0) + '%), mean ' + f2(mean(widened.map(t => t.r))) + 'R; the rest ' + f2(mean(trades.filter(t => !t.widened).map(t => t.r))) + 'R');
if (n) {
  const share = k => (k / n * 100).toFixed(0) + '%';
  const losers = trades.filter(t => t.r < 0), withMfe = losers.filter(t => typeof t.mfeR === 'number');
  L.push('', '## How trades ended', '',
    '- Full stop-outs (−0.85R or worse): ' + share(trades.filter(t => t.r <= -0.85).length),
    '- Scratches (within ±0.15R, mostly breakeven exits): ' + share(trades.filter(t => Math.abs(t.r) < 0.15).length),
    '- Wins of 1R or more: ' + share(trades.filter(t => t.r >= 1).length) + ' · average win ' + f2(mean(pos)) + 'R · average loss ' + f2(mean(neg)) + 'R',
    '- Losers that first went 1R or more in your favour: ' + (withMfe.length ? (withMfe.filter(t => t.mfeR >= 1).length / withMfe.length * 100).toFixed(0) + '% of losers' : '—'));

  // How far trades went, and where the targets were (added 2026-10-24).
  // If many trades travel well past where they're closed, the exits/targets
  // cap the wins; if few travel far, the entries lack follow-through.
  const mf = trades.filter(t => typeof t.mfeR === 'number');
  if (mf.length) {
    const reached = x => (mf.filter(t => t.mfeR >= x).length / mf.length * 100).toFixed(0) + '%';
    const wins = mf.filter(t => t.r > 0), losses = mf.filter(t => t.r < 0);
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
    const inR = (px, t) => Math.abs(px - t.decision) / t.risk;
    const withT = trades.filter(t => t.risk > 0 && t.decision > 0 && t.tp1 > 0 && t.finalTp > 0);
    const tp1R = withT.map(t => inR(t.tp1, t)), finR = withT.map(t => inR(t.finalTp, t));
    const reachedFinal = withT.filter(t => typeof t.mfeR === 'number' && t.mfeR >= inR(t.finalTp, t) - 0.05).length;
    L.push('', '## How far trades went', '',
      '- Share of trades that were at some point this far in profit: +0.5R ' + reached(0.5) + ' · +1R ' + reached(1) + ' · +1.5R ' + reached(1.5) + ' · +2R ' + reached(2) + ' · +3R ' + reached(3),
      '- Winners closed at ' + f2(mean(wins.map(t => t.r))) + 'R on average; at their best they were ' + f2(mean(wins.map(t => t.mfeR))) + 'R up (median ' + f2(med(wins.map(t => t.mfeR))) + 'R)',
      '- Losers that never got more than +0.3R in profit: ' + (losses.length ? (losses.filter(t => t.mfeR < 0.3).length / losses.length * 100).toFixed(0) + '%' : '—'),
      '- Targets (median): TP1 ' + f2(med(tp1R)) + 'R, final target ' + f2(med(finR)) + 'R · final target within 1.5R on ' + (finR.length ? (finR.filter(x => x <= 1.5).length / finR.length * 100).toFixed(0) : '—') + '% of trades · reached on ' + (withT.length ? (reachedFinal / withT.length * 100).toFixed(0) : '—') + '%');
    const finBand = t => { if (!(t.risk > 0 && t.decision > 0 && t.finalTp > 0)) return null; const x = inR(t.finalTp, t); return x < 1.25 ? 'final target under 1.25R' : x < 2 ? '1.25–2R' : x < 3 ? '2–3R' : '3R or more'; };
    splitTable('By final target distance', groupBy(finBand), ['final target under 1.25R', '1.25–2R', '2–3R', '3R or more']);
    const hold = t => { const a = Date.parse(t.ts), b = Date.parse(t.closedTs); if (!(b > a)) return null; const h = (b - a) / 3600000; return isTrend ? (h < 24 ? 'under a day' : h < 72 ? '1–3 days' : h < 168 ? '3–7 days' : '7 days or more') : h < 1 ? 'held under 1h' : h < 3 ? '1–3h' : h < 7.5 ? '3–7.5h' : '7.5h or more (time limit)'; };
    splitTable('By holding time', groupBy(hold), isTrend ? ['under a day', '1–3 days', '3–7 days', '7 days or more'] : ['held under 1h', '1–3h', '3–7.5h', '7.5h or more (time limit)']);
  }
}
const blocks = {}; for (const r of runs) for (const k of Object.keys(r.blocks || {})) blocks[k] = (blocks[k] || 0) + r.blocks[k];
const topBlocks = Object.keys(blocks).sort((a, b) => blocks[b] - blocks[a]).slice(0, 6);
if (topBlocks.length) { L.push('', '## Entries refused (cycles)', ''); for (const k of topBlocks) L.push('- ' + k + ': ' + blocks[k]); }
const errs = [].concat(...runs.map(r => r.errors || []));
if (errs.length) { L.push('', '## Errors during replay (' + errs.length + ')', ''); for (const e of errs.slice(0, 5)) L.push('- `' + String(e).slice(0, 200).replace(/`/g, "'") + '`'); }
L.push('', 'Settings: ' + JSON.stringify(runs[0].settings));
const md = L.join('\n');
process.stdout.write(md + '\n');
if (arg('md', null)) fs.writeFileSync(path.resolve(arg('md')), md + '\n');
// The report as a GitHub annotation too, so it can be read through the API
// (the job summary and uploaded files can't be, outside GitHub's own pages).
if (process.env.GITHUB_ACTIONS) {
  // Two annotations (summary, then breakdown) so neither gets cut short.
  const body = md.replace(/^# .*\n+/, '').replace(/\n## Errors during replay[\s\S]*$/, '').replace(/\n{2,}/g, '\n');
  const cut = body.indexOf('## By session');
  const parts = cut > 0 ? [body.slice(0, cut), body.slice(cut)] : [body];
  parts.forEach((p, i) => process.stdout.write('::notice title=Replay verdict ' + label + ' (' + period + ')' + (i ? ' breakdown' : '') + '::' +
    p.slice(0, 6000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A') + '\n'));
}

// variant log
if (arg('log', null)) {
  const lf = path.resolve(arg('log'));
  if (!fs.existsSync(lf)) fs.writeFileSync(lf, '# Variant log\n\nEvery replay run, in order. The number of rows is the number of tries — the more rows, the stronger a result has to be.\n\n| Date | Period | Label | Settings | Trades | Mean R | t | Beats random | Verdict |\n|---|---|---|---|---|---|---|---|---|\n');
  fs.appendFileSync(lf, '| ' + new Date().toISOString().slice(0, 10) + ' | ' + period + ' | ' + label + ' | `' + JSON.stringify((runs[0].settings || {}).env || {}) + '` | ' + n + ' | ' + f2(m) + ' | ' + (Number.isFinite(t) ? t.toFixed(2) : '—') + ' | ' + (Number.isFinite(pct) ? pct.toFixed(1) + '%' : '—') + ' | ' + verdict + ' |\n');
}

// Telegram (short)
const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
if (tok && chat && typeof fetch === 'function') {
  const text = ['🧪 Replay ' + label + ' (' + period + '): ' + verdict, n + ' trades · mean ' + f2(m) + 'R · t ' + (Number.isFinite(t) ? t.toFixed(2) : '—'),
    'Beats ' + (Number.isFinite(pct) ? pct.toFixed(0) : '—') + '% of random entries (needs 95%)', rules.map(r => (r.ok ? '✅' : '❌') + r.id).join(' ')].join('\n');
  fetch('https://api.telegram.org/bot' + tok + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) })
    .then(r => r.ok ? null : r.text().then(x => console.error('telegram:', x))).catch(e => console.error('telegram:', e.message));
}
