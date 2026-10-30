// ════════════════════════════════════════════════════════════════════════════
//  Advanced Risk Management - Dynamic trailing, partial closes, guards
//  Extends the basic position management with advanced features
// ════════════════════════════════════════════════════════════════════════════

/**
 * Calculate dynamic trailing stop based on swing structure
 * @param {Array} candles - Recent candles for swing detection
 * @param {string} direction - 'buy' or 'sell'
 * @param {number} entryPrice - Entry price of the position
 * @param {number} currentPrice - Current market price
 * @param {number} atr - Current ATR
 * @param {Object} options - Configuration options
 * @returns {Object} Trailing stop recommendation
 */
function calculateDynamicTrail(candles, direction, entryPrice, currentPrice, atr, options = {}) {
  if (!candles || candles.length < 10) {
    return { stopPrice: null, reason: 'Insufficient data' };
  }

  const swingWindow = options.swingWindow || 5;
  const minTrailDistance = Math.max(atr * 0.2, options.minTrailDistance || 0.01);

  // Find recent swing highs/lows
  const swings = findRecentSwings(candles, swingWindow);
  
  let stopPrice = null;
  let reason = '';
  let confidence = 0;

  if (direction === 'buy') {
    // For long positions: trail below recent swing lows
    const recentLows = swings.lows.slice(-3);
    
    if (recentLows.length > 0) {
      // Use the highest recent swing low that's below current price
      const validLows = recentLows.filter(l => l < currentPrice);
      if (validLows.length > 0) {
        const bestLow = validLows.reduce((max, l) => l > max ? l : max, validLows[0]);
        stopPrice = bestLow;
        reason = 'Below recent swing low';
        confidence = 70;
      } else {
        // Fallback: ATR-based trail
        stopPrice = currentPrice - atr * 1.5;
        reason = 'ATR fallback (no valid swing low)';
        confidence = 50;
      }
    } else {
      stopPrice = currentPrice - atr * 1.5;
      reason = 'ATR fallback (no swings)';
      confidence = 50;
    }

    // Ensure trail is not too tight
    const distance = currentPrice - stopPrice;
    if (distance < minTrailDistance) {
      stopPrice = currentPrice - minTrailDistance;
      reason = `Min distance (${minTrailDistance.toFixed(2)})`;
    }

  } else {
    // For short positions: trail above recent swing highs
    const recentHighs = swings.highs.slice(-3);
    
    if (recentHighs.length > 0) {
      const validHighs = recentHighs.filter(h => h > currentPrice);
      if (validHighs.length > 0) {
        const bestHigh = validHighs.reduce((min, h) => h < min ? h : min, validHighs[0]);
        stopPrice = bestHigh;
        reason = 'Above recent swing high';
        confidence = 70;
      } else {
        stopPrice = currentPrice + atr * 1.5;
        reason = 'ATR fallback (no valid swing high)';
        confidence = 50;
      }
    } else {
      stopPrice = currentPrice + atr * 1.5;
      reason = 'ATR fallback (no swings)';
      confidence = 50;
    }

    const distance = stopPrice - currentPrice;
    if (distance < minTrailDistance) {
      stopPrice = currentPrice + minTrailDistance;
      reason = `Min distance (${minTrailDistance.toFixed(2)})`;
    }
  }

  return {
    stopPrice: parseFloat(stopPrice.toFixed(2)),
    reason,
    confidence,
    distance: Math.abs(stopPrice - currentPrice),
    distanceATR: Math.abs(stopPrice - currentPrice) / atr,
  };
}

/**
 * Find recent swing highs and lows
 */
function findRecentSwings(candles, windowSize) {
  const highs = [];
  const lows = [];
  
  for (let i = windowSize; i < candles.length - windowSize; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    
    for (let j = i - windowSize; j <= i + windowSize; j++) {
      if (j === i || j < 0 || j >= candles.length) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    
    if (isHigh) highs.push(c.high);
    if (isLow) lows.push(c.low);
  }
  
  return { highs, lows };
}

/**
 * Calculate optimal partial close levels based on R-multiples
 * @param {number} entryPrice - Entry price
 * @param {number} slDistance - Stop loss distance from entry
 * @param {string} direction - 'buy' or 'sell'
 * @param {Object} options - Configuration options
 * @returns {Object} Partial close levels with volumes
 */
function calculatePartialCloseLevels(entryPrice, slDistance, direction, options = {}) {
  const levels = options.levels || [1.0, 2.0, 3.0]; // R-multiples
  const volumes = options.volumes || [0.3, 0.3, 0.4]; // % of position to close
  
  const result = [];
  
  for (let i = 0; i < levels.length; i++) {
    const r = levels[i];
    const pct = volumes[i] || 0.3;
    
    let price;
    if (direction === 'buy') {
      price = entryPrice + (slDistance * r);
    } else {
      price = entryPrice - (slDistance * r);
    }
    
    result.push({
      rMultiple: r,
      price: parseFloat(price.toFixed(2)),
      closePercent: pct,
      description: `${r}R target`,
    });
  }
  
  return result;
}

/**
 * Enhanced position management with advanced features
 * @param {Object} position - Position object from MetaAPI
 * @param {number} currentPrice - Current market price
 * @param {number} atr - Current ATR
 * @param {Object} options - Configuration options
 * @returns {Object} Position management recommendations
 */
function getPositionRecommendations(position, currentPrice, atr, options = {}) {
  if (!position || !position.openPrice) {
    return { recommendations: [], shouldClose: false };
  }

  const entry = parseFloat(position.openPrice);
  const sl = parseFloat(position.stopLoss);
  const tp = parseFloat(position.takeProfit);
  const direction = position.type && position.type.indexOf('BUY') !== -1 ? 'buy' : 'sell';
  const slDistance = Math.abs(entry - sl);
  const profit = direction === 'buy' ? (currentPrice - entry) : (entry - currentPrice);
  const profitPct = profit / slDistance;
  const recommendations = [];

  // ── 1. Check if position is in profit ──────────────────────────────────────
  const inProfit = profitPct > 0;

  // ── 2. Partial close recommendations ──────────────────────────────────────
  if (inProfit) {
    const partialLevels = calculatePartialCloseLevels(entry, slDistance, direction, options);
    
    for (const level of partialLevels) {
      const hit = direction === 'buy' 
        ? currentPrice >= level.price 
        : currentPrice <= level.price;
      
      if (hit) {
        recommendations.push({
          action: 'partial_close',
          reason: `Hit ${level.description}`,
          closePercent: level.closePercent,
          price: level.price,
          urgency: 'medium',
        });
      }
    }
  }

  // ── 3. Dynamic trailing stop ──────────────────────────────────────────────
  if (profitPct > 0.5 && options.candles) {
    const trail = calculateDynamicTrail(
      options.candles,
      direction,
      entry,
      currentPrice,
      atr,
      options.trailOptions
    );
    
    if (trail.stopPrice) {
      const currentSL = direction === 'buy' 
        ? parseFloat(position.stopLoss)
        : parseFloat(position.stopLoss);
      
      const shouldMoveSL = direction === 'buy'
        ? trail.stopPrice > currentSL
        : trail.stopPrice < currentSL;
      
      if (shouldMoveSL) {
        recommendations.push({
          action: 'move_stop',
          reason: `Dynamic trail: ${trail.reason}`,
          stopPrice: trail.stopPrice,
          confidence: trail.confidence,
          urgency: 'low',
        });
      }
    }
  }

  // ── 4. Time-based exit ─────────────────────────────────────────────────────
  const timeInTrade = position.time 
    ? (Date.now() - new Date(position.time).getTime()) / (1000 * 60 * 60)
    : 0;
  
  const maxHoldTime = options.maxHoldHours || 48;
  if (timeInTrade > maxHoldTime && profitPct > 0) {
    recommendations.push({
      action: 'close',
      reason: `Max hold time (${maxHoldTime}h) exceeded`,
      urgency: 'high',
    });
  }

  // ── 5. Friday close guard ──────────────────────────────────────────────────
  const isFriday = new Date().getUTCDay() === 5;
  const hour = new Date().getUTCHours();
  if (isFriday && hour >= 20 && profitPct > 0) {
    recommendations.push({
      action: 'close',
      reason: 'Friday close - avoid weekend gap',
      urgency: 'high',
    });
  }

  // ── 6. News guard ──────────────────────────────────────────────────────────
  if (options.newsEvent && options.newsEvent.highImpact && profitPct > 0) {
    recommendations.push({
      action: 'close',
      reason: `High impact news: ${options.newsEvent.title}`,
      urgency: 'high',
    });
  }

  // ── 7. Profit protection (trailing stop activation) ───────────────────────
  if (profitPct > 2 && !position._trailActivated) {
    const trailStop = direction === 'buy'
      ? currentPrice - atr * 0.5
      : currentPrice + atr * 0.5;
    
    recommendations.push({
      action: 'activate_trail',
      reason: `Profit ${(profitPct * 100).toFixed(0)}% reached`,
      stopPrice: trailStop,
      urgency: 'medium',
    });
  }

  // ── 8. Stop loss to breakeven ─────────────────────────────────────────────
  if (profitPct > 0.5 && !position._beTriggered) {
    const beBuffer = Math.max(atr * 0.05, options.minBeBuffer || 0.01);
    const bePrice = direction === 'buy' 
      ? entry + beBuffer 
      : entry - beBuffer;
    
    recommendations.push({
      action: 'move_to_be',
      reason: `${(profitPct * 100).toFixed(0)}% profit reached`,
      stopPrice: bePrice,
      urgency: 'medium',
    });
  }

  // Sort by urgency
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  // Determine if position should be closed
  const shouldClose = recommendations.some(r => r.action === 'close');

  return {
    recommendations,
    shouldClose,
    profitPct,
    timeInTrade,
    inProfit,
  };
}

/**
 * Calculate daily drawdown limit and alert
 * @param {number} balance - Current account balance
 * @param {number} dailyPnL - Today's P&L
 * @param {number} limit - Daily loss limit percentage
 * @param {Array} positions - Open positions
 * @returns {Object} Drawdown status
 */
function checkDailyDrawdown(balance, dailyPnL, limit, positions) {
  const limitAmount = balance * (limit / 100);
  const unrealizedPnL = positions.reduce((sum, p) => sum + (parseFloat(p.profit) || 0), 0);
  const totalPnL = dailyPnL + unrealizedPnL;
  const remaining = limitAmount - totalPnL;
  
  return {
    dailyPnL,
    unrealizedPnL,
    totalPnL,
    limit: limitAmount,
    remaining,
    percentUsed: (totalPnL / limitAmount) * 100,
    isBreached: totalPnL <= -limitAmount,
    warning: totalPnL <= -limitAmount * 0.7, // 70% used
  };
}

/**
 * Calculate Kelly position size with volatility adjustment
 * @param {number} winRate - Historical win rate
 * @param {number} avgWin - Average winning trade
 * @param {number} avgLoss - Average losing trade
 * @param {number} volatility - Current volatility (ATR ratio)
 * @param {Object} options - Configuration options
 * @returns {number} Suggested risk percentage
 */
function calculateKellyRisk(winRate, avgWin, avgLoss, volatility, options = {}) {
  if (winRate <= 0 || avgWin <= 0 || avgLoss <= 0) {
    return options.defaultRisk || 0.5;
  }

  // Kelly formula: f* = (p * b - q) / b
  const p = winRate;
  const q = 1 - p;
  const b = avgWin / avgLoss;
  const kelly = (p * b - q) / b;
  
  // Half Kelly (more conservative)
  let risk = Math.max(0.01, kelly * 0.5);
  
  // Adjust for volatility
  if (volatility > 1.5) risk *= 0.7; // Reduce in high volatility
  if (volatility < 0.5) risk *= 1.3; // Increase in low volatility
  
  // Apply min/max
  risk = Math.max(options.minRisk || 0.1, Math.min(options.maxRisk || 3.0, risk));
  
  return risk * 100; // Return as percentage
}

module.exports = {
  calculateDynamicTrail,
  findRecentSwings,
  calculatePartialCloseLevels,
  getPositionRecommendations,
  checkDailyDrawdown,
  calculateKellyRisk,
};
