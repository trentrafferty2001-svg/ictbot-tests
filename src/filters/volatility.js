// src/filters/volatility.js
// Was an absolute atr/price ratio (0.5% floor) — miscalibrated for whatever
// timeframe's ATR actually gets passed in. In practice this runs against
// M15 ATR14: for gold near $4400, 0.5% of price is a $22 move, which an
// average 15-minute candle essentially never produces under normal
// conditions. Softened to a penalty, this miscalibration was dormant and
// harmless; hardened to a block (2026-08-13, to fix a real overtrading
// problem elsewhere), it became a near-permanent block instead — confirmed
// 2026-08-19 after 6 days with zero trades placed, "Live Analysis" showing
// this same block firing on every check. Rather than guess a new absolute
// percentage (same class of error, different number, and it would still be
// wrong the next time this runs against a different timeframe or
// instrument), made this self-calibrating: current ATR is compared to its
// OWN trailing average over the same series, the same technique
// detectRegime already uses successfully for H4. This works regardless of
// which timeframe's ATR is passed in, and regardless of the instrument's
// price level. Fixed 2026-08-19.
function volatilityFilter(atr, price, priorAtrs) {
  if (Array.isArray(priorAtrs) && priorAtrs.length >= 5) {
    const avg = priorAtrs.reduce((a, b) => a + b, 0) / priorAtrs.length;
    const ratio = avg > 0 ? atr / avg : 1;
    if (ratio < 0.3) return { pass: false, reason: `ATR ${(ratio * 100).toFixed(0)}% of its own recent average – too quiet relative to normal` };
    if (ratio > 2.5) return { pass: true, sizeMultiplier: 0.5, reason: 'ATR well above its own recent average – size halved' };
    return { pass: true, sizeMultiplier: 1, reason: 'Normal volatility' };
  }
  // Fallback if no history was supplied (shouldn't normally happen) — keep
  // the old absolute check as a last resort rather than skip volatility
  // checking entirely, but don't hard-block on it since it's the exact
  // measure that was proven unreliable.
  const ratio = atr / price;
  if (ratio < 0.005) return { pass: true, sizeMultiplier: 0.7, reason: 'ATR < 0.5% of price (no history available to calibrate properly) – size reduced, not blocked' };
  return { pass: true, sizeMultiplier: 1, reason: 'Normal volatility (uncalibrated fallback)' };
}

module.exports = { volatilityFilter };
