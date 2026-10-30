// ════════════════════════════════════════════════════════════════════════════
//  Candlestick Pattern Recognition
// ════════════════════════════════════════════════════════════════════════════

function detectPatterns(candles, atr) {
  if (!candles || candles.length < 5) return { patterns: [], hasReversal: false, hasContinuation: false };

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];
  const patterns = [];

  // ── 1. Engulfing ──────────────────────────────────────────────────────────
  const bullishEngulfing = prev.close < prev.open && 
                           last.close > last.open && 
                           last.close > prev.open && 
                           last.open < prev.close;
  if (bullishEngulfing) {
    patterns.push({ type: 'Bullish Engulfing', bullish: true, confidence: 80 });
  }

  const bearishEngulfing = prev.close > prev.open && 
                           last.close < last.open && 
                           last.close < prev.open && 
                           last.open > prev.close;
  if (bearishEngulfing) {
    patterns.push({ type: 'Bearish Engulfing', bullish: false, confidence: 80 });
  }

  // ── 2. Doji ──────────────────────────────────────────────────────────────
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  if (range > 0 && body / range < 0.1) {
    patterns.push({ type: 'Doji', bullish: null, confidence: 50 });
  }

  // ── 3. Hammer / Shooting Star ────────────────────────────────────────────
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const bodySize = body;

  if (range > 0 && lowerWick > bodySize * 2 && upperWick < bodySize * 0.3) {
    patterns.push({ type: 'Hammer', bullish: true, confidence: 70 });
  }
  if (range > 0 && upperWick > bodySize * 2 && lowerWick < bodySize * 0.3) {
    patterns.push({ type: 'Shooting Star', bullish: false, confidence: 70 });
  }

  // ── 4. Morning / Evening Star (3-candle) ────────────────────────────────
  if (candles.length >= 3) {
    const first = prev2;
    const second = prev;
    const third = last;
    // Morning Star: bearish, small body (doji), bullish
    if (first.close < first.open && 
        Math.abs(second.close - second.open) < (second.high - second.low) * 0.2 &&
        third.close > third.open && 
        third.close > (first.open + first.close) / 2) {
      patterns.push({ type: 'Morning Star', bullish: true, confidence: 85 });
    }
    // Evening Star: bullish, small body, bearish
    if (first.close > first.open && 
        Math.abs(second.close - second.open) < (second.high - second.low) * 0.2 &&
        third.close < third.open && 
        third.close < (first.open + first.close) / 2) {
      patterns.push({ type: 'Evening Star', bullish: false, confidence: 85 });
    }
  }

  // ── 5. Continuation: Rising/Falling Three Methods ────────────────────────
  if (candles.length >= 5) {
    const c1 = candles[candles.length - 5];
    const c2 = candles[candles.length - 4];
    const c3 = candles[candles.length - 3];
    const c4 = candles[candles.length - 2];
    const c5 = candles[candles.length - 1];

    const bodyOf = (c) => Math.abs(c.close - c.open);
    const c1Body = bodyOf(c1);
    const c5Body = bodyOf(c5);
    const middleCandles = [c2, c3, c4];
    const middleWithinC1Range = middleCandles.every(c => c.high <= c1.high && c.low >= c1.low);
    const middleAreSmall = c1Body > 0 && middleCandles.every(c => bodyOf(c) < c1Body * 0.6);

    // Rising Three Methods: one long bullish candle, three small bearish
    // pullback candles contained within its range, then a long bullish
    // candle closing above the first candle's close — a pause, not a reversal.
    const risingThreeMethods =
      c1.close > c1.open &&
      middleCandles.every(c => c.close < c.open) &&
      middleWithinC1Range &&
      middleAreSmall &&
      c5.close > c5.open &&
      c5.close > c1.close &&
      c5Body >= c1Body * 0.8;
    if (risingThreeMethods) {
      patterns.push({ type: 'Rising Three Methods', bullish: true, confidence: 65 });
    }

    // Falling Three Methods: mirror image.
    const fallingThreeMethods =
      c1.close < c1.open &&
      middleCandles.every(c => c.close > c.open) &&
      middleWithinC1Range &&
      middleAreSmall &&
      c5.close < c5.open &&
      c5.close < c1.close &&
      c5Body >= c1Body * 0.8;
    if (fallingThreeMethods) {
      patterns.push({ type: 'Falling Three Methods', bullish: false, confidence: 65 });
    }
  }

  // Determine overall bias
  const bullishPatterns = patterns.filter(p => p.bullish === true);
  const bearishPatterns = patterns.filter(p => p.bullish === false);
  const hasReversal = bullishPatterns.length > 0 || bearishPatterns.length > 0;
  const hasContinuation = patterns.some(p => p.type.includes('Three Methods'));

  return {
    patterns,
    hasReversal,
    hasContinuation,
    bullishScore: bullishPatterns.reduce((s, p) => s + p.confidence, 0),
    bearishScore: bearishPatterns.reduce((s, p) => s + p.confidence, 0),
    bestPattern: patterns.length > 0 ? patterns.reduce((a, b) => a.confidence > b.confidence ? a : b) : null,
  };
}

module.exports = { detectPatterns };
