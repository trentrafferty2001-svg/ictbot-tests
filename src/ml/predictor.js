// ════════════════════════════════════════════════════════════════════════════
//  src/ml/predictor.js
//  Lightweight ML Predictor - No external dependencies
//  Uses logistic regression with online learning
// ════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || '/tmp/data';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const MODEL_FILE = path.join(DATA_DIR, 'ml_model.json');
const FEATURE_FILE = path.join(DATA_DIR, 'ml_features.json');

// ─── DEFAULT WEIGHTS (Pre-trained on ICT concepts) ────────────────────────
const DEFAULT_WEIGHTS = {
  intercept: -0.8,
  score: 0.35,
  mss: 0.5,
  liqSwept: 0.3,
  ote: 0.4,
  tripleZone: 0.3,
  fullMTFAlign: 0.5,
  nestedFVG: 0.3,
  divergence: 0.25,
  vsaConfirms: 0.3,
  hasBreaker: 0.25,
  dxyAlign: 0.3,
  sessionLondon: 0.2,
  sessionNY: 0.25,
  hourStrength: 0.2,
  regimeTrend: 0.3,
  volumeImbalance: 0.2,
  spreadNormal: 0.15,
  pattern: 0.2,
  turtleSoup: 0.3,
  liquiditySweep: 0.25,
  macroTrend: 0.35
};

let modelWeights = null;
let featureCache = [];

// ─── LOAD/SAVE MODEL ────────────────────────────────────────────────────────
function loadModel() {
  if (modelWeights) return modelWeights;
  try {
    if (fs.existsSync(MODEL_FILE)) {
      const data = fs.readFileSync(MODEL_FILE, 'utf8');
      modelWeights = JSON.parse(data);
      return modelWeights;
    }
  } catch (e) { /* ignore */ }
  modelWeights = { ...DEFAULT_WEIGHTS };
  saveModel(modelWeights);
  return modelWeights;
}

function saveModel(weights) {
  try {
    fs.writeFileSync(MODEL_FILE, JSON.stringify(weights, null, 2));
  } catch (e) { /* ignore */ }
}

// ─── FEATURE EXTRACTION ────────────────────────────────────────────────────
function extractFeatures(analysis, regime, session, cfg) {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();

  return {
    // Core ICT signals
    score: Math.min(analysis.score || 0, 12) / 12,
    mss: analysis.mss && analysis.mss.dir !== 'neutral' ? 1 : 0,
    liqSwept: analysis.liq && analysis.liq.swept ? 1 : 0,
    ote: analysis.ote ? 1 : 0,
    tripleZone: analysis.tripleZone ? 1 : 0,
    fullMTFAlign: analysis.fullMTFAlign ? 1 : 0,
    nestedFVG: analysis.nestedFVG ? 1 : 0,
    divergence: analysis.divergence && analysis.divergence.type !== 'none' ? 1 : 0,
    vsaConfirms: analysis.vsaConfirms ? 1 : 0,
    hasBreaker: analysis.hasBreaker ? 1 : 0,
    
    // DXY alignment (Gold inverse correlation)
    dxyAlign: (analysis.dxyTrend === 'bearish' && analysis.signal === 'buy') ||
              (analysis.dxyTrend === 'bullish' && analysis.signal === 'sell') ? 1 : 0,
    
    // Session strength
    sessionLondon: session.session === 'london' || session.session === 'london_mid' ? 1 : 0,
    sessionNY: session.session === 'ny_open' || session.session === 'ny' ? 1 : 0,
    sessionAsian: session.asian === true ? 1 : 0,
    
    // Time factors
    hourStrength: analysis.hourWinRate && analysis.hourWinRate > 0.55 ? 1 : 0,
    isFriday: day === 5 ? 1 : 0,
    isMonday: day === 1 ? 1 : 0,
    
    // Regime
    regimeTrend: regime.regime === 'trending' || regime.regime === 'strong_trend' ? 1 : 0,
    regimeRanging: regime.regime === 'ranging' ? 1 : 0,
    regimeVolatile: regime.regime === 'volatile' ? 1 : 0,
    
    // Volume
    volumeImbalance: analysis.volumeProfile && analysis.volumeProfile.volumeImbalance ? 
      Math.min(1, Math.abs(analysis.volumeProfile.volumeImbalance) * 2) : 0.5,
    
    // Spread
    spreadNormal: cfg._spread && cfg._spread < 1.5 ? 1 : 0,
    
    // Patterns
    pattern: analysis.patterns && analysis.patterns.patterns && 
             analysis.patterns.patterns.length > 0 ? 1 : 0,
    
    // Harmonic
    harmonic: analysis.harmonicPatterns && analysis.harmonicPatterns.length > 0 ? 1 : 0,
    
    // Squeeze
    squeeze: analysis.squeeze && analysis.squeeze.squeeze ? 1 : 0,
    
    // Turtle Soup (new)
    turtleSoup: analysis.turtleSoup && analysis.turtleSoup.pattern !== 'none' ? 1 : 0,
    
    // Liquidity Pool Sweep (new)
    liquiditySweep: analysis.liquiditySweep && analysis.liquiditySweep.swept ? 1 : 0,
    
    // Macro Trend (new)
    macroTrend: analysis.macroTrend && analysis.macroTrend.confidence > 0.6 ? 1 : 0
  };
}

// ─── PREDICTION ─────────────────────────────────────────────────────────────
function predict(analysis, regime, session, cfg, options = {}) {
  const weights = loadModel();
  const features = extractFeatures(analysis, regime, session, cfg);
  
  // Cache features for training
  featureCache.push({ 
    features, 
    signal: analysis.signal, 
    timestamp: Date.now() 
  });
  if (featureCache.length > 500) featureCache = featureCache.slice(-500);
  
  // Calculate logit
  let logit = weights.intercept || 0;
  for (const [key, value] of Object.entries(features)) {
    if (weights[key] !== undefined && value !== null && value !== undefined) {
      logit += weights[key] * value;
    }
  }
  
  // Sigmoid
  const probability = 1 / (1 + Math.exp(-logit));
  
  // Confidence based on feature count
  const featureCount = Object.values(features).filter(v => v > 0).length;
  const maxFeatures = Object.keys(features).length;
  const confidence = Math.min(0.85, 0.4 + (featureCount / maxFeatures) * 0.45);
  
  // Dynamic threshold
  let threshold = options.threshold || 0.55;
  if (analysis.score >= 10) threshold = 0.45;
  else if (analysis.score <= 5) threshold = 0.65;
  if (regime.regime === 'trending') threshold = 0.50;
  if (regime.regime === 'ranging') threshold = 0.65;
  
  const pass = probability >= threshold;
  
  return {
    probability: Math.min(0.95, Math.max(0.05, probability)),
    confidence: Math.min(0.9, Math.max(0.3, confidence)),
    pass,
    threshold,
    features,
    signal: analysis.signal,
    recommendation: pass ? (analysis.signal || 'wait') : 'wait',
    sizeMultiplier: getSizeMultiplier(probability)
  };
}

// ─── TRAIN / UPDATE WEIGHTS ────────────────────────────────────────────────
function train(trades, analysisHistory) {
  const closed = trades.filter(t => t.outcome !== null).slice(-100);
  if (closed.length < 30) return null;
  
  const weights = { ...DEFAULT_WEIGHTS };
  
  // For each feature, calculate win rate difference
  const featureKeys = Object.keys(DEFAULT_WEIGHTS).filter(k => k !== 'intercept');
  
  for (const feat of featureKeys) {
    const withFeat = closed.filter(t => {
      if (typeof t[feat] === 'boolean') return t[feat] === true;
      if (typeof t[feat] === 'number') return t[feat] > 0.5;
      return false;
    });
    const withoutFeat = closed.filter(t => {
      if (typeof t[feat] === 'boolean') return t[feat] !== true;
      if (typeof t[feat] === 'number') return t[feat] <= 0.5;
      return true;
    });
    
    if (withFeat.length < 5 || withoutFeat.length < 5) continue;
    
    const wrWith = withFeat.filter(t => t.outcome === 'win').length / withFeat.length;
    const wrWithout = withoutFeat.filter(t => t.outcome === 'win').length / withoutFeat.length;
    const delta = wrWith - wrWithout;
    
    // Adjust weight with learning rate
    const adjustment = Math.min(0.1, Math.max(-0.1, delta * 0.3));
    weights[feat] = Math.max(-1, Math.min(1, (weights[feat] || 0) + adjustment));
  }
  
  // Adjust intercept based on overall win rate
  const overallWR = closed.filter(t => t.outcome === 'win').length / closed.length;
  const targetWR = 0.55;
  weights.intercept = (weights.intercept || 0) + (targetWR - overallWR) * 0.15;
  weights.intercept = Math.max(-2, Math.min(2, weights.intercept));
  
  // Save updated weights
  modelWeights = weights;
  saveModel(weights);
  
  return weights;
}

// ─── GET SIZE ADJUSTMENT ──────────────────────────────────────────────────
function getSizeMultiplier(probability) {
  if (probability > 0.70) return 1.3;
  if (probability > 0.60) return 1.1;
  if (probability > 0.50) return 1.0;
  if (probability > 0.40) return 0.85;
  return 0.7;
}

// ─── EXPORTS ────────────────────────────────────────────────────────────────
module.exports = {
  predict,
  train,
  extractFeatures,
  loadModel,
  saveModel,
  getSizeMultiplier,
  DEFAULT_WEIGHTS
};
