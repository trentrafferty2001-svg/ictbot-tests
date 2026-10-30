// src/ml/gold-model.js
const logger = require('../logger');
const fs = require('fs');
const path = require('path');
const { writeNamedState } = require('../state/writer');

// Every other persisted state file in this codebase (journal, zoneMemory,
// seasonality, bayesian weights, enhanced-learner state, xgboost model,
// dashboard metrics, ...) lives under /tmp, because that's the only
// reliably-writable path on the deploy target and it's what
// hydrateFromPostgres() in bot-engine.js knows how to restore after a
// redeploy wipes /tmp. This used to point at a __dirname-relative
// models/gold_model.json, which was inconsistent with that convention,
// likely unwritable in production, and wasn't backed up anywhere.
const MODEL_PATH = process.env.GOLD_MODEL_PATH || path.join('/tmp', 'gold_model.json');
const MODEL_STATE_KEY = 'goldModelState';

class GoldModel {
  constructor() {
    this.weights = null;
    this.intercept = null;
    this.features = ['score', 'adx', 'atrRatio', 'sessionScore', 'dxyAlign', 'hour'];
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(MODEL_PATH)) {
        const data = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
        this.weights = data.weights;
        this.intercept = data.intercept;
        this.features = data.features || this.features;
        this._history = Array.isArray(data.history) ? data.history : [];
        logger.info('[GoldModel] Loaded model from disk');
      } else {
        // Default dummy model: simple linear combo
        this.weights = { score: 0.1, adx: 0.01, atrRatio: -0.05, sessionScore: 0.05, dxyAlign: 0.03, hour: -0.02 };
        this.intercept = -0.5;
        this._history = [];
        logger.info('[GoldModel] Using default dummy model');
      }
    } catch (e) {
      logger.warn('[GoldModel] Failed to load model, using default');
      this.weights = { score: 0.1, adx: 0.01, atrRatio: -0.05, sessionScore: 0.05, dxyAlign: 0.03, hour: -0.02 };
      this.intercept = -0.5;
      this._history = [];
    }
  }

  // Called by bot-engine.js's hydrateFromPostgres(), the same way
  // enhancedLearner.reload() is, in case this instance was constructed
  // (at module-load time) before a fresh /tmp got restored from Postgres.
  reload() {
    this.load();
    logger.info('[GoldModel] State reloaded from disk (post-hydration).');
  }


  extractFeatures(analysis) {
    const sessionMap = { london: 1, ny_open: 1.2, ny: 0.8, ny_close: 0.5, tokyo: 0.5, off_hours: 0.2 };
    const sessionScore = sessionMap[analysis.session?.session] || 0.5;
    const dxyAlign = analysis.dxyTrend === 'bullish' ? 1 : analysis.dxyTrend === 'bearish' ? -1 : 0;
    const hour = new Date().getUTCHours();
    return {
      score: analysis.score || 5,
      adx: analysis.adxData?.adx || 20,
      atrRatio: analysis.regimeAtrRatio || 1,
      sessionScore,
      dxyAlign,
      hour: hour / 24 // normalize
    };
  }

  // Same feature set as extractFeatures(), but derived from a CLOSED journal
  // trade record (bot-engine.js journalTrade/journalClose) instead of a live
  // `analysis` object. The two have different shapes: a closed trade has
  // t.score and t.adx directly, but never saved a pre-computed atrRatio,
  // sessionScore, dxyAlign, or exact hour. Returns `null` for anything that
  // can't be honestly reconstructed rather than guessing — update() must
  // skip those features instead of nudging their weight from a fabricated
  // value.
  extractFeaturesFromClosedTrade(trade) {
    const sessionMap = { london: 1, ny_open: 1.2, ny: 0.8, ny_close: 0.5, tokyo: 0.5, off_hours: 0.2 };
    return {
      score: typeof trade.score === 'number' ? trade.score : null,
      adx: typeof trade.adx === 'number' ? trade.adx : null,
      atrRatio: null, // not saved on closed trades — regimeAtrRatio isn't journaled
      sessionScore: sessionMap[trade.session] ?? null,
      dxyAlign: null, // not saved on closed trades — dxyTrend isn't journaled
      hour: typeof trade.sessionHour === 'number' ? trade.sessionHour / 24 : null
    };
  }

  predict(analysis) {
    const features = this.extractFeatures(analysis);
    let linear = this.intercept;
    for (const [key, val] of Object.entries(features)) {
      if (this.weights[key] !== undefined) linear += this.weights[key] * val;
    }
    // Sigmoid
    const prob = 1 / (1 + Math.exp(-linear));
    const confidence = Math.min(0.9, 0.5 + Math.abs(prob - 0.5) * 2);
    return { probability: prob, confidence, features };
  }

  // Update model with new trade outcome (online learning).
  //
  // Approach: same win-rate-differential method already proven in
  // src/ml/predictor.js's train() elsewhere in this codebase, applied as a
  // small per-trade nudge instead of a full offline retrain. Keeps a
  // rolling window of recent (feature, outcome) pairs in memory; once there
  // are enough samples on both sides of a feature's median, compares the
  // win rate of trades above vs. below that median and nudges the
  // feature's weight a small step in that direction. This mirrors
  // predictor.js's withFeat/withoutFeat split, generalized from
  // boolean/binary features to gold-model.js's continuous ones (score,
  // adx, etc.) via an above/below-median split.
  update(trade, outcome) {
    if (!trade || (outcome !== 'win' && outcome !== 'loss')) {
      logger.debug('[GoldModel] update() skipped: invalid trade or outcome');
      return;
    }
    const features = this.extractFeaturesFromClosedTrade(trade);
    const isWin = outcome === 'win';

    if (!this._history) this._history = [];
    this._history.push({ features, isWin });
    if (this._history.length > 200) this._history = this._history.slice(-200);

    const MIN_SAMPLES_PER_SIDE = 10;
    const LEARNING_RATE = 0.05;
    const MAX_STEP = 0.05;

    let anyUpdated = false;
    for (const key of this.features) {
      const samples = this._history
        .map(h => ({ val: h.features[key], isWin: h.isWin }))
        .filter(s => s.val !== null && s.val !== undefined);
      if (samples.length < MIN_SAMPLES_PER_SIDE * 2) continue;

      const sorted = [...samples].sort((a, b) => a.val - b.val);
      const median = sorted[Math.floor(sorted.length / 2)].val;
      const above = samples.filter(s => s.val > median);
      const below = samples.filter(s => s.val <= median);
      if (above.length < MIN_SAMPLES_PER_SIDE || below.length < MIN_SAMPLES_PER_SIDE) continue;

      const wrAbove = above.filter(s => s.isWin).length / above.length;
      const wrBelow = below.filter(s => s.isWin).length / below.length;
      const delta = wrAbove - wrBelow; // positive => higher feature value associates with more wins

      const step = Math.min(MAX_STEP, Math.max(-MAX_STEP, delta * LEARNING_RATE));
      this.weights[key] = (this.weights[key] || 0) + step;
      anyUpdated = true;
    }

    // Nudge intercept toward the model's realized win rate over the window,
    // same target-win-rate approach predictor.js's train() uses.
    if (this._history.length >= MIN_SAMPLES_PER_SIDE * 2) {
      const overallWR = this._history.filter(h => h.isWin).length / this._history.length;
      const targetWR = 0.55;
      this.intercept = (this.intercept || 0) + (targetWR - overallWR) * 0.02;
      anyUpdated = true;
    }

    if (anyUpdated) {
      this.save();
      logger.info(`[GoldModel] Updated from ${outcome} trade. History: ${this._history.length}, intercept: ${this.intercept.toFixed(3)}`);
    } else {
      logger.debug(`[GoldModel] update() recorded trade but not enough samples yet to adjust weights (history: ${this._history.length})`);
    }
  }

  save() {
    const data = {
      weights: this.weights,
      intercept: this.intercept,
      features: this.features,
      history: this._history || []
    };
    try {
      const dir = path.dirname(MODEL_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(MODEL_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      logger.warn('[GoldModel] Failed to save model:', e.message);
    }
    writeNamedState(MODEL_STATE_KEY, data).catch(() => {});
  }
}

module.exports = { GoldModel, MODEL_PATH };

