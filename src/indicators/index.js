// ════════════════════════════════════════════════════════════════════════════
//  Indicator Library - Shared between main thread and worker
//  All pure functions, no side effects
// ════════════════════════════════════════════════════════════════════════════

function calcATR14(candles) {
  if (!candles || candles.length < 15) return 5;
  
  const trs = [];
  for (let i = candles.length - 14; i < candles.length; i++) {
    const cur = candles[i];
    const prv = candles[i - 1];
    trs.push(Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prv.close),
      Math.abs(cur.low - prv.close)
    ));
  }
  
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function calcADX(candles, period = 14) {
  if (!candles || candles.length < period + 1) {
    return { adx: 20, trending: false, strong: false };
  }
  
  const trArr = [];
  const plusDM = [];
  const minusDM = [];
  
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const ph = candles[i - 1].high;
    const pl = candles[i - 1].low;
    const pc = candles[i - 1].close;
    
    trArr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    
    const pdm = h - ph;
    const mdm = pl - l;
    plusDM.push(pdm > mdm && pdm > 0 ? pdm : 0);
    minusDM.push(mdm > pdm && mdm > 0 ? mdm : 0);
  }
  
  function wilderSmooth(arr, n) {
    let s = arr.slice(0, n).reduce((a, b) => a + b, 0);
    const r = [s];
    for (let i = n; i < arr.length; i++) {
      r.push(r[r.length - 1] - r[r.length - 1] / n + arr[i]);
    }
    return r;
  }
  
  const a14 = wilderSmooth(trArr, period);
  const p14 = wilderSmooth(plusDM, period);
  const m14 = wilderSmooth(minusDM, period);
  
  const dx = a14.map((a, j) => {
    const pi = a ? 100 * p14[j] / a : 0;
    const mi = a ? 100 * m14[j] / a : 0;
    return (pi + mi) ? 100 * Math.abs(pi - mi) / (pi + mi) : 0;
  });
  
  // NOTE: dx is already a bounded 0-100 percentage at each step (unlike TR/+DM/-DM,
  // which are raw magnitudes whose scale cancels out in the +DI/-DI ratio). Smoothing
  // it with the sum-based wilderSmooth() above would inflate it by ~`period`x. ADX
  // needs Wilder's classic AVERAGE-based smoothing instead, so it stays on 0-100.
  function wilderAverage(arr, n) {
    if (arr.length < n) return [];
    let avg = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const r = [avg];
    for (let i = n; i < arr.length; i++) {
      avg = (avg * (n - 1) + arr[i]) / n;
      r.push(avg);
    }
    return r;
  }

  const adxArr = wilderAverage(dx, period);
  const last = adxArr[adxArr.length - 1] || 20;
  
  return {
    adx: parseFloat(last.toFixed(1)),
    trending: last >= 20,
    strong: last >= 25,
  };
}

function detectSwings(candles, options = {}) {
  if (!candles || candles.length < 5) {
    return { highs: [], lows: [] };
  }
  
  const windowSize = options.windowSize || 3;
  const atr = options.atr || calcATR14(candles);
  const minMovePct = options.minMovePct || 0.15;
  const maxSwings = options.maxSwings || 8;
  const minMove = atr * minMovePct;
  
  const highs = [];
  const lows = [];
  
  for (let i = windowSize; i < candles.length - windowSize; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    
    for (let j = i - windowSize; j <= i + windowSize; j++) {
      if (j === i) continue;
      if (j < 0 || j >= candles.length) continue;
      
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    
    if (isHigh) {
      const prevLow = Math.min(...candles.slice(i - windowSize, i).map(c => c.low));
      const moveSize = c.high - prevLow;
      if (moveSize >= minMove) {
        highs.push({ price: c.high, idx: i });
      }
    }
    
    if (isLow) {
      const prevHigh = Math.max(...candles.slice(i - windowSize, i).map(c => c.high));
      const moveSize = prevHigh - c.low;
      if (moveSize >= minMove) {
        lows.push({ price: c.low, idx: i });
      }
    }
  }
  
  return {
    highs: highs.slice(-maxSwings),
    lows: lows.slice(-maxSwings),
  };
}

function detectFVG(candles, curP, atr) {
  if (!candles || candles.length < 3) return [];
  
  const _atr = atr || calcATR14(candles);
  const result = [];
  
  for (let i = 2; i < candles.length; i++) {
    const prev = candles[i - 2];
    const next = candles[i];
    
    if (prev.high < next.low) {
      const size = next.low - prev.high;
      const ce = (prev.high + next.low) / 2;
      const age = candles.length - i;
      
      const freshness = age <= 5 ? 3 : age <= 20 ? 2 : age <= 50 ? 1 : 0;
      const sizeScore = size >= _atr * 0.8 ? 2 : size >= _atr * 0.3 ? 1 : 0;
      const approaching = curP > prev.high && curP < next.low + _atr;
      const noWickGap = candles[i - 1].low >= prev.high && candles[i - 1].high <= next.low;
      const quality = freshness + sizeScore + (noWickGap ? 1 : 0);
      
      if (curP > ce) {
        result.push({
          type: 'bull',
          top: next.low,
          bot: prev.high,
          ce,
          size,
          age,
          quality,
          approaching,
          noWickGap,
          isFresh: age <= 5,
          isRetested: age > 20,
          visits: 0,
        });
      }
    }
    
    if (prev.low > next.high) {
      const size = prev.low - next.high;
      const ce = (prev.low + next.high) / 2;
      const age = candles.length - i;
      
      const freshness = age <= 5 ? 3 : age <= 20 ? 2 : age <= 50 ? 1 : 0;
      const sizeScore = size >= _atr * 0.8 ? 2 : size >= _atr * 0.3 ? 1 : 0;
      const approaching = curP < prev.low && curP > next.high - _atr;
      const noWickGap = candles[i - 1].high <= prev.low && candles[i - 1].low >= next.high;
      const quality = freshness + sizeScore + (noWickGap ? 1 : 0);
      
      if (curP < ce) {
        result.push({
          type: 'bear',
          top: prev.low,
          bot: next.high,
          ce,
          size,
          age,
          quality,
          approaching,
          noWickGap,
          isFresh: age <= 5,
          isRetested: age > 20,
          visits: 0,
        });
      }
    }
  }
  
  return result.sort((a, b) => b.quality - a.quality).slice(0, 8);
}

function detectOB(candles, curP, atr) {
  if (!candles || candles.length < 4) return [];
  
  const _atr = atr || calcATR14(candles);
  const result = [];
  const zoneTolerance = Math.max(_atr * 0.15, 0.02);
  
  for (let i = 1; i < candles.length - 2; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    
    const range = (next.high - next.low) || 0.01;
    const dispBody = Math.abs(next.close - next.open);
    
    if (dispBody / range < 0.3) continue;
    
    const age = candles.length - 1 - i;
    const freshness = age <= 3 ? 3 : age <= 10 ? 2 : age <= 30 ? 1 : 0;
    const sizeScore = dispBody >= _atr * 1.5 ? 3 : dispBody >= _atr * 0.5 ? 2 : dispBody >= _atr * 0.2 ? 1 : 0;
    
    const inZone = curP >= curr.low - zoneTolerance && curP <= curr.high + zoneTolerance;
    const quality = freshness + sizeScore + (inZone ? 2 : 0);
    
    if (prev.close < prev.open && next.close > next.open && next.close > curr.high && curP >= curr.low - _atr * 0.5) {
      result.push({
        type: 'bull',
        high: curr.high,
        low: curr.low,
        mid: (curr.high + curr.low) / 2,
        age,
        quality,
        inZone,
        isFresh: age <= 3,
        isRetested: age > 10,
        visits: 0,
      });
    }
    
    if (prev.close > prev.open && next.close < next.open && next.close < curr.low && curP <= curr.high + _atr * 0.5) {
      result.push({
        type: 'bear',
        high: curr.high,
        low: curr.low,
        mid: (curr.high + curr.low) / 2,
        age,
        quality,
        inZone,
        isFresh: age <= 3,
        isRetested: age > 10,
        visits: 0,
      });
    }
  }
  
  return result.sort((a, b) => b.quality - a.quality).slice(0, 5);
}

function detectMSS(candles, swings, curP, atr) {
  if (!swings || !swings.highs.length || !swings.lows.length) {
    return { dir: 'neutral', type: 'none' };
  }
  
  const _atr = atr || calcATR14(candles);
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles.length > 1 ? candles[candles.length - 2] : null;
  
  const lH = swings.highs[swings.highs.length - 1].price;
  const lL = swings.lows[swings.lows.length - 1].price;
  const pH = swings.highs.length > 1 ? swings.highs[swings.highs.length - 2].price : lH;
  const pL = swings.lows.length > 1 ? swings.lows[swings.lows.length - 2].price : lL;
  
  const lc = lastCandle.close;
  const pc = prevCandle ? prevCandle.close : curP;
  
  const minBreak = Math.max(_atr * 0.1, 0.0002);
  
  const priorHighsBearish = swings.highs.length > 2 && 
    swings.highs[swings.highs.length - 2].price < swings.highs[swings.highs.length - 3].price;
  const priorLowsBullish = swings.lows.length > 2 &&
    swings.lows[swings.lows.length - 2].price > swings.lows[swings.lows.length - 3].price;
  
  if (lc > lH + minBreak && pc <= lH) {
    return {
      dir: 'bullish',
      type: (lH > pH && !priorHighsBearish) ? 'BOS' : 'CHoCH',
      level: lH,
    };
  }
  
  if (lc < lL - minBreak && pc >= lL) {
    return {
      dir: 'bearish',
      type: (lL < pL && !priorLowsBullish) ? 'BOS' : 'CHoCH',
      level: lL,
    };
  }
  
  if (lc > lH + minBreak && pc > lH) {
    return { dir: 'bullish', type: 'BOS_confirmed', level: lH };
  }
  if (lc < lL - minBreak && pc < lL) {
    return { dir: 'bearish', type: 'BOS_confirmed', level: lL };
  }
  
  return { dir: 'neutral', type: 'none' };
}

function detectLiqSweep(candles, swings) {
  if (!swings || !swings.highs.length || !swings.lows.length) {
    return { swept: false };
  }
  
  const start = Math.max(0, candles.length - 5);
  for (let k = start; k < candles.length; k++) {
    const cd = candles[k];
    
    for (const sh of swings.highs) {
      if (cd.high > sh.price && cd.close < sh.price) {
        return { swept: true, side: 'sell-side', level: sh.price, candleIndex: k };
      }
    }
    
    for (const sl of swings.lows) {
      if (cd.low < sl.price && cd.close > sl.price) {
        return { swept: true, side: 'buy-side', level: sl.price, candleIndex: k };
      }
    }
  }
  
  return { swept: false };
}

function getCandleCharacter(candles, atr) {
  if (!candles || candles.length < 10) {
    return { impulsive: false, corrective: false, score: 0, label: 'neutral' };
  }
  
  const last = candles[candles.length - 1];
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  const bodyRatio = range > 0 ? body / range : 0;
  const isBullish = last.close > last.open;
  
  const prev = candles[candles.length - 2];
  const movesBeyondPrev = isBullish
    ? last.high > prev.high && last.close > prev.high
    : last.low < prev.low && last.close < prev.low;
  
  const impulsive = bodyRatio > 0.6 && movesBeyondPrev;
  const corrective = bodyRatio < 0.3 || (body < atr * 0.2);
  
  let score = 0;
  if (impulsive) score = 1;
  if (corrective) score = -1;
  
  let impCount = 0;
  let corrCount = 0;
  for (let i = Math.max(0, candles.length - 3); i < candles.length; i++) {
    const c = candles[i];
    const b = Math.abs(c.close - c.open);
    const r = c.high - c.low;
    const br = r > 0 ? b / r : 0;
    if (br > 0.6) impCount++;
    if (br < 0.3) corrCount++;
  }
  
  if (impCount >= 2) score += 1;
  if (corrCount >= 2) score -= 1;
  
  return {
    impulsive,
    corrective,
    score: Math.max(-2, Math.min(2, score)),
    bodyRatio: parseFloat(bodyRatio.toFixed(2)),
    label: impulsive ? 'impulsive' : corrective ? 'corrective' : 'neutral',
  };
}

function calcHTFBias(candles) {
  if (!candles || candles.length < 20) return 'neutral';
  
  const slice = candles.slice(-20);
  let ema8 = slice[0].close;
  let ema21 = slice[0].close;
  
  for (let i = 1; i < slice.length; i++) {
    ema8 = slice[i].close * 2 / 9 + ema8 * 7 / 9;
    ema21 = slice[i].close * 2 / 22 + ema21 * 20 / 22;
  }
  
  const emaBias = ema8 > ema21 * 1.0005 ? 'bullish' 
    : ema8 < ema21 * 0.9995 ? 'bearish' 
    : 'neutral';
  
  const swings = detectSwings(candles);
  let structBias = 'neutral';
  
  if (swings.highs.length >= 2 && swings.lows.length >= 2) {
    const lH = swings.highs[swings.highs.length - 1].price;
    const pH = swings.highs[swings.highs.length - 2].price;
    const lL = swings.lows[swings.lows.length - 1].price;
    const pL = swings.lows[swings.lows.length - 2].price;
    
    if (lH > pH && lL > pL) structBias = 'bullish';
    if (lH < pH && lL < pL) structBias = 'bearish';
  }
  
  if (emaBias === 'bullish' && structBias === 'bullish') return 'bullish';
  if (emaBias === 'bearish' && structBias === 'bearish') return 'bearish';
  if (emaBias !== 'neutral') return emaBias;
  if (structBias !== 'neutral') return structBias;
  
  return 'neutral';
}

// [NEW] Hidden divergence detection
function detectDivergence(candles, options = {}) {
  if (!candles || candles.length < 30) { 
    return { 
      bullish: false, 
      bearish: false, 
      hiddenBullish: false, 
      hiddenBearish: false,
      type: 'none',
      hiddenType: null,
      rsiLast: 50
    }; 
  }
  
  const closes = candles.map(function(c) { return c.close; });
  const period = options.period || 14;
  const minSeparation = options.minSeparation || 5;
  
  // Calculate RSI
  const rsiValues = new Array(closes.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i < period + 1; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) { gains += diff; } else { losses -= diff; }
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsiValues[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let j = period + 1; j < closes.length; j++) {
    const diff2 = closes[j] - closes[j - 1];
    if (diff2 >= 0) {
      avgGain = (avgGain * (period - 1) + diff2) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff2) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues[j] = 100 - (100 / (1 + rs));
  }

  function findSwingPoints(isHigh) {
    const pts = [];
    for (let k = 3; k < candles.length - 3; k++) {
      if (rsiValues[k] === null) { continue; }
      const v = isHigh ? candles[k].high : candles[k].low;
      let isExtreme = true;
      for (let w = k - 3; w <= k + 3; w++) {
        if (w === k) { continue; }
        if (isHigh ? (candles[w].high > v) : (candles[w].low < v)) { isExtreme = false; break; }
      }
      if (!isExtreme) { continue; }
      if (!pts.length || k - pts[pts.length - 1].idx >= minSeparation) {
        pts.push({ idx: k, price: v, rsi: rsiValues[k] });
      } else if (isHigh ? v > pts[pts.length - 1].price : v < pts[pts.length - 1].price) {
        pts[pts.length - 1] = { idx: k, price: v, rsi: rsiValues[k] };
      }
    }
    return pts;
  }

  const swingLows = findSwingPoints(false);
  const swingHighs = findSwingPoints(true);
  
  let bullish = false, bearish = false;
  let hiddenBullish = false, hiddenBearish = false;
  
  // Regular divergence
  if (swingLows.length >= 2) {
    const l1 = swingLows[swingLows.length - 2], l2 = swingLows[swingLows.length - 1];
    if (l2.price < l1.price && l2.rsi > l1.rsi) { bullish = true; }
  }
  if (swingHighs.length >= 2) {
    const h1p = swingHighs[swingHighs.length - 2], h2p = swingHighs[swingHighs.length - 1];
    if (h2p.price > h1p.price && h2p.rsi < h1p.rsi) { bearish = true; }
  }
  
  // [NEW] Hidden divergence (continuation signals)
  if (swingLows.length >= 2) {
    const l1 = swingLows[swingLows.length - 2], l2 = swingLows[swingLows.length - 1];
    if (l2.price > l1.price && l2.rsi < l1.rsi) { hiddenBullish = true; }
  }
  if (swingHighs.length >= 2) {
    const h1p = swingHighs[swingHighs.length - 2], h2p = swingHighs[swingHighs.length - 1];
    if (h2p.price < h1p.price && h2p.rsi > h1p.rsi) { hiddenBearish = true; }
  }

  let type = 'none';
  let hiddenType = null;
  if (bullish) { type = 'bullish'; }
  else if (bearish) { type = 'bearish'; }
  else if (hiddenBullish) { type = 'hidden_bullish'; hiddenType = 'bullish'; }
  else if (hiddenBearish) { type = 'hidden_bearish'; hiddenType = 'bearish'; }

  return {
    bullish: bullish,
    bearish: bearish,
    hiddenBullish: hiddenBullish,
    hiddenBearish: hiddenBearish,
    type: type,
    hiddenType: hiddenType,
    rsiLast: rsiValues[rsiValues.length - 1] || 50
  };
}

module.exports = {
  calcATR14,
  calcADX,
  detectSwings,
  detectFVG,
  detectOB,
  detectMSS,
  detectLiqSweep,
  getCandleCharacter,
  calcHTFBias,
  detectDivergence,
};
