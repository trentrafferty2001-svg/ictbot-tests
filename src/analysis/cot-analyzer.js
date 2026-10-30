// src/analysis/cot-analyzer.js
const logger = require('../logger');
const fetch = require('node-fetch');

const COT_API_KEY = process.env.COT_API_KEY; // optional, free from Barchart
const COT_URL = 'https://api.barchart.com/cot';

class COTAnalyzer {
  constructor() {
    this.cache = { data: null, timestamp: 0 };
    this.TTL = 24 * 60 * 60 * 1000; // 1 day
  }

  async fetchCOT() {
    const now = Date.now();
    if (this.cache.data && now - this.cache.timestamp < this.TTL) {
      return this.cache.data;
    }
    try {
      let url = `${COT_URL}?symbol=GC&fields=reportDate,openInterest,nonCommercialLong,nonCommercialShort,commercialLong,commercialShort&limit=1`;
      const headers = {};
      if (COT_API_KEY) headers['X-API-Key'] = COT_API_KEY;
      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const data = json.data && json.data[0];
      if (!data) throw new Error('No COT data');
      const result = {
        reportDate: data.reportDate,
        openInterest: data.openInterest,
        nonCommercialLong: data.nonCommercialLong,
        nonCommercialShort: data.nonCommercialShort,
        commercialLong: data.commercialLong,
        commercialShort: data.commercialShort,
      };
      result.nonCommercialNet = result.nonCommercialLong - result.nonCommercialShort;
      result.commercialNet = result.commercialLong - result.commercialShort;
      // Calculate z‑score over last 10 reports (store in cache)
      // For simplicity, we store recent history in a global, but we'll just use current.
      this.cache.data = result;
      this.cache.timestamp = now;
      return result;
    } catch (e) {
      logger.warn('[COT] Failed to fetch:', e.message);
      return this.cache.data || null;
    }
  }

  async getPositioning() {
    const data = await this.fetchCOT();
    if (!data) return { signal: 'neutral', confidence: 0, description: 'No COT data' };
    // Simple logic: extreme net non‑commercial > 80th percentile = bearish reversal risk
    const net = data.nonCommercialNet;
    const oi = data.openInterest;
    const pctNet = net / oi; // fraction of open interest
    // Assume historical mean ~ 0.1, std ~ 0.05 (rough for gold)
    const mean = 0.1, std = 0.05;
    const z = (pctNet - mean) / std;
    let signal = 'neutral', confidence = 0.5;
    if (z > 1.5) { signal = 'bearish_reversal'; confidence = 0.7; }
    else if (z < -1.5) { signal = 'bullish_reversal'; confidence = 0.7; }
    else if (z > 0.8) { signal = 'bearish'; confidence = 0.5; }
    else if (z < -0.8) { signal = 'bullish'; confidence = 0.5; }
    return {
      signal,
      confidence,
      zScore: z,
      netLongPct: pctNet,
      description: `COT: Net non‑commercial ${(net/1000).toFixed(0)}k, Z= ${z.toFixed(2)}`
    };
  }
}

module.exports = { COTAnalyzer };
