// ════════════════════════════════════════════════════════════════════════════
//  Backtest Engine
// ════════════════════════════════════════════════════════════════════════════
//
// [REBUILT] The previous version of this file was a labeled "minimal stub" whose run()
// method ignored the candles/startDate/endDate it was given entirely and returned
// Math.random()-generated numbers as if they were real results. Every backtest this bot
// has ever reported was random noise with zero connection to the actual strategy or to
// real market data.
//
// This version runs a genuine bar-by-bar walk-forward simulation using the real indicator
// engine (src/indicators) — the same FVG/OB/MSS/liquidity-sweep/bias/ADX functions the live
// bot uses. Being upfront about what is and isn't faithfully reproduced:
//
//   FAITHFUL:
//     - Real historical OHLC data in, real indicator computations, real bar-by-bar SL/TP
//       resolution, real equity tracking — no random numbers anywhere in this file.
//     - Uses src/config/defaults.js's CONFLUENCE_WEIGHTS as the scoring weights (that config
//       was already written with this exact purpose in mind and wasn't being used live).
//
//   APPROXIMATED (and why):
//     - server.js's /api/backtest endpoint currently supplies 1H GC=F futures candles from
//       Yahoo. Live trading runs XAUUSD spot/CFD across M5/M15/H1/H4. Futures and spot gold
//       diverge (contango/roll effects, different session hours), and this file has no way
//       to fix the instrument/feed mismatch — that would need a historical XAUUSD data
//       source wired into server.js instead. Whatever candles you pass in here, that's what
//       gets simulated.
//     - There is no way to derive M5/M15 detail from 1H bars (you cannot resample down,
//       only up), so this treats whatever candles you provide as the "entry timeframe" and
//       synthesizes a higher timeframe by aggregating every 4 bars into one (analogous to
//       H4 when the input is H1). Confirmation logic that specifically needs true M5 detail
//       (analyseM5Entry, the confirmCandle gate) is not reproduced here — it's simply absent
//       from the backtest, not faithfully simulated.
//     - Session/kill-zone/silver-bullet timing bonuses and the DXY conflict check are not
//       applied — they'd require importing bot-engine.js's own session-timing functions into
//       this module, which risked circular-dependency and scope creep beyond what a single
//       pass should safely take on. Flagging this clearly rather than guessing.
//     - Position sizing here is simplified to "risk a fixed % of current balance per trade,
//       win rrTarget× that amount or lose it" — a standard backtesting convention — rather
//       than modeling exact broker lot/contract mechanics, since no real broker spec is
//       available in a historical-data-only context.
//
// Net effect: this is a real, working simulation you can use to sanity-check whether your
// confluence logic has any edge at all on the data you feed it — genuinely useful — but it
// is not a byte-for-byte reproduction of the live multi-timeframe strategy, and shouldn't be
// read as one. Treat "close but different tool," not "ground truth for the live bot."

const indicators = require('../indicators');
const { CONFLUENCE_WEIGHTS } = require('../config/defaults');

function toMs(t) {
  if (typeof t === 'number') {
    // Yahoo chart timestamps are seconds-since-epoch; anything already in ms stays as-is.
    return t > 2e10 ? t : t * 1000;
  }
  return new Date(t).getTime();
}

function aggregateCandles(candles, factor) {
  const result = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
    let high = -Infinity;
    let low = Infinity;
    for (const c of chunk) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    }
    result.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high,
      low,
      close: chunk[chunk.length - 1].close,
    });
  }
  return result;
}

function scoreBar(window, htfSynth, curP) {
  const atr = indicators.calcATR14(window);
  const swings = indicators.detectSwings(window);
  const adx = indicators.calcADX(window);
  const mss = indicators.detectMSS(window, swings, curP, atr);
  const liq = indicators.detectLiqSweep(window, swings);
  const fvgs = indicators.detectFVG(window, curP, atr);
  const obs = indicators.detectOB(window, curP, atr);
  const bias = indicators.calcHTFBias(htfSynth.length >= 20 ? htfSynth : window);
  const candleChar = indicators.getCandleCharacter(window, atr);

  let dir = 'none';
  if (mss.dir !== 'neutral') {
    dir = mss.dir === 'bullish' ? 'buy' : 'sell';
  } else if (bias !== 'neutral') {
    dir = bias === 'bullish' ? 'buy' : 'sell';
  }
  const wantType = dir === 'buy' ? 'bull' : dir === 'sell' ? 'bear' : null;

  const bestFVG = wantType ? fvgs.filter(f => f.type === wantType)[0] : null;
  const bestOB = wantType ? obs.filter(o => o.type === wantType)[0] : null;

  let score = 0;
  const hits = [];

  if (bestFVG && bestFVG.approaching) {
    score += CONFLUENCE_WEIGHTS.fvg;
    hits.push('fvg');
  }
  if (bestOB && bestOB.inZone) {
    score += CONFLUENCE_WEIGHTS.ob;
    hits.push('ob');
  }
  if (bestFVG && bestOB && Math.abs(bestFVG.ce - bestOB.mid) < Math.max(atr * 0.15, 0.3)) {
    score += CONFLUENCE_WEIGHTS.tripleZone;
    hits.push('tripleZone');
  }
  if (mss.dir !== 'neutral') {
    score += CONFLUENCE_WEIGHTS.mss;
    hits.push('mss');
  }
  if (liq.swept) {
    score += CONFLUENCE_WEIGHTS.liqSweep;
    hits.push('liqSweep');
  }
  if (bias !== 'neutral') {
    score += CONFLUENCE_WEIGHTS.htfBias;
    hits.push('htfBias');
  }
  if (adx.trending) {
    score += CONFLUENCE_WEIGHTS.adxTrending;
  } else {
    score += CONFLUENCE_WEIGHTS.adxRanging;
    hits.push('adxRanging');
  }
  if (candleChar.impulsive) { score += 1; hits.push('impulsiveCandle'); }
  if (candleChar.corrective) { score -= 1; hits.push('correctiveCandle'); }

  score = Math.max(0, Math.min(12, score));

  return { score, dir, atr, bestFVG, bestOB, mss, bias, hits };
}

const MODE_RR = { aggressive: 2, sniper: 5, normal: 3 };

class BacktestEngine {
  constructor(config) {
    config = config || {};
    this.symbol = config.symbol || 'XAUUSD';
    this.initialBalance = config.initialBalance || 10000;
    this.mode = config.mode || 'normal';
    this.riskPerTrade = config.riskPerTrade || 1;
    this.minScore = typeof config.minScore === 'number' ? config.minScore : 7;
  }

  async run(candles, startDate, endDate) {
    if (!Array.isArray(candles) || candles.length === 0) {
      return this._emptyResult('No candle data supplied.');
    }

    let filtered = candles;
    if (startDate) {
      const startMs = toMs(startDate);
      filtered = filtered.filter(c => toMs(c.time) >= startMs);
    }
    if (endDate) {
      const endMs = toMs(endDate);
      filtered = filtered.filter(c => toMs(c.time) <= endMs);
    }

    const minLookback = 100;
    if (filtered.length < minLookback + 10) {
      return this._emptyResult(
        `Not enough candles in range (${filtered.length}) — need at least ${minLookback + 10} for indicators to warm up plus room to trade.`
      );
    }

    const rrTarget = MODE_RR[this.mode] || 3;
    let balance = this.initialBalance;
    const trades = [];
    let peak = balance;
    let maxDD = 0;

    let i = minLookback;
    while (i < filtered.length) {
      const window = filtered.slice(Math.max(0, i - 99), i + 1);
      const curP = window[window.length - 1].close;
      const htfSynth = aggregateCandles(filtered.slice(0, i + 1), 4);

      const analysis = scoreBar(window, htfSynth, curP);

      if (analysis.dir !== 'none' && analysis.score >= this.minScore) {
        const dir = analysis.dir;
        const atr = analysis.atr;
        const slDist = Math.max(atr * 1.5, 0.3);
        const entry = curP;
        const sl = dir === 'buy' ? entry - slDist : entry + slDist;
        const tp = dir === 'buy' ? entry + slDist * rrTarget : entry - slDist * rrTarget;
        const riskAmount = balance * (this.riskPerTrade / 100);

        let outcome = null;
        let exitPrice = null;
        let exitIdx = null;

        for (let j = i + 1; j < filtered.length; j++) {
          const bar = filtered[j];
          if (dir === 'buy') {
            if (bar.low <= sl) { outcome = 'loss'; exitPrice = sl; exitIdx = j; break; }
            if (bar.high >= tp) { outcome = 'win'; exitPrice = tp; exitIdx = j; break; }
          } else {
            if (bar.high >= sl) { outcome = 'loss'; exitPrice = sl; exitIdx = j; break; }
            if (bar.low <= tp) { outcome = 'win'; exitPrice = tp; exitIdx = j; break; }
          }
        }

        if (outcome) {
          const pnl = outcome === 'win' ? riskAmount * rrTarget : -riskAmount;
          balance += pnl;
          trades.push({
            entryTime: window[window.length - 1].time,
            exitTime: filtered[exitIdx].time,
            dir,
            entry: parseFloat(entry.toFixed(2)),
            sl: parseFloat(sl.toFixed(2)),
            tp: parseFloat(tp.toFixed(2)),
            exitPrice: parseFloat(exitPrice.toFixed(2)),
            outcome,
            pnl: parseFloat(pnl.toFixed(2)),
            score: analysis.score,
            hits: analysis.hits,
            balanceAfter: parseFloat(balance.toFixed(2)),
          });
          if (balance > peak) peak = balance;
          const dd = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
          if (dd > maxDD) maxDD = dd;
          i = exitIdx + 1;
          continue;
        } else {
          // Ran out of data before hitting either SL or TP — stop rather than leave a
          // fabricated open-ended trade in the results.
          break;
        }
      }
      i++;
    }

    const wins = trades.filter(t => t.outcome === 'win');
    const losses = trades.filter(t => t.outcome === 'loss');
    const totalPnl = balance - this.initialBalance;
    const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

    return {
      totalTrades: trades.length,
      winRate: trades.length ? parseFloat((wins.length / trades.length).toFixed(4)) : 0,
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      wins: wins.length,
      losses: losses.length,
      profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : (grossWin > 0 ? 999 : 0),
      maxDrawdownPct: parseFloat(maxDD.toFixed(2)),
      expectancy: trades.length ? parseFloat((totalPnl / trades.length).toFixed(2)) : 0,
      finalBalance: parseFloat(balance.toFixed(2)),
      trades,
      candlesUsed: filtered.length,
      dataNote: 'Simulated on whatever candle interval/instrument was supplied upstream, using it as the entry timeframe with a synthesized 4-bar-aggregate higher timeframe. Not a faithful reproduction of the live M5/M15/H1/H4 XAUUSD spot strategy — see comments in src/backtest/index.js for exactly what is and isn\'t reproduced.',
    };
  }

  _emptyResult(reason) {
    return {
      totalTrades: 0,
      winRate: 0,
      totalPnl: 0,
      wins: 0,
      losses: 0,
      profitFactor: 0,
      maxDrawdownPct: 0,
      expectancy: 0,
      finalBalance: this.initialBalance,
      trades: [],
      candlesUsed: 0,
      dataNote: reason,
    };
  }
}

module.exports = { BacktestEngine };
