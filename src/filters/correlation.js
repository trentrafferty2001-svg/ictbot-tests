'use strict';

/**
 * Correlation filter – blocks trades when DXY conflicts with signal.
 * 
 * @param {Object} analysis - The analysis object from runFullAnalysis.
 * @param {Object} cfg - Bot config.
 * @param {Object} dxyData - Object with trend property ('bullish','bearish','neutral').
 * @returns {Object} { pass: boolean, reason: string }
 */
function checkCorrelation(analysis, cfg, dxyData) {
  if (!dxyData || !dxyData.trend || dxyData.trend === 'neutral') {
    return { pass: true, reason: 'DXY neutral or no data' };
  }

  const signal = analysis.signal;
  if (signal === 'none') {
    return { pass: true, reason: 'No signal to correlate' };
  }

  const dxyTrend = dxyData.trend;

  // Conflict: buy signal with bullish DXY (DXY up = USD strong, XAU down), sell signal with bearish DXY.
  const conflict = (signal === 'buy' && dxyTrend === 'bullish') ||
                   (signal === 'sell' && dxyTrend === 'bearish');
  if (conflict) {
    return { pass: false, reason: `DXY ${dxyTrend} conflicts with ${signal} signal` };
  }

  // Alignment: buy with bearish DXY, sell with bullish DXY (or neutral)
  return { pass: true, reason: 'DXY aligns' };
}

module.exports = { checkCorrelation };
