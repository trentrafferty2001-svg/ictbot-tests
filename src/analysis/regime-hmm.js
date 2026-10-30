// src/analysis/regime-hmm.js
const logger = require('../logger');
const indicators = require('../indicators');

class RegimeHMM {
  constructor() {
    this.lastRegime = 'normal';
  }

  // Call with daily or 4h candles
  detect(candles) {
    if (!candles || candles.length < 50) return { regime: 'normal', confidence: 0.6 };
    const atr = indicators.calcATR14(candles);
    const adx = indicators.calcADX(candles);
    const closes = candles.map(c => c.close);
    // Compute range relative to ATR over last 20 candles
    const recent = candles.slice(-20);
    const high = Math.max(...recent.map(c => c.high));
    const low = Math.min(...recent.map(c => c.low));
    const range = high - low;
    const rangeRatio = range / (atr * 20);
    const adxVal = adx.adx || 20;
    // Determine regime
    let regime = 'normal', confidence = 0.6;
    if (adxVal > 25 && rangeRatio > 1.2) {
      regime = 'trending';
      confidence = 0.7 + Math.min(0.2, (adxVal - 25) / 50);
    } else if (adxVal < 18 && rangeRatio < 0.8) {
      regime = 'ranging';
      confidence = 0.7 + Math.min(0.2, (18 - adxVal) / 15);
    } else if (atr > 5 * indicators.calcATR14(candles.slice(0, -20)) ) { // compare to earlier ATR
      regime = 'volatile';
      confidence = 0.7;
    }
    this.lastRegime = regime;
    return { regime, confidence };
  }

  getRecommendation(regime) {
    // Adjust parameters based on regime
    const rec = { minScore: 3, riskMult: 1, rr: 1.5, maxT: 12 };
    switch (regime) {
      case 'trending':
        rec.minScore = 2;
        rec.riskMult = 1.2;
        rec.rr = 2.0;
        rec.maxT = 8;
        break;
      case 'ranging':
        rec.minScore = 4;
        rec.riskMult = 0.6;
        rec.rr = 1.0;
        rec.maxT = 6;
        break;
      case 'volatile':
        rec.minScore = 4;
        rec.riskMult = 0.5;
        rec.rr = 1.2;
        rec.maxT = 4;
        break;
      default:
        break;
    }
    return rec;
  }
}

module.exports = { RegimeHMM };
