/**
 * Noise-area intraday momentum (US100 / GER40). Added 31 Oct 2026.
 * Source: Zarattini, Aziz & Barbon (2024), "Beat the Market: An Effective
 * Intraday Momentum Strategy for S&P500 ETF (SPY)", SSRN / SFI 24-97.
 * Rules (fixed before any run, see tools/replay/RULES.md "Noise-area momentum"):
 *   - Noise area at minute m of the cash session = average |close(m)/open - 1|
 *     over the previous 14 sessions.
 *   - Upper = max(open, previous close) x (1 + sigma_m); lower = min(open, previous close) x (1 - sigma_m).
 *   - Only on the :00/:30 marks after the open: close above upper -> long, below lower -> short.
 *   - Stop, checked on the same marks: long exits when close < max(upper, VWAP);
 *     short exits when close > min(lower, VWAP). Re-entry allowed on a later mark.
 *   - Everything closes at the last bar of the session. Nothing held overnight.
 *   - Size: leverage = min(4, 2% / std of the last 14 daily open-to-close returns).
 * VWAP uses bar volume; with no volume (HistData indices) it is a time-weighted average.
 */

const MARKETS = {
  nas: { name: 'US100Cash#', tz: 'America/New_York', open: '09:30', close: '16:00', spread: 1.5, slippage: 0.5 },
  // Micro E-mini Nasdaq futures, same index prices. 0.25 = one tick (the usual US-session spread);
  // 1.25 = about $1.82 round-trip fees ($2 a point) plus one tick of slippage. Added 31 Oct 2026.
  mnq: { name: 'MNQ (micro futures)', tz: 'America/New_York', open: '09:30', close: '16:00', spread: 0.25, slippage: 1.25 },
  ger: { name: 'GER40Cash#', tz: 'Europe/Berlin',    open: '09:00', close: '17:30', spread: 1.8, slippage: 0.5 },
};
const DEFAULTS = { lookbackDays: 14, checkEveryMin: 30, volTargetDaily: 0.02, maxLeverage: 4, costMult: 1 };

const fmtCache = {};
function localParts(ms, tz) {
  const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }));
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, mins: ((+p.hour) % 24) * 60 + (+p.minute) };
}
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/** Group 1-minute (or 5-minute) bars into cash sessions with per-minute arrays. */
function buildSessions(candles, mk) {
  const o = toMin(mk.open), len = toMin(mk.close) - o;
  const map = new Map();
  for (const b of candles) {
    const ms = typeof b.time === 'number' ? b.time : Date.parse(b.time);
    const { day, mins } = localParts(ms, mk.tz);
    const m = mins - o;
    if (m < 0 || m >= len) continue;
    if (!map.has(day)) map.set(day, []);
    map.get(day).push({ m, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 });
  }
  const out = [];
  for (const [day, bars] of map) {
    if (bars.length < 0.6 * len / 5) continue; // drop half days / holes (needs ~60% of 5-min coverage)
    bars.sort((a, b) => a.m - b.m);
    const step = bars.length > 1 ? Math.max(1, bars[1].m - bars[0].m) : 1;
    // close at the end of each minute, forward-filled; VWAP likewise
    const close = new Float64Array(len + 1), vwap = new Float64Array(len + 1);
    let k = 0, last = bars[0].open, pv = 0, vv = 0;
    for (let t = 0; t <= len; t++) {
      while (k < bars.length && bars[k].m + step <= t) {
        const b = bars[k++], v = b.volume > 0 ? b.volume : 1;
        pv += (b.high + b.low + b.close) / 3 * v; vv += v; last = b.close;
      }
      close[t] = last; vwap[t] = vv ? pv / vv : last;
    }
    out.push({ day, open: bars[0].open, close, vwap, len, last: bars[bars.length - 1].close });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : 1));
}

function std(a) {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1));
}

/** Trades for one session. prev = the previous lookbackDays sessions. */
function runSession(s, prev, o, mk) {
  const pc = prev[prev.length - 1].last;
  const upRef = Math.max(s.open, pc), dnRef = Math.min(s.open, pc);
  const vol = std(prev.map(p => p.last / p.open - 1));
  const lev = vol > 0 ? Math.min(o.maxLeverage, o.volTargetDaily / vol) : 0;
  const cost = (mk.spread + mk.slippage) * o.costMult;
  const trades = [];
  let pos = 0, entry = 0, entryM = 0;
  const close = (m, why) => {
    const px = s.close[m], pts = pos * (px - entry);
    trades.push({ day: s.day, side: pos, entryM, exitM: m, entry, exit: px, gross: pts, net: pts - cost,
      ret: lev * (pts - cost) / entry, lev, why });
    pos = 0;
  };
  for (let m = o.checkEveryMin; m < s.len; m += o.checkEveryMin) {
    let sig = 0;
    for (const p of prev) sig += Math.abs(p.close[m] / p.open - 1);
    sig /= prev.length;
    const upper = upRef * (1 + sig), lower = dnRef * (1 - sig), px = s.close[m], vw = s.vwap[m];
    if (pos > 0 && px < Math.max(upper, vw)) close(m, 'stop');
    else if (pos < 0 && px > Math.min(lower, vw)) close(m, 'stop');
    if (!pos && lev > 0) {
      if (px > upper) { pos = 1; entry = px; entryM = m; }
      else if (px < lower) { pos = -1; entry = px; entryM = m; }
    }
  }
  if (pos) close(s.len, 'session close');
  return trades;
}

/** Run over all sessions whose day is in [from, to). Returns trades and per-session daily returns. */
function backtest(sessions, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const mk = MARKETS[o.market || 'nas'];
  const trades = [], days = [];
  for (let i = o.lookbackDays; i < sessions.length; i++) {
    const s = sessions[i];
    if (o.from && s.day < o.from) continue;
    if (o.to && s.day >= o.to) continue;
    const t = runSession(s, sessions.slice(i - o.lookbackDays, i), o, mk);
    trades.push(...t);
    days.push({ day: s.day, ret: t.reduce((a, x) => a + x.ret, 0), trades: t.length });
  }
  return { trades, days };
}

/**
 * For the live bot: bars of the last 15+ sessions incl. today so far, the open position (1, -1, 0).
 * Call it right after each :00/:30 mark of the cash session.
 */
function liveSignal(candles, currentPos = 0, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const mk = MARKETS[o.market || 'nas'];
  const S = buildSessions(candles, mk);
  if (S.length < o.lookbackDays + 1) return { action: 'none', reason: 'not enough history' };
  const s = S[S.length - 1], prev = S.slice(-1 - o.lookbackDays, -1);
  const now = localParts(Date.now(), mk.tz).mins - toMin(mk.open);
  if (now >= s.len - 2) return { action: currentPos ? 'exit' : 'none', reason: 'session end' };
  const m = Math.floor(now / o.checkEveryMin) * o.checkEveryMin;
  if (m < o.checkEveryMin) return { action: 'none', reason: 'before first mark' };
  let sig = 0;
  for (const p of prev) sig += Math.abs(p.close[m] / p.open - 1);
  sig /= prev.length;
  const pc = prev[prev.length - 1].last;
  const upper = Math.max(s.open, pc) * (1 + sig), lower = Math.min(s.open, pc) * (1 - sig);
  const px = s.close[m], vw = s.vwap[m];
  const vol = std(prev.map(p => p.last / p.open - 1));
  const leverage = vol > 0 ? Math.min(o.maxLeverage, o.volTargetDaily / vol) : 0;
  if (currentPos > 0 && px < Math.max(upper, vw)) return { action: 'exit', reason: 'stop', upper, lower, vwap: vw };
  if (currentPos < 0 && px > Math.min(lower, vw)) return { action: 'exit', reason: 'stop', upper, lower, vwap: vw };
  if (!currentPos && px > upper) return { action: 'long', leverage, stop: Math.max(upper, vw), upper, lower };
  if (!currentPos && px < lower) return { action: 'short', leverage, stop: Math.min(lower, vw), upper, lower };
  return { action: 'hold', upper, lower, vwap: vw };
}

module.exports = { MARKETS, DEFAULTS, buildSessions, backtest, liveSignal };
