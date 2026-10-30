'use strict';

const logger = require('../logger');

// No need for 'node-fetch' – use global fetch (Node 18+)
// If you are on Node < 18, install node-fetch and uncomment the line below:
// const fetch = require('node-fetch');

// Cache COT data for 24 hours
let _cotCache = null;
let _cotCacheTime = 0;
let _mockWarningLogged = false;

/**
 * Fetch COT data (mock if no API key).
 * @param {string} apiKey - optional API key for a COT data provider.
 * @returns {Object} { commercialNet: number, specNet: number, sentiment: number, label: string }
 */
async function fetchCOT(apiKey) {
  const now = Date.now();
  if (_cotCache && now - _cotCacheTime < 24 * 60 * 60 * 1000) {
    return _cotCache;
  }

  try {
    // Try a real API (e.g., Quiver Quantitative)
    if (apiKey) {
      const url = `https://api.quiverquant.com/beta/cot?ticker=GC&api_token=${apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // Parse data to get commercial net and speculative net
        // Simplified: assume data has fields
        const commercialNet = data.commercialNet || 0;
        const specNet = data.specNet || 0;
        const total = Math.abs(commercialNet) + Math.abs(specNet);
        let sentiment = 0;
        if (total > 0) {
          sentiment = (commercialNet - specNet) / total; // positive = bullish (commercials long)
        }
        let label = 'neutral';
        if (sentiment > 0.3) label = 'bullish';
        else if (sentiment < -0.3) label = 'bearish';
        const result = { commercialNet, specNet, sentiment, label };
        _cotCache = result;
        _cotCacheTime = now;
        return result;
      }
    }
  } catch (e) {
    // fallback to mock
  }

  // Mock data (simulate moderate bullish sentiment) — used when no COT_API_KEY
  // is configured, or the real request failed. This is a fixed constant, not
  // real sentiment, so it will never trigger the COT alignment bonus or the
  // block threshold. Logged once so this isn't silently mistaken for a live
  // filter.
  if (!_mockWarningLogged) {
    logger.warn('[cot] No COT_API_KEY configured (or request failed) — using static mock data. This check is effectively a no-op until a real key is set.');
    _mockWarningLogged = true;
  }
  const mock = { commercialNet: 15000, specNet: -12000, sentiment: 0.15, label: 'neutral' };
  _cotCache = mock;
  _cotCacheTime = now;
  return mock;
}

/**
 * Get COT sentiment and return a filter.
 * @param {string} signal - 'buy' or 'sell'.
 * @param {string} apiKey - optional.
 * @returns {Object} { pass: boolean, reason: string, sentiment: number }
 */
async function checkCOT(signal, apiKey) {
  const data = await fetchCOT(apiKey);
  const sentiment = data.sentiment;
  // Block if extreme: >0.6 bullish or <-0.6 bearish, and signal is in the same direction (contrarian)
  const extreme = Math.abs(sentiment) > 0.6;
  if (extreme) {
    if ((sentiment > 0.6 && signal === 'buy') || (sentiment < -0.6 && signal === 'sell')) {
      return { pass: false, reason: `Extreme COT sentiment (${data.label}) against trade`, sentiment };
    }
  }
  // If sentiment is moderately bullish and signal is buy, add bonus; if bearish and sell, bonus.
  const align = (sentiment > 0.2 && signal === 'buy') || (sentiment < -0.2 && signal === 'sell');
  return { pass: true, reason: align ? 'COT aligns' : 'COT neutral', sentiment, align };
}

module.exports = { fetchCOT, checkCOT };
