// ════════════════════════════════════════════════════════════════════════════
//  src/risk/dynamic-stops.js
//  ICT-Style Dynamic Stop Loss Placement
//  Stops placed behind swept liquidity levels
// ════════════════════════════════════════════════════════════════════════════

function getDynamicStop(entry, direction, liquidityPools, atr, minSL) {
  const _atr = atr || 1;
  const _minSL = minSL || 0.1;

  if (!liquidityPools || !liquidityPools.allPools || liquidityPools.allPools.length === 0) {
    // Fallback: 1.2x ATR stop (tighter)
    const stopPrice = direction === 'buy' 
      ? entry - _atr * 1.2
      : entry + _atr * 1.2;
    return {
      stopPrice: parseFloat(stopPrice.toFixed(2)),
      reason: 'ATR fallback (no liquidity pool)',
      stopDistance: _atr * 1.2,
      stopDistanceATR: 1.2,
      liquidityLevel: null
    };
  }

  let stopPrice = null;
  let reason = '';
  let liquidityLevel = null;

  // For buy trades: place stop below the nearest buy-side liquidity pool
  if (direction === 'buy') {
    const buyPools = liquidityPools.buySide || [];
    let nearest = null;
    for (const pool of buyPools) {
      if (pool.level < entry) {
        if (!nearest || pool.level > nearest.level) {
          nearest = pool;
        }
      }
    }

    if (nearest) {
      const buffer = Math.max(_atr * 0.08, 0.03);
      stopPrice = nearest.level - buffer;
      liquidityLevel = nearest.level;
      reason = `Below buy-side liquidity at ${nearest.level.toFixed(2)} (count: ${nearest.count})`;
    } else {
      stopPrice = entry - _atr * 1.2;
      reason = 'ATR fallback (no buy liquidity below)';
    }

    if (entry - stopPrice < _minSL) {
      stopPrice = entry - _minSL;
      reason = 'Minimum SL enforced';
    }
  }

  // For sell trades: place stop above the nearest sell-side liquidity pool
  if (direction === 'sell') {
    const sellPools = liquidityPools.sellSide || [];
    let nearest = null;
    for (const pool of sellPools) {
      if (pool.level > entry) {
        if (!nearest || pool.level < nearest.level) {
          nearest = pool;
        }
      }
    }

    if (nearest) {
      const buffer = Math.max(_atr * 0.08, 0.03);
      stopPrice = nearest.level + buffer;
      liquidityLevel = nearest.level;
      reason = `Above sell-side liquidity at ${nearest.level.toFixed(2)} (count: ${nearest.count})`;
    } else {
      stopPrice = entry + _atr * 1.2;
      reason = 'ATR fallback (no sell liquidity above)';
    }

    if (stopPrice - entry < _minSL) {
      stopPrice = entry + _minSL;
      reason = 'Minimum SL enforced';
    }
  }

  return {
    stopPrice: parseFloat(stopPrice.toFixed(2)),
    reason,
    stopDistance: Math.abs(stopPrice - entry),
    stopDistanceATR: Math.abs(stopPrice - entry) / _atr,
    liquidityLevel
  };
}

function getICTStop(entry, direction, sweptLevel, atr, minSL) {
  // ICT Rule: Stop goes behind the swept level's wick
  const _atr = atr || 1;
  const _minSL = minSL || 0.1;
  
  let stopPrice;
  let reason;

  if (direction === 'buy') {
    const buffer = Math.max(_atr * 0.05, 0.02);
    stopPrice = sweptLevel ? sweptLevel - buffer : entry - _atr * 1.2;
    reason = sweptLevel ? `Behind swept low at ${sweptLevel.toFixed(2)}` : 'ATR fallback';
    
    if (entry - stopPrice < _minSL) {
      stopPrice = entry - _minSL;
      reason = 'Minimum SL enforced';
    }
  } else {
    const buffer = Math.max(_atr * 0.05, 0.02);
    stopPrice = sweptLevel ? sweptLevel + buffer : entry + _atr * 1.2;
    reason = sweptLevel ? `Behind swept high at ${sweptLevel.toFixed(2)}` : 'ATR fallback';
    
    if (stopPrice - entry < _minSL) {
      stopPrice = entry + _minSL;
      reason = 'Minimum SL enforced';
    }
  }

  return {
    stopPrice: parseFloat(stopPrice.toFixed(2)),
    reason,
    stopDistance: Math.abs(stopPrice - entry),
    stopDistanceATR: Math.abs(stopPrice - entry) / _atr,
    sweptLevel
  };
}

module.exports = { getDynamicStop, getICTStop };
