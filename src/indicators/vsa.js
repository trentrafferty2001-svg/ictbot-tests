// ════════════════════════════════════════════════════════════════════════════
//  Volume Spread Analysis (VSA) - Confirms ICT signals with volume
//  Pure functions, no side effects
// ════════════════════════════════════════════════════════════════════════════

/**
 * Analyze volume spread to identify VSA signals
 * @param {Array} candles - Array of candle objects {time, open, high, low, close, volume}
 * @param {Object} options - Configuration options
 * @returns {Object} VSA analysis results
 */
function analyzeVSA(candles, options = {}) {
  if (!candles || candles.length < 10) {
    return {
      signals: [],
      lastSignal: null,
      volumeProfile: null,
      absorption: false,
      exhaustion: false
    };
  }

  const atr = options.atr || calcATR14(candles);
  const volumeMA = calculateVolumeMA(candles, options.volumeMAPeriod || 20);
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const signals = [];

  // ── 1. No Demand / No Supply ──────────────────────────────────────────────
  const noDemandSignal = detectNoDemand(candles, volumeMA);
  if (noDemandSignal) {
    signals.push(noDemandSignal);
  }

  const noSupplySignal = detectNoSupply(candles, volumeMA);
  if (noSupplySignal) {
    signals.push(noSupplySignal);
  }

  // ── 2. Stopping Volume ────────────────────────────────────────────────────
  const stoppingVolumeSignal = detectStoppingVolume(candles, volumeMA);
  if (stoppingVolumeSignal) {
    signals.push(stoppingVolumeSignal);
  }

  // ── 3. Upthrust / Test ────────────────────────────────────────────────────
  const upthrustSignal = detectUpthrust(candles, atr);
  if (upthrustSignal) {
    signals.push(upthrustSignal);
  }

  const testSignal = detectTest(candles, atr);
  if (testSignal) {
    signals.push(testSignal);
  }

  // ── 4. Volume Climax ──────────────────────────────────────────────────────
  const climaxSignal = detectVolumeClimax(candles, volumeMA);
  if (climaxSignal) {
    signals.push(climaxSignal);
  }

  // ── 5. Absorption / Exhaustion ────────────────────────────────────────────
  const absorption = detectAbsorption(candles, atr);
  const exhaustion = detectExhaustion(candles, volumeMA);

  // ── 6. Volume Profile ─────────────────────────────────────────────────────
  const volumeProfile = calculateVolumeProfile(candles);

  // ── Determine the most recent significant signal ──────────────────────────
  let lastSignal = null;
  if (signals.length > 0) {
    signals.sort((a, b) => b.candleIndex - a.candleIndex);
    lastSignal = signals[0];
  }

  return {
    signals,
    lastSignal,
    volumeProfile,
    absorption,
    exhaustion,
    hasSignal: signals.length > 0,
    // Convenience flags for ICT confirmation
    confirmsBullish: signals.some(s => s.bullish),
    confirmsBearish: signals.some(s => s.bearish),
    neutral: signals.length === 0,
    // Filtered signals for entry confirmation
    entryBullish: signals.filter(s => s.bullish && s.confidence >= 70),
    entryBearish: signals.filter(s => s.bearish && s.confidence >= 70),
  };
}

// ── Helper Functions ─────────────────────────────────────────────────────────

function calcATR14(candles) {
  if (!candles || candles.length < 15) return 1;
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

function calculateVolumeMA(candles, period) {
  if (candles.length < period) {
    const sum = candles.reduce((s, c) => s + (c.volume || 0), 0);
    return sum / candles.length;
  }
  const slice = candles.slice(-period);
  const sum = slice.reduce((s, c) => s + (c.volume || 0), 0);
  return sum / period;
}

function calculateVolumeProfile(candles) {
  if (!candles || candles.length < 10) return null;
  
  const totalVolume = candles.reduce((s, c) => s + (c.volume || 0), 0);
  const avgVolume = totalVolume / candles.length;
  
  // Find high volume candles (2x average)
  const highVolumeCandles = candles.filter(c => (c.volume || 0) > avgVolume * 2);
  
  // Find the point of control (POC) - price level with highest volume
  const priceLevels = {};
  const tickSize = 0.01;
  
  for (const c of candles) {
    const vol = c.volume || 0;
    const steps = Math.ceil((c.high - c.low) / tickSize);
    for (let i = 0; i <= steps; i++) {
      const price = c.low + (c.high - c.low) * i / steps;
      const key = Math.round(price / tickSize) * tickSize;
      if (!priceLevels[key]) priceLevels[key] = 0;
      priceLevels[key] += vol / (steps + 1);
    }
  }
  
  let maxVol = 0;
  let poc = 0;
  for (const [price, vol] of Object.entries(priceLevels)) {
    if (vol > maxVol) {
      maxVol = vol;
      poc = parseFloat(price);
    }
  }
  
  return {
    totalVolume,
    avgVolume,
    highVolumeCandles: highVolumeCandles.length,
    poc,
    volumeRatio: totalVolume / (candles.length * avgVolume)
  };
}

// ── 1. No Demand ────────────────────────────────────────────────────────────
function detectNoDemand(candles, volumeMA) {
  if (candles.length < 3) return null;
  
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const vol = last.volume || 0;
  
  // No Demand: Narrow spread up bar with below-average volume
  const spread = last.high - last.low;
  const avgSpread = candles.slice(-10).reduce((s, c) => s + (c.high - c.low), 0) / 10;
  const isNarrowSpread = spread < avgSpread * 0.5;
  const isUp = last.close > last.open;
  const isLowVolume = vol < volumeMA * 0.5;
  
  if (isNarrowSpread && isUp && isLowVolume) {
    return {
      type: 'No Demand',
      bullish: true,
      bearish: false,
      confidence: 70,
      description: 'Narrow spread up bar on low volume - weak buyers, possible top',
      candleIndex: candles.length - 1,
      volume: vol,
      volumeRatio: vol / volumeMA
    };
  }
  return null;
}

// ── 2. No Supply ────────────────────────────────────────────────────────────
function detectNoSupply(candles, volumeMA) {
  if (candles.length < 3) return null;
  
  const last = candles[candles.length - 1];
  const vol = last.volume || 0;
  const spread = last.high - last.low;
  const avgSpread = candles.slice(-10).reduce((s, c) => s + (c.high - c.low), 0) / 10;
  const isNarrowSpread = spread < avgSpread * 0.5;
  const isDown = last.close < last.open;
  const isLowVolume = vol < volumeMA * 0.5;
  
  if (isNarrowSpread && isDown && isLowVolume) {
    return {
      type: 'No Supply',
      bullish: false,
      bearish: true,
      confidence: 70,
      description: 'Narrow spread down bar on low volume - weak sellers, possible bottom',
      candleIndex: candles.length - 1,
      volume: vol,
      volumeRatio: vol / volumeMA
    };
  }
  return null;
}

// ── 3. Stopping Volume ──────────────────────────────────────────────────────
function detectStoppingVolume(candles, volumeMA) {
  if (candles.length < 5) return null;
  
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const vol = last.volume || 0;
  const prevVol = prev.volume || 0;
  
  // Stopping Volume: Wide spread with high volume that fails to make new low
  const spread = last.high - last.low;
  const avgSpread = candles.slice(-10).reduce((s, c) => s + (c.high - c.low), 0) / 10;
  const isWideSpread = spread > avgSpread * 1.5;
  const isDown = last.close < last.open;
  const isHighVolume = vol > volumeMA * 1.5;
  
  // Price failed to make a new low relative to previous 5 candles
  const recentLows = candles.slice(-6, -1).map(c => c.low);
  const minRecentLow = Math.min(...recentLows);
  const noNewLow = last.low >= minRecentLow * 0.998;
  
  if (isWideSpread && isDown && isHighVolume && noNewLow) {
    return {
      type: 'Stopping Volume',
      bullish: true,
      bearish: false,
      confidence: 80,
      description: 'Wide spread down bar on high volume that fails to make new low - selling climax, reversal likely',
      candleIndex: candles.length - 1,
      volume: vol,
      volumeRatio: vol / volumeMA
    };
  }
  
  // Bullish stopping volume (at bottom)
  const noNewHigh = last.high <= Math.max(...recentLows) * 1.002;
  const isUp = last.close > last.open;
  if (isWideSpread && isUp && isHighVolume && noNewHigh) {
    return {
      type: 'Stopping Volume',
      bullish: false,
      bearish: true,
      confidence: 80,
      description: 'Wide spread up bar on high volume that fails to make new high - buying climax, reversal likely',
      candleIndex: candles.length - 1,
      volume: vol,
      volumeRatio: vol / volumeMA
    };
  }
  
  return null;
}

// ── 4. Upthrust ─────────────────────────────────────────────────────────────
function detectUpthrust(candles, atr) {
  if (candles.length < 3) return null;
  
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const vol = last.volume || 0;
  const prevVol = prev.volume || 0;
  
  const spread = last.high - last.low;
  const avgSpread = candles.slice(-10).reduce((s, c) => s + (c.high - c.low), 0) / 10;
  const isWideSpread = spread > avgSpread * 1.2;
  const isDown = last.close < last.open;
  const isHighVolume = vol > (candles.slice(-10).reduce((s, c) => s + (c.volume || 0), 0) / 10) * 1.2;
  
  // Upthrust: Price moves above previous high but closes near the low
  const prevHigh = candles.slice(-5, -1).reduce((max, c) => Math.max(max, c.high), 0);
  const abovePrevHigh = last.high > prevHigh;
  const closesNearLow = (last.close - last.low) / spread < 0.3;
  
  if (isWideSpread && isDown && isHighVolume && abovePrevHigh && closesNearLow) {
    return {
      type: 'Upthrust',
      bullish: false,
      bearish: true,
      confidence: 75,
      description: 'Price moved above resistance on high volume but closed near low - false break, bearish',
      candleIndex: candles.length - 1,
      volume: vol,
      volumeRatio: vol / (candles.slice(-10).reduce((s, c) => s + (c.volume || 0), 0) / 10)
    };
  }
  
  return null;
}

// ── 5. Test ──────────────────────────────────────────────────────────────────
function detectTest(candles, atr) {
  if (candles.length < 3) return null;
  
  const last = candles[candles.length - 1];
  const vol = last.volume || 0;
  const avgVolume = candles.slice(-10).reduce((s, c) => s + (c.volume || 0), 0) / 10;
  
  const spread = last.high - last.low;
  const avgSpread = candles.slice(-10).reduce((s, c) => s + (c.high - c.low), 0) / 10;
  const isNarrowSpread = spread < avgSpread * 0.7;
  const isLowVolume = vol < avgVolume * 0.6;
  
  // Test: Price tests a previous level (high or low) on low volume
  const prevHigh = candles.slice(-5, -1).reduce((max, c) => Math.max(max, c.high), 0);
  const prevLow = candles.slice(-5, -1).reduce((min, c) => Math.min(min, c.low), 0);
  
  const testsHigh = last.high > prevHigh * 0.998 && last.close < last.high;
  const testsLow = last.low < prevLow * 1.002 && last.close > last.low;
  
  if (isNarrowSpread && isLowVolume && testsHigh) {
    return {
      type: 'Test (of Resistance)',
      bullish: false,
      bearish: true,
      confidence: 65,
      description: 'Narrow spread test of resistance on low volume - resistance likely holds',
      candleIndex: candles.length - 1,
      volume: vol,
      volumeRatio: vol / avgVolume
    };
  }
  
  if (isNarrowSpread && isLowVolume && testsLow) {
    return {
      type: 'Test (of Support)',
      bullish: true,
      bearish: false,
      confidence: 65,
      description: 'Narrow spread test of support on low volume - support likely holds',
      candleIndex: candles.length - 1,
      volume: vol,
      volumeRatio: vol / avgVolume
    };
  }
  
  return null;
}

// ── 6. Volume Climax ────────────────────────────────────────────────────────
function detectVolumeClimax(candles, volumeMA) {
  if (candles.length < 5) return null;
  
  const last = candles[candles.length - 1];
  const vol = last.volume || 0;
  const maxVolume = Math.max(...candles.slice(-20).map(c => c.volume || 0));
  
  // Volume climax: Volume is at least 3x average
  if (vol > volumeMA * 3) {
    const isUp = last.close > last.open;
    const spread = last.high - last.low;
    const avgSpread = candles.slice(-10).reduce((s, c) => s + (c.high - c.low), 0) / 10;
    const isWideSpread = spread > avgSpread * 1.5;
    
    if (isUp && isWideSpread) {
      return {
        type: 'Buying Climax',
        bullish: false,
        bearish: true,
        confidence: 70,
        description: 'Massive volume up bar - buying exhaustion likely',
        candleIndex: candles.length - 1,
        volume: vol,
        volumeRatio: vol / volumeMA
      };
    }
    
    if (!isUp && isWideSpread) {
      return {
        type: 'Selling Climax',
        bullish: true,
        bearish: false,
        confidence: 70,
        description: 'Massive volume down bar - selling exhaustion likely',
        candleIndex: candles.length - 1,
        volume: vol,
        volumeRatio: vol / volumeMA
      };
    }
  }
  
  return null;
}

// ── 7. Absorption ───────────────────────────────────────────────────────────
function detectAbsorption(candles, atr) {
  if (candles.length < 5) return false;
  
  // Check for 3+ consecutive candles with small bodies and large wicks
  let absorptionCount = 0;
  for (let i = candles.length - 4; i < candles.length; i++) {
    if (i < 0) continue;
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const bodyRatio = range > 0 ? body / range : 0;
    
    // High wick candle (small body, large range)
    if (bodyRatio < 0.3 && range > atr * 0.5) {
      absorptionCount++;
    }
  }
  
  // Also check for sideways movement with high volume
  const recentClose = candles[candles.length - 1].close;
  const close5Ago = candles[candles.length - 6]?.close || recentClose;
  const priceChange = Math.abs(recentClose - close5Ago);
  const avgVolume = candles.slice(-10).reduce((s, c) => s + (c.volume || 0), 0) / 10;
  const recentVol = candles.slice(-5).reduce((s, c) => s + (c.volume || 0), 0) / 5;
  
  // Absorption: sideways price action with above-average volume
  if (priceChange / (atr || 1) < 0.3 && recentVol > avgVolume * 1.3) {
    return true;
  }
  
  return absorptionCount >= 2;
}

// ── 8. Exhaustion ───────────────────────────────────────────────────────────
function detectExhaustion(candles, volumeMA) {
  if (candles.length < 3) return false;
  
  const last = candles[candles.length - 1];
  const vol = last.volume || 0;
  const avgVolume = candles.slice(-10).reduce((s, c) => s + (c.volume || 0), 0) / 10;
  const spread = last.high - last.low;
  const avgSpread = candles.slice(-10).reduce((s, c) => s + (c.high - c.low), 0) / 10;
  
  // Exhaustion: Wide spread with high volume but small close
  const isWideSpread = spread > avgSpread * 1.5;
  const isHighVolume = vol > avgVolume * 1.5;
  const smallClose = Math.abs(last.close - last.open) / spread < 0.4;
  
  if (isWideSpread && isHighVolume && smallClose) {
    return true;
  }
  
  return false;
}

// ── Export for use in main bot ──────────────────────────────────────────────
module.exports = {
  analyzeVSA,
  detectNoDemand,
  detectNoSupply,
  detectStoppingVolume,
  detectUpthrust,
  detectTest,
  detectVolumeClimax,
  detectAbsorption,
  detectExhaustion,
  calculateVolumeMA,
  calculateVolumeProfile,
};
