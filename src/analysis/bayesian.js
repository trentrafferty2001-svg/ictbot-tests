// src/analysis/bayesian.js
const fs = require('fs');
const path = require('path');
const BAYESIAN_FILE = path.join('/tmp', 'bayesian_weights.json');

let _bayesianWeights = null;

function loadBayesianWeights() {
  if (_bayesianWeights) return _bayesianWeights;
  try {
    if (fs.existsSync(BAYESIAN_FILE)) {
      _bayesianWeights = JSON.parse(fs.readFileSync(BAYESIAN_FILE, 'utf8'));
      return _bayesianWeights;
    }
  } catch (e) {}
  _bayesianWeights = {
    fvg: { alpha: 1, beta: 1 },
    ob: { alpha: 1, beta: 1 },
    mss: { alpha: 1, beta: 1 },
    divergence: { alpha: 1, beta: 1 },
    pattern: { alpha: 1, beta: 1 },
    vsa: { alpha: 1, beta: 1 },
    breaker: { alpha: 1, beta: 1 },
    turtleSoup: { alpha: 1, beta: 1 },
    liquiditySweep: { alpha: 1, beta: 1 },
    macroTrend: { alpha: 1, beta: 1 }
  };
  return _bayesianWeights;
}

function saveBayesianWeights() {
  try {
    fs.writeFileSync(BAYESIAN_FILE, JSON.stringify(_bayesianWeights, null, 2));
  } catch (e) {}
}

function updateBayesianWeights(trade, outcome) {
  const weights = loadBayesianWeights();
  const hitMap = {
    fvg: trade.nestedFVG || false,
    ob: trade.tripleZone || (trade.hits && trade.hits.some(h => h.includes('OB'))),
    mss: trade.mssType && trade.mssType !== 'none',
    divergence: trade.divergence && trade.divergence !== 'none',
    pattern: trade.pattern && trade.pattern !== 'none',
    vsa: trade.vsaConfirms || false,
    breaker: trade.hasBreaker || false,
    turtleSoup: trade.turtleSoup || false,
    liquiditySweep: trade.liquiditySweep || false,
    macroTrend: trade.macroTrend || false
  };
  for (const [factor, present] of Object.entries(hitMap)) {
    if (present && weights[factor]) {
      if (outcome === 'win') weights[factor].alpha += 1;
      else weights[factor].beta += 1;
    }
  }
  saveBayesianWeights();
}

function getBayesianFactorWeight(factor) {
  const weights = loadBayesianWeights();
  if (!weights[factor]) return 0.5;
  const { alpha, beta } = weights[factor];
  return alpha / (alpha + beta);
}

module.exports = { loadBayesianWeights, updateBayesianWeights, getBayesianFactorWeight };
