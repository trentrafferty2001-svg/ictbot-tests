// ════════════════════════════════════════════════════════════════════════════
//  Breaker Block Detection - ICT Breaker Blocks
//  When an OB is swept, it becomes a breaker in the opposite direction
// ════════════════════════════════════════════════════════════════════════════

/**
 * Detect Breaker Blocks from order block data
 * @param {Array} candles - Array of candle objects
 * @param {Array} obs - Detected order blocks from indicators.detectOB()
 * @param {Array} swings - Detected swings from indicators.detectSwings()
 * @param {number} curP - Current price
 * @param {number} atr - Current ATR
 * @param {Object} zoneMemory - Previously visited zones (for sweep detection)
 * @returns {Object} Breaker block analysis
 */
function detectBreakerBlocks(candles, obs, swings, curP, atr, zoneMemory = null) {
  if (!candles || candles.length < 10 || !obs || obs.length === 0) {
    return { breakers: [], hasBreaker: false };
  }

  const breakers = [];
  const sweptZones = [];

  // ── 1. Identify swept OBs ──────────────────────────────────────────────────
  for (const ob of obs) {
    const isSwept = checkOBSwept(candles, ob, curP, atr);
    if (isSwept) {
      sweptZones.push({
        ...ob,
        sweepDirection: ob.type === 'bull' ? 'sell-side' : 'buy-side',
        sweptAt: candles.length - 1,
      });
    }
  }

  // ── 2. Convert swept OBs to Breaker Blocks ───────────────────────────────
  for (const swept of sweptZones) {
    const breaker = createBreakerBlock(swept, candles, curP, atr);
    if (breaker) {
      breakers.push(breaker);
    }
  }

  // ── 3. Check if any breaker is currently in play ──────────────────────────
  const activeBreakers = breakers.filter(b => b.isActive);
  const hasBreaker = activeBreakers.length > 0;

  // ── 4. Find nearest breaker to current price ──────────────────────────────
  let nearestBreaker = null;
  let nearestDistance = Infinity;

  for (const b of activeBreakers) {
    const dist = Math.abs(b.level - curP);
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestBreaker = b;
    }
  }

  // ── 5. Determine if price is approaching a breaker ────────────────────────
  const approachingBreakers = breakers.filter(b => {
    if (!b.isActive) return false;
    if (b.direction === 'bullish' && curP < b.level && (b.level - curP) < atr * 3) return true;
    if (b.direction === 'bearish' && curP > b.level && (curP - b.level) < atr * 3) return true;
    return false;
  });

  return {
    breakers,
    activeBreakers,
    hasBreaker,
    nearestBreaker,
    approachingBreakers: approachingBreakers.length,
    sweptZones: sweptZones.length,
    // Convenience flags for ICT confirmation
    bullishBreaker: activeBreakers.some(b => b.direction === 'bullish'),
    bearishBreaker: activeBreakers.some(b => b.direction === 'bearish'),
  };
}

/**
 * Check if an order block has been swept (price broke through it)
 */
function checkOBSwept(candles, ob, curP, atr) {
  const tolerance = Math.max(atr * 0.05, 0.01);
  
  // Check recent candles for sweep
  const recentCandles = candles.slice(-5);
  
  for (const c of recentCandles) {
    if (ob.type === 'bull') {
      // Bullish OB: price swept the low (break below)
      if (c.low < ob.low - tolerance && c.close > ob.low) {
        return true;
      }
    } else {
      // Bearish OB: price swept the high (break above)
      if (c.high > ob.high + tolerance && c.close < ob.high) {
        return true;
      }
    }
  }
  
  // Also check if current price is beyond the OB (already swept)
  if (ob.type === 'bull' && curP < ob.low - tolerance) {
    return true;
  }
  if (ob.type === 'bear' && curP > ob.high + tolerance) {
    return true;
  }
  
  return false;
}

/**
 * Create a breaker block from a swept order block
 */
function createBreakerBlock(sweptOB, candles, curP, atr) {
  if (!sweptOB) return null;

  // A swept bullish OB becomes a bearish breaker (and vice versa)
  const direction = sweptOB.type === 'bull' ? 'bearish' : 'bullish';
  
  // The breaker level is the opposite side of the OB
  const level = sweptOB.type === 'bull' 
    ? sweptOB.high  // Bullish OB swept -> resistance becomes breaker
    : sweptOB.low;  // Bearish OB swept -> support becomes breaker

  // Check if the breaker is still valid (recently swept)
  const age = candles.length - 1 - sweptOB.sweptAt;
  const isFresh = age <= 10;
  const isValid = age <= 30; // Breakers fade after ~30 candles

  // Check if breaker has already been hit (retested)
  const hasBeenHit = checkBreakerHit(candles, level, direction, atr);

  // Determine if breaker is active (not yet hit, still valid)
  const isActive = isValid && !hasBeenHit;

  // Calculate confidence based on OB quality and sweep characteristics
  let confidence = sweptOB.quality || 0;
  if (isFresh) confidence += 2;
  if (sweptOB.isFresh) confidence += 1;
  confidence = Math.min(10, Math.max(0, confidence));

  // Determine if price is approaching the breaker
  const distance = Math.abs(level - curP);
  const approaching = distance < atr * 2;

  return {
    type: 'Breaker Block',
    direction,
    level,
    originalOB: {
      type: sweptOB.type,
      high: sweptOB.high,
      low: sweptOB.low,
      mid: sweptOB.mid,
      quality: sweptOB.quality,
    },
    sweepDirection: sweptOB.sweepDirection,
    sweptAt: sweptOB.sweptAt,
    age,
    isFresh,
    isValid,
    hasBeenHit,
    isActive,
    confidence,
    approaching,
    distance,
    distanceRatio: distance / (atr || 1),
  };
}

/**
 * Check if a breaker level has already been hit (retested)
 */
function checkBreakerHit(candles, level, direction, atr) {
  const tolerance = Math.max(atr * 0.05, 0.01);
  const recentCandles = candles.slice(-10);
  
  for (const c of recentCandles) {
    if (direction === 'bullish') {
      // Bullish breaker: price hit the level from below
      if (c.low <= level + tolerance && c.high >= level - tolerance) {
        return true;
      }
    } else {
      // Bearish breaker: price hit the level from above
      if (c.high >= level - tolerance && c.low <= level + tolerance) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Detect inverse FVGs (often form at breaker levels)
 */
function detectInverseFVG(candles, breakers, atr) {
  if (!breakers || breakers.length === 0) {
    return { inverseFVGs: [], hasInverseFVG: false };
  }

  const inverseFVGs = [];
  
  for (const b of breakers) {
    if (!b.isActive) continue;
    
    // Check for inverse FVG around the breaker level
    const nearbyCandles = candles.filter(c => 
      Math.abs(c.close - b.level) < atr * 0.5
    );
    
    if (nearbyCandles.length >= 2) {
      // Look for a gap in the opposite direction
      const gaps = findGaps(candles, b.level, b.direction, atr);
      if (gaps.length > 0) {
        inverseFVGs.push({
          breaker: b,
          gaps,
          type: 'Inverse FVG',
          direction: b.direction === 'bullish' ? 'bearish' : 'bullish',
          level: b.level,
        });
      }
    }
  }

  return {
    inverseFVGs,
    hasInverseFVG: inverseFVGs.length > 0,
  };
}

/**
 * Find gaps around a price level
 */
function findGaps(candles, level, direction, atr) {
  const gaps = [];
  const tolerance = Math.max(atr * 0.05, 0.01);
  
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    
    if (direction === 'bullish') {
      // Bullish breaker -> look for bearish gaps (down)
      if (prev.low > curr.high + tolerance) {
        if (Math.abs(prev.low - level) < atr || Math.abs(curr.high - level) < atr) {
          gaps.push({
            top: prev.low,
            bottom: curr.high,
            size: prev.low - curr.high,
            index: i,
          });
        }
      }
    } else {
      // Bearish breaker -> look for bullish gaps (up)
      if (prev.high < curr.low - tolerance) {
        if (Math.abs(prev.high - level) < atr || Math.abs(curr.low - level) < atr) {
          gaps.push({
            top: curr.low,
            bottom: prev.high,
            size: curr.low - prev.high,
            index: i,
          });
        }
      }
    }
  }
  
  return gaps;
}

module.exports = {
  detectBreakerBlocks,
  checkOBSwept,
  createBreakerBlock,
  checkBreakerHit,
  detectInverseFVG,
};
