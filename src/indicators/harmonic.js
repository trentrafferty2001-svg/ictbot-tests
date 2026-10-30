'use strict';

/**
 * Detect harmonic patterns on a given timeframe.
 * @param {Array} candles - OHLCV array.
 * @param {Object} swings - swing highs/lows from detectSwings.
 * @param {number} atr - ATR for tolerance.
 * @returns {Array} detected patterns with type, direction, and confidence.
 */
function detectHarmonicPatterns(candles, swings, atr) {
  const patterns = [];
  if (!swings || swings.highs.length < 4 || swings.lows.length < 4) return patterns;

  // Helper to compute Fibonacci retracements/extensions
  function fibRetrace(a, b, level) {
    return a + (b - a) * level;
  }

  // We need to identify XABCD patterns using swing points.
  // For simplicity, we'll search for the most recent 5 swings (X,A,B,C,D).
  // We'll combine highs and lows into a single sequence of turning points.
  const turnPoints = [];
  const allSwings = [];
  // Merge highs and lows sorted by index
  let i = 0, j = 0;
  while (i < swings.highs.length || j < swings.lows.length) {
    if (i < swings.highs.length && (j >= swings.lows.length || swings.highs[i].idx < swings.lows[j].idx)) {
      allSwings.push({ idx: swings.highs[i].idx, price: swings.highs[i].price, type: 'high' });
      i++;
    } else if (j < swings.lows.length) {
      allSwings.push({ idx: swings.lows[j].idx, price: swings.lows[j].price, type: 'low' });
      j++;
    }
  }

  if (allSwings.length < 5) return patterns;

  // Take last 5 swings
  const recent = allSwings.slice(-5);
  // Ensure they alternate high/low
  let valid = true;
  for (let k = 1; k < recent.length; k++) {
    if (recent[k].type === recent[k-1].type) valid = false;
  }
  if (!valid) return patterns;

  // Now assume X = recent[0], A = recent[1], B = recent[2], C = recent[3], D = recent[4]
  const X = recent[0].price;
  const A = recent[1].price;
  const B = recent[2].price;
  const C = recent[3].price;
  const D = recent[4].price;

  // Determine direction: if X < A then bullish (X to A up), else bearish
  const direction = X < A ? 'bullish' : 'bearish';

  // Compute Fibonacci retracements
  const AB = Math.abs(A - B);
  const BC = Math.abs(B - C);
  const CD = Math.abs(C - D);
  const XA = Math.abs(X - A);
  const AD = Math.abs(A - D);

  if (XA < 0.0001 || AB < 0.0001 || BC < 0.0001 || CD < 0.0001) return patterns;

  const retraceAB_XA = AB / XA;
  const retraceBC_AB = BC / AB;
  const retraceCD_BC = CD / BC;
  const retraceAD_XA = AD / XA;

  // Check for Gartley: AB retrace 0.618, BC retrace 0.382-0.886, CD retrace 1.272-1.618, AD retrace 0.786
  const isGartley = Math.abs(retraceAB_XA - 0.618) < 0.05 &&
                    retraceBC_AB >= 0.382 && retraceBC_AB <= 0.886 &&
                    retraceCD_BC >= 1.272 && retraceCD_BC <= 1.618 &&
                    Math.abs(retraceAD_XA - 0.786) < 0.05;

  if (isGartley) {
    patterns.push({ type: 'Gartley', direction, confidence: 75, D: D });
  }

  // Bat: AB 0.382-0.5, BC 0.382-0.886, CD 1.618-2.618, AD 0.886
  const isBat = retraceAB_XA >= 0.382 && retraceAB_XA <= 0.5 &&
                retraceBC_AB >= 0.382 && retraceBC_AB <= 0.886 &&
                retraceCD_BC >= 1.618 && retraceCD_BC <= 2.618 &&
                Math.abs(retraceAD_XA - 0.886) < 0.05;
  if (isBat) {
    patterns.push({ type: 'Bat', direction, confidence: 80, D: D });
  }

  // Crab: AB 0.382-0.618, BC 0.382-0.886, CD 2.618-3.618, AD 1.618
  const isCrab = retraceAB_XA >= 0.382 && retraceAB_XA <= 0.618 &&
                 retraceBC_AB >= 0.382 && retraceBC_AB <= 0.886 &&
                 retraceCD_BC >= 2.618 && retraceCD_BC <= 3.618 &&
                 Math.abs(retraceAD_XA - 1.618) < 0.05;
  if (isCrab) {
    patterns.push({ type: 'Crab', direction, confidence: 85, D: D });
  }

  // Butterfly: AB 0.786, BC 0.382-0.886, CD 1.272-1.618, AD 1.272
  const isButterfly = Math.abs(retraceAB_XA - 0.786) < 0.05 &&
                      retraceBC_AB >= 0.382 && retraceBC_AB <= 0.886 &&
                      retraceCD_BC >= 1.272 && retraceCD_BC <= 1.618 &&
                      Math.abs(retraceAD_XA - 1.272) < 0.05;
  if (isButterfly) {
    patterns.push({ type: 'Butterfly', direction, confidence: 80, D: D });
  }

  // Cypher: AB 0.382-0.618, BC 1.272-1.414, CD 1.272-1.618, AD 0.786
  const isCypher = retraceAB_XA >= 0.382 && retraceAB_XA <= 0.618 &&
                   retraceBC_AB >= 1.272 && retraceBC_AB <= 1.414 &&
                   retraceCD_BC >= 1.272 && retraceCD_BC <= 1.618 &&
                   Math.abs(retraceAD_XA - 0.786) < 0.05;
  if (isCypher) {
    patterns.push({ type: 'Cypher', direction, confidence: 75, D: D });
  }

  return patterns;
}

module.exports = { detectHarmonicPatterns };
