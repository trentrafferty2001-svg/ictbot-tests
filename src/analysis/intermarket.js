// src/analysis/intermarket.js
const logger = require('../logger');
const fetch = require('node-fetch');

class IntermarketAnalyzer {
  constructor() {
    this.cache = { data: null, timestamp: 0 };
    this.TTL = 10 * 60 * 1000;
  }

  async fetchYahoo(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Yahoo ${symbol} failed: ${resp.status}`);
    const json = await resp.json();
    const result = json.chart.result[0];
    if (!result) throw new Error('No data');
    const quotes = result.indicators.quote[0];
    const closes = quotes.close.filter(c => c !== null);
    const last = closes[closes.length - 1];
    const previous = closes.length > 1 ? closes[closes.length - 2] : last;
    return { price: last, change: (last - previous) / previous * 100 };
  }

  async getData() {
    const now = Date.now();
    if (this.cache.data && now - this.cache.timestamp < this.TTL) {
      return this.cache.data;
    }
    try {
      const gdx = await this.fetchYahoo('GDX');
      const spy = await this.fetchYahoo('SPY');
      const tlt = await this.fetchYahoo('TLT');
      const data = { gdx, spy, tlt };
      this.cache.data = data;
      this.cache.timestamp = now;
      return data;
    } catch (e) {
      logger.warn('[Intermarket] Failed:', e.message);
      return this.cache.data || null;
    }
  }

  async getDivergence() {
    const data = await this.getData();
    if (!data) return { signal: 'neutral', confidence: 0, description: 'No intermarket data' };
    const { gdx, spy, tlt } = data;
    // Gold vs GDX: if gold moves up but GDX down, bearish divergence
    // For gold, we can get current price from outside; we'll assume caller passes it.
    // We'll compute a composite score.
    let score = 0;
    if (gdx.change > 0.5) score += 0.3;
    else if (gdx.change < -0.5) score -= 0.3;
    if (spy.change > 0.3) score += 0.1; // risk-on
    else if (spy.change < -0.3) score -= 0.1;
    if (tlt.change > 0.3) score += 0.2; // bond rally = gold bullish
    else if (tlt.change < -0.3) score -= 0.2;
    let signal = 'neutral', confidence = 0.5;
    if (score > 0.5) { signal = 'bullish'; confidence = 0.6; }
    else if (score < -0.5) { signal = 'bearish'; confidence = 0.6; }
    return {
      signal,
      confidence,
      score,
      description: `Intermarket: GDX ${gdx.change.toFixed(1)}%, SPY ${spy.change.toFixed(1)}%, TLT ${tlt.change.toFixed(1)}%`
    };
  }
}

module.exports = { IntermarketAnalyzer };
