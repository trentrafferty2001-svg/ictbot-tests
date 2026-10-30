// src/analysis/news-sentiment-advanced.js
const logger = require('../logger');
const fetch = require('node-fetch');
const { analyzeSentimentBatch } = require('./sentiment-advanced'); // existing

class NewsSentimentAdvanced {
  constructor() {
    this.API_KEY = process.env.NEWS_API_KEY;
    this.cache = { data: null, timestamp: 0 };
    this.TTL = 15 * 60 * 1000;
  }

  async fetchNews() {
    if (!this.API_KEY) {
      logger.warn('[NewsAdvanced] No NEWS_API_KEY, using fallback');
      return null;
    }
    const now = Date.now();
    if (this.cache.data && now - this.cache.timestamp < this.TTL) return this.cache.data;
    try {
      const url = `https://newsapi.org/v2/everything?q=gold OR "XAU/USD" OR "Federal Reserve"&language=en&sortBy=publishedAt&pageSize=30&apiKey=${this.API_KEY}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json.articles || json.articles.length === 0) throw new Error('No articles');
      // Filter relevant articles and compute sentiment
      const articles = json.articles.slice(0, 10);
      const contents = articles.map(a => (a.title || '') + ' ' + (a.description || ''));
      const sentimentResult = analyzeSentimentBatch(contents); // uses existing VADER
      // Also compute impact weights based on source, recency
      const weightedScore = sentimentResult.score; // could add more logic
      const impact = Math.min(1, articles.length / 10);
      const result = {
        sentiment: sentimentResult.label,
        score: weightedScore,
        impact,
        bullishCount: sentimentResult.bullishCount || 0,
        bearishCount: sentimentResult.bearishCount || 0,
        articles: articles.slice(0, 3).map(a => a.title),
      };
      this.cache.data = result;
      this.cache.timestamp = now;
      return result;
    } catch (e) {
      logger.warn('[NewsAdvanced] Failed:', e.message);
      return this.cache.data || null;
    }
  }

  async getSignal() {
    const data = await this.fetchNews();
    if (!data) return { bias: 'neutral', confidence: 0, description: 'No news data' };
    let bias = 'neutral';
    let confidence = 0.5;
    const score = data.score;
    if (score > 0.2 && data.impact > 0.5) {
      bias = 'bullish';
      confidence = 0.6 + Math.min(0.3, score * 0.5);
    } else if (score < -0.2 && data.impact > 0.5) {
      bias = 'bearish';
      confidence = 0.6 + Math.min(0.3, Math.abs(score) * 0.5);
    }
    return {
      bias,
      confidence,
      score,
      impact: data.impact,
      description: `News: ${data.sentiment} (score ${score.toFixed(2)}), impact ${data.impact.toFixed(2)}`
    };
  }
}

module.exports = { NewsSentimentAdvanced };
