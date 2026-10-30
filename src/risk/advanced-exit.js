'use strict';

/**
 * Compute a dynamic trailing stop based on ATR and volatility regime.
 * @param {number} currentPrice - current price.
 * @param {string} direction - 'buy' or 'sell'.
 * @param {number} atr - current ATR.
 * @param {string} volatility - 'high', 'normal', 'low'.
 * @param {number} profitPct - current profit in % of SL distance.
 * @returns {number} new stop price.
 */
function getDynamicTrail(currentPrice, direction, atr, volatility, profitPct) {
  let multiplier = 2.0;
  if (volatility === 'high') multiplier = 2.5;
  else if (volatility === 'low') multiplier = 1.5;
  // Adjust based on profit: tighten as profit grows
  if (profitPct > 3) multiplier *= 0.7;
  else if (profitPct > 2) multiplier *= 0.85;

  const trailDistance = atr * multiplier;
  let stop;
  if (direction === 'buy') {
    stop = currentPrice - trailDistance;
    // Ensure stop is above entry? Not here; we'll let caller handle.
  } else {
    stop = currentPrice + trailDistance;
  }
  return parseFloat(stop.toFixed(2));
}

/**
 * Time-stop: close trade if held too long without hitting TP1.
 * @param {number} openTime - timestamp of entry.
 * @param {number} maxHours - max hours to hold.
 * @param {number} profitPct - current profit %.
 * @param {boolean} tp1Hit - whether TP1 was hit.
 * @returns {boolean} true if should close.
 */
function shouldTimeExit(openTime, maxHours, profitPct, tp1Hit) {
  const now = Date.now();
  const hoursHeld = (now - openTime) / (1000 * 60 * 60);
  if (hoursHeld > maxHours && profitPct < 1 && !tp1Hit) {
    return true;
  }
  return false;
}

module.exports = { getDynamicTrail, shouldTimeExit };
