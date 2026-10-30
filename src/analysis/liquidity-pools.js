// ════════════════════════════════════════════════════════════════════════════
//  src/analysis/liquidity-pools.js
//  Advanced liquidity detection - ICT-style
// ════════════════════════════════════════════════════════════════════════════

const indicators = require('../indicators');

function detectLiquidityPools(candles, swings, atr) {
  if (!candles || candles.length < 20) {
    return { buySide: [], sellSide: [], nearestBuy: null, nearestSell: null, allPools: [] };
  }

  const _atr = atr || indicators.calcATR14(candles);
  const pools = { buySide: [], sellSide: [], nearestBuy: null, nearestSell: null, allPools: [] };

  // ─── 1. Swing High/Low Pools ────────────────────────────────────────────
  const recentHighs = swings.highs.slice(-10);
  const recentLows = swings.lows.slice(-10);

  // Group similar levels
  const tolerance = _atr * 0.3;

  // Sell-side liquidity: swing highs
  const sellPools = [];
  for (const h of recentHighs) {
    let found = false;
    for (const pool of sellPools) {
      if (Math.abs(pool.level - h.price) < tolerance) {
        pool.count++;
        pool.lastPrice = h.price;
        found = true;
        break;
      }
    }
    if (!found) {
      sellPools.push({ level: h.price, count: 1, lastPrice: h.price, type: 'sell-side' });
    }
  }

  // Buy-side liquidity: swing lows
  const buyPools = [];
  for (const l of recentLows) {
    let found = false;
    for (const pool of buyPools) {
      if (Math.abs(pool.level - l.price) < tolerance) {
        pool.count++;
        pool.lastPrice = l.price;
        found = true;
        break;
      }
    }
    if (!found) {
      buyPools.push({ level: l.price, count: 1, lastPrice: l.price, type: 'buy-side' });
    }
  }

  // ─── 2. Previous Day High/Low ──────────────────────────────────────────
  if (candles.length >= 48) {
    const dayCandles = candles.slice(-48);
    const dayHigh = Math.max(...dayCandles.map(c => c.high));
    const dayLow = Math.min(...dayCandles.map(c => c.low));
    
    sellPools.push({ level: dayHigh, count: 2, lastPrice: dayHigh, type: 'sell-side', isPDH: true });
    buyPools.push({ level: dayLow, count: 2, lastPrice: dayLow, type: 'buy-side', isPDL: true });
  }

  // ─── 3. Weekly High/Low ────────────────────────────────────────────────
  if (candles.length >= 240) {
    const weekCandles = candles.slice(-240);
    const weekHigh = Math.max(...weekCandles.map(c => c.high));
    const weekLow = Math.min(...weekCandles.map(c => c.low));
    
    sellPools.push({ level: weekHigh, count: 3, lastPrice: weekHigh, type: 'sell-side', isPWH: true });
    buyPools.push({ level: weekLow, count: 3, lastPrice: weekLow, type: 'buy-side', isPWL: true });
  }

  // ─── 4. Round Numbers ──────────────────────────────────────────────────
  const price = candles[candles.length - 1].close;
  const roundLevels = [];
  for (let i = -3; i <= 3; i++) {
    const level = Math.round(price / 10) * 10 + i * 10;
    if (level > 0) roundLevels.push(level);
  }
  for (const level of roundLevels) {
    if (level > price) {
      sellPools.push({ level, count: 1, lastPrice: level, type: 'sell-side', isRound: true });
    } else {
      buyPools.push({ level, count: 1, lastPrice: level, type: 'buy-side', isRound: true });
    }
  }

  // ─── 5. Filter and Sort ────────────────────────────────────────────────
  const currentPrice = candles[candles.length - 1].close;
  
  // Sell-side: above price, sorted by closest
  const uniqueSell = [];
  for (const p of sellPools) {
    if (p.level <= currentPrice) continue;
    let dup = false;
    for (const u of uniqueSell) {
      if (Math.abs(u.level - p.level) < tolerance) {
        u.count += p.count;
        dup = true;
        break;
      }
    }
    if (!dup) uniqueSell.push({ ...p });
  }
  uniqueSell.sort((a, b) => a.level - b.level);

  // Buy-side: below price, sorted by closest (descending)
  const uniqueBuy = [];
  for (const p of buyPools) {
    if (p.level >= currentPrice) continue;
    let dup = false;
    for (const u of uniqueBuy) {
      if (Math.abs(u.level - p.level) < tolerance) {
        u.count += p.count;
        dup = true;
        break;
      }
    }
    if (!dup) uniqueBuy.push({ ...p });
  }
  uniqueBuy.sort((a, b) => b.level - a.level);

  // ─── 6. Determine Nearest ──────────────────────────────────────────────
  const nearestSell = uniqueSell.length > 0 ? uniqueSell[0] : null;
  const nearestBuy = uniqueBuy.length > 0 ? uniqueBuy[0] : null;

  const allPools = [...uniqueBuy, ...uniqueSell];

  return {
    buySide: uniqueBuy,
    sellSide: uniqueSell,
    nearestBuy,
    nearestSell,
    allPools
  };
}

function isLiquiditySweep(candles, pools, atr) {
  if (!pools || !pools.allPools || pools.allPools.length === 0) return { swept: false };
  
  const _atr = atr || indicators.calcATR14(candles);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const threshold = _atr * 0.1;

  for (const pool of pools.allPools) {
    const swept = pool.type === 'sell-side' 
      ? last.high > pool.level && last.close < pool.level - threshold
      : last.low < pool.level && last.close > pool.level + threshold;
    
    if (swept) {
      return {
        swept: true,
        level: pool.level,
        type: pool.type,
        count: pool.count,
        isPDH: pool.isPDH || false,
        isPDL: pool.isPDL || false,
        isPWH: pool.isPWH || false,
        isPWL: pool.isPWL || false,
        isRound: pool.isRound || false
      };
    }
  }
  
  return { swept: false };
}

module.exports = { 
  detectLiquidityPools, 
  isLiquiditySweep 
};
