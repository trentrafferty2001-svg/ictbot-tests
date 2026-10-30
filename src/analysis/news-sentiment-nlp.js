// src/analysis/news-sentiment-nlp.js
const logger = require('../logger');

class NewsSentimentNLP {
    constructor() {
        this.API_KEY = process.env.NEWS_API_KEY;
        this.cache = { data: null, timestamp: 0 };
        this.TTL = 30 * 60 * 1000; // 30 minutes
    }

    async fetchNews() {
        if (!this.API_KEY) {
            logger.warn('[NewsNLP] No API key, using fallback');
            return null;
        }
        const now = Date.now();
        if (this.cache.data && now - this.cache.timestamp < this.TTL) return this.cache.data;
        try {
            const url = `https://newsapi.org/v2/everything?q=gold OR "XAU/USD" OR "Federal Reserve" OR "interest rates" OR "inflation"&language=en&sortBy=publishedAt&pageSize=20&apiKey=${this.API_KEY}`;
            let attempt = 0;
            while (attempt < 3) {
                const resp = await fetch(url);
                if (resp.status === 429) {
                    const retryAfter = parseInt(resp.headers.get('retry-after') || '60');
                    const waitTime = Math.min(retryAfter + 1, 120) * 1000;
                    logger.warn(`[NewsNLP] Rate limited, waiting ${waitTime/1000}s (attempt ${attempt+1}/3)`);
                    await new Promise(r => setTimeout(r, waitTime));
                    attempt++;
                    continue;
                }
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const json = await resp.json();
                if (!json.articles || json.articles.length === 0) throw new Error('No articles');
                const articles = json.articles.slice(0, 10);
                const keywords = {
                    bullish: ['rise', 'surge', 'rally', 'gain', 'higher', 'bullish', 'positive', 'strong', 'up'],
                    bearish: ['fall', 'drop', 'plunge', 'decline', 'lower', 'bearish', 'negative', 'weak', 'down', 'crash']
                };
                let scores = [];
                for (const article of articles) {
                    const text = ((article.title || '') + ' ' + (article.description || '')).toLowerCase();
                    let pos = 0, neg = 0;
                    for (const w of keywords.bullish) if (text.includes(w)) pos++;
                    for (const w of keywords.bearish) if (text.includes(w)) neg++;
                    const total = pos + neg || 1;
                    scores.push({ positive: pos/total, negative: neg/total, neutral: 1 - pos/total - neg/total });
                }
                const avg = scores.reduce((acc, s) => {
                    return { positive: acc.positive + s.positive, negative: acc.negative + s.negative, neutral: acc.neutral + s.neutral };
                }, { positive: 0, negative: 0, neutral: 0 });
                const count = scores.length || 1;
                const result = {
                    positive: avg.positive / count,
                    negative: avg.negative / count,
                    neutral: avg.neutral / count,
                    sentiment: avg.positive > avg.negative ? 'bullish' : avg.negative > avg.positive ? 'bearish' : 'neutral',
                    score: (avg.positive - avg.negative) / (avg.positive + avg.negative + avg.neutral || 1),
                    articles: articles.slice(0, 3).map(a => a.title)
                };
                this.cache.data = result;
                this.cache.timestamp = now;
                return result;
            }
            throw new Error('Max retries exceeded');
        } catch (e) {
            logger.warn('[NewsNLP] Failed:', e.message);
            return this.cache.data || null;
        }
    }

    async getRecommendation() {
        const data = await this.fetchNews();
        if (!data) return { bias: 'neutral', confidence: 0, description: 'No news data' };
        const bias = data.sentiment;
        const confidence = 0.5 + Math.abs(data.score) * 0.5;
        return {
            bias,
            confidence: Math.min(0.9, confidence),
            score: data.score,
            description: `News NLP: ${bias} (score ${data.score.toFixed(2)})`
        };
    }
}

module.exports = { NewsSentimentNLP };
