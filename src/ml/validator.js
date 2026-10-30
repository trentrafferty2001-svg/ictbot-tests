'use strict';

const fs = require('fs');
const path = require('path');

// Default weights – these would be trained on historical journal data
// In practice, we load from a JSON file or update periodically.
const DEFAULT_WEIGHTS = {
  intercept: -0.5,
  score: 0.25,
  kz: 0.3,
  sb: 0.2,
  mssBull: 0.4,
  mssBear: 0.4,
  liqSwept: 0.2,
  ote: 0.3,
  tripleZone: 0.3,
  fullMTFAlign: 0.4,
  nestedFVG: 0.3,
  divergence: 0.25,
  pattern: 0.2,
  vsaConfirms: 0.3,
  hasBreaker: 0.25,
  candlePattern: 0.15,
  newsAlign: 0.2,
  dxyAlign: 0.2,
  hourStrength: 0.15,
  regimeTrend: 0.3,
  sessionLondon: 0.2,
  sessionNY: 0.25,
  sessionAsian: -0.1,
};

let modelWeights = null;
// Persisted alongside the rest of the app's data (src/db uses the same
// DATA_DIR). Previously hardcoded to /tmp directly, which is wiped on every
// restart on Render — same root cause as the trade journal itself, so this
// now rises or falls with wherever DATA_DIR is actually pointed.
const DATA_DIR = process.env.DATA_DIR || '/tmp/data';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const WEIGHT_FILE = path.join(DATA_DIR, 'ml_weights.json');

function loadModelWeights() {
  if (modelWeights) return modelWeights;
  try {
    if (fs.existsSync(WEIGHT_FILE)) {
      const data = fs.readFileSync(WEIGHT_FILE, 'utf8');
      modelWeights = JSON.parse(data);
      return modelWeights;
    }
  } catch (e) {
    // ignore
  }
  modelWeights = { ...DEFAULT_WEIGHTS };
  return modelWeights;
}

function saveModelWeights(weights) {
  try {
    fs.writeFileSync(WEIGHT_FILE, JSON.stringify(weights, null, 2));
  } catch (e) { /* ignore */ }
}

/**
 * Compute confidence probability using logistic regression.
 * @param {Object} analysis - full analysis object.
 * @param {Object} regime - regime info.
 * @param {Object} session - session info.
 * @param {Object} config - optional threshold overrides.
 * @returns {Object} { confidence: number, pass: boolean, threshold: number }
 */
function validateSignal(analysis, regime, session, config = {}) {
  const weights = loadModelWeights();

  // Build feature vector
  let features = {
    score: analysis.score / 12, // normalize
    kz: analysis.kzOn ? 1 : 0,
    sb: analysis.sbOn ? 1 : 0,
    mssBull: (analysis.mss && analysis.mss.dir === 'bullish') ? 1 : 0,
    mssBear: (analysis.mss && analysis.mss.dir === 'bearish') ? 1 : 0,
    liqSwept: (analysis.liq && analysis.liq.swept) ? 1 : 0,
    ote: analysis.ote ? 1 : 0,
    tripleZone: analysis.tripleZone ? 1 : 0,
    fullMTFAlign: analysis.fullMTFAlign ? 1 : 0,
    nestedFVG: analysis.nestedFVG ? 1 : 0,
    divergence: (analysis.divergence && analysis.divergence.type !== 'none') ? 1 : 0,
    pattern: (analysis.patterns && analysis.patterns.patterns && analysis.patterns.patterns.length > 0) ? 1 : 0,
    vsaConfirms: analysis.vsaConfirms ? 1 : 0,
    hasBreaker: analysis.hasBreaker ? 1 : 0,
    candlePattern: analysis.candlePattern ? 1 : 0,
    newsAlign: (analysis.newsSentiment === 'bullish' && analysis.signal === 'buy') ||
               (analysis.newsSentiment === 'bearish' && analysis.signal === 'sell') ? 1 : 0,
    dxyAlign: (analysis.dxyTrend === 'bearish' && analysis.signal === 'buy') ||
              (analysis.dxyTrend === 'bullish' && analysis.signal === 'sell') ? 1 : 0,
    hourStrength: (analysis.hourWinRate !== null && analysis.hourWinRate > 0.6) ? 1 : 0,
    regimeTrend: (regime.regime === 'trending') ? 1 : 0,
    sessionLondon: (session.session === 'london' || session.session === 'london_mid') ? 1 : 0,
    sessionNY: (session.session === 'ny_open' || session.session === 'ny') ? 1 : 0,
    sessionAsian: (session.asian === true) ? 1 : 0,
  };

  // Compute linear combination
  let logit = weights.intercept || 0;
  for (const key in features) {
    if (weights[key] !== undefined) {
      logit += weights[key] * features[key];
    }
  }

  // Sigmoid
  const confidence = 1 / (1 + Math.exp(-logit));

  // Dynamic threshold based on regime and score
  let threshold = config.threshold || 0.55;
  if (regime.regime === 'trending') threshold = 0.50;
  else if (regime.regime === 'ranging') threshold = 0.65;
  else if (regime.regime === 'volatile') threshold = 0.60;
  if (analysis.score >= 10) threshold = Math.min(threshold, 0.45);
  if (analysis.score <= 6) threshold = Math.max(threshold, 0.70);

  const pass = confidence >= threshold;

  return { confidence, pass, threshold };
}

/**
 * Update model weights based on recent trade outcomes – online learning.
 * @param {Array} trades - journal trades.
 */
function retrainModel(trades) {
  // Simplified: re-compute weights using a logistic regression on the last 100 trades.
  // For brevity, we just re-estimate using a naive approach: adjust weights based on win/loss correlations.
  // In production, use a proper ML library.
  // We'll implement a placeholder that updates weights slightly.
  const closed = trades.filter(t => t.outcome !== null).slice(-100);
  if (closed.length < 30) return;

  // Simple correlation: for each feature, compute win rate difference between feature present/absent.
  // Then adjust weights.
  const features = Object.keys(DEFAULT_WEIGHTS).filter(k => k !== 'intercept');
  const weights = { ...DEFAULT_WEIGHTS };

  for (const feat of features) {
    const withFeat = closed.filter(t => t[feat] === true || t[feat] === 1);
    const withoutFeat = closed.filter(t => !(t[feat] === true || t[feat] === 1));
    if (withFeat.length < 5 || withoutFeat.length < 5) continue;
    const wrWith = withFeat.filter(t => t.outcome === 'win').length / withFeat.length;
    const wrWithout = withoutFeat.filter(t => t.outcome === 'win').length / withoutFeat.length;
    const delta = wrWith - wrWithout;
    // Adjust weight: increase if delta > 0, decrease if delta < 0
    const adjustment = Math.min(0.1, Math.max(-0.1, delta * 0.5));
    weights[feat] = Math.max(-1, Math.min(1, (weights[feat] || 0) + adjustment));
  }

  // Also adjust intercept based on overall win rate
  const overallWR = closed.filter(t => t.outcome === 'win').length / closed.length;
  const targetWR = 0.55;
  weights.intercept = (weights.intercept || 0) + (targetWR - overallWR) * 0.1;
  weights.intercept = Math.max(-2, Math.min(2, weights.intercept));

  modelWeights = weights;
  saveModelWeights(weights);
}

module.exports = { validateSignal, retrainModel, loadModelWeights };
