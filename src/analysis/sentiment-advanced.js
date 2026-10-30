'use strict';

/**
 * Advanced sentiment analysis using a lexicon.
 * 
 * @param {string} text - Text to analyze.
 * @param {Object} options - Optional: { language: 'en' }.
 * @returns {Object} { score: number, label: 'bullish'|'bearish'|'neutral', bullishCount: number, bearishCount: number }.
 */
function analyzeSentiment(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { score: 0, label: 'neutral', bullishCount: 0, bearishCount: 0 };
  }

  const lower = text.toLowerCase();

  // Expanded lexicon (bullish/bearish terms)
  const bullishTerms = [
    'dovish', 'cut', 'easing', 'stimulus', 'lower rates', 'gold rally', 'weak dollar',
    'safe haven', 'bullish', 'rally', 'gain', 'recovery', 'upside', 'breakout',
    'support', 'oversold', 'accumulation', 'inflation hedge', 'reserve currency',
    'central bank buying', 'geopolitical risk', 'uncertainty', 'yield decline'
  ];
  const bearishTerms = [
    'hawkish', 'hike', 'tightening', 'strong dollar', 'taper', 'gold drop', 'risk-on',
    'bearish', 'decline', 'selloff', 'correction', 'downside', 'breakdown',
    'resistance', 'overbought', 'distribution', 'rate increase', 'fiscal tightening',
    'dxy rally', 'safe haven demand weak', 'yield rise', 'real yields'
  ];

  // Count occurrences
  let bullishCount = 0;
  let bearishCount = 0;
  for (const term of bullishTerms) {
    if (lower.includes(term)) bullishCount++;
  }
  for (const term of bearishTerms) {
    if (lower.includes(term)) bearishCount++;
  }

  // Score: difference divided by total terms to normalize roughly
  const total = bullishCount + bearishCount;
  const score = total === 0 ? 0 : (bullishCount - bearishCount) / total;

  // Label
  let label = 'neutral';
  if (score > 0.2) label = 'bullish';
  else if (score < -0.2) label = 'bearish';

  return {
    score: parseFloat(score.toFixed(3)),
    label,
    bullishCount,
    bearishCount
  };
}

/**
 * Analyze sentiment from multiple articles or text chunks.
 * @param {Array<string>} texts - Array of text strings.
 * @param {Object} options - Same as above.
 * @returns {Object} Aggregate sentiment.
 */
function analyzeSentimentBatch(texts, options = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return { score: 0, label: 'neutral', bullishCount: 0, bearishCount: 0, totalTexts: 0 };
  }
  let totalBullish = 0, totalBearish = 0;
  for (const text of texts) {
    const result = analyzeSentiment(text, options);
    totalBullish += result.bullishCount;
    totalBearish += result.bearishCount;
  }
  const total = totalBullish + totalBearish;
  const score = total === 0 ? 0 : (totalBullish - totalBearish) / total;
  let label = 'neutral';
  if (score > 0.2) label = 'bullish';
  else if (score < -0.2) label = 'bearish';
  return {
    score: parseFloat(score.toFixed(3)),
    label,
    bullishCount: totalBullish,
    bearishCount: totalBearish,
    totalTexts: texts.length
  };
}

module.exports = { analyzeSentiment, analyzeSentimentBatch };
