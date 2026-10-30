// src/analysis/macro-factors.js
const logger = require('../logger');
const fetch = require('node-fetch');

class MacroFactors {
  constructor() {
    this.cache = { dxy: null, yield: null, inflation: null, timestamp: 0 };
    this.TTL = 5 * 60 * 1000; // 5 minutes
  }

  async fetchYahoo(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Yahoo ${symbol} failed: ${resp.status}`);
    const json = await resp.json();
    const result = json.chart.result[0];
    if (!result) throw new Error('No data');
    const meta = result.meta;
    const quotes = result.indicators.quote[0];
    const lastIdx = quotes.close.length - 1;
    const price = quotes.close[lastIdx];
    return { price, previousClose: meta.previousClose, timestamp: meta.regularMarketTime };
  }

  async fetchFRED(seriesId) {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) throw new Error('FRED_API_KEY not set');
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`FRED ${seriesId} failed: ${resp.status}`);
    const json = await resp.json();
    const obs = json.observations;
    if (!obs || obs.length === 0) throw new Error('No FRED data');
    const value = parseFloat(obs[0].value);
    return value;
  }

  async getFactors() {
    const now = Date.now();
    if (this.cache.dxy && now - this.cache.timestamp < this.TTL) {
      return this.cache;
    }
    try {
      const dxy = await this.fetchYahoo('DX-Y.NYB');
      const t10y = await this.fetchFRED('DGS10'); // 10‑year Treasury
      const inflation = await this.fetchFRED('T10YIE'); // 10‑year breakeven inflation
      const realYield = t10y - inflation; // approximate real yield
      this.cache.dxy = dxy.price;
      this.cache.yield = t10y;
      this.cache.inflation = inflation;
      this.cache.realYield = realYield;
      this.cache.timestamp = now;
      return this.cache;
    } catch (e) {
      logger.warn('[Macro] Failed to fetch:', e.message);
      return this.cache;
    }
  }

  async getSignal() {
    const factors = await this.getFactors();
    if (!factors.dxy) return { bias: 'neutral', confidence: 0, description: 'No macro data' };
    // Simple logic: DXY up = gold bearish, real yield up = gold bearish
    let bias = 'neutral', confidence = 0.5;
    // Compare DXY to previous close (if available) - we don't have historical here, so we use a moving average?
    // For simplicity, use a threshold: DXY > 105 = bearish, < 95 = bullish
    const dxy = factors.dxy;
    const real = factors.realYield || 0;
    let score = 0;
    if (dxy > 105) score -= 0.5;
    else if (dxy < 95) score += 0.5;
    if (real > 2) score -= 0.5;
    else if (real < 0) score += 0.5;
    if (score > 0.3) { bias = 'bullish'; confidence = 0.6 + Math.abs(score)*0.2; }
    else if (score < -0.3) { bias = 'bearish'; confidence = 0.6 + Math.abs(score)*0.2; }
    return {
      bias,
      confidence: Math.min(0.9, confidence),
      dxy,
      realYield: real,
      description: `Macro: DXY=${dxy.toFixed(2)}, Real Yield=${real.toFixed(2)}%`
    };
  }
}

module.exports = { MacroFactors };
