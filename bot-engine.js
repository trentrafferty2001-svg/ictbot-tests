// ════════════════════════════════════════════════════════════════════════════
//  ICT GOLD BOT PRO — bot-engine.js  v34.1 (MAX 3 TRADES, NO PAUSE)
//  FIXES: max 3 positions, no loss-pause, margin check, single order per signal.
//  All external fetches use timeouts; portfolioRiskResult fixed.
// ════════════════════════════════════════════════════════════════════════════
console.log('✅ bot-engine.js loading... (v34.1 - MAX 3 TRADES, NO PAUSE)');
'use strict';

// ─── CORE IMPORTS ──────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { Worker } = require('worker_threads');
const { logger } = require('./src/logger');
const { writeState, CRITICAL_FIELDS, readNamedState, writeNamedState } = require('./src/state/writer');
const { OrderFlowAnalyzer } = require('./src/analysis/order-flow-analyzer');
const { CorrelationAnalyzer } = require('./src/analysis/correlation-analyzer');
const { SeasonalityAnalyzer } = require('./src/analysis/seasonality-analyzer');
const { getTopDownAlignment } = require('./src/analysis/top-down-alignment');
const { getDirectionBias, updateDirectionStats, hydrate: hydrateDirectionBias } = require('./src/analysis/direction-bias');
const { sendTelegram } = require('./src/alerts/manager');
const alertDigest = require('./src/alerts/digest');
const { calculateLotSize, MAX_RISK_PCT } = require('./src/risk/position-sizing');
const { getKellyRisk, getKellyRiskFromTrades, blendKellyWithRisk } = require('./src/risk/kelly');
const { checkDailyLossLimit, checkMonthlyLossLimit } = require('./src/risk/loss-limits');
const advancedRisk = require('./src/risk/advanced-risk');
const { evaluateTradeQuality } = require('./src/filters/trade-quality');
const { autoOptimize } = require('./src/optimization/auto-optimizer');
const { checkCorrelation } = require('./src/filters/correlation');
const { calculateAdaptiveTP } = require('./src/risk/adaptive-tp');
const { analyzeSentiment, analyzeSentimentBatch } = require('./src/analysis/sentiment-advanced');
const { getRegimeParams } = require('./src/config/regime-params');
const { validateSignal, retrainModel } = require('./src/ml/validator');
const { detectHarmonicPatterns } = require('./src/indicators/harmonic');
const { checkCOT } = require('./src/analysis/cot');
const { runGeneticOptimization } = require('./src/optimization/genetic');
const { detectSqueeze } = require('./src/filters/squeeze');
const { getDynamicTrail, shouldTimeExit } = require('./src/risk/advanced-exit');
const vsa = require('./src/indicators/vsa'), breaker = require('./src/indicators/breaker');
const advancedRiskLib = require('./src/risk/advanced'), backtestDB = require('./src/db/backtest');
const { detectRegimeAdvanced } = require('./src/analysis/regime');
const { detectPatterns: detectCandlestickPatterns } = require('./src/analysis/patterns');
const { getAdaptiveParams } = require('./src/optimization/adaptive'), { MetricsCollector } = require('./src/utils/metrics');
const { getRelaxedParams } = require('./src/optimization/gate-relaxer');
const { analyzeScalp } = require('./src/strategies/scalper');
const { getFrequencyAdjustedParams } = require('./src/optimization/trade-frequency-manager');
const indicators = require('./src/indicators');

// ─── OTHER IMPORTS ──────────────────────────────────────────────────────────
const { predict, getSizeMultiplier, train, loadModel, saveModel } = require('./src/ml/predictor');
const { detectLiquidityPools, isLiquiditySweep } = require('./src/analysis/liquidity-pools');
const { detectTurtleSoup, getTurtleSoupEntry } = require('./src/analysis/turtle-soup');
const { getDynamicStop, getICTStop } = require('./src/risk/dynamic-stops');
const { validateWinRate, validateStrategy } = require('./src/optimization/statistical-validator');
const { analyzeMacroTrend, getMacroBias } = require('./src/analysis/macro-trend');

// ─── NEW ENHANCEMENT IMPORTS ──────────────────────────────────────────────
const { OrderBookAnalyzer } = require('./src/analysis/order-book');
const { FlowDetector } = require('./src/analysis/flow-detector');
const { IntermarketAdvanced } = require('./src/analysis/intermarket-advanced');
const { NewsSentimentNLP } = require('./src/analysis/news-sentiment-nlp');
const { ETFFlows } = require('./src/analysis/etf-flows');
const { OptionsPositioning } = require('./src/analysis/options-positioning');
const { EconomicCalendar } = require('./src/analysis/economic-calendar');
const { SeasonalityAdvanced } = require('./src/analysis/seasonality-advanced');
const { PortfolioRiskManager } = require('./src/risk/portfolio-risk');
const { RecoveryManager } = require('./src/risk/recovery-manager');
const { RLParamOptimizer } = require('./src/optimization/rl-params');
const { BayesianOptimizer } = require('./src/optimization/bayesian-opt');
const { BacktestRunner } = require('./src/optimization/backtest-runner');
const { XGBoostModel } = require('./src/ml/xgboost-model');
const { Dashboard } = require('./src/monitoring/dashboard');
const { ForwardValidator } = require('./src/testing/forward-validator');
const { TWAPExecutor } = require('./src/execution/twap');
const { VWAPExecutor } = require('./src/execution/vwap');
const { IcebergExecutor } = require('./src/execution/iceberg');

// ─── ENHANCED LEARNER ──────────────────────────────────────────────────────
const { EnhancedLearner, STATE_FILE: ENHANCED_LEARNER_STATE_FILE } = require('./src/learning/enhanced-learning');

// ─── NEW IMPORTS WITH FALLBACKS ──────────────────────────────────────────
let COTAnalyzer, MacroFactors, IntermarketAnalyzer, RegimeHMM, GoldModel, NewsSentimentAdvanced, GOLD_MODEL_STATE_FILE;
try {
  COTAnalyzer = require('./src/analysis/cot-analyzer').COTAnalyzer;
} catch (e) {
  COTAnalyzer = class { async getPositioning() { return { signal: 'neutral', confidence: 0, description: 'COT disabled' }; } };
}
try {
  MacroFactors = require('./src/analysis/macro-factors').MacroFactors;
} catch (e) {
  MacroFactors = class { async getSignal() { return { bias: 'neutral', confidence: 0, description: 'Macro disabled' }; } };
}
try {
  IntermarketAnalyzer = require('./src/analysis/intermarket').IntermarketAnalyzer;
} catch (e) {
  IntermarketAnalyzer = class { async getDivergence() { return { signal: 'neutral', confidence: 0, description: 'Intermarket disabled' }; } };
}
try {
  RegimeHMM = require('./src/analysis/regime-hmm').RegimeHMM;
} catch (e) {
  RegimeHMM = class { async detect() { return { regime: 'normal', confidence: 0.5 }; } getRecommendation() { return { minScore:3, riskMult:1, rr:1.5, maxT:12 }; } };
}
try {
  const gm = require('./src/ml/gold-model');
  GoldModel = gm.GoldModel;
  GOLD_MODEL_STATE_FILE = gm.MODEL_PATH;
} catch (e) {
  GoldModel = class { async predict() { return { probability:0.5, confidence:0.5 }; } update() {} };
  GOLD_MODEL_STATE_FILE = '/tmp/gold_model.json';
}
try {
  NewsSentimentAdvanced = require('./src/analysis/news-sentiment-advanced').NewsSentimentAdvanced;
} catch (e) {
  NewsSentimentAdvanced = class { async getSignal() { return { bias: 'neutral', confidence:0, description: 'News disabled' }; } };
}

// ─── MODULE IMPORTS WITH FALLBACKS ──────────────────────────────────────
let computeTrendScore, donchian, ichimoku, chandelierExit, computeTrendQuality,
    volatilityFilter, exhaustionFilter, newsImpactFilter, updateBayesianWeights, getBayesianFactorWeight,
    BAYESIAN_WEIGHTS_FILE;

try {
  const trendScore = require('./src/analysis/trend-score');
  computeTrendScore = trendScore.computeTrendScore;
} catch (e) {
  computeTrendScore = function(candlesByTF) {
    const weights = { d1: 0.4, h4: 0.3, h1: 0.2, m30: 0.1 };
    let score = 0, totalWeight = 0;
    for (const [tf, candles] of Object.entries(candlesByTF)) {
      if (!candles || candles.length < 20) continue;
      const closes = candles.slice(-20).map(c => c.close);
      const n = closes.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < n; i++) { sumX += i; sumY += closes[i]; sumXY += i * closes[i]; sumX2 += i * i; }
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const dir = slope > 0.0001 ? 1 : slope < -0.0001 ? -1 : 0;
      const strength = Math.min(1, Math.abs(slope) / 0.001);
      const weight = weights[tf] || 0.1;
      totalWeight += weight;
      score += dir * strength * weight;
    }
    if (totalWeight === 0) return { score: 0, direction: 'neutral' };
    score = score / totalWeight * 10;
    const direction = score > 1 ? 'bullish' : score < -1 ? 'bearish' : 'neutral';
    return { score, direction };
  };
}
try {
  const donch = require('./src/indicators/donchian');
  donchian = donch.donchian;
} catch (e) {
  donchian = function(candles, period) {
    if (candles.length < period) return { high: 0, low: 0, mid: 0, breakHigh: false, breakLow: false };
    const slice = candles.slice(-period);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    const last = candles[candles.length - 1];
    return { high, low, mid: (high+low)/2, breakHigh: last.close > high, breakLow: last.close < low };
  };
}
try {
  const ichi = require('./src/indicators/ichimoku');
  ichimoku = ichi.ichimoku;
} catch (e) {
  ichimoku = function(candles) {
    if (candles.length < 52) return { tenkan:0, kijun:0, senkouA:0, senkouB:0, cloudBull:false, priceAboveCloud:false };
    const high = candles.map(c => c.high), low = candles.map(c => c.low);
    const tenkan = (Math.max(...high.slice(-9)) + Math.min(...low.slice(-9))) / 2;
    const kijun = (Math.max(...high.slice(-26)) + Math.min(...low.slice(-26))) / 2;
    const senkouA = (Math.max(...high.slice(-52)) + Math.min(...low.slice(-52))) / 2;
    const senkouB = (Math.max(...high.slice(-26)) + Math.min(...low.slice(-26))) / 2;
    const price = candles[candles.length - 1].close;
    return { tenkan, kijun, senkouA, senkouB, cloudBull: senkouA > senkouB, priceAboveCloud: price > senkouA && price > senkouB, tenkanAboveKijun: tenkan > kijun, tenkanBelowKijun: tenkan < kijun };
  };
}
try {
  const chandel = require('./src/indicators/chandelier');
  chandelierExit = chandel.chandelierExit;
} catch (e) {
  chandelierExit = function(candles, atr) {
    if (candles.length < 22) return { longStop: 0, shortStop: 0 };
    const highs = candles.slice(-22).map(c => c.high);
    const lows = candles.slice(-22).map(c => c.low);
    const highestHigh = Math.max(...highs);
    const lowestLow = Math.min(...lows);
    return { longStop: highestHigh - atr * 3, shortStop: lowestLow + atr * 3 };
  };
}
try {
  const sizing = require('./src/risk/trend-sizing');
  computeTrendQuality = sizing.computeTrendQuality;
} catch (e) {
  computeTrendQuality = function(analysis, candlesByTF) {
    let score = 0;
    if (analysis.adxData && analysis.adxData.adx > 40) score += 40;
    else if (analysis.adxData && analysis.adxData.adx > 25) score += 20;
    const trend = computeTrendScore(candlesByTF);
    if (trend.direction === analysis.signal) score += Math.min(30, Math.abs(trend.score) * 2);
    else if (trend.direction !== 'neutral') score -= 10;
    if (analysis.volumeProfile && analysis.volumeProfile.buyVolumeRatio) {
      const ratio = analysis.volumeProfile.buyVolumeRatio;
      if ((analysis.signal === 'buy' && ratio > 0.55) || (analysis.signal === 'sell' && ratio < 0.45)) score += 10;
    }
    return Math.min(100, Math.max(0, score));
  };
}
try {
  const vol = require('./src/filters/volatility');
  volatilityFilter = vol.volatilityFilter;
} catch (e) {
  // Kept in sync with src/filters/volatility.js's self-calibrating version
  // (fixed 2026-08-19) — this only runs if that require() fails, but should
  // never silently reintroduce the old miscalibrated absolute-threshold
  // block if it does.
  volatilityFilter = function(atr, price, priorAtrs) {
    if (Array.isArray(priorAtrs) && priorAtrs.length >= 5) {
      const avg = priorAtrs.reduce((a, b) => a + b, 0) / priorAtrs.length;
      const ratio = avg > 0 ? atr / avg : 1;
      if (ratio < 0.3) return { pass: false, reason: `ATR ${(ratio * 100).toFixed(0)}% of its own recent average – too quiet relative to normal` };
      if (ratio > 2.5) return { pass: true, sizeMultiplier: 0.5, reason: 'ATR well above its own recent average – size halved' };
      return { pass: true, sizeMultiplier: 1, reason: 'Normal volatility' };
    }
    const ratio = atr / price;
    if (ratio < 0.005) return { pass: true, sizeMultiplier: 0.7, reason: 'ATR < 0.5% of price (no history available to calibrate properly) – size reduced, not blocked' };
    return { pass: true, sizeMultiplier: 1, reason: 'Normal volatility (uncalibrated fallback)' };
  };
}
try {
  const exh = require('./src/filters/exhaustion');
  exhaustionFilter = exh.exhaustionFilter;
} catch (e) {
  exhaustionFilter = function(candles, signal) {
    if (candles.length < 15) return { pass: true, sizeMultiplier: 1, reason: 'OK' };
    const closes = candles.map(c => c.close);
    let gains = 0, losses = 0;
    for (let i = 1; i < 15; i++) {
      const diff = closes[i] - closes[i-1];
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / 14, avgLoss = losses / 14;
    for (let i = 15; i < closes.length; i++) {
      const diff = closes[i] - closes[i-1];
      if (diff >= 0) avgGain = (avgGain * 13 + diff) / 14;
      else avgLoss = (avgLoss * 13 - diff) / 14;
    }
    const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    if (signal === 'buy' && rsi > 70) return { pass: false, reason: 'RSI overbought (>70)' };
    if (signal === 'sell' && rsi < 30) return { pass: false, reason: 'RSI oversold (<30)' };
    return { pass: true, sizeMultiplier: 1, reason: 'OK' };
  };
}
try {
  const news = require('./src/filters/news-impact');
  newsImpactFilter = news.newsImpactFilter;
} catch (e) {
  newsImpactFilter = function(events) {
    const now = Date.now();
    const before = 30 * 60 * 1000, after = 15 * 60 * 1000;
    for (const e of events || []) {
      try {
        const t = new Date(e.date).getTime();
        if (isNaN(t)) continue;
        if (now >= t - before && now <= t + after) {
          return { blocked: true, event: e.title || e.name, minutesUntil: Math.max(0, (t - now) / 60000) };
        }
      } catch (_) {}
    }
    return { blocked: false, minutesUntil: Infinity };
  };
}
try {
  const bayes = require('./src/analysis/bayesian');
  updateBayesianWeights = bayes.updateBayesianWeights;
  getBayesianFactorWeight = bayes.getBayesianFactorWeight;
  BAYESIAN_WEIGHTS_FILE = bayes.BAYESIAN_FILE;
} catch (e) {
  updateBayesianWeights = function(trade, outcome) {};
  getBayesianFactorWeight = function(factor) { return 0.5; };
  BAYESIAN_WEIGHTS_FILE = '/tmp/bayesian_weights.json';
}

let mlModule = null;
try { mlModule = require('./src/ml/predictor'); } catch (e) { /* optional */ }

if (!global._metrics) global._metrics = new MetricsCollector();
const metrics = global._metrics;
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

// ─── DRY RUN MODE ──────────────────────────────────────────────────────────
const DRY_RUN = process.env.DRY_RUN === 'true';
if (DRY_RUN) logger.warn('⚠️ DRY RUN MODE ENABLED – no real trades will be placed');

// ─── EXPLICIT LOT SIZE CEILING ──────────────────────────────────────────────
// Added 2026-07-30 at Trent's request, after confirming his current pattern
// (single trade at a time, ~0.03 lots, currently profitable) is working and
// he wants it protected — not because 0.03 was ever a fixed setting (it's an
// emergent result of balance/risk%/slDist in calculateLotSize), but so a
// good streak, a scoring change, or anything else feeding the risk
// multiplier chain in placeTrade can't silently push size meaningfully
// higher without a visible ceiling in the way. Deliberately set with some
// headroom above the observed ~0.03 (not locked exactly to it) so a
// genuinely stronger setup can still size up somewhat — this is a judgment
// call on the exact number, not derived from anything in the code, and
// should be revisited if Trent's balance or risk tolerance changes.
const MAX_LOT_SIZE_CEILING = 0.05;

// ─── ML RETRAINING CONFIG ──────────────────────────────────────────────────
const ML_RETRAIN_CONFIG = {
    autoRetrainAfterTrades: 20,
    minTradesForRetrain: 30,
    maxRetrainHistory: 200,
    lastRetrainTradeCount: 0,
};

// ─── RATE LIMITER ──────────────────────────────────────────────────────────
class RateLimiter {
    constructor(options = {}) {
        this.maxRequestsPerMinute = options.maxRequestsPerMinute || 25;
        this.maxRequestsPerSecond = options.maxRequestsPerSecond || 2;
        this.requests = [];
        this.queue = [];
        this.processing = false;
        this.minDelay = options.minDelay || 400;
    }

    async wait() {
        const now = Date.now();
        this.requests = this.requests.filter(t => now - t < 60000);
        if (this.requests.length >= this.maxRequestsPerMinute) {
            const oldest = this.requests[0];
            const waitTime = 60000 - (now - oldest) + 200;
            if (DEBUG) logger.debug(`[RateLimiter] Rate limit reached, waiting ${waitTime}ms`);
            await this.delay(waitTime);
            return this.wait();
        }
        const lastSecond = this.requests.filter(t => now - t < 1000);
        if (lastSecond.length >= this.maxRequestsPerSecond) {
            await this.delay(150);
            return this.wait();
        }
        this.requests.push(now);
        return;
    }

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    async execute(fn) {
        await this.wait();
        return fn();
    }
}

const globalRateLimiter = new RateLimiter({
    maxRequestsPerMinute: 25,
    maxRequestsPerSecond: 2,
    minDelay: 400
});

// ─── EXTERNAL API RATE LIMITER & CACHE (fix for 429 errors) ──────────────
const externalRateLimiter = new RateLimiter({
    maxRequestsPerMinute: 30,
    maxRequestsPerSecond: 2,
    minDelay: 500
});

const _externalCache = {};
const _externalCacheTime = {};

async function cachedExternalFetch(key, fetchFn, ttl = 300000, maxRetries = 2, defaultValue = null) {
    const now = Date.now();
    if (_externalCache[key] && now - _externalCacheTime[key] < ttl) {
        return _externalCache[key];
    }
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await externalRateLimiter.wait();
            const result = await Promise.race([
                fetchFn(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('fetch_timeout')), 5000))
            ]);
            _externalCache[key] = result;
            _externalCacheTime[key] = now;
            return result;
        } catch (err) {
            lastError = err;
            const msg = err.message || String(err);
            if (msg.includes('429')) {
                const wait = Math.min(10000, Math.pow(2, attempt) * 2000);
                logger.warn(`[cachedFetch] 429 for ${key}, backing off ${wait}ms (attempt ${attempt+1}/${maxRetries})`);
                await sleep(wait);
            } else {
                break;
            }
        }
    }
    logger.warn(`[cachedFetch] Failed for ${key} after ${maxRetries} attempts: ${lastError ? lastError.message : 'unknown'}, using default`);
    return _externalCache[key] || defaultValue;
}

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const ELITE_CONFIG = {
    vwapExecution: { enabled: false, minLotsForVWAP: 999, slices: 1, sliceIntervalMs: 500, maxSlippagePct: 0.005 },
    icebergOrders: { enabled: false, minLotsForIceberg: 999, displaySize: 0.2, refreshIntervalMs: 3000 },
    smartStops: { enabled: true, liquidityBufferPips: 0.3, avoidObviousLevels: true, useATRMultiplier: 0.5 },
    optimalTimes: { enabled: false, windows: [], avoidNewsWindows: false, newsBufferMinutes: 30 },
    smartSizing: { enabled: true, useKelly: true, useVolatilityAdjusted: true, maxRiskPerTrade: 0.03, minRiskPerTrade: 0.005, kellyFraction: 0.3 },
    riskRebalancing: { enabled: false, checkIntervalMs: 60000, maxPortfolioRisk: 0.05, correlationThreshold: 0.6 },
    mlOptimization: { enabled: true, useForEntry: true, useForExit: false, minConfidence: 0.55 },
    eliteExits: { enabled: true, useVolatilityTrailing: true, useTimeBasedExits: true, usePartialScaleOut: true, scaleOutLevels: [0.5, 0.8, 1.2, 1.8, 2.5], scaleOutSizes: [0.2, 0.2, 0.2, 0.2, 0.2] },
    rlTrading: { enabled: false, learningRate: 0.1, discountFactor: 0.95, epsilon: 0.1 },
    bayesian: { enabled: false, minConfidence: 0.3 },
    darkPool: { enabled: false, confidenceThreshold: 0.3 },
    strategyDiscovery: { enabled: false, lookbackDays: 14, minTrades: 20 },
    volumePrediction: { enabled: false, confidenceThreshold: 0.3 },
    hedging: { enabled: false, hedgeRatio: 0.5, maxHedgeSize: 0.5 },
    microstructure: { enabled: true, analysisInterval: 60000 },
    executionOptimization: { enabled: true, minConfidence: 0.4 },
    riskCalibration: { enabled: true, calibrationInterval: 3600000 }
};

let configImports;
try { configImports = require('./src/config/defaults'); } catch (e) { logger.warn('Failed to load defaults.js:', e.message); configImports = {}; }

// CONFLUENCE_WEIGHTS and SESSION_FACTORS (below) are deliberately defined
// HERE, not read from src/config/defaults.js. On 2026-08-27 both were
// switched to read defaults.js on the theory that the config file was the
// tuned source of truth. That was wrong: defaults.js is the OLDER copy
// (header "v23.0"; it lacks keys these literals have — turtleSoup,
// liquiditySweep, macroTrend, winRateThreshold, sizeMultiplier), and its
// per-session minScore values (6-10) act as a hard FLOOR on the live trade
// threshold (contextFloor in _runCycleInner), raising it from ~4/12 to
// 6-10/12 depending on session — choking off most trades. Reverted
// 2026-10-23 to the values the bot had been running with before that
// change. defaults.js's copies of these two are not used by the live bot
// (src/backtest/index.js still reads its CONFLUENCE_WEIGHTS for backtests).
let CONFLUENCE_WEIGHTS = {
    killZone: 1, silverBullet: 1, fullMTFAlign: 1.5, fvg: 1, ob: 1, mss: 1.5,
    liqSweep: 1, htfBias: 1, ote: 1.5, tripleZone: 1.5, divergence: 1, pattern: 1,
    absorption: 1, adxTrending: 1, adxRanging: 0, vsaBullish: 1, vsaBearish: 1,
    breakerBlock: 1, inverseFVG: 1, candlePattern: 1, newsBullish: 1, newsBearish: -1,
    turtleSoup: 1.5, liquiditySweep: 1.2, macroTrend: 1.8
};

const SWING_CONFIG = configImports.SWING_CONFIG || { windowSize: 3, minMovePct: 0.1, maxSwings: 12 };
const MSS_CONFIG = configImports.MSS_CONFIG || { breakThreshold: 0.05 };
const OB_CONFIG = configImports.OB_CONFIG || { zoneTolerancePct: 0.2 };

// See the note above CONFLUENCE_WEIGHTS: reverted 2026-10-23 to the values
// the bot ran with before 2026-08-27 (minScore here is a floor, so the
// defaults.js values of 6-10 blocked most setups). `skip` is still honoured
// in runFullAnalysis if ever set to true; getSessionContext never actually
// returns 'off_hours' (every hour maps to a named session), so that entry
// is effectively unused either way.
const SESSION_FACTORS = {
    off_hours: { volatility: 0.3, minScore: 3, skip: false, bias: 'neutral', winRateThreshold: 0.35, sizeMultiplier: 0.5 },
    london: { volatility: 1.5, minScore: 2, skip: false, bias: 'bullish', winRateThreshold: 0.45, sizeMultiplier: 1.2 },
    london_mid: { volatility: 1, minScore: 2, skip: false, bias: 'neutral', winRateThreshold: 0.40, sizeMultiplier: 1.0 },
    ny_open: { volatility: 1.2, minScore: 2, skip: false, bias: 'bullish', winRateThreshold: 0.50, sizeMultiplier: 1.3 },
    ny: { volatility: 0.8, minScore: 2, skip: false, bias: 'neutral', winRateThreshold: 0.40, sizeMultiplier: 1.0 },
    ny_close: { volatility: 0.7, minScore: 2, skip: false, bias: 'bearish', winRateThreshold: 0.35, sizeMultiplier: 0.8 },
    tokyo: { volatility: 0.6, minScore: 2, skip: false, bias: 'neutral', winRateThreshold: 0.35, sizeMultiplier: 0.7 },
    asian_mid: { volatility: 0.4, minScore: 3, skip: false, bias: 'neutral', winRateThreshold: 0.30, sizeMultiplier: 0.5 },
    sydney: { volatility: 0.4, minScore: 3, skip: false, bias: 'neutral', winRateThreshold: 0.30, sizeMultiplier: 0.5 },
    pre_london: { volatility: 0.5, minScore: 2, skip: false, bias: 'neutral', winRateThreshold: 0.35, sizeMultiplier: 0.7 }
};

const WORKER_CONFIG = configImports.WORKER_CONFIG || { maxWorkers: 2, workerTimeoutMs: 30000, idleTimeoutMs: 300000, cleanupIntervalMs: 60000 };

const POSITION_CONFIG = configImports.POSITION_CONFIG || {
    maxRiskPct: 2.5,
    minLotForSplit: 0.03,
    partialCloseThreshold: 0.25,
    tp1ProfitPct: 0.3,
    tp2ProfitPct: 0.6,
    tp3ProfitPct: 1.0,
    beThreshold: 0.1,
    trailActivation: 0.2,
    maxHoldHours: 36,
    highConvictionTP1: 0.5,
    highConvictionTP2: 1.0,
    highConvictionTP3: 1.5,
    lowConvictionTP1: 0.25,
    lowConvictionTP2: 0.5,
    lowConvictionTP3: 0.8,
    // Step-trail: once breakeven is reached, ratchet the SL forward by
    // stepTrailPoints every time price advances a further stepTrailPoints
    // beyond the last captured step. Added 2026-07-31 at Trent's request
    // ("increase the breakeven each time the market moves a certain
    // amount of points"). Distinct from Chandelier (volatility-band,
    // normal/sniper only, pct>0.3) — this is a simple, predictable,
    // fixed-point ladder that applies across all durations once BE is hit.
    stepTrailPoints: 3,
    stepTrailBuffer: 0.5
};

const VSA_CONFIG = configImports.VSA_CONFIG || { volumeMAPeriod: 20, highVolumeThreshold: 1.5, lowVolumeThreshold: .5, climaxVolumeThreshold: 3, absorptionCandles: 3, minConfidence: 60 };
const BREAKER_CONFIG = configImports.BREAKER_CONFIG || { maxAge: 30, minQuality: 3, activationDistance: 2 };
const ADVANCED_RISK_CONFIG = configImports.ADVANCED_RISK_CONFIG || { partialLevels: [1, 2, 3], partialVolumes: [.3, .3, .4], maxHoldHours: 36, beThreshold: .1, trailActivation: .2, minTrailDistance: .005, kellyMinRisk: .1, kellyMaxRisk: 3, dailyLossLimit: 5, monthlyLossLimit: 10, maxDailyTrades: 20 };
const GATE_RELAXER_CONFIG = configImports.GATE_RELAXER_CONFIG || { idleHoursThreshold: 4, idleHoursHard: 24, minScoreFloor: 2, highScoreThreshold: 8 };
const SCALPER_CONFIG = configImports.SCALPER_CONFIG || { activeSessions: ['london', 'ny_open', 'ny'], minScore: 2, stopMultiplier: .2, takeMultiplier: 0.7, freshCandles: 2 };
const FREQUENCY_CONFIG = configImports.FREQUENCY_CONFIG || { dailyTarget: 10, lookbackDays: 7, minDaysForAdjustment: 3, riskAdjustFactor: .15 };
const STREAK_CONFIG = configImports.STREAK_CONFIG || {
    consecLossesToPause: 999,   // effectively disabled
    pauseDurationHours: 1,
    reduceRiskAfterLossStreak: 3,
    riskReductionFactor: 0.5,
    reduceRiskAfter4Losses: 0.25,
    reduceRiskAfter5Losses: 0.1
};
const M1_ENTRY_CONFIG = configImports.M1_ENTRY_CONFIG || { enabled: true, maxWaitCandles: 3, pullbackDepth: .382 };
const TIME_FILTER_CONFIG = configImports.TIME_FILTER_CONFIG || { allowedSessions: null, allowedHours: null, blockWeekend: false, avoidSessionStartMinutes: 15 };

const RISK_CONFIG = configImports.RISK_CONFIG || {
    baseRiskPct: 1.5,
    maxRiskPct: 2.5,
    volatileRegimeRiskFactor: .4,
    highConvictionBonus: 1.2,
    lossReductionFactor: .5,
    winIncreaseFactor: 1.05,
    lowVolatilitySizeIncrease: 1.2,
    highVolatilitySizeDecrease: 0.6,
    newsSizeDecrease: 0.5
};

let QUALITY_CONFIG = configImports.QUALITY_CONFIG || { minQualityScore: 2, useJournalWeights: true, similarityLookback: 30, minSimilarWinRate: .40 };
const VOLATILITY_CONFIG = configImports.VOLATILITY_CONFIG || { maxATRRatio: 4, minATRRatio: .2 };
const MACD_CONFIG = configImports.MACD_CONFIG || { fast: 12, slow: 26, signal: 9 };
const EMA_CONFIG = configImports.EMA_CONFIG || { periods: [20, 50, 200] };
const ADVANCED_RISK = configImports.ADVANCED_RISK || { useKelly: true, useAntiMartingale: true, maxDailyLossPct: 8, maxMonthlyLossPct: 15, maxConsecutiveLosses: 5, coolDownAfterLoss: 2 };
const TRADE_QUALITY_FILTERS = configImports.TRADE_QUALITY_FILTERS || { requireHTFAlignment: false, requireVolumeConfirmation: false, requireNewsAlignment: false, requireSeasonality: true, minSimilarWinRate: .40, maxSpreadMultiplier: 2 };
const AUTO_OPTIMIZER = configImports.AUTO_OPTIMIZER || { enabled: true, intervalHours: 12, lookbackDays: 14, optimizeWeights: true, optimizeThresholds: true };

if (typeof global._sendTelegram !== 'function') global._sendTelegram = function(t) { logger.warn('_sendTelegram called before wired up: ' + String(t).slice(0, 120)); };

const JOURNAL_PATH = process.env.JOURNAL_PATH || path.join('/tmp', 'ict_trade_journal.json');
const ZONE_MEMORY_FILE = process.env.ZONE_MEMORY_FILE || path.join('/tmp', 'zone_memory.json');
const TP_FIX_STATE_FILE = process.env.TP_FIX_STATE_FILE || path.join('/tmp', 'tp_fix_state.json');
const SEASONALITY_FILE = process.env.SEASONALITY_FILE || path.join('/tmp', 'seasonality.json');
const AB_TESTING_FILE = process.env.AB_TESTING_FILE || path.join('/tmp', 'ab_testing.json');
const ERROR_CACHE_FILE = process.env.ERROR_CACHE_FILE || path.join('/tmp', 'error_cache.json');
const COUNTERFACTUAL_FILE = process.env.COUNTERFACTUAL_FILE || path.join('/tmp', 'counterfactuals.json');

// ─── STARTUP HYDRATION ──────────────────────────────────────────────────────
const _HYDRATE_MAP = [
    ['journal', JOURNAL_PATH],
    ['zoneMemory', ZONE_MEMORY_FILE],
    ['tpFixState', TP_FIX_STATE_FILE],
    ['seasonality', SEASONALITY_FILE],
    ['abTesting', AB_TESTING_FILE],
    ['enhancedLearnerState', ENHANCED_LEARNER_STATE_FILE],
    ['bayesianWeights', BAYESIAN_WEIGHTS_FILE],
    ['goldModelState', GOLD_MODEL_STATE_FILE],
    ['counterfactuals', COUNTERFACTUAL_FILE],
];
async function hydrateFromPostgres() {
    let restored = [];
    // v1 freezes learning, and the replay runs these three models at their
    // defaults. Restoring older learned weights from the database would make
    // live v1 score trades differently from what was tested, so under v1 they
    // stay at their defaults (as they effectively always did: until
    // 2026-10-24 nothing was ever restored, see src/state/writer.js).
    const v1Skip = v1On() ? new Set(['enhancedLearnerState', 'bayesianWeights', 'goldModelState']) : null;
    for (const [key, filePath] of _HYDRATE_MAP) {
        if (v1Skip && v1Skip.has(key)) continue;
        try {
            // A local file existing isn't proof it's current. JOURNAL_PATH
            // (and friends) default to /tmp, which most hosting platforms
            // wipe on every restart/redeploy — so "file exists" is true
            // again moments after boot, as soon as anything calls
            // saveJournal(), but with an EMPTY trades array. That shadowed
            // the real Postgres backup below and made hydration a no-op
            // exactly when it mattered: after a restart mid-trading-day,
            // the journal would silently report zero trades for the day
            // even though the broker had placed dozens. Fixed 2026-08-13 —
            // for the journal specifically, treat present-but-empty the
            // same as missing, and only restore from Postgres if it
            // actually has more data than the local copy.
            if (fs.existsSync(filePath)) {
                if (key !== 'journal') continue;
                try {
                    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (existing && Array.isArray(existing.trades) && existing.trades.length > 0) continue;
                } catch (e) { /* unreadable/corrupt local file — fall through and try to restore */ }
            }
            const data = await readNamedState(key);
            if (data !== null && data !== undefined) {
                if (key === 'journal' && (!data.trades || data.trades.length === 0)) continue;
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                restored.push(key);
            }
        } catch (e) {
            logger.warn(`[hydrate] restore failed for ${key}:`, e.message);
        }
    }
    if (restored.length) logger.info('[hydrate] Restored from Postgres: ' + restored.join(', ') + (v1Skip ? ' (v1: learning models kept at their frozen defaults)' : ''));
    else logger.info('[hydrate] Nothing to restore (local files present, or no Postgres backup yet)');

    // enhancedLearner is constructed at module-load time (see `let
    // enhancedLearner = new EnhancedLearner()` below), which happens BEFORE
    // this function runs — so if its file was just restored above, the
    // in-memory instance is still holding the stale/empty state it read at
    // construction. Reload it now so the rest of this cycle (and every
    // cycle after) actually sees the restored data.
    if (restored.includes('enhancedLearnerState')) {
        try { enhancedLearner.reload(); } catch (e) { logger.warn('[hydrate] enhancedLearner reload failed:', e.message); }
    }
    if (restored.includes('goldModelState')) {
        try { goldModel.reload(); } catch (e) { logger.warn('[hydrate] goldModel reload failed:', e.message); }
    }

    try {
        const dirStatsRestored = await hydrateDirectionBias();
        if (dirStatsRestored) logger.info('[hydrate] Restored directionStats from Postgres');
    } catch (e) {
        logger.warn('[hydrate] directionStats restore failed:', e.message);
    }

    return restored;
}
const MAX_CANDLE_CACHE = 100, CANDLE_CACHE_TTL = 5 * 60 * 1000, WORKER_TIMEOUT_MS = WORKER_CONFIG.workerTimeoutMs || 30000, BATCH_WINDOW_MS = 100, BOT_CODE_VERSION = 'v34.1-max3-no-pause';

const MIN_LOT_FOR_SPLIT = 0.03;
// v1 strategy tag (see the V1 section below) and whether MetaAPI refused the
// server-side trailing stop this session. 2026-10-24.
const STRATEGY_VERSION = 'v1.0-2026-10-24';
let _v1ServerTrailRefused = false;
const CANDLE_FRESHNESS_MS = { '1m': 20000, '5m': 60000, '15m': 120000, '30m': 180000, '1h': 300000, '4h': 900000, '1d': 1800000, '1w': 3600000 };

// ─── SLEEP FUNCTION ──────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── GLOBAL INSTANCES ──────────────────────────────────────────────────────
// (Previously this section also declared 10 placeholder objects —
// rlTrader, bayesianEngine, darkPoolDetector, strategyDiscoverer,
// volumePredictor, hedgeManager, microstructureAnalyzer,
// executionOptimizer, riskCalibrator, mlOptimizer — each a hardcoded
// stub with no real implementation. Confirmed zero call sites anywhere
// in this file, server.js, or the exports below, so they were removed
// rather than left as dead weight that looks like working functionality.
// The real, live learning components are: goldModel (src/ml/gold-model),
// predict/train from src/ml/predictor (the model actually driving
// mlWinProb), enhancedLearner (src/learning/enhanced-learning), and
// updateBayesianWeights/getBayesianFactorWeight from
// src/analysis/bayesian.)

// ─── ORIGINAL ANALYZER INSTANCES ──────────────────────────────────────────
let cotAnalyzer = new COTAnalyzer();
let macroFactors = new MacroFactors();
let intermarketAnalyzer = new IntermarketAnalyzer();
let regimeHMM = new RegimeHMM();
let goldModel = new GoldModel();
let newsSentiment = new NewsSentimentAdvanced();

// ─── NEW ENHANCEMENT INSTANCES ────────────────────────────────────────────
let orderBook = new OrderBookAnalyzer();
let flowDetector = new FlowDetector();
let intermarketAdvanced = new IntermarketAdvanced();
let newsNLP = new NewsSentimentNLP();
let etfFlows = new ETFFlows();
let optionsPositioning = new OptionsPositioning();
let economicCalendar = new EconomicCalendar();
let seasonalityAdvanced = new SeasonalityAdvanced();
let portfolioRisk = new PortfolioRiskManager();
let recoveryManager = new RecoveryManager();
let rlOptimizer = new RLParamOptimizer();
let bayesianOpt = new BayesianOptimizer();
let backtestRunner = new BacktestRunner();

// ─── ON-DEMAND BACKTEST (dashboard-facing) ─────────────────────────────────
// The dashboard already had a backtest UI with no backend behind it — these
// two routes in server.js were empty stubs. This wraps the SAME
// backtestRunner instance already used nightly by autoTuneParameters (so
// it's exercising a code path that's been running in production, not
// something new and untested), and persists a rolling history via
// writeNamedState so results survive a restart the same way the journal
// hydration fix does. Added 2026-08-13.
const BACKTEST_HISTORY_KEY = 'backtestHistory';
async function runBacktest(opts) {
    opts = opts || {};
    const lookback = Math.min(500, Math.max(30, parseInt(opts.lookback) || 100));
    // 'CONFLUENCE_WEIGHTS' dropped from the default list — not actually
    // supported by BacktestRunner.run() (see its comments: reweighting
    // scores from journal text isn't reliable without structured per-factor
    // data). Requesting it now returns an honest "unsupported" note instead
    // of silently doing nothing, which is what the missing run() method did
    // before it existed at all.
    const optimize = Array.isArray(opts.optimize) && opts.optimize.length ? opts.optimize : ['minScore', 'riskPct'];
    const journal = loadJournal();
    const closed = (journal.trades || []).filter(t => t.outcome !== null);
    if (closed.length < 30) {
        return { ok: false, error: `Not enough closed trades to backtest (have ${closed.length}, need at least 30)` };
    }
    const tradesUsed = closed.slice(-lookback);
    const result = await backtestRunner.run({ trades: tradesUsed, optimize, currentRiskPct: getCfg().risk });
    const record = {
        ts: new Date().toISOString(),
        tradesUsed: tradesUsed.length,
        optimize,
        result
    };
    try {
        const history = (await readNamedState(BACKTEST_HISTORY_KEY)) || [];
        history.push(record);
        while (history.length > 20) history.shift();
        await writeNamedState(BACKTEST_HISTORY_KEY, history);
    } catch (e) {
        logger.warn('[backtest] failed to persist history:', e.message);
    }
    return { ok: true, ...record };
}
async function getBacktestHistory() {
    try {
        return (await readNamedState(BACKTEST_HISTORY_KEY)) || [];
    } catch (e) {
        logger.warn('[backtest] failed to load history:', e.message);
        return [];
    }
}
let xgboost = new XGBoostModel();
let dashboard = new Dashboard();
let forwardValidator = new ForwardValidator();
let twapExecutor = new TWAPExecutor();
let vwapExecutor = new VWAPExecutor();
let icebergExecutor = new IcebergExecutor();

// ─── ENHANCED LEARNER INSTANCE ────────────────────────────────────────────
let enhancedLearner = new EnhancedLearner();

// ─── NEW: ORDER BOOK ML PREDICTOR ─────────────────────────────────────────
class OrderBookMLPredictor {
    constructor() {
        this.model = null;
        this.lastPrediction = { direction: 'neutral', confidence: 0.5 };
    }
    async predict(orderBookData, price, atr) {
        const imbalance = orderBookData?.buyVolume - orderBookData?.sellVolume || 0;
        const spread = orderBookData?.spread || 0.001;
        const normalizedImbalance = Math.max(-1, Math.min(1, imbalance / 1000));
        let direction = 'neutral';
        let confidence = 0.5;
        if (Math.abs(normalizedImbalance) > 0.3) {
            direction = normalizedImbalance > 0 ? 'bullish' : 'bearish';
            confidence = Math.min(0.8, 0.5 + Math.abs(normalizedImbalance) * 0.5);
        }
        if (price && orderBookData?.vwap) {
            const distance = (price - orderBookData.vwap) / (atr || 1);
            if (distance < 0.1 && direction !== 'neutral') confidence = Math.min(0.9, confidence + 0.1);
        }
        this.lastPrediction = { direction, confidence };
        return this.lastPrediction;
    }
}

let orderBookML = new OrderBookMLPredictor();

// ─── NEW: INTERMARKET MATRIX ──────────────────────────────────────────────
async function fetchIntermarketMatrix() {
    try {
        const symbols = ['DX-Y.NYB', 'EURUSD=X', '^TNX', '^GSPC'];
        const results = {};
        for (const sym of symbols) {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1h&range=1d`;
            const res = await fetchWithTimeout(url, {}, 10000);
            if (!res.ok) continue;
            const data = await res.json();
            const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0];
            if (!quote) continue;
            const closes = quote.close?.filter(v => v !== null) || [];
            if (closes.length < 5) continue;
            const change = (closes[closes.length - 1] - closes[0]) / closes[0] * 100;
            results[sym] = change;
        }
        let riskScore = 0;
        if (results['DX-Y.NYB']) riskScore += -results['DX-Y.NYB'] * 0.3;
        if (results['^TNX']) riskScore += results['^TNX'] * 0.2;
        if (results['^GSPC']) riskScore += results['^GSPC'] * 0.3;
        if (results['EURUSD=X']) riskScore += results['EURUSD=X'] * 0.2;
        const sentiment = riskScore > 0.5 ? 'risk_on' : riskScore < -0.5 ? 'risk_off' : 'neutral';
        return { sentiment, score: riskScore, components: results };
    } catch (e) {
        logger.warn('[IntermarketMatrix] Failed:', e.message);
        return { sentiment: 'neutral', score: 0, components: {} };
    }
}

// ─── NEW: VOLATILITY SKEW ──────────────────────────────────────────────────
async function fetchVolatilitySkew() {
    try {
        const res = await fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/^VIX?interval=1h&range=1d', {}, 10000);
        if (!res.ok) return { skew: 0, vix: 0 };
        const data = await res.json();
        const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0];
        if (!quote) return { skew: 0, vix: 0 };
        const vix = quote.close?.filter(v => v !== null)?.pop() || 0;
        const skew = vix * 0.1;
        return { skew, vix };
    } catch (e) {
        logger.warn('[VolatilitySkew] Failed:', e.message);
        return { skew: 0, vix: 0 };
    }
}

// ─── NEW: SEASONALITY 2.0 ──────────────────────────────────────────────────
function getAdvancedSeasonality(now) {
    const month = now.getUTCMonth();
    const weekOfMonth = Math.ceil((now.getUTCDate() - now.getUTCDay() + 1) / 7);
    const dayOfWeek = now.getUTCDay();
    const hour = now.getUTCHours();
    let pattern = 'neutral';
    let multiplier = 1.0;
    const monthlyBias = {
        0: 1.1, 1: 1.05, 2: 0.95, 3: 0.9, 4: 1.0, 5: 1.0,
        6: 1.0, 7: 1.05, 8: 1.1, 9: 1.0, 10: 0.95, 11: 1.0
    };
    multiplier *= monthlyBias[month] || 1.0;
    if (weekOfMonth === 1) multiplier *= 1.05;
    else if (weekOfMonth === 4) multiplier *= 0.95;
    const date = now.getUTCDate();
    if (month === 11 && (date >= 20 && date <= 26)) multiplier *= 0.8;
    if (month === 0 && (date >= 1 && date <= 3)) multiplier *= 0.9;
    if (month === 10 && (date >= 20 && date <= 28)) multiplier *= 1.1;
    return { pattern: multiplier > 1.05 ? 'bullish' : multiplier < 0.95 ? 'bearish' : 'neutral', multiplier };
}

// ─── NEW: DAY-OF-WEEK SEASONALITY ───────────────────────────────────────
function getDayOfWeekSeasonality(now) {
    const day = now.getUTCDay(); // 0=Sunday
    if (day === 1) return { bonus: 0.3, label: 'Monday bullish bias' };
    if (day === 5) return { bonus: -0.3, label: 'Friday profit-taking' };
    return { bonus: 0, label: 'neutral' };
}

// ─── NEW: DYNAMIC STOP WITH VOLATILITY SKEW ──────────────────────────────
async function getDynamicStopWithSkew(entry, dir, atr, liquidityZones, regime, skewData) {
    const baseStop = getDynamicStop(entry, dir, liquidityZones, atr, 0.5);
    let stopPrice = baseStop.stopPrice;
    let reason = baseStop.reason;
    if (skewData && skewData.skew > 0) {
        const widenFactor = 1 + skewData.skew * 0.2;
        const dist = Math.abs(entry - stopPrice);
        const newDist = Math.min(dist * widenFactor, atr * 2.5);
        stopPrice = dir === 'buy' ? entry - newDist : entry + newDist;
        reason = `skew-adjusted (${skewData.skew.toFixed(2)})`;
    }
    const maxStopDist = atr * 2.0;
    if (Math.abs(entry - stopPrice) > maxStopDist) {
        stopPrice = dir === 'buy' ? entry - maxStopDist : entry + maxStopDist;
    }
    const minStopDist = atr * 0.3;
    if (Math.abs(entry - stopPrice) < minStopDist) {
        stopPrice = dir === 'buy' ? entry - minStopDist : entry + minStopDist;
    }
    return { stopPrice, reason };
}

// ─── NEW: NIGHTLY BACKTEST + AUTO-TUNE ──────────────────────────────────
let lastTuneTime = 0;
const TUNE_INTERVAL = 24 * 60 * 60 * 1000;

async function autoTuneParameters() {
    const now = Date.now();
    if (now - lastTuneTime < TUNE_INTERVAL) return;
    try {
        const journal = loadJournal();
        const trades = learningTrades(journal.trades);
        const closed = trades.filter(t => t.outcome !== null);
        if (closed.length < 30) {
            logger.info('[AutoTune] Not enough trades (need 30)');
            return;
        }
        const result = await backtestRunner.run({
            trades: closed.slice(-100),
            optimize: ['minScore', 'riskPct'],
            currentRiskPct: getCfg().risk
        });
        if (result && result.best) {
            // `cfg` was declared separately inside each `if` block below
            // (block-scoped const), so the summary line at the end
            // referenced a `cfg` that didn't exist in its scope — this threw
            // ReferenceError on every run that reached here, which the
            // outer catch swallowed silently. That meant `lastTuneTime` never
            // updated, so auto-tune would retry (and fail the same way)
            // every cycle instead of once per 24h. Invisible until now
            // because backtestRunner.run() itself didn't work before today —
            // this is the next thing that would have broken. Hoisted a
            // single cfg reference so all three uses share it. Fixed
            // 2026-08-13.
            const cfg = getCfg();
            if (result.best.CONFLUENCE_WEIGHTS) {
                CONFLUENCE_WEIGHTS = { ...CONFLUENCE_WEIGHTS, ...result.best.CONFLUENCE_WEIGHTS };
                logger.info('[AutoTune] Updated CONFLUENCE_WEIGHTS');
            }
            // Walk-forward check added 2026-08-18: if the chosen minScore
            // only looked good on the training slice and lost money on the
            // held-out slice, applying it would mean tuning to noise rather
            // than a real edge. Skip the minScore update (but still apply
            // riskPct, which isn't subject to the same overfit risk) and
            // say so in the Telegram summary rather than silently applying
            // an unvalidated number.
            const overfit = result.walkForward && result.walkForward.likelyOverfit;
            if (result.best.minScore && !overfit) {
                // Floor raised from 2 to 4 alongside the effMin fix above —
                // auto-tune should not be able to re-introduce the low-score
                // trades that were causing the low win rate.
                const newMin = Math.min(8, Math.max(4, Math.round(result.best.minScore)));
                cfg.minScore = newMin;
                updateBotState({ botConfig: { ...cfg, minScore: newMin } });
                logger.info(`[AutoTune] Updated minScore to ${newMin}`);
            } else if (overfit) {
                logger.warn('[AutoTune] Skipped minScore update — failed walk-forward validation:', result.warning);
            }
            if (result.best.riskPct) {
                const newRisk = Math.min(3, Math.max(0.5, result.best.riskPct));
                cfg.risk = newRisk;
                updateBotState({ botConfig: { ...cfg, risk: newRisk } });
                logger.info(`[AutoTune] Updated risk to ${newRisk}%`);
            }
            sendTelegram(`🧠 *Auto-Tune Complete*\nNew minScore: ${cfg.minScore}${overfit ? ' (unchanged — failed walk-forward check)' : ''}\nNew risk: ${cfg.risk}%\nWeights updated.`);
        }
        lastTuneTime = now;
    } catch (e) {
        logger.warn('[AutoTune] Failed:', e.message);
    }
}

// ─── ORIGINAL BOT FUNCTIONS ──────────────────────────────────────────────
let _errorCache = {};
function shouldSendError(msg) { let key = String(msg).slice(0, 100), now = Date.now(); if (_errorCache[key] && now - _errorCache[key] < 10 * 60 * 1e3) return false; _errorCache[key] = now; Object.keys(_errorCache).forEach(k => { if (now - _errorCache[k] > 60 * 60 * 1e3) delete _errorCache[k]; }); return true; }

let _candleCache = {}, _candleCacheTime = {};
function cleanupCandleCache() { let now = Date.now(); Object.keys(_candleCache).forEach(k => { if (now - (_candleCacheTime[k] || 0) > CANDLE_CACHE_TTL) { delete _candleCache[k]; delete _candleCacheTime[k]; } }); let rem = Object.keys(_candleCache); if (rem.length > MAX_CANDLE_CACHE) { rem.sort((a, b) => (_candleCacheTime[a] || 0) - (_candleCacheTime[b] || 0)); for (let j = 0; j < rem.length - MAX_CANDLE_CACHE; j++) { delete _candleCache[rem[j]]; delete _candleCacheTime[rem[j]]; } } }
setInterval(cleanupCandleCache, 2 * 60 * 1000);

function updateBotState(u) { let crit = false; Object.keys(u).forEach(k => { if (CRITICAL_FIELDS && CRITICAL_FIELDS.has && CRITICAL_FIELDS.has(k)) crit = true; }); return writeState(u, { critical: crit }); }

function normalizePositionId(id) { return id !== undefined && id !== null ? String(id) : null; }
function getTradeId(p) { return normalizePositionId(p && (p.id || p.positionId) || String(Date.now())); }

// ─── WORKER FUNCTIONS ──────────────────────────────────────────────────────
let _workerPool = [], _workerId = 0;
function createWorker() { try { let w = new Worker(path.join(__dirname, 'indicators', 'worker.js')); let wo = { worker: w, busy: false, id: ++_workerId, dead: false, _lastActivity: Date.now() }; _workerPool.push(wo);
    w.on('error', e => { logger.warn('[worker ' + wo.id + '] Error:', e.message); wo.dead = true; });
    w.on('exit', code => { if (code !== 0) logger.warn('[worker ' + wo.id + '] Exited with code', code); wo.dead = true; });
    w.postMessage({ type: 'ping', id: Date.now() });
    setTimeout(() => wo.dead = true, 5000);
    w.once('message', d => { if (d.type === 'pong') { /*healthy*/ } }); return wo; } catch (e) { logger.warn('[worker] Failed:', e.message); return null; } }

function cleanupDeadWorkers() { let now = Date.now(); _workerPool.forEach(w => { if (!w.dead && w.busy && (now - w._lastActivity) > WORKER_TIMEOUT_MS * 2) { try { w.worker.terminate(); } catch (e) { } w.dead = true; } }); _workerPool = _workerPool.filter(w => !w.dead); }

function cleanupIdleWorkers() { let now = Date.now(), idle = WORKER_CONFIG.idleTimeoutMs || 300000; _workerPool = _workerPool.filter(w => { if (!w.busy && !w.dead && (now - w._lastActivity) > idle) { try { w.worker.terminate(); } catch (e) { } logger.debug('[worker] Terminated idle ' + w.id); return false; } return true; }); }
setInterval(cleanupIdleWorkers, WORKER_CONFIG.cleanupIntervalMs || 60000);

function getWorker() { cleanupDeadWorkers(); for (let w of _workerPool)
    if (!w.busy && !w.dead) { w.busy = true; w._lastActivity = Date.now(); return Promise.resolve(w); } if (_workerPool.length < (WORKER_CONFIG.maxWorkers || 2)) { let w = createWorker(); if (w) { w.busy = true; w._lastActivity = Date.now(); return Promise.resolve(w); } } return new Promise(resolve => { let start = Date.now(), iv = setInterval(() => { cleanupDeadWorkers(); for (let w of _workerPool)
    if (!w.busy && !w.dead) { clearInterval(iv); w.busy = true; w._lastActivity = Date.now(); resolve(w); return; } if (Date.now() - start > 30000) { clearInterval(iv); resolve(createWorker()); } }, 200); }); }

function releaseWorker(w) { if (w) { w.busy = false; w._lastActivity = Date.now(); } }

async function runAnalysisInWorker(candles, type, params) { params = params || {}; let w = await getWorker(); if (!w) { logger.warn('[worker] No worker, fallback'); return runAnalysisFallback(candles, type, params); } return new Promise((resolve, reject) => { let id = Date.now() + '_' + Math.random().toString(36).substr(2, 6), to = setTimeout(() => { logger.warn('[worker] Timeout ' + type); w.dead = true; releaseWorker(w); resolve(runAnalysisFallback(candles, type, params)); }, WORKER_TIMEOUT_MS); let handler = d => { if (d.id === id) { clearTimeout(to);
            w.worker.off('message', handler);
            releaseWorker(w);
            resolve(d.result); } }; w.worker.on('message', handler);
    w.worker.postMessage({ id: id, type: type, candles: candles, params: params }); }); }

function runAnalysisFallback(c, type, p) { p = p || {}; let atr = indicators.calcATR14(c), sw = indicators.detectSwings(c, { windowSize: SWING_CONFIG.windowSize, minMovePct: SWING_CONFIG.minMovePct, maxSwings: SWING_CONFIG.maxSwings, atr }); switch (type) {
    case 'calcATR14': return atr;
    case 'calcADX': return indicators.calcADX(c);
    case 'detectSwings': return sw;
    case 'detectFVG': return indicators.detectFVG(c, p.curP, atr);
    case 'detectOB': return indicators.detectOB(c, p.curP, atr);
    case 'detectMSS': return indicators.detectMSS(c, sw, p.curP, atr);
    case 'detectLiqSweep': return indicators.detectLiqSweep(c, sw);
    case 'getCandleCharacter': return indicators.getCandleCharacter(c, atr);
    case 'runFullAnalysis': return { atr, adx: indicators.calcADX(c), swings: sw, fvgs: indicators.detectFVG(c, p.curP, atr), obs: indicators.detectOB(c, p.curP, atr), mss: indicators.detectMSS(c, sw, p.curP, atr), liq: indicators.detectLiqSweep(c, sw), candleChar: indicators.getCandleCharacter(c, atr), bias: indicators.calcHTFBias(c) };
    default: return { error: 'Unknown type ' + type };
} }

// ─── BATCH REQUEST ─────────────────────────────────────────────────────────
let _requestBatch = [], _batchTimeout = null, _batchConfig = null;
function batchRequest(endpoint) { return new Promise((resolve, reject) => { _requestBatch.push({ endpoint, resolve, reject }); if (_batchTimeout) clearTimeout(_batchTimeout); _batchTimeout = setTimeout(() => { if (!_requestBatch.length) return;
        _batchTimeout = null; let batch = _requestBatch.slice();
        _requestBatch = []; batch.forEach(r => { try { maGet(_batchConfig || getCfg(), r.endpoint).then(r.resolve).catch(r.reject); } catch (e) { r.reject(e); } }); }, BATCH_WINDOW_MS); }); }

// ─── INDICATOR CACHE ──────────────────────────────────────────────────────
let _ic = { lastCandle: null, lastTimestamp: 0, atr: null, adx: null, swings: null, fvgs: null, obs: null, mss: null, liq: null, candleChar: null, priceHistory: [], _candleCount: 0, _fullRecalcCounter: 0, FORCE_RECALC_INTERVAL: 20, vsaResult: null, breakerResult: null };

function updateIndicatorsIncrementally(candles, p) { p = p || {}; if (!candles || !candles.length) return getCachedIndicators(); let latest = candles[candles.length - 1], lt = latest && latest.time || 0; if (_ic.lastCandle && _ic.lastTimestamp === lt) return getCachedIndicators(); let force = p.forceRecalc || false, priceChanged = _ic.lastCandle && Math.abs(latest.close - _ic.lastCandle.close) > 0.01; _ic._fullRecalcCounter++; if (_ic._fullRecalcCounter >= _ic.FORCE_RECALC_INTERVAL) { force = true; _ic._fullRecalcCounter = 0; } if (!force && _ic.atr && _ic.lastCandle) { let tr = Math.max(latest.high - latest.low, Math.abs(latest.high - _ic.lastCandle.close), Math.abs(latest.low - _ic.lastCandle.close));
    _ic.atr = (_ic.atr * 13 + tr) / 14; } else _ic.atr = indicators.calcATR14(candles); let res = { atr: _ic.atr }; if (force || !_ic.adx || candles.length !== _ic._candleCount) { _ic.adx = indicators.calcADX(candles);
    _ic._candleCount = candles.length; } res.adx = _ic.adx; let so = { windowSize: SWING_CONFIG.windowSize, minMovePct: SWING_CONFIG.minMovePct, maxSwings: SWING_CONFIG.maxSwings, atr: _ic.atr };
    _ic.swings = indicators.detectSwings(candles, so);
    res.swings = _ic.swings; if (force || priceChanged || !_ic.fvgs) { let cp = p.curP || latest.close;
        _ic.fvgs = indicators.detectFVG(candles, cp, _ic.atr);
        _ic.obs = indicators.detectOB(candles, cp, _ic.atr);
        _ic.mss = indicators.detectMSS(candles, _ic.swings, cp, _ic.atr);
        _ic.liq = indicators.detectLiqSweep(candles, _ic.swings);
        _ic.candleChar = indicators.getCandleCharacter(candles, _ic.atr);
        _ic.vsaResult = vsa.analyzeVSA(candles, { atr: _ic.atr, volumeMAPeriod: VSA_CONFIG.volumeMAPeriod });
        _ic.breakerResult = breaker.detectBreakerBlocks(candles, _ic.obs, _ic.swings, cp, _ic.atr, null); }
    res.fvgs = _ic.fvgs || [];
    res.obs = _ic.obs || [];
    res.mss = _ic.mss || { dir: 'neutral', type: 'none' };
    res.liq = _ic.liq || { swept: false };
    res.candleChar = _ic.candleChar || { label: 'neutral' };
    res.vsaResult = _ic.vsaResult || null;
    res.breakerResult = _ic.breakerResult || null;
    _ic.lastCandle = latest;
    _ic.lastTimestamp = lt;
    _ic.priceHistory.push(latest.close); if (_ic.priceHistory.length > 100) _ic.priceHistory = _ic.priceHistory.slice(-100); return res; }

function getCachedIndicators() { return { atr: _ic.atr || 5, adx: _ic.adx || { adx: 20, trending: false, strong: false }, swings: _ic.swings || { highs: [], lows: [] }, fvgs: _ic.fvgs || [], obs: _ic.obs || [], mss: _ic.mss || { dir: 'neutral', type: 'none' }, liq: _ic.liq || { swept: false }, candleChar: _ic.candleChar || { label: 'neutral' }, vsaResult: _ic.vsaResult || null, breakerResult: _ic.breakerResult || null }; }

function clearIndicatorCache() { Object.keys(_ic).forEach(k => _ic[k] = null); _ic.priceHistory = []; _ic._candleCount = 0; _ic._fullRecalcCounter = 0; }

// ─── LAZY DATA ────────────────────────────────────────────────────────────
let _lazyCache = {}, _lazyUpdateTimes = {}, LAZY_CACHE_TTL = { d1: 90 * 60 * 1000, w1: 3 * 60 * 60 * 1000, dxy: 5 * 60 * 1000, correlation: 5 * 60 * 1000, sentiment: 15 * 60 * 1000, treasury: 15 * 60 * 1000, calendar: 30 * 60 * 1000, news: 30 * 60 * 1000 };

async function getLazyData(key, fetchFn, force, cfg) { force = force || false; cfg = cfg || null; let now = Date.now(), cached = _lazyCache[key], ttl = LAZY_CACHE_TTL[key] || 5 * 60 * 1000; if (!force && cached && (now - (_lazyUpdateTimes[key] || 0)) < ttl) return cached; try { let data = await fetchFn(cfg); if (data === null || data === undefined) throw new Error('fetcher returned no data');
        _lazyCache[key] = data;
        _lazyUpdateTimes[key] = now; return data; } catch (e) { logger.warn('[lazy] Failed ' + key + ': ' + e.message); return cached || null; } }

async function fetchNewsSentiment() { if (!process.env.NEWS_API_KEY) return { sentiment: 'neutral', score: 0, bullish: false, bearish: false, articles: [] }; try { let url = 'https://newsapi.org/v2/everything?q=gold OR XAU OR "Federal Reserve"&language=en&sortBy=publishedAt&pageSize=20&apiKey=' + process.env.NEWS_API_KEY; let res = await fetchWithTimeout(url, {}, 10000); if (!res.ok) throw new Error('NewsAPI ' + res.status); let data = await res.json(); if (!data.articles || !data.articles.length) return { sentiment: 'neutral', score: 0, articles: [] }; let arts = data.articles.slice(0, 10), contents = arts.map(a => (a.title || '') + ' ' + (a.description || '')); let sr = analyzeSentimentBatch(contents); return { sentiment: sr.label, score: sr.score, bullish: sr.label === 'bullish', bearish: sr.label === 'bearish', articles: arts.slice(0, 3).map(a => a.title) }; } catch (e) { logger.warn('[news] Sentiment failed:', e.message); return { sentiment: 'neutral', score: 0, bullish: false, bearish: false, articles: [] }; } }

async function getLazyNews() { return getLazyData('news', fetchNewsSentiment); }

// ─── NEW: Fetch DXY and Treasury yield ──────────────────────────────────
async function fetchDXY() {
    try {
        const url = 'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1h&range=1d';
        const res = await fetchWithTimeout(url, {}, 10000);
        if (!res.ok) return null;
        const data = await res.json();
        const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0];
        if (!quote) return null;
        const closes = quote.close?.filter(v => v !== null) || [];
        if (closes.length < 5) return null;
        const current = closes[closes.length - 1];
        const prev = closes[closes.length - 2] || current;
        const change = (current - prev) / prev * 100;
        return { price: current, change, trend: change > 0.1 ? 'bullish' : change < -0.1 ? 'bearish' : 'neutral' };
    } catch (e) { return null; }
}

async function fetchTreasury10y() {
    try {
        const url = 'https://query1.finance.yahoo.com/v8/finance/chart/^TNX?interval=1h&range=1d';
        const res = await fetchWithTimeout(url, {}, 10000);
        if (!res.ok) return null;
        const data = await res.json();
        const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0];
        if (!quote) return null;
        const closes = quote.close?.filter(v => v !== null) || [];
        if (closes.length < 5) return null;
        const current = closes[closes.length - 1];
        const prev = closes[closes.length - 2] || current;
        const change = (current - prev) / prev * 100;
        return { yield: current, change, trend: change > 0.1 ? 'bullish' : change < -0.1 ? 'bearish' : 'neutral' };
    } catch (e) { return null; }
}

// ─── AB TESTING ────────────────────────────────────────────────────────────
let _abState = null;
function loadABTesting() { if (_abState) return _abState; try { if (fs.existsSync(AB_TESTING_FILE)) { _abState = JSON.parse(fs.readFileSync(AB_TESTING_FILE, 'utf8')); return _abState; } } catch (e) { logger.warn('[abtesting] load failed:', e.message); } _abState = { versionA: { trades: 0, wins: 0, totalPnl: 0, totalLoss: 0, active: true }, versionB: { trades: 0, wins: 0, totalPnl: 0, totalLoss: 0, active: false }, currentVersion: 'A', lastSwitch: Date.now() }; return _abState; }

function saveABTesting() { try { fs.writeFileSync(AB_TESTING_FILE, JSON.stringify(_abState, null, 2)); writeNamedState('abTesting', _abState).catch(() => {}); } catch (e) { logger.warn('[abtesting] save failed:', e.message); } }

function getActiveVersion() { let s = loadABTesting(); return s.currentVersion; }

function recordABTestResult(version, outcome, pnl) { let s = loadABTesting(), key = version === 'A' ? 'versionA' : 'versionB'; s[key].trades++; if (outcome === 'win') { s[key].wins++; s[key].totalPnl += pnl; } else { s[key].totalPnl += pnl; s[key].totalLoss = (s[key].totalLoss || 0) + Math.abs(pnl); } if (s.versionA.trades >= 30 && s.versionB.trades >= 30) { let calc = function(v) { let wr = v.wins / v.trades, lr = 1 - wr, avgWin = v.wins > 0 ? (v.totalPnl > 0 ? v.totalPnl / v.wins : 0) : 0, losses = v.trades - v.wins, avgLoss = losses > 0 && v.totalLoss > 0 ? v.totalLoss / losses : 0; return wr * avgWin - lr * avgLoss; }; let eA = calc(s.versionA), eB = calc(s.versionB); if (eB > eA && s.currentVersion === 'A') { s.currentVersion = 'B'; s.lastSwitch = Date.now();
        sendTelegram('🔄 A/B Test: Switched to Version B\nExpectancy B: ' + eB.toFixed(2) + ' vs A: ' + eA.toFixed(2)); } else if (eA > eB && s.currentVersion === 'B') { s.currentVersion = 'A'; s.lastSwitch = Date.now();
        sendTelegram('🔄 A/B Test: Switched to Version A\nExpectancy A: ' + eA.toFixed(2) + ' vs B: ' + eB.toFixed(2)); } } saveABTesting(); }

// ─── SEASONALITY ──────────────────────────────────────────────────────────
let _seasonData = null;
function loadSeasonality() { if (_seasonData) return _seasonData; try { if (fs.existsSync(SEASONALITY_FILE)) { _seasonData = JSON.parse(fs.readFileSync(SEASONALITY_FILE, 'utf8')); return _seasonData; } } catch (e) { logger.warn('[seasonality] load failed:', e.message); } _seasonData = { hourly: {}, daily: {}, monthly: {}, lastUpdated: Date.now() }; return _seasonData; }

function saveSeasonality() { try { fs.writeFileSync(SEASONALITY_FILE, JSON.stringify(_seasonData, null, 2)); writeNamedState('seasonality', _seasonData).catch(() => {}); } catch (e) { logger.warn('[seasonality] save failed:', e.message); } }

function recordTradeOutcome(hour, dow, outcome, pnl, ts) { let s = loadSeasonality(), hk = String(hour), dk = String(dow); if (!s.hourly[hk]) s.hourly[hk] = { wins: 0, losses: 0, totalPnl: 0, trades: 0, recent: [] }; if (!s.daily[dk]) s.daily[dk] = { wins: 0, losses: 0, totalPnl: 0, trades: 0, recent: [] }; if (outcome === 'win') { s.hourly[hk].wins++; s.daily[dk].wins++; } else { s.hourly[hk].losses++; s.daily[dk].losses++; } s.hourly[hk].totalPnl += pnl; s.hourly[hk].trades++; s.daily[dk].totalPnl += pnl; s.daily[dk].trades++; ts = ts || Date.now(); if (!s.hourly[hk].recent) s.hourly[hk].recent = [];
    s.hourly[hk].recent.push({ outcome, pnl, ts }); if (s.hourly[hk].recent.length > 100) s.hourly[hk].recent = s.hourly[hk].recent.slice(-100);
    s.lastUpdated = Date.now(); saveSeasonality(); }

// ─── SMALL-SAMPLE-SAFE WIN RATES ─────────────────────────────────────────────
// Several filters hard-block trades on a historical win rate computed from a
// handful of trades (similar setups: as few as 3; hour of day: 10). With so
// few samples the rate is mostly noise — 1 win in 3 is entirely consistent
// with a 60% strategy — and once a filter blocks, no new trades happen to
// correct it, so an unlucky start locked the bot out of a whole class of
// setups indefinitely (seen in simulation: 1,600+ consecutive blocked
// cycles after a few early losses). These now act only on statistically
// meaningful evidence: the Wilson score interval (95% one-sided), i.e. a
// filter that blocks below X% blocks only when even the optimistic estimate
// is below X%. Added 2026-10-23.
function wilsonBounds(wins, n, z) {
    if (!(n > 0)) return { lower: 0, upper: 1 };
    z = z || 1.645;
    const p = Math.min(1, Math.max(0, wins / n)), z2 = z * z, denom = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denom;
    const margin = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom;
    return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}
// The win rate to ACT on: the observed rate, pulled toward 50% until the
// evidence is significant (upper bound when below 50%, lower bound above).
function conservativeWinRate(wins, n) {
    if (!(n > 0)) return null;
    const p = wins / n, b = wilsonBounds(wins, n);
    return p < 0.5 ? Math.min(0.5, b.upper) : Math.max(0.5, b.lower);
}
const SIMILAR_MIN_SAMPLES = 10;
const SIMILAR_WINDOW_MS = 21 * 24 * 60 * 60 * 1000; // a block can't outlive 3 weeks of no trading

function getHourWinRate(hour) { let s = loadSeasonality(), h = s.hourly[String(hour)]; if (!h || h.trades < 10) return null;
    let p, n;
    if (h.recent && h.recent.length >= 10) { let cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000, ww = 0, wt = 0;
        h.recent.forEach(r => { let w = (r.ts || 0) >= cutoff ? 2 : 1; wt += w; if (r.outcome === 'win') ww += w; }); p = wt > 0 ? ww / wt : h.wins / h.trades; n = h.recent.length; }
    else { p = h.wins / h.trades; n = h.trades; }
    // Conservative estimate (see above) — the quality gate blocks below 40%
    // and the score adjusts at <35% / >55%, now only on significant evidence.
    return conservativeWinRate(p * n, n); }

// ─── COUNTERFACTUAL LOGGING ─────────────────────────────────────────────────
// Every filter added over past sessions (HTF alignment, VSA confirmation,
// volatile-regime block, minSimilarWinRate, etc.) was justified by evidence
// on trades that WERE taken. None of it says whether the trades those
// filters REJECT would actually have lost — that's simply never been
// measured. This logs a paper-trade for every setup blocked purely by the
// quality gate or the score threshold (not "no signal at all"), assigns it
// the same hypothetical SL/TP a real trade would get, and resolves it
// against future price the same way a real position would close. Over time
// this answers, with actual evidence: is each filter rejecting trades that
// would have lost (working as intended), or rejecting trades that would
// have won (costing win rate for no reason)? Added 2026-08-27.
let _cfData = null;
function loadCounterfactuals() { if (_cfData) return _cfData; try { if (fs.existsSync(COUNTERFACTUAL_FILE)) { _cfData = JSON.parse(fs.readFileSync(COUNTERFACTUAL_FILE, 'utf8')); return _cfData; } } catch (e) { logger.warn('[counterfactual] load failed:', e.message); } _cfData = { pending: [], resolved: [] }; return _cfData; }
function saveCounterfactuals() { try { fs.writeFileSync(COUNTERFACTUAL_FILE, JSON.stringify(_cfData, null, 2)); writeNamedState('counterfactuals', _cfData).catch(() => {}); } catch (e) { logger.warn('[counterfactual] save failed:', e.message); } }

const CF_MAX_AGE_MS = 24 * 60 * 60 * 1000; // give a rejected setup 24h to prove itself before calling it expired
const CF_MAX_PENDING = 200;
const CF_MAX_RESOLVED = 1000;

function logCounterfactual(analysis, dir, price, atr, regime, cfg, reason) {
    try {
        let cf = loadCounterfactuals();
        // Dedup: don't log the same blocked direction again within 15 min
        // (avoids one persistent setup flooding the log every cycle).
        let now = Date.now(), recent = cf.pending.find(p => p.dir === dir && (now - p.ts) < 15 * 60 * 1000);
        if (recent) return;
        let sc = getSymConfig(cfg.symbol);
        let sl = getAdaptiveStopLoss(price, dir, atr, analysis.volatility || regime.volatility || 'normal', regime.regime, sc.minSL);
        let slDist = Math.abs(price - sl);
        let targetRR = cfg.rr || 1.5;
        let tp = dir === 'buy' ? price + slDist * targetRR : price - slDist * targetRR;
        cf.pending.push({
            id: 'cf_' + now + '_' + Math.random().toString(36).slice(2, 7),
            ts: now, dir, entryPrice: price, sl, tp, slDist, targetRR,
            score: analysis.score, reason, session: analysis.session && analysis.session.session,
            regime: regime.regime, outcome: null,
        });
        if (cf.pending.length > CF_MAX_PENDING) cf.pending = cf.pending.slice(-CF_MAX_PENDING);
        saveCounterfactuals();
    } catch (e) { logger.warn('[counterfactual] log failed:', e.message); }
}

function resolveCounterfactuals(currentPrice) {
    try {
        if (!currentPrice) return;
        let cf = loadCounterfactuals(), now = Date.now(), stillPending = [];
        for (let p of cf.pending) {
            let hitTP = p.dir === 'buy' ? currentPrice >= p.tp : currentPrice <= p.tp;
            let hitSL = p.dir === 'buy' ? currentPrice <= p.sl : currentPrice >= p.sl;
            if (hitTP || hitSL) {
                p.outcome = hitTP ? 'would_win' : 'would_lose';
                p.resolvedTs = now; p.resolvedPrice = currentPrice;
                cf.resolved.push(p);
            } else if (now - p.ts > CF_MAX_AGE_MS) {
                p.outcome = 'expired'; p.resolvedTs = now; p.resolvedPrice = currentPrice;
                cf.resolved.push(p);
            } else {
                stillPending.push(p);
            }
        }
        if (stillPending.length !== cf.pending.length) {
            cf.pending = stillPending;
            if (cf.resolved.length > CF_MAX_RESOLVED) cf.resolved = cf.resolved.slice(-CF_MAX_RESOLVED);
            saveCounterfactuals();
        }
    } catch (e) { logger.warn('[counterfactual] resolve failed:', e.message); }
}

// Compares blocked-trade outcomes against real taken-trade outcomes, broken
// down by rejection reason, so each filter's actual cost/benefit is visible
// instead of assumed. Needs real resolved samples before any of it means
// anything — that's the whole point of building the capture first.
function getCounterfactualStats(journalTrades) {
    let cf = loadCounterfactuals();
    let decided = cf.resolved.filter(p => p.outcome === 'would_win' || p.outcome === 'would_lose');
    if (!decided.length) return { resolved: 0, pending: cf.pending.length, byReason: {}, note: 'No resolved counterfactuals yet' };
    let byReason = {};
    decided.forEach(p => {
        let key = (p.reason || 'unknown').split(':')[0].trim().slice(0, 40);
        if (!byReason[key]) byReason[key] = { total: 0, wouldWin: 0 };
        byReason[key].total++;
        if (p.outcome === 'would_win') byReason[key].wouldWin++;
    });
    Object.keys(byReason).forEach(k => { byReason[k].winRate = parseFloat((byReason[k].wouldWin / byReason[k].total * 100).toFixed(1)); });
    let closedReal = (journalTrades || []).filter(t => t.outcome !== null);
    let realWinRate = closedReal.length ? parseFloat((closedReal.filter(t => t.outcome === 'win').length / closedReal.length * 100).toFixed(1)) : null;
    return {
        resolved: decided.length, pending: cf.pending.length,
        blockedWinRate: parseFloat((decided.filter(p => p.outcome === 'would_win').length / decided.length * 100).toFixed(1)),
        takenWinRate: realWinRate, byReason,
        sampleWarning: decided.length < 30 ? 'Under 30 resolved — too early to act on this' : null,
    };
}

// ─── JOURNAL ──────────────────────────────────────────────────────────────
function loadJournal() { try { if (fs.existsSync(JOURNAL_PATH)) return JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf8')); } catch (e) { logger.warn('[journal] load failed:', e.message); } return { trades: [], weights: {}, lastUpdated: null, closedCount: 0 }; }

// ─── LEARNING EPOCH ─────────────────────────────────────────────────────────
// Every trade before 2026-10-23 was chosen from time-reversed candles (see
// toChronological) and managed with exit bugs that cut winners to pennies
// (see managePositions / getBeBuffer). The bot's adaptive layers learn from
// those trades — and several of them GATE or SIZE new trades: the quality
// gate hard-blocks "hour historically weak" and "similar setups low win
// rate", journal weights and the enhanced learner shift the score bar (up to
// +1.5) and risk (down to 0.3x), and direction stats can add +0.8 to one
// side or even flip a sell into a buy. Left alone, that history would keep
// blocking and shrinking trades for weeks after the fix. So on the first
// cycle of this version: reset the learned stores once, and from then on
// only trades opened after the epoch feed any learning/gating. The journal
// itself is kept intact for reports. Added 2026-10-23.
const LEARNING_EPOCH_ID = '2026-10-23-chronological-candles';
function getLearningEpochTs() {
    const s = global._botState || {};
    return s._learningEpochId === LEARNING_EPOCH_ID && s._learningEpochTs ? s._learningEpochTs : 0;
}
function learningTrades(trades) {
    const arr = Array.isArray(trades) ? trades : [];
    const ts = getLearningEpochTs();
    if (!ts) return arr;
    return arr.filter(t => t && t.ts && new Date(t.ts).getTime() >= ts);
}
function learningJournal(j) { return Object.assign({}, j || {}, { trades: learningTrades(j && j.trades) }); }

function ensureLearningEpoch() {
    const s = global._botState || {};
    if (s._learningEpochId === LEARNING_EPOCH_ID && s._learningEpochTs) return false;
    const ts = Date.now();
    try { writeState({ _learningEpochId: LEARNING_EPOCH_ID, _learningEpochTs: ts }, { critical: true }); }
    catch (e) { logger.warn('[learning-epoch] could not record epoch:', e.message); return false; }
    // Hour/day win rates (feed the "hour historically weak" hard block)
    try { _seasonData = { hourly: {}, daily: {}, monthly: {}, lastUpdated: ts }; saveSeasonality(); } catch (e) { logger.warn('[learning-epoch] seasonality reset failed:', e.message); }
    // Counterfactuals were resolved against the stale (reversed-candle) price
    try { _cfData = { pending: [], resolved: [] }; saveCounterfactuals(); } catch (e) { logger.warn('[learning-epoch] counterfactual reset failed:', e.message); }
    // Score-bar offset + risk multiplier learner
    try { enhancedLearner.reset(); } catch (e) { logger.warn('[learning-epoch] learner reset failed:', e.message); }
    // Gold ML model (Postgres-backed) back to its default weights
    try { fs.rmSync(GOLD_MODEL_STATE_FILE, { force: true }); goldModel.reload(); goldModel.save(); } catch (e) { logger.warn('[learning-epoch] gold model reset failed:', e.message); }
    // XGBoost (in-memory + /tmp)
    try { xgboost.model = null; xgboost.trained = false; fs.rmSync(xgboost.file, { force: true }); } catch (e) { logger.warn('[learning-epoch] xgboost reset failed:', e.message); }
    // Direction stats (Postgres-backed). Live decisions use
    // getEpochDirectionBias() below, so the module's in-memory copy no
    // longer matters; this just stops it being restored on restart.
    try { writeNamedState('directionStats', { buy: [], sell: [] }).catch(() => {}); } catch (e) {}
    // Journal factor weights (recomputed from post-epoch trades on each close)
    try { let j = loadJournal(); j.weights = {}; saveJournal(j); } catch (e) { logger.warn('[learning-epoch] journal weights reset failed:', e.message); }
    // Only worth a message when there was history to reset. Without a
    // working database the state (and this marker) is lost on every
    // restart, so this runs again each time — on an empty journal it would
    // just be a confusing repeat.
    let hadHistory = false;
    try { hadHistory = (loadJournal().trades || []).some(t => t && t.ts && new Date(t.ts).getTime() < ts); } catch (e) { /* ignore */ }
    if (hadHistory) sendTelegram('🧹 *Fresh start for the bot\'s learning*\nUntil today the bot read candles in reverse order, so its past trades (and the stats learned from them — hour win rates, similar-setup win rates, direction bias, ML models, score-bar adjustments) reflect that bug. Those learning stats have been reset and will rebuild from new trades only.\nYour trade journal and reports are kept.');
    logger.info('[learning-epoch] Learning stores reset for ' + LEARNING_EPOCH_ID + (hadHistory ? '' : ' (no earlier trades on record)'));
    return true;
}

// Same rules as src/analysis/direction-bias.js (last 20 per side, 8 minimum,
// bonus = 1.5 x win-rate gap, capped 0.8) — but computed from post-epoch
// journal trades only, so pre-fix history can't flip or favour a direction.
function getEpochDirectionBias() {
    const closed = learningTrades(loadJournal().trades).filter(t => t.outcome === 'win' || t.outcome === 'loss');
    const MAX_HISTORY = 20, MIN_SAMPLES = 8, MAX_BONUS = 0.8;
    const buys = closed.filter(t => t.signal === 'buy').slice(-MAX_HISTORY);
    const sells = closed.filter(t => t.signal === 'sell').slice(-MAX_HISTORY);
    if (buys.length < MIN_SAMPLES || sells.length < MIN_SAMPLES) return { buyBonus: 0, sellBonus: 0 };
    const wr = a => a.filter(t => t.outcome === 'win').length / a.length;
    const diff = wr(buys) - wr(sells);
    return { buyBonus: diff > 0 ? Math.min(diff * 1.5, MAX_BONUS) : 0, sellBonus: diff < 0 ? Math.min(-diff * 1.5, MAX_BONUS) : 0 };
}

function saveJournal(j) {
    try {
        fs.writeFileSync(JOURNAL_PATH, JSON.stringify(j, null, 2));
        writeNamedState('journal', j).catch(() => {});
    } catch (e) {
        // Previously silent (only logger.warn). A failed journal write means
        // today's trades stop being recorded — exactly the kind of failure
        // that should surface immediately rather than being discovered hours
        // later as "no trades placed today" despite real trades happening.
        logger.warn('[journal] save failed:', e.message);
        try { sendTelegram('⚠️ Journal save failed: ' + e.message + '\nTrade history may not be persisting.'); } catch (e2) {}
    }
}

function journalTrade(id, a, entry, sl, tp, lots, tp1, tp2, tp3, factors, extra) { let j = loadJournal(); j.trades.push(Object.assign({ id: normalizePositionId(id), ts: new Date().toISOString(), signal: a.signal, score: Math.round((a.score || 0) * 100) / 100, hits: (a.hits || []).slice(), factors: factors || [], bias: a.bias,
    // Was a.session.label (e.g. "London Open") while every similar-setup
    // matcher below compares against analysis.session.session, the session
    // KEY (e.g. "london") — "London Open" !== "london" always, so the
    // session criterion in getSimilarSetupWinRate (here and in
    // src/filters/trade-quality.js) and findSimilarSetups NEVER matched,
    // for every trade ever journaled. This silently weakened the similar-
    // setup win-rate signal used both as a hard quality gate
    // (minSimilarWinRate) and as a score adjustment (computeQualityScore) —
    // matches fell back to the other 4 criteria only. Now stores the key so
    // the comparison actually works; label kept separately for display.
    // Fixed 2026-08-27.
    session: a.session && a.session.session, sessionLabel: a.session && a.session.label, sessionHour: new Date().getUTCHours(), dayOfWeek: new Date().getUTCDay(), mssType: a.mss && a.mss.type, liqSwept: a.liq && a.liq.swept, ote: a.ote || false, tripleZone: a.tripleZone || false, fullMTFAlign: a.fullMTFAlign || false, adx: a.adxData && a.adxData.adx, m5Setup: a.m5Entry && a.m5Entry.hasSetup, nestedFVG: a.nestedFVG || false, divergence: a.divergence && a.divergence.type || 'none', fibonacciLevel: a.fibonacci && a.fibonacci.nearestLevel || null, vwap: a.vwap && a.vwap.vwap || null, pattern: a.patterns && a.patterns.patterns && a.patterns.patterns[0] && a.patterns.patterns[0].type || null, orderFlow: a.orderFlow ? (a.orderFlow.absorption ? 'absorption' : a.orderFlow.exhaustion ? 'exhaustion' : null) : null, judas: !!(a.po3 && a.po3.judas), eqHLBonus: a.eqHLBonus || false, hourWinRateAtEntry: typeof a.hourWinRate === 'number' ? a.hourWinRate : null, codeVersion: BOT_CODE_VERSION, entryPrice: entry, sl, tp, tp1, tp2, tp3, lots, outcome: null, pips: null, pnl: null, partialClosed: false, partialPnl: null, tp1Hit: false, tp2Hit: false, tp3Hit: false, freeTradeTriggered: false, abVersion: a.abVersion || 'A', hiddenDivergence: a.divergence && a.divergence.hiddenType || null, vsaSignal: a.vsaSignal || null, vsaConfirms: a.vsaConfirms || false, breakerSignal: a.breakerSignal || null, hasBreaker: a.hasBreaker || false, candlePattern: a.candlePattern || null, entryType: a.entryType || 'main', newsSentiment: a.newsSentiment || 'neutral', newsScore: a.newsScore || 0, tradeNumber: a.tradeNumber || 0, mlConfidence: a.mlConfidence || 0, mlWinProb: a.mlWinProb || 0.5, vwapSlices: a.vwapResult ? a.vwapResult.slices : 0, rlConfidence: a.rlConfidence || 0, bayesianWinProb: a.bayesianWinProb || 0, correlationDeviation: a.correlationDeviation || 0, seasonalityPattern: a.seasonalityPattern || 'neutral', turtleSoup: a.turtleSoup || false, liquiditySweep: a.liquiditySweep || false, macroTrend: a.macroTrend || false, is3TPSplit: a.is3TPSplit || false, trendQuality: a.trendQuality || 0, trendScore: a.trendScore || 0, tradeDuration: a.tradeDuration || 'normal' }, extra || {})); if (j.trades.length > 1000) j.trades = j.trades.slice(-1000);
    saveJournal(j); }

function journalClose(id, outcome, pips, pnl, opts) { let j = loadJournal(), t = null; for (let i = 0; i < j.trades.length; i++)
    if (j.trades[i].id === normalizePositionId(id)) { t = j.trades[i]; break; } if (t) { if (t.outcome !== null) { logger.debug('[journal] trade ' + id + ' already closed as ' + t.outcome); return j.weights; }
        // A TP1 partial (see "Runner structure" in placeTrade) is journaled
        // when it happens. The engine's own close paths pass only the final
        // leg's P&L, so add the partial back in to record the trade's real
        // total — and judge win/loss on that total. Reconciliation passes the
        // all-deals total already (opts.totalPnl). Added 2026-10-23.
        if (!(opts && opts.totalPnl) && typeof t.partialPnl === 'number' && typeof pnl === 'number') pnl = pnl + t.partialPnl;
        // v1 two-leg trades: the TP1 lot was its own position, so its result
        // is never inside this position's deals — always add it. 2026-10-24.
        if (typeof t.legPnl === 'number' && typeof pnl === 'number') pnl = pnl + t.legPnl;
        if ((outcome === 'win' || outcome === 'loss') && typeof pnl === 'number' && !isNaN(pnl)) outcome = pnl >= 0 ? 'win' : 'loss';
        t.outcome = outcome; t.pips = pips; t.pnl = pnl; t.closedTs = new Date().toISOString();
        // v1: result in R, daily stop and drift alarm (see v1OnTradeClosed).
        if (t.riskAmount > 0) v1OnTradeClosed(t);
        // Pull the MAE/MFE tracked cycle-by-cycle in managePositions (see
        // above) rather than requiring every one of this function's ~10
        // call sites to pass it through — falls back to null for trades
        // closed without ever going through a management cycle (e.g.
        // reconciled directly against the broker), which is the honest
        // answer for those rather than a fabricated 0. Added 2026-08-27.
        try { let ps = loadPositionState(id); t.maeR = ps && typeof ps._maeR === 'number' ? ps._maeR : null; t.mfeR = ps && typeof ps._mfeR === 'number' ? ps._mfeR : null; } catch (e) { t.maeR = null; t.mfeR = null; }
        recordTradeOutcome(t.sessionHour || new Date().getUTCHours(), t.dayOfWeek || new Date().getUTCDay(), outcome, pnl, Date.now()); if (t.abVersion) recordABTestResult(t.abVersion, outcome, pnl);
        metrics.recordTrade(outcome, pnl);
        const sessionLabel = t.sessionLabel || t.session || 'unknown';
        if (!metrics._sessionStats) metrics._sessionStats = {};
        if (!metrics._sessionStats[sessionLabel]) metrics._sessionStats[sessionLabel] = { wins: 0, losses: 0, totalPnl: 0, trades: 0 };
        metrics._sessionStats[sessionLabel].trades++;
        if (outcome === 'win') metrics._sessionStats[sessionLabel].wins++;
        else metrics._sessionStats[sessionLabel].losses++;
        metrics._sessionStats[sessionLabel].totalPnl += pnl;

        if (t.signal) { try { updateDirectionStats(t.signal, outcome); } catch (e) { logger.warn('[DirectionStats] update failed:', e.message); } }
        // v1 freezes the learners: nothing here may change how later trades
        // are scored, filtered or sized. Statistics and reports still update.
        const _frozen = v1On();
        if (!_frozen) updateBayesianWeights(t, outcome);
        if (!_frozen) { try { goldModel.update(t, outcome); } catch (e) { logger.warn('[GoldModel] update failed:', e.message); } }
        dashboard.recordTrade(outcome, pnl, global._botState?.bal || 0);
        if (!_frozen) forwardValidator.record(t.mlWinProb || 0.5, outcome, pnl);
        seasonalityAdvanced.recordTrade(new Date(), outcome, pnl);
        if (!_frozen) rlOptimizer.update(outcome, pnl, j.trades);
        if (!_frozen && j.trades.length % 10 === 0) bayesianOpt.updateBest();
        if (!_frozen) { const _lt = learningTrades(j.trades); if (j.trades.length % 20 === 0 && _lt.length > 30) xgboost.train(_lt); }

        const regime = global._lastRegime || 'normal';
        const tpLevels = [];
        if (t.tp1Hit) tpLevels.push({ level: 1, pnl: t.partialPnl || t.pnl, hit: true });
        if (t.tp2Hit) tpLevels.push({ level: 2, pnl: t.partialPnl || t.pnl, hit: true });
        if (t.tp3Hit) tpLevels.push({ level: 3, pnl: t.partialPnl || t.pnl, hit: true });
        if (tpLevels.length === 0 && t.outcome === 'win') tpLevels.push({ level: 1, pnl: t.pnl, hit: true });
        else if (tpLevels.length === 0 && t.outcome === 'loss') tpLevels.push({ level: 1, pnl: t.pnl, hit: false });
        const fakeAnalysis = {
            factors: t.factors || [],
            hits: t.hits || [],
            score: t.score,
            signal: t.signal,
            entryType: t.entryType || 'market'
        };
        if (!_frozen) enhancedLearner.recordTrade(fakeAnalysis, outcome, pnl, regime, tpLevels);
    }
    j.closedCount = (j.closedCount || 0) + 1;
    j.weights = calcJournalWeights(learningTrades(j.trades), BOT_CODE_VERSION);
    j.lastUpdated = new Date().toISOString();
    saveJournal(j);
    const closedTrades = j.trades.filter(t => t.outcome !== null);
    const closedCount = closedTrades.length;
    const lastRetrain = global._lastMLRetrainTradeCount || 0;
    const tradesSinceRetrain = closedCount - lastRetrain;
    if (!v1On() && tradesSinceRetrain >= ML_RETRAIN_CONFIG.autoRetrainAfterTrades &&
        closedCount >= ML_RETRAIN_CONFIG.minTradesForRetrain) {
        retrainML();
    }
    // GoldModel batch retrain — same trigger cadence as retrainML() above,
    // tracked with its own separate counter (global._lastGoldModelRetrainTradeCount)
    // so the two retrains don't interfere with each other's trigger state.
    // Added 2026-08-04 — GoldModel previously only got per-trade nudges.
    const lastGoldModelRetrain = global._lastGoldModelRetrainTradeCount || 0;
    const tradesSinceGoldModelRetrain = closedCount - lastGoldModelRetrain;
    // GoldModel has no retrain() method (only per-trade update(), called
    // above) — this threw "goldModel.retrain is not a function" on every
    // close once 30 trades existed. Guarded 2026-10-23.
    if (!v1On() && typeof goldModel.retrain === 'function' && tradesSinceGoldModelRetrain >= ML_RETRAIN_CONFIG.autoRetrainAfterTrades &&
        closedCount >= ML_RETRAIN_CONFIG.minTradesForRetrain) {
        try {
            const gmResult = goldModel.retrain(closedTrades.slice(-ML_RETRAIN_CONFIG.maxRetrainHistory));
            if (gmResult && gmResult.success) global._lastGoldModelRetrainTradeCount = closedCount;
        } catch (e) {
            logger.warn('[GoldModel] Batch retrain failed:', e.message);
        }
    }
    return j.weights; }

function journalPartialClose(id, pips, pnl, lvl) { let j = loadJournal(), t = null; for (let i = 0; i < j.trades.length; i++)
    if (j.trades[i].id === normalizePositionId(id)) { t = j.trades[i]; break; } if (t) { t.partialClosed = true; t.partialPnl = (typeof t.partialPnl === 'number' ? t.partialPnl : 0) + (typeof pnl === 'number' ? pnl : 0); t.partialPips = pips; if (lvl === 1) t.tp1Hit = true; if (lvl === 2) t.tp2Hit = true; if (lvl === 3) t.tp3Hit = true; } saveJournal(j); }

function calcJournalWeights(trades, target) { let filtered = trades; if (target) { let matches = trades.filter(t => t.codeVersion === target && t.outcome !== null); if (matches.length >= 8) filtered = matches; } let closed = filtered.filter(t => t.outcome !== null); if (closed.length < 10) return {}; let factors = ['liqSwept', 'ote', 'tripleZone', 'fullMTFAlign', 'nestedFVG', 'm5Setup', 'divergence', 'pattern', 'judas', 'eqHLBonus', 'vsaConfirms', 'hasBreaker', 'candlePattern', 'mlWinProb', 'turtleSoup', 'liquiditySweep', 'macroTrend'], weights = {}; factors.forEach(f => { let withF = closed.filter(t => t[f] === true || t[f] === f || typeof t[f] === 'number' && t[f] > 0.55); if (withF.length < 8) return; let wins = withF.filter(t => t.outcome === 'win').length;
        weights[f] = wins / withF.length >= 0.65 ? 0.5 : wins / withF.length <= 0.35 ? -0.5 : 0; }); return weights; }

function getHitTagReport(trades) { let closed = (trades || []).filter(t => t.outcome !== null), stats = {}; closed.forEach(t => { let seen = {}; (t.hits || []).forEach(h => { let tag = String(h).replace(/\s*[+-]?\d+(\.\d+)?\s*$/, '').trim(); if (seen[tag]) return;
            seen[tag] = true; if (!stats[tag]) stats[tag] = { trades: 0, wins: 0, totalPnl: 0 };
            stats[tag].trades++; if (t.outcome === 'win') stats[tag].wins++;
            stats[tag].totalPnl += t.pnl || 0; }); }); return Object.keys(stats).map(tag => ({ tag, trades: stats[tag].trades, winRate: stats[tag].trades ? parseFloat((stats[tag].wins / stats[tag].trades * 100).toFixed(1)) : null, avgPnl: stats[tag].trades ? parseFloat((stats[tag].totalPnl / stats[tag].trades).toFixed(2)) : null })).sort((a, b) => b.trades - a.trades); }

// Bands are whole score points (8 = 8.00-8.99). Scores carry two decimals,
// so keying on the exact value gave nearly one "band" per trade — every
// line flagged low-sample. Win/loss trades only. Changed 2026-10-23.
function getScoreBandCalibration(trades) { let closed = (trades || []).filter(t => (t.outcome === 'win' || t.outcome === 'loss') && typeof t.score === 'number'), bands = {}; closed.forEach(t => { let s = Math.floor(t.score); if (!bands[s]) bands[s] = { trades: 0, wins: 0, totalPnl: 0 };
        bands[s].trades++; if (t.outcome === 'win') bands[s].wins++;
        bands[s].totalPnl += t.pnl || 0; }); return Object.keys(bands).map(score => ({ score: Number(score), trades: bands[score].trades, winRate: parseFloat((bands[score].wins / bands[score].trades * 100).toFixed(1)), avgPnl: parseFloat((bands[score].totalPnl / bands[score].trades).toFixed(2)), reliable: bands[score].trades >= 10 })).sort((a, b) => a.score - b.score); }

// Aggregates the MAE/MFE captured per-trade in managePositions/journalClose
// (see there). Splits by outcome since the useful question is comparative:
// do winners still dip meaningfully negative before turning (stop may be
// tighter than the setup needs), and do losers ever show real favorable
// excursion before reversing (an exit/trail rule leaving profit on the
// table, or a setup that was right on direction but wrong on timing).
// Trades with no tracked excursion (maeR/mfeR null — closed without going
// through a management cycle) are excluded rather than counted as zero.
// Added 2026-08-27.
function getExcursionStats(trades) {
    let closed = (trades || []).filter(t => t.outcome !== null && typeof t.maeR === 'number' && typeof t.mfeR === 'number');
    if (!closed.length) return null;
    function summarize(list) {
        if (!list.length) return null;
        return {
            trades: list.length,
            avgMaeR: parseFloat((list.reduce((s, t) => s + t.maeR, 0) / list.length).toFixed(2)),
            avgMfeR: parseFloat((list.reduce((s, t) => s + t.mfeR, 0) / list.length).toFixed(2)),
        };
    }
    return {
        overall: summarize(closed),
        wins: summarize(closed.filter(t => t.outcome === 'win')),
        losses: summarize(closed.filter(t => t.outcome === 'loss')),
        sampleWarning: closed.length < 20 ? 'Under 20 trades with tracked excursion — too early to act on this' : null,
    };
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getBreakdownBy(trades, keyFn) {
    let closed = (trades || []).filter(t => t.outcome !== null), groups = {};
    closed.forEach(t => {
        let key = keyFn(t);
        if (!groups[key]) groups[key] = { trades: 0, wins: 0, losses: 0, totalPnl: 0 };
        groups[key].trades++;
        if (t.outcome === 'win') groups[key].wins++; else groups[key].losses++;
        groups[key].totalPnl += t.pnl || 0;
    });
    return Object.keys(groups).map(key => ({
        key,
        trades: groups[key].trades,
        wins: groups[key].wins,
        losses: groups[key].losses,
        winRate: (groups[key].wins + groups[key].losses) > 0 ? parseFloat((groups[key].wins / (groups[key].wins + groups[key].losses) * 100).toFixed(1)) : null,
        totalPnl: parseFloat(groups[key].totalPnl.toFixed(2)),
        avgPnl: groups[key].trades ? parseFloat((groups[key].totalPnl / groups[key].trades).toFixed(2)) : 0,
    })).sort((a, b) => b.trades - a.trades);
}

function getSessionBreakdown(trades) { return getBreakdownBy(trades, t => t.session || 'unknown'); }
function getDayOfWeekBreakdown(trades) { return getBreakdownBy(trades, t => DAY_NAMES[typeof t.dayOfWeek === 'number' ? t.dayOfWeek : 0]); }

// ─── PER-FACTOR WIN RATE BREAKDOWN ─────────────────────────────────────────
// The journal already records structured (not just text) confluence data
// per trade — ote, tripleZone, fullMTFAlign, liqSwept, hasBreaker,
// vsaConfirms, judas, turtleSoup, mssType, divergence, pattern, orderFlow —
// but nothing computed win rate FROM it. This is that: for each boolean
// factor, splits trades into "factor present" vs "factor absent" and
// reports win rate for both sides, plus sample size so a 2-trade sample
// doesn't get treated the same as a 50-trade one. For categorical factors
// (mssType, divergence, pattern, orderFlow), breaks down by the actual
// value. Only reports factors/values with at least MIN_SAMPLE trades on
// both sides being compared, so this can't be misread as more confident
// than the data supports. Added 2026-08-18.
const FACTOR_WIN_RATE_MIN_SAMPLE = 8;
const BOOLEAN_FACTORS = ['ote', 'tripleZone', 'fullMTFAlign', 'liqSwept', 'hasBreaker', 'vsaConfirms', 'judas', 'turtleSoup', 'nestedFVG', 'eqHLBonus'];
const CATEGORICAL_FACTORS = ['mssType', 'divergence', 'pattern', 'orderFlow', 'candlePattern'];

function getFactorWinRates(trades) {
    const closed = (trades || []).filter(t => t.outcome !== null);
    const out = { sampleSize: closed.length, booleans: {}, categoricals: {}, note: null };
    if (closed.length < FACTOR_WIN_RATE_MIN_SAMPLE * 2) {
        out.note = `Only ${closed.length} closed trades total — need at least ${FACTOR_WIN_RATE_MIN_SAMPLE * 2} for any factor breakdown to be meaningful. Results below may be thin or absent.`;
    }
    for (const factor of BOOLEAN_FACTORS) {
        const withFactor = closed.filter(t => t[factor] === true);
        const withoutFactor = closed.filter(t => t[factor] === false || t[factor] == null);
        if (withFactor.length < FACTOR_WIN_RATE_MIN_SAMPLE && withoutFactor.length < FACTOR_WIN_RATE_MIN_SAMPLE) continue;
        const wr = (set) => {
            if (!set.length) return null;
            const wins = set.filter(t => t.outcome === 'win').length;
            const pnl = set.reduce((s, t) => s + (t.pnl || 0), 0);
            return { trades: set.length, winRate: parseFloat((wins / set.length * 100).toFixed(1)), totalPnl: parseFloat(pnl.toFixed(2)), avgPnl: parseFloat((pnl / set.length).toFixed(2)) };
        };
        out.booleans[factor] = {
            present: withFactor.length >= FACTOR_WIN_RATE_MIN_SAMPLE ? wr(withFactor) : { trades: withFactor.length, note: 'sample too small' },
            absent: withoutFactor.length >= FACTOR_WIN_RATE_MIN_SAMPLE ? wr(withoutFactor) : { trades: withoutFactor.length, note: 'sample too small' }
        };
    }
    for (const factor of CATEGORICAL_FACTORS) {
        const breakdown = getBreakdownBy(closed.filter(t => t[factor]), t => t[factor]).filter(b => b.trades >= FACTOR_WIN_RATE_MIN_SAMPLE);
        if (breakdown.length) out.categoricals[factor] = breakdown;
    }
    return out;
}


function applyJournalWeights(a, w) { if (!w || !Object.keys(w).length) return { score: a.score, hits: (a.hits || []).slice() }; let bonus = 0, bonusHits = []; if (w.liqSwept !== undefined && a.liq && a.liq.swept) { bonus += w.liqSwept; if (w.liqSwept > 0) bonusHits.push('Journal: liq sweep +' + w.liqSwept); } if (w.ote !== undefined && a.ote) { bonus += w.ote; if (w.ote > 0) bonusHits.push('Journal: OTE +' + w.ote); } if (w.tripleZone !== undefined && a.tripleZone) { bonus += w.tripleZone; if (w.tripleZone > 0) bonusHits.push('Journal: triple zone +' + w.tripleZone); } if (w.fullMTFAlign !== undefined && a.fullMTFAlign) { bonus += w.fullMTFAlign; if (w.fullMTFAlign > 0) bonusHits.push('Journal: MTF align +' + w.fullMTFAlign); } if (w.nestedFVG !== undefined && a.nestedFVG) { bonus += w.nestedFVG; if (w.nestedFVG > 0) bonusHits.push('Journal: nested FVG +' + w.nestedFVG); } if (w.m5Setup !== undefined && a.m5Entry && a.m5Entry.hasSetup) { bonus += w.m5Setup; if (w.m5Setup > 0) bonusHits.push('Journal: M5 setup +' + w.m5Setup); } if (w.divergence !== undefined && a.divergence && a.divergence.type !== 'none') { bonus += w.divergence; if (w.divergence > 0) bonusHits.push('Journal: divergence +' + w.divergence); } if (w.pattern !== undefined && a.patterns && a.patterns.patterns && a.patterns.patterns.length) { bonus += w.pattern; if (w.pattern > 0) bonusHits.push('Journal: pattern +' + w.pattern); } if (w.judas !== undefined && a.po3 && a.po3.judas) { bonus += w.judas; if (w.judas > 0) bonusHits.push('Journal: judas swing +' + w.judas); } if (w.eqHLBonus !== undefined && a.eqHLBonus) { bonus += w.eqHLBonus; if (w.eqHLBonus > 0) bonusHits.push('Journal: eq H/L +' + w.eqHLBonus); } if (w.vsaConfirms !== undefined && a.vsaConfirms) { bonus += w.vsaConfirms; if (w.vsaConfirms > 0) bonusHits.push('Journal: VSA confirms +' + w.vsaConfirms); } if (w.hasBreaker !== undefined && a.hasBreaker) { bonus += w.hasBreaker; if (w.hasBreaker > 0) bonusHits.push('Journal: Breaker block +' + w.hasBreaker); } if (w.candlePattern !== undefined && a.candlePattern) { bonus += w.candlePattern; if (w.candlePattern > 0) bonusHits.push('Journal: Candle pattern +' + w.candlePattern); } if (w.mlWinProb !== undefined && a.mlWinProb > 0.55) { bonus += w.mlWinProb; if (w.mlWinProb > 0) bonusHits.push('Journal: ML confirms +' + w.mlWinProb); } if (w.turtleSoup !== undefined && a.turtleSoup) { bonus += w.turtleSoup; if (w.turtleSoup > 0) bonusHits.push('Journal: Turtle Soup +' + w.turtleSoup); } if (w.liquiditySweep !== undefined && a.liquiditySweep) { bonus += w.liquiditySweep; if (w.liquiditySweep > 0) bonusHits.push('Journal: Liquidity Sweep +' + w.liquiditySweep); } if (w.macroTrend !== undefined && a.macroTrend) { bonus += w.macroTrend; if (w.macroTrend > 0) bonusHits.push('Journal: Macro Trend +' + w.macroTrend); } let ns = Math.min(12, Math.max(0, a.score + bonus)); let h = (a.hits || []).slice(); bonusHits.forEach(b => h.push(b)); return { score: ns, hits: h, bonusApplied: bonus }; }

// ─── TP FIX STATE ─────────────────────────────────────────────────────────
let _tpFix = null;
function loadTPFixState() { if (_tpFix) return _tpFix; try { if (fs.existsSync(TP_FIX_STATE_FILE)) { _tpFix = JSON.parse(fs.readFileSync(TP_FIX_STATE_FILE, 'utf8')); return _tpFix; } } catch (e) { logger.warn('[tpfix] load failed:', e.message); } _tpFix = { fixedTrades: {} }; return _tpFix; }

function markTPFixed(id) { let s = loadTPFixState(); s.fixedTrades[id] = { fixedAt: Date.now() }; saveTPFixState(); }
function isTPFixed(id) { let s = loadTPFixState(); return s.fixedTrades[id] !== undefined; }

function saveTPFixState() { try { let cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000, ft = _tpFix.fixedTrades || {}; Object.keys(ft).forEach(k => { if ((ft[k] && ft[k].fixedAt || 0) < cutoff) delete ft[k]; }); let keys = Object.keys(ft); if (keys.length > 1000) { keys.sort((a, b) => (ft[a] && ft[a].fixedAt || 0) - (ft[b] && ft[b].fixedAt || 0)); for (let j = 0; j < keys.length - 1000; j++) delete ft[keys[j]]; } fs.writeFileSync(TP_FIX_STATE_FILE, JSON.stringify(_tpFix, null, 2)); writeNamedState('tpFixState', _tpFix).catch(() => {}); } catch (e) { logger.warn('[tpfix] save failed:', e.message); } }

// ─── POSITION STATE ────────────────────────────────────────────────────────
// Was `ps[n] = { _savedAt: Date.now() }` before applying st's keys — a fresh
// object every call, discarding every field saved for this position by any
// EARLIER call. Every management branch (breakeven, step-trail, TP1/2/3-hit,
// split state, free-trade trigger) saves only its own 1-2 fields per call, so
// in practice each save was wiping out everything saved before it for that
// position — e.g. a breakeven flag set this cycle would vanish the next time
// step-trail count was saved, even though nothing about breakeven changed.
// This is the same class of symptom already chased once (2026-08-13, a
// position stuck past breakeven) via a different root cause (missing
// try/catch) — this is a second, independent way the same kind of state loss
// could happen. Fixed 2026-08-27: now merges into the existing record instead
// of replacing it.
function savePositionState(id, st) { try { let ps = (global._botState && global._botState._posState) || {}, n = normalizePositionId(id); if (!n) return;
        if (!ps[n]) ps[n] = {};
        ps[n]._savedAt = Date.now();
        Object.keys(st).forEach(k => ps[n][k] = st[k]); let cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; Object.keys(ps).forEach(k => { if ((ps[k] && ps[k]._savedAt || 0) < cutoff) delete ps[k]; });
        updateBotState({ _posState: ps }); } catch (e) { logger.warn('[posState] save failed:', e.message); } }

function loadPositionState(id) { try { let n = normalizePositionId(id); if (!n) return null; let ps = (global._botState && global._botState._posState) || {}; return ps[n] || null; } catch (e) { return null; } }

function rehydratePositions(positions) { positions.forEach(pos => { let saved = loadPositionState(pos.id); if (!saved) return; if (saved._tpState) { pos._tpState = saved._tpState; } if (saved._freeTradeTriggered) pos._freeTradeTriggered = true; if (saved._beTriggered) pos._beTriggered = true; if (saved._score) pos._score = saved._score; if (saved._trailActivated) pos._trailActivated = true; if (saved._eliteExits) pos._eliteExits = saved._eliteExits; if (saved._entryMLConfidence) pos._entryMLConfidence = saved._entryMLConfidence; if (saved._rlAction) pos._rlAction = saved._rlAction; if (saved._entryMLWinProb) pos._entryMLWinProb = saved._entryMLWinProb;
    if (saved._tp1Hit) pos._tp1Hit = true;
    if (saved._tp2Hit) pos._tp2Hit = true;
    if (saved._tp3Hit) pos._tp3Hit = true;
    if (saved._tp1ClosedAt) pos._tp1ClosedAt = saved._tp1ClosedAt;
    if (saved._tp2ClosedAt) pos._tp2ClosedAt = saved._tp2ClosedAt;
    if (saved._tp3ClosedAt) pos._tp3ClosedAt = saved._tp3ClosedAt;
    if (saved._canSplit) pos._canSplit = saved._canSplit;
    if (saved._is3TPSplit) pos._is3TPSplit = saved._is3TPSplit;
    if (saved._splitPositions) pos._splitPositions = saved._splitPositions;
    if (saved._tradeDuration) pos._tradeDuration = saved._tradeDuration;
    }); }

// ─── ZONE MEMORY ──────────────────────────────────────────────────────────
let _zm = null;
function loadZoneMemory() { if (_zm) return _zm; try { if (fs.existsSync(ZONE_MEMORY_FILE)) { _zm = JSON.parse(fs.readFileSync(ZONE_MEMORY_FILE, 'utf8')); return _zm; } } catch (e) { logger.warn('[zoneMemory] load failed:', e.message); } _zm = { fvgs: {}, obs: {}, breakers: {}, lastCleanup: Date.now() }; return _zm; }

function saveZoneMemory() { try { let mem = loadZoneMemory(), hasData = Object.keys(mem.fvgs || {}).length || Object.keys(mem.obs || {}).length || Object.keys(mem.breakers || {}).length; if (!hasData) return; let now = Date.now(); if (now - (mem.lastCleanup || 0) > 24 * 60 * 60 * 1000) { let week = now - 7 * 24 * 60 * 60 * 1000; Object.keys(mem.fvgs).forEach(k => { if ((mem.fvgs[k] && mem.fvgs[k].lastVisit || 0) < week) delete mem.fvgs[k]; });
        Object.keys(mem.obs).forEach(k => { if ((mem.obs[k] && mem.obs[k].lastVisit || 0) < week) delete mem.obs[k]; });
        Object.keys(mem.breakers || {}).forEach(k => { if ((mem.breakers[k] && mem.breakers[k].lastVisit || 0) < week) delete mem.breakers[k]; });
        mem.lastCleanup = now; } let cap = 500; [mem.fvgs, mem.obs, mem.breakers].forEach(b => { let keys = Object.keys(b || {}); if (keys.length > cap) { keys.sort((a, b) => (b[a] && b[a].lastVisit || 0) - (b[b] && b[b].lastVisit || 0)); for (let k = 0; k < keys.length - cap; k++) delete b[keys[k]]; } });
        fs.writeFileSync(ZONE_MEMORY_FILE, JSON.stringify(mem, null, 2)); writeNamedState('zoneMemory', mem).catch(() => {}); } catch (e) { logger.warn('[zoneMemory] save failed:', e.message); } }

function markZoneVisited(type, key, price) { let mem = loadZoneMemory(), target = type === 'fvg' ? mem.fvgs : type === 'ob' ? mem.obs : mem.breakers; if (!target) return 0; if (!target[key]) target[key] = { visits: 0, lastVisit: 0, lastPrice: 0 };
        target[key].visits++;
        target[key].lastVisit = Date.now();
        target[key].lastPrice = price;
        saveZoneMemory(); return target[key].visits; }

// ─── CONFIG ────────────────────────────────────────────────────────────────
function getCfg() { let s = global._botState || {}, sv = s.botConfig || {}; return {
    token: sv.token || process.env.META_TOKEN,
    accId: sv.accId || process.env.META_ACC_ID,
    region: sv.region || process.env.META_REGION || 'new-york',
    symbol: sv.symbol || process.env.BOT_SYMBOL || 'XAUUSD',
    currency: sv.currency || process.env.BOT_CURRENCY || 'R',
    risk: parseFloat(sv.risk || process.env.BOT_RISK || '2.0'),
    dd: parseFloat(sv.dd || process.env.BOT_DD || '12'),
    maxT: parseInt(sv.maxT || process.env.BOT_MAX_TRADES || '3'), // HARDCODED MAX 3
    minScore: parseInt(sv.minScore || process.env.BOT_MIN_SCORE || '4'),
    slBuf: parseFloat(sv.slBuf || '5'),
    rr: parseFloat(sv.rr || '1.5'),
    session: sv.session || 'both',
    // Default was 'aggressive' (scalps only) while /status displayed NORMAL
    // and .env.example sets BOT_MODE=normal — so a bot with no mode set ran
    // scalps while showing "normal". Default is now what it always showed.
    // /mode aggressive still selects scalping. Changed 2026-10-23.
    mode: s.activeMode || sv.mode || process.env.BOT_MODE || 'normal',
    broker: sv.broker || 'xm',
    secondaryToken: sv.secondaryToken || process.env.SECONDARY_META_TOKEN,
    secondaryAccId: sv.secondaryAccId || process.env.SECONDARY_META_ACC_ID,
    secondaryRegion: sv.secondaryRegion || process.env.SECONDARY_META_REGION || 'new-york',
    maxDailyLoss: parseFloat(sv.maxDailyLoss || process.env.MAX_DAILY_LOSS || '12'),
    maxMonthlyLoss: parseFloat(sv.maxMonthlyLoss || process.env.MAX_MONTHLY_LOSS || '20'),
    maxDailyTrades: parseInt(sv.maxDailyTrades || process.env.MAX_DAILY_TRADES || '20'),
    abTesting: sv.abTesting || process.env.AB_TESTING || 'false',
    trailingMethod: sv.trailingMethod || process.env.TRAILING_METHOD || 'swing',
    backupEnabled: sv.backupEnabled || process.env.BACKUP_ENABLED || 'true',
    beThreshold: parseFloat(sv.beThreshold || process.env.BE_THRESHOLD || '0.1'),
    trailActivation: parseFloat(sv.trailActivation || process.env.TRAIL_ACTIVATION || '0.2'),
    useDynamicTPSplit: false, // DISABLED – we use single order with partial closes
    // Runner structure (see placeTrade): one small lot off at TP1, the rest
    // runs to the final TP with trailing stops. Off: botConfig.runnerTP=false
    // or RUNNER_TP=false (then the whole trade closes at TP1, as before).
    runnerTP: sv.runnerTP !== undefined ? (sv.runnerTP !== false && sv.runnerTP !== 'false') : String(process.env.RUNNER_TP || 'true').toLowerCase() !== 'false',
    useKellyRR: sv.useKellyRR !== undefined ? sv.useKellyRR : true,
    maxGlobalTrades: parseInt(sv.maxGlobalTrades || process.env.MAX_GLOBAL_TRADES || '3'), // enforce 3
    useAdvancedRisk: sv.useAdvancedRisk !== undefined ? sv.useAdvancedRisk : true,
    maxHoldHours: parseFloat(sv.maxHoldHours || process.env.MAX_HOLD_HOURS || '36'),
    dailyLossLimit: parseFloat(sv.dailyLossLimit || process.env.DAILY_LOSS_LIMIT || '12'),
    monthlyLossLimit: parseFloat(sv.monthlyLossLimit || process.env.MONTHLY_LOSS_LIMIT || '20'),
    debug: DEBUG,
    useStreakProtection: false, // DISABLED – no pause
    allowedSessions: sv.allowedSessions || TIME_FILTER_CONFIG.allowedSessions,
    allowedHours: sv.allowedHours || TIME_FILTER_CONFIG.allowedHours,
    blockWeekend: sv.blockWeekend !== undefined ? sv.blockWeekend : false,
    useM1Entry: sv.useM1Entry !== undefined ? sv.useM1Entry : true,
    m1MaxWaitCandles: parseInt(sv.m1MaxWaitCandles || M1_ENTRY_CONFIG.maxWaitCandles),
    m1PullbackDepth: parseFloat(sv.m1PullbackDepth || M1_ENTRY_CONFIG.pullbackDepth),
    useEquitySizing: sv.useEquitySizing !== undefined ? sv.useEquitySizing : true,
    useNewsSentiment: sv.useNewsSentiment !== undefined ? sv.useNewsSentiment : true,
    newsBlockThreshold: parseFloat(sv.newsBlockThreshold || '0.6'),
    useMLValidation: sv.useMLValidation !== undefined ? sv.useMLValidation : true,
    useCOT: sv.useCOT !== undefined ? sv.useCOT : false,
    cotApiKey: sv.cotApiKey || process.env.COT_API_KEY,
    useHarmonic: sv.useHarmonic !== undefined ? sv.useHarmonic : true,
    useSqueezeFilter: sv.useSqueezeFilter !== undefined ? sv.useSqueezeFilter : true,
    useGeneticOptimization: sv.useGeneticOptimization !== undefined ? sv.useGeneticOptimization : true,
    useEliteFeatures: sv.useEliteFeatures !== undefined ? sv.useEliteFeatures : true,
    useCorrelation: sv.useCorrelation !== undefined ? sv.useCorrelation : true,
    useSeasonality: sv.useSeasonality !== undefined ? sv.useSeasonality : true,
    useOrderFlow: sv.useOrderFlow !== undefined ? sv.useOrderFlow : true,
    useFibonacci: sv.useFibonacci !== undefined ? sv.useFibonacci : true,
    maxSpreadATR: parseFloat(sv.maxSpreadATR || '0.3'),
    useMacroTrend: sv.useMacroTrend !== undefined ? sv.useMacroTrend : true,
    useTurtleSoup: sv.useTurtleSoup !== undefined ? sv.useTurtleSoup : true,
    useLiquidityPools: sv.useLiquidityPools !== undefined ? sv.useLiquidityPools : true,
    useStatisticalValidation: sv.useStatisticalValidation !== undefined ? sv.useStatisticalValidation : true,
    mlConfidenceThreshold: parseFloat(sv.mlConfidenceThreshold || '0.55'),
    minTradesForValidation: parseInt(sv.minTradesForValidation || '20')
}; }

// ─── SYMBOL CONFIG ─────────────────────────────────────────────────────────
function getSymConfig(sym) { sym = sym || 'XAUUSD'; let isGold = sym === 'GOLD' || sym === 'GOLD#' || sym.indexOf('XAUUSD') === 0 || sym === 'XAUUSDpro', isBTC = sym === 'BTCUSD#' || sym === 'BTCUSD' || sym === 'BTCUSDT' || sym === 'ETHUSD', isNAS = sym === 'NAS100#' || sym === 'NAS100' || sym === 'US100' || sym === 'USTEC' || sym === 'NDX100'; if (isGold) return { type: 'gold', spreadLimit: 2.5, lotVal: 10, maxLot: 10, slBufs: { aggressive: 5, sniper: 35, normal: 10 }, atrThreshHigh: 8, atrThreshLow: 3, dxyRelevant: true, minSL: 0.5, limitSlip: 1.5, eqTol: .8, maxHoldH: ADVANCED_RISK_CONFIG.maxHoldHours || 36, voidMinSize: 1.5 }; if (isBTC) return { type: 'btc', spreadLimit: 15, lotVal: 1, maxLot: 1, slBufs: { aggressive: 150, sniper: 500, normal: 250 }, atrThreshHigh: 800, atrThreshLow: 200, dxyRelevant: false, minSL: 100, limitSlip: 5, eqTol: 50, maxHoldH: ADVANCED_RISK_CONFIG.maxHoldHours || 72, voidMinSize: 200 }; if (isNAS) return { type: 'nas', spreadLimit: 10, lotVal: 10, maxLot: 5, slBufs: { aggressive: 50, sniper: 200, normal: 100 }, atrThreshHigh: 120, atrThreshLow: 40, dxyRelevant: false, minSL: 20, limitSlip: 1.5, eqTol: 5, maxHoldH: ADVANCED_RISK_CONFIG.maxHoldHours || 48, voidMinSize: 20 }; return { type: 'forex', spreadLimit: .0015, lotVal: 10, maxLot: 10, slBufs: { aggressive: .0005, sniper: .002, normal: .001 }, atrThreshHigh: .005, atrThreshLow: .001, dxyRelevant: true, minSL: .003, limitSlip: .0002, eqTol: .0003, maxHoldH: ADVANCED_RISK_CONFIG.maxHoldHours || 48, voidMinSize: .001 }; }

function getModeParams(cfg) { let sc = getSymConfig(cfg.symbol); switch (cfg.mode) {
    case 'aggressive': return { slBuf: sc.slBufs.aggressive, rr: 1.5, minScore: 2, riskMult: .5, kzRequired: false, useLimit: false, confirmCandle: false, useM5: false };
    case 'sniper': return { slBuf: sc.slBufs.sniper, rr: 3, minScore: 4, riskMult: 1.5, kzRequired: false, useLimit: true, confirmCandle: false, useM5: true };
    default: return { slBuf: cfg.slBuf || sc.slBufs.normal, rr: cfg.rr || 1.5, minScore: cfg.minScore || 2, riskMult: 1, kzRequired: false, useLimit: false, confirmCandle: false, useM5: true };
} }

function getRiskByScore(score, base) { if (score < 3) return base * .7; if (score <= 5) return base * 0.9; if (score <= 8) return base * 1.1; if (score <= 10) return base * 1.3; return base * 1.5; }

function getAdaptiveRisk(score, base, atr, adr, regime, session, consecLosses, consecWins, atrRatioOverride, adrRatioOverride) { consecLosses = consecLosses || 0; consecWins = consecWins || 0; let risk = getRiskByScore(score, base), atrRatio = typeof atrRatioOverride === 'number' && atrRatioOverride > 0 ? atrRatioOverride : atr / 10, volFactor = Math.min(1.5, Math.max(.5, 1 / atrRatio)), adrRatio = typeof adrRatioOverride === 'number' && adrRatioOverride > 0 ? adrRatioOverride : adr / 30, rangeFactor = adrRatio > 1.5 ? .8 : adrRatio < .5 ? 1.2 : 1; let sessionFactors = { london: 1.1, london_mid: 1, ny_open: 1.2, ny: 1, ny_close: .9, tokyo: .8, asian_mid: .6, sydney: .6, pre_london: .7, off_hours: .5 }; let sessionFactor = sessionFactors[session] || 1; let regimeFactors = { volatile: .6, trending: 1.2, ranging: .6, normal: 1 }; let regimeFactor = regimeFactors[regime] || 1; let streakFactor = consecLosses >= 5 ? .4 : consecLosses >= 3 ? .6 : consecWins >= 3 ? 1.05 : 1; return Math.min(3, Math.max(.3, risk * volFactor * rangeFactor * sessionFactor * regimeFactor * streakFactor)); }

function countConflicts(hits) { if (!hits || !hits.length) return 0; return hits.filter(h => h && (h.indexOf('⚠️') !== -1 || h.toLowerCase().indexOf('conflict') !== -1)).length; }
function getConflictSizeMult(n) { if (n >= 3) return 0.5; if (n === 2) return 0.65; if (n === 1) return 0.85; return 1.0; }

function validateStopLoss(cfg, entry, sl, dir, spec, isInitialPlacement, atr) {
    if (isInitialPlacement === undefined) isInitialPlacement = true;
    let sc = getSymConfig(cfg.symbol);
    let mp = getModeParams(cfg);
    let tickSize = (spec && spec.tickSize) || 0.01;
    let stopsLevel = (spec && spec.stopsLevelPrice) || 0;
    let freezeLevel = (spec && spec.freezeLevelPrice) || 0;
    let minDist = Math.max(stopsLevel || 0, freezeLevel || 0, tickSize * 3, sc.minSL || 0.01);
    if (sc.type === 'gold') minDist = Math.max(minDist, 0.5);
    let currentSl = sl;
    let currentEntry = entry;
    // The same-side-as-entry check only applies to INITIAL placement — a
    // stop can't legitimately be on the same side as entry when a trade
    // just opened, since price hasn't moved yet. For breakeven/trailing
    // moves on an already-open position (isInitialPlacement=false), an SL
    // past entry (above for a buy, below for a sell) is not just valid,
    // it's the entire point of the move. This function used to apply the
    // initial-placement rule unconditionally, silently resetting every
    // breakeven/trailing SL back toward entry's wrong side regardless of
    // real profit. Fixed 2026-08-05, found via the first real integration
    // test written for validateSLTPForPosition.
    if (isInitialPlacement) {
        if (dir === 'buy') {
            if (currentSl >= currentEntry) currentSl = currentEntry - minDist;
            if (currentEntry - currentSl < minDist) currentSl = currentEntry - minDist;
        } else {
            if (currentSl <= currentEntry) currentSl = currentEntry + minDist;
            if (currentSl - currentEntry < minDist) currentSl = currentEntry + minDist;
        }
    }
    let maxDist = Math.min(Math.max(sc.slBufs[cfg.mode] || sc.slBufs.normal || 10, 10), Math.max(minDist * 5, 15)) * v1PriceCapMult();
    // v1 sizes every trade from its stop, so a wider stop doesn't add risk;
    // this ceiling only has to catch absurd stops. The fixed $10 dates from
    // when gold was well under half today's price (~$4,100 in Oct 2026), and
    // it would cut the wider "sniper" stops (1.8× ATR) short in today's
    // swings. For a new v1 trade it now also allows 3× the ATR the stop was
    // built from: the widest stop v1 designs is about 1.8 × 1.1 × 1.5 ≈ 3×
    // ATR. Never less than the old ceiling. Added 2026-10-24.
    if (atr > 0 && isInitialPlacement && v1On()) maxDist = Math.max(maxDist, 3 * atr);
    // The ceiling caps RISK, so it only applies to a stop on the losing side
    // of entry. A trailing stop locked more than maxDist into PROFIT used to
    // be "capped" to entry - maxDist (buy) / entry + maxDist (sell) — i.e.
    // a +$10 locked stop rewritten as a -$10 loss stop. Fixed 2026-10-23.
    const slOnRiskSide = dir === 'buy' ? currentSl < currentEntry : currentSl > currentEntry;
    if (slOnRiskSide && Math.abs(currentEntry - currentSl) > maxDist) {
        let structuralDist = Math.abs(currentEntry - currentSl);
        currentSl = dir === 'buy' ? currentEntry - Math.min(maxDist, Math.abs(currentEntry - currentSl)) : currentEntry + Math.min(maxDist, Math.abs(currentEntry - currentSl));
        logger.warn('[validateStopLoss] maxDist ceiling overrode structural stop: wanted ' + structuralDist.toFixed(2) + ', capped to ' + maxDist.toFixed(2) + ' (' + cfg.symbol + ', mode=' + cfg.mode + ')');
    }
    return parseFloat(currentSl.toFixed(2));
}

function validateTakeProfit(cfg, entry, tp, sl, dir, spec, atr) {
    let sc = getSymConfig(cfg.symbol);
    let tickSize = (spec && spec.tickSize) || 0.01;
    let stopsLevel = (spec && spec.stopsLevelPrice) || 0;
    let minDist = Math.max(stopsLevel || 0, tickSize * 3, sc.minSL || 0.01);
    if (sc.type === 'gold') minDist = Math.max(minDist, 0.5);
    let slDist = Math.abs(entry - sl);
    let currentTp = tp;
    let minRR = 0.5;
    if (dir === 'buy') {
        if (currentTp <= entry) currentTp = entry + Math.max(minDist, slDist * minRR);
        if (currentTp - entry < minDist) currentTp = entry + minDist;
        if (currentTp - entry < slDist * minRR) currentTp = entry + Math.max(minDist, slDist * minRR);
        let maxTPDist = Math.min(slDist * 5, Math.max((sc.type === 'gold' ? 30 : 50) * v1PriceCapMult(), atr > 0 && v1On() ? 4.5 * atr : 0));
        if (currentTp - entry > maxTPDist) currentTp = entry + maxTPDist;
    } else {
        if (currentTp >= entry) currentTp = entry - Math.max(minDist, slDist * minRR);
        if (entry - currentTp < minDist) currentTp = entry - minDist;
        if (entry - currentTp < slDist * minRR) currentTp = entry - Math.max(minDist, slDist * minRR);
        let maxTPDist = Math.min(slDist * 5, Math.max((sc.type === 'gold' ? 30 : 50) * v1PriceCapMult(), atr > 0 && v1On() ? 4.5 * atr : 0));
        if (entry - currentTp > maxTPDist) currentTp = entry - maxTPDist;
    }
    return parseFloat(currentTp.toFixed(2));
}

async function validateSLTPForPosition(cfg, posId, entryPrice, currentPrice, newSL, newTP, isBuy, spec) {
    let positions = await getPositions(cfg);
    let pos = positions.find(p => normalizePositionId(p.id) === normalizePositionId(posId));
    if (!pos) return { sl: newSL, tp: newTP, wasClamped: false };
    let entry = parseFloat(pos.openPrice) || entryPrice;
    let dir = isBuy ? 'buy' : 'sell';
    let sc = getSymConfig(cfg.symbol);
    let minDist = Math.max((spec && spec.stopsLevelPrice) || 0, (spec && spec.freezeLevelPrice) || 0, (spec && spec.tickSize) || 0.01, sc.minSL || 0.01);
    if (sc.type === 'gold') minDist = Math.max(minDist, 0.5);
    let validatedSl = validateStopLoss(cfg, entry, newSL, dir, spec, false);
    // The TP rules (min R:R, TP no further than 5x the SL distance) are about
    // RISK, so they only apply while the SL is still on the losing side of
    // entry. Once a breakeven/trailing stop sits in profit, |entry - SL| is
    // locked-in profit, not risk — and "TP <= 5x that" dragged every target
    // down to about entry + 5x the BE buffer (~$3) on each stop move: either
    // capping the winner there, or, when price was already past that level,
    // making the broker reject the whole modification (invalid TP) so the
    // breakeven/trail never happened. The position's own TP is now kept in
    // that case. Fixed 2026-10-23.
    const slInProfit = (sl) => isBuy ? sl >= entry : sl <= entry;
    let validatedTp = slInProfit(validatedSl) ? newTP : validateTakeProfit(cfg, entry, newTP, validatedSl, dir, spec);
    if (!slInProfit(validatedSl)) {
        let slDist = Math.abs(entry - validatedSl);
        let tpDist = Math.abs(validatedTp - entry);
        let minRR = 0.3;
        if (tpDist < slDist * minRR) {
            if (isBuy) validatedTp = entry + Math.max(minDist, slDist * minRR);
            else validatedTp = entry - Math.max(minDist, slDist * minRR);
        }
    }
    // wasClamped: true when the current-price safety clamp below actually
    // overrides the proposed SL, rather than merely validating it. The
    // clamp itself is correct and necessary (prevents sending an SL the
    // broker would reject as being on the wrong side of live price) — but
    // its activation used to be invisible to callers, so a breakeven move
    // that got silently substituted with a near-entry emergency price
    // still got reported as a genuine breakeven. Added 2026-08-04.
    let wasClamped = false;
    let minSlFromCurrent = Math.max(minDist * 0.5, 0.3);
    if (isBuy && validatedSl >= currentPrice - minSlFromCurrent) { validatedSl = currentPrice - Math.max(minDist, minSlFromCurrent); wasClamped = true; }
    if (!isBuy && validatedSl <= currentPrice + minSlFromCurrent) { validatedSl = currentPrice + Math.max(minDist, minSlFromCurrent); wasClamped = true; }
    let minTpFromCurrent = Math.max(minDist * 0.5, 0.3);
    if (isBuy && validatedTp <= currentPrice + minTpFromCurrent) validatedTp = currentPrice + Math.max(minDist, minTpFromCurrent);
    if (!isBuy && validatedTp >= currentPrice - minTpFromCurrent) validatedTp = currentPrice - Math.max(minDist, minTpFromCurrent);
    validatedSl = validateStopLoss(cfg, entry, validatedSl, dir, spec, false);
    if (!slInProfit(validatedSl)) validatedTp = validateTakeProfit(cfg, entry, validatedTp, validatedSl, dir, spec);
    return { sl: parseFloat(validatedSl.toFixed(2)), tp: parseFloat(validatedTp.toFixed(2)), wasClamped };
}

// ─── API FUNCTIONS ─────────────────────────────────────────────────────────
let _workingRegion = null, _resolvedSymbol = null, _resolvedSymbolTime = 0;
// MetaAPI account health (see checkMetaApiAccount): last result, when it ran,
// and what the account itself reports (gold symbol name, region).
let _metaApiCheck = null, _metaApiCheckTs = 0, _discoveredGoldSymbol = null, _accountRegion = null;
const METAAPI_CHECK_INTERVAL_MS = 10 * 60 * 1000;

function maTradeUrl(cfg, p) { return 'https://mt-client-api-v1.' + (cfg.region || 'new-york') + '.agiliumtrade.ai/users/current/accounts/' + cfg.accId + p; }
function maMarketUrl(cfg, p) { return 'https://mt-market-data-client-api-v1.' + (cfg.region || 'new-york') + '.agiliumtrade.ai/users/current/accounts/' + cfg.accId + p; }

async function fetchWithTimeout(url, opts, ms) { opts = opts || {}; ms = ms || 20000; let ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), ms); try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); } }

async function maGet(cfg, p, market, timeoutMs) {
    market = market || false;
    let url = market ? maMarketUrl(cfg, p) : maTradeUrl(cfg, p);
    return globalRateLimiter.execute(async () => {
        let res = await fetchWithTimeout(url, { headers: { 'auth-token': cfg.token, Accept: 'application/json' } }, timeoutMs || 20000);
        if (!res.ok) {
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('retry-after') || '5');
                logger.warn(`[RateLimiter] Got 429, waiting ${retryAfter}s`);
                await sleep(retryAfter * 1000);
                return maGet(cfg, p, market, timeoutMs);
            }
            let txt = await res.text().catch(() => '');
            throw new Error('GET ' + p + ' → ' + res.status + ': ' + txt.slice(0, 200));
        }
        return res.json();
    });
}

async function maPost(cfg, p, body) {
    let url = maTradeUrl(cfg, p);
    return globalRateLimiter.execute(async () => {
        let res = await fetchWithTimeout(url, { method: 'POST', headers: { 'auth-token': cfg.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        let txt = await res.text();
        if (!res.ok) {
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('retry-after') || '5');
                logger.warn(`[RateLimiter] Got 429 on POST, waiting ${retryAfter}s`);
                await sleep(retryAfter * 1000);
                return maPost(cfg, p, body);
            }
            throw new Error('POST ' + p + ' → ' + res.status + ': ' + txt.slice(0, 200));
        }
        let parsed;
        try { parsed = JSON.parse(txt); } catch (e) { return { raw: txt }; }
        let okCodes = [10009, 10010, 10008];
        if (parsed && parsed.numericCode && okCodes.indexOf(parsed.numericCode) === -1) {
            throw new Error('Broker rejected: ' + (parsed.stringCode || 'UNKNOWN') + ' — ' + (parsed.message || parsed.error || ''));
        }
        if (parsed && parsed.error) throw new Error('Broker error: ' + parsed.error);
        return parsed;
    });
}

async function maPut(cfg, p, body) {
    let url = maTradeUrl(cfg, p);
    return globalRateLimiter.execute(async () => {
        let res = await fetchWithTimeout(url, { method: 'PUT', headers: { 'auth-token': cfg.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        let txt = await res.text();
        if (!res.ok) {
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('retry-after') || '5');
                logger.warn(`[RateLimiter] Got 429 on PUT, waiting ${retryAfter}s`);
                await sleep(retryAfter * 1000);
                return maPut(cfg, p, body);
            }
            throw new Error('PUT ' + p + ' → ' + res.status + ': ' + txt.slice(0, 200));
        }
        try { return JSON.parse(txt); } catch (e) { return { raw: txt }; }
    });
}

async function resolveSymbol(cfg) { let now = Date.now(); if (_resolvedSymbol && now - _resolvedSymbolTime < 3600000) return _resolvedSymbol; let regions = _workingRegion ? [cfg.region, _workingRegion] : [cfg.region, 'new-york', 'london', 'new-york2', 'london2'], symbols = [_discoveredGoldSymbol, cfg.symbol, 'XAUUSD', 'GOLD', 'XAUUSDpro'].filter((x, i, a) => x && a.indexOf(x) === i); for (let r of regions)
    for (let s of symbols) { try { let tc = { token: cfg.token, accId: cfg.accId, region: r }; let d = await maGet(tc, '/symbols/' + encodeURIComponent(s) + '/current-price', false); if (d && d.ask && d.bid) { _resolvedSymbol = s; _resolvedSymbolTime = now; _workingRegion = r; if (r !== cfg.region) { logger.info('[engine] ✅ Found working region: ' + r);
                    updateBotState({ botConfig: { ...(global._botState && global._botState.botConfig || {}), region: r } }); } return s; } } catch (e) { if (isBrokerConnectionError(e.message)) continue; } } return cfg.symbol; }

function isBrokerConnectionError(m) { return m && /not connected to broker|does not match the account region|TimeoutError|TooManyRequestsError|→ 504|→ 429/.test(m); }

// Short, readable form of a maGet/maPost error for status messages:
// "GET /historical-market-data/... → 404: {...}" → "HTTP 404: {...}".
function compactMetaApiError(m) {
    m = String(m || '');
    if (/aborted|AbortError/i.test(m)) return 'no response (timeout)';
    const i = m.indexOf('→ ');
    return (i >= 0 ? 'HTTP ' + m.slice(i + 2) : m).replace(/\s+/g, ' ').slice(0, 160);
}

// ─── METAAPI ACCOUNT CHECK ─────────────────────────────────────────────────
// When candles couldn't be fetched, every request error was swallowed and
// the cycle only said "No candle data for GOLD# (sweep budget exceeded)" —
// the same message for a rejected token, a deleted or undeployed account, a
// broker login failure or a wrong symbol name. (Seen live: every cycle since
// at least 2026-10-16 failed that way, so the bot never analysed or traded.)
// This asks MetaAPI's provisioning API about the account itself and turns
// the answer into a plain-language fix — shown in /status and /analysis and
// sent to Telegram when it changes (or every 6h while unresolved). It also
// learns the account's real region and what the broker calls gold, which
// the candle sweep then tries first. Runs at most every 10 minutes, only
// after a failed candle fetch. Added 2026-10-23.
// `cause` is the error that triggered the check (a failed candle fetch or
// the startup probe). A token can be limited to trading access, in which
// case the account lookup itself is refused even though trading works — so
// "token rejected" / "account not found" only count as definitive
// (blocking) when the bot's own requests failed the same way.
async function checkMetaApiAccount(cfg, force, cause) {
    const now = Date.now();
    if (!force && _metaApiCheck && now - _metaApiCheckTs < METAAPI_CHECK_INTERVAL_MS) return _metaApiCheck;
    _metaApiCheckTs = now;
    const res = { ts: new Date(now).toISOString(), ok: false, blocking: false, summary: '', fix: '' };
    const causeTxt = String(cause || '');
    const causeAuth = /→ 40[13]\b|Unauthori[sz]ed|Forbidden/i.test(causeTxt);
    const causeNotFound = /→ 404\b/.test(causeTxt) && /account/i.test(causeTxt) && !/symbol/i.test(causeTxt);
    try {
        const url = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/' + encodeURIComponent(cfg.accId);
        const r = await fetchWithTimeout(url, { headers: { 'auth-token': cfg.token, Accept: 'application/json' } }, 15000);
        const txt = await r.text().catch(() => '');
        if ((r.status === 401 || r.status === 403) && causeAuth) {
            res.blocking = true;
            res.summary = 'MetaAPI rejected the API token (HTTP ' + r.status + ')';
            res.fix = 'Make a new API token at app.metaapi.cloud and put it in Render → Environment → `META_TOKEN`, then redeploy.';
        } else if (r.status === 401 || r.status === 403) {
            res.summary = 'MetaAPI wouldn\'t show this account\'s details (HTTP ' + r.status + ')' + (causeTxt ? '; the bot\'s own request failed with: ' + compactMetaApiError(causeTxt) : '');
            res.fix = 'In app.metaapi.cloud check that the account is Deployed and Connected and that the token in `META_TOKEN` has access to it.';
        } else if (r.status === 404 && (causeNotFound || !causeTxt)) {
            res.blocking = !!causeNotFound;
            res.summary = 'MetaAPI has no account with ID ' + cfg.accId;
            res.fix = 'Copy the account ID from app.metaapi.cloud → Accounts into Render → Environment → `META_ACC_ID`, then redeploy.';
        } else if (r.status === 404) {
            res.summary = 'MetaAPI couldn\'t find account ' + cfg.accId + ' through the account lookup; the bot\'s own request failed with: ' + compactMetaApiError(causeTxt);
            res.fix = 'Check in app.metaapi.cloud that this account ID (`META_ACC_ID`) is right and the account is Deployed.';
        } else if (!r.ok) {
            res.summary = 'MetaAPI answered HTTP ' + r.status + (txt ? ': ' + txt.replace(/\s+/g, ' ').slice(0, 120) : '');
            res.fix = 'Check status.metaapi.cloud. If MetaAPI is up, check the account at app.metaapi.cloud.';
        } else {
            let acc = {};
            try { acc = JSON.parse(txt); } catch (e) { /* keep defaults */ }
            const st = acc.state || 'UNKNOWN', conn = acc.connectionStatus || 'UNKNOWN';
            res.state = st; res.connectionStatus = conn; res.region = acc.region || null; res.server = acc.server || null;
            if (acc.region) {
                _accountRegion = acc.region;
                if (acc.region !== cfg.region) {
                    _workingRegion = acc.region;
                    updateBotState({ botConfig: { ...(global._botState && global._botState.botConfig || {}), region: acc.region } });
                }
            }
            if (st !== 'DEPLOYED') {
                // Not running at MetaAPI — nothing will work until it's deployed.
                res.blocking = ['UNDEPLOYED', 'DRAFT', 'CREATED', 'DEPLOY_FAILED', 'DELETING', 'DELETE_FAILED'].indexOf(st) !== -1;
                res.summary = 'Your MetaAPI account is ' + st + ' (not running)';
                res.fix = 'Open app.metaapi.cloud → Accounts → this account → Deploy. MetaAPI stops accounts e.g. when free credit or the subscription runs out, or the broker login keeps failing.';
            } else if (conn !== 'CONNECTED') {
                res.summary = 'Your MetaAPI account is running but ' + conn + (acc.server ? ' (broker server ' + acc.server + ')' : '');
                res.fix = conn === 'DISCONNECTED_FROM_BROKER'
                    ? 'MetaAPI can\'t log in to your MT5 account — the password or server may have changed, or the demo account expired. Fix the login in app.metaapi.cloud (or add a new account and update `META_ACC_ID`).'
                    : 'MetaAPI\'s terminal isn\'t connected. If this lasts more than ~15 minutes, undeploy and redeploy the account at app.metaapi.cloud.';
            } else {
                res.ok = true;
                res.summary = 'MetaAPI account is running and connected' + (acc.region ? ' (region ' + acc.region + ')' : '');
                // The account works, so the symbol is the usual suspect — ask
                // the broker what gold is called on this account.
                try {
                    const syms = await maGet({ token: cfg.token, accId: cfg.accId, region: acc.region || cfg.region }, '/symbols', false, 15000);
                    if (Array.isArray(syms)) {
                        // XM's weekend-priced GOLD24-7 is a different market (weekend
                        // quotes, wide spreads) — never pick it. 2026-10-24.
                        const names = syms.map(s => typeof s === 'string' ? s : (s && (s.symbol || s.name))).filter(Boolean).filter(n => !/24[-_ ]?7|weekend/i.test(n));
                        const want = String(cfg.symbol || '').toUpperCase();
                        const gold = names.find(n => n.toUpperCase() === want) || names.find(n => /^XAUUSD/i.test(n)) || names.find(n => /^GOLD/i.test(n));
                        if (gold) {
                            _discoveredGoldSymbol = gold; res.goldSymbol = gold;
                            if (gold !== cfg.symbol) res.fix = 'Your broker calls gold "' + gold + '", not "' + cfg.symbol + '". The bot now tries it automatically; to make it permanent set `BOT_SYMBOL=' + gold + '` in Render.';
                        } else {
                            res.fix = 'No gold symbol (XAUUSD/GOLD...) is listed on this MT5 account — check that gold is tradable on this account type.';
                        }
                    }
                } catch (e) { res.fix = 'Could not read the symbol list: ' + compactMetaApiError(e.message); }
            }
        }
    } catch (e) {
        res.summary = 'MetaAPI did not respond (' + compactMetaApiError(e && e.message) + ')';
        res.fix = 'Check status.metaapi.cloud. If MetaAPI is up, Render may be unable to reach it right now.';
    }
    const prev = (global._botState || {})._metaApiStatus;
    _metaApiCheck = res;
    try { updateBotState({ _metaApiStatus: res }); } catch (e) { /* display only */ }
    const changed = !prev || prev.summary !== res.summary || prev.fix !== res.fix;
    if (!res.ok || changed) logger.warn('[metaapi-check] ' + res.summary + (res.fix ? ' — ' + res.fix : ''));
    // Telegram: when the diagnosis changes, every 6h while unresolved, and
    // once when it recovers.
    const due = now - (global._metaApiAlertTs || 0) > 6 * 60 * 60 * 1000;
    const actionable = !res.ok || !!res.fix;
    if ((actionable && (changed || due)) || (!actionable && prev && !prev.ok)) {
        global._metaApiAlertTs = now;
        sendTelegram((actionable ? '⚠️' : '✅') + ' *MetaAPI check*\n' + res.summary + (res.fix ? '\n👉 ' + res.fix : ''));
    }
    return res;
}

// Startup probe (called by server.js shortly after boot): one cheap request
// that works even while the market is closed. If the bot can't talk to the
// account, run the full check so the reason reaches Telegram right after a
// deploy instead of at the next market open. Silent when everything works.
async function startupMetaApiCheck(cfg) {
    if (!cfg || !cfg.token || !cfg.accId) return null;
    try {
        await maGet(cfg, '/account-information', false, 15000);
        if (_metaApiCheck && !_metaApiCheck.ok) await checkMetaApiAccount(cfg, true);
    } catch (e) {
        return checkMetaApiAccount(cfg, true, e.message);
    }
    // Trading access works; now check price history, which is a separate server.
    try { await startupCandleProbe(cfg); } catch (e) { logger.warn('[candles] startup check failed to run: ' + e.message); }
    return { ok: true };
}

// ─── STARTUP CANDLE CHECK ──────────────────────────────────────────────────
// The account check above only proves the TRADING API works. Candles come from
// MetaAPI's separate price-history (market-data) server, and from at least
// 2026-10-16 to 2026-10-23 every single cycle failed there: "No candle data
// for GOLD# (sweep budget exceeded)", ~61 s per cycle, i.e. the requests got
// no answer at all. So the bot never analysed or traded. Candles can be
// downloaded while the market is closed, so try right after every deploy and
// say exactly what happened: whether the server is reachable, how long it
// took, and MetaAPI's answer — before the market opens, not after.
// Telegram on failure (when the result changes, or every 6 h) and once on
// recovery; /status shows the last result. Added 2026-10-24.
async function _candleProbeOnce(cfg, region, sym) {
    const host = 'https://mt-market-data-client-api-v1.' + region + '.agiliumtrade.ai';
    const res = { ts: new Date().toISOString(), ok: false, symbol: sym, region };
    const isTimeout = e => /abort|timeout/i.test(String(e && e.name) + ' ' + String(e && e.message));
    // 1) Can Render reach the server at all? Any quick HTTP answer (even 404)
    //    means the network path works; no account or token involved.
    let t0 = Date.now();
    try { const r = await fetchWithTimeout(host + '/', {}, 15000); res.hostStatus = r.status; }
    catch (e) { res.hostStatus = isTimeout(e) ? 'no answer' : String(e && e.message || e).slice(0, 80); }
    res.hostMs = Date.now() - t0;
    // 2) The real request, with far more patience than a cycle has.
    t0 = Date.now();
    try {
        const r = await fetchWithTimeout(host + '/users/current/accounts/' + cfg.accId + '/historical-market-data/symbols/' + encodeURIComponent(sym) + '/timeframes/15m/candles?limit=5',
            { headers: { 'auth-token': cfg.token, Accept: 'application/json' } }, 60000);
        const txt = await r.text().catch(() => '');
        if (r.ok) {
            let data = null;
            try { data = JSON.parse(txt); } catch (e) { /* treated as empty below */ }
            res.bars = Array.isArray(data) ? data.length : 0;
            res.ok = res.bars > 0;
            if (!res.ok) res.error = 'MetaAPI answered with no candles';
        } else {
            res.error = 'HTTP ' + r.status + (txt ? ': ' + txt.replace(/\s+/g, ' ').slice(0, 160) : '');
        }
    } catch (e) {
        res.error = isTimeout(e) ? 'no answer within 60 s' : String(e && e.message || e).slice(0, 160);
    }
    res.ms = Date.now() - t0;
    return res;
}

// Candle-feed alert. From at least 16 to 23 Oct 2026 every cycle failed to
// get candles and nothing told anyone: the bot simply didn't trade for a
// week. After 5 failed cycles in a row (~15 minutes of market time) say so on
// Telegram with the likely fix, repeat every 6 h while it lasts, and send one
// message when candles work again. Added 2026-10-24.
function _noteCandleFeed(ok, message) {
    const now = Date.now();
    if (ok) {
        if (global._candleAlertedAt) {
            global._candleAlertedAt = 0;
            sendTelegram('✅ *Price data is back*\nCandles are downloading again, so the bot can analyse and trade.');
        }
        return;
    }
    const streak = global._candleFailStreak || 0;
    if (streak < 5) return;
    if (global._candleAlertedAt && now - global._candleAlertedAt < 6 * 60 * 60 * 1000) return;
    global._candleAlertedAt = now;
    const hung = /timeout|no response|no answer|sweep budget/i.test(String(message));
    sendTelegram('🚫 *No price data, so the bot can\'t trade*\nThe last ' + streak + ' cycles (about ' + streak * 3 + ' min) couldn\'t download candles from MetaAPI:\n' + String(message).slice(0, 220) + '\n\n👉 ' + (hung
        ? 'MetaAPI\'s terminal isn\'t answering price-history requests. MetaAPI documents an MT5 terminal bug that does this, and their fix is to redeploy the account: app.metaapi.cloud → Accounts → this account → Undeploy, then Deploy. Trading and open positions aren\'t affected.'
        : 'See /status for details, and check the account at app.metaapi.cloud.'));
}

async function startupCandleProbe(cfg) {
    let sym = cfg.symbol;
    try { sym = await resolveSymbol(cfg); } catch (e) { /* keep the configured name */ }
    let res = await _candleProbeOnce(cfg, _accountRegion || _workingRegion || cfg.region || 'new-york', sym);
    if (!res.ok) {
        // Where does MetaAPI say the account lives, and is it running? (Sends
        // its own Telegram if it finds an account-level problem.) If the
        // region differs, try once more there.
        const acc = await checkMetaApiAccount(cfg, true, res.error).catch(() => null);
        const region2 = (acc && acc.region) || res.region, sym2 = _discoveredGoldSymbol || sym;
        if (region2 !== res.region || sym2 !== res.symbol) res = await _candleProbeOnce(cfg, region2, sym2);
        if (acc && acc.summary) res.account = acc.summary;
    }
    const secs = ms => (ms / 1000).toFixed(1) + ' s';
    const hostOk = typeof res.hostStatus === 'number';
    if (!res.ok) {
        const e = res.error || '';
        if (!hostOk) res.fix = 'Render can\'t reach MetaAPI\'s price-history server at all (mt-market-data-client-api-v1.' + res.region + '.agiliumtrade.ai). Check status.metaapi.cloud. If MetaAPI is up, ask MetaAPI support whether that server can be reached from Render\'s Singapore region.';
        else if (/^HTTP 40[13]/.test(e)) res.fix = 'MetaAPI refused the token for price history. Make a new API token with full access at app.metaapi.cloud, put it in Render → Environment → META_TOKEN, and redeploy.';
        else if (/^HTTP 404/.test(e)) res.fix = 'MetaAPI has no price history for "' + res.symbol + '" on this account. Check what gold is called in MT5 Market Watch and set BOT_SYMBOL in Render.';
        else if (/no answer/.test(e)) res.fix = 'The server is up (it answered in ' + secs(res.hostMs) + ') but sent no candles for this account within 60 s. MetaAPI documents an MT5 terminal bug that hangs price-history requests, and their fix is to redeploy the account: app.metaapi.cloud → Accounts → this account → Undeploy, then Deploy (trading and open positions aren\'t affected). Then redeploy the bot so this check runs again. If it still fails, send MetaAPI support your account ID and this message.';
        else res.fix = 'Check status.metaapi.cloud and the account at app.metaapi.cloud.';
    }
    const prev = (global._botState || {})._candleProbe;
    res.sig = res.ok ? 'ok' : (res.error || '').replace(/\d+(\.\d+)?/g, '#') + '|' + hostOk;
    try { updateBotState({ _candleProbe: res }); } catch (e) { /* display only */ }
    if (res.ok) {
        logger.info('[candles] Startup check OK: ' + res.bars + ' M15 candles for ' + res.symbol + ' in ' + secs(res.ms) + ' (region ' + res.region + ')');
        if (prev && prev.ok === false) sendTelegram('✅ *Price history is working*\nThe bot downloaded ' + res.symbol + ' candles from MetaAPI in ' + secs(res.ms) + ', so it can analyse and trade.');
    } else {
        logger.warn('[candles] Startup check FAILED for ' + res.symbol + ' (region ' + res.region + '): ' + res.error + ' after ' + secs(res.ms) + '; server reachable: ' + (hostOk ? 'yes, HTTP ' + res.hostStatus + ' in ' + secs(res.hostMs) : 'no (' + res.hostStatus + ')') + ' — ' + res.fix);
        const due = !prev || prev.sig !== res.sig || Date.now() - new Date(prev.alertedAt || 0).getTime() > 6 * 60 * 60 * 1000;
        if (due) {
            res.alertedAt = res.ts;
            try { updateBotState({ _candleProbe: res }); } catch (e) { /* display only */ }
            sendTelegram('🚫 *The bot can\'t get price history*\nIt needs candles from MetaAPI before every decision. This failed on every cycle last week, which is why no trades were placed.\n\nCheck just now (' + res.symbol + ', region ' + res.region + '):\n• Price-history server reachable: ' + (hostOk ? 'yes (' + secs(res.hostMs) + ')' : 'NO (' + res.hostStatus + ')') + '\n• Candles: ' + res.error + ' (after ' + secs(res.ms) + ')' + (res.account ? '\n• Account: ' + res.account : '') + '\n\n👉 ' + res.fix);
        }
    }
    return res;
}

let _symSpecCache = {}, _symSpecCacheTime = {};
async function getBrokerSymbolSpec(cfg) { let key = cfg.symbol, now = Date.now(); if (_symSpecCache[key] && now - (_symSpecCacheTime[key] || 0) < 3600000) return _symSpecCache[key]; try { let sym = await resolveSymbol(cfg), spec = await maGet(cfg, '/symbols/' + encodeURIComponent(sym) + '/specification', false), point = spec.tickSize || .01; let res = { contractSize: spec.contractSize || 100, tickSize: point, stopsLevelPrice: (spec.stopsLevel || 0) * point, freezeLevelPrice: (spec.freezeLevel || 0) * point, minVolume: spec.minVolume || .01, maxVolume: spec.maxVolume || 100, volumeStep: spec.volumeStep || .01, swapLong: spec.swapLong, swapShort: spec.swapShort, swapMode: spec.swapMode, swapRollover3Days: spec.swapRollover3Days };
        _symSpecCache[key] = res;
        _symSpecCacheTime[key] = now; return res; } catch (e) { let sc = getSymConfig(cfg.symbol); return { contractSize: sc.lotVal * 10, tickSize: .01, stopsLevelPrice: 0, freezeLevelPrice: 0, minVolume: .01, maxVolume: sc.maxLot, volumeStep: .01 }; } }

// ─── CANDLE ORDER ──────────────────────────────────────────────────────────
// Every candle fetch used to do `data.reverse()`, assuming MetaAPI returns
// newest-first. It doesn't: MetaAPI returns candles OLDEST-first (its own
// SDK example pages backwards using candles[0].time as the next cursor, and
// the SDK client does no reordering). Reversing made every array NEWEST-
// first, while all analysis code here (and in src/indicators) treats
// candles[candles.length - 1] as "now" — so the bot has been reading the
// market backwards: "current price" was the oldest bar in the window (~37h
// back on M15, ~30 days back on D1), uptrends read as downtrends, and FVG/
// OB/MSS/sweeps/PDH-PDL were all evaluated on time-reversed data. Position
// management also got that stale price as curP. This is the "/analysis
// price matches where price was ~2 days ago" mystery from 2026-08-20/25.
// Sorting by each candle's own timestamp is correct whichever order the
// API uses, so this can't regress even if that assumption were wrong.
// Fixed 2026-10-23.
let _candleOrderWarned = false;
function toChronological(data) {
    if (!Array.isArray(data) || data.length < 2) return Array.isArray(data) ? data.slice() : [];
    const ts = data.map(c => c && c.time != null ? new Date(c.time).getTime() : NaN);
    if (ts.every(t => !isNaN(t))) {
        return data.map((c, i) => ({ c, t: ts[i] })).sort((a, b) => a.t - b.t).map(x => x.c);
    }
    // No usable timestamps — can't know the order. Keep the API's documented
    // order (oldest-first) rather than guessing, and say so once.
    if (!_candleOrderWarned) { _candleOrderWarned = true; logger.warn('[candles] Candles missing time fields — using API order as-is'); }
    return data.slice();
}

// Every volume-based feature here (VSA, order flow, volume profile, VWAP)
// reads candle.volume — but for spot gold/FX CFDs MetaAPI's `volume` (real
// exchange volume) is 0; only `tickVolume` is populated. With all-zero
// volume, VSA could only "confirm" via wick patterns (~1 in 10 snapshots),
// and VSA confirmation has been a REQUIRED quality-gate check since
// 2026-08-12 — so roughly 9 in 10 otherwise-valid setups were blocked as
// "No VSA confirmation", and order flow / volume profile ran on zeros. Tick
// volume is the standard volume proxy for these instruments (it's what MT5
// charts show by default). Only applied when the broker supplies no real
// volume at all, so the two are never mixed. Added 2026-10-23.
function useTickVolumeIfNoVolume(arr) {
    if (!Array.isArray(arr) || !arr.length) return arr;
    if (arr.some(c => c && c.volume > 0)) return arr;
    if (!arr.some(c => c && c.tickVolume > 0)) return arr;
    return arr.map(c => (c && c.tickVolume > 0 ? Object.assign({}, c, { volume: c.tickVolume }) : c));
}
function normalizeCandles(data) { return useTickVolumeIfNoVolume(toChronological(data)); }

async function getCandles(cfg, tf, count) {
    count = count || 100;
    let key = cfg.symbol + '_' + tf + '_' + count, now = Date.now();
    if (_candleCache[key] && now - (_candleCacheTime[key] || 0) < (CANDLE_FRESHNESS_MS[tf] || 120000)) return _candleCache[key];
    // Previously always swept every region/symbol combination (up to 5
    // regions x 4 symbols = 20 attempts) sequentially, each with the full
    // 20s timeout — worst case ~400s for a SINGLE timeframe if MetaAPI was
    // broadly slow rather than cleanly down. isBrokerConnectionError's
    // `continue` was a no-op either way: the nested for-loops try every
    // combination regardless of error type, since falling out of a catch
    // with no throw just continues the loop naturally. This is the real
    // explanation for "Cycle timed out after 120s" + zero trades across
    // multiple days reported 2026-08-17 — far more than the sequential-
    // timeframe issue fixed just above. Fixed by: (1) trying the
    // known-good cached region+symbol FIRST with the normal 20s timeout —
    // the common case, once resolveSymbol/getCandles have succeeded once,
    // should resolve in one attempt; (2) only falling back to the full
    // sweep if that fails, using a much shorter 6s per-attempt timeout
    // there, since a discovery attempt that's actually going to work
    // responds quickly; (3) capping the sweep to a 40s total budget so one
    // getCandles() call can never single-handedly consume the 120s cycle
    // ceiling. Fixed 2026-08-17.
    // A known account-level problem (bad token, unknown or undeployed
    // account — see checkMetaApiAccount) makes every request fail, so don't
    // spend ~20 requests proving it again; the check re-runs every 10 min.
    if (_metaApiCheck && _metaApiCheck.blocking && now - _metaApiCheckTs < METAAPI_CHECK_INTERVAL_MS) {
        throw new Error('MetaAPI: ' + _metaApiCheck.summary + (_metaApiCheck.fix ? ' — ' + _metaApiCheck.fix : ''));
    }
    // The last MetaAPI error is now kept and reported — it used to be
    // swallowed, leaving only "No candle data" with no reason. 2026-10-23.
    let lastErr = null;
    const why = () => (lastErr ? ' — MetaAPI said: ' + compactMetaApiError(lastErr) : '');
    if (_workingRegion && _resolvedSymbol) {
        try {
            let tc = { token: cfg.token, accId: cfg.accId, region: _workingRegion };
            let fastPath = '/historical-market-data/symbols/' + encodeURIComponent(_resolvedSymbol) + '/timeframes/' + tf + '/candles?limit=' + count;
            let data = await maGet(tc, fastPath, true, 20000);
            if (Array.isArray(data) && data.length) {
                let ordered = normalizeCandles(data);
                _candleCache[key] = ordered;
                _candleCacheTime[key] = now;
                cleanupCandleCache();
                return ordered;
            }
            lastErr = 'empty candle list for ' + _resolvedSymbol;
        } catch (e) { lastErr = e.message; /* fall through to the full sweep below */ }
    }
    // The account's real region and the broker's own name for gold (both
    // learned by checkMetaApiAccount) go first. Unique entries only.
    const uniq = a => a.filter((x, i) => x && a.indexOf(x) === i);
    // Candles are only requested for names the account is known to have: the
    // broker's own gold symbol (from its symbol list), the one confirmed by a
    // live quote (resolveSymbol), and the configured one. The blind guesses
    // XAUUSD/GOLD/XAUUSDpro are gone: MetaAPI documents an MT5 terminal bug
    // that hangs the terminal when candles are requested for a symbol with
    // missing market data, and from 16 to 23 Oct 2026 every candle request
    // got no answer at all. Finding the right name still works through live
    // quotes and the symbol list, which don't have that problem. 2026-10-24.
    let regions = uniq(_workingRegion ? [_accountRegion, cfg.region, _workingRegion, 'new-york', 'london'] : [_accountRegion, cfg.region, 'new-york', 'london', 'new-york2', 'london2']),
        symbols = uniq([_discoveredGoldSymbol, _resolvedSymbol, cfg.symbol]),
        sweepStart = Date.now(), SWEEP_BUDGET_MS = 40000, SWEEP_TIMEOUT_MS = 6000;
    for (let r of regions) {
        for (let s of symbols) {
            if (Date.now() - sweepStart > SWEEP_BUDGET_MS) throw new Error('No candle data for ' + cfg.symbol + ' (sweep budget exceeded)' + why());
            try {
                let tc = { token: cfg.token, accId: cfg.accId, region: r };
                let data = await maGet(tc, '/historical-market-data/symbols/' + encodeURIComponent(s) + '/timeframes/' + tf + '/candles?limit=' + count, true, SWEEP_TIMEOUT_MS);
                if (Array.isArray(data) && data.length) {
                    if (r !== cfg.region) {
                        updateBotState({ botConfig: { ...(global._botState && global._botState.botConfig || {}), region: r } });
                    }
                    // Remember the working pair even when it's the configured
                    // region (it used to be kept only for a DIFFERENT region,
                    // so the fast path above never ran and every timeframe
                    // re-swept from the configured symbol).
                    _workingRegion = r;
                    _resolvedSymbol = s;
                    _resolvedSymbolTime = now;
                    if (s !== cfg.symbol && !global._symbolNoticeSent) {
                        global._symbolNoticeSent = true;
                        logger.warn('[candles] "' + cfg.symbol + '" has no data on this account — using "' + s + '" (set BOT_SYMBOL=' + s + ' to make it permanent)');
                    }
                    let ordered = normalizeCandles(data);
                    _candleCache[key] = ordered;
                    _candleCacheTime[key] = now;
                    cleanupCandleCache();
                    return ordered;
                }
                lastErr = 'empty candle list for ' + s + ' in ' + r;
            } catch (e) { lastErr = e.message; if (isBrokerConnectionError(e.message)) continue; }
        }
    }
    throw new Error('No candle data for ' + cfg.symbol + why());
}

async function fetchAllTimeframes(cfg, mp) {
  // Was sequential — 6 timeframes, each awaited one after another with a
  // 20s-per-call ceiling. Worst case (MetaAPI slow but not fully down, which
  // matches "unreachable: Timeout"-style reports better than a hard outage)
  // added up to ~120.75s: right at the cycle's own 120s watchdog, meaning a
  // merely-degraded MetaAPI could reliably time out EVERY cycle rather than
  // occasionally — and the fallback-region retry below repeated the same
  // sequential pattern again on top of that. Reported symptom 2026-08-17:
  // "Cycle timed out after 120s" + zero trades for multiple consecutive
  // days. Switched to parallel fetching — worst case is now bounded by the
  // single slowest call (~20s) instead of their sum. The rate limiter
  // (globalRateLimiter, 2 req/s) already paces actual dispatch internally,
  // so requesting all 6 concurrently doesn't create a burst — it just lets
  // independent calls overlap instead of queuing behind each other
  // needlessly. Fixed 2026-08-17.
  //
  // Since 2026-10-23: M15 first, then the other five in parallel. When the
  // working symbol/region isn't known yet (after every restart) or MetaAPI
  // is failing, six parallel calls each ran their OWN region x symbol sweep
  // — up to ~120 requests queued behind the 2 req/s limiter — so each sweep
  // hit its 40s budget before trying most combinations. Now one sweep finds
  // the working pair and the other timeframes reuse it (fast path).
  const fetchSet = async (c) => {
    const m15 = await getCandles(c, '15m', 150);
    const [m5, m30, h1, h4, m1] = await Promise.all([
      mp.useM5 ? getCandles(c, '5m', 60) : Promise.resolve([]),
      getCandles(c, '30m', 120),
      getCandles(c, '1h', 120),
      getCandles(c, '4h', 100),
      getCandles(c, '1m', 50),
    ]);
    return [m5, m15, m30, h1, h4, m1];
  };
  try {
    return await fetchSet(cfg);
  } catch (e) {
    // Ask MetaAPI what is wrong with the account (at most every 10 min), so
    // the cycle error says what to fix instead of just "no candle data".
    let diag = null;
    try { diag = await checkMetaApiAccount(cfg, false, e.message); } catch (e3) { /* diagnostics only */ }
    if (_workingRegion && _workingRegion !== cfg.region) {
      // (Was { token, accId, region } only — no symbol — so this retry
      // requested candles for "undefined".)
      const tc = Object.assign({}, cfg, { region: _workingRegion });
      try {
        const res = await fetchSet(tc);
        updateBotState({ botConfig: { ...(global._botState && global._botState.botConfig || {}), region: _workingRegion } });
        return res;
      } catch (e2) { /* report the original failure below */ }
    }
    if (diag && diag.summary && (!diag.ok || diag.fix) && e.message.indexOf(diag.summary) === -1) {
      throw new Error(e.message + ' | ' + diag.summary + (diag.fix ? ' — ' + diag.fix : ''));
    }
    throw e;
  }
}

async function getAccount(cfg) { return maGet(cfg, '/account-information', false); }
async function getPositions(cfg) { try { return await batchRequest('/positions'); } catch (e) { let d = await maGet(cfg, '/positions', false); return Array.isArray(d) ? d : []; } }
async function getSpread(cfg) { try { let sym = await resolveSymbol(cfg); let d = await maGet(cfg, '/symbols/' + encodeURIComponent(sym) + '/current-price', false); if (!d || !d.ask || !d.bid) return null; return { bid: d.bid, ask: d.ask, spread: parseFloat((d.ask - d.bid).toFixed(5)), time: d.time, brokerTime: d.brokerTime, lossTickValue: d.lossTickValue, profitTickValue: d.profitTickValue }; } catch (e) { return null; } }

// ─── EXTERNAL DATA FETCHING ────────────────────────────────────────────────
async function fetchDXYTrend() { try { let res = await fetchWithTimeout('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1h&range=2d', {}, 10000); if (!res.ok) return null; let d = await res.json(); let closes = (d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].indicators && d.chart.result[0].indicators.quote && d.chart.result[0].indicators.quote[0] && d.chart.result[0].indicators.quote[0].close || []).filter(Boolean); if (closes.length < 10) return null; let sl = closes.slice(-10), e8 = sl[0], e21 = sl[0]; for (let i = 1; i < sl.length; i++) { e8 = sl[i] * 2 / 9 + e8 * 7 / 9; e21 = sl[i] * 2 / 22 + e21 * 20 / 22; } return { trend: e8 > e21 * 1.0002 ? 'bullish' : e8 < e21 * .9998 ? 'bearish' : 'neutral', _rawCloses: closes }; } catch (e) { return null; } }

async function getLazyDXY() { return getLazyData('dxy', fetchDXYTrend); }

let _d1Cache = null, _d1CacheTime = 0;
async function getD1Candles(cfg, count) { count = count || 30; let now = Date.now(); if (_d1Cache && now - _d1CacheTime < 90 * 60 * 1000) return _d1Cache; try { let sym = await resolveSymbol(cfg), data = await maGet(cfg, '/historical-market-data/symbols/' + encodeURIComponent(sym) + '/timeframes/1d/candles?limit=' + count, true); if (!Array.isArray(data) || !data.length) throw new Error('No D1 data');
        _d1Cache = normalizeCandles(data); _d1CacheTime = now; return _d1Cache; } catch (e) { return _d1Cache || []; } }

async function getLazyD1(cfg) { return getLazyData('d1', getD1Candles, false, cfg); }

let _w1Cache = null, _w1CacheTime = 0;
async function getW1Candles(cfg, count) { count = count || 8; let now = Date.now(); if (_w1Cache && now - _w1CacheTime < 3 * 60 * 60 * 1000) return _w1Cache; try { let sym = await resolveSymbol(cfg), data = await maGet(cfg, '/historical-market-data/symbols/' + encodeURIComponent(sym) + '/timeframes/1w/candles?limit=' + count, true); if (!Array.isArray(data) || !data.length) throw new Error('No W1 data');
        _w1Cache = normalizeCandles(data); _w1CacheTime = now; return _w1Cache; } catch (e) { return _w1Cache || []; } }

async function getLazyW1(cfg) { return getLazyData('w1', getW1Candles, false, cfg); }

async function fetchNewsEvents() { try { let res = await fetchWithTimeout('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {}, 10000); if (!res.ok) return []; let events = await res.json(); return events.filter(e => e.impact === 'High' && (e.country === 'USD' || e.country === 'XAU') && e.date); } catch (e) { return []; } }

async function getLazyCalendar() { return getLazyData('calendar', fetchNewsEvents); }

function isNewsWindow(events) { return newsImpactFilter(events); }

// ─── 24/7 TRADING - ALWAYS TRUE ─────────────────────────────────────────
function isOptimalTradingTime() { return true; }

// ─── KZ / SESSION ─────────────────────────────────────────────────────────────
function isNyDST() { try { let fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }), parts = fmt.formatToParts(new Date()), tz = parts.find(p => p.type === 'timeZoneName'); return !!(tz && tz.value === 'EDT'); } catch (e) { let m = new Date().getUTCMonth(); return m > 2 && m < 10; } }

// Session hour = New York local time + 4, i.e. the UTC hour while New York is
// on summer time. Every KZ / silver-bullet / session window below is written
// in those hours. The old version ADDED an hour when New York left daylight
// saving instead of subtracting one, so from the first Sunday of November
// every window would have landed 2 hours early in New York terms (the AM
// silver bullet 08:00–09:00 instead of 10:00–11:00). Fixed 2026-10-24.
function getSessionHour() { const p = v1NyParts(Date.now()); return (p.h + p.mi / 60 + 4) % 24; }

const SB_WINDOWS = [{ start: 7, end: 9 }, { start: 14, end: 15 }, { start: 19, end: 20 }, { start: 13, end: 14 }], KZ = [{ name: 'Asian Range', us: 23, ue: 2, sessions: ['off'] }, { name: 'Tokyo Open', us: 0, ue: 2, sessions: ['both', 'asian'] }, { name: 'London Open', us: 7, ue: 10, sessions: ['both', 'london'] }, { name: 'Silver Bullet NY', us: SB_WINDOWS[3].start, ue: SB_WINDOWS[3].end, sessions: ['both', 'ny'] }, { name: 'NY Open', us: 13, ue: 16, sessions: ['both', 'ny'] }, { name: 'London Close', us: 14, ue: 16, sessions: ['both', 'london'] }];

function kzActive(kz) { let h = getSessionHour(); return kz.us < kz.ue ? h >= kz.us && h < kz.ue : h >= kz.us || h < kz.ue; }
function inSilverBullet() { let h = getSessionHour(); return SB_WINDOWS.some(w => h >= w.start && h < w.end); }

function anyKZ(cfg) { if (cfg.session === 'off') return true; let sc = getSymConfig(cfg.symbol); if (sc.type === 'nas' || sc.type === 'btc') { let h = getSessionHour(); return h >= 12 && h < 21; } return KZ.some(k => kzActive(k) && (k.sessions.indexOf(cfg.session) !== -1 || (cfg.session === 'asian' && k.sessions.indexOf('asian') !== -1))); }

function getSessionContext() { let t = getSessionHour(); if (t >= 7 && t < 10) return { session: 'london', type: 'reversal', scoreMod: 1, label: 'London Open' }; if (t >= 10 && t < 13) return { session: 'london_mid', type: 'continuation', scoreMod: 0, label: 'London Mid' }; if (t >= 13 && t < 14) return { session: 'ny_open', type: 'judas', scoreMod: 1, label: 'NY Open' }; if (t >= 14 && t < 19) return { session: 'ny', type: 'continuation', scoreMod: 0, label: 'NY Session' }; if (t >= 19 && t < 22) return { session: 'ny_close', type: 'reversal', scoreMod: 0, label: 'NY Close' }; if (t >= 22 || t < 0) return { session: 'sydney', type: 'range_form', scoreMod: -1, label: 'Sydney', asian: true }; if (t >= 0 && t < 3) return { session: 'tokyo', type: 'range_boundary', scoreMod: 0, label: 'Tokyo', asian: true }; if (t >= 3 && t < 5) return { session: 'asian_mid', type: 'range_fade', scoreMod: -1, label: 'Asian Mid', asian: true }; if (t >= 5 && t < 7) return { session: 'pre_london', type: 'reversal', scoreMod: 0, label: 'Pre-London', asian: true }; return { session: 'off_hours', type: 'none', scoreMod: -1, label: 'Off-hours' }; }

function getSessionVolatilityPattern(session) { return SESSION_FACTORS[session] || SESSION_FACTORS.off_hours; }

// ─── REGIME DETECTION ────────────────────────────────────────────────────────
function detectRegime(h4, h1) { if (!h4 || h4.length < 20) return { regime: 'normal', atrRatio: 1, filter: 'none', volatility: 'normal', scoreMod: 0, lotMod: 1, h1Confirmed: null }; let atr14 = indicators.calcATR14(h4), atrs = []; for (let i = 5; i < h4.length - 5; i++) { let sl = h4.slice(Math.max(0, i - 14), i); if (sl.length >= 10) atrs.push(indicators.calcATR14(sl)); } let avg = atrs.length ? atrs.reduce((a, b) => a + b, 0) / atrs.length : atr14, ratio = atr14 / avg; let adx = indicators.calcADX(h4), last20 = h4.slice(-20), rh = 0, rl = Infinity; last20.forEach(c => { if (c.high > rh) rh = c.high; if (c.low < rl) rl = c.low; }); let range = rh - rl, rv = range / (avg * 20); let h1adx = (h1 && h1.length >= 20) ? indicators.calcADX(h1) : null, h1c = h1adx ? true : null; let regime, filter, scoreMod = 0, lotMod = 1, volatility = 'normal'; if (ratio > 3 || atr14 > avg * 3) { regime = 'volatile'; filter = 'reduce_size'; lotMod = .7; scoreMod = 0; volatility = 'high'; } else if (adx.adx >= 20 && rv > 1.2) { regime = 'trending'; filter = 'none'; lotMod = 1.2; scoreMod = 0; volatility = 'normal'; if (h1adx && h1adx.adx < 15) { h1c = false; filter = 'none'; lotMod = 1; } } else if (adx.adx < 20 && rv < .8) { regime = 'ranging'; filter = 'none'; scoreMod = -1.5; lotMod = .6; volatility = 'low'; if (h1adx && h1adx.adx >= 30) { h1c = false; filter = 'none'; } } else { regime = 'normal'; filter = 'none'; scoreMod = 0; lotMod = 1; volatility = 'normal'; } return { regime, atrRatio: parseFloat(ratio.toFixed(2)), h4ADX: adx.adx, h1ADX: h1adx ? h1adx.adx : null, h1Confirmed: h1c, filter, scoreMod, lotMod, totalRange: parseFloat(range.toFixed(2)), volatility }; }

function analyzeRegimeAdvanced(h4, h1, m15) { try { return detectRegimeAdvanced(h4, h1, m15); } catch (e) { logger.warn('[regime] Advanced regime failed:', e.message); return { regime: 'unknown', confidence: 0, recommendations: { riskMultiplier: 1, minScoreBonus: 0, avoidCounterTrend: false } }; } }

function analyzeCandlestickPatterns(candles, atr) { try { return detectCandlestickPatterns(candles, atr); } catch (e) { logger.warn('[patterns] Candlestick pattern detection failed:', e.message); return { patterns: [], hasReversal: false, bullishScore: 0, bearishScore: 0 }; } }

// ─── NEW: Trade duration detection ─────────────────────────────────────────
function getTradeDuration(analysis, cfg, regime) {
    const adx = analysis.adxData?.adx || 20;
    const atr = analysis.atr || 1;
    const score = analysis.score || 0;
    const volatility = regime.volatility || 'normal';
    const session = analysis.session?.session || 'off_hours';

    if (cfg.mode === 'aggressive') return 'scalp';
    if (cfg.mode === 'sniper') return 'sniper';

    let duration = 'normal';
    const range = analysis.marketTrend?.volatility || 0;
    const isRange = range < 0.5 && adx < 20;
    if (isRange && score >= 2 && score < 4) {
        duration = 'scalp';
    } else if (adx > 30 && score >= 6) {
        duration = 'sniper';
    } else if (adx >= 20 && score >= 4) {
        duration = 'normal';
    } else if (score >= 3 && adx > 25) {
        duration = 'normal';
    }
    if (session === 'off_hours' || session === 'asian_mid') {
        if (duration === 'sniper') duration = 'normal';
    }
    if (volatility === 'high' && adx > 30) duration = 'sniper';
    return duration;
}

// ─── SMART TP / HELPERS ──────────────────────────────────────────────────────
function findSmartTPLevels(candles, entry, dir, slDist, atr, targetRR) { let so = { windowSize: SWING_CONFIG.windowSize, minMovePct: SWING_CONFIG.minMovePct, maxSwings: SWING_CONFIG.maxSwings, atr }, sw = indicators.detectSwings(candles, so); let res = { tp1: null, tp2: null, tp3: null }, rr1 = targetRR || 1.0, rr2 = targetRR ? targetRR * 1.5 : 1.8, rr3 = targetRR ? targetRR * 2.5 : 3.0; if (dir === 'buy') { let near = null;
        sw.highs.forEach(s => { if (s.price > entry && (!near || s.price < near.price)) near = s; });
        res.tp1 = near ? near.price : entry + slDist * rr1; let next = null;
        sw.highs.forEach(s => { if (s.price > res.tp1 && (!next || s.price < next.price)) next = s; });
        res.tp2 = next ? next.price : entry + slDist * rr2; let ress = findResistanceLevels(candles).filter(l => l > res.tp2);
        res.tp3 = ress.length ? ress[0] : entry + slDist * rr3; } else { let near = null;
        sw.lows.forEach(s => { if (s.price < entry && (!near || s.price > near.price)) near = s; });
        res.tp1 = near ? near.price : entry - slDist * rr1; let next = null;
        sw.lows.forEach(s => { if (s.price < res.tp1 && (!next || s.price > next.price)) next = s; });
        res.tp2 = next ? next.price : entry - slDist * rr2; let supps = findSupportLevels(candles).filter(l => l < res.tp2).reverse();
        res.tp3 = supps.length ? supps[0] : entry - slDist * rr3; } let gap = atr * .1; if (Math.abs(res.tp2 - res.tp1) < gap) res.tp2 = dir === 'buy' ? res.tp1 + gap : res.tp1 - gap; if (Math.abs(res.tp3 - res.tp2) < gap) res.tp3 = dir === 'buy' ? res.tp2 + gap : res.tp2 - gap;
    res.tp1 = parseFloat(res.tp1.toFixed(2));
    res.tp2 = parseFloat(res.tp2.toFixed(2));
    res.tp3 = parseFloat(res.tp3.toFixed(2)); return res; }

function findResistanceLevels(c) { if (!c || c.length < 10) return []; let highs = c.slice(-50).map(c => c.high), levels = [], tol = .005; for (let i = 0; i < highs.length; i++) { let is = true; for (let j = Math.max(0, i - 5); j < Math.min(highs.length, i + 5); j++) { if (j !== i && highs[j] > highs[i] * (1 + tol)) { is = false; break; } } if (is && highs[i] > 0) levels.push(highs[i]); } let clustered = []; levels.forEach(l => { if (!clustered.some(cl => Math.abs(l - cl) / cl < .01)) clustered.push(l); }); return clustered.sort((a, b) => a - b); }

function findSupportLevels(c) { if (!c || c.length < 10) return []; let lows = c.slice(-50).map(c => c.low), levels = [], tol = .005; for (let i = 0; i < lows.length; i++) { let is = true; for (let j = Math.max(0, i - 5); j < Math.min(lows.length, i + 5); j++) { if (j !== i && lows[j] < lows[i] * (1 - tol)) { is = false; break; } } if (is && lows[i] > 0) levels.push(lows[i]); } let clustered = []; levels.forEach(l => { if (!clustered.some(cl => Math.abs(l - cl) / cl < .01)) clustered.push(l); }); return clustered.sort((a, b) => a - b); }

// getBeBuffer: buffer added above/below entry when moving a stop to
// breakeven, so "risk-free" survives real execution (spread + slippage)
// rather than just looking risk-free on paper. Anchored on sc.limitSlip
// (existing, symbol-specific expected-slippage value already maintained
// in getSymConfig) with a 2x margin, since a buffer merely equal to
// expected slippage would still fail roughly half the time by definition.
// Fixed 2026-07-31 after a trade where the old formula (atr*0.03 alone,
// ~0.14pts on that trade) was thinner than gold's typical spread and got
// erased on execution, producing a real loss despite a genuinely
// successful, confirmed SL modification. No ATR-proportional term: checked
// that one would need ATR>30 to matter for gold, where the bot's own
// config already treats ATR>8 as "high" — surviving spread/slippage
// doesn't need to scale with volatility the way position sizing does, so
// a flat slippage-anchored floor is the honest design rather than a term
// that looks meaningful but never actually fires under real conditions.
//
// Revised 2026-10-23: limitSlip is the LIMIT-ENTRY slippage tolerance (1.5
// for gold), so 2x it put "breakeven" at entry + $3.00 — but breakeven fires
// at ~0.2-0.3R (about $1 on a normal M15 stop), where entry + $3 is still
// above the market. validateSLTPForPosition then clamped it to price - $0.50
// and the move was SENT anyway, every cycle — turning every trade that got
// ~$1 in profit into one with a $0.50 trailing stop. A BE exit only has to
// cover slippage + commission (the spread was already paid at entry: a buy
// stopped at entry+buf exits at bid ≈ entry+buf), so: 2x the live spread,
// floor $0.50 (3.5x the buffer that failed on 2026-07-31), with the old
// value kept only as a ceiling.
function getBeBuffer(atr, minSL, limitSlip, spread) {
    const cap = (limitSlip || 0.3) * 2;
    const sp = (typeof spread === 'number' && spread > 0) ? spread : 0.3;
    return Math.min(cap, Math.max(0.5, (minSL || 0) * 0.15, sp * 2));
}

function getDynamicTPSplit(score, regime, volatility, atrRatio) { let base; if (score >= 8) { base = { tp1: 0.2, tp2: 0.3, tp3: 0.5 }; } else if (score >= 6) { base = { tp1: 0.25, tp2: 0.30, tp3: 0.45 }; } else if (score >= 4) { base = { tp1: 0.35, tp2: 0.35, tp3: 0.30 }; } else { base = { tp1: 0.5, tp2: 0.3, tp3: 0.2 }; } if (volatility === 'high' && atrRatio > 1.5) { base.tp1 += .05; base.tp2 -= .02; base.tp3 -= .03; let s = base.tp1 + base.tp2 + base.tp3; base.tp1 /= s; base.tp2 /= s; base.tp3 /= s; } else if (volatility === 'low' && atrRatio < .7) { base.tp1 -= .05; base.tp2 += .02; base.tp3 += .03; let s2 = base.tp1 + base.tp2 + base.tp3; base.tp1 /= s2; base.tp2 /= s2; base.tp3 /= s2; } return base; }

function getSessionRiskMultiplier(session) { let m = { 'london': 1.1, 'ny_open': 1.2, 'ny': 1, 'ny_close': .9, 'tokyo': .8, 'asian_mid': .6, 'sydney': .6, 'pre_london': .7, 'off_hours': .5 }; return m[session] || 1; }

function getOptimalRR(winRate) { let p = winRate, q = 1 - p, b = 2, kelly = (p * b - q) / b; return Math.max(1.0, Math.min(2.0, 1 / (1 - kelly))); }

function getTrailActivation(profitPct, timeInTrade, session, cfg) {
    let th = cfg.trailActivation || POSITION_CONFIG.trailActivation || 0.2;
    if (timeInTrade < 3 * 60 * 1000) return false;
    if (profitPct < th) return false;
    return true;
}

// ─── PRECISION HELPERS ──────────────────────────────────────────────────────
function calcMACD(candles, fast, slow, signal) {
    fast = fast || 12; slow = slow || 26; signal = signal || 9;
    if (!candles || candles.length < slow + signal) return { macd: 0, signal: 0, histogram: 0, bullish: false, bearish: false };
    let closes = candles.map(c => c.close);
    function ema(arr, p) { let e = arr[0], k = 2 / (p + 1); for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k); return e; }
    let fe = ema(closes, fast), se = ema(closes, slow), macd = fe - se, macdVals = [];
    for (let i = 0; i < closes.length - slow; i++) { let f = ema(closes.slice(0, i + slow), fast), s = ema(closes.slice(0, i + slow), slow);
        macdVals.push(f - s); }
    let sig = macdVals.length > signal ? ema(macdVals.slice(-signal), signal) : 0;
    return { macd, signal: sig, histogram: macd - sig, bullish: macd > sig, bearish: macd < sig };
}

function checkMultiEMA(candles, price, dir) { let periods = EMA_CONFIG.periods || [20, 50, 200]; for (let p of periods) { if (candles.length < p) return true; let closes = candles.slice(-p).map(c => c.close), ema = closes.reduce((a, b) => a + b, 0) / p; if (dir === 'buy' && price <= ema) return false; if (dir === 'sell' && price >= ema) return false; } return true; }

function detectStructureBreak(candles, swings, dir) { if (!swings || swings.highs.length < 2 || swings.lows.length < 2) return false; let lh = swings.highs[swings.highs.length - 1].price, ph = swings.highs[swings.highs.length - 2].price, ll = swings.lows[swings.lows.length - 1].price, pl = swings.lows[swings.lows.length - 2].price; return dir === 'buy' ? ll > pl && lh > ph : ll < pl && lh < ph; }

function isPriceAtHVN(vp, price, dir) { if (!vp || !vp.poc) return true; let poc = vp.poc, tol = poc * .05; return price >= poc - tol && price <= poc + tol; }

function checkSessionBias(session, dir) { let bias = SESSION_FACTORS[session]?.bias || 'neutral'; if (bias === 'neutral') return true; return (bias === 'bullish' && dir === 'buy') || (bias === 'bearish' && dir === 'sell'); }

function getSimilarSetupWinRate(trades, analysis, lookback) { lookback = lookback || 30; let closed = trades.filter(t => t.outcome !== null).slice(-100), similar = []; for (let t of closed) { let match = 0; if (t.signal === analysis.signal) match++; if (t.session === analysis.session.session) match++; if (Math.abs(t.score - analysis.score) < 3) match++; if (t.divergence === analysis.divergence.type) match++; if (t.liqSwept === analysis.liq.swept) match++; if (match >= 2) { similar.push(t); if (similar.length >= lookback) break; } } if (similar.length < 5) return null; return similar.filter(t => t.outcome === 'win').length / similar.length; }

function computeQualityScore(analysis, journal, cfg) { let q = analysis.score; if ((analysis.bias === 'bullish' && analysis.signal === 'buy') || (analysis.bias === 'bearish' && analysis.signal === 'sell')) q += 1; if (analysis.volumeProfile && analysis.volumeProfile.poc) { let poc = analysis.volumeProfile.poc, price = analysis.curP; if (analysis.signal === 'buy' && price > poc) q += .5; else if (analysis.signal === 'sell' && price < poc) q += .5; } if (analysis.dxyTrend && analysis.dxyTrend !== 'neutral') { let conflict = (analysis.signal === 'buy' && analysis.dxyTrend === 'bullish') || (analysis.signal === 'sell' && analysis.dxyTrend === 'bearish'); if (!conflict) q += 0.5; else q -= 0.3; } if (analysis.newsSentiment && analysis.newsSentiment !== 'neutral') { let aligns = (analysis.signal === 'buy' && analysis.newsSentiment === 'bullish') || (analysis.signal === 'sell' && analysis.newsSentiment === 'bearish'); if (aligns) q += .3; else q -= .3; } if (QUALITY_CONFIG.useJournalWeights && journal && journal.trades) { let similar = findSimilarSetups(journal.trades, analysis, QUALITY_CONFIG.similarityLookback); if (similar.length >= SIMILAR_MIN_SAMPLES) { let wr = conservativeWinRate(similar.filter(t => t.outcome === 'win').length, similar.length); if (wr < 0.3) q -= 0.3; else if (wr > 0.6) q += 0.3; } } return Math.min(12, Math.max(0, q)); }

function findSimilarSetups(trades, analysis, lookback) { const cutoff = Date.now() - SIMILAR_WINDOW_MS; let closed = trades.filter(t => t.outcome !== null && new Date(t.closedTs || t.ts || 0).getTime() >= cutoff).slice(-50), similar = []; for (let i = closed.length - 1; i >= 0; i--) { let t = closed[i], match = 0; if (t.signal === analysis.signal) match++; if (t.session === analysis.session.session) match++; if (Math.abs(t.score - analysis.score) < 3) match++; if (t.divergence === analysis.divergence.type) match++; if (t.liqSwept === analysis.liq.swept) match++; if (match >= 2) { similar.push(t); if (similar.length >= lookback) break; } } return similar; }

function getAdaptiveStopLoss(entry, dir, atr, volatility, regime, minSL) { let mult = 0.5; if (volatility === 'high') mult = 0.7; else if (volatility === 'low') mult = 0.35; if (regime === 'volatile') mult *= 1.1; if (regime === 'trending') mult *= 0.9; let dist = Math.max(minSL, atr * mult); return dir === 'buy' ? parseFloat((entry - dist).toFixed(2)) : parseFloat((entry + dist).toFixed(2)); }

function isSessionStart(cfg, session) { let mins = TIME_FILTER_CONFIG.avoidSessionStartMinutes || 15; if (!mins) return false; let now = new Date(), h = now.getUTCHours(), m = now.getUTCMinutes(); return (session === 'london' && h === 7 && m < mins) || (session === 'ny_open' && h === 13 && m < mins); }

function shouldTradeBasedOnJournal(journal, analysis) { if (!QUALITY_CONFIG.useJournalWeights) return true; let similar = findSimilarSetups(journal.trades || [], analysis, QUALITY_CONFIG.similarityLookback); if (similar.length < SIMILAR_MIN_SAMPLES) return true; const wins = similar.filter(t => t.outcome === 'win').length; return wilsonBounds(wins, similar.length).upper >= QUALITY_CONFIG.minSimilarWinRate; }

// ─── FIXED: getSwingTrail (replaced by Chandelier in managePositions) ──
function getSwingTrail(candles, dir, price, atr) { return { stopPrice: null, reason: 'Use Chandelier' }; }

function getAdaptiveTrail(profitPct, atr, volatility, method) { method = method || 'adaptive'; let base = atr * 0.1; if (profitPct > 3) base = atr * 0.05; else if (profitPct > 2) base = atr * 0.07; else if (profitPct > 1) base = atr * 0.09; let mult = { high: 1.2, normal: 1, low: .7 }; base *= mult[volatility] || 1; if (method === 'parabolic') { let f = Math.max(.05, 1 - profitPct / 5); return atr * f * 0.4; } if (method === 'step') { let steps = Math.floor(profitPct); return atr * 0.08 * Math.min(steps, 5); } return base; }

function getPartialCloseSL(entry, sl, dir) { let dist = Math.abs(entry - sl); return dir === 'buy' ? parseFloat((entry + dist * 0.2).toFixed(2)) : parseFloat((entry - dist * 0.2).toFixed(2)); }

function analyzeVolumeProfile(candles, atr) { if (!candles || candles.length < 20) return null; let levels = {}, ts = Math.max(.01, atr * .02); candles.forEach(c => { let vol = c.volume || 1, high = c.high, low = c.low, range = high - low; if (range <= 0) return; let steps = Math.ceil(range / ts); for (let j = 0; j <= steps; j++) { let price = low + range * j / steps, key = Math.round(price / ts) * ts; if (!levels[key]) levels[key] = 0;
            levels[key] += vol / (steps + 1); } }); let maxVol = 0, poc = 0, keys = Object.keys(levels); keys.forEach(k => { let p = parseFloat(k), v = levels[k]; if (v > maxVol) { maxVol = v; poc = p; } }); let total = Object.values(levels).reduce((a, b) => a + b, 0); if (total === 0) return null; let sorted = keys.slice().sort((a, b) => levels[b] - levels[a]); let cum = 0, val = poc, vah = poc; for (let k of sorted) { cum += levels[k]; let p = parseFloat(k); if (p < poc) val = Math.min(val, p); if (p > poc) vah = Math.max(vah, p); if (cum / total >= .7) break; } let buy = 0, sell = 0; candles.forEach(c => { if (c.close > c.open) buy += c.volume || 1; else if (c.close < c.open) sell += c.volume || 1; }); let tv = buy + sell || 1; let vwapNum = 0, vwapDen = 0; candles.forEach(c => { let tp = (c.high + c.low + c.close) / 3, vol = c.volume || 1;
        vwapNum += tp * vol; vwapDen += vol; }); return { poc, valueAreaLow: val, valueAreaHigh: vah, valueAreaRange: vah - val, maxVolume: maxVol, totalVolume: total, buyVolumeRatio: buy / tv, sellVolumeRatio: sell / tv, volumeImbalance: (buy - sell) / tv, vwap: vwapDen > 0 ? vwapNum / vwapDen : 0, volumeAtPOC: levels[poc] || 0 }; }

async function reanchorStopsToLivePrice(cfg, dir, entry, sl, tp, spec) { let live; try { let sym = await resolveSymbol(cfg), pd = await maGet(cfg, '/symbols/' + encodeURIComponent(sym) + '/current-price', false);
        live = dir === 'buy' ? parseFloat(pd.ask) : parseFloat(pd.bid); if (!live || isNaN(live)) throw new Error('Invalid price'); } catch (e) { return { entryPrice: entry, sl, tp, drifted: false }; } let drift = live - entry; if (Math.abs(drift) < ((spec && spec.tickSize) || .01)) return { entryPrice: entry, sl, tp, drifted: false }; let sld = Math.abs(entry - sl), tpd = Math.abs(tp - entry), nsl = dir === 'buy' ? parseFloat((live - sld).toFixed(2)) : parseFloat((live + sld).toFixed(2)), ntp = dir === 'buy' ? parseFloat((live + tpd).toFixed(2)) : parseFloat((live - tpd).toFixed(2)); let minDist = Math.max((spec && spec.stopsLevelPrice) || 0, (spec && spec.freezeLevelPrice) || 0) + ((spec && spec.tickSize) || .01); if (minDist > 0) { if (Math.abs(live - nsl) < minDist) nsl = dir === 'buy' ? parseFloat((live - minDist).toFixed(2)) : parseFloat((live + minDist).toFixed(2)); if (Math.abs(ntp - live) < minDist) ntp = dir === 'buy' ? parseFloat((live + minDist).toFixed(2)) : parseFloat((live - minDist).toFixed(2)); } nsl = validateStopLoss(cfg, live, nsl, dir, spec); return { entryPrice: live, sl: nsl, tp: ntp, drifted: true }; }

// ─── POSITION MANAGEMENT ─────────────────────────────────────────────────────
let _mgmtCooldowns = {};
function _mgmtAlert(id, action, msg) { let key = id + ':' + action, now = Date.now(); if (now - (_mgmtCooldowns[key] || 0) < 20 * 60 * 1000) return;
    _mgmtCooldowns[key] = now; Object.keys(_mgmtCooldowns).forEach(k => { if (now - _mgmtCooldowns[k] > 24 * 60 * 60 * 1000) delete _mgmtCooldowns[k]; }); try { sendTelegram(msg); } catch (e) { } }

async function safePositionOperation(cfg, posId, op, tradeId, desc, opts) {
    try {
        let all = await getPositions(cfg);
        let exists = all.some(p => normalizePositionId(p.id) === normalizePositionId(posId));
        if (!exists) {
            let j = loadJournal(), entry = null;
            for (let t of j.trades) {
                if (normalizePositionId(t.id) === normalizePositionId(tradeId)) {
                    entry = t;
                    break;
                }
            }
            if (entry && entry.outcome === null) {
                try {
                    let deals = await maGet(cfg, '/history-deals/position/' + posId, false);
                    if (Array.isArray(deals)) {
                        // Whole-position result (see summarizePositionDeals);
                        // if the final deal isn't visible yet, leave it to
                        // reconcileClosedTrades rather than journal a partial.
                        let sum = summarizePositionDeals(deals);
                        if (sum.fullyClosed) journalClose(tradeId, sum.pnl >= 0 ? 'win' : 'loss', null, sum.pnl, { totalPnl: true });
                    }
                } catch (e) {
                    journalClose(tradeId, 'unknown', null, 0);
                }
            }
            return { success: false, reason: 'position_not_found' };
        }
        let result = await op();
        return { success: true, result };
    } catch (e) {
        if (e.message && (e.message.indexOf('ERR_POSITION_NOT_FOUND') !== -1 ||
                          e.message.indexOf('ERR_TRADE_POSITION_NOT_FOUND') !== -1 ||
                          e.message.indexOf('Position not found') !== -1)) {
            let j = loadJournal(), entry = null;
            for (let t of j.trades) {
                if (normalizePositionId(t.id) === normalizePositionId(tradeId)) {
                    entry = t;
                    break;
                }
            }
            if (entry && entry.outcome === null) {
                journalClose(tradeId, 'unknown', null, 0);
            }
            return { success: false, reason: 'position_not_found' };
        }
        if (e.message && (e.message.indexOf('INVALID_STOPS') !== -1 ||
                          e.message.indexOf('Invalid stops') !== -1 ||
                          e.message.indexOf('ERR_TRADE_INVALID_STOPS') !== -1 ||
                          e.message.indexOf('invalid stops') !== -1)) {
            // v1 callers pass { noRetry: true }: their stops are checked
            // before sending, and this retry rewrites the TP as well (it could
            // pull a runner's final TP in). 2026-10-24.
            if (opts && opts.noRetry) { logger.warn(`[safeOperation] Invalid stops for ${desc} — not retried: ${e.message}`); return { success: false, reason: 'invalid_stops', error: e.message }; }
            logger.warn(`[safeOperation] Invalid stops for ${desc}, attempting retry with adjusted values`);
            try {
                let all = await getPositions(cfg);
                let pos = all.find(p => normalizePositionId(p.id) === normalizePositionId(posId));
                if (!pos) return { success: false, reason: 'position_not_found' };
                let spec = await getBrokerSymbolSpec(cfg).catch(() => null);
                let entry = parseFloat(pos.openPrice) || 0;
                let isBuy = pos.type && pos.type.indexOf('BUY') !== -1;
                let sc = getSymConfig(cfg.symbol);
                let sym = await resolveSymbol(cfg);
                let pd = await maGet(cfg, '/symbols/' + encodeURIComponent(sym) + '/current-price', false);
                let currentPrice = isBuy ? parseFloat(pd.ask) : parseFloat(pd.bid);
                let minDist = Math.max((spec && spec.stopsLevelPrice) || 0, (spec && spec.tickSize) || 0.01, sc.minSL || 0.01);
                if (sc.type === 'gold') minDist = Math.max(minDist, 0.5);
                let currentSl = parseFloat(pos.stopLoss) || 0;
                let currentTp = parseFloat(pos.takeProfit) || 0;
                let newSl, newTp;
                let isBeMove = Math.abs(currentSl - entry) < minDist * 2;
                if (isBeMove) {
                    let buf = getBeBuffer(1, sc.minSL, sc.limitSlip);
                    newSl = isBuy ? parseFloat((entry + buf).toFixed(2)) : parseFloat((entry - buf).toFixed(2));
                } else {
                    let slDistFromEntry = Math.abs(entry - currentSl);
                    let minSlDist = Math.max(minDist, slDistFromEntry * 0.3);
                    newSl = isBuy ? parseFloat((entry - Math.max(minSlDist, minDist)).toFixed(2)) : parseFloat((entry + Math.max(minSlDist, minDist)).toFixed(2));
                }
                let minSlFromCurrent = Math.max(minDist, 0.3);
                if (isBuy && newSl >= currentPrice - minSlFromCurrent) newSl = parseFloat((currentPrice - Math.max(minDist, minSlFromCurrent)).toFixed(2));
                if (!isBuy && newSl <= currentPrice + minSlFromCurrent) newSl = parseFloat((currentPrice + Math.max(minDist, minSlFromCurrent)).toFixed(2));
                // Only applies to the non-breakeven trailing branch above —
                // isBeMove already correctly computed an above-entry (buy) /
                // below-entry (sell) SL for a genuine breakeven recovery,
                // and this check used to unconditionally undo that. Fixed
                // 2026-08-05, same bug class as validateStopLoss above.
                if (!isBeMove && isBuy && newSl >= entry) newSl = parseFloat((entry - Math.max(minDist, 0.3)).toFixed(2));
                if (!isBeMove && !isBuy && newSl <= entry) newSl = parseFloat((entry + Math.max(minDist, 0.3)).toFixed(2));
                let currentSlDist = Math.abs(entry - newSl);
                let currentTpDist = Math.abs(currentTp - entry);
                if (currentTpDist > 0 && currentTpDist > currentSlDist * 0.5) {
                    let ratio = currentTpDist / (Math.abs(entry - currentSl) || 1);
                    newTp = isBuy ? parseFloat((entry + Math.max(minDist, currentSlDist * Math.max(ratio, 0.5))).toFixed(2)) : parseFloat((entry - Math.max(minDist, currentSlDist * Math.max(ratio, 0.5))).toFixed(2));
                } else {
                    let minTpDist = Math.max(minDist, currentSlDist * 0.5);
                    newTp = isBuy ? parseFloat((entry + minTpDist).toFixed(2)) : parseFloat((entry - minTpDist).toFixed(2));
                }
                let minTpFromCurrent = Math.max(minDist, 0.3);
                if (isBuy && newTp <= currentPrice + minTpFromCurrent) newTp = parseFloat((currentPrice + Math.max(minDist, minTpFromCurrent)).toFixed(2));
                if (!isBuy && newTp >= currentPrice - minTpFromCurrent) newTp = parseFloat((currentPrice - Math.max(minDist, minTpFromCurrent)).toFixed(2));
                newSl = validateStopLoss(cfg, entry, newSl, isBuy ? 'buy' : 'sell', spec, false);
                newTp = validateTakeProfit(cfg, entry, newTp, newSl, isBuy ? 'buy' : 'sell', spec);
                let finalSlDist = Math.abs(entry - newSl);
                let finalTpDist = Math.abs(newTp - entry);
                if (finalTpDist < finalSlDist * 0.3) {
                    if (isBuy) newTp = parseFloat((entry + Math.max(minDist, finalSlDist * 0.5)).toFixed(2));
                    else newTp = parseFloat((entry - Math.max(minDist, finalSlDist * 0.5)).toFixed(2));
                }
                let tickSize = (spec && spec.tickSize) || 0.01;
                let decimals = String(tickSize).split('.')[1] ? String(tickSize).split('.')[1].length : 2;
                newSl = parseFloat(newSl.toFixed(decimals));
                newTp = parseFloat(newTp.toFixed(decimals));
                logger.info(`[safeOperation] Retry ${desc}: SL=${newSl}, TP=${newTp}, entry=${entry}, currentPrice=${currentPrice}`);
                let retryResult = await maPost(cfg, '/trade', {
                    actionType: 'POSITION_MODIFY',
                    positionId: pos.id,
                    stopLoss: newSl,
                    takeProfit: newTp
                });
                logger.info(`[safeOperation] Retry successful for ${desc}`);
                return { success: true, result: retryResult, retried: true };
            } catch (retryErr) {
                logger.warn(`[safeOperation] Retry failed for ${desc}:`, retryErr.message);
                return { success: false, reason: 'retry_failed', error: retryErr.message };
            }
        }
        throw e;
    }
}

// ─── Helper to create a short, safe comment ──────────────────────────────
function makeComment(symbol, score, duration, mlProb, label) {
    const s = symbol.slice(0, 4); // first 4 chars of symbol
    const sc = Math.round(score || 0);
    const dur = (duration || 'nor').slice(0, 3);
    const ml = Math.round((mlProb || 0.5) * 100);
    let comment = `ICT_BOT|${s}|${sc}|${dur}|${ml}`;
    if (label) comment += `|${label.slice(0, 1)}`; // e.g., TP1 -> T1
    return comment.slice(0, 32);
}

async function checkFreeTradeSafe(cfg, pos, curP, entry, slDist, isBuy, vol, sc, tradeId, atr, spec) {
    let profit = isBuy ? curP - entry : entry - curP,
        pct = profit / slDist,
        minClose = POSITION_CONFIG.minLotForSplit || 0.03,
        partialPct = pos._score && pos._score > 7 ? 0.25 : 0.35,
        half = parseFloat((vol * partialPct).toFixed(2)),
        C = cfg.currency || 'R';
    // Runner trades take their one small partial at TP1 (managePositions),
    // so here they only get the risk-free breakeven move — no 25-35% chunk
    // closed at 0.2R on top of it. Added 2026-10-23.
    const runnerPos = !!((loadPositionState(pos.id) || {})._runner);
    if (half < minClose || runnerPos) {
        // Too small to split, so this "risk-free" move is just breakeven —
        // and it used a fixed 0.2R trigger, which always fired before the
        // main breakeven block's regime-aware threshold (cfg.beThreshold:
        // 0.4R trending, 0.6R volatile, 0.2R ranging). At 0.03-0.05 lots
        // every trade takes this path, so those regime settings never took
        // effect. Now uses the same threshold (never below 0.2R).
        // Changed 2026-10-23.
        const beTrigger = Math.max(0.2, cfg.beThreshold || POSITION_CONFIG.beThreshold || 0.2);
        if (pct >= beTrigger && !pos._freeTradeTriggered) {
            let buf = getBeBuffer(atr, sc.minSL, sc.limitSlip, cfg._spread),
                be = isBuy ? entry + buf : entry - buf,
                curSL = parseFloat(pos.stopLoss) || 0;
            // Already at/after the risk-free level (breakeven got there
            // first) — record it rather than re-sending the same stop.
            if (pos._beTriggered || !stopImproves(isBuy, be, curSL)) {
                pos._freeTradeTriggered = true; pos._beTriggered = true;
                savePositionState(pos.id, { _freeTradeTriggered: true, _beTriggered: true });
                return false;
            }
            // Not valid at the live price yet — wait. (This used to go
            // through anyway: validateSLTPForPosition clamped it to
            // price - $0.50 and the clamped stop was SENT, every cycle — a
            // $0.50 trailing stop on every small-lot trade ~$1 in profit.)
            if (!stopIsReachable(isBuy, be, curP, stopGapFromPrice(cfg, spec))) return false;
            let validated = await validateSLTPForPosition(cfg, pos.id, entry, curP, be, pos.takeProfit, isBuy, spec);
            if (validated.wasClamped || Math.abs(validated.sl - be) > 0.02) {
                logger.warn(`[RISK-FREE] #${tradeId} BE ${be.toFixed(2)} came back as ${validated.sl.toFixed(2)} from validation — not sending`);
                return false;
            }
            let res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_MODIFY', positionId: pos.id, stopLoss: validated.sl, takeProfit: validated.tp }), tradeId, 'BE move');
            if (res.success) {
                // Also counts as breakeven, so the main BE block doesn't
                // re-send the identical stop (broker rejects "no changes")
                // and step-trail can start ratcheting from here.
                pos._freeTradeTriggered = true; pos._beTriggered = true;
                pos.stopLoss = validated.sl;
                savePositionState(pos.id, { _freeTradeTriggered: true, _beTriggered: true });
                sendTelegram('🔒 *Trade is now RISK-FREE!*\nTrade #' + tradeId + '\nSL moved to BE + buffer: ' + validated.sl.toFixed(2));
                return true;
            }
        }
        return false;
    }
    if (pct >= 0.2 && !pos._freeTradeTriggered) {
        let closeVol = half, ct = Date.now();
        let pres = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_PARTIAL', positionId: pos.id, volume: closeVol }), tradeId, 'partial close');
        if (!pres.success) {
            _mgmtAlert(tradeId, 'freetrade_partial', '⚠️ Risk-free partial close FAILED\nTrade #' + tradeId + '\nReason: ' + pres.reason);
            return false;
        }
        pos._freeTradeTriggered = true;
        savePositionState(pos.id, { _freeTradeTriggered: true });
        // Real P&L from the broker's deal — the estimate (profit*vol*lotVal)
        // is ~10x off for gold, and the trade's journaled total now includes
        // the partial (see journalClose). Changed 2026-10-23.
        let pnl = await fetchRealizedPnl(cfg, pos.id, profit * closeVol * sc.lotVal, ct);
        journalPartialClose(tradeId, profit.toFixed(2), pnl, 1);
        if (pos._tpState) pos._tpState.tp1Hit = true;
        savePositionState(pos.id, { _tpState: pos._tpState });
        let newSL = getPartialCloseSL(entry, pos.stopLoss, isBuy ? 'buy' : 'sell');
        await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_MODIFY', positionId: pos.id, stopLoss: newSL, takeProfit: pos.takeProfit }), tradeId, 'SL to 0.2 RR');
        sendTelegram('🔒 *Free Trade - Partial Close*\nTrade #' + tradeId + '\nClosed ' + (partialPct * 100).toFixed(0) + '% at ' + curP.toFixed(2) + ' (0.2 ATR)\nP&L: ' + C + pnl.toFixed(2) + '\nRemaining SL moved to 0.2 RR: ' + newSL.toFixed(2));
        return true;
    }
    return false;
}

// ─── SMART ORDER ROUTER ────────────────────────────────────────────────────
class SmartOrderRouter {
    constructor(cfg) { this.cfg = cfg; this.lastVWAP = null; this.vwapSlices = []; }
    async executeVWAP(order, totalLots, entryPrice) {
        if (!ELITE_CONFIG.vwapExecution.enabled || totalLots < ELITE_CONFIG.vwapExecution.minLotsForVWAP) return this.executeMarketOrder(order, totalLots);
        const slices = ELITE_CONFIG.vwapExecution.slices;
        const sliceSize = totalLots / slices;
        const results = [];
        for (let i = 0; i < slices; i++) {
            const sliceOrder = { ...order, volume: sliceSize };
            const optimalPrice = await this.getOptimalSlicePrice(entryPrice, i);
            sliceOrder.price = optimalPrice;
            const result = await this.executeSlice(sliceOrder);
            results.push(result);
            if (i < slices - 1) await sleep(ELITE_CONFIG.vwapExecution.sliceIntervalMs);
        }
        return this.aggregateSliceResults(results);
    }
    async getOptimalSlicePrice(basePrice, sliceIndex) { return basePrice + (sliceIndex / 10) * 0.01; }
    async executeSlice(order) { try { return await maPost(this.cfg, '/trade', order); } catch (e) { return { error: e.message }; } }
    async executeMarketOrder(order, lots) { return await maPost(this.cfg, '/trade', { ...order, volume: lots }); }
    aggregateSliceResults(results) { const successful = results.filter(r => !r.error); const totalFilled = successful.reduce((s, r) => s + parseFloat(r.volume || 0), 0); const avgPrice = totalFilled > 0 ? successful.reduce((s, r) => s + parseFloat(r.price || 0) * parseFloat(r.volume || 0), 0) / totalFilled : 0; return { filled: totalFilled, avgPrice, slices: successful.length, totalSlices: results.length }; }
}

// ─── ELITE: HELPER FUNCTIONS ──────────────────────────────────────────────
function calculateEliteStopLoss(entry, dir, atr, marketData, liquidityZones, regime) {
    if (!ELITE_CONFIG.smartStops.enabled) return dir === 'buy' ? entry - atr * 0.5 : entry + atr * 0.5;
    const minSL = 0.05;
    const atrMultiplier = ELITE_CONFIG.smartStops.useATRMultiplier || 0.5;
    const nearestLiquidity = findNearestLiquidity(liquidityZones, entry, dir);
    let stopPrice;
    const buffer = ELITE_CONFIG.smartStops.liquidityBufferPips;
    const tickSize = marketData?.tickSize || 0.01;
    if (dir === 'buy') {
        if (nearestLiquidity && nearestLiquidity < entry) stopPrice = nearestLiquidity - buffer;
        else { const volFactor = regime.volatility === 'high' ? 1.2 : regime.volatility === 'low' ? 0.7 : 1.0;
            stopPrice = entry - atr * atrMultiplier * volFactor; }
        if (entry - stopPrice < minSL) stopPrice = entry - minSL;
        if (ELITE_CONFIG.smartStops.avoidObviousLevels) stopPrice = avoidObviousLevels(stopPrice, tickSize);
    } else {
        if (nearestLiquidity && nearestLiquidity > entry) stopPrice = nearestLiquidity + buffer;
        else { const volFactor = regime.volatility === 'high' ? 1.2 : regime.volatility === 'low' ? 0.7 : 1.0;
            stopPrice = entry + atr * atrMultiplier * volFactor; }
        if (stopPrice - entry < minSL) stopPrice = entry + minSL;
        if (ELITE_CONFIG.smartStops.avoidObviousLevels) stopPrice = avoidObviousLevels(stopPrice, tickSize);
    }
    return parseFloat(stopPrice.toFixed(2));
}

function findNearestLiquidity(liquidityZones, price, dir) {
    if (!liquidityZones || !liquidityZones.length) return null;
    const sorted = liquidityZones.filter(z => dir === 'buy' ? z < price : z > price).sort((a, b) => dir === 'buy' ? b - a : a - b);
    return sorted.length > 0 ? sorted[0] : null;
}

function avoidObviousLevels(price, tickSize) {
    const roundNumber = Math.round(price);
    if (Math.abs(price - roundNumber) < tickSize * 5) return price + (price > roundNumber ? tickSize * 3 : -tickSize * 3);
    const halfLevel = Math.round(price * 2) / 2;
    if (Math.abs(price - halfLevel) < tickSize * 5) return price + (price > halfLevel ? tickSize * 3 : -tickSize * 3);
    return price;
}

function calculateElitePositionSize(balance, riskPct, slDist, contractSize, accountRisk, winRate, avgWin, avgLoss) {
    if (!ELITE_CONFIG.smartSizing.enabled) { const lotSize = (balance * (riskPct / 100)) / (slDist * contractSize); return { riskPct, lots: parseFloat(Math.max(0.03, Math.min(10, lotSize)).toFixed(2)), method: 'standard' }; }
    let kellySize = 0;
    if (ELITE_CONFIG.smartSizing.useKelly && winRate > 0) { const b = avgWin / avgLoss; const p = winRate; const q = 1 - p; const kelly = (p * b - q) / b;
        kellySize = Math.max(0, kelly * ELITE_CONFIG.smartSizing.kellyFraction); }
    let volSize = 0;
    if (ELITE_CONFIG.smartSizing.useVolatilityAdjusted && slDist > 0) { const volatilityRatio = slDist / 10;
        volSize = 1 / (1 + volatilityRatio * 0.5); }
    const baseSize = riskPct / 100;
    let combinedSize;
    if (kellySize > 0 && volSize > 0) combinedSize = (kellySize * 0.6 + volSize * 0.4) * baseSize;
    else if (kellySize > 0) combinedSize = kellySize * baseSize;
    else if (volSize > 0) combinedSize = volSize * baseSize;
    else combinedSize = baseSize;
    const maxRisk = ELITE_CONFIG.smartSizing.maxRiskPerTrade;
    const minRisk = ELITE_CONFIG.smartSizing.minRiskPerTrade;
    combinedSize = Math.min(maxRisk, Math.max(minRisk, combinedSize));
    const riskAmount = balance * combinedSize;
    const lotSize = riskAmount / (slDist * contractSize);
    return { riskPct: combinedSize * 100, lots: parseFloat(Math.max(0.03, Math.min(10, lotSize)).toFixed(2)), kellyComponent: kellySize, volatilityComponent: volSize, method: combinedSize > 0 ? 'elite_combined' : 'fallback' };
}

function getEliteExitStrategy(position, currentPrice, atr, analysis) {
    if (!ELITE_CONFIG.eliteExits.enabled) return null;
    const entry = parseFloat(position.openPrice);
    const dir = position.type === 'BUY' ? 'buy' : 'sell';
    const profit = dir === 'buy' ? currentPrice - entry : entry - currentPrice;
    const profitATR = profit / atr;
    const timeInTrade = position.time ? (Date.now() - new Date(position.time).getTime()) / 3600000 : 0;
    const strategies = [];
    if (ELITE_CONFIG.eliteExits.useVolatilityTrailing && profitATR > 0.3) {
        const trailDistance = atr * (0.15 + Math.min(profitATR / 20, 0.8));
        const trailStop = dir === 'buy' ? currentPrice - trailDistance : currentPrice + trailDistance;
        strategies.push({ type: 'volatility_trail', price: parseFloat(trailStop.toFixed(2)), distance: trailDistance });
    }
    if (ELITE_CONFIG.eliteExits.useTimeBasedExits) {
        const maxHours = position.maxHoldHours || 36;
        if (timeInTrade > maxHours * 0.6) strategies.push({ type: 'time_exit', urgency: timeInTrade / maxHours, reason: 'Time exit ' + timeInTrade.toFixed(1) + 'h/' + maxHours + 'h' });
    }
    if (ELITE_CONFIG.eliteExits.usePartialScaleOut && profitATR > 0.2) {
        const levels = ELITE_CONFIG.eliteExits.scaleOutLevels;
        const sizes = ELITE_CONFIG.eliteExits.scaleOutSizes;
        for (let i = 0; i < levels.length; i++) {
            if (profitATR >= levels[i]) {
                const scalePrice = dir === 'buy' ? entry + atr * levels[i] : entry - atr * levels[i];
                strategies.push({ type: 'scale_out', level: levels[i], size: sizes[i], price: parseFloat(scalePrice.toFixed(2)) });
            }
        }
    }
    if (profitATR > 0.8) {
        const candles = global._lastCandles || [];
        if (candles.length >= 10) {
            const recentMom = getMomentum(candles.slice(-5));
            const prevMom = getMomentum(candles.slice(-10, -5));
            if (recentMom < prevMom * 0.5) strategies.push({ type: 'momentum_exit', reason: 'Momentum fading', urgency: 0.8 });
        }
    }
    return strategies;
}

function getMomentum(candles) { if (!candles || candles.length < 2) return 0; const first = candles[0]; const last = candles[candles.length - 1]; const range = Math.max(0.01, last.high - last.low); const move = last.close - first.close; return move / range; }

async function getLiquidityZones(cfg) {
    const zones = [];
    try {
        const candles = await getCandles(cfg, '15m', 200);
        if (!candles || candles.length < 50) return zones;
        for (let i = 20; i < candles.length - 20; i++) {
            let isHigh = true, isLow = true;
            for (let j = i - 20; j <= i + 20; j++) { if (j === i) continue; if (candles[j].high > candles[i].high) isHigh = false; if (candles[j].low < candles[i].low) isLow = false; }
            if (isHigh) zones.push(candles[i].high);
            if (isLow) zones.push(candles[i].low);
        }
        const currentPrice = candles[candles.length - 1].close;
        for (let i = -5; i <= 5; i++) { const roundLevel = Math.round(currentPrice / 10) * 10 + i * 10; if (roundLevel > 0) zones.push(roundLevel); }
        if (candles.length >= 24) { const yesterday = candles.slice(-48, -24); if (yesterday.length > 0) { zones.push(Math.max(...yesterday.map(c => c.high)));
                zones.push(Math.min(...yesterday.map(c => c.low))); } }
        return [...new Set(zones)].sort((a, b) => a - b);
    } catch (e) { logger.warn('[Elite] Failed to get liquidity zones:', e.message); return zones; }
}

// ─── DETECT MARKET TREND ──────────────────────────────────────────────────
function detectMarketTrend(candles, lookback) {
    lookback = lookback || 50;
    if (!candles || candles.length < lookback) return { direction: 'neutral', strength: 0, isStrongTrend: false };
    let closes = candles.slice(-lookback).map(c => c.close);
    let first = closes[0];
    let last = closes[closes.length - 1];
    let change = (last - first) / first * 100;
    let n = closes.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += closes[i];
        sumXY += i * closes[i];
        sumX2 += i * i;
    }
    let slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    let direction = 'neutral';
    let strength = 0;
    if (slope > 0.05 && change > 0.2) {
        direction = 'bullish';
        strength = Math.min(1, Math.abs(slope) / 0.5);
    } else if (slope < -0.05 && change < -0.2) {
        direction = 'bearish';
        strength = Math.min(1, Math.abs(slope) / 0.5);
    }
    let volatility = 0;
    for (let i = 1; i < closes.length; i++) {
        volatility += Math.abs(closes[i] - closes[i-1]);
    }
    volatility = volatility / closes.length;
    let trendRatio = Math.abs(change) / (volatility + 0.01);
    let isStrongTrend = trendRatio > 0.5 && strength > 0.5;
    return { direction, strength, slope, change, isStrongTrend, volatility };
}

// ─── CHECK FOR LOSS STREAK ──────────────────────────────────────────────
function checkLossStreak(state) {
    let consecLosses = state.consecLosses || 0;
    let consecWins = state.consecWins || 0;
    // No pause, only size reduction
    if (consecLosses >= 5) return { action: 'reduce_size', reason: `${consecLosses} consecutive losses - reducing size`, sizeMultiplier: 0.1 };
    else if (consecLosses >= 4) return { action: 'reduce_size', reason: `${consecLosses} consecutive losses - reducing size`, sizeMultiplier: 0.2 };
    else if (consecLosses >= 3) return { action: 'reduce_size', reason: `${consecLosses} consecutive losses - reducing size`, sizeMultiplier: 0.3 };
    else if (consecLosses >= 2) return { action: 'reduce_size', reason: `${consecLosses} consecutive losses - reducing size`, sizeMultiplier: 0.6 };
    else if (consecWins >= 3) return { action: 'normal', reason: `${consecWins} consecutive wins - normal`, sizeMultiplier: 1.0 };
    return { action: 'normal', reason: 'normal operation', sizeMultiplier: 1.0 };
}

// ─── CLOSE-DEAL ACCOUNTING ────────────────────────────────────────────────
// A position can have several closing (OUT) deals — e.g. one small lot taken
// off at TP1, then the rest closed by its SL/TP. Both places that read a
// closed position's result from its deal history (reconcileClosedTrades and
// safePositionOperation) used to take the FIRST OUT deal as "the close" —
// for a position with a partial close that is just the partial, so a trade
// whose remainder lost would be journaled as a small win. This sums every
// OUT deal, and says whether the whole opened volume has been closed yet
// (if not, the final deal isn't visible in the history yet — retry later).
// Added 2026-10-23.
function summarizePositionDeals(deals) {
    let inVol = 0, outVol = 0, pnl = 0, lastOut = null, nOut = 0;
    for (const d of (Array.isArray(deals) ? deals : [])) {
        if (!d) continue;
        const v = parseFloat(d.volume) || 0;
        if (d.entryType === 'DEAL_ENTRY_IN') inVol += v;
        else if (d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_OUT_BY') {
            nOut++; outVol += v;
            pnl += (parseFloat(d.profit) || 0) + (parseFloat(d.commission) || 0) + (parseFloat(d.swap) || 0);
            if (!lastOut || new Date(d.time || 0).getTime() >= new Date(lastOut.time || 0).getTime()) lastOut = d;
        }
    }
    // Without volume fields we can't tell — treat any OUT deal as final (the old behaviour).
    const volumesKnown = inVol > 0 && outVol > 0;
    return { nOut, inVol, outVol, pnl, lastOut, fullyClosed: nOut > 0 && (!volumesKnown || outVol >= inVol - 1e-6) };
}

// Adds a just-placed position to the set reconcileClosedTrades watches.
// Previously a trade only got into that set at the NEXT cycle's reconcile
// pass, so a trade that hit its SL/TP before then (within one cycle) was in
// neither the old nor the new set and was never journaled as closed. Seen in
// simulation: 13 of 159 trades, all fast stop-outs — so every report, the
// win rate, the loss-streak sizing and the daily loss limit undercounted
// losses. Added 2026-10-23.
function trackOpenPosition(id) {
    try {
        const s = global._botState || {}, ids = Array.isArray(s._openPositionIds) ? s._openPositionIds.slice() : [];
        const nid = normalizePositionId(id);
        if (nid && ids.indexOf(nid) === -1) { ids.push(nid); updateBotState({ _openPositionIds: ids }); }
    } catch (e) { logger.warn('[reconcile] could not track new position:', e.message); }
}

// ─── RECONCILE CLOSED TRADES ──────────────────────────────────────────────
async function reconcileClosedTrades(cfg, current) {
    let state = global._botState || {},
        prev = state._openPositionIds || [],
        retries = state._pendingCloseRetries || {},
        engineClosed = state._engineClosedIds || [],
        curr = current.map(p => normalizePositionId(p.id));
    let closed = prev.filter(id => curr.indexOf(id) === -1 && engineClosed.indexOf(id) === -1);
    if (!closed.length) {
        let keys = Object.keys(retries);
        if (!keys.length) {
            updateBotState({ _openPositionIds: curr });
            return;
        }
    }
    let toResolve = {};
    closed.forEach(id => toResolve[id] = true);
    Object.keys(retries).forEach(id => {
        if (curr.indexOf(id) === -1 && engineClosed.indexOf(id) === -1) toResolve[id] = true;
    });
    let ids = Object.keys(toResolve), totalPnl = 0, anyLoss = false, anyWin = false, stillUnresolved = {}, legIds = 0;
    // v1: a trade's TP1 leg (its own position) is part of that trade — its
    // result goes to the parent, and it is resolved before the parent so the
    // parent's journal entry already includes it. 2026-10-24.
    const legParent = id => { const ps = loadPositionState(id); return ps && ps._isLegA && ps._legOf ? normalizePositionId(ps._legOf) : null; };
    ids.sort((a, b) => (legParent(b) ? 1 : 0) - (legParent(a) ? 1 : 0));
    for (let id of ids) {
        try {
            let deals = await maGet(cfg, '/history-deals/position/' + id, false);
            if (!Array.isArray(deals)) throw new Error('Unexpected deals');
            // All OUT deals (a TP1 partial + the final close), not just the first.
            let sum = summarizePositionDeals(deals);
            if (!sum.nOut) throw new Error('No close deal yet');
            if (!sum.fullyClosed) throw new Error('Final close deal not visible yet');
            let close = sum.lastOut;
            let pnl = sum.pnl, won = pnl >= 0;
            totalPnl += pnl;
            const parent = legParent(id);
            if (parent) {
                const jj = loadJournal(), pt = jj.trades.find(x => x && x.id === parent);
                const already = !!(pt && pt.legAClosed);
                journalLegClose(parent, pnl);
                // A TP1 lot stopped out is reported with its trade's result.
                if (!already && pt && pnl >= 0) sendTelegram('✅ *TP1 hit* — trade #' + parent + '\nThe TP1 lot (position #' + id + ') closed at the broker at ' + parseFloat(close.price || 0).toFixed(2) + ' (P&L ' + cfg.currency + pnl.toFixed(2) + ')\nThe rest runs; its stop goes to breakeven.');
                legIds++;
                continue;
            }
            if (won) anyWin = true;
            else anyLoss = true;
            try { journalClose(id, won ? 'win' : 'loss', null, pnl, { totalPnl: true }); } catch (e) {}
            let s = global._botState || {};
            let update = {
                consecLosses: won ? 0 : (s.consecLosses || 0) + 1,
                consecWins: won ? (s.consecWins || 0) + 1 : 0,
                weekWins: won ? (s.weekWins || 0) + 1 : (s.weekWins || 0),
                weekLosses: won ? (s.weekLosses || 0) : (s.weekLosses || 0) + 1
            };
            if (!won) update.lastSLHit = { price: parseFloat(close.price || 0), time: new Date().toISOString() };
            else update.lastSLHit = null;
            updateBotState(update);
        } catch (e) {
            let attempts = (retries[id] || 0) + 1;
            if (attempts < 6) stillUnresolved[id] = attempts;
            else sendTelegram('⚠️ Could not reconcile closed position ' + id + ' after several attempts');
        }
    }
    if (totalPnl !== 0) {
        let s2 = global._botState || {};
        updateBotState({ dailyPnl: (s2.dailyPnl || 0) + totalPnl, monthlyPnl: (s2.monthlyPnl || 0) + totalPnl });
    }
    if (anyLoss || anyWin) {
        // Counts trades: a v1 trade's TP1 lot is part of its trade.
        let resolved = ids.length - Object.keys(stillUnresolved).length - legIds;
        sendTelegram('📋 Reconciled ' + resolved + ' closed ' + (legIds ? 'trade' : 'position') + (resolved > 1 ? 's' : '') + ': ' + (anyWin && !anyLoss ? 'WIN' : anyLoss && !anyWin ? 'LOSS' : 'mixed') + ' — Net ' + cfg.currency + totalPnl.toFixed(2));
    }
    updateBotState({ _openPositionIds: curr, _pendingCloseRetries: stillUnresolved, _engineClosedIds: [] });
}

// ─── DETECT JUDAS SWING ──────────────────────────────────────────────────
function detectJudasSwing(m15, session, liq, mss) {
    let inWin = !!(session && (session.type === 'judas' || session.type === 'reversal'));
    if (!inWin || !liq || !liq.swept || !mss || mss.dir === 'neutral') return { judas: false, dir: null };
    let valid = (liq.side === 'buy-side' && mss.dir === 'bullish') || (liq.side === 'sell-side' && mss.dir === 'bearish');
    return { judas: valid, dir: valid ? mss.dir : null };
}

// ─── DETECT EQUAL HIGHS/LOWS ─────────────────────────────────────────────
function detectEqualHighsLows(sw, atr) {
    let tol = Math.max(atr * .1, .01);
    function findEqual(arr) {
        if (!arr || arr.length < 2) return null;
        for (let i = arr.length - 1; i >= 1; i--)
            for (let j = i - 1; j >= 0; j--)
                if (Math.abs(arr[i].price - arr[j].price) < tol)
                    return { level: (arr[i].price + arr[j].price) / 2 };
        return null;
    }
    return { eqHighs: findEqual(sw.highs), eqLows: findEqual(sw.lows) };
}

// ─── FIND LEG FOR MSS ─────────────────────────────────────────────────────
function findLegForMSS(sw, mss) {
    if (!mss || mss.dir === 'neutral' || !sw.highs.length || !sw.lows.length) return null;
    if (mss.dir === 'bullish') {
        let bh = null;
        for (let i = sw.highs.length - 1; i >= 0; i--)
            if (Math.abs(sw.highs[i].price - mss.level) < 1e-9) { bh = sw.highs[i]; break; }
        if (!bh) bh = sw.highs[sw.highs.length - 1];
        let ol = null;
        for (let i = sw.lows.length - 1; i >= 0; i--)
            if (sw.lows[i].idx < bh.idx) { ol = sw.lows[i]; break; }
        if (!ol) ol = sw.lows[0];
        return { high: bh.price, low: ol.price };
    }
    let bl = null;
    for (let i = sw.lows.length - 1; i >= 0; i--)
        if (Math.abs(sw.lows[i].price - mss.level) < 1e-9) { bl = sw.lows[i]; break; }
    if (!bl) bl = sw.lows[sw.lows.length - 1];
    let oh = null;
    for (let i = sw.highs.length - 1; i >= 0; i--)
        if (sw.highs[i].idx < bl.idx) { oh = sw.highs[i]; break; }
    if (!oh) oh = sw.highs[0];
    return { high: oh.price, low: bl.price };
}

// ─── IN OTE ──────────────────────────────────────────────────────────────
function inOTE(sw, bias, price, mss) {
    let leg = findLegForMSS(sw, mss), high, low;
    if (leg) { high = leg.high; low = leg.low; }
    else {
        if (!sw.highs.length || !sw.lows.length) return false;
        high = sw.highs[sw.highs.length - 1].price;
        low = sw.lows[sw.lows.length - 1].price;
    }
    let range = high - low;
    if (range <= 0) return false;
    if (price > high + range * .05 || price < low - range * .05) return false;
    let ret = bias === 'bullish' ? (high - price) / range : (price - low) / range;
    return ret >= .618 && ret <= .79;
}

// ─── PREMIUM / DISCOUNT ──────────────────────────────────────────────────
function premiumDiscount(sw, price, mss) {
    let leg = findLegForMSS(sw, mss), high, low;
    if (leg) { high = leg.high; low = leg.low; }
    else {
        if (!sw.highs.length || !sw.lows.length) return 'unknown';
        high = sw.highs[sw.highs.length - 1].price;
        low = sw.lows[sw.lows.length - 1].price;
    }
    let range = high - low;
    if (range <= 0) return 'unknown';
    if (price > high + range * .05 || price < low - range * .05) return 'unknown';
    let eq = (high + low) / 2;
    if (price < low + range * .25) return 'deep_discount';
    if (price < eq) return 'discount';
    if (price > high - range * .25) return 'deep_premium';
    if (price > eq) return 'premium';
    return 'equilibrium';
}

// ─── DETECT NESTED FVG ──────────────────────────────────────────────────
function detectNestedFVG(m15, h1, h4, price, dir) {
    let type = dir === 'buy' ? 'bull' : 'bear',
        atr = indicators.calcATR14(m15),
        h1atr = (h1 && h1.length >= 14) ? indicators.calcATR14(h1) : atr,
        h4atr = (h4 && h4.length >= 14) ? indicators.calcATR14(h4) : atr;
    let m15f = indicators.detectFVG(m15, price, atr).filter(f => f.type === type),
        h1f = indicators.detectFVG(h1, price, h1atr).filter(f => f.type === type),
        h4f = indicators.detectFVG(h4, price, h4atr).filter(f => f.type === type);
    if (!m15f.length) return { nested: false, depth: 0, zone: null };
    let best = m15f[0], depth = 1, h1match = null, h4match = null;
    for (let f of h1f)
        if (best.ce >= f.bot && best.ce <= f.top) { h1match = f; depth = 2; break; }
    if (h1match)
        for (let f of h4f)
            if (h1match.ce >= f.bot && h1match.ce <= f.top) { h4match = f; depth = 3; break; }
    return { nested: depth >= 2, depth, zone: best, h1Match: h1match, h4Match: h4match,
        label: depth === 3 ? 'H4+H1+M15 FVG stack' : depth === 2 ? 'H1+M15 FVG stack' : 'M15 FVG only' };
}

// ─── DETECT DIVERGENCE ──────────────────────────────────────────────────
function detectDivergence(candles) { return indicators.detectDivergence(candles); }

// ─── DETECT PATTERNS ICT ────────────────────────────────────────────────
function detectPatternsICT(candles) {
    if (!candles || candles.length < 20) return { patterns: [] };
    let highs = candles.map(c => c.high), lows = candles.map(c => c.low), closes = candles.map(c => c.close),
        atr = indicators.calcATR14(candles), tol = Math.max(atr * .15, .02), patterns = [];
    if (closes.length >= 10) {
        let lh = Math.max(...highs.slice(-5)), ph = Math.max(...highs.slice(-10, -5)),
            nl = Math.min(...lows.slice(-10)), bd = closes[closes.length - 1] < nl + tol;
        if (Math.abs(lh - ph) < tol && bd)
            patterns.push({ type: 'DoubleTop', direction: 'bearish', confidence: 75 });
    }
    if (closes.length >= 10) {
        let ll = Math.min(...lows.slice(-5)), pl = Math.min(...lows.slice(-10, -5)),
            nh = Math.max(...highs.slice(-10)), bu = closes[closes.length - 1] > nh - tol;
        if (Math.abs(ll - pl) < tol && bu)
            patterns.push({ type: 'DoubleBottom', direction: 'bullish', confidence: 75 });
    }
    return { patterns };
}

// ─── GET MTF SCORE ──────────────────────────────────────────────────────
function getMTFScore(m15, h1, h4, price, dir) {
    let h4r = analyzeTFForScore(h4, price, dir), h1r = analyzeTFForScore(h1, price, dir), m15r = analyzeTFForScore(m15, price, dir);
    // Was `aligned: h4s > 0 && h1s > 0 && m15s > 0` — any nonzero score
    // counted, including a timeframe where the ONLY contributing factor was
    // adx.trending, which fires regardless of direction. That meant "Full
    // MTF alignment" (+1.5, one of the highest-weighted bonuses) could be
    // awarded even when a timeframe's actual directional signals (bias, MSS)
    // disagreed with the trade — as long as it was "trending" in either
    // direction. Now requires at least one genuinely directional factor
    // (bias match or MSS direction match) per timeframe, not just any
    // nonzero score. Found during a full-list code audit, 2026-08-18.
    return { total: h4r.score * .4 + h1r.score * .35 + m15r.score * .25, h4: h4r.score, h1: h1r.score, m15: m15r.score,
        aligned: h4r.directional && h1r.directional && m15r.directional, h4h1Aligned: h4r.directional && h1r.directional };
}

// ─── ANALYZE TF FOR SCORE ──────────────────────────────────────────────
function analyzeTFForScore(candles, price, dir) {
    if (!candles || candles.length < 20) return { score: 0, directional: false };
    let score = 0, directional = false, want = dir === 'buy' ? 'bullish' : dir === 'sell' ? 'bearish' : null,
        atr = indicators.calcATR14(candles),
        so = { windowSize: SWING_CONFIG.windowSize, minMovePct: SWING_CONFIG.minMovePct, maxSwings: SWING_CONFIG.maxSwings, atr };
    let sw = indicators.detectSwings(candles, so), bias = indicators.calcHTFBias(candles),
        adx = indicators.calcADX(candles),
        fvgs = indicators.detectFVG(candles, price, atr),
        obs = indicators.detectOB(candles, price, atr),
        mss = indicators.detectMSS(candles, sw, price, atr),
        liq = indicators.detectLiqSweep(candles, sw);
    if (want && bias === want) { score += 2; directional = true; }
    if (adx.trending) score += 1;
    if (want && mss.dir === want) { score += 1; directional = true; }
    if (liq.swept) score += 1;
    if (fvgs.length) score += 1;
    if (obs.length) score += 1;
    return { score: Math.min(10, score), directional };
}

// ─── ANALYSE M5 ENTRY ──────────────────────────────────────────────────
function analyseM5Entry(m5, dir) {
    if (!m5 || m5.length < 20 || !dir || dir === 'none')
        return { hasSetup: false, zone: null, confirmed: false };
    let want = dir === 'buy' ? 'bullish' : 'bearish',
        price = m5[m5.length - 1].close,
        atr = indicators.calcATR14(m5),
        so = { windowSize: SWING_CONFIG.windowSize, minMovePct: SWING_CONFIG.minMovePct, maxSwings: SWING_CONFIG.maxSwings, atr };
    let sw = indicators.detectSwings(m5, so),
        mss = indicators.detectMSS(m5, sw, price, atr),
        confirmed = !!(mss && mss.dir === want),
        fvgs = indicators.detectFVG(m5, price, atr) || [],
        zone = fvgs.length ? fvgs[0] : null;
    return { hasSetup: confirmed || !!(zone && zone.approaching), zone, confirmed };
}

// ─── WAIT FOR M1 PULLBACK ─────────────────────────────────────────────
async function waitForM1Pullback(cfg, signal, zone, atr, maxWait, pullback) {
    try {
        let c = await getCandles(cfg, '1m', 20);
        if (!c || c.length < 10) return null;
        let last = c[c.length - 1].close, zl;
        if (zone && zone.type === 'bull') zl = zone.ce;
        else if (zone && zone.type === 'bear') zl = zone.ce;
        else zl = last;
        let target = signal === 'buy' ? zl * (1 - pullback * .01) : zl * (1 + pullback * .01);
        for (let i = 0; i < Math.min(maxWait, c.length); i++) {
            let cc = c[c.length - 1 - i];
            if (signal === 'buy' && cc.low <= target)
                return { entryPrice: Math.min(cc.close, target), pulledBack: true };
            if (signal === 'sell' && cc.high >= target)
                return { entryPrice: Math.max(cc.close, target), pulledBack: true };
        }
        return { entryPrice: last, pulledBack: false };
    } catch (e) {
        logger.warn('[M1 entry] Error:', e.message);
        return null;
    }
}

// ─── RUN FULL ANALYSIS ──────────────────────────────────────────────────────
function runFullAnalysis(m5, m15, m30, h1, h4, cfg, regime, d1, w1, price, atr14) {
    // Resolve any pending counterfactuals against this cycle's price before
    // doing anything else — same cadence as real position management, one
    // check per cycle regardless of whether this cycle ends up trading.
    resolveCounterfactuals(price);

    let sc = getSymConfig(cfg.symbol), data = updateIndicatorsIncrementally(m15, { curP: price, forceRecalc: false }),
        fvgs = data.fvgs || [], obs = data.obs || [], swings = data.swings || { highs: [], lows: [] },
        mss = data.mss || { dir: 'neutral', type: 'none' }, liq = data.liq || { swept: false },
        adxData = data.adx || { adx: 20, trending: false, strong: false }, atr = data.atr || atr14 || 5,
        candleChar = data.candleChar || { label: 'neutral', score: 0 }, vsaResult = data.vsaResult || null,
        breakerResult = data.breakerResult || null;

    let marketTrend = detectMarketTrend(h4 || h1 || m15, 50);

    // Trailing M15 ATR history for the self-calibrating volatility check
    // further down — same technique detectRegime already uses for H4, just
    // computed once here since it's needed regardless of signal direction.
    let m15PriorAtrs = [];
    for (let i = 5; i < m15.length - 5; i++) {
        let sl = m15.slice(Math.max(0, i - 14), i);
        if (sl.length >= 10) m15PriorAtrs.push(indicators.calcATR14(sl));
    }

    if (!fvgs.length) fvgs = indicators.detectFVG(m15, price, atr);
    if (!obs.length) obs = indicators.detectOB(m15, price, atr);
    if (!swings.highs.length) swings = indicators.detectSwings(m15, { windowSize: SWING_CONFIG.windowSize, minMovePct: SWING_CONFIG.minMovePct, maxSwings: SWING_CONFIG.maxSwings, atr });
    if (mss.dir === 'neutral') mss = indicators.detectMSS(m15, swings, price, atr);
    if (!liq.swept) liq = indicators.detectLiqSweep(m15, swings);

    // Top-down alignment
    const bias4h = indicators.calcHTFBias(h4);
    const bias1h = indicators.calcHTFBias(h1);
    const bias30m = indicators.calcHTFBias(m30);
    const bias15m = indicators.calcHTFBias(m15);
    let alignment;
    try {
        alignment = getTopDownAlignment(bias4h, bias1h, bias30m, bias15m);
    } catch (e) {
        logger.warn('[TopDownAlignment] unavailable, using neutral:', e.message);
        alignment = { bias: 'neutral', score: 0 };
    }
    const topDownBias = alignment.bias;
    const alignmentScore = alignment.score;

    let session = getSessionContext(), kzOn = anyKZ(cfg), sbOn = inSilverBullet(),
        bias = indicators.calcHTFBias(h4.length >= 20 ? h4 : (h1.length >= 20 ? h1 : m15));

    let signal = 'none';
    if (mss.dir !== 'neutral') signal = mss.dir === 'bullish' ? 'buy' : 'sell';
    else if (bias !== 'neutral') signal = bias === 'bullish' ? 'buy' : 'sell';

    // ─── External data: DXY and Treasury ──────────────────────────────────
    const dxyData = global._dxyData || null;
    const treasuryData = global._treasuryData || null;
    let dxyTrend = dxyData ? dxyData.trend : null;
    let treasuryTrend = treasuryData ? treasuryData.trend : null;

    // ─── Day-of-week seasonality ─────────────────────────────────────────
    let score = 0, hits = [], factors = [], sv = getSessionVolatilityPattern(session.session);
    // sv.skip existed in config since at least v23.0 but was never read by
    // anything — off-hours trading was never actually being skipped. Wired
    // up 2026-08-27 alongside the SESSION_FACTORS config-drift fix above.
    if (sv.skip && signal !== 'none') {
        hits.push('🚫 ' + session.label + ' session marked skip in config — no trade');
        signal = 'none';
    }
    let wantType = signal === 'buy' ? 'bull' : signal === 'sell' ? 'bear' : null;
    const dowSeason = getDayOfWeekSeasonality(new Date());
    let seasonBonus = dowSeason.bonus;
    if (seasonBonus !== 0) {
        hits.push(`📅 Day-of-week: ${dowSeason.label} ${seasonBonus > 0 ? '+' : ''}${seasonBonus}`);
        score += seasonBonus;
    }

    let dailyOpen = (d1 && d1.length) ? d1[d1.length - 1].open : null,
        weeklyOpen = (w1 && w1.length) ? w1[w1.length - 1].open : null,
        prevDayHigh = (d1 && d1.length >= 2) ? d1[d1.length - 2].high : null,
        prevDayLow = (d1 && d1.length >= 2) ? d1[d1.length - 2].low : null;

    let adr = null, adrRatio = null;
    if (d1 && d1.length >= 10) {
        let ranges = d1.map(c => c.high - c.low), full = ranges.reduce((a, b) => a + b, 0) / ranges.length,
            recent = ranges.slice(-5), ra = recent.reduce((a, b) => a + b, 0) / recent.length;
        adr = full; adrRatio = full > 0 ? ra / full : 1;
    }

    const macroTrend = analyzeMacroTrend(d1, w1);
    const macroBias = getMacroBias(macroTrend, signal);

    const liquidityPools = detectLiquidityPools(m15, swings, atr);
    const liquiditySweep = isLiquiditySweep(m15, liquidityPools, atr);
    global._liquidityPools = liquidityPools;

    const turtleSoup = detectTurtleSoup(m15, swings, atr);

    let dfvgs = wantType ? fvgs.filter(f => f.type === wantType) : fvgs,
        dobs = wantType ? obs.filter(o => o.type === wantType) : obs;
    let bestFVG = dfvgs.length ? dfvgs[0] : null;
    if (bestFVG && bestFVG.approaching && bestFVG.quality >= 2) { let b = 1 + (bestFVG.isFresh ? 1 : 0) - (bestFVG.visits > 0 ? .3 : 0);
        score += Math.max(0, b);
        hits.push('FVG approaching +' + b);
        factors.push('FVGapproaching'); } else if (bestFVG && bestFVG.quality >= 1) { let b = 0.5 + (bestFVG.isFresh ? 0.5 : 0) - (bestFVG.visits > 0 ? .3 : 0);
        score += Math.max(0, b);
        hits.push('FVG present +' + b);
        factors.push('FVGpresent'); }
    let bestOB = dobs.length ? dobs[0] : null;
    if (bestOB && bestOB.inZone && bestOB.quality >= 2) { let b = 1 + (bestOB.isFresh ? 1 : 0) - (bestOB.visits > 0 ? .3 : 0);
        score += Math.max(0, b);
        hits.push('OB in zone +' + b);
        factors.push('OBinZone'); } else if (bestOB && bestOB.quality >= 1) { let b = 0.5 + (bestOB.isFresh ? 0.5 : 0) - (bestOB.visits > 0 ? .3 : 0);
        score += Math.max(0, b);
        hits.push('OB present +' + b);
        factors.push('OBpresent'); }
    let triple = bestFVG && bestOB && Math.abs(bestFVG.ce - bestOB.mid) < Math.max(atr * .3, .5);
    if (triple) { score += 0.5;
        hits.push('Triple confluence +0.5');
        factors.push('TripleConfluence'); }
    if (mss.dir !== 'neutral') { let mb = (mss.type === 'CHoCH' || mss.type === 'BOS_confirmed') ? (liq.swept ? 1 : 0.5) : 0.3;
        score += mb;
        hits.push(mss.dir + ' ' + mss.type + ' +' + mb);
        factors.push('MSS'); }
    if (mss.dir === 'neutral' && hits && hits.some(h => h && h.includes('CHoCH'))) {
        if (hits.some(h => h && h.includes('bearish CHoCH'))) { mss.dir = 'bearish'; mss.type = 'CHoCH'; }
        else if (hits.some(h => h && h.includes('bullish CHoCH'))) { mss.dir = 'bullish'; mss.type = 'CHoCH'; }
    }
    let judas = detectJudasSwing(m15, session, liq, mss), pdh = !!(liq.swept && liq.side === 'sell-side' && prevDayHigh !== null && Math.abs(price - prevDayHigh) < atr * .5),
        pdl = !!(liq.swept && liq.side === 'buy-side' && prevDayLow !== null && Math.abs(price - prevDayLow) < atr * .5);
    if (judas.judas) { score += 1;
        hits.push('Judas swing (' + judas.dir + ') +1');
        factors.push('JudasSwing'); } else if (pdh || pdl) { score += 1;
        hits.push((pdh ? 'PDH' : 'PDL') + ' liquidity sweep +1');
        factors.push('PDHPDLSweep');
    } else if (liq.swept && liq.side === (signal === 'buy' ? 'buy-side' : 'sell-side')) { score += 0.5;
        hits.push('Liq sweep (' + liq.side + ') +0.5');
        factors.push('LiqSweep'); } else if (liq.swept) {
        hits.push('⚠️ Liq sweep (' + liq.side + ') wrong-side, no bonus');
    }
    let eq = detectEqualHighsLows(swings, atr), eqBonus = false;
    if (mss.dir === 'bullish' && eq.eqHighs && eq.eqHighs.level > price && (eq.eqHighs.level - price) < atr * 3) { score += 0.5;
        hits.push('Equal highs liquidity pool nearby +0.5');
        eqBonus = true;
        factors.push('EqHighs'); } else if (mss.dir === 'bearish' && eq.eqLows && eq.eqLows.level < price && (price - eq.eqLows.level) < atr * 3) { score += 0.5;
        hits.push('Equal lows liquidity pool nearby +0.5');
        eqBonus = true;
        factors.push('EqLows'); }
    if (bias !== 'neutral') { score += 1;
        hits.push(bias + ' bias +1');
        factors.push('HTFBias'); }
    let ote = inOTE(swings, bias, price, mss), pd = premiumDiscount(swings, price, mss),
        pdCorrect = (mss.dir === 'bullish' && (pd === 'discount' || pd === 'deep_discount')) || (mss.dir === 'bearish' && (pd === 'premium' || pd === 'deep_premium'));
    if (ote && pdCorrect) { score += 1;
        hits.push('OTE+P/D +1');
        factors.push('OTE'); } else if (ote || pdCorrect) { score += 0.5;
        hits.push(ote ? 'OTE zone +0.5' : 'P/D correct +0.5');
        factors.push('OTEorPD'); }
    if (!adxData.trending && score > 0) { score = Math.max(0, score - 0.5);
        hits.push('ADX ' + adxData.adx + ' (ranging) -0.5');
        factors.push('ADXlow'); }
    if (session.scoreMod !== 0) { score = Math.max(0, score + session.scoreMod); if (session.scoreMod > 0) hits.push(session.label + ' +' + session.scoreMod); else hits.push(session.label + ' ' + session.scoreMod);
        factors.push('Session'); }
    if (regime.scoreMod) { score = Math.max(0, score + regime.scoreMod);
        hits.push('Regime (' + regime.regime + ') ' + (regime.scoreMod > 0 ? '+' : '') + regime.scoreMod);
        factors.push('Regime'); }
    let hour = new Date().getUTCHours(), hwr = getHourWinRate(hour);
    // v1: the hour's past win rate is shown but no longer moves the score
    // (it is learned from results, and each hour holds far too few trades
    // to mean anything yet). 2026-10-24.
    if (hwr !== null && v1On()) hits.push('Hour ' + hour + ' UTC win rate ' + Math.round(hwr * 100) + '% (log only)');
    else if (hwr !== null) { if (hwr < .35) { score = Math.max(0, score - 0.5);
            hits.push('Hour ' + hour + ' UTC weak (' + Math.round(hwr * 100) + '%) -0.5');
            factors.push('WeakHour'); } else if (hwr > .55) { score += 0.3;
            hits.push('Hour ' + hour + ' UTC strong (' + Math.round(hwr * 100) + '%) +0.3');
            factors.push('StrongHour'); } }
    let adv = analyzeRegimeAdvanced(h4, h1, m15);
    if (adv && adv.confidence > .5) { if (adv.recommendations && adv.recommendations.avoidCounterTrend) { if (adv.trendDirection === 'bullish' && signal === 'sell') { hits.push('Blocked: Counter-trend in strong bull');
                signal = 'none'; } else if (adv.trendDirection === 'bearish' && signal === 'buy') { hits.push('Blocked: Counter-trend in strong bear');
                signal = 'none'; } } if (adv.regime === 'strong_trend' && signal !== 'none') { score += 1;
            hits.push('Strong trend regime +1');
            factors.push('StrongTrend'); } }
    let cpats = analyzeCandlestickPatterns(m15, atr), candlePattern = null;
    if (cpats && cpats.patterns.length) { let best = cpats.bestPattern; if (best) { candlePattern = best.type; if (signal === 'buy' && best.bullish === true) { let b = CONFLUENCE_WEIGHTS.candlePattern || 1;
                score += b;
                hits.push('Candle pattern: ' + best.type + ' +' + b);
                factors.push('CandlePattern'); } else if (signal === 'sell' && best.bullish === false) { let b = CONFLUENCE_WEIGHTS.candlePattern || 1;
                score += b;
                hits.push('Candle pattern: ' + best.type + ' +' + b);
                factors.push('CandlePattern'); } else if (best.bullish === null) { score += .3;
                hits.push('Doji +0.3');
                factors.push('Doji'); } } }
    let vsaConf = false, vsaSig = null;
    if (vsaResult && signal !== 'none') { if (signal === 'buy' && vsaResult.confirmsBullish) { let b = CONFLUENCE_WEIGHTS.vsaBullish || 1;
            score += b;
            hits.push('VSA confirms bullish +' + b);
            vsaConf = true;
            vsaSig = 'bullish';
            factors.push('VSA'); } else if (signal === 'sell' && vsaResult.confirmsBearish) { let b = CONFLUENCE_WEIGHTS.vsaBearish || 1;
            score += b;
            hits.push('VSA confirms bearish +' + b);
            vsaConf = true;
            vsaSig = 'bearish';
            factors.push('VSA'); } else if (vsaResult.absorption && signal !== 'none') { score += 0.5;
            hits.push('VSA absorption detected +0.5');
            vsaConf = true;
            factors.push('VSAabs'); } if (vsaResult.lastSignal) vsaSig = vsaResult.lastSignal.type; }
    let hasBreaker = false, breakerSig = null;
    if (breakerResult && signal !== 'none') { if (breakerResult.hasBreaker) { if (signal === 'buy' && breakerResult.bullishBreaker) { let b = CONFLUENCE_WEIGHTS.breakerBlock || 1;
                score += b;
                hits.push('Breaker block bullish +' + b);
                hasBreaker = true;
                breakerSig = 'bullish';
                factors.push('Breaker'); } else if (signal === 'sell' && breakerResult.bearishBreaker) { let b = CONFLUENCE_WEIGHTS.breakerBlock || 1;
                score += b;
                hits.push('Breaker block bearish +' + b);
                hasBreaker = true;
                breakerSig = 'bearish';
                factors.push('Breaker'); } else if (breakerResult.approachingBreakers > 0) { score += 0.5;
                hits.push('Breaker approaching +0.5');
                hasBreaker = true;
                factors.push('BreakerApproach'); } if (breakerResult.nearestBreaker) { let inv = breaker.detectInverseFVG(m15, breakerResult.breakers, atr); if (inv && inv.hasInverseFVG) { let b = CONFLUENCE_WEIGHTS.inverseFVG || 1;
                    score += b;
                    hits.push('Inverse FVG at breaker +' + b);
                    factors.push('InverseFVG'); } } } }
    if (signal !== 'none' && dxyTrend) {
        let conflict = (signal === 'buy' && dxyTrend === 'bullish') || (signal === 'sell' && dxyTrend === 'bearish');
        let align = (signal === 'buy' && dxyTrend === 'bearish') || (signal === 'sell' && dxyTrend === 'bullish');
        if (conflict) { hits.push('⚠️ DXY conflict (' + dxyTrend + ') vs ' + signal + ' — -1.5'); score = Math.max(0, score - 1.5); }
        else if (align) { hits.push('✅ DXY aligns (' + dxyTrend + ') + ' + signal + ' +1'); score = Math.min(12, score + 1); }
    }

    if (signal !== 'none' && treasuryTrend) {
        // Rising yields usually bearish for gold, falling yields bullish
        if (treasuryTrend === 'bullish' && signal === 'buy') { score -= 0.5; hits.push('⚠️ Treasury yields rising vs buy -0.5'); }
        else if (treasuryTrend === 'bearish' && signal === 'sell') { score -= 0.5; hits.push('⚠️ Treasury yields falling vs sell -0.5'); }
        else if (treasuryTrend === 'bullish' && signal === 'sell') { score += 0.5; hits.push('✅ Treasury yields rising vs sell +0.5'); }
        else if (treasuryTrend === 'bearish' && signal === 'buy') { score += 0.5; hits.push('✅ Treasury yields falling vs buy +0.5'); }
    }

    if (signal !== 'none' && macroBias && macroBias.macroTrend) {
        if (macroBias.align) {
            score += macroBias.scoreAdjust || 0;
            hits.push('📊 Macro trend aligns +' + (macroBias.scoreAdjust || 0));
            factors.push('MacroTrend');
        } else if ((macroBias.scoreAdjust || 0) < -0.5 && macroBias.macroTrend.confidence > 0.7) {
            score += macroBias.scoreAdjust || 0;
            hits.push('⚠️ Macro trend conflict ' + (macroBias.scoreAdjust || 0));
        }
    }

    if (liquiditySweep && liquiditySweep.swept && signal !== 'none') {
        const expectedSide = signal === 'buy' ? 'buy-side' : 'sell-side';
        if (liquiditySweep.type === expectedSide) {
            score += 1.5;
            hits.push('🎯 Liquidity swept (' + liquiditySweep.type + ') +1.5');
            factors.push('LiqSweepPool');
        } else {
            score -= 0.5;
            hits.push('⚠️ Wrong-side liquidity sweep -0.5');
        }
    }

    if (turtleSoup && turtleSoup.pattern !== 'none' && turtleSoup.confidence > 65) {
        const soupSignal = turtleSoup.pattern === 'bullish' ? 'buy' : 'sell';
        if (signal === 'none') {
            signal = soupSignal;
            score += 2;
            hits.push('🐢 Turtle Soup ' + turtleSoup.pattern + ' +2');
            factors.push('TurtleSoup');
        } else if (signal === soupSignal) {
            score += 1;
            hits.push('🐢 Turtle Soup confirms ' + turtleSoup.pattern + ' +1');
            factors.push('TurtleSoupConfirm');
        }
    }

    if (signal !== 'none' && marketTrend.isStrongTrend) {
        let trendDir = marketTrend.direction === 'bullish' ? 'buy' : 'sell';
        if (signal === trendDir) {
            score += 1.5;
            hits.push('📈 Strong trend alignment +1.5 (' + marketTrend.direction + ')');
            factors.push('TrendAlign');
        } else if (marketTrend.strength > 0.7) {
            score = Math.max(0, score - 1.0);
            hits.push('⚠️ Counter-trend signal -1.0 (strong ' + marketTrend.direction + ' trend)');
        }
    }

    score = Math.min(12, Math.max(0, score));
    let nested = false, nestedLabel = '';
    if (signal !== 'none') { let nr = detectNestedFVG(m15, h1, h4, price, signal); if (nr.nested) { nested = true; nestedLabel = nr.label; let b = nr.depth === 3 ? 1 : 0.5;
            score = Math.min(12, score + b);
            hits.push(nr.label + ' +' + b);
            factors.push('NestedFVG'); } }
    let div = detectDivergence(m15);
    if (div.type !== 'none') { let db = 0; if ((div.type === 'bullish' && mss.dir === 'bullish') || (div.type === 'bearish' && mss.dir === 'bearish')) db = 1; else if ((div.type === 'hidden_bullish' && mss.dir === 'bullish') || (div.type === 'hidden_bearish' && mss.dir === 'bearish')) db = 0.5; else db = 0.5; if (db > 0) { score += db;
            hits.push(div.type + ' divergence +' + db);
            factors.push('Divergence'); } }
    let ict = detectPatternsICT(m15);
    if (ict.patterns.length) { let best = ict.patterns[0], match = (best.direction === 'bullish' && mss.dir === 'bullish') || (best.direction === 'bearish' && mss.dir === 'bearish'); if (match) { let b = best.confidence > 70 ? 1 : 0.5;
            score += b;
            hits.push(best.type + ' (' + best.direction + ') +' + b);
            factors.push('Pattern'); } }
    if (candleChar.impulsive && mss.dir !== 'neutral') { let match = (mss.dir === 'bullish' && m15[m15.length - 1].close > m15[m15.length - 1].open) || (mss.dir === 'bearish' && m15[m15.length - 1].close < m15[m15.length - 1].open); if (match) { score += 0.3;
            hits.push('Impulsive candle +0.3');
            factors.push('Impulsive'); } }
    if (candleChar.corrective) { score = Math.max(0, score - 0.5);
        hits.push('Corrective candle -0.5');
        factors.push('Corrective'); }
    let mtf = getMTFScore(m15, h1, h4, price, signal);
    if (mtf.aligned) { let b = CONFLUENCE_WEIGHTS.fullMTFAlign || 1;
        score += b;
        hits.push('Full MTF alignment +' + b);
        factors.push('MTFAlign'); }
    let harm = [];
    if (cfg.useHarmonic !== false) { harm = detectHarmonicPatterns(m15, swings, atr); if (harm.length) { let best = harm[0]; if (best.direction === 'bullish' && signal === 'buy') { score += 1;
                hits.push('Harmonic ' + best.type + ' +1');
                factors.push('Harmonic'); } else if (best.direction === 'bearish' && signal === 'sell') { score += 1;
                hits.push('Harmonic ' + best.type + ' +1');
                factors.push('Harmonic'); } } }
    let squeeze = null;
    if (cfg.useSqueezeFilter !== false) { squeeze = detectSqueeze(m15); if (squeeze.squeeze) { if ((squeeze.direction === 'bullish' && signal === 'buy') || (squeeze.direction === 'bearish' && signal === 'sell')) { score += 0.3;
                hits.push('Squeeze break +0.3');
                factors.push('Squeeze'); } } }
    score = Math.min(12, Math.max(0, score));
    let m5Entry = signal !== 'none' ? analyseM5Entry(m5, signal) : { hasSetup: false, zone: null, confirmed: false };
    let vp = analyzeVolumeProfile(m15, atr);
    let origSig = signal, origScore = score;

    // ─── Scalp-specific detection ────────────────────────────────────────
    let scalpSetup = false;
    if (m5 && m5.length > 20) {
        const last = m5[m5.length - 1];
        const prev = m5[m5.length - 2];
        const avgVol = m5.slice(-10).reduce((a,b) => a + b.volume, 0) / 10;
        if (last.volume > avgVol * 1.5) {
            if (last.close > prev.high && last.close > last.open) {
                scalpSetup = true;
                hits.push('📊 5m breakout volume spike – scalp opportunity');
                score += 0.5;
                factors.push('ScalpSetup');
            } else if (last.close < prev.low && last.close < last.open) {
                scalpSetup = true;
                hits.push('📊 5m breakdown volume spike – scalp opportunity');
                score += 0.5;
                factors.push('ScalpSetup');
            }
        }
    }

    // ─── NEW FILTERS (Ichimoku, Donchian, Volatility, Exhaustion) ──────
    // --- SOFTENED: Ichimoku as bonus, not block ---
    const ichi = ichimoku(h4, 9, 26, 52);
    if (signal === 'buy' && (ichi.priceAboveCloud && ichi.tenkanAboveKijun)) {
        score += 0.5;
        hits.push('📊 Ichimoku bullish +0.5');
    } else if (signal === 'sell' && (ichi.priceBelowCloud && ichi.tenkanBelowKijun)) {
        score += 0.5;
        hits.push('📊 Ichimoku bearish +0.5');
    }

    // --- SOFTENED: Donchian as bonus ---
    const donch = donchian(h1, 20);
    if (signal === 'buy' && donch.breakHigh) {
        score += 0.5;
        hits.push('📊 Donchian breakout +0.5');
    } else if (signal === 'sell' && donch.breakLow) {
        score += 0.5;
        hits.push('📊 Donchian breakout +0.5');
    }

    // Was softened from a hard block to a -0.5 penalty at some earlier
    // point (comment said "SOFTENED... as penalty, not block"). All 8
    // losses reviewed on 2026-08-13 had this flag firing alongside a
    // regime label of 'volatile' — not a contradiction in the data, but two
    // genuinely different volatility measures: regime='volatile' fires on a
    // RELATIVE spike (current ATR vs its own recent average, see
    // detectRegime), while this checks ABSOLUTE volatility (ATR as % of
    // price). A modest uptick over an unusually quiet recent baseline can
    // read as "3x the average" (relative regime = volatile) while still
    // being objectively tiny in absolute terms — and regime='volatile' also
    // widens the stop by 10% elsewhere, so this combination was taking
    // wider-stop trades on what was actually low-momentum noise, not real
    // volatility. Reverted to a hard block. Fixed 2026-08-13.
    const volResult = volatilityFilter(atr, price, m15PriorAtrs);
    if (!volResult.pass) {
        hits.push(`🚫 Blocked: ${volResult.reason}`);
        signal = 'none';
        score = 0;
    }

    // Was softened from a hard block to a -0.5 penalty. Got visibility into
    // the actual implementation (src/filters/exhaustion.js) after the full
    // project was shared 2026-08-13: this is a textbook RSI overbought/
    // oversold exhaustion check (buy blocked when RSI>70, sell blocked when
    // RSI<30) — entering in the direction of an already-overextended move.
    // Same pattern as the HTF-alignment and absolute-volatility gates
    // already hardened: a -0.5 penalty did nothing against base scores of
    // 6-10.5/12. Reverted to a hard block. Fixed 2026-08-13.
    const exhResult = exhaustionFilter(h1, signal);
    if (!exhResult.pass) {
        hits.push(`🚫 Blocked: ${exhResult.reason}`);
        signal = 'none';
        score = 0;
    } else if (exhResult.sizeMultiplier < 1) {
        hits.push(`⚠️ ${exhResult.reason}`);
    }

    // ─── Apply top-down alignment score ─────────────────────────────────
    score = Math.min(12, Math.max(0, score + alignmentScore));
    hits.push('Top-down alignment: ' + topDownBias + (alignmentScore >= 0 ? ' +' : ' ') + alignmentScore.toFixed(1));

    // ─── Additional strict filters ──────────────────────────────────────
    if (signal !== 'none') {
        let hasKeyConfluence = (fvgs.length > 0) || (obs.length > 0) || (mss.dir !== 'neutral') || (bias !== 'neutral' && bias === signal);
        if (!hasKeyConfluence) {
            signal = 'none';
            hits.push('❌ No key confluence (FVG/OB/MSS/HTF bias)');
        }
    }

    // ─── SOFTENED GATE: penalize missing sweep/OB, not block ──────────
    if (signal !== 'none') {
        let hasLiquiditySweep = !!(liq && liq.swept);
        let hasLocatedOB = !!(bestOB && bestOB.inZone);
        let penalty = 0;
        if (!hasLiquiditySweep) {
            penalty += 0.5;
            hits.push('⚠️ No liquidity sweep -0.5');
        }
        if (!hasLocatedOB) {
            penalty += 0.5;
            hits.push('⚠️ No located OB -0.5');
        }
        score = Math.max(0, score - penalty);
        if (score < 3) {
            signal = 'none';
            hits.push('❌ Score too low after penalty (<3)');
        }
    }

    // ─── M15 STRUCTURE GATE: don't fire H4/H1-biased signals into M15 ────
    // structure that's actively moving the other way, unless a liquidity
    // sweep justifies the counter-move (e.g. buy-side sweep -> buy is a
    // legitimate reversal, not a blind buy into a downtrend).
    // Added 2026-07-29 after a session where every trade fired BUY while
    // M15 made a clean, sustained series of lower lows — signal was driven
    // by H4 MSS/bias (see runFullAnalysis's signal assignment above) with
    // nothing checking it against what M15 price was actually doing.
    if (signal !== 'none' && swings.highs.length >= 2 && swings.lows.length >= 2) {
        const structureConfirms = detectStructureBreak(m15, swings, signal);
        const sweepJustifies = !!(liq && liq.swept && liq.side === (signal === 'buy' ? 'buy-side' : 'sell-side'));
        if (!structureConfirms && !sweepJustifies) {
            const lastLow = swings.lows[swings.lows.length - 1].price, prevLow = swings.lows[swings.lows.length - 2].price;
            const lastHigh = swings.highs[swings.highs.length - 1].price, prevHigh = swings.highs[swings.highs.length - 2].price;
            const m15MovingAgainst = signal === 'buy' ? (lastLow < prevLow && lastHigh < prevHigh) : (lastLow > prevLow && lastHigh > prevHigh);
            if (m15MovingAgainst) {
                hits.push('❌ M15 structure conflicts with ' + signal + ' (H4/H1-biased, no M15 confirmation or sweep)');
                signal = 'none';
            }
        }
    }

    if (signal !== 'none' && adxData.adx < 18 && !marketTrend.isStrongTrend) {
        let rangeSize = (Math.max(...m15.slice(-20).map(c => c.high)) - Math.min(...m15.slice(-20).map(c => c.low))) / atr;
        if (rangeSize < 2.5) {
            score = Math.max(0, score - 2);
            hits.push('❌ Low ADX + tight range -2');
        }
    }

    if (signal !== 'none' && vp && vp.totalVolume > 0) {
        let avgVol = vp.totalVolume / m15.length;
        let lastCandle = m15[m15.length - 1];
        if (lastCandle.volume < avgVol * 0.8 && marketTrend.isStrongTrend === false) {
            score = Math.max(0, score - 0.5);
            hits.push('⚠️ Below-average volume -0.5');
        }
    }

    // ─── ENHANCED LEARNER: Apply regime-specific factor weights ─────────
    const regimeWeights = enhancedLearner.getRegimeWeights(regime.regime);
    if (regimeWeights) {
        let regimeBonus = 0;
        Object.keys(regimeWeights).forEach(f => {
            if (factors.includes(f) || hits.some(h => h.includes(f))) {
                regimeBonus += regimeWeights[f];
            }
        });
        if (regimeBonus !== 0) {
            score = Math.min(12, Math.max(0, score + regimeBonus));
            hits.push(`🧠 Regime-Learned bonus: ${regimeBonus > 0 ? '+' : ''}${regimeBonus.toFixed(2)}`);
        }
    }

    // ─── NEW: Advanced Seasonality 2.0 ──────────────────────────────────
    const season2 = getAdvancedSeasonality(new Date());
    if (season2.multiplier > 1.0) {
        const bonus = Math.min(1, (season2.multiplier - 1) * 5);
        score = Math.min(12, score + bonus);
        hits.push(`📅 Seasonality 2.0 (${season2.pattern}) +${bonus.toFixed(1)}`);
        factors.push('Seasonality2');
    } else if (season2.multiplier < 0.9) {
        const penalty = Math.min(1, (1 - season2.multiplier) * 5);
        score = Math.max(0, score - penalty);
        hits.push(`📅 Seasonality 2.0 (${season2.pattern}) -${penalty.toFixed(1)}`);
        factors.push('Seasonality2');
    }

    // ─── NEW: Intermarket Matrix Risk Sentiment ──────────────────────────
    const intermarketData = global._intermarketData || { sentiment: 'neutral', score: 0 };
    if (intermarketData.sentiment === 'risk_on' && signal === 'buy') {
        score = Math.min(12, score + 0.5);
        hits.push(`📊 Risk-on sentiment +0.5`);
        factors.push('RiskOn');
    } else if (intermarketData.sentiment === 'risk_off' && signal === 'sell') {
        score = Math.min(12, score + 0.5);
        hits.push(`📊 Risk-off sentiment +0.5`);
        factors.push('RiskOff');
    } else if (intermarketData.sentiment === 'risk_on' && signal === 'sell') {
        score = Math.max(0, score - 0.3);
        hits.push(`⚠️ Risk-on vs sell -0.3`);
    } else if (intermarketData.sentiment === 'risk_off' && signal === 'buy') {
        score = Math.max(0, score - 0.3);
        hits.push(`⚠️ Risk-off vs buy -0.3`);
    }

    // ─── NEW: Order Book ML Prediction ──────────────────────────────────
    const obPred = global._orderBookPrediction || { direction: 'neutral', confidence: 0.5 };
    if (obPred.confidence > 0.6) {
        if ((obPred.direction === 'bullish' && signal === 'buy') ||
            (obPred.direction === 'bearish' && signal === 'sell')) {
            score = Math.min(12, score + 0.4);
            hits.push(`📊 OrderBook ML confirms +0.4 (conf ${obPred.confidence.toFixed(2)})`);
            factors.push('OrderBookML');
        } else if (obPred.direction !== 'neutral' && obPred.confidence > 0.7) {
            score = Math.max(0, score - 0.3);
            hits.push(`⚠️ OrderBook ML conflict -0.3`);
        }
    }

    // ─── NEW: Event-weighted News Sentiment ─────────────────────────────
    if (global._newsEventWeight && global._newsEventWeight.impact > 0.5) {
        const newsBias = global._newsEventWeight.bias;
        if ((newsBias === 'bullish' && signal === 'buy') ||
            (newsBias === 'bearish' && signal === 'sell')) {
            score = Math.min(12, score + 0.4);
            hits.push(`📰 Event News confirms +0.4`);
            factors.push('EventNews');
        } else if (newsBias !== 'neutral' && global._newsEventWeight.impact > 0.8) {
            score = Math.max(0, score - 0.6);
            hits.push(`⚠️ High-impact news conflict -0.6`);
        }
    }

    score = Math.min(12, Math.max(0, score));
    if (signal !== 'none' && score < 4) {
        signal = 'none';
        hits.push('❌ Score below minimum threshold after strict filters');
    }

    // ─── Journal-based setup-similarity quality filter ───────────────────
    // Both computeQualityScore and shouldTradeBasedOnJournal were already
    // fully written (see findSimilarSetups above) and QUALITY_CONFIG has
    // useJournalWeights: true in both the inline fallback and the real
    // src/config/defaults.js — genuinely configured on, not a deliberately
    // disabled feature — but neither was ever called anywhere. Added
    // 2026-07-29. Built from the exact local variables already in scope
    // rather than the full return object (which isn't assembled yet at
    // this point in the function), cross-checked field-by-field against
    // what these functions actually read.
    // v1: off — it re-scores and blocks setups from a handful of past
    // results, which changes the strategy as trades come in. 2026-10-24.
    if (signal !== 'none' && QUALITY_CONFIG.useJournalWeights && !v1On()) {
        const _journalForQuality = learningJournal(loadJournal());
        const _analysisForQuality = {
            signal, score, bias, liq, divergence: div,
            session, curP: price, volumeProfile: vp,
            dxyTrend, newsSentiment: 'neutral'
        };
        const adjustedScore = computeQualityScore(_analysisForQuality, _journalForQuality, cfg);
        if (adjustedScore !== score) {
            hits.push((adjustedScore > score ? '📈' : '📉') + ' Journal quality adjustment: ' + score.toFixed(1) + ' → ' + adjustedScore.toFixed(1));
            score = adjustedScore;
        }
        _analysisForQuality.score = score;
        if (score < 4) {
            signal = 'none';
            hits.push('❌ Score below minimum threshold after journal quality adjustment');
        } else if (!shouldTradeBasedOnJournal(_journalForQuality, _analysisForQuality)) {
            hits.push('❌ Similar past setups have a win rate below ' + (QUALITY_CONFIG.minSimilarWinRate * 100).toFixed(0) + '% — skipping');
            signal = 'none';
        }
    }

    // ─── Determine trade duration based on analysis ─────────────────────
    const tradeDuration = getTradeDuration({
        adxData: adxData,
        marketTrend: marketTrend,
        session: session,
        score: score,
        atr: atr
    }, cfg, regime);

    return {
        score, hits, signal, bias, mss, liq, fvgs, obs, swings, kzOn, sbOn,
        tripleZone: triple, fullMTFAlign: mtf.aligned, adxData, atr, curP: price,
        bestFVG, bestOB, session, candleChar, regime: regime.regime,
        nestedFVG: nested, nestedFVGLabel: nestedLabel, divergence: div,
        patterns: ict, mtfScore: mtf, m5Entry, volumeProfile: vp,
        dxyTrend, freshFVGCount: fvgs.filter(f => f.isFresh).length,
        freshOBCount: obs.filter(o => o.isFresh).length,
        po3: { judas: judas.judas, direction: judas.dir }, ote,
        eqHL: eq, eqHLBonus: eqBonus,
        candleConfirmsSignal: signal === 'buy' ? m15[m15.length - 1].close > m15[m15.length - 1].open : signal === 'sell' ? m15[m15.length - 1].close < m15[m15.length - 1].open : false,
        hourWinRate: hwr, dailyOpen, weeklyOpen, adr, adrRatio,
        regimeAtrRatio: typeof regime.atrRatio === 'number' ? regime.atrRatio : null,
        prevDayHigh, prevDayLow, fibonacci: null, vwap: null, orderFlow: null,
        newsBlock: false,
        hiddenDivergence: div.hiddenBullish ? 'hidden_bullish' : div.hiddenBearish ? 'hidden_bearish' : null,
        vsaResult, breakerResult, vsaConfirms: vsaConf, hasBreaker,
        vsaSignal: vsaSig, breakerSignal: breakerSig, candlePattern,
        advancedRegime: adv, entryType: 'main',
        newsSentiment: 'neutral', newsScore: 0, factors,
        originalSignal: origSig, originalScore: origScore,
        tradeNumber: 0, harmonicPatterns: harm, squeeze,
        mlWinProb: 0.5, mlConfidence: 0.5, correlationDeviation: 0, seasonalityPattern: 'neutral',
        macroTrend: macroBias ? macroBias.macroTrend : null,
        liquidityPools: liquidityPools,
        liquiditySweep: liquiditySweep,
        turtleSoup: turtleSoup,
        marketTrend: marketTrend,
        topDownBias: topDownBias,
        alignmentScore: alignmentScore,
        bias4h: bias4h,
        bias1h: bias1h,
        bias30m: bias30m,
        bias15m: bias15m,
        ichimoku: ichi,
        donchian: donch,
        trendScore: computeTrendScore({ d1, h4, h1, m30 }),
        trendQuality: 0,
        tradeDuration: tradeDuration,
        scalpSetup: scalpSetup
    };
}

function getRecentWinRate() { try { let j = loadJournal(), closed = (j.trades || []).filter(t => t.outcome !== null).slice(-50); if (closed.length < 10) return .5; return closed.filter(t => t.outcome === 'win').length / closed.length; } catch (e) { return .5; } }

// ─── ML RETRAINING ──────────────────────────────────────────────────────
function retrainML() {
    try {
        const journal = loadJournal();
        const trades = learningTrades(journal.trades);
        const closed = trades.filter(t => t.outcome !== null);
        if (closed.length < ML_RETRAIN_CONFIG.minTradesForRetrain) {
            logger.info(`[ML] Skipping retrain: only ${closed.length} closed trades (need ${ML_RETRAIN_CONFIG.minTradesForRetrain})`);
            return { success: false, reason: 'insufficient_trades' };
        }
        const trainingTrades = closed.slice(-ML_RETRAIN_CONFIG.maxRetrainHistory);
        const result = train(trainingTrades);
        if (result) {
            global._lastMLRetrainTradeCount = closed.length;
            ML_RETRAIN_CONFIG.lastRetrainTradeCount = closed.length;
            const weights = loadModel();
            logger.info(`[ML] ✅ Retrained successfully on ${trainingTrades.length} trades`);
            logger.info(`[ML] Weights: intercept=${weights.intercept?.toFixed(2)}, score=${weights.score?.toFixed(2)}, mss=${weights.mss?.toFixed(2)}`);
            sendTelegram(`🧠 *ML Model Retrained*\nTrades used: ${trainingTrades.length}\nWin rate: ${(closed.filter(t => t.outcome === 'win').length / closed.length * 100).toFixed(1)}%\nIntercept: ${weights.intercept?.toFixed(2) || 'N/A'}`);
            return { success: true, trades: trainingTrades.length };
        }
        return { success: false, reason: 'train_failed' };
    } catch (e) {
        logger.error('[ML] Retrain failed:', e.message);
        return { success: false, reason: e.message };
    }
}

// ─── MANAGE POSITIONS ──────────────────────────────────────────────────────
// ─── EXIT-MANAGEMENT HELPERS ───────────────────────────────────────────────
// Original risk per unit (entry→initial SL distance). Every R-based threshold
// in managePositions used to divide by the CURRENT stop distance — so once
// breakeven moved the SL next to entry, "risk" shrank to the BE buffer and
// every percentage threshold (scalp exits, Chandelier at 0.3R, trail at
// 0.8R, BE, partials, MAE/MFE) fired on tiny moves. Uses the SL saved at
// placement; falls back to the current SL only while it's still on the risk
// side of entry (i.e. hasn't been moved yet), and caches the result.
// Added 2026-10-23.
function getInitialRisk(posId, posState, entry, curSL, isBuy, atr) {
    if (posState && posState._initialRisk > 0) return posState._initialRisk;
    let risk = null;
    if (posState && posState._sl > 0 && (isBuy ? posState._sl < entry : posState._sl > entry)) risk = Math.abs(entry - posState._sl);
    if (!risk && curSL > 0 && (isBuy ? curSL < entry : curSL > entry)) risk = Math.abs(entry - curSL);
    if (risk) { savePositionState(posId, { _initialRisk: risk }); return risk; }
    return Math.max(0.5, (atr || 5) * 0.9); // last resort: the normal-mode stop distance
}

// Minimum distance a stop must keep from the live price — the same rule
// validateSLTPForPosition's safety clamp uses (it CLAMPS a stop that breaks
// it to price ∓ ~0.5). Checking first lets breakeven/trail moves simply wait
// until they're valid instead of being clamped into a hyper-tight stop.
function stopGapFromPrice(cfg, spec) {
    let sc = getSymConfig(cfg.symbol);
    let minDist = Math.max((spec && spec.stopsLevelPrice) || 0, (spec && spec.freezeLevelPrice) || 0, (spec && spec.tickSize) || 0.01, sc.minSL || 0.01);
    if (sc.type === 'gold') minDist = Math.max(minDist, 0.5);
    return Math.max(minDist * 0.5, 0.3);
}
function stopIsReachable(isBuy, sl, price, gap) { return isBuy ? sl < price - gap : sl > price + gap; }
function stopImproves(isBuy, newSL, curSL) { return !curSL ? true : (isBuy ? newSL > curSL + 0.005 : newSL < curSL - 0.005); }

async function managePositions(cfg, positions, curPIn, atr, session, marketRegime, volatility, regime, quote) {
    let fresh;
    try { let all = await getPositions(cfg);
        fresh = all.filter(p => p.comment && p.comment.indexOf('ICT_BOT') !== -1); } catch (e) { fresh = positions; }
    if (!fresh.length) return;
    // The re-fetched position objects don't carry the per-position flags
    // rehydratePositions() put on the caller's copies (_freeTradeTriggered,
    // _beTriggered, _score, ...) — checkFreeTradeSafe reads pos._freeTradeTriggered
    // directly, so without this it re-fired its breakeven move every cycle.
    rehydratePositions(fresh);

    let sc = getSymConfig(cfg.symbol), now = Date.now(), C = cfg.currency || 'R',
        method = cfg.trailingMethod || 'swing', useAdv = cfg.useAdvancedRisk !== false;

    let seasonAnalyzer;
    try {
        seasonAnalyzer = new SeasonalityAnalyzer();
    } catch (e) {
        logger.warn('[Seasonality] SeasonalityAnalyzer unavailable, exit-timing check disabled:', e.message);
        seasonAnalyzer = { shouldHold: () => true };
    }
    const nowDate = new Date();
    const day = nowDate.getUTCDay();
    const hour = nowDate.getUTCHours();

    let spec = await getBrokerSymbolSpec(cfg).catch(() => null);
    let minPartial = Math.max((spec && spec.minVolume) || 0.01, 0.01);
    let step = (spec && spec.volumeStep) || 0.01;
    // v1: a trade's TP1 leg is handled before its main position, so forced
    // exits close (and journal) the leg first. 2026-10-24.
    if (cfg._v1) fresh.sort((a, b) => (v1IsLegA(b) ? 1 : 0) - (v1IsLegA(a) ? 1 : 0));

    for (let pos of fresh) {
      // Previously the body of this loop had no overall try/catch — only a
      // couple of inner blocks (seasonality exit, advanced risk) did. Any
      // exception anywhere else here (breakeven, step-trail, chandelier/
      // sniper trail, TP-split, time-based close) would silently abort
      // management for THIS position and every position after it in the
      // same cycle, with nothing logged — exactly the symptom reported
      // 2026-08-13: a trade stuck at its original SL well past breakeven,
      // with no error and no "BE move" line anywhere in the logs. Wrapping
      // the whole body means a bad position can no longer take out the
      // rest of the cycle, and the actual error now gets logged and sent
      // to Telegram instead of vanishing. Fixed 2026-08-13.
      try {
        let isBuy = pos.type && pos.type.indexOf('BUY') !== -1, entry = parseFloat(pos.openPrice) || 0,
            curSL = parseFloat(pos.stopLoss) || 0, curTP = parseFloat(pos.takeProfit) || 0,
            vol = parseFloat(pos.volume) || 0, tradeId = normalizePositionId(pos.id || pos.positionId || String(Date.now())),
            score = pos._score || 5;

        // (trend-mode trades, and EA trades whose strategy has no target, have
        // no take-profit by design — see TREND and EA)
        if (!entry || !curSL || (!curTP && !(ps0 => ps0._trend || (ps0._ea && !ps0._eaTp))(loadPositionState(pos.id) || {}))) { _mgmtAlert(tradeId, 'zero_sl_tp', '⚠️ Position #' + tradeId + ' has no SL/TP'); continue; }

        // Executable price for THIS position: a buy closes at the bid, a sell
        // at the ask. Falls back to the cycle's M15 close if no live quote.
        let curP = (quote && quote.bid > 0 && quote.ask > 0) ? (isBuy ? +quote.bid : +quote.ask) : curPIn;

        let posState = loadPositionState(pos.id) || {};
        let duration = posState._tradeDuration || 'normal';

        // slDist = ORIGINAL risk (see getInitialRisk), not the current SL
        // distance — keeps every R threshold below meaning the same thing
        // before and after breakeven/trailing moves. Fixed 2026-10-23.
        let slDist = getInitialRisk(pos.id, posState, entry, curSL, isBuy, atr), profit = isBuy ? curP - entry : entry - curP,
            pct = profit / slDist, timeInTrade = pos.time ? now - new Date(pos.time).getTime() : 0;
        let profitAtr = profit / Math.max(atr || 0, 0.01);
        let stopGap = stopGapFromPrice(cfg, spec);
        let beBuf = getBeBuffer(atr, sc.minSL, sc.limitSlip, quote && quote.spread);

        // ─── MAE/MFE tracking ───────────────────────────────────────────
        // Max Adverse/Favorable Excursion in R-multiples of the ORIGINAL
        // risk — how far a trade moved against/in favor of the position
        // before it closed, comparable across trades. Needed to answer "are
        // stops too tight" or "is a winning trade being closed before it
        // fully develops" instead of guessing. Only writes when a new
        // extreme is reached. Added 2026-08-27; measured against the
        // original stop (not the current one) since 2026-10-23.
        let prevMae = typeof posState._maeR === 'number' ? posState._maeR : 0;
        let prevMfe = typeof posState._mfeR === 'number' ? posState._mfeR : 0;
        if (pct < prevMae || pct > prevMfe) {
            let newMae = Math.min(prevMae, pct), newMfe = Math.max(prevMfe, pct);
            savePositionState(pos.id, { _maeR: newMae, _mfeR: newMfe });
            posState._maeR = newMae; posState._mfeR = newMfe;
        }

        // Fallbacks were always entry + x (above entry) — wrong side for sells.
        const dirSign = isBuy ? 1 : -1;
        let tp1 = posState._tp1 || (entry + dirSign * slDist * 0.5);
        let tp2 = posState._tp2 || (entry + dirSign * slDist * 1.0);
        let tp3 = posState._tp3 || (entry + dirSign * slDist * 1.5);
        let tp1Vol = posState._tp1Vol || 0;
        let tp2Vol = posState._tp2Vol || 0;
        let tp3Vol = posState._tp3Vol || 0;
        let canSplit = posState._canSplit || false;
        let tp1Hit = posState._tp1Hit || false;
        let tp2Hit = posState._tp2Hit || false;
        let tp3Hit = posState._tp3Hit || false;
        let is3TPSplit = posState._is3TPSplit || false;
        let splitPositions = posState._splitPositions || [];

        // ─── Seasonality exit ──────────────────────────────────────────────
        if (!cfg._v1 && !seasonAnalyzer.shouldHold(day, hour, profit)) {
            if (profit > 0) {
                let est = profit * vol * sc.lotVal, ct = Date.now();
                let res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_CLOSE_ID', positionId: pos.id }), tradeId, 'seasonality exit');
                if (res.success) { let pnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                    sendTelegram('🕐 Seasonality Exit #' + pos.id + ' | ' + C + pnl.toFixed(2));
                    journalClose(tradeId, pnl >= 0 ? 'win' : 'loss', profit.toFixed(2), pnl); continue; }
            }
        }

        // ─── Stop-move helper ───────────────────────────────────────────────
        // Every BE / trail / step move goes through here. It only sends a
        // modification that (a) actually improves on the current SL, (b) is
        // valid at the live price, and (c) comes back from validation
        // unchanged. Previously a breakeven level that wasn't reachable yet
        // (e.g. entry + $3 while price was entry + $1) got CLAMPED by
        // validateSLTPForPosition to price - $0.50 and sent anyway — every
        // cycle — which acted as a $0.50 trailing stop on any trade ~$1 in
        // profit, cutting winners to pennies. Now an unreachable move simply
        // waits for a later cycle. Returns 'moved' | 'not_better' (SL already
        // at/after the level) | 'not_yet' | 'clamped' | 'failed'.
        const tryMoveStop = async (newSL, label) => {
            if (!(newSL > 0)) return 'failed';
            if (!stopImproves(isBuy, newSL, curSL)) return 'not_better';
            if (!stopIsReachable(isBuy, newSL, curP, stopGap)) return 'not_yet';
            let validated = await validateSLTPForPosition(cfg, pos.id, entry, curP, newSL, curTP, isBuy, spec);
            if (validated.wasClamped || Math.abs(validated.sl - newSL) > 0.02 || !stopImproves(isBuy, validated.sl, curSL)) {
                logger.warn(`[${label}] #${tradeId} proposal ${newSL.toFixed(2)} came back as ${validated.sl.toFixed(2)} from validation — not sending (would not be the intended stop)`);
                return 'clamped';
            }
            let res = await safePositionOperation(cfg, pos.id,
                () => maPost(cfg, '/trade', { actionType: 'POSITION_MODIFY', positionId: pos.id, stopLoss: validated.sl, takeProfit: validated.tp }),
                tradeId, label);
            if (!res.success) return 'failed';
            curSL = validated.sl;
            pos.stopLoss = validated.sl;
            return 'moved';
        };
        const markBreakeven = () => {
            posState._beTriggered = true;
            pos._beTriggered = true;
            savePositionState(pos.id, { _beTriggered: true });
        };

        // ─── v1 exits (see the V1 section) ──────────────────────────────────
        // One rule for every trade: forced exits (before XM's daily break,
        // after V1_MAX_HOLD_HOURS), news protection, then breakeven once TP1
        // has traded and the 0.5R stop ladder after that. The ladder also
        // runs on MetaAPI's servers when it accepted it; the bot enforces the
        // same levels as a backup, and closes at market when price has gone
        // back through a level a broker-side stop would already have hit.
        // None of the older exits below run for v1 trades. 2026-10-24.
        if (cfg._v1) {
            const V1 = cfg._v1, sp = (quote && quote.spread > 0) ? +quote.spread : 0;
            const openTs = pos.time ? new Date(pos.time).getTime() : 0;
            const legA = v1IsLegA(pos);
            const parentId = legA ? normalizePositionId(posState._legOf || '') : tradeId;
            const ladder = Array.isArray(posState._ladder) ? posState._ladder : [];
            const v1Close = async (why, label, icon) => {
                const est = profit * vol * sc.lotVal, ct = Date.now();
                let res;
                try { res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_CLOSE_ID', positionId: pos.id }), legA ? pos.id : tradeId, label, { noRetry: true }); }
                catch (e) { logger.warn('[' + label + '] #' + tradeId + ' close failed: ' + e.message); return false; }
                if (!res.success) return res.reason === 'position_not_found';
                const pnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                if (legA) { if (parentId) journalLegClose(parentId, pnl); }
                else journalClose(tradeId, pnl >= 0 ? 'win' : 'loss', profit.toFixed(2), pnl);
                sendTelegram((icon || '🕐') + ' *' + why + '* — ' + (legA ? 'TP1 lot of trade #' + parentId : 'Trade #' + tradeId) + '\nClosed ' + vol + ' lot at ' + curP.toFixed(2) + ' | P&L ' + C + pnl.toFixed(2));
                return true;
            };
            const v1Move = async (newSL, label) => {
                if (!(newSL > 0)) return 'failed';
                if (!stopImproves(isBuy, newSL, curSL)) return 'not_better';
                if (!stopIsReachable(isBuy, newSL, curP, stopGap)) return 'not_yet';
                const body = { actionType: 'POSITION_MODIFY', positionId: pos.id, stopLoss: parseFloat(newSL.toFixed(2)), takeProfit: curTP };
                // Re-send the server-side ladder with every change so a modify
                // can never leave the position without it.
                if (posState._serverTrail && ladder.length) body.trailingStopLoss = { threshold: { thresholds: ladder, units: 'ABSOLUTE_PRICE' } };
                let res;
                try { res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', body), tradeId, label, { noRetry: true }); }
                catch (e) {
                    // MetaAPI refusing the ladder must never stop the stop
                    // from moving: send the plain stop instead.
                    if (!body.trailingStopLoss || !/→ 4\d\d/.test(String(e.message))) { logger.warn('[' + label + '] #' + tradeId + ' modify failed: ' + e.message); return 'failed'; }
                    delete body.trailingStopLoss;
                    posState._serverTrail = false; savePositionState(pos.id, { _serverTrail: false });
                    try { res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', body), tradeId, label, { noRetry: true }); }
                    catch (e2) { logger.warn('[' + label + '] #' + tradeId + ' modify failed: ' + e2.message); return 'failed'; }
                }
                if (!res.success) return res.reason === 'position_not_found' ? 'gone' : 'failed';
                curSL = body.stopLoss; pos.stopLoss = curSL;
                return 'moved';
            };

            // Fill vs the price the decision was made at = slippage (once).
            if (!posState._fillRec && posState._decisionPrice > 0) {
                posState._fillRec = true; savePositionState(pos.id, { _fillRec: true });
                if (!legA) journalUpdate(tradeId, { fillPrice: entry, slippage: Math.round((isBuy ? entry - posState._decisionPrice : posState._decisionPrice - entry) * 100) / 100 });
            }

            // Trend trades (V1_STRATEGY=trend) only ever trail their stop to the
            // 10-candle 4-hour low/high: no TP1 lot, breakeven, ladder, time
            // limit or daily flatten — they're held overnight. See TREND.
            if (posState._trend) {
                const lvl = v1TrendTrail(global._v1TrendH4, isBuy, now);
                if (lvl > 0) await v1Move(parseFloat(lvl.toFixed(2)), 'trend trail');
                continue;
            }

            // EA trades (V1_STRATEGY=ea) follow only their strategy's exits.
            // The stop and target sit at the broker. The bot: closes before
            // XM's daily break unless the strategy holds overnight; closes
            // after maxBars candles; closes when the exit rule is true on a
            // candle that finished after entry; moves the stop to entry ±
            // the spread once price is breakevenR × the first risk in profit;
            // and moves it to the trail formula whenever that's tighter
            // (never loosens). The same rules as the exported EA. See EA.
            if (posState._ea) {
                const S = EA.get(posState._ea);
                if (!S) { _mgmtAlert(tradeId, 'ea_missing', '⚠️ Trade #' + tradeId + ' follows EA strategy "' + posState._ea + '", which isn\'t loaded — only its broker stop and target protect it now'); continue; }
                if (!S.options.holdOvernight && V1.flattenBeforeBreak && v1FlattenDue(now)) { if (await v1Close('Closed before XM\'s daily break', 'ea flatten', '🌙')) continue; }
                const c = v1EaContext(S, now), eaDir = isBuy ? 'buy' : 'sell', R = S.sides[eaDir] || {};
                const risk0 = posState._initialRisk > 0 ? posState._initialRisk : slDist, ex = { spread: sp };
                if (c && openTs > 0) {
                    const lastEnd = Date.parse(c.bars[c.k].time) + S.tfMs;
                    const held = c.bars.filter(b => Date.parse(b.time) + S.tfMs > openTs).length;
                    if (S.options.maxBars > 0 && held >= S.options.maxBars) { if (await v1Close('Closed after ' + S.options.maxBars + ' ' + S.timeframe + ' candles', 'ea max bars', '⏱️')) continue; }
                    if (R.exit && lastEnd > openTs && S.exit(c.ctx, c.k, eaDir, entry, risk0, ex) === true) { if (await v1Close('Exit rule (' + R.exit.text + ')', 'ea exit', '🚪')) continue; }
                }
                if (S.options.breakevenR > 0 && !posState._beTriggered && profit >= S.options.breakevenR * risk0) {
                    const buf = Math.max(sp, 0.05), r = await v1Move(isBuy ? entry + buf : entry - buf, 'ea breakeven');
                    if (r === 'moved' || r === 'not_better') { markBreakeven(); if (r === 'moved') sendTelegram('🔒 Trade #' + tradeId + ' (' + S.id + '): stop to breakeven ' + curSL.toFixed(2) + ' at ' + S.options.breakevenR + 'R'); }
                }
                if (c && R.trail) {
                    const lvl = S.trail(c.ctx, c.k, eaDir, entry, risk0, ex);
                    if (typeof lvl === 'number' && lvl > 0) await v1Move(parseFloat(lvl.toFixed(2)), 'ea trail');
                }
                continue;
            }

            // 1) Forced exits: flat before XM's daily break (no break spreads,
            //    no swap, no weekend gap) and after the maximum hold.
            if (V1.flattenBeforeBreak && v1FlattenDue(now)) { if (await v1Close('Closed before XM\'s daily break', 'v1 flatten', '🌙')) continue; }
            // 1-hour setups: the time limit scales with the timeframe (×4; the
            // daily-break flatten above still closes everything each day).
            const holdH = V1.maxHoldHours * (V1.setupTf === '1h' ? 4 : 1);
            if (holdH > 0 && openTs && now - openTs > holdH * 3600000) { if (await v1Close('Closed after ' + holdH + 'h', 'v1 max hold', '⏱️')) continue; }
            if (legA) continue; // the broker closes the TP1 lot at TP1 or at its stop

            const best = v1UpdateBest(pos.id, posState, isBuy, curP, openTs, sp);
            let tp1Reached = !!posState._tp1Touched || (best !== null && tp1 > 0 && (isBuy ? best >= tp1 : best <= tp1));
            if (tp1Reached && !posState._tp1Touched) { posState._tp1Touched = true; savePositionState(pos.id, { _tp1Touched: true }); }
            const beReached = tp1Reached || (V1.beTrigger === '0.5r' && best !== null && (isBuy ? best - entry : entry - best) >= 0.5 * slDist);

            // 2) Top-tier US release in ≤5 min: stop to breakeven if price
            //    allows, otherwise cut to the minimum lot.
            if (V1.newsProtect) {
                const ns = v1NewsState(now, false);
                if (ns.preRelease && ns.key && posState._newsProt !== ns.key) {
                    posState._newsProt = ns.key; savePositionState(pos.id, { _newsProt: ns.key });
                    const r = await v1Move(isBuy ? entry + beBuf : entry - beBuf, 'v1 news BE');
                    if (r === 'moved' || r === 'not_better') {
                        markBreakeven();
                        if (r === 'moved') sendTelegram('📰 *News in ≤5 min* — Trade #' + tradeId + ': stop moved to breakeven ' + curSL.toFixed(2));
                    } else if (r === 'not_yet' && vol > minPartial + 1e-9) {
                        const cut = parseFloat((Math.floor((vol - minPartial) / step + 1e-9) * step).toFixed(2));
                        if (cut >= minPartial - 1e-9) {
                            const est = profit * cut * sc.lotVal, ct = Date.now();
                            let pres;
                            try { pres = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_PARTIAL', positionId: pos.id, volume: cut }), tradeId, 'v1 news cut', { noRetry: true }); } catch (e) { pres = { success: false, reason: e.message }; }
                            if (pres.success) {
                                const ppnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                                journalPartialClose(tradeId, profit.toFixed(2), ppnl, 0);
                                vol = parseFloat((vol - cut).toFixed(2));
                                sendTelegram('📰 *News in ≤5 min* — Trade #' + tradeId + ': cut to ' + vol + ' lot (' + C + ppnl.toFixed(2) + ') because the stop can\'t reach breakeven yet');
                            }
                        }
                    }
                }
            }

            // 3) Single-position runner (no leg A): the bot takes the TP1 lot off.
            if (posState._runner && !posState._tp1PartialDone && tp1Reached && profit > 0) {
                const closeVol = parseFloat((Math.max(1, Math.round((posState._partialLot || minPartial) / step)) * step).toFixed(2));
                const remaining = parseFloat((vol - closeVol).toFixed(2));
                if (closeVol >= minPartial - 1e-9 && remaining >= minPartial - 1e-9) {
                    const est = profit * closeVol * sc.lotVal, ct = Date.now();
                    let pres;
                    try { pres = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_PARTIAL', positionId: pos.id, volume: closeVol }), tradeId, 'v1 TP1 partial', { noRetry: true }); } catch (e) { pres = { success: false, reason: e.message }; }
                    if (pres.success) {
                        posState._tp1PartialDone = true; posState._tp1Hit = true;
                        savePositionState(pos.id, { _tp1PartialDone: true, _tp1Hit: true });
                        const ppnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                        journalPartialClose(tradeId, profit.toFixed(2), ppnl, 1);
                        vol = remaining;
                        sendTelegram('✅ *TP1 hit* — Trade #' + tradeId + '\nClosed ' + closeVol + ' lot at ' + curP.toFixed(2) + ' (P&L ' + C + ppnl.toFixed(2) + ')\nRemaining ' + remaining + ' lot runs to ' + curTP.toFixed(2));
                    } else if (pres.reason === 'position_not_found') {
                        continue;
                    } else {
                        const fails = (posState._tp1PartialFails || 0) + 1;
                        posState._tp1PartialFails = fails;
                        if (fails >= 3) posState._tp1PartialDone = true;
                        savePositionState(pos.id, fails >= 3 ? { _tp1PartialFails: fails, _tp1PartialDone: true } : { _tp1PartialFails: fails });
                        _mgmtAlert(tradeId, fails >= 3 ? 'tp1_partial_giveup' : 'tp1_partial', '⚠️ TP1 partial close failed — Trade #' + tradeId + ' (' + String(pres && pres.reason || 'unknown').slice(0, 120) + ')' + (fails >= 3 ? '\nGave up after 3 tries — the trade keeps its stop ladder and final TP.' : ''));
                    }
                } else {
                    posState._tp1PartialDone = true; savePositionState(pos.id, { _tp1PartialDone: true });
                }
            }

            // 4) Breakeven once TP1 has traded, then the 0.5R ladder.
            if (beReached && best !== null) {
                const beLvl = isBuy ? entry + beBuf : entry - beBuf;
                let target;
                if (ladder.length) target = v1LadderStop(ladder, isBuy, best);
                else {
                    // No ladder stored (older trade): breakeven, then trailAtr × ATR behind the best price.
                    const tr = isBuy ? best - V1.trailAtr * atr : best + V1.trailAtr * atr;
                    target = isBuy ? Math.max(beLvl, tr) : Math.min(beLvl, tr);
                }
                if (target !== null && target > 0 && stopImproves(isBuy, target, curSL)) {
                    if (isBuy ? curP <= target : curP >= target) {
                        if (await v1Close('Stop level passed between checks', 'v1 ladder exit', '🔒')) continue;
                    } else {
                        const wasBE = !!posState._beTriggered;
                        const r = await v1Move(target, 'v1 ladder');
                        if (r === 'gone') continue;
                        if (r === 'moved' || r === 'not_better') {
                            if (!wasBE) markBreakeven();
                            if (r === 'moved') sendTelegram((wasBE ? '📶 *Stop stepped up*' : '🔒 *Breakeven*') + ' — Trade #' + tradeId + '\nSL → ' + curSL.toFixed(2) + ' (best price ' + best.toFixed(2) + ')');
                        }
                    }
                } else if (target !== null && !posState._beTriggered && !stopImproves(isBuy, target, curSL)) {
                    markBreakeven(); // the broker-side ladder got there first
                }
            }
            continue;
        }

        // ─── Advanced risk ──────────────────────────────────────────────────
        // Handed the position with its ORIGINAL stop, so its profit% rules
        // (BE at 0.5R; max-hold / Friday-close "if in profit") use real risk
        // rather than the post-breakeven SL distance.
        let closedByAdvanced = false;
        if (useAdv && pct > 0) {
            try {
                let candles = global._lastCandles || [],
                    recs = advancedRiskLib.getPositionRecommendations(Object.assign({}, pos, { stopLoss: entry - dirSign * slDist }), curP, atr, {
                        candles: candles,
                        maxHoldHours: cfg.maxHoldHours || ADVANCED_RISK_CONFIG.maxHoldHours,
                        trailOptions: { minTrailDistance: ADVANCED_RISK_CONFIG.minTrailDistance || .005 },
                        minBeBuffer: beBuf
                    });
                for (let rec of recs.recommendations) {
                    if (rec.action === 'move_to_be' && !posState._beTriggered) {
                        let r = await tryMoveStop(rec.stopPrice, 'BE move');
                        if (r === 'moved' || r === 'not_better') {
                            markBreakeven();
                            if (r === 'moved') sendTelegram('🔒 *Breakeven reached*\nTrade #' + tradeId + '\nSL moved to BE: ' + curSL.toFixed(2));
                        }
                    }
                    if (rec.action === 'close') {
                        let est = profit * vol * sc.lotVal, ct = Date.now();
                        let res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_CLOSE_ID', positionId: pos.id }), tradeId, 'advanced close');
                        if (res.success) {
                            // Real P&L from the broker's deal (was profit*vol*lotVal,
                            // ~10x off for gold, written straight to the journal).
                            let pnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                            sendTelegram('🕐 *Advanced Exit*\nTrade #' + tradeId + '\nReason: ' + rec.reason + '\nP&L: ' + C + pnl.toFixed(2));
                            journalClose(tradeId, pnl >= 0 ? 'win' : 'loss', profit.toFixed(2), pnl);
                            // `continue` here used to only skip to the next
                            // recommendation, so the rest of this loop kept trying
                            // to move stops on a position that was already closed.
                            closedByAdvanced = true;
                            break;
                        }
                    }
                }
            } catch (e) { logger.warn('[managePositions] Advanced risk error:', e.message); }
        }
        if (closedByAdvanced) continue;

        // ─── Breakeven ──────────────────────────────────────────────────────
        let beTh = cfg.beThreshold || POSITION_CONFIG.beThreshold || 0.1,
            be = isBuy ? entry + beBuf : entry - beBuf;
        // Was `pct >= beTh && pct < 0.2` — a narrow 10%-20%-of-risk window.
        // A fast move (or a management cycle that runs a bit slow) could
        // carry price straight past that window between checks, so
        // breakeven would never fire at all for a trade that ran well past
        // it — and since step-trail below only activates once _beTriggered
        // is true, the whole trailing chain stalled too. Removed the upper
        // bound 2026-08-13. Since 2026-10-23: if the SL is already at/after
        // the BE level (e.g. the risk-free move in checkFreeTradeSafe got
        // there first) breakeven is recorded as done instead of re-sending
        // the same stop every cycle (which the broker rejects as "no
        // changes", leaving _beTriggered false and step-trail never starting).
        if (!posState._beTriggered && pct >= beTh) {
            let r = await tryMoveStop(be, 'BE move');
            if (r === 'moved' || r === 'not_better') markBreakeven();
        }

        // ─── Step-trail (ratchet SL forward every N points of profit) ────────
        // Added 2026-07-31 at Trent's request: "increase the breakeven each
        // time the market moves a certain amount of points." Only runs once
        // breakeven has genuinely been reached, and only ever moves the SL
        // forward relative to its current broker-side value, never backward.
        if (posState._beTriggered) {
            const stepPts = POSITION_CONFIG.stepTrailPoints || 3;
            const stepBuf = POSITION_CONFIG.stepTrailBuffer || 0.5;
            const stepsEarned = Math.floor(profit / stepPts);
            const lastStep = posState._stepTrailCount || 0;
            // At most 5 new steps (15 points) per cycle. This used to SKIP the
            // cycle entirely when the jump exceeded 5 — and since the step
            // count never advanced, a trade that ran fast stayed stuck at
            // breakeven forever (every later cycle saw the same "implausible"
            // jump). The anomaly the guard was written for (step 58 in one
            // cycle, 2026-08-05) came from the reversed-candle bug feeding a
            // ~37h-old price in as curP. Now a real fast move catches up over a
            // few cycles, and a bad tick can still move the stop at most 15
            // points — and only to a level valid at the live price.
            const MAX_STEPS_PER_CYCLE = 5;
            const targetSteps = Math.min(stepsEarned, lastStep + MAX_STEPS_PER_CYCLE);
            if (stepsEarned - lastStep > MAX_STEPS_PER_CYCLE) {
                logger.warn(`[step-trail] #${tradeId} large step jump (${lastStep} -> ${stepsEarned}) — advancing ${MAX_STEPS_PER_CYCLE} steps this cycle. profit=${profit.toFixed(2)}, curP=${curP}, entry=${entry}`);
            }
            if (targetSteps > lastStep) {
                const newLevelPrice = isBuy
                    ? entry + (targetSteps * stepPts) - stepBuf
                    : entry - (targetSteps * stepPts) + stepBuf;
                let r = await tryMoveStop(newLevelPrice, 'step trail');
                if (r === 'moved') {
                    posState._stepTrailCount = targetSteps;
                    savePositionState(pos.id, { _stepTrailCount: targetSteps });
                    sendTelegram('📶 *Step trail* #' + tradeId + '\nSL → ' + curSL.toFixed(2) + ' (step ' + targetSteps + ', +' + (targetSteps * stepPts).toFixed(1) + 'pts captured)');
                } else if (r === 'not_better') {
                    // Broker SL already ahead of this step (another trail got
                    // there first) — record the step as caught up.
                    posState._stepTrailCount = targetSteps;
                    savePositionState(pos.id, { _stepTrailCount: targetSteps });
                }
            }
        }

        // ─── TP1 partial on runner trades ───────────────────────────────────
        // See "Runner structure" in placeTrade: once price has reached TP1,
        // close ONE small lot (never the whole position), make sure the stop
        // is at breakeven, and leave the rest running toward the final TP
        // under step-trail / Chandelier. The bot only looks every ~3 minutes,
        // and most TP1 touches are brief, so "reached" also counts a touch in
        // between (M1 highs/lows since the trade opened); the lot then comes
        // off at the first check where the trade is still in profit. Added
        // 2026-10-23.
        if (posState._runner && !posState._tp1PartialDone && tp1 > 0) {
            let reached = !!posState._tp1Touched || (isBuy ? curP >= tp1 : curP <= tp1);
            if (!reached) {
                const m1c = global._lastM1Candles || [], openTs = pos.time ? new Date(pos.time).getTime() : 0;
                const sp = (quote && quote.spread > 0) ? +quote.spread : 0; // M1 bars are bid prices; a sell closes at the ask
                for (let i = m1c.length - 1; i >= 0; i--) {
                    const c = m1c[i], t = c && c.time ? new Date(c.time).getTime() : 0;
                    if (!t || !openTs || t < openTs) break;
                    if (isBuy ? c.high >= tp1 : (c.low + sp) <= tp1) { reached = true; break; }
                }
            }
            if (reached && !posState._tp1Touched) { posState._tp1Touched = true; savePositionState(pos.id, { _tp1Touched: true }); }
            if (reached && profit > 0) {
                const closeVol = parseFloat((Math.max(1, Math.round((posState._partialLot || minPartial) / step)) * step).toFixed(2));
                const remaining = parseFloat((vol - closeVol).toFixed(2));
                if (closeVol >= minPartial - 1e-9 && remaining >= minPartial - 1e-9) {
                    const est = profit * closeVol * sc.lotVal, ct = Date.now();
                    let pres;
                    try {
                        pres = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_PARTIAL', positionId: pos.id, volume: closeVol }), tradeId, 'TP1 partial');
                    } catch (e) { pres = { success: false, reason: e.message }; }
                    if (pres.success) {
                        posState._tp1PartialDone = true; posState._tp1Hit = true;
                        savePositionState(pos.id, { _tp1PartialDone: true, _tp1Hit: true });
                        const ppnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                        journalPartialClose(tradeId, profit.toFixed(2), ppnl, 1);
                        vol = remaining;
                        if (!posState._beTriggered) {
                            try {
                                const r = await tryMoveStop(isBuy ? entry + beBuf : entry - beBuf, 'BE after TP1');
                                if (r === 'moved' || r === 'not_better') markBreakeven();
                            } catch (e) { logger.warn(`[TP1] #${tradeId} breakeven after TP1 failed: ${e.message}`); }
                        }
                        sendTelegram('✅ *TP1 hit* — Trade #' + tradeId + '\nClosed ' + closeVol + ' lot at ' + curP.toFixed(2) + ' (P&L ' + C + ppnl.toFixed(2) + ')\nRemaining ' + remaining + ' lot runs to ' + curTP.toFixed(2) + ' | SL ' + curSL.toFixed(2));
                        continue;
                    }
                    if (pres.reason === 'position_not_found') continue;
                    // Broker refused the partial (e.g. volume rules). Retry on later
                    // cycles, but give up after 3 tries — the trade still has its
                    // stop, breakeven/trailing and final TP either way.
                    const fails = (posState._tp1PartialFails || 0) + 1;
                    posState._tp1PartialFails = fails;
                    savePositionState(pos.id, fails >= 3 ? { _tp1PartialFails: fails, _tp1PartialDone: true } : { _tp1PartialFails: fails });
                    if (fails >= 3) posState._tp1PartialDone = true;
                    _mgmtAlert(tradeId, fails >= 3 ? 'tp1_partial_giveup' : 'tp1_partial', '⚠️ TP1 partial close failed — Trade #' + tradeId + ' (' + String(pres && pres.reason || 'unknown').slice(0, 120) + ')' + (fails >= 3 ? '\nGave up after 3 tries — the trade keeps its stop, trailing and final TP.' : ''));
                } else {
                    // Not splittable any more (e.g. volume changed by hand) — stop checking.
                    posState._tp1PartialDone = true;
                    savePositionState(pos.id, { _tp1PartialDone: true });
                }
            }
        }

        // ─── Free trade partial close ──────────────────────────────────────
        let freeDone = await checkFreeTradeSafe(cfg, pos, curP, entry, slDist, isBuy, vol, sc, tradeId, atr, spec);
        if (freeDone) continue;

        // ─── 3-TP Split logic ──────────────────────────────────────────────
        if (is3TPSplit && splitPositions.length === 3) {
            let allPositions = await getPositions(cfg);
            let splitPositionsData = splitPositions.map(id => allPositions.find(p => normalizePositionId(p.id) === id)).filter(p => p);

            for (let p of splitPositionsData) {
                let pid = normalizePositionId(p.id);
                let pState = loadPositionState(pid) || {};
                let pEntry = parseFloat(p.openPrice) || entry;
                let pProfit = isBuy ? curP - pEntry : pEntry - curP;
                let pSlDist = Math.abs(pEntry - parseFloat(p.stopLoss) || 0);
                let pPct = pSlDist > 0 ? pProfit / pSlDist : 0;
                let pTp = parseFloat(p.takeProfit) || 0;
                let pTpHit = pState._tpHit || false;

                let hit = isBuy ? curP >= pTp : curP <= pTp;
                if (!pTpHit && hit && pTp > 0) {
                    let est = pProfit * parseFloat(p.volume) * sc.lotVal;
                    let res = await safePositionOperation(cfg, pid,
                        () => maPost(cfg, '/trade', {
                            actionType: 'POSITION_CLOSE_ID',
                            positionId: pid
                        }), pid, '3-TP split close');
                    if (res.success) {
                        let pnl = await fetchRealizedPnl(cfg, pid, est, Date.now());
                        let tpLevel = 1;
                        if (Math.abs(pTp - tp1) < 0.01) tpLevel = 1;
                        else if (Math.abs(pTp - tp2) < 0.01) tpLevel = 2;
                        else if (Math.abs(pTp - tp3) < 0.01) tpLevel = 3;

                        sendTelegram(`✅ TP${tpLevel} Hit — 0.01 lots closed\nPosition #${pid}\nP&L: ${C}${pnl.toFixed(2)}`);
                        journalPartialClose(pid, pProfit.toFixed(2), pnl, tpLevel);
                        savePositionState(pid, { _tpHit: true, _tpClosedAt: Date.now() });

                        if (tpLevel === 1) tp1Hit = true;
                        else if (tpLevel === 2) tp2Hit = true;
                        else if (tpLevel === 3) tp3Hit = true;
                        savePositionState(pos.id, { _tp1Hit: tp1Hit, _tp2Hit: tp2Hit, _tp3Hit: tp3Hit });
                    }
                }
            }
        }

        // ─── Chandelier Exit ──────────────────────────────────────────────
        if (pct > 0.3 && (duration === 'normal' || duration === 'sniper')) {
            const candles = global._lastCandles || [];
            if (candles.length >= 22) {
                const chandel = chandelierExit(candles, atr, 22, 3);
                let newStop = isBuy ? chandel.longStop : chandel.shortStop;
                if (newStop > 0) {
                    let r = await tryMoveStop(newStop, 'Chandelier trail');
                    if (r === 'moved') sendTelegram(`🔒 Chandelier trail #${tradeId} SL → ${curSL.toFixed(2)}`);
                }
            }
        }

        // ─── Duration-specific exits ──────────────────────────────────────
        if (duration === 'scalp') {
            // These thresholds have always been documented — and reported in
            // the Telegram messages below — in ATR units ("0.6 ATR profit"),
            // but were compared against pct, i.e. R-multiples of the scalp's
            // 0.4-ATR stop. So the "-0.2" cut was really -0.08 ATR (~$0.35 on
            // gold, about one spread): scalps were closed by noise almost
            // immediately, booking a stream of small losses. Now genuinely in
            // ATR units, as documented. Fixed 2026-10-23.
            // Close at 0.6 ATR profit or if momentum reverses
            if (profitAtr >= 0.6) {
                let est = profit * vol * sc.lotVal, ct = Date.now();
                let res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_CLOSE_ID', positionId: pos.id }), tradeId, 'scalp exit');
                if (res.success) { let pnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                    sendTelegram('⚡ Scalp closed at ' + curP.toFixed(2) + ' (' + profitAtr.toFixed(2) + ' ATR profit)');
                    journalClose(tradeId, pnl >= 0 ? 'win' : 'loss', profit.toFixed(2), pnl);
                    continue;
                }
            }
            // Momentum-fade exit (added 2026-07-29): real but sub-target
            // profit (0.15-0.6 ATR) and recent momentum under half of the
            // prior window → take the profit rather than let it fade.
            if (profitAtr >= 0.15 && profitAtr < 0.6) {
                const _scalpCandles = global._lastCandles || [];
                if (_scalpCandles.length >= 10) {
                    const recentMom = getMomentum(_scalpCandles.slice(-5));
                    const prevMom = getMomentum(_scalpCandles.slice(-10, -5));
                    const fading = isBuy ? (recentMom < prevMom * 0.5) : (recentMom > prevMom * 0.5);
                    if (prevMom !== 0 && fading) {
                        let est = profit * vol * sc.lotVal, ct = Date.now();
                        let res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_CLOSE_ID', positionId: pos.id }), tradeId, 'scalp momentum exit');
                        if (res.success) { let pnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                            sendTelegram('⚡ Scalp closed at ' + curP.toFixed(2) + ' (momentum fading, ' + profitAtr.toFixed(2) + ' ATR profit)');
                            journalClose(tradeId, pnl >= 0 ? 'win' : 'loss', profit.toFixed(2), pnl);
                            continue;
                        }
                    }
                }
            }
            // If price breaks back beyond entry by 0.2 ATR (half the scalp's
            // 0.4-ATR stop), close to cap the loss
            if (profitAtr < -0.2) {
                let est = profit * vol * sc.lotVal, ct = Date.now();
                let res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_CLOSE_ID', positionId: pos.id }), tradeId, 'scalp stop loss');
                if (res.success) { let pnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                    sendTelegram('⚡ Scalp stopped at ' + curP.toFixed(2) + ' (' + profitAtr.toFixed(2) + ' ATR loss)');
                    journalClose(tradeId, pnl >= 0 ? 'win' : 'loss', profit.toFixed(2), pnl);
                    continue;
                }
            }
            continue;
        }

        if (duration === 'sniper') {
            // Hold until clear structure break or strong reversal
            if (pct > 2.0) {
                // Momentum fade: MACD on M15 turning against the position
                const candles = global._lastCandles || [];
                if (candles.length >= 26) {
                    const macd = calcMACD(candles, 12, 26, 9);
                    if ((isBuy && macd.histogram < 0 && macd.macd < macd.signal) ||
                        (!isBuy && macd.histogram > 0 && macd.macd > macd.signal)) {
                        let est = profit * vol * sc.lotVal, ct = Date.now();
                        let res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_CLOSE_ID', positionId: pos.id }), tradeId, 'sniper momentum exit');
                        if (res.success) { let pnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                            sendTelegram('🎯 Sniper closed at ' + curP.toFixed(2) + ' (momentum fading)');
                            journalClose(tradeId, pnl >= 0 ? 'win' : 'loss', profit.toFixed(2), pnl);
                            continue;
                        }
                    }
                }
            }
            // Wide trail under/over the recent swing (every 4th M15 bar of the
            // last 100 — roughly the last 4 hours)
            if (pct > 0.5) {
                const candles = global._lastCandles || [];
                if (candles.length >= 100) {
                    const h4Candles = candles.filter((_, i) => i % 4 === 0);
                    if (h4Candles.length > 4) {
                        const swingHigh = Math.max(...h4Candles.slice(-4).map(c => c.high));
                        const swingLow = Math.min(...h4Candles.slice(-4).map(c => c.low));
                        let newStop = isBuy ? swingLow - atr * 0.3 : swingHigh + atr * 0.3;
                        let r = await tryMoveStop(newStop, 'sniper trail');
                        if (r === 'moved') sendTelegram(`🔒 Sniper trail #${tradeId} SL → ${curSL.toFixed(2)}`);
                    }
                }
            }
            continue;
        }

        // ─── Normal exit (partials + trailing) ────────────────────────────
        if (duration === 'normal') {
            // Partial close at 0.5R, move SL to BE
            if (pct >= 0.5 && !posState._freeTradeTriggered) {
                await checkFreeTradeSafe(cfg, pos, curP, entry, slDist, isBuy, vol, sc, tradeId, atr, spec);
            }
            // Trailing using Chandelier after 0.8R
            if (pct > 0.8) {
                const candles = global._lastCandles || [];
                if (candles.length >= 22) {
                    const chandel = chandelierExit(candles, atr, 22, 3);
                    let newStop = isBuy ? chandel.longStop : chandel.shortStop;
                    if (newStop > 0) {
                        let r = await tryMoveStop(newStop, 'normal trail');
                        if (r === 'moved') sendTelegram(`🔒 Normal trail #${tradeId} SL → ${curSL.toFixed(2)}`);
                    }
                }
            }
            // Time-based close after 12h if not enough profit
            let open = pos.time ? new Date(pos.time).getTime() : 0, hold = open ? (now - open) / (1000 * 60 * 60) : 0;
            if (hold > 12 && pct < 0.5 && pct > 0) {
                let est = profit * vol * sc.lotVal, ct = Date.now();
                let res = await safePositionOperation(cfg, pos.id, () => maPost(cfg, '/trade', { actionType: 'POSITION_CLOSE_ID', positionId: pos.id }), tradeId, 'time exit');
                if (res.success) { let pnl = await fetchRealizedPnl(cfg, pos.id, est, ct);
                    sendTelegram('🕐 Normal time exit #' + pos.id + ' (12h, small profit)');
                    journalClose(tradeId, pnl >= 0 ? 'win' : 'loss', profit.toFixed(2), pnl);
                    continue;
                }
            }
        }
      } catch (e) {
        let tradeId = normalizePositionId(pos.id || pos.positionId || String(Date.now()));
        logger.error(`[managePositions] Unhandled error managing position #${tradeId}: ${e.message}\n${e.stack}`);
        try { sendTelegram(`⚠️ Position management error on #${tradeId}: ${e.message}\nThis position may not have been checked for breakeven/trailing this cycle.`); } catch (e2) {}
      }
    }
}

// ─── FETCH REALIZED PNL ────────────────────────────────────────────────────
async function fetchRealizedPnl(cfg, posId, fallback, ts) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            let deals = await maGet(cfg, '/history-deals/position/' + posId, false);
            if (Array.isArray(deals)) {
                let out = [];
                deals.forEach(d => {
                    if (d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_OUT_BY') {
                        if (ts) {
                            let t = new Date(d.time || 0).getTime();
                            if (t < ts - 5000) return;
                        }
                        out.push(d);
                    }
                });
                if (out.length) {
                    let total = out.reduce((s, d) => s + parseFloat(d.profit || 0) + parseFloat(d.commission || 0) + parseFloat(d.swap || 0), 0);
                    return total;
                }
            }
        } catch (e) {}
        if (attempt < 2) await new Promise(r => setTimeout(r, 1200));
    }
    return fallback;
}

// ─── PLACE TRADE (SINGLE ORDER, NO SPLIT) ─────────────────────────────────
async function placeTrade(cfg, analysis, balance, consecLosses, consecWins, regimeLotMod, state) {
    consecLosses = consecLosses || 0;
    consecWins = consecWins || 0;
    let mp = getModeParams(cfg), sc = getSymConfig(cfg.symbol), spec = await getBrokerSymbolSpec(cfg), dir = analysis.signal, atr = analysis.atr, bestFVG = analysis.bestFVG, bestOB = analysis.bestOB, ts = spec.tickSize || .01, dec = String(ts).split('.')[1] ? String(ts).split('.')[1].length : 2;

    function fmt(p) { return p !== undefined && p !== null && !isNaN(p) ? parseFloat(p.toFixed(dec)) : p; }

    // v1 settings for this cycle (null = pre-v1 behaviour). 2026-10-24.
    const V1 = cfg._v1 || null;
    let price = analysis.curP, quotePd = null;
    try { let sym = await resolveSymbol(cfg), pd = await maGet(cfg, '/symbols/' + encodeURIComponent(sym) + '/current-price', false); if (pd && pd.ask && pd.bid) { price = dir === 'buy' ? parseFloat(pd.ask) : parseFloat(pd.bid); quotePd = pd; } } catch (e) {}
    if (V1) {
        // No live quote = no size (the tick value comes with it) and no cost check.
        if (!quotePd) return { order: null, error: 'no live quote' };
        v1NoteBrokerTime(quotePd);
    }

    let duration = analysis.tradeDuration || 'normal';
    // v1: no scalps — at normal ATRs their 0.4× ATR stop pays 19–29% of the
    // risk in spread, and they lost money in the model even with a strong
    // entry edge. 2026-10-24.
    if (V1 && duration === 'scalp') { duration = 'normal'; analysis.tradeDuration = 'normal'; }

    // Dynamic SL/TP based on duration
    let slMult, tp1Mult, tp2Mult, tp3Mult;
    switch (duration) {
        case 'scalp':
            slMult = 0.4; tp1Mult = 0.6; tp2Mult = 0.0; tp3Mult = 0.0;
            break;
        case 'normal':
            slMult = 0.9; tp1Mult = 0.8; tp2Mult = 1.5; tp3Mult = 2.2;
            break;
        case 'sniper':
            slMult = 1.8; tp1Mult = 2.0; tp2Mult = 4.0; tp3Mult = 0.0;
            break;
        default:
            slMult = 0.8; tp1Mult = 1.0; tp2Mult = 1.8; tp3Mult = 2.5;
    }

    let entry = price, entryType = 'market', entryZone = null;
    // v1 enters at market only: the limit-entry path was never tracked
    // (nothing filled _pendingLimitOrders) and sent its price in a field
    // MetaAPI doesn't read ("price" — the trade field is openPrice). 2026-10-24.
    if (V1) { /* market entry */ }
    else if (mp.useLimit && bestFVG && bestFVG.type === (dir === 'buy' ? 'bull' : 'bear')) {
        let limitOffset = atr * 0.1;
        entry = dir === 'buy' ? fmt(bestFVG.bot + limitOffset) : fmt(bestFVG.top - limitOffset);
        entryType = 'limit_fvg_ce'; entryZone = bestFVG;
    } else if (mp.useLimit && bestOB && bestOB.type === (dir === 'buy' ? 'bull' : 'bear')) {
        entry = fmt(bestOB.mid); entryType = 'limit_ob_mid'; entryZone = bestOB;
    }

    if (cfg.useM1Entry && analysis.originalSignal && analysis.originalSignal !== 'none' && entryZone) {
        let mr = await waitForM1Pullback(cfg, analysis.originalSignal, entryZone, atr, cfg.m1MaxWaitCandles, cfg.m1PullbackDepth);
        if (mr) { entry = mr.entryPrice; entryType = 'm1_pullback'; }
    }

    let slDist = atr * slMult;
    // Regime-aware SL distance adjustment. Reuses the same regime
    // multipliers getAdaptiveStopLoss (src) already defines — proven
    // values already in the codebase — but applies them as a bounded
    // modifier on top of the existing mode-based slMult rather than
    // replacing the calculation wholesale. getAdaptiveStopLoss has no
    // concept of trading mode (scalp/normal/aggressive/sniper), so a
    // direct swap would have discarded that existing tuning. Added
    // 2026-07-30 alongside the lot size ceiling, with the same intent:
    // improve without disturbing the currently-working risk profile.
    if (analysis.regime === 'volatile') {
        const _adjusted = slDist * 1.1;
        analysis.hits.push('⚠️ SL widened for volatile regime (+10%)');
        slDist = _adjusted;
    } else if (analysis.regime === 'trending') {
        const _adjusted = slDist * 0.9;
        analysis.hits.push('📉 SL tightened for trending regime (-10%)');
        slDist = _adjusted;
    }
    let sl = dir === 'buy' ? entry - slDist : entry + slDist;
    let minSL = 0.5;
    if (Math.abs(entry - sl) < minSL) sl = dir === 'buy' ? entry - minSL : entry + minSL;

    // Liquidity-zone-aware SL nudge. calculateEliteStopLoss/findNearestLiquidity
    // expect a flat array of bare price numbers, but detectLiquidityPools (the
    // real, live source — analysis.liquidityPools) returns pool OBJECTS
    // ({level, count, type, ...}). Extracting real .level values here rather
    // than passing the objects through directly, which would have silently
    // produced meaningless number-vs-object comparisons. Bounded: only nudges
    // the SL if a real nearby level exists within 50%-150% of the already-
    // computed (mode+regime-tuned) distance — close enough to be genuinely
    // relevant structure, not so far off that it overrides the existing
    // tuning with something wildly different. Added 2026-08-04.
    if (analysis.liquidityPools) {
        const pools = dir === 'buy' ? analysis.liquidityPools.buySide : analysis.liquidityPools.sellSide;
        const levels = (pools || []).map(p => p.level).filter(lv => dir === 'buy' ? lv < entry : lv > entry);
        const nearest = dir === 'buy'
            ? (levels.length ? Math.max(...levels) : null)
            : (levels.length ? Math.min(...levels) : null);
        if (nearest !== null) {
            const zoneBuffer = Math.max(0.2, atr * 0.05);
            const zoneDist = Math.abs(entry - nearest) + zoneBuffer;
            const currentDist = Math.abs(entry - sl);
            if (zoneDist >= currentDist * 0.5 && zoneDist <= currentDist * 1.5) {
                const zoneSl = dir === 'buy' ? nearest - zoneBuffer : nearest + zoneBuffer;
                analysis.hits.push('🎯 SL aligned to liquidity zone (' + nearest.toFixed(2) + ')');
                sl = zoneSl;
            }
        }
    }

    // Compute TPs (we'll keep all three for partial closes via position management)
    // Structure-aware placement: nearest real swing high/low (or S/R level
    // for tp3), falling back to the existing ATR-multiple targets when no
    // nearby structural level exists. targetRR is derived from tp1Mult/slMult
    // so that fallback reproduces the exact prior calculation — no behavior
    // change when there's no real level to target, only an improvement when
    // there is one. global._lastCandles is set earlier in this same cycle
    // (same pattern getEliteExitStrategy already uses).
    let tp1, tp2, tp3;
    // (1-hour setups take their structure targets from the 1-hour chart.)
    const _tpCandles = (V1 && V1.setupTf === '1h' && global._v1SetupCandles) || global._lastCandles || [];
    if (_tpCandles.length >= 20) {
        const smartTPs = findSmartTPLevels(_tpCandles, entry, dir, slDist, atr, tp1Mult / slMult);
        // Minimum R:R floor on the real-structure TP1: if the nearest swing
        // high/low is close enough that it produces a worse ratio than this
        // mode's own multipliers intended, it's not a good target — fall
        // back to the ATR-multiple TP1 instead rather than take a real but
        // too-close level. Added 2026-07-31 after a trade where the nearest
        // real swing produced a 1:0.5 R:R on a mode whose own multipliers
        // intended roughly 1:0.89.
        const intendedRR = tp1Mult / slMult;
        const smartTp1RR = Math.abs(smartTPs.tp1 - entry) / slDist;
        if (smartTp1RR < intendedRR * 0.9) {
            tp1 = dir === 'buy' ? entry + atr * tp1Mult : entry - atr * tp1Mult;
            analysis.hits.push('⚠️ Nearest structure TP too close (R:R ' + smartTp1RR.toFixed(2) + ') — used ATR target instead');
        } else {
            tp1 = smartTPs.tp1;
        }
        tp2 = tp2Mult > 0 ? smartTPs.tp2 : 0;
        tp3 = tp3Mult > 0 ? smartTPs.tp3 : 0;
    } else {
        // Not enough candle history for swing detection — same fallback as before.
        tp1 = dir === 'buy' ? entry + atr * tp1Mult : entry - atr * tp1Mult;
        tp2 = tp2Mult > 0 ? (dir === 'buy' ? entry + atr * tp2Mult : entry - atr * tp2Mult) : 0;
        tp3 = tp3Mult > 0 ? (dir === 'buy' ? entry + atr * tp3Mult : entry - atr * tp3Mult) : 0;
    }

    // Absolute R:R floor, independent of any mode's own intended ratio. The
    // fallback above only protects against a real structure TP being worse
    // than what THIS mode intended — a mode whose own intended R:R is low
    // by design still passes through with a thin trade. Reviewed loss data
    // showed R:R as low as 0.05-0.49 reaching placement. 0.6 is a
    // deliberately conservative floor (not tied to any specific mode's
    // math) — a trade this thin needs an unrealistically high win rate to
    // be worth taking at all. This is inside placeTrade(), past the point
    // where the caller already decided to trade — setting analysis.signal
    // here would NOT actually stop the order (nothing downstream checks
    // it), so this returns early instead, matching how this function
    // aborts elsewhere (e.g. 'Insufficient margin' a few lines below).
    // Added 2026-08-18.
    const finalTp1RR = Math.abs(tp1 - entry) / slDist;
    if (finalTp1RR < 0.6) {
        logger.info(`[placeTrade] Blocked: R:R too thin (${finalTp1RR.toFixed(2)} < 0.6 floor)`);
        return { order: null, error: 'R:R too thin (' + finalTp1RR.toFixed(2) + ' < 0.6 floor)' };
    }

    if (dir === 'buy') {
        if (tp1 <= entry) tp1 = entry + 0.5;
        if (tp2 > 0 && tp2 <= tp1) tp2 = tp1 + 0.5;
        if (tp3 > 0 && tp3 <= tp2) tp3 = tp2 + 0.5;
    } else {
        if (tp1 >= entry) tp1 = entry - 0.5;
        if (tp2 > 0 && tp2 >= tp1) tp2 = tp1 - 0.5;
        if (tp3 > 0 && tp3 >= tp2) tp3 = tp2 - 0.5;
    }

    sl = parseFloat(sl.toFixed(2));
    tp1 = parseFloat(tp1.toFixed(2));
    tp2 = tp2 ? parseFloat(tp2.toFixed(2)) : 0;
    tp3 = tp3 ? parseFloat(tp3.toFixed(2)) : 0;

    // ─── Risk and position sizing ────────────────────────────────────────
    // v1 sizes after the stop is final (below, see v1PositionSize): a flat
    // risk in the account currency, none of the multipliers in this block.
    let lots = 0, v1Size = null;
    if (!V1) {
    let baseRisk = cfg.risk || 1.5;
    let adrEst = typeof analysis.adr === 'number' && analysis.adr > 0 ? analysis.adr : atr * 6;
    let adaptRisk = getAdaptiveRisk(analysis.score, baseRisk, atr, adrEst, analysis.regime, analysis.session && analysis.session.session, consecLosses, consecWins, analysis.regimeAtrRatio, analysis.adrRatio);

    let mlSizeMult = 1.0;
    let mlProb = 0.5;
    if (cfg.useMLValidation !== false) {
        try {
            const mlResult = predict(analysis, analysis.regime, analysis.session, cfg);
            mlProb = mlResult.probability || 0.5;
            mlSizeMult = mlResult.sizeMultiplier || 1.0;
            analysis.mlWinProb = mlProb;
            analysis.mlConfidence = mlResult.confidence || 0.5;
        } catch (e) {}
    }

    let corrMult = 1.0;
    if (cfg.useCorrelation !== false) {
        try {
            const corrAnalyzer = new CorrelationAnalyzer();
            const corrResult = await corrAnalyzer.analyze(cfg.symbol, cfg);
            corrMult = corrAnalyzer.getSizeAdjustment(corrResult);
            analysis.correlationDeviation = corrResult.deviation || 0;
        } catch (e) {}
    }

    let seasonMult = 1.0;
    if (cfg.useSeasonality !== false) {
        try {
            const seasonAnalyzer = new SeasonalityAnalyzer();
            const now = new Date();
            seasonMult = seasonAnalyzer.getSizeMultiplier(now.getUTCDay(), now.getUTCHours());
            analysis.seasonalityPattern = seasonAnalyzer.getPattern(now.getUTCDay(), now.getUTCHours()).pattern;
        } catch (e) {}
    }
    const season2 = getAdvancedSeasonality(new Date());
    seasonMult *= season2.multiplier;

    let spreadMult = 1.0;
    const spread = cfg._spread || 0.5;
    const spreadATR = spread / atr;
    if (spreadATR > 0.3) spreadMult = Math.max(0.5, 1 - (spreadATR - 0.3) * 2);

    let newsMult = 1.0;
    if (cfg.useNewsSentiment !== false) {
        const newsEvents = await getLazyCalendar().catch(() => []);
        const nw = isNewsWindow(newsEvents);
        if (nw.blocked && nw.minutesUntil < 60) {
            newsMult = Math.max(0.3, 1 - (60 - nw.minutesUntil) / 60 * 0.7);
        }
    }

    let streakMult = 1.0;
    if (consecLosses >= 5) streakMult = 0.1;
    else if (consecLosses >= 4) streakMult = 0.2;
    else if (consecLosses >= 3) streakMult = 0.3;
    else if (consecLosses >= 2) streakMult = 0.6;
    else if (consecWins >= 5) streakMult = 1.1;

    let macroMult = 1.0;
    if (cfg.useMacroTrend !== false && analysis.macroTrend) macroMult = analysis.macroTrend.confidence > 0.7 ? 1.2 : 1.0;

    const trendSizeMult = 0.5 + (analysis.trendQuality || 50) / 100 * 1.5;
    const trendFactor = Math.max(0.5, Math.min(2.0, trendSizeMult));

    let conflictCount = countConflicts(analysis.hits);
    let conflictMult = getConflictSizeMult(conflictCount);
    // Downsizing alone doesn't fix a bad setup, just slows the bleed —
    // reviewed loss data had trades with 6-9 conflict flags still placed
    // at 50% size. Above a threshold, skip the trade entirely rather than
    // take a smaller version of it. 6 is deliberately above the existing
    // n>=3 downsize threshold so this only cuts the worst tail, not
    // trades that were already being sized down reasonably. Added
    // 2026-08-18.
    if (conflictCount >= 6) {
        logger.info(`[placeTrade] Blocked: ${conflictCount} conflict flags (too many to downsize, not trade)`);
        return { order: null, error: conflictCount + ' conflict flags — skipped rather than downsized' };
    }

    // We'll compute portfolio risk but not use it to block trades – only for info
    const portfolioRiskResult = portfolioRisk.getRecommendation(balance);
    const recoveryResult = recoveryManager.getRecommendation();
    const forwardResult = forwardValidator.getRecommendation();
    const economicResult = await economicCalendar.getSignal();

    let riskMultTotal = 1;
    riskMultTotal *= (portfolioRiskResult.riskMultiplier || 1);
    riskMultTotal *= (recoveryResult.riskMultiplier || 1);
    riskMultTotal *= (forwardResult.sizeMultiplier || 1);
    riskMultTotal *= (economicResult.sizeMultiplier || 1);

    const globalAdj = enhancedLearner.getGlobalAdjustments();
    riskMultTotal *= globalAdj.riskMultiplier;

    const intermarketData = global._intermarketData || { sentiment: 'neutral', score: 0 };
    if (intermarketData.sentiment === 'risk_on' && analysis.signal === 'sell') riskMultTotal *= 0.8;
    if (intermarketData.sentiment === 'risk_off' && analysis.signal === 'buy') riskMultTotal *= 0.8;

    riskMultTotal = Math.max(0.1, Math.min(2.0, riskMultTotal));

    let totalMult = mlSizeMult * corrMult * seasonMult * spreadMult * newsMult * streakMult * regimeLotMod * macroMult * conflictMult * trendFactor * riskMultTotal;
    totalMult = Math.max(0.05, Math.min(2.0, totalMult));

    let finalRiskPct = Math.min(2.5, adaptRisk * totalMult);
    let riskAmt = balance * (finalRiskPct / 100);
    let maxRisk = balance * (MAX_RISK_PCT / 100);
    if (riskAmt > maxRisk) { finalRiskPct = MAX_RISK_PCT; riskAmt = maxRisk; }

    let sizing = calculateLotSize({
        balance: balance,
        riskPct: finalRiskPct,
        slDist: Math.abs(entry - sl),
        contractSize: spec.contractSize,
        minVolume: Math.max(spec.minVolume, 0.01),
        maxVolume: Math.min(spec.maxVolume, sc.maxLot),
        volumeStep: spec.volumeStep,
        score: analysis.score,
        maxRiskPct: MAX_RISK_PCT,
        minLotForSplit: MIN_LOT_FOR_SPLIT
    });
    lots = sizing.lots;
    if (lots < 0.01) lots = 0.01;
    if (lots > MAX_LOT_SIZE_CEILING) {
        const _volStep = (spec && spec.volumeStep) || 0.01;
        lots = parseFloat((Math.round(MAX_LOT_SIZE_CEILING / _volStep) * _volStep).toFixed(2));
        analysis.hits.push('⚠️ Lot size capped at ' + lots + ' (ceiling)');
        logger.info(`[position-sizing] Lot size clamped to ceiling: raw ${sizing.lots} -> ${lots}`);
    }
    } // end pre-v1 sizing

    // ─── NO SPLIT – one order only ──────────────────────────────────────
    let isLimit = entryType.indexOf('limit') !== -1;
    let action = isLimit ? (dir === 'buy' ? 'ORDER_TYPE_BUY_LIMIT' : 'ORDER_TYPE_SELL_LIMIT') : (dir === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL');

    // v1 option V1_MIN_STOP_ATR (0 = off): keep the stop at least N× the
    // 15-minute ATR from entry, so ordinary 15-minute noise doesn't stop a
    // trade out before its move starts. In the 2015-2024 replay, 56% of trades
    // were stopped within an hour (−0.149R on average) with the 0.9× ATR stop,
    // and trades that survived 3+ hours averaged +0.26R. Targets keep the
    // prices computed above; v1 sizes the position from this wider stop below
    // (the 0.05-lot and 0.5% risk caps still apply). Added 2026-10-24 for
    // replay testing — off in the live bot unless the setting is made.
    // RESULT (2015-2024 replay, 2026-10-24): at 1.5 it was WORSE — 3,310
    // trades at −0.076R (t −4.5) vs 1,855 at −0.043R for v1, beating only
    // 25% of random entries. Wider stops let many more entries past the
    // cost check, widened trades averaged −0.089R, and the average win fell
    // to +0.75R because targets stayed put. Keep it off; see
    // tools/replay/VARIANTS.md.
    if (V1 && V1.minStopAtr > 0 && atr > 0) {
        const minD = V1.minStopAtr * atr;
        if (Math.abs(entry - sl) < minD) {
            sl = parseFloat((dir === 'buy' ? entry - minD : entry + minD).toFixed(2));
            analysis.hits.push('↔️ Stop widened to ' + V1.minStopAtr + '× ATR (' + minD.toFixed(2) + ')');
        }
    }

    // (the ATR lets the dollar ceilings grow with gold's swings — see validateStopLoss)
    let validatedSl = validateStopLoss(cfg, entry, sl, dir, spec, true, atr);
    let validatedTp1 = validateTakeProfit(cfg, entry, tp1, validatedSl, dir, spec, atr);
    let validatedTp2 = tp2 ? validateTakeProfit(cfg, entry, tp2, validatedSl, dir, spec, atr) : 0;
    let validatedTp3 = tp3 ? validateTakeProfit(cfg, entry, tp3, validatedSl, dir, spec, atr) : 0;

    // Ensure TPs are valid and spaced
    if (dir === 'buy') {
        let minSpacing = Math.max(0.5, atr * 0.2);
        if (validatedTp1 <= entry) validatedTp1 = entry + Math.max(0.5, Math.abs(entry - validatedSl) * 0.3);
        if (validatedTp2 && validatedTp2 <= validatedTp1 + minSpacing) validatedTp2 = validatedTp1 + Math.max(minSpacing, Math.abs(entry - validatedSl) * 0.4);
        if (validatedTp3 && validatedTp3 <= validatedTp2 + minSpacing) validatedTp3 = validatedTp2 + Math.max(minSpacing, Math.abs(entry - validatedSl) * 0.4);
    } else {
        let minSpacing = Math.max(0.5, atr * 0.2);
        if (validatedTp1 >= entry) validatedTp1 = entry - Math.max(0.5, Math.abs(entry - validatedSl) * 0.3);
        if (validatedTp2 && validatedTp2 >= validatedTp1 - minSpacing) validatedTp2 = validatedTp1 - Math.max(minSpacing, Math.abs(entry - validatedSl) * 0.4);
        if (validatedTp3 && validatedTp3 >= validatedTp2 - minSpacing) validatedTp3 = validatedTp2 - Math.max(minSpacing, Math.abs(entry - validatedSl) * 0.4);
    }

    validatedTp1 = parseFloat(validatedTp1.toFixed(2));
    validatedTp2 = validatedTp2 ? parseFloat(validatedTp2.toFixed(2)) : 0;
    validatedTp3 = validatedTp3 ? parseFloat(validatedTp3.toFixed(2)) : 0;
    validatedSl = parseFloat(validatedSl.toFixed(2));

    // ─── v1: size, cost and open-risk checks on the final stop ──────────────
    let v1Cost = null;
    if (V1) {
        // Same entry rule as before v1 (2026-08-18): 6+ conflict flags = skip.
        const nConf = countConflicts(analysis.hits);
        if (nConf >= 6) return { order: null, error: nConf + ' conflict flags', v1Block: 'conflicts' };
        const slD = Math.abs(entry - validatedSl), acct = global._v1Account || {};
        const riskPct = Math.min(cfg._riskConfigured > 0 ? cfg._riskConfigured : V1.riskCapPct, V1.riskCapPct);
        v1Size = v1PositionSize({ balance, riskPct, slDist: slD, lossTickValue: parseFloat(quotePd.lossTickValue) || 0, tickSize: spec.tickSize, contractSize: spec.contractSize, accountCurrency: acct.currency, minVolume: spec.minVolume, maxVolume: Math.min(spec.maxVolume || 100, V1.maxLots), volumeStep: spec.volumeStep, minLotRiskMult: V1.minLotRiskMult });
        if (!(v1Size.lots > 0)) return { order: null, error: v1Size.reason, v1Block: 'size' };
        lots = v1Size.lots;
        // Every trade pays (spread + slippage + commission) before price moves;
        // as a share of the stop that is a direct tax on expectancy. Refuse
        // anything above COST_MAX_FRAC (10%): that replaces the old $2.50
        // spread limit, which at a $3.60 stop allowed ~70% of the risk.
        const spr = Math.max(0, parseFloat(quotePd.ask) - parseFloat(quotePd.bid));
        const commPrice = V1.commissionPerLot > 0 && v1Size.perUnit > 0 ? V1.commissionPerLot / v1Size.perUnit : 0;
        const cost = spr + V1.slippage + commPrice, frac = slD > 0 ? cost / slD : 1;
        v1Cost = { spread: spr, cost, frac, slDist: slD };
        if (frac > V1.costMaxFrac + 1e-9) return { order: null, error: 'costs ' + (frac * 100).toFixed(1) + '% of the stop (spread ' + spr.toFixed(2) + ' + slippage ' + V1.slippage.toFixed(2) + (commPrice ? ' + commission ' + commPrice.toFixed(2) : '') + ' vs a ' + slD.toFixed(2) + ' stop; limit ' + (V1.costMaxFrac * 100).toFixed(0) + '%)', v1Block: 'cost' };
        // Total money at risk across open trades stays within OPEN_RISK_CAP ×
        // one trade's risk: a second trade only once the first is (mostly)
        // protected by its stop.
        const openRisk = v1OpenRisk(cfg._v1Positions || [], v1Size.perUnit);
        if (openRisk + v1Size.riskAmount > V1.openRiskCap * v1Size.targetAmount + 1e-9) return { order: null, error: 'open risk would be ' + ((openRisk + v1Size.riskAmount) / v1Size.targetAmount).toFixed(2) + '× one trade (cap ' + V1.openRiskCap + '×)', v1Block: 'open_risk' };
    }

    // ─── Runner structure: one small lot at TP1, the rest runs ────────────
    // The order used to go in with takeProfit = TP1 (0.8 ATR against a 0.9
    // ATR stop on normal trades), so the broker closed the WHOLE position
    // there: winners were capped below 1R while losers took the full stop,
    // and TP2/TP3 were computed but never used — despite the design note
    // "single order with partial closes" (getCfg) and Trent's rule that
    // partial profit-taking closes only one small lot while the rest runs
    // with trailing stops. Now, for normal/sniper trades big enough to
    // split, the broker TP is the FINAL target (TP3; TP2 for sniper, which
    // has no TP3) and managePositions closes ONE minimum lot when price
    // reaches TP1, moves the stop to breakeven, and lets step-trail /
    // Chandelier run the rest. Scalps and minimum-lot trades keep a single
    // TP1. Off switch: botConfig.runnerTP=false or RUNNER_TP=false.
    // Added 2026-10-23.
    const _volStep = (spec && spec.volumeStep) || 0.01;
    const smallLot = parseFloat((Math.ceil(Math.max((spec && spec.minVolume) || 0.01, 0.01) / _volStep - 1e-9) * _volStep).toFixed(2));
    const finalTarget = duration === 'normal' ? (validatedTp3 || validatedTp2) : duration === 'sniper' ? (validatedTp2 || validatedTp3) : 0;
    const finalBeyondTp1 = finalTarget > 0 && (dir === 'buy' ? finalTarget > validatedTp1 + 0.01 : finalTarget < validatedTp1 - 0.01);
    let runner = cfg.runnerTP !== false && finalBeyondTp1 && lots >= smallLot * 2 - 1e-9;
    let brokerTp = runner ? finalTarget : validatedTp1;
    let twoLeg = false, ladder = [];
    if (V1) {
        // v1: the broker TP is the final target whatever the size — a single
        // lot also gets breakeven at TP1 and the stop ladder rather than
        // being closed whole at TP1 (only ever one small lot comes off at
        // TP1). On a hedging account that lot is its own position ("leg A")
        // whose broker TP is TP1; otherwise the bot closes it at TP1.
        brokerTp = finalBeyondTp1 ? finalTarget : validatedTp1;
        const hedging = /HEDGING/.test(String((global._v1Account || {}).marginMode || ''));
        twoLeg = !!(V1.twoLegs && hedging && finalBeyondTp1 && lots >= smallLot * 2 - 1e-9);
        runner = !twoLeg && finalBeyondTp1 && lots >= smallLot * 2 - 1e-9;
        if (finalBeyondTp1) {
            const beBufE = getBeBuffer(atr, sc.minSL, sc.limitSlip, v1Cost ? v1Cost.spread : undefined);
            ladder = v1ServerLadder({ isBuy: dir === 'buy', entry, risk: Math.abs(entry - validatedSl), tp1: validatedTp1, finalTp: brokerTp, beBuf: beBufE, atr, trailAtr: V1.trailAtr, tick: spec.tickSize, beTrigger: V1.beTrigger });
        }
    }

    const shortComment = makeComment(cfg.symbol, analysis.score, duration, analysis.mlWinProb || 0.5);

    // ─── MARGIN CHECK ──────────────────────────────────────────────────────
    try {
        const accountInfo = await getAccount(cfg);
        const freeMargin = parseFloat(accountInfo.freeMargin || 0);
        const marginRequired = parseFloat(accountInfo.margin || 0);
        // Estimate risk amount: we'll use the risk amount in currency
        // (v1: the real figure, in the account currency).
        const riskInCurrency = v1Size ? v1Size.riskAmount : Math.abs(entry - validatedSl) * lots * sc.lotVal;
        // If free margin is less than 2x the risk, block trade
        if (freeMargin < riskInCurrency * 2) {
            logger.warn(`[Margin] Insufficient free margin: ${freeMargin} ${cfg.currency} < ${(riskInCurrency*2).toFixed(2)} ${cfg.currency}`);
            sendTelegram(`⚠️ Trade blocked – insufficient margin\nFree margin: ${freeMargin.toFixed(2)}\nRequired: ${(riskInCurrency*2).toFixed(2)}`);
            return { order: null, error: 'Insufficient margin' };
        }
    } catch (e) {
        logger.warn('[Margin] Could not check margin:', e.message);
        // Proceed anyway
    }

    // ─── PLACE ORDER ──────────────────────────────────────────────────────
    try {
        // The broker's own name for the instrument (resolved from the
        // account — see resolveSymbol); cfg.symbol may be a variant this
        // account doesn't have, which would reject every order. 2026-10-23.
        let orderSymbol = cfg.symbol;
        try { orderSymbol = (await resolveSymbol(cfg)) || cfg.symbol; } catch (e) { /* keep configured */ }
        // v1 two-leg: the main order carries all but one small lot; leg A
        // (placed right after) carries that lot with TP = TP1.
        const mainLots = twoLeg ? parseFloat((lots - smallLot).toFixed(2)) : lots;
        let orderBody = {
            symbol: orderSymbol,
            actionType: action,
            volume: mainLots,
            stopLoss: validatedSl,
            takeProfit: brokerTp,
            comment: shortComment
        };
        if (isLimit) { orderBody.price = entry; orderBody.openPrice = entry; }
        // v1: the stop ladder also runs on MetaAPI's servers (threshold
        // trailing stop, absolute prices). If MetaAPI refuses the field, the
        // order goes again without it and the bot keeps enforcing the ladder.
        let serverTrail = false;
        if (V1 && V1.serverTrail && ladder.length && !_v1ServerTrailRefused) { orderBody.trailingStopLoss = { threshold: { thresholds: ladder, units: 'ABSOLUTE_PRICE' } }; serverTrail = true; }
        let order;
        try {
            order = await maPost(cfg, '/trade', orderBody);
        } catch (e) {
            // Only a definite refusal (HTTP 4xx / broker rejection — no order
            // was opened) is retried without the ladder; a timeout or 5xx is
            // not, because the order may have gone through.
            if (!serverTrail || !/→ 4\d\d|Broker rejected/.test(String(e.message))) throw e;
            delete orderBody.trailingStopLoss;
            order = await maPost(cfg, '/trade', orderBody);
            logger.warn('[v1] Order with the server-side trailing stop was refused (' + String(e.message).slice(0, 160) + ') but went through without it — the bot enforces the ladder itself from now on');
            _v1ServerTrailRefused = true; serverTrail = false;
        }
        // Same id the caller journals under (positionId, else orderId — a
        // pending limit order's ticket becomes its position id in MT5).
        // getTradeId() looks for order.id, which a trade response doesn't
        // have, so limit orders got their state saved under a timestamp and
        // lost it (duration, original stop, TPs). Fixed 2026-10-23.
        let newId = normalizePositionId(order && (order.positionId || order.orderId)) || getTradeId(order);
        if (newId) {
            savePositionState(newId, {
                _score: analysis.score,
                _entryMLWinProb: analysis.mlWinProb || 0.5,
                _entryMLConfidence: analysis.mlConfidence || 0.5,
                _tp1: validatedTp1,
                _tp2: validatedTp2,
                _tp3: validatedTp3,
                _tp1Vol: 0,
                _tp2Vol: 0,
                _tp3Vol: 0,
                _canSplit: false,
                _entryPrice: entry,
                _sl: validatedSl,
                _atr: atr,
                _is3TPSplit: false,
                _tradeDuration: duration,
                _runner: runner,
                _partialLot: runner ? smallLot : 0,
                _finalTp: brokerTp
            });
        }

        // ─── v1: per-trade facts for exits, results and the leg A order ───
        let legAId = null, legAError = null;
        if (V1 && newId) {
            savePositionState(newId, { _v1: true, _ladder: ladder, _serverTrail: serverTrail, _initialRisk: Math.abs(entry - validatedSl),
                _riskAmount: v1Size.riskAmount, _tradeRisk: v1Size.riskAmount, _decisionPrice: entry, _spreadAtEntry: v1Cost && v1Cost.spread, _strategyVersion: STRATEGY_VERSION });
            if (twoLeg) {
                const bodyA = { symbol: orderSymbol, actionType: action, volume: smallLot, stopLoss: validatedSl, takeProfit: validatedTp1,
                    comment: makeComment(cfg.symbol, analysis.score, duration, analysis.mlWinProb || 0.5, 'A') };
                if (isLimit) { bodyA.price = entry; bodyA.openPrice = entry; }
                try {
                    const orderA = await maPost(cfg, '/trade', bodyA);
                    legAId = normalizePositionId(orderA && (orderA.positionId || orderA.orderId)) || null;
                } catch (e) { legAError = e.message; }
                if (legAId) {
                    savePositionState(legAId, { _isLegA: true, _legOf: newId, _tradeDuration: duration, _entryPrice: entry, _sl: validatedSl, _tp1: validatedTp1, _tradeRisk: v1Size.riskAmount, _initialRisk: Math.abs(entry - validatedSl), _v1: true });
                    savePositionState(newId, { _legAId: legAId });
                } else {
                    // Leg A didn't go through: the main position is the whole
                    // trade. If it is big enough, the bot takes the TP1 lot off.
                    logger.warn('[v1] TP1 leg not placed (' + String(legAError || 'no id').slice(0, 160) + ') — the bot will close the TP1 lot itself if it can');
                    twoLeg = false;
                    runner = mainLots >= smallLot * 2 - 1e-9;
                    v1Size.riskAmount = v1Size.riskAmount * mainLots / Math.max(lots, 1e-9);
                    lots = mainLots;
                    savePositionState(newId, { _runner: runner, _partialLot: runner ? smallLot : 0, _riskAmount: v1Size.riskAmount, _tradeRisk: v1Size.riskAmount });
                }
            }
        }

        if (bestFVG) markZoneVisited('fvg', bestFVG.type + '_' + bestFVG.bot.toFixed(dec) + '_' + bestFVG.top.toFixed(dec), analysis.curP);
        if (bestOB) markZoneVisited('ob', bestOB.type + '_' + bestOB.low.toFixed(dec) + '_' + bestOB.high.toFixed(dec), analysis.curP);

        return {
            order: order,
            orders: [order],
            sl: validatedSl,
            tp: brokerTp,
            runner: runner,
            partialLot: runner ? smallLot : 0,
            lots: lots,
            entryPrice: entry,
            entryType,
            slType: 'duration_' + duration,
            tp1: validatedTp1,
            tp2: validatedTp2,
            tp3: validatedTp3,
            canSplit: false,
            tp1Vol: 0,
            tp2Vol: 0,
            tp3Vol: 0,
            abVersion: getActiveVersion(),
            is3TPSplit: false,
            tradeDuration: duration,
            // v1 extras (undefined before v1)
            v1: V1 ? { riskAmount: v1Size.riskAmount, riskPct: v1Size.riskAmount / Math.max(balance, 1e-9) * 100, perUnit: v1Size.perUnit,
                costFrac: v1Cost && v1Cost.frac, spreadAtEntry: v1Cost && v1Cost.spread, decisionPrice: entry,
                twoLeg, legAId, legAError, serverTrail, ladderSteps: ladder.length, mainLots: twoLeg ? mainLots : lots } : null
        };
    } catch (e) {
        logger.error('[placeTrade] Execution error:', e.message);
        throw e;
    }
}

// A position on this bot's instrument. The broker's symbol can differ from
// the configured one (BOT_SYMBOL=GOLD# but the account calls it GOLD — the
// candle sweep then uses the broker's name), and the order comment only
// carries the first 4 characters ("ICT_BOT|GOLD|..."), so match all three.
// The old check (exact symbol, or the full configured symbol inside the
// comment) missed those positions, which also defeated the duplicate check.
// Added 2026-10-23.
function isOurSymbol(cfg, p) {
    if (!p) return false;
    if (p.symbol === cfg.symbol || (_resolvedSymbol && p.symbol === _resolvedSymbol)) return true;
    return !!(p.comment && p.comment.indexOf('|' + String(cfg.symbol || '').slice(0, 4) + '|') !== -1);
}

// ════════════════════════════════════════════════════════════════════════════
// ─── V1: FROZEN, MEASURABLE STRATEGY (added 2026-10-24) ─────────────────────
// Research on 24 Oct 2026 ("ICT gold bot improvement priorities") found that
// the bot has no measured edge yet, and that several mechanics lose money
// whatever the entries are worth: breakeven at 0.1R scratched about half of
// all trades inside one 3-minute polling cycle, nothing checked what a trade
// cost against its stop, risk was multiplied by a dozen untested factors
// (and floored at 1.5%), and a stack of self-learning / outside-data layers
// changed the strategy from day to day, so nothing could be measured.
//
// v1 is the fixed, measurable version every later change is compared with:
//   • Exits: one small lot at TP1 (Trent's rule, unchanged), breakeven only
//     once TP1 is reached (or 0.5R with BE_TRIGGER=0.5r), then every 0.5R
//     further the stop steps up to 1× ATR(M15) behind. One rule in every
//     regime. On a hedging account the TP1 lot is its own position whose
//     broker take-profit IS TP1, and the rest carries the same stop ladder
//     as a MetaAPI server-side trailing stop — so TP1, breakeven and the
//     trail all happen even while the bot is asleep. The bot enforces the
//     same ladder itself as a backup.
//   • Costs & timing: no entry when spread + slippage + commission is more
//     than 10% of the stop; none within 15 min of XM's daily break, in the
//     first hour after the weekly open, in the last hour before the weekend,
//     or around top-tier US news; everything is closed before the daily break
//     (which also flattens before the weekend) and after 8 hours.
//   • Risk: a flat 0.5% per trade (BOT_RISK if lower), sized in the
//     ACCOUNT currency from the broker's tick value, no multipliers or streak
//     cuts, total open risk capped at 1.5× one trade, daily stop at −3R.
//   • Frozen: learning, auto-tuning, regime overrides and outside-data inputs
//     (DXY, yields, sentiment, COT, ETF, options, news direction...) no
//     longer change scores, thresholds or size. Every trade is tagged with
//     STRATEGY_VERSION.
//   • Safety: price-data checks, optional heartbeat URL for an outside
//     dead-man alert, and a drift (CUSUM) alarm on results.
// FREEZE_V1=false switches all of this off and restores the previous
// behaviour, which is kept intact behind each switch.
// ════════════════════════════════════════════════════════════════════════════

function _v1Num(v, envName, dflt) {
    let x = (v !== undefined && v !== null && v !== '') ? parseFloat(v)
        : (process.env[envName] !== undefined && process.env[envName] !== '' ? parseFloat(process.env[envName]) : dflt);
    return Number.isFinite(x) ? x : dflt;
}
function _v1Bool(v, envName, dflt) {
    const off = s => ['false', '0', 'off', 'no'].indexOf(String(s).trim().toLowerCase()) !== -1;
    if (v !== undefined && v !== null && v !== '') return !(v === false || off(v));
    const e = process.env[envName];
    if (e === undefined || e === '') return dflt;
    return !off(e);
}

function v1Settings() {
    const sv = (global._botState && global._botState.botConfig) || {};
    return {
        frozen: _v1Bool(sv.freezeV1, 'FREEZE_V1', true),
        riskCapPct: _v1Num(sv.riskCapPct, 'RISK_CAP_PCT', 0.5),
        minLotRiskMult: _v1Num(sv.minLotRiskMult, 'MIN_LOT_RISK_MULT', 2.0),
        openRiskCap: _v1Num(sv.openRiskCap, 'OPEN_RISK_CAP', 1.5),
        dailyStopR: _v1Num(sv.dailyStopR, 'DAILY_STOP_R', 3),
        costMaxFrac: _v1Num(sv.costMaxFrac, 'COST_MAX_FRAC', 0.10),
        slippage: _v1Num(sv.costSlippage, 'COST_SLIPPAGE', 0.10),
        commissionPerLot: _v1Num(sv.commissionPerLot, 'COMMISSION_PER_LOT', 0),
        beTrigger: String(sv.beTrigger || process.env.BE_TRIGGER || 'tp1').trim().toLowerCase() === '0.5r' ? '0.5r' : 'tp1',
        trailAtr: _v1Num(sv.trailAtr, 'TRAIL_ATR_MULT', 1.0),
        minStopAtr: _v1Num(sv.minStopAtr, 'V1_MIN_STOP_ATR', 0),   // 0 = off; see placeTrade
        dailyTrend: _v1Bool(sv.v1DailyTrend, 'V1_DAILY_TREND', false),  // off; see v1EntryFilters
        sweepAtr: _v1Num(sv.v1SweepAtr, 'V1_SWEEP_ATR', 0),            // 0 = off; see v1EntryFilters
        strategy: (x => x === 'trend' || x === 'ict2022' || x === 'silverbullet' || x === 'ote' || x === 'ea' ? x : 'ict')(String(sv.v1Strategy || process.env.V1_STRATEGY || 'ict').trim().toLowerCase()),  // see TREND, ICT, EA
        eaId: String(sv.v1Ea || process.env.V1_EA || '').trim().toLowerCase(),  // EA mode: which src/ea/strategies/<id>.json
        ictTf: String(sv.v1IctTf || process.env.V1_ICT_TF || '5m').trim().toLowerCase() === '15m' ? '15m' : '5m',  // see ICT
        setupTf: String(sv.v1SetupTf || process.env.V1_SETUP_TF || '15m').trim().toLowerCase() === '1h' ? '1h' : '15m',  // see v1AnalysisFrames
        maxHoldHours: _v1Num(sv.v1MaxHoldHours, 'V1_MAX_HOLD_HOURS', 8),
        flattenBeforeBreak: _v1Bool(sv.flattenBeforeBreak, 'FLATTEN_BEFORE_BREAK', true),
        serverTrail: _v1Bool(sv.serverTrail, 'SERVER_TRAIL', true),
        twoLegs: _v1Bool(sv.twoLegTP1, 'TWO_LEG_TP1', true),
        maxLots: _v1Num(sv.v1MaxLots, 'V1_MAX_LOTS', 0.05),
        sameDirAfterBE: _v1Bool(sv.sameDirAfterBE, 'SAME_DIR_AFTER_BE', true),
        newsProtect: _v1Bool(sv.newsProtect, 'NEWS_PROTECT', true),
        newsBlock: _v1Bool(sv.newsBlock, 'NEWS_BLOCK', true),
        spreadSpikeMult: _v1Num(sv.spreadSpikeMult, 'SPREAD_SPIKE_MULT', 2.0),
        staleCandleMin: _v1Num(sv.staleCandleMin, 'STALE_CANDLE_MIN', 30),
        heartbeatUrl: String(sv.heartbeatUrl || process.env.HEARTBEAT_URL || '').trim(),
        cusumK: _v1Num(sv.cusumK, 'CUSUM_K', 0.2),
        cusumH: _v1Num(sv.cusumH, 'CUSUM_H', 10),
    };
}
function v1On() { return v1Settings().frozen; }

// ─── Clocks: New York, XM server time, SAST ─────────────────────────────────
// US daylight saving: 2nd Sunday of March 02:00 EST (07:00 UTC) to 1st Sunday
// of November 02:00 EDT (06:00 UTC) — the rule since 2007. Pure arithmetic,
// so it doesn't depend on the server's time-zone database.
function _v1NthSunday(year, month, n) { const first = new Date(Date.UTC(year, month, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + (n - 1) * 7; }
function v1UsDst(ms) {
    const y = new Date(ms).getUTCFullYear();
    return ms >= Date.UTC(y, 2, _v1NthSunday(y, 2, 2), 7, 0) && ms < Date.UTC(y, 10, _v1NthSunday(y, 10, 1), 6, 0);
}
function v1NyParts(ms) {
    const dst = v1UsDst(ms), offMin = dst ? -240 : -300, t = new Date(ms + offMin * 60000);
    const y = t.getUTCFullYear(), mo = t.getUTCMonth() + 1, d = t.getUTCDate(), h = t.getUTCHours(), mi = t.getUTCMinutes();
    return { y, mo, d, h, mi, wd: t.getUTCDay(), mod: h * 60 + mi, dst, offMin, dateKey: y + '-' + mo + '-' + d };
}
// XM's server clock: GMT+3 while New York is on daylight saving, GMT+2
// otherwise. The broker's own clock (brokerTime in every price response) wins
// when it has been seen recently — see v1NoteBrokerTime.
let _v1BrokerOffset = null, _v1OffsetWarnDay = null;
function v1NoteBrokerTime(pd) {
    try {
        if (!pd || !pd.brokerTime || !pd.time) return;
        const bt = Date.parse(String(pd.brokerTime).trim().replace(' ', 'T') + 'Z'), t = Date.parse(pd.time);
        if (!Number.isFinite(bt) || !Number.isFinite(t)) return;
        const hours = Math.round((bt - t) / 3600000);
        if (hours === 2 || hours === 3) {
            const expected = v1UsDst(t) ? 3 : 2;
            if (hours !== expected && (!_v1BrokerOffset || _v1BrokerOffset.hours !== hours)) logger.warn('[v1-clock] Broker server time is GMT+' + hours + ' (rule says +' + expected + ') — using the broker\'s clock');
            _v1BrokerOffset = { hours, at: Date.now() };
        } else {
            const day = sastDateStr(new Date());
            if (_v1OffsetWarnDay !== day) {
                _v1OffsetWarnDay = day;
                logger.warn('[v1-clock] Unexpected broker time offset GMT' + (hours >= 0 ? '+' : '') + hours);
                sendTelegram('⚠️ Broker server clock looks unusual (GMT' + (hours >= 0 ? '+' : '') + hours + ', expected +2 or +3). Trading-hour rules use GMT+' + (v1UsDst(t) ? 3 : 2) + ' until this clears.');
            }
        }
    } catch (e) { /* clock check is advisory */ }
}
function v1ServerOffsetHours(ms) {
    if (_v1BrokerOffset && Math.abs(Date.now() - _v1BrokerOffset.at) < 6 * 3600000) return _v1BrokerOffset.hours;
    return v1UsDst(ms) ? 3 : 2;
}
function v1ServerParts(ms) {
    const off = v1ServerOffsetHours(ms), t = new Date(ms + off * 3600000);
    return { wd: t.getUTCDay(), h: t.getUTCHours(), mi: t.getUTCMinutes(), mod: t.getUTCHours() * 60 + t.getUTCMinutes(), off };
}
function v1SastTime(ms) { return new Date(ms + 2 * 3600000).toISOString().slice(11, 16); }

// ─── Market hours (XM gold, server time) ────────────────────────────────────
// XM's daily break is about 23:55–01:05 server time (sources differ by a few
// minutes), so 23:50–01:10 is treated as closed. Weekly: Friday 23:50 to
// Monday 01:10. Replaces the fixed Friday 21:00 / Sunday 22:00 UTC rule,
// which was only right while New York was on summer time.
const V1_BREAK_START = 23 * 60 + 50, V1_BREAK_END = 70;
function v1MarketState(ms) {
    const s = v1ServerParts(ms);
    if (s.wd === 6 || s.wd === 0) return { open: false, reason: 'weekend', s };
    if (s.wd === 1 && s.mod < V1_BREAK_END) return { open: false, reason: 'weekend', s };
    if (s.wd === 5 && s.mod >= V1_BREAK_START) return { open: false, reason: 'weekend', s };
    if (s.mod >= V1_BREAK_START || s.mod < V1_BREAK_END) return { open: false, reason: 'daily_break', s };
    return { open: true, reason: null, s };
}
// Why new entries are not allowed right now (null = allowed). Spreads blow
// out around the daily break and the weekly open, and a trade opened in the
// last hour before the weekend has no time to work before it is closed.
function v1EntryTimeBlock(ms) {
    const st = v1MarketState(ms);
    if (!st.open) return st.reason === 'weekend' ? 'market closed for the weekend' : 'XM daily break';
    const s = st.s;
    if (s.mod >= V1_BREAK_START - 15 || s.mod < V1_BREAK_END + 15) return 'within 15 min of XM\'s daily break';
    if (s.wd === 1 && s.mod < V1_BREAK_END + 60) return 'first hour after the weekly open';
    if (s.wd === 5 && s.mod >= V1_BREAK_START - 60) return 'last hour before the weekend close';
    return null;
}
// Close everything shortly before the daily break: avoids the break's spread
// spike, the overnight swap (0.08–0.27R a night at M15 stops) and, on
// Fridays, the weekend gap.
function v1FlattenDue(ms) { const st = v1MarketState(ms); return st.open && st.s.mod >= V1_BREAK_START - 15; }

// ─── News: a pure risk rule ─────────────────────────────────────────────────
// No new entries from 10 min before to 20 min after high-impact US releases
// (30 min while the spread is still elevated), and none from 13:45 to 15:30
// ET on FOMC days. The old code read FOMC/CPI as "bearish" and payrolls as
// "bullish", which has no basis; that no longer touches the score. If the
// calendar can't be fetched, 08:25–08:50 ET on weekdays is blocked instead.
const V1_CAL_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
let _v1Cal = { events: [], fetchedAt: 0, lastOkAt: 0, error: null };
async function v1RefreshCalendar(force) {
    const now = Date.now();
    if (!force && now - _v1Cal.fetchedAt < (_v1Cal.lastOkAt ? 60 : 15) * 60000) return _v1Cal;
    _v1Cal.fetchedAt = now;
    try {
        const res = await fetchWithTimeout(V1_CAL_URL, {}, 10000);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const arr = await res.json();
        if (!Array.isArray(arr)) throw new Error('unexpected calendar format');
        _v1Cal.events = arr.filter(e => e && e.impact === 'High' && (e.country === 'USD' || e.country === 'XAU') && e.date)
            .map(e => ({ title: String(e.title || e.name || 'US release').slice(0, 60), ts: new Date(e.date).getTime() }))
            .filter(e => Number.isFinite(e.ts));
        _v1Cal.lastOkAt = now; _v1Cal.error = null;
    } catch (e) {
        _v1Cal.error = e.message;
        logger.warn('[v1-news] calendar fetch failed: ' + e.message);
    }
    return _v1Cal;
}
function v1CalendarOk(ms) { return !!_v1Cal.lastOkAt && Math.abs(ms - _v1Cal.lastOkAt) < 12 * 3600000; }
function v1NewsState(ms, spreadElevated) {
    const out = { blocked: false, reason: null, preRelease: false, fallback: false, until: null, key: null };
    if (v1CalendarOk(ms)) {
        const ny = v1NyParts(ms);
        for (const e of _v1Cal.events) {
            const after = (spreadElevated ? 30 : 20) * 60000;
            if (ms >= e.ts - 10 * 60000 && ms <= e.ts + after && !out.blocked) {
                out.blocked = true; out.until = e.ts + after; out.key = e.title + '@' + e.ts;
                out.reason = 'news: ' + e.title + ' at ' + v1SastTime(e.ts) + ' SAST';
            }
            if (ms >= e.ts - 5 * 60000 && ms < e.ts) out.preRelease = true;
            if (!out.blocked && /FOMC|Federal Funds Rate/i.test(e.title) && v1NyParts(e.ts).dateKey === ny.dateKey && ny.mod >= 13 * 60 + 45 && ny.mod < 15 * 60 + 30) {
                out.blocked = true; out.key = 'FOMC@' + ny.dateKey; out.until = ms + (15 * 60 + 30 - ny.mod) * 60000;
                out.reason = 'FOMC day (13:45–15:30 New York time)';
            }
        }
    } else {
        const ny = v1NyParts(ms);
        out.fallback = true;
        if (ny.wd >= 1 && ny.wd <= 5 && ny.mod >= 8 * 60 + 25 && ny.mod < 8 * 60 + 50) {
            out.blocked = true; out.key = 'fallback@' + ny.dateKey; out.until = ms + (8 * 60 + 50 - ny.mod) * 60000;
            out.reason = 'US data window 08:25–08:50 New York time (news calendar unavailable)';
        }
        if (ny.wd >= 1 && ny.wd <= 5 && ny.mod >= 8 * 60 + 25 && ny.mod < 8 * 60 + 30) out.preRelease = true;
    }
    return out;
}

// ─── Spread: usual level per server hour of the week ────────────────────────
function v1SpreadKey(ms) { const s = v1ServerParts(ms); return s.wd + '-' + s.h; }
function v1UsualSpread(ms) {
    const st = (global._botState && global._botState._v1Spread) || {}, b = st[v1SpreadKey(ms)];
    return b && b.n >= 10 ? b.ema : null;
}
function v1NoteSpread(ms, spread) {
    if (!(spread > 0)) return;
    const st = Object.assign({}, (global._botState && global._botState._v1Spread) || {}), k = v1SpreadKey(ms), b = Object.assign({ ema: spread, n: 0 }, st[k]);
    b.ema = b.n === 0 ? spread : b.ema + (Math.min(spread, b.ema * 5) - b.ema) * 0.05;
    b.ema = Math.round(b.ema * 10000) / 10000; b.n = Math.min(b.n + 1, 100000);
    st[k] = b;
    updateBotState({ _v1Spread: st });
}

// ─── Price-data sanity ──────────────────────────────────────────────────────
// Trading on stale or scrambled candles is how the reversed-candle bug went
// unnoticed for months. Entries wait until the data looks right again.
function v1DataCheck(m15, quote, atr, ms, staleMin) {
    if (!Array.isArray(m15) || m15.length < 20) return 'not enough M15 candles';
    for (let i = Math.max(1, m15.length - 60); i < m15.length; i++) {
        const a = new Date(m15[i - 1].time).getTime(), b = new Date(m15[i].time).getTime();
        if (!(b > a)) return 'M15 candles out of order or duplicated';
    }
    const last = m15[m15.length - 1], age = (ms - new Date(last.time).getTime()) / 60000;
    if (!(age <= (staleMin || 30))) return 'newest M15 candle is ' + Math.round(age) + ' min old';
    if (quote && quote.bid > 0 && quote.ask > 0) {
        const mid = (+quote.bid + +quote.ask) / 2, tol = Math.max(2 * (atr || 0), 5);
        if (Math.abs(last.close - mid) > tol) return 'M15 close ' + (+last.close).toFixed(2) + ' is ' + Math.abs(last.close - mid).toFixed(2) + ' from the live price ' + mid.toFixed(2);
    }
    return null;
}

// ─── Sizing in the account currency ─────────────────────────────────────────
// The old sizing divided a balance in the ACCOUNT currency by a stop valued
// in US dollars (slDist × contract size), so on a rand account every lot
// estimate was ~18× too big and only the 0.05-lot ceiling held it back.
// MetaAPI's price response carries lossTickValue — the value of one tick on
// one lot, in the account currency — which is the right unit. If it's
// missing on a non-USD account, the trade is refused rather than guessed.
function v1PositionSize(o) {
    const step = o.volumeStep > 0 ? o.volumeStep : 0.01, minV = Math.max(o.minVolume > 0 ? o.minVolume : 0.01, step);
    let perUnit = null, method = null; // account-currency value of a 1.00 price move on 1 lot
    if (o.lossTickValue > 0 && o.tickSize > 0) { perUnit = o.lossTickValue / o.tickSize; method = 'tick value'; }
    else if (/^USD$/i.test(String(o.accountCurrency || '')) && o.contractSize > 0) { perUnit = o.contractSize; method = 'USD contract size'; }
    if (!(perUnit > 0)) return { lots: 0, reason: 'cannot value the stop in the account currency (no tick value from the broker)' };
    if (!(o.balance > 0) || !(o.slDist > 0) || !(o.riskPct > 0)) return { lots: 0, reason: 'missing balance, stop or risk setting' };
    const riskPerLot = o.slDist * perUnit, target = o.balance * o.riskPct / 100;
    let lots = Math.floor(target / riskPerLot / step + 1e-9) * step;
    if (o.maxVolume > 0) lots = Math.min(lots, Math.floor(o.maxVolume / step + 1e-9) * step);
    lots = parseFloat(lots.toFixed(2));
    if (lots < minV - 1e-9) {
        const atMin = minV * riskPerLot, mult = o.minLotRiskMult > 0 ? o.minLotRiskMult : 2;
        if (atMin > target * mult + 1e-9) return { lots: 0, reason: 'the minimum lot would risk ' + (atMin / o.balance * 100).toFixed(2) + '% of the balance (cap ' + (o.riskPct * mult).toFixed(2) + '%)', riskPerLot, perUnit };
        lots = parseFloat(minV.toFixed(2));
    }
    const riskAmount = lots * riskPerLot;
    return { lots, riskAmount, riskPerLot, perUnit, riskPctActual: riskAmount / o.balance * 100, targetAmount: target, method };
}
// Money currently at risk on open positions (stop on the losing side of entry).
function v1OpenRisk(positions, perUnit) {
    let total = 0;
    for (const p of positions || []) {
        const entry = parseFloat(p.openPrice) || 0, sl = parseFloat(p.stopLoss) || 0, vol = parseFloat(p.volume) || 0, isBuy = String(p.type || '').indexOf('BUY') !== -1;
        if (!entry || !vol) continue;
        if (!sl) { total += vol * perUnit * entry * 0.02; continue; } // no stop: count a 2% move
        const dist = isBuy ? entry - sl : sl - entry;
        if (dist > 0) total += dist * vol * perUnit;
    }
    return total;
}

// ─── Results: R per trade, daily stop, drift alarm ──────────────────────────
function v1TradeR(t) { return t && t.riskAmount > 0 && typeof t.pnl === 'number' && Number.isFinite(t.pnl) ? t.pnl / t.riskAmount : null; }
function v1DailyR() { const s = global._botState || {}, today = sastDateStr(new Date()); return s._v1Daily && s._v1Daily.date === today ? s._v1Daily.r : 0; }
// Lower one-sided CUSUM against break-even: S = max(0, S − k − r). With
// k=0.2 and h=10 it stays quiet for ~400 trades at break-even but fires after
// ~80 trades averaging −0.2R, or ~50 at −0.3R. It only alerts — it changes
// nothing by itself.
function v1OnTradeClosed(t) {
    try {
        const r = v1TradeR(t);
        if (r === null) return;
        t.r = Math.round(r * 1000) / 1000;
        const s = global._botState || {}, today = sastDateStr(new Date()), set = v1Settings();
        const daily = (s._v1Daily && s._v1Daily.date === today) ? Object.assign({}, s._v1Daily) : { date: today, r: 0, n: 0 };
        daily.r = Math.round((daily.r + r) * 1000) / 1000; daily.n = (daily.n || 0) + 1;
        const cs = Object.assign({ s: 0, n: 0, alarmedAt: null, sumR: 0 }, s._v1Cusum || {});
        cs.s = Math.round(Math.max(0, cs.s - set.cusumK - r) * 1000) / 1000; cs.n += 1; cs.sumR = Math.round(((cs.sumR || 0) + r) * 1000) / 1000;
        let alarm = false;
        if (cs.s >= set.cusumH && !cs.alarmedAt) { cs.alarmedAt = new Date().toISOString(); alarm = true; }
        updateBotState({ _v1Daily: daily, _v1Cusum: cs });
        if (daily.r <= -set.dailyStopR && s._v1DailyStopNotified !== today) {
            updateBotState({ _v1DailyStopNotified: today });
            sendTelegram('🛑 *Daily stop reached* (' + daily.r.toFixed(2) + 'R today) — no new trades until tomorrow (SAST). Open trades are still managed.');
        }
        if (alarm) sendTelegram('⚠️ *Drift alarm* — v1 results are running clearly below break-even (' + cs.sumR.toFixed(1) + 'R over ' + cs.n + ' trades, CUSUM ' + cs.s.toFixed(1) + '/' + set.cusumH + '). Nothing was changed automatically; consider /pause or demo and review /tradelist.');
    } catch (e) { logger.warn('[v1] result tracking failed: ' + e.message); }
}

// ─── Heartbeat for an outside dead-man alert ────────────────────────────────
// The STUCK watchdog in server.js runs inside the same process, so it is
// silent when Render stops or crashes the bot. Set HEARTBEAT_URL to a
// Healthchecks.io (or similar) ping URL; the bot pings it after every good
// cycle (at most every 2 min) and the outside service alerts when pings stop.
let _v1LastBeat = 0;
function v1Heartbeat(result) {
    try {
        const url = v1Settings().heartbeatUrl;
        if (!url || !/^https?:\/\//i.test(url)) return;
        const st = result && result.status;
        if (!st || st === 'error' || st === 'skipped_overlap') return;
        const now = Date.now();
        if (now - _v1LastBeat < 120000) return;
        _v1LastBeat = now;
        fetchWithTimeout(url, {}, 8000).catch(() => {});
    } catch (e) { /* never let monitoring break a cycle */ }
}

function v1NoteBlock(reason, analysis) {
    try {
        const s = global._botState || {}, today = sastDateStr(new Date());
        const sameDay = s._v1BlockCounts && s._v1BlockCounts.date === today;
        const counts = sameDay ? Object.assign({}, s._v1BlockCounts) : { date: today };
        const k = String(reason).replace(/[-+]?\d+(\.\d+)?/g, '#').replace(/\(.*$/, '').replace(/:.*$/, '').trim().slice(0, 40) || 'other';
        counts[k] = (counts[k] || 0) + 1;
        const upd = { _v1LastBlock: { reason: String(reason).slice(0, 160), at: new Date().toISOString(), signal: analysis && analysis.signal, score: analysis && analysis.score }, _v1BlockCounts: counts };
        if (!sameDay && s._v1BlockCounts) upd._v1BlockCountsPrev = s._v1BlockCounts;
        updateBotState(upd);
    } catch (e) {}
}

// ─── Optional v1 entry filters (replay variants, both off by default) ───────
// V1_DAILY_TREND: only trade in the direction of the bot's own daily trend —
// detectTrend on the daily candles (EMA 8/21/50 order plus swing structure),
// the daily reading analyzeMacroTrend already scores with. A neutral daily
// trend blocks too, like the 4-hour rule in the quality check.
// V1_SWEEP_ATR (0 = off): only enter after a liquidity sweep in the trade's
// favour among the last 5 M15 candles — a wick at least N× the 15-minute ATR
// past an earlier M15 swing low (buys) or swing high (sells) that closed back
// inside. The bot's own sweep checks count any poke and only add score.
// Both come from the variant list in tools/replay/RULES.md ("a one-day trend
// filter", "deeper liquidity sweeps"). Added 2026-10-24.
// RESULT (2020-2024 screens, 2026-10-24): both failed — keep them off.
// Daily trend: 700 trades at −0.038R vs 1,554 at −0.044R for v1 over the
// same years (no real change; beats 79% of random entries). Sweep 0.25× ATR:
// 573 trades at −0.108R, beating only 32% of random entries (worse than
// random). See tools/replay/VARIANTS.md.
function v1SweepDepth(m15, atr, isBuy) {
    if (!Array.isArray(m15) || m15.length < 12 || !(atr > 0)) return 0;
    const sw = indicators.detectSwings(m15, { windowSize: SWING_CONFIG.windowSize, minMovePct: SWING_CONFIG.minMovePct, maxSwings: SWING_CONFIG.maxSwings, atr });
    const levels = (isBuy ? sw.lows : sw.highs) || [];
    let best = 0;
    for (let k = Math.max(0, m15.length - 5); k < m15.length; k++) {
        const c = m15[k];
        for (const lv of levels) {
            if (!lv || !(lv.idx < k)) continue;
            const d = isBuy ? (c.low < lv.price && c.close > lv.price ? lv.price - c.low : 0)
                : (c.high > lv.price && c.close < lv.price ? c.high - lv.price : 0);
            if (d / atr > best) best = d / atr;
        }
    }
    return best;
}
// v1 option V1_SETUP_TF=1h (default 15m): find the setup — fair value gap,
// order block, structure shift, sweep — on the 1-hour chart and size the stop
// and targets from the 1-hour ATR, instead of the 15-minute chart. The trend
// check moves up one level with it, as ICT's top-down order has it: the
// quality gate's bias comes from the daily chart (4-hour if daily candles are
// short), and the top-down alignment reads daily / 4-hour / 1-hour. A 1-hour
// ATR is about twice a 15-minute one, so the spread becomes about half as
// big a share of the stop (the 2015-2024 replay: costs were a median 8% of
// the stop, more than the entries' edge over random entries). The live data
// checks and open-trade management still use the 15-minute feed. Added
// 2026-10-24 as replay variant "setup-1h"; off unless set.
// RESULT (2020-2024 screen, 2026-10-24): failed — keep it off. 1,328 trades
// at −0.056R vs 1,554 at −0.044R for 15-minute setups over the same years,
// and the 1-hour entries beat exactly half of the random-entry runs (no
// better than chance). Stops did not get bigger: on the 1-hour chart the bot
// chose its 0.9× ATR "normal" trade type for 864 of 1,328 trades (a third
// on 15 minutes, where most were 1.8× ATR "sniper"), so the median stop
// stayed about $4 and costs about 8% of it. See tools/replay/VARIANTS.md.
function v1AnalysisFrames(set, f) {
    if (!set || set.setupTf !== '1h') return { m5: f.m5, m15: f.m15, m30: f.m30, h1: f.h1, h4: f.h4, atr: f.atr14, tf: '15m' };
    return { m5: f.m15, m15: f.h1, m30: f.h1, h1: f.h4, h4: Array.isArray(f.d1) && f.d1.length >= 20 ? f.d1 : f.h4, atr: indicators.calcATR14(f.h1), tf: '1h' };
}
// Wider stops and targets for 1-hour setups: the fixed dollar ceilings in
// validateStopLoss / validateTakeProfit were set for 15-minute stops.
function v1PriceCapMult() { try { const s = v1Settings(); return s.frozen && s.setupTf === '1h' ? 2 : 1; } catch (e) { return 1; } }
let _v1LastEntryBar = 0;   // 1-hour setups: at most one new trade per 1-hour candle
function v1EntryFilters(set, analysis, m15, atr) {
    const isBuy = analysis.signal === 'buy';
    if (set.dailyTrend) {
        const mt = analysis.macroTrend, d = mt && mt.daily && mt.daily.direction;
        if (d !== (isBuy ? 'bullish' : 'bearish')) return 'against the daily trend (' + (d || 'unknown') + ')';
        analysis.hits.push('📅 Daily trend ' + d);
    }
    if (set.sweepAtr > 0) {
        const depth = v1SweepDepth(m15, atr, isBuy);
        if (depth < set.sweepAtr) return 'no liquidity sweep of ' + set.sweepAtr + '× ATR (deepest ' + depth.toFixed(2) + ')';
        analysis.hits.push('🌊 Liquidity sweep ' + depth.toFixed(2) + '× ATR');
    }
    return null;
}

// ─── Trend mode (V1_STRATEGY=trend, off by default) ─────────────────────────
// A classic breakout trend-follower in place of the ICT score, added
// 2026-10-24 after seven ICT variants showed no edge in the 2015-2024 replay
// (tools/replay/VARIANTS.md). Fixed rules, chosen before any test:
//   • Trend: the last completed 4-hour close is above (buys) / below (sells)
//     the average of the last 200 completed 4-hour closes (about 7 weeks).
//   • Entry: that close breaks the highest high (buys) / lowest low (sells)
//     of the 20 completed 4-hour candles before it. One trade per breakout
//     candle, one trend trade open at a time.
//   • Stop: 2× the 20-candle 4-hour ATR from entry. No profit target.
//   • Exit: the stop trails at the lowest low (buys) / highest high (sells)
//     of the last 10 completed 4-hour candles, only ever tightening.
//   • Held overnight and over weekends, so it pays XM's swap every night.
//     None of v1's intraday exits (TP1 lot, breakeven, ladder, time limit,
//     daily flatten) apply; sizing, the cost check and the entry gate are v1's.
// RESULT (2015-2024 replay, 2026-10-24): failed — keep it off. 437 trades,
// −8.1R in total (−0.019R a trade after spread and the replay's estimated
// swap), 33% winners. Profitable in the strong-trend years (2016 +10.3R,
// 2019 +8.9R, 2020 +12.1R), losing in the choppy ones (2018 −10.5R, 2021
// −8.6R, 2022 −14.5R, 2023 −6.8R): 5 of 10 years positive. Also note that
// at ~$4,100 gold a 2× 4-hour-ATR stop on the minimum 0.01 lot risks about
// 1% of a R90k balance, so the min-lot guard would refuse many entries.
const TREND = { entryBars: 20, exitBars: 10, smaBars: 200, atrBars: 20, stopAtr: 2, barMs: 4 * 3600000, fetch: 260 };
function v1TrendBars(h4, now) {
    return (Array.isArray(h4) ? h4 : []).filter(c => c && c.time != null && new Date(c.time).getTime() + TREND.barMs <= now);
}
function v1TrendSignal(h4, now) {
    const c = v1TrendBars(h4, now);
    if (c.length < TREND.smaBars + 1) return { dir: null, why: 'only ' + c.length + ' completed 4-hour candles (needs ' + (TREND.smaBars + 1) + ')' };
    const last = c[c.length - 1], prior = c.slice(-TREND.entryBars - 1, -1);
    const hh = Math.max(...prior.map(x => +x.high)), ll = Math.min(...prior.map(x => +x.low));
    const sma = c.slice(-TREND.smaBars).reduce((s, x) => s + +x.close, 0) / TREND.smaBars;
    let tr = 0;
    for (let i = c.length - TREND.atrBars; i < c.length; i++) { const b = c[i], pc = +c[i - 1].close; tr += Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)); }
    const atr = tr / TREND.atrBars, close = +last.close, up = close > sma;
    const dir = up && close > hh ? 'buy' : !up && close < ll ? 'sell' : null;
    return { dir, barTime: new Date(last.time).toISOString(), close, hh, ll, sma, atr,
        why: dir ? null : up ? 'uptrend; waiting for a 4-hour close above ' + hh.toFixed(2) : 'downtrend; waiting for a 4-hour close below ' + ll.toFixed(2) };
}
// Where an open trend trade's stop should be: the 10-candle 4-hour low/high.
function v1TrendTrail(h4, isBuy, now) {
    const c = v1TrendBars(h4, now);
    if (c.length < TREND.exitBars) return 0;
    const w = c.slice(-TREND.exitBars);
    return isBuy ? Math.min(...w.map(x => +x.low)) : Math.max(...w.map(x => +x.high));
}
async function v1TrendPlace(cfg, V1, sig, o) {
    const dir = sig.dir, isBuy = dir === 'buy';
    const spec = await getBrokerSymbolSpec(cfg);
    let sym = cfg.symbol;
    try { sym = (await resolveSymbol(cfg)) || cfg.symbol; } catch (e) { /* keep configured */ }
    let pd;
    try { pd = await maGet(cfg, '/symbols/' + encodeURIComponent(sym) + '/current-price', false); } catch (e) { return { ok: false, error: 'no live price (' + String(e.message).slice(0, 80) + ')' }; }
    const bid = parseFloat(pd && pd.bid), ask = parseFloat(pd && pd.ask);
    if (!(bid > 0 && ask > 0)) return { ok: false, error: 'no live price' };
    const entry = isBuy ? ask : bid;
    let sl = isBuy ? entry - TREND.stopAtr * sig.atr : entry + TREND.stopAtr * sig.atr;
    sl = parseFloat(validateStopLoss(cfg, entry, sl, dir, spec, true, sig.atr).toFixed(2));
    const slD = Math.abs(entry - sl), acct = global._v1Account || {};
    const size = v1PositionSize({ balance: o.balance, riskPct: V1.riskCapPct, slDist: slD, lossTickValue: parseFloat(pd.lossTickValue) || 0, tickSize: spec.tickSize, contractSize: spec.contractSize, accountCurrency: acct.currency, minVolume: spec.minVolume, maxVolume: Math.min(spec.maxVolume || 100, V1.maxLots), volumeStep: spec.volumeStep, minLotRiskMult: V1.minLotRiskMult });
    if (!(size.lots > 0)) return { ok: false, blocked: true, error: size.reason };
    const spr = Math.max(0, ask - bid), frac = (spr + V1.slippage) / slD;
    if (frac > V1.costMaxFrac + 1e-9) return { ok: false, blocked: true, error: 'costs ' + (frac * 100).toFixed(1) + '% of the stop' };
    const openRisk = v1OpenRisk(o.ourPositions || [], size.perUnit);
    if (openRisk + size.riskAmount > V1.openRiskCap * size.targetAmount + 1e-9) return { ok: false, blocked: true, error: 'open risk would be ' + ((openRisk + size.riskAmount) / size.targetAmount).toFixed(2) + '× one trade (cap ' + V1.openRiskCap + '×)' };
    let order;
    try { order = await maPost(cfg, '/trade', { symbol: sym, actionType: isBuy ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL', volume: size.lots, stopLoss: sl, comment: makeComment(cfg.symbol, 0, 'trend', 0.5) }); }
    catch (e) { return { ok: false, error: 'order failed: ' + String(e.message).slice(0, 120) }; }
    const id = normalizePositionId(order && (order.positionId || order.orderId)) || getTradeId(order);
    if (!id) return { ok: false, error: 'order sent but no position id came back' };
    savePositionState(id, { _v1: true, _trend: true, _initialRisk: slD, _riskAmount: size.riskAmount, _tradeRisk: size.riskAmount, _decisionPrice: entry, _entryPrice: entry, _sl: sl, _atr: sig.atr, _spreadAtEntry: spr, _strategyVersion: STRATEGY_VERSION + '-trend', _trendBar: sig.barTime });
    const why = '📈 4-hour close ' + sig.close.toFixed(2) + (isBuy ? ' above the 20-candle high ' + sig.hh.toFixed(2) : ' below the 20-candle low ' + sig.ll.toFixed(2)) + ', ' + (isBuy ? 'above' : 'below') + ' the 200-candle average ' + sig.sma.toFixed(2);
    const a = { signal: dir, score: 0, hits: [why], session: getSessionContext(), tradeDuration: 'trend', entryType: 'trend' };
    journalTrade(id, a, entry, sl, 0, size.lots, 0, 0, 0, ['Trend'], { strategyVersion: STRATEGY_VERSION + '-trend', strategy: 'trend', riskAmount: Math.round(size.riskAmount * 100) / 100, riskPct: Math.round(size.riskPctActual * 1000) / 1000, costFrac: Math.round(frac * 10000) / 10000, spreadAtEntry: spr, decisionPrice: entry, currency: acct.currency || null, finalTp: 0 });
    trackOpenPosition(id);
    const C = acct.currency ? acct.currency + ' ' : '';
    const sw = spec.swapLong != null || spec.swapShort != null ? '\nOvernight swap at XM: ' + (isBuy ? spec.swapLong : spec.swapShort) + ' a night per lot (' + String(spec.swapMode || '').replace('SWAP_MODE_', '').toLowerCase() + ')' : '';
    sendTelegram(['📈 *TREND TRADE* — ' + dir.toUpperCase() + ' ' + size.lots + ' lot', '',
        'Entry: ' + entry.toFixed(2) + ' | Stop: ' + sl.toFixed(2) + ' (2× the 4-hour ATR, ' + slD.toFixed(2) + ' away)',
        'Exit: the stop trails at the 10-candle 4-hour ' + (isBuy ? 'low' : 'high') + ' — no target, held overnight until the stop is hit',
        'Risk: ' + C + size.riskAmount.toFixed(2) + ' (' + size.riskPctActual.toFixed(2) + '%)', why].join('\n') + sw);
    return { ok: true, lots: size.lots, id };
}
// Trend mode's whole entry step; the ICT analysis isn't run at all.
async function v1TrendCycle(cfg, V1, o) {
    const now = Date.now(), sig = v1TrendSignal(global._v1TrendH4, now);
    global._v1TrendLast = Object.assign({ at: now }, sig);
    const open = (o.ourPositions || []).filter(p => (loadPositionState(p.id) || {})._trend);
    if (open.length) return { status: 'trend_holding', message: 'Trend trade open — its stop trails at the 10-candle 4-hour ' + (open[0].type === 'POSITION_TYPE_BUY' ? 'low' : 'high') };
    if (!sig.dir) return { status: 'no_signal', message: 'Trend: ' + sig.why };
    if ((global._botState || {})._v1TrendLastBar === sig.barTime) return { status: 'no_signal', message: 'Trend: already traded this breakout candle' };
    const gate = v1EntryGate(V1, { now, m15: o.m15, atr: o.atr14, quote: o.spread, positions: o.ourPositions, usualSpread: cfg._v1UsualSpread });
    if (gate) { v1NoteBlock(gate, { signal: sig.dir, score: 0 }); return { status: 'v1_blocked', message: 'Not placed: ' + gate }; }
    const r = await v1TrendPlace(cfg, V1, sig, o);
    if (!r.ok) {
        v1NoteBlock(r.error, { signal: sig.dir, score: 0 });
        // a refusal (size, cost, open risk) won't change within the candle: one try per breakout
        if (r.blocked) updateBotState({ _v1TrendLastBar: sig.barTime });
        return { status: r.blocked ? 'v1_blocked' : 'trade_failed', message: 'Not placed: ' + r.error };
    }
    updateBotState({ _v1TrendLastBar: sig.barTime, lastTradeTime: Date.now() });
    return { status: 'trade_placed', message: 'TREND ' + sig.dir.toUpperCase() + ' ' + r.lots + ' lot' };
}

// ─── EA mode (V1_STRATEGY=ea, off by default) ───────────────────────────────
// Trades from formulas, the way an MT5 Expert Advisor works. The strategy
// file src/ea/strategies/<V1_EA>.json names its indicators and writes its
// entry, stop, target, trailing-stop and exit rules as equations (see
// src/ea/index.js). The same file is what the replay tests and what
// tools/ea/export.js turns into an .mq5 Expert Advisor, so all three read the
// same rules. Rules are checked once per finished candle of the strategy's
// timeframe; the ICT score isn't used. v1's sizing, cost check and entry gate
// apply. Exits are the strategy's own (stop, target, trail, exit rule, time
// limit, breakeven) plus v1's close before XM's daily break unless the
// strategy holds overnight; none of v1's TP1 lot, ladder or 8-hour limit.
// Added 2026-10-30.
const EA = require('./src/ea');
function v1EaStrategy(V1) { return V1 && V1.eaId ? EA.get(V1.eaId) : null; }
// A strategy's finished candles and indicator series, recomputed only when a
// new candle has finished.
function v1EaContext(S, now) {
    const raw = (global._v1EaCandles || {})[S.id];
    if (!Array.isArray(raw) || !raw.length) return null;
    const bars = S.completed(raw, now);
    if (!bars.length) return null;
    const key = String(bars[bars.length - 1].time) + ':' + bars.length + ':' + bars[bars.length - 1].close;
    const cache = global._v1EaCtx = global._v1EaCtx || {};
    if (cache[S.id] && cache[S.id].key === key) return cache[S.id];
    return (cache[S.id] = { key, ctx: S.prepare(bars), k: bars.length - 1, bars });
}
// Strategy ids needed this cycle: the chosen one and any with a trade open.
function v1EaIdsInUse(V1, positions) {
    const ids = new Set();
    if (V1 && V1.strategy === 'ea' && V1.eaId) ids.add(V1.eaId);
    for (const p of positions || []) { const ps = loadPositionState(p.id) || {}; if (ps._ea) ids.add(ps._ea); }
    return [...ids];
}
async function v1EaPlace(cfg, V1, S, c, sig, o) {
    const dir = sig.dir, isBuy = dir === 'buy';
    const spec = await getBrokerSymbolSpec(cfg);
    let sym = cfg.symbol;
    try { sym = (await resolveSymbol(cfg)) || cfg.symbol; } catch (e) { /* keep configured */ }
    let pd;
    try { pd = await maGet(cfg, '/symbols/' + encodeURIComponent(sym) + '/current-price', false); } catch (e) { return { ok: false, error: 'no live price (' + String(e.message).slice(0, 80) + ')' }; }
    const bid = parseFloat(pd && pd.bid), ask = parseFloat(pd && pd.ask);
    if (!(bid > 0 && ask > 0)) return { ok: false, error: 'no live price' };
    const entry = isBuy ? ask : bid, spr = Math.max(0, ask - bid);
    const lv = S.levels(c.ctx, c.k, dir, entry, { spread: spr });
    if (!lv.ok) return { ok: false, blocked: true, error: lv.why };
    // The strategy's own stop and target, used as they are: never moved to
    // fit a ceiling. Too close for the broker = no trade.
    const minDist = Math.max((spec && spec.stopsLevelPrice) || 0, (spec && spec.freezeLevelPrice) || 0, ((spec && spec.tickSize) || 0.01) * 3, 0.5);
    const sl = parseFloat(lv.stop.toFixed(2)), tp = lv.target ? parseFloat(lv.target.toFixed(2)) : 0;
    if (Math.abs(entry - sl) < minDist) return { ok: false, blocked: true, error: 'stop only ' + Math.abs(entry - sl).toFixed(2) + ' from entry (broker minimum ' + minDist.toFixed(2) + ')' };
    if (tp && Math.abs(tp - entry) < minDist) return { ok: false, blocked: true, error: 'target only ' + Math.abs(tp - entry).toFixed(2) + ' from entry (broker minimum ' + minDist.toFixed(2) + ')' };
    const slD = Math.abs(entry - sl), acct = global._v1Account || {};
    const size = v1PositionSize({ balance: o.balance, riskPct: V1.riskCapPct, slDist: slD, lossTickValue: parseFloat(pd.lossTickValue) || 0, tickSize: spec.tickSize, contractSize: spec.contractSize, accountCurrency: acct.currency, minVolume: spec.minVolume, maxVolume: Math.min(spec.maxVolume || 100, V1.maxLots), volumeStep: spec.volumeStep, minLotRiskMult: V1.minLotRiskMult });
    if (!(size.lots > 0)) return { ok: false, blocked: true, error: size.reason };
    const frac = (spr + V1.slippage) / slD;
    if (frac > V1.costMaxFrac + 1e-9) return { ok: false, blocked: true, error: 'costs ' + (frac * 100).toFixed(1) + '% of the stop' };
    const openRisk = v1OpenRisk(o.ourPositions || [], size.perUnit);
    if (openRisk + size.riskAmount > V1.openRiskCap * size.targetAmount + 1e-9) return { ok: false, blocked: true, error: 'open risk would be ' + ((openRisk + size.riskAmount) / size.targetAmount).toFixed(2) + '× one trade (cap ' + V1.openRiskCap + '×)' };
    const body = { symbol: sym, actionType: isBuy ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL', volume: size.lots, stopLoss: sl, comment: makeComment(cfg.symbol, 0, 'ea', 0.5) };
    if (tp) body.takeProfit = tp;
    let order;
    try { order = await maPost(cfg, '/trade', body); }
    catch (e) { return { ok: false, error: 'order failed: ' + String(e.message).slice(0, 120) }; }
    const id = normalizePositionId(order && (order.positionId || order.orderId)) || getTradeId(order);
    if (!id) return { ok: false, error: 'order sent but no position id came back' };
    const tag = STRATEGY_VERSION + '-ea-' + S.id;
    savePositionState(id, { _v1: true, _ea: S.id, _initialRisk: slD, _riskAmount: size.riskAmount, _tradeRisk: size.riskAmount, _decisionPrice: entry, _entryPrice: entry, _sl: sl, _eaTp: tp, _spreadAtEntry: spr, _strategyVersion: tag, _eaBar: sig.barTime });
    const vals = sig.values || {}, valText = Object.keys(vals).map(k => k + ' ' + vals[k]).join(', ');
    const a = { signal: dir, score: 0, hits: ['🤖 ' + S.name + ': ' + sig.why, 'Values on the last ' + S.timeframe + ' candle: ' + valText], session: getSessionContext(), tradeDuration: 'ea', entryType: 'ea' };
    journalTrade(id, a, entry, sl, tp, size.lots, 0, 0, 0, ['EA ' + S.id], { strategyVersion: tag, strategy: 'ea', eaId: S.id, riskAmount: Math.round(size.riskAmount * 100) / 100, riskPct: Math.round(size.riskPctActual * 1000) / 1000, costFrac: Math.round(frac * 10000) / 10000, spreadAtEntry: spr, decisionPrice: entry, currency: acct.currency || null, finalTp: tp });
    trackOpenPosition(id);
    const C = acct.currency ? acct.currency + ' ' : '', R = S.sides[dir];
    sendTelegram(['🤖 *EA TRADE* — ' + S.name + ' — ' + dir.toUpperCase() + ' ' + size.lots + ' lot', '',
        'Entry: ' + entry.toFixed(2) + ' | Stop: ' + sl.toFixed(2) + ' (' + slD.toFixed(2) + ' away)' + (tp ? ' | Target: ' + tp.toFixed(2) + ' (' + (Math.abs(tp - entry) / slD).toFixed(2) + 'R)' : ' | no target'),
        'Rule: ' + R.when.text, 'Stop rule: ' + R.stop.text + (R.target ? ' · target rule: ' + R.target.text : '') + (R.trail ? ' · trails at ' + R.trail.text : '') + (R.exit ? ' · exits when ' + R.exit.text : ''),
        'Values: ' + valText, 'Risk: ' + C + size.riskAmount.toFixed(2) + ' (' + size.riskPctActual.toFixed(2) + '%)'].join('\n'));
    return { ok: true, lots: size.lots, id };
}
// EA mode's whole entry step; the ICT analysis isn't run at all.
async function v1EaCycle(cfg, V1, o) {
    const now = Date.now(), S = v1EaStrategy(V1);
    if (!S) {
        const all = EA.loadAll(), why = V1.eaId ? (Object.keys(all.errors).length ? 'strategy "' + V1.eaId + '" not loaded (' + Object.entries(all.errors).map(([f, e]) => f + ': ' + e).join('; ').slice(0, 200) + ')' : 'no strategy called "' + V1.eaId + '" (have: ' + EA.list().map(x => x.id).join(', ') + ')') : 'no strategy chosen: set V1_EA to one of ' + EA.list().map(x => x.id).join(', ');
        global._v1EaLast = { at: now, why };
        return { status: 'no_signal', message: 'EA: ' + why };
    }
    const c = v1EaContext(S, now);
    if (!c) { global._v1EaLast = { at: now, id: S.id, why: 'no ' + S.timeframe + ' candles yet' }; return { status: 'no_signal', message: 'EA: no ' + S.timeframe + ' candles yet' }; }
    const sig = S.signal(c.ctx, c.k, { spread: o.spread && o.spread.spread > 0 ? +o.spread.spread : 0 });
    global._v1EaLast = Object.assign({ at: now, id: S.id }, sig);
    const open = (o.ourPositions || []).filter(p => (loadPositionState(p.id) || {})._ea === S.id && !v1IsLegA(p));
    if (open.length >= S.options.maxOpen) return { status: 'ea_holding', message: 'EA ' + S.id + ': ' + open.length + ' trade(s) open (max ' + S.options.maxOpen + ')' };
    if (!sig.dir) return { status: 'no_signal', message: 'EA ' + S.id + ': ' + sig.why };
    // One decision per finished candle, like an EA that acts on a new bar.
    const st = global._botState || {};
    if ((st._v1EaLastBar || {})[S.id] === sig.barTime) return { status: 'no_signal', message: 'EA ' + S.id + ': already acted on this candle' };
    const markBar = () => updateBotState({ _v1EaLastBar: Object.assign({}, st._v1EaLastBar || {}, { [S.id]: sig.barTime }) });
    const gate = v1EntryGate(V1, { now, m15: o.m15, atr: o.atr14, quote: o.spread, positions: o.ourPositions, usualSpread: cfg._v1UsualSpread });
    if (gate) { v1NoteBlock(gate, { signal: sig.dir, score: 0 }); return { status: 'v1_blocked', message: 'Not placed: ' + gate }; }
    const r = await v1EaPlace(cfg, V1, S, c, sig, o);
    if (!r.ok) {
        v1NoteBlock(r.error, { signal: sig.dir, score: 0 });
        // a refusal (stop, size, cost, open risk) won't change within the candle
        if (r.blocked) markBar();
        return { status: r.blocked ? 'v1_blocked' : 'trade_failed', message: 'Not placed: ' + r.error };
    }
    markBar();
    updateBotState({ lastTradeTime: Date.now() });
    return { status: 'trade_placed', message: 'EA ' + S.id + ' ' + sig.dir.toUpperCase() + ' ' + r.lots + ' lot' };
}

// ─── ICT 2022 model (V1_STRATEGY=ict2022, off by default) ──────────────────
// The setup ICT teaches in his free 2022 Mentorship on YouTube, as exact
// rules (tools/replay/RULES.md, written 30 Oct 2026 before any run):
//   • Raid: a killzone candle (New York clock: London 02:00–05:00, New York
//     07:00–10:00) trades through untouched liquidity: the previous trading
//     day's high/low, the Asian range (20:00–00:00) high/low and, in New
//     York, the London killzone's high/low.
//   • Shift: within 12 candles of the raid's extreme, a candle closes beyond
//     the last 3-candle swing before that extreme, and the move from the
//     extreme leaves a fair value gap (displacement).
//   • Entry: a limit order at the near edge of the latest untouched gap in
//     that move (at market if price is already inside it). Stop: beyond the
//     extreme by the spread. One small lot at 1R (v1's TP1 lot, breakeven,
//     ladder), the rest at 2R. An unfilled order goes after 12 candles.
//   • One setup per killzone, one ICT trade or order at a time. v1's sizing,
//     cost check, entry gate and exits apply; the ICT score isn't used.
//     5- or 15-minute candles (V1_ICT_TF). Added 2026-10-30.
const ICT = {
    // minutes since the trading day began (17:00 New York, XM's midnight)
    kzs: [{ key: 'london', label: 'London', from: 540, to: 720, confirmBy: 780 },
          { key: 'ny', label: 'New York', from: 840, to: 1020, confirmBy: 1080 }],
    asia: [180, 420], london: [540, 720],
    mssBars: 12, swingBack: 24, orderBars: 12, tp1R: 1, finalR: 2,
};
function ictTfMin(V1) { return V1 && V1.ictTf === '15m' ? 15 : 5; }
// Minutes since the trading day began and that day's key (the New York date
// the day ends on: 17:00 New York + 7h = midnight).
function ictDayParts(ms) {
    const p = v1NyParts(ms), e = v1NyParts(ms + 7 * 3600000);
    return { tdm: ((p.h - 17 + 24) % 24) * 60 + p.mi, day: e.y * 10000 + e.mo * 100 + e.d };
}
// The last 3-candle swing before the extreme at index e: for a sell, a low
// lower than the lows on both sides of it (mirror for a buy). Falls back to
// the extreme of the 6 candles before e.
function ictSwing(c, e, isSell) {
    for (let s = e - 1; s >= Math.max(1, e - ICT.swingBack); s--) {
        if (isSell ? (c[s].l < c[s - 1].l && c[s].l < c[s + 1].l) : (c[s].h > c[s - 1].h && c[s].h > c[s + 1].h)) return isSell ? c[s].l : c[s].h;
    }
    const w = c.slice(Math.max(0, e - 6), e);
    if (!w.length) return isSell ? c[e].l : c[e].h;
    return isSell ? Math.min(...w.map(x => x.l)) : Math.max(...w.map(x => x.h));
}
// The latest fair value gap in candles e..k that no later candle (up to k)
// has traded back into. Sell: first candle's low above the third's high; the
// near edge (where a pullback arrives first) is the third candle's high.
function ictGap(c, e, k, isSell) {
    for (let j = k; j >= e + 2; j--) {
        const a = c[j - 2], b = c[j];
        const gap = isSell ? (a.l > b.h ? { near: b.h, far: a.l } : null) : (a.h < b.l ? { near: b.l, far: a.h } : null);
        if (!gap) continue;
        let touched = false;
        for (let m = j + 1; m <= k; m++) if (isSell ? c[m].h >= gap.near : c[m].l <= gap.near) { touched = true; break; }
        if (!touched) return Object.assign(gap, { j, t: b.t });
    }
    return null;
}
// One side of the killzone: raids of highs lead to sells, raids of lows to buys.
function ictScanSide(c, k0, kz, levels, isSell) {
    const side = levels.filter(L => L.side === (isSell ? 'high' : 'low'));
    const spent = new Set(side.filter(L => L.spent));
    const day = c[k0].day, beyond = (a, b) => isSell ? a > b : a < b;
    let act = null, why = side.length ? 'no raid yet' : 'no ' + (isSell ? 'highs' : 'lows') + ' to raid';
    for (let k = k0; k < c.length; k++) {
        const x = c[k];
        if (x.day !== day || x.tdm >= kz.confirmBy) break;
        if (x.tdm < kz.to) for (const L of side) {
            if (spent.has(L) || !beyond(isSell ? x.h : x.l, L.price)) continue;
            spent.add(L);
            if (!act) act = { level: L, ext: isSell ? x.h : x.l, e: k, raidK: k };
            else if (beyond(L.price, act.level.price)) act.level = L;
        }
        if (!act) continue;
        const xe = isSell ? x.h : x.l;
        if (k > act.e && beyond(xe, act.ext)) { act.ext = xe; act.e = k; }
        const raid = 'raided the ' + act.level.name + ' (' + act.level.price.toFixed(2) + ')';
        if (k === act.e) { why = raid + ', waiting for a shift'; continue; }
        if (k - act.e > ICT.mssBars) { why = raid + ' but no shift within ' + ICT.mssBars + ' candles'; act = null; continue; }
        const ref = ictSwing(c, act.e, isSell);
        let shifted = false;
        for (let m = act.e + 1; m <= k; m++) if (isSell ? c[m].c < ref : c[m].c > ref) { shifted = true; break; }
        if (!shifted) { why = raid + ', waiting for a close ' + (isSell ? 'below ' : 'above ') + ref.toFixed(2); continue; }
        const g = ictGap(c, act.e, k, isSell);
        if (!g) { why = raid + ' and shifted, waiting for a fair value gap'; continue; }
        return { setup: { k, level: act.level, ext: act.ext, extK: act.e, raidK: act.raidK, ref, gap: g } };
    }
    return { why };
}
// The current killzone's setup, on completed candles only. Pure: the same
// candles and time always give the same answer, so a restart can't change it.
function ictScan(candles, nowMs, tfMin) {
    const span = (tfMin || 5) * 60000, c = [];
    for (const x of Array.isArray(candles) ? candles : []) {
        const t = x && x.time != null ? new Date(x.time).getTime() : NaN, h = x ? +x.high : NaN, l = x ? +x.low : NaN;
        if (!Number.isFinite(t) || t + span > nowMs || !(h >= l) || !(l > 0)) continue;
        const dp = ictDayParts(t);
        c.push({ t, o: +x.open, h, l, c: +x.close, day: dp.day, tdm: dp.tdm });
    }
    c.sort((a, b) => a.t - b.t);
    const now = ictDayParts(nowMs);
    let kz = null;
    for (const k of ICT.kzs) if (now.tdm >= k.from) kz = k;
    if (!kz) return { why: 'waiting for the London killzone (02:00 New York)' };
    const kzKey = now.day + '-' + kz.key;
    if (c.length < 30) return { kzKey, why: 'only ' + c.length + ' completed candles' };
    const hi = a => Math.max(...a.map(x => x.h)), lo = a => Math.min(...a.map(x => x.l));
    const days = [];
    for (const x of c) if (days.indexOf(x.day) === -1) days.push(x.day);
    days.sort((a, b) => a - b);
    const today = c.filter(x => x.day === now.day), levels = [];
    const prevDay = days.filter(d => d < now.day).pop();
    if (prevDay !== undefined && days[0] < prevDay) {   // only a complete previous day
        const pd = c.filter(x => x.day === prevDay);
        levels.push({ name: 'previous day high', side: 'high', price: hi(pd), from: 0 }, { name: 'previous day low', side: 'low', price: lo(pd), from: 0 });
    }
    const asia = today.filter(x => x.tdm >= ICT.asia[0] && x.tdm < ICT.asia[1]);
    if (asia.length) levels.push({ name: 'Asian high', side: 'high', price: hi(asia), from: ICT.asia[1] }, { name: 'Asian low', side: 'low', price: lo(asia), from: ICT.asia[1] });
    if (kz.key === 'ny') {
        const lon = today.filter(x => x.tdm >= ICT.london[0] && x.tdm < ICT.london[1]);
        if (lon.length) levels.push({ name: 'London high', side: 'high', price: hi(lon), from: ICT.london[1] }, { name: 'London low', side: 'low', price: lo(lon), from: ICT.london[1] });
    }
    if (!levels.length) return { kzKey, why: 'no liquidity levels for the ' + kz.label + ' killzone' };
    for (const L of levels) L.spent = today.some(x => x.tdm >= L.from && x.tdm < kz.from && (L.side === 'high' ? x.h > L.price : x.l < L.price));
    const k0 = c.findIndex(x => x.day === now.day && x.tdm >= kz.from);
    if (k0 < 0) return { kzKey, levels, why: 'no completed ' + kz.label + ' killzone candle yet' };
    const sell = ictScanSide(c, k0, kz, levels, true), buy = ictScanSide(c, k0, kz, levels, false);
    const s = [sell.setup, buy.setup].filter(Boolean).sort((a, b) => a.k - b.k)[0];
    if (!s) return { kzKey, levels, why: kz.label + ' killzone — sells: ' + sell.why + '; buys: ' + buy.why };
    const isSell = s === sell.setup, confirmAt = c[s.k].t + span;
    // What happened after the setup completed (the bot may see it late).
    let touched = false, through = false, stopped = false;
    for (let m = s.k + 1; m < c.length; m++) {
        const x = c[m];
        if (isSell ? x.h >= s.gap.near : x.l <= s.gap.near) touched = true;
        if (isSell ? x.h > s.gap.far : x.l < s.gap.far) through = true;
        if (isSell ? x.h >= s.ext : x.l <= s.ext) stopped = true;
    }
    return { kzKey, levels, setup: {
        dir: isSell ? 'sell' : 'buy', kzKey, kz: kz.label, level: s.level.name, levelPrice: s.level.price, ext: s.ext, ref: s.ref,
        entry: s.gap.near, far: s.gap.far, raidTime: c[s.raidK].t, extTime: c[s.extK].t, gapTime: s.gap.t,
        confirmAt, expiresAt: confirmAt + ICT.orderBars * span, touched, through, stopped } };
}
// Journal an ICT trade once its order has filled (the journal only holds
// trades that happened; an unfilled order never appears in it).
function ictJournal(rec, fillPrice, fillTime) {
    // fillPrice known (a filled limit order): recorded now; unknown (a market
    // order): v1's management records the fill on its next pass.
    const model = rec.strategy || 'ict2022';
    const acct = global._v1Account || {}, a = { signal: rec.dir, score: 0, hits: (rec.hits || []).slice(), session: getSessionContext(), tradeDuration: 'normal', entryType: model };
    const extra = { strategyVersion: STRATEGY_VERSION + '-' + model, strategy: model, riskAmount: Math.round(rec.riskAmount * 100) / 100, riskPct: Math.round(rec.riskPct * 1000) / 1000,
        costFrac: Math.round(rec.costFrac * 10000) / 10000, spreadAtEntry: rec.spread, decisionPrice: rec.limit, currency: acct.currency || null, finalTp: rec.finalTp };
    if (fillPrice > 0) { extra.fillPrice = fillPrice; extra.slippage = Math.round((rec.dir === 'buy' ? fillPrice - rec.limit : rec.limit - fillPrice) * 100) / 100; }
    const ft = fillTime ? new Date(fillTime) : null;
    if (ft && Number.isFinite(ft.getTime())) { extra.ts = ft.toISOString(); extra.sessionHour = ft.getUTCHours(); extra.dayOfWeek = ft.getUTCDay(); }
    journalTrade(rec.orderId, a, rec.limit, rec.sl, rec.finalTp, rec.lots, rec.tp1, 0, 0, [model === 'ict2022' ? 'ICT2022' : model.toUpperCase()], extra);
    if (fillPrice > 0) savePositionState(rec.orderId, { _fillRec: true });
    updateBotState({ lastTradeTime: Date.now() });
}
// Every cycle, before positions are managed: has the waiting limit order
// filled, or should it go? Runs while an order waits, even if the mode was
// switched off (then the order is cancelled).
async function v1IctSync(cfg, V1, positions, quote) {
    const p = (global._botState || {})._ictPending;
    if (!p || !p.orderId) return;
    const now = Date.now(), done = () => updateBotState({ _ictPending: null });
    const pos = (positions || []).find(x => normalizePositionId(x.id) === p.orderId);
    if (pos) {
        ictJournal(p, parseFloat(pos.openPrice) || p.limit, pos.time);
        done();
        sendTelegram('🎯 *ICT order filled* — ' + p.dir.toUpperCase() + ' ' + p.lots + ' lot at ' + (parseFloat(pos.openPrice) || p.limit).toFixed(2) + ' (trade #' + p.orderId + ')\nStop ' + p.sl.toFixed(2) + ' | TP1 ' + p.tp1.toFixed(2) + ' | final ' + p.finalTp.toFixed(2));
        return;
    }
    let orders;
    try { orders = await maGet(cfg, '/orders', false); } catch (e) { logger.warn('[ict] could not list pending orders: ' + e.message); return; }
    const ord = Array.isArray(orders) ? orders.find(x => normalizePositionId(x.id) === p.orderId) : null;
    if (ord) {
        const isBuy = p.dir === 'buy', px = quote && (isBuy ? +quote.ask : +quote.bid);
        let why = null;
        if (!V1 || V1.strategy !== (p.strategy || 'ict2022')) why = 'the ' + (ICT_NAME[p.strategy || 'ict2022']) + ' mode was switched off';
        else if (now >= p.expiresAt) why = (p.strategy === 'silverbullet' ? 'not filled by the window\'s end' : 'not filled within ' + (p.strategy === 'ote' ? OTE.orderBars : ICT.orderBars) + ' candles');
        else if (v1EntryTimeBlock(now)) why = v1EntryTimeBlock(now);
        else if (p.cancelBeyond > 0 && px > 0 && (isBuy ? px > p.cancelBeyond : px < p.cancelBeyond)) why = 'price went past the move\'s end (' + (+p.cancelBeyond).toFixed(2) + ') first';
        else if (px > 0 && (isBuy ? px >= p.finalTp : px <= p.finalTp)) why = 'price reached the target without a pullback';
        if (!why) return;
        try { await maPost(cfg, '/trade', { actionType: 'ORDER_CANCEL', orderId: p.orderId }); }
        catch (e) { logger.warn('[ict] cancel of order #' + p.orderId + ' failed: ' + e.message); return; }
        done();
        v1NoteBlock('ICT order cancelled: ' + why, { signal: p.dir, score: 0 });
        sendTelegram('🗑️ *ICT order cancelled* — ' + p.dir.toUpperCase() + ' limit at ' + p.limit.toFixed(2) + ': ' + why);
        return;
    }
    // Neither an open position nor a waiting order: it filled and has already
    // closed, or the broker cancelled it. Give MetaAPI a minute to catch up.
    if (now - p.placedAt < 60000) return;
    let deals = null;
    try { deals = await maGet(cfg, '/history-deals/position/' + encodeURIComponent(p.orderId), false); } catch (e) { logger.warn('[ict] deal history unavailable: ' + e.message); return; }
    const din = Array.isArray(deals) ? deals.find(d => /DEAL_ENTRY_IN/.test(String(d.entryType))) : null;
    if (din) {
        ictJournal(p, parseFloat(din.price) || p.limit, din.time);
        trackOpenPosition(p.orderId);   // reconcileClosedTrades records its result this cycle
    } else sendTelegram('ℹ️ ICT ' + p.dir + ' limit at ' + p.limit.toFixed(2) + ' is no longer at the broker and never filled');
    done();
}
async function v1IctPlace(cfg, V1, s, o) {
    const dir = s.dir, isBuy = dir === 'buy', spec = await getBrokerSymbolSpec(cfg), sc = getSymConfig(cfg.symbol);
    let sym = cfg.symbol;
    try { sym = (await resolveSymbol(cfg)) || cfg.symbol; } catch (e) { /* keep configured */ }
    let pd;
    try { pd = await maGet(cfg, '/symbols/' + encodeURIComponent(sym) + '/current-price', false); } catch (e) { return { ok: false, error: 'no live price (' + String(e.message).slice(0, 80) + ')' }; }
    const bid = parseFloat(pd && pd.bid), ask = parseFloat(pd && pd.ask);
    if (!(bid > 0 && ask > 0)) return { ok: false, error: 'no live price' };
    v1NoteBrokerTime(pd);
    const spr = Math.max(0, ask - bid), tick = spec.tickSize || 0.01;
    // Stop beyond the raid's extreme by the spread (a sell's stop is hit on the ask).
    let sl = isBuy ? s.ext - Math.max(spr, tick) : s.ext + Math.max(spr, tick);
    const px = isBuy ? ask : bid;
    let market = false, entry = s.entry;
    if (isBuy ? px <= s.entry : px >= s.entry) {
        // Already inside the gap: enter at market (at or better than the limit).
        if (isBuy ? px < s.far : px > s.far) return { ok: false, blocked: true, error: s.model === 'ote' ? 'price already went through the 79% level' : 'price already went through the fair value gap' };
        market = true; entry = px;
    }
    if (isBuy ? entry - sl <= tick : sl - entry <= tick) return { ok: false, blocked: true, error: 'price is already at the stop' };
    // The stop belongs beyond the raid: if the stop ceiling would pull it in, skip.
    const vsl = parseFloat(validateStopLoss(cfg, entry, sl, dir, spec, true, o.atr14).toFixed(2));
    if (isBuy ? vsl > sl + 0.005 : vsl < sl - 0.005) return { ok: false, blocked: true, error: 'the stop beyond the ' + (s.model === 'ote' ? 'move\'s start' : s.model === 'silverbullet' ? 'gap\'s first candle' : 'raid') + ' (' + Math.abs(entry - sl).toFixed(2) + ') is wider than the ceiling' };
    sl = vsl;
    const R = Math.abs(entry - sl), model = s.model || 'ict2022', name = ICT_NAME[model] || 'ICT';
    let tp1 = isBuy ? entry + ICT.tp1R * R : entry - ICT.tp1R * R, fin = isBuy ? entry + ICT.finalR * R : entry - ICT.finalR * R;
    if (model === 'ote') { tp1 = s.tp1Price; fin = s.finalPrice; }   // the old high/low, then the -27% extension
    else if (model === 'silverbullet') {
        fin = s.targetPrice;                                          // the liquidity level
        const room = Math.abs(fin - entry) / R;
        if (room < SB.minRoomR - 1e-9) return { ok: false, blocked: true, error: 'the ' + s.level + ' is only ' + room.toFixed(1) + 'R away with the spread (needs ' + SB.minRoomR + 'R)' };
    }
    if (isBuy ? !(tp1 > entry && fin >= tp1) : !(tp1 < entry && fin <= tp1)) return { ok: false, blocked: true, error: 'targets on the wrong side of the entry' };
    tp1 = parseFloat(validateTakeProfit(cfg, entry, tp1, sl, dir, spec, o.atr14).toFixed(2));
    fin = parseFloat(validateTakeProfit(cfg, entry, fin, sl, dir, spec, o.atr14).toFixed(2));
    entry = parseFloat(entry.toFixed(2));
    const acct = global._v1Account || {};
    const riskPct = Math.min(cfg._riskConfigured > 0 ? cfg._riskConfigured : V1.riskCapPct, V1.riskCapPct);
    const size = v1PositionSize({ balance: o.balance, riskPct, slDist: R, lossTickValue: parseFloat(pd.lossTickValue) || 0, tickSize: spec.tickSize, contractSize: spec.contractSize, accountCurrency: acct.currency, minVolume: spec.minVolume, maxVolume: Math.min(spec.maxVolume || 100, V1.maxLots), volumeStep: spec.volumeStep, minLotRiskMult: V1.minLotRiskMult });
    if (!(size.lots > 0)) return { ok: false, blocked: true, error: size.reason };
    const commPrice = V1.commissionPerLot > 0 && size.perUnit > 0 ? V1.commissionPerLot / size.perUnit : 0;
    const frac = (spr + V1.slippage + commPrice) / R;
    if (frac > V1.costMaxFrac + 1e-9) return { ok: false, blocked: true, error: 'costs ' + (frac * 100).toFixed(1) + '% of the stop (' + R.toFixed(2) + ')' };
    const openRisk = v1OpenRisk(o.ourPositions || [], size.perUnit);
    if (openRisk + size.riskAmount > V1.openRiskCap * size.targetAmount + 1e-9) return { ok: false, blocked: true, error: 'open risk would be ' + ((openRisk + size.riskAmount) / size.targetAmount).toFixed(2) + '× one trade (cap ' + V1.openRiskCap + '×)' };
    // v1's exits: one small lot at TP1 (1R), breakeven, the ladder, the rest at 2R.
    const step = spec.volumeStep || 0.01;
    const smallLot = parseFloat((Math.ceil(Math.max(spec.minVolume || 0.01, 0.01) / step - 1e-9) * step).toFixed(2));
    const runner = size.lots >= smallLot * 2 - 1e-9;
    const beBuf = getBeBuffer(o.atr14, sc.minSL, sc.limitSlip, spr);
    const ladder = v1ServerLadder({ isBuy, entry, risk: R, tp1, finalTp: fin, beBuf, atr: o.atr14, trailAtr: V1.trailAtr, tick, beTrigger: V1.beTrigger });
    const comment = makeComment(cfg.symbol, 0, 'ict', 0.5);
    const body = market
        ? { symbol: sym, actionType: isBuy ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL', volume: size.lots, stopLoss: sl, takeProfit: fin, comment }
        : { symbol: sym, actionType: isBuy ? 'ORDER_TYPE_BUY_LIMIT' : 'ORDER_TYPE_SELL_LIMIT', volume: size.lots, openPrice: entry, stopLoss: sl, takeProfit: fin, comment };
    let serverTrail = false, order;
    if (V1.serverTrail && ladder.length && !_v1ServerTrailRefused) { body.trailingStopLoss = { threshold: { thresholds: ladder, units: 'ABSOLUTE_PRICE' } }; serverTrail = true; }
    try { order = await maPost(cfg, '/trade', body); }
    catch (e) {
        // A definite refusal of the ladder: send the order again without it
        // (the bot then enforces the ladder itself, as for v1 trades).
        if (!serverTrail || !/→ 4\d\d|Broker rejected/.test(String(e.message))) return { ok: false, error: 'order failed: ' + String(e.message).slice(0, 140) };
        delete body.trailingStopLoss; serverTrail = false;
        try { order = await maPost(cfg, '/trade', body); } catch (e2) { return { ok: false, error: 'order failed: ' + String(e2.message).slice(0, 140) }; }
    }
    const id = normalizePositionId(order && (order.positionId || order.orderId));
    if (!id) return { ok: false, error: 'order sent but no id came back' };
    // Saved under the order's ticket, which becomes the position id in MT5.
    savePositionState(id, { _v1: true, _ict: true, _score: 0, _tp1: tp1, _tp2: 0, _tp3: 0, _finalTp: fin, _entryPrice: entry, _sl: sl, _atr: o.atr14,
        _tradeDuration: 'normal', _runner: runner, _partialLot: runner ? smallLot : 0, _ladder: ladder, _serverTrail: serverTrail, _initialRisk: R,
        _riskAmount: size.riskAmount, _tradeRisk: size.riskAmount, _decisionPrice: entry, _spreadAtEntry: spr, _strategyVersion: STRATEGY_VERSION + '-' + model });
    const gapTxt = Math.min(s.entry, s.far).toFixed(2) + '–' + Math.max(s.entry, s.far).toFixed(2);
    const hits = model === 'silverbullet'
        ? ['🎯 Silver Bullet: ' + s.kz + ', fair value gap ' + gapTxt, '🧲 Target: the untouched ' + s.level + ' (' + s.levelPrice.toFixed(2) + '), ' + s.room.toFixed(1) + 'R from the gap']
        : model === 'ote'
        ? ['🎯 OTE: 1-hour move ' + s.moveStart.toFixed(2) + ' → ' + s.moveEnd.toFixed(2) + ' broke the swing at ' + s.ref.toFixed(2), '📐 Entry at its 70.5% retracement, stop at its start, one lot at ' + s.moveEnd.toFixed(2) + ', the rest at the −27% extension']
        : ['🎯 ICT 2022: ' + s.kz + ' killzone raid of the ' + s.level + ' (' + s.levelPrice.toFixed(2) + '), extreme ' + s.ext.toFixed(2),
           '↩️ Shift: close ' + (isBuy ? 'above ' : 'below ') + s.ref.toFixed(2) + ', fair value gap ' + gapTxt];
    const rec = { orderId: id, dir, limit: entry, sl, tp1, finalTp: fin, lots: size.lots, riskAmount: size.riskAmount, riskPct: size.riskPctActual, costFrac: frac, spread: spr,
        placedAt: Date.now(), expiresAt: s.expiresAt, kzKey: s.kzKey, hits, market, strategy: model, cancelBeyond: s.cancelBeyond || null };
    const C = acct.currency ? acct.currency + ' ' : '';
    if (market) { ictJournal(rec, 0, null); trackOpenPosition(id); }
    else updateBotState({ _ictPending: rec });
    sendTelegram(['🎯 *' + name + ' ' + (market ? 'TRADE' : 'ORDER') + '* — ' + dir.toUpperCase() + ' ' + size.lots + ' lot ' + (market ? 'at market ' : 'limit at ') + entry.toFixed(2), '',
        'Stop: ' + sl.toFixed(2) + ' (' + R.toFixed(2) + ' away) | TP1 ' + tp1.toFixed(2) + ' (' + (Math.abs(tp1 - entry) / R).toFixed(1) + 'R, one small lot) | final ' + fin.toFixed(2) + ' (' + (Math.abs(fin - entry) / R).toFixed(1) + 'R)',
        'Risk: ' + C + size.riskAmount.toFixed(2) + ' (' + size.riskPctActual.toFixed(2) + '%)' + (market ? '' : ' · cancelled if not filled by ' + v1SastTime(s.expiresAt) + ' SAST')].concat(hits).join('\n'));
    return { ok: true, lots: size.lots, id, market };
}
// ICT 2022's whole entry step; the ICT score and analysis aren't run at all.
async function v1IctCycle(cfg, V1, o) {
    const now = Date.now(), st = global._botState || {}, tf = ictTfMin(V1), model = V1.strategy, name = ICT_NAME[model] || 'ICT';
    const scan = model === 'silverbullet' ? sbScan(global._v1IctCandles, now, 5) : model === 'ote' ? oteScan(global._v1IctCandles, now) : ictScan(global._v1IctCandles, now, tf);
    global._v1IctLast = { at: now, why: scan.why || null, setup: scan.setup || null };
    if ((o.ourPositions || []).some(p => (loadPositionState(p.id) || {})._ict)) return { status: 'ict_holding', message: 'ICT trade open' };
    if (st._ictPending) return { status: 'ict_pending', message: 'ICT ' + st._ictPending.dir + ' limit waiting at ' + (+st._ictPending.limit).toFixed(2) };
    const s = scan.setup;
    if (!s) return { status: 'no_signal', message: name + ': ' + scan.why };
    if (st._ictLastKz === s.kzKey) return { status: 'no_signal', message: name + ': this setup was already used' };
    let stale = now >= s.expiresAt ? 'expired before the bot saw it' : s.stopped ? 'price hit the stop level first' : s.through ? (model === 'ote' ? 'price went through the 79% level' : 'price went through the gap') : s.targetHit ? 'price reached the target first' : s.touched ? 'price pulled back to the entry before the order could be placed' : null;
    if (stale) { updateBotState({ _ictLastKz: s.kzKey }); v1NoteBlock(name + ' setup missed: ' + stale, { signal: s.dir, score: 0 }); return { status: 'v1_blocked', message: name + ' setup missed: ' + stale }; }
    const gate = v1EntryGate(V1, { now, m15: o.m15, atr: o.atr14, quote: o.spread, positions: o.ourPositions, usualSpread: cfg._v1UsualSpread });
    if (gate) { v1NoteBlock(gate, { signal: s.dir, score: 0 }); return { status: 'v1_blocked', message: 'Not placed: ' + gate }; }
    const r = await v1IctPlace(cfg, V1, s, o);
    if (!r.ok) {
        v1NoteBlock(r.error, { signal: s.dir, score: 0 });
        if (r.blocked) updateBotState({ _ictLastKz: s.kzKey });   // size/cost refusals use up the killzone
        return { status: r.blocked ? 'v1_blocked' : 'trade_failed', message: 'Not placed: ' + r.error };
    }
    updateBotState({ _ictLastKz: s.kzKey });
    return { status: r.market ? 'trade_placed' : 'order_placed', message: name + ' ' + s.dir.toUpperCase() + ' ' + r.lots + ' lot ' + (r.market ? 'at market' : 'limit at ' + s.entry.toFixed(2)) };
}

// ─── Silver Bullet and OTE (V1_STRATEGY=silverbullet / ote, off by default) ─
// Two more of ICT's own setups, as exact rules (tools/replay/RULES.md, written
// 30 Oct 2026 before any run). Both reuse the ICT 2022 model's order
// handling (v1IctPlace / v1IctSync): a limit order, v1's sizing, cost check,
// entry gate and exits. Only the setup and its targets differ.
const ICT_FAMILY = ['ict2022', 'silverbullet', 'ote'];
const isIctFamily = x => ICT_FAMILY.indexOf(x) !== -1;
const ICT_NAME = { ict2022: 'ICT 2022', silverbullet: 'Silver Bullet', ote: 'OTE' };
// Completed candles only, oldest first, with each one's trading-day clock.
function ictPrep(candles, nowMs, span) {
    const c = [];
    for (const x of Array.isArray(candles) ? candles : []) {
        const t = x && x.time != null ? new Date(x.time).getTime() : NaN, h = x ? +x.high : NaN, l = x ? +x.low : NaN;
        if (!Number.isFinite(t) || t + span > nowMs || !(h >= l) || !(l > 0)) continue;
        const dp = ictDayParts(t);
        c.push({ t, o: +x.open, h, l, c: +x.close, day: dp.day, tdm: dp.tdm });
    }
    return c.sort((a, b) => a.t - b.t);
}
// Silver Bullet: in a one-hour window (New York 03:00, 10:00, 14:00), the
// first fair value gap whose nearest untouched liquidity in its direction is
// at least 2R away. Stop beyond the gap's first candle; target that liquidity.
const SB = {
    // minutes since the trading day began (17:00 New York)
    windows: [{ key: 'sb03', label: '03:00', from: 600, to: 660 },
              { key: 'sb10', label: '10:00', from: 1020, to: 1080 },
              { key: 'sb14', label: '14:00', from: 1260, to: 1320 }],
    asia: [180, 420], london: [540, 720], nyAm: [840, 1140], minRoomR: 2,
};
function sbScan(candles, nowMs, tfMin) {
    const tf = tfMin || 5, span = tf * 60000, c = ictPrep(candles, nowMs, span), now = ictDayParts(nowMs);
    let w = null;
    for (const x of SB.windows) if (now.tdm >= x.from) w = x;
    if (!w) return { why: 'waiting for the 03:00 New York window' };
    const kzKey = now.day + '-' + w.key;
    if (c.length < 30) return { kzKey, why: 'only ' + c.length + ' completed candles' };
    const hi = a => Math.max(...a.map(x => x.h)), lo = a => Math.min(...a.map(x => x.l));
    const days = [];
    for (const x of c) if (days.indexOf(x.day) === -1) days.push(x.day);
    days.sort((a, b) => a - b);
    const today = c.filter(x => x.day === now.day), levels = [];
    const prevDay = days.filter(d => d < now.day).pop();
    if (prevDay !== undefined && days[0] < prevDay) {
        const pd = c.filter(x => x.day === prevDay);
        levels.push({ name: 'previous day high', side: 'high', price: hi(pd), from: 0 }, { name: 'previous day low', side: 'low', price: lo(pd), from: 0 });
    }
    const range = (r, name) => { const a = today.filter(x => x.tdm >= r[0] && x.tdm < r[1]); if (a.length) levels.push({ name: name + ' high', side: 'high', price: hi(a), from: r[1] }, { name: name + ' low', side: 'low', price: lo(a), from: r[1] }); };
    range(SB.asia, 'Asian');
    if (w.key !== 'sb03') range(SB.london, 'London');
    if (w.key === 'sb14') range(SB.nyAm, 'New York morning');
    if (!levels.length) return { kzKey, why: 'no liquidity levels for the ' + w.label + ' window' };
    let why = 'no fair value gap in the ' + w.label + ' window yet';
    for (let k = 2; k < c.length; k++) {
        const b = c[k], a = c[k - 2];
        if (b.day !== now.day || b.tdm < w.from || b.tdm + tf > w.to) continue;
        if (b.t - a.t !== 2 * span) continue;                       // three consecutive candles
        const isBuy = a.h < b.l, isSell = a.l > b.h;
        if (!isBuy && !isSell) continue;
        const near = isBuy ? b.l : b.h, far = isBuy ? a.h : a.l, ext = isBuy ? a.l : a.h, risk = Math.abs(near - ext);
        if (!(risk > 0)) continue;
        // untouched liquidity in the trade's direction, beyond the entry
        let tgt = null;
        for (const L of levels) {
            if (L.side !== (isBuy ? 'high' : 'low') || !(isBuy ? L.price > near : L.price < near)) continue;
            const spent = today.some(x => x.tdm >= L.from && x.t <= b.t && (isBuy ? x.h > L.price : x.l < L.price));
            if (spent) continue;
            if (!tgt || (isBuy ? L.price < tgt.price : L.price > tgt.price)) tgt = L;
        }
        if (!tgt) { why = (isBuy ? 'buy' : 'sell') + ' gap at ' + near.toFixed(2) + ' but no untouched liquidity ' + (isBuy ? 'above' : 'below'); continue; }
        const room = Math.abs(tgt.price - near) / risk;
        if (room < SB.minRoomR) { why = (isBuy ? 'buy' : 'sell') + ' gap at ' + near.toFixed(2) + ': the ' + tgt.name + ' is only ' + room.toFixed(1) + 'R away (needs ' + SB.minRoomR + 'R)'; continue; }
        const confirmAt = b.t + span, expiresAt = confirmAt + (w.to - (b.tdm + tf)) * 60000;
        let touched = false, through = false, stopped = false, targetHit = false;
        for (let m = k + 1; m < c.length; m++) {
            const x = c[m];
            if (isBuy ? x.l <= near : x.h >= near) touched = true;
            if (isBuy ? x.l < far : x.h > far) through = true;
            if (isBuy ? x.l <= ext : x.h >= ext) stopped = true;
            if (isBuy ? x.h >= tgt.price : x.l <= tgt.price) targetHit = true;
        }
        return { kzKey, levels, setup: {
            model: 'silverbullet', dir: isBuy ? 'buy' : 'sell', kzKey, kz: w.label + ' window', level: tgt.name, levelPrice: tgt.price, targetPrice: tgt.price, room,
            ext, entry: near, far, gapTime: b.t, confirmAt, expiresAt, touched, through, stopped, targetHit } };
    }
    return { kzKey, levels, why };
}
// OTE: after a move that broke structure, a limit at its 70.5% retracement.
// Stop at the move's start; one lot at its end (the old high/low), the rest at
// the -27% extension. 1-hour candles.
const OTE = { entry: 0.705, far: 0.79, ext: 0.27, minAtr: 2, atrN: 14, orderBars: 12, lookback: 72 };
function oteAtr(c, i, n) {
    if (i < n) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += Math.max(c[j].h - c[j].l, Math.abs(c[j].h - c[j - 1].c), Math.abs(c[j].l - c[j - 1].c));
    return s / n;
}
// One direction: the latest move whose turn has been confirmed.
function oteSide(c, isBuy) {
    const sh = i => i > 0 && i < c.length - 1 && c[i].h > c[i - 1].h && c[i].h > c[i + 1].h;
    const sl = i => i > 0 && i < c.length - 1 && c[i].l < c[i - 1].l && c[i].l < c[i + 1].l;
    const isStart = isBuy ? sl : sh, isRef = isBuy ? sh : sl, moves = [];
    let best = null;
    for (let l = c.length - 2; l >= Math.max(1, c.length - OTE.lookback); l--) {
        if (!isStart(l)) continue;
        const L = isBuy ? c[l].l : c[l].h;
        let s = -1;
        for (let i = l - 1; i >= 1; i--) if (isRef(i)) { s = i; break; }
        if (s < 0) continue;
        const ref = isBuy ? c[s].h : c[s].l;
        // the break: a close beyond the last swing before the start, before
        // price goes back beyond the start
        let b = -1;
        for (let m = l + 1; m < c.length; m++) {
            if (isBuy ? c[m].l < L : c[m].h > L) break;
            if (isBuy ? c[m].c > ref : c[m].c < ref) { b = m; break; }
        }
        if (b < 0) continue;
        // the move's end: its extreme, fixed once the next candle doesn't go further
        // (the first candle from the break on that doesn't make a new extreme)
        let hx = l, j = -1;
        for (let m = l + 1; m < c.length; m++) {
            if (isBuy ? c[m].l < L : c[m].h > L) break;
            if (isBuy ? c[m].h > c[hx].h : c[m].l < c[hx].l) { hx = m; continue; }
            if (m >= b) { j = m; break; }
        }
        if (j < 0) continue;
        const H = isBuy ? c[hx].h : c[hx].l, rng = Math.abs(H - L), atr = oteAtr(c, b, OTE.atrN);
        if (!(atr > 0) || rng < OTE.minAtr * atr) continue;
        const sg = isBuy ? 1 : -1, entry = H - sg * OTE.entry * rng, far = H - sg * OTE.far * rng;
        let touched = false, through = false, stopped = false, beyond = false;
        for (let m = j + 1; m < c.length; m++) {
            const x = c[m];
            if (isBuy ? x.h > H : x.l < H) beyond = true;
            if (isBuy ? x.l <= entry : x.h >= entry) touched = true;
            if (isBuy ? x.l < far : x.h > far) through = true;
            if (isBuy ? x.l <= L : x.h >= L) stopped = true;
        }
        best = { model: 'ote', dir: isBuy ? 'buy' : 'sell', kzKey: 'ote-' + (isBuy ? 'b' : 's') + '-' + c[l].t + '-' + c[hx].t, kz: '1-hour move',
            level: (isBuy ? 'swing low ' : 'swing high ') + L.toFixed(2) + ' → ' + H.toFixed(2), levelPrice: H, ref,
            moveStart: L, moveEnd: H, range: rng, atr, ext: L, entry, far, tp1Price: H, finalPrice: H + sg * OTE.ext * rng, cancelBeyond: H,
            startTime: c[l].t, endTime: c[hx].t, confirmAt: c[j].t + 3600000, touched, through, stopped, beyond };
        best.expiresAt = best.confirmAt + OTE.orderBars * 3600000;
        moves.push(best);
    }
    // The latest move; of several starts that end at the same extreme, the
    // furthest one (the whole move, not a dip inside it).
    moves.sort((a, b) => (b.endTime - a.endTime) || (b.range - a.range));
    return moves[0] || null;
}
function oteScan(candles, nowMs) {
    const c = ictPrep(candles, nowMs, 3600000);
    if (c.length < 40) return { why: 'only ' + c.length + ' completed 1-hour candles' };
    const s = [oteSide(c, true), oteSide(c, false)].filter(Boolean).sort((a, b) => b.confirmAt - a.confirmAt)[0];
    if (!s) return { why: 'no 1-hour move that broke structure and has turned' };
    if (s.beyond) return { kzKey: s.kzKey, why: 'the latest ' + s.dir + ' move went on past ' + s.moveEnd.toFixed(2) + ', waiting for it to turn' };
    return { kzKey: s.kzKey, setup: s };
}

// ─── Two-leg exits and the stop ladder ──────────────────────────────────────
// Leg A is the one small lot whose broker take-profit IS TP1 (comment ends
// in "|A"); it needs no management — the broker closes it at TP1 or at the
// stop. The rest of the trade is the "main" position, journaled under its
// own id, with leg A's result folded in as the TP1 partial.
function v1IsLegA(p) {
    if (!p) return false;
    if (p.comment && /\|A$/.test(String(p.comment))) return true;
    const ps = loadPositionState(p.id);
    return !!(ps && ps._isLegA);
}
// The exit ladder, as absolute prices: once price trades at TP1 the stop
// goes to breakeven (+ about 2 spreads); then at every further 0.5R of
// profit it steps up to trailAtr × ATR behind that level (never looser).
// The same list is sent to MetaAPI as a server-side threshold trailing stop
// ("run on the server ... regardless of your connection to the account",
// at most one change per 15 s) and enforced by the bot as a backup.
function v1ServerLadder(o) {
    const sgn = o.isBuy ? 1 : -1, r = o.risk, out = [], tick = o.tick > 0 ? o.tick : 0.01;
    if (!(r > 0) || !(o.tp1 > 0) || !(o.entry > 0)) return out;
    const rnd = x => parseFloat((Math.round(x / tick) * tick).toFixed(2));
    let first = o.tp1;
    if (o.beTrigger === '0.5r') { const half = o.entry + sgn * 0.5 * r; if (sgn * (half - first) < 0) first = half; }
    const be = rnd(o.entry + sgn * Math.max(o.beBuf || 0, tick));
    out.push({ threshold: rnd(first), stopLoss: be });
    const lag = Math.max((o.trailAtr > 0 ? o.trailAtr : 1) * (o.atr > 0 ? o.atr : r), 0.5 * r);
    const fin = o.finalTp > 0 ? o.finalTp : o.entry + sgn * 3 * r;
    let prev = be;
    for (let k = 1.5; out.length < 20 && k < 40; k += 0.5) {
        const th = o.entry + sgn * k * r;
        if (sgn * (th - fin) >= -1e-9) break;          // at/after the final TP the broker TP closes it
        if (sgn * (th - first) <= 1e-9) continue;
        const sl = rnd(th - sgn * lag);
        if (sgn * (sl - prev) <= 0.005) continue;       // each level must tighten
        out.push({ threshold: rnd(th), stopLoss: sl }); prev = sl;
    }
    return out;
}
// Stop the ladder calls for, given the best price reached so far.
function v1LadderStop(ladder, isBuy, best) {
    let sl = null;
    if (!(best > 0)) return sl;
    for (const l of ladder || []) {
        if (isBuy ? best >= l.threshold - 1e-9 : best <= l.threshold + 1e-9) sl = sl === null ? l.stopLoss : (isBuy ? Math.max(sl, l.stopLoss) : Math.min(sl, l.stopLoss));
    }
    return sl;
}
// Best executable price since the position opened: the live quote plus the
// M1 highs (buys) / lows + spread (sells) since then, so a level crossed
// between two 3-minute checks still counts — as it would for a broker-side
// stop. Saved with the position.
function v1UpdateBest(posId, posState, isBuy, curP, openTs, spread) {
    let best = typeof posState._best === 'number' ? posState._best : null;
    const cand = [curP], m1 = global._lastM1Candles || [], sp = spread > 0 ? spread : 0;
    for (let i = m1.length - 1; i >= 0; i--) {
        const c = m1[i], t = c && c.time ? new Date(c.time).getTime() : 0;
        if (!t || !openTs || t < openTs) break;
        cand.push(isBuy ? +c.high : +c.low + sp);
    }
    for (const v of cand) if (v > 0 && (best === null || (isBuy ? v > best : v < best))) best = v;
    if (best !== null && best !== posState._best) { posState._best = best; savePositionState(posId, { _best: best }); }
    return best;
}

// ─── Journal helpers for v1 ─────────────────────────────────────────────────
function journalUpdate(id, fields) {
    try {
        const j = loadJournal(), t = j.trades.find(x => x && x.id === normalizePositionId(id));
        if (!t) return;
        Object.assign(t, fields); saveJournal(j);
    } catch (e) { logger.warn('[journal] update failed: ' + e.message); }
}
// Leg A closed: its P&L belongs to the parent trade. If the parent is
// still open it waits in legPnl (journalClose adds it); if the parent closed
// first (possible with BE_TRIGGER=0.5r) it is folded into the closed result.
function journalLegClose(parentId, pnl) {
    try {
        if (typeof pnl !== 'number' || !Number.isFinite(pnl)) return;
        const j = loadJournal(), t = j.trades.find(x => x && x.id === normalizePositionId(parentId));
        if (!t || t.legAClosed) return;
        t.legAClosed = true; t.legPnl = Math.round(pnl * 100) / 100; t.partialClosed = true;
        if (pnl > 0) t.tp1Hit = true;
        if (t.outcome !== null && typeof t.pnl === 'number') {
            const oldR = typeof t.r === 'number' ? t.r : null;
            t.pnl = Math.round((t.pnl + pnl) * 100) / 100;
            if (t.outcome === 'win' || t.outcome === 'loss') t.outcome = t.pnl >= 0 ? 'win' : 'loss';
            if (t.riskAmount > 0) { t.r = Math.round(t.pnl / t.riskAmount * 1000) / 1000; if (oldR !== null) v1AdjustResults(t.r - oldR); }
        }
        saveJournal(j);
    } catch (e) { logger.warn('[journal] leg close failed: ' + e.message); }
}
// A late correction to a trade already counted (see journalLegClose).
function v1AdjustResults(deltaR) {
    try {
        if (!deltaR) return;
        const s = global._botState || {}, today = sastDateStr(new Date()), upd = {};
        if (s._v1Daily && s._v1Daily.date === today) upd._v1Daily = Object.assign({}, s._v1Daily, { r: Math.round((s._v1Daily.r + deltaR) * 1000) / 1000 });
        if (s._v1Cusum) upd._v1Cusum = Object.assign({}, s._v1Cusum, { s: Math.round(Math.max(0, s._v1Cusum.s - deltaR) * 1000) / 1000, sumR: Math.round(((s._v1Cusum.sumR || 0) + deltaR) * 1000) / 1000 });
        if (Object.keys(upd).length) updateBotState(upd);
    } catch (e) {}
}

// ─── Entry gate ─────────────────────────────────────────────────────────────
// Checked just before a v1 trade is placed; returns why not, or null. (The
// cost and open-risk checks need the stop and size, so they are in
// placeTrade.)
function v1EntryGate(V1, o) {
    const now = o.now || Date.now();
    let openLossR = 0;
    for (const p of o.positions || []) {
        const ps = loadPositionState(p.id) || {}, ra = ps._tradeRisk > 0 ? ps._tradeRisk : ps._riskAmount;
        const up = parseFloat(p.unrealizedProfit !== undefined ? p.unrealizedProfit : p.profit) || 0;
        if (ra > 0 && up < 0) openLossR += up / ra;
    }
    const dayR = v1DailyR() + openLossR;
    if (dayR <= -V1.dailyStopR) return 'daily stop: ' + dayR.toFixed(2) + 'R today incl. open losses (limit −' + V1.dailyStopR + 'R)';
    const tb = v1EntryTimeBlock(now);
    if (tb) return tb;
    if (!o.quote || !(o.quote.bid > 0) || !(o.quote.ask > 0)) return 'no live quote';
    const usual = o.usualSpread > 0 ? o.usualSpread : null, spr = +o.quote.spread || (+o.quote.ask - +o.quote.bid);
    if (V1.newsBlock) {
        const ns = v1NewsState(now, !!(usual && spr > usual * 1.5));
        if (ns.blocked) return ns.reason;
    }
    const dc = v1DataCheck(o.m15, o.quote, o.atr, now, V1.staleCandleMin);
    if (dc) return 'data check: ' + dc;
    if (usual && spr > usual * V1.spreadSpikeMult) return 'spread ' + spr.toFixed(2) + ' is ' + (spr / usual).toFixed(1) + '× its usual ' + usual.toFixed(2) + ' for this hour';
    return null;
}

// ─── Startup report and reminders ───────────────────────────────────────────
// Once per strategy version (and whenever the sizing verdict changes): what
// account this is, and whether 0.5% risk can actually be traded on it.
async function v1StartupReport(cfg) {
    try {
        if (!v1On()) return null;
        const V1 = v1Settings();
        cfg = cfg || getCfg();
        const acc = await getAccount(cfg), spec = await getBrokerSymbolSpec(cfg), sym = await resolveSymbol(cfg);
        const pd = await maGet(cfg, '/symbols/' + encodeURIComponent(sym) + '/current-price', false);
        v1NoteBrokerTime(pd);
        global._v1Account = Object.assign({}, global._v1Account || {}, { currency: acc.currency || null, balance: parseFloat(acc.balance || 0), marginMode: acc.marginMode || null, type: acc.type || null });
        const riskPct = Math.min(cfg.risk > 0 ? cfg.risk : V1.riskCapPct, V1.riskCapPct);
        const atr = (global._lastCandles && global._lastCandles.length > 20) ? indicators.calcATR14(global._lastCandles) : 4;
        const stop = Math.max(0.5, 0.9 * atr);
        const sz = v1PositionSize({ balance: parseFloat(acc.balance || 0), riskPct, slDist: stop, lossTickValue: pd && +pd.lossTickValue, tickSize: spec.tickSize, contractSize: spec.contractSize, accountCurrency: acc.currency, minVolume: spec.minVolume, maxVolume: Math.min(spec.maxVolume || 100, V1.maxLots), volumeStep: spec.volumeStep, minLotRiskMult: V1.minLotRiskMult });
        const cur = acc.currency || '', mode = String(acc.type || '').replace('ACCOUNT_TRADE_MODE_', '') || '?', hedging = /HEDGING/.test(String(acc.marginMode || ''));
        const spr = pd && pd.ask && pd.bid ? (+pd.ask - +pd.bid) : null;
        const verdict = sz.lots > 0 ? 'ok' : 'refused';
        const s = global._botState || {};
        const sig = STRATEGY_VERSION + '|' + verdict + '|' + mode;
        const lines = ['🧊 *Strategy ' + STRATEGY_VERSION + ' is active* (learning frozen)',
            'Account: ' + mode + (mode === 'REAL' ? ' ⚠️ real money' : '') + ' · ' + (hedging ? 'hedging' : 'netting/other') + ' · ' + cur + ' ' + parseFloat(acc.balance || 0).toFixed(2),
            'Risk per trade: ' + riskPct + '% = ' + cur + ' ' + (parseFloat(acc.balance || 0) * riskPct / 100).toFixed(2) + ' (sized from the broker\'s tick value)'];
        if (sz.lots > 0) lines.push('At a typical $' + stop.toFixed(2) + ' stop: ' + sz.lots + ' lot, risking ' + cur + ' ' + sz.riskAmount.toFixed(2) + ' (' + sz.riskPctActual.toFixed(2) + '%)');
        else lines.push('⚠️ At a typical $' + stop.toFixed(2) + ' stop, trades will be REFUSED: ' + sz.reason + '. Raise RISK_CAP_PCT or MIN_LOT_RISK_MULT only if you accept that risk — or use demo.');
        lines.push('TP1 lot: ' + (V1.twoLegs && hedging ? 'its own position, closed by the broker at TP1' : 'closed by the bot at TP1') + ' · stop ladder ' + (V1.serverTrail ? 'also held on MetaAPI\'s servers' : 'bot-only'));
        if (spr !== null) lines.push('Spread now: $' + spr.toFixed(2) + ' — trades are refused when spread + slippage exceeds ' + (V1.costMaxFrac * 100).toFixed(0) + '% of the stop');
        lines.push('/status shows the v1 details.');
        if (s._v1Announced !== sig) { updateBotState({ _v1Announced: sig }); sendTelegram(lines.join('\n')); }
        return { lines, sizing: sz, account: global._v1Account };
    } catch (e) { logger.warn('[v1] startup report failed: ' + e.message); return null; }
}
// MetaAPI tokens are JWTs; if the token carries an expiry, remind before it.
// DB_EXPIRES_AT / META_TOKEN_EXPIRES_AT (YYYY-MM-DD) cover the rest.
function v1TokenExpiry(token) {
    try {
        const p = String(token || '').split('.');
        if (p.length !== 3) return null;
        const o = JSON.parse(Buffer.from(p[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        return o && o.exp ? o.exp * 1000 : null;
    } catch (e) { return null; }
}
function v1CheckReminders(cfg) {
    try {
        const s = global._botState || {}, today = sastDateStr(new Date()), now = Date.now();
        if (s._v1ReminderDay === today) return;
        updateBotState({ _v1ReminderDay: today });
        const items = [], days = ms => Math.ceil((ms - now) / 86400000);
        const tok = v1TokenExpiry(cfg && cfg.token) || (process.env.META_TOKEN_EXPIRES_AT ? Date.parse(process.env.META_TOKEN_EXPIRES_AT) : null);
        if (tok && days(tok) <= 14) items.push('🔑 MetaAPI token expires ' + new Date(tok).toISOString().slice(0, 10) + ' (' + Math.max(0, days(tok)) + ' days). New one: app.metaapi.cloud/api-access/generate-token → META_TOKEN in Render.');
        const db = process.env.DB_EXPIRES_AT ? Date.parse(process.env.DB_EXPIRES_AT) : null;
        if (db && days(db) <= 14) items.push('🗄️ The free Render database stops working ' + new Date(db).toISOString().slice(0, 10) + ' (' + Math.max(0, days(db)) + ' days). Upgrade it in Render (Change instance type → Basic) or move it, then delete DB_EXPIRES_AT.');
        if (items.length) sendTelegram('⏰ *Reminder*\n' + items.join('\n'));
    } catch (e) { /* reminders are best-effort */ }
}

// Daily v1 summary (sent with the daily report): results in R — the one
// number that compares across account sizes — costs, slippage, what was
// refused, and the drift check.
async function v1DailySummary(trades) {
    // (trend and ICT 2022 trades are tagged STRATEGY_VERSION + '-trend' / '-ict2022')
    const v1t = (trades || []).filter(t => t && String(t.strategyVersion || '').indexOf(STRATEGY_VERSION) === 0 && t.outcome !== null && typeof t.r === 'number');
    const since = Date.now() - 24 * 3600000;
    const day = v1t.filter(t => new Date(t.closedTs || t.ts).getTime() >= since);
    const stats = arr => {
        const n = arr.length; if (!n) return null;
        const rs = arr.map(t => t.r), sum = rs.reduce((a, b) => a + b, 0), mean = sum / n;
        const sd = n > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : 0;
        return { n, sum, mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0, win: arr.filter(t => t.pnl > 0).length / n };
    };
    const med = a => { const b = a.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
    const d = stats(day), all = stats(v1t), s = global._botState || {}, cs = s._v1Cusum || {};
    const lines = ['🧊 *v1 results* (' + STRATEGY_VERSION + ')'];
    lines.push(d ? 'Last 24h: ' + d.n + ' trades · ' + (d.sum >= 0 ? '+' : '') + d.sum.toFixed(2) + 'R · avg ' + (d.mean >= 0 ? '+' : '') + d.mean.toFixed(2) + 'R · ' + (d.win * 100).toFixed(0) + '% winners' : 'Last 24h: no closed v1 trades');
    if (all) lines.push('Since v1 began: ' + all.n + ' trades · avg ' + (all.mean >= 0 ? '+' : '') + all.mean.toFixed(3) + 'R · t = ' + all.t.toFixed(2) + (all.n < 100 ? ' (far too few trades to judge yet)' : all.t >= 2 ? ' (evidence of an edge)' : ' (not significant yet)'));
    const recent = v1t.slice(-100), mc = med(recent.map(t => t.costFrac)), ms = med(recent.map(t => t.slippage));
    if (mc !== null) lines.push('Median cost: ' + (mc * 100).toFixed(1) + '% of the stop' + (ms !== null ? ' · median slippage $' + ms.toFixed(2) : ''));
    const bc = (s._v1BlockCounts && s._v1BlockCounts.date === sastDateStr(new Date(Date.now() - 6 * 3600000))) ? s._v1BlockCounts : s._v1BlockCountsPrev;
    if (bc) { const top = Object.keys(bc).filter(k => k !== 'date').sort((a, b) => bc[b] - bc[a]).slice(0, 4).map(k => k + ' ×' + bc[k]); if (top.length) lines.push('Refused entries (' + bc.date + '): ' + top.join(', ')); }
    lines.push('Drift check: ' + (cs.s || 0).toFixed(1) + '/' + v1Settings().cusumH + (cs.alarmedAt ? ' ⚠️ ALARM since ' + String(cs.alarmedAt).slice(0, 10) : ' — ok'));
    sendTelegram(lines.join('\n'));
}

// Lines for /status.
function getV1StatusText() {
    try {
        const set = v1Settings();
        if (!set.frozen) return '🧪 Strategy: pre-v1 behaviour (FREEZE_V1=false)';
        const s = global._botState || {}, cs = s._v1Cusum || { s: 0, n: 0, sumR: 0 }, now = Date.now();
        const acc = global._v1Account || {}, hedging = /HEDGING/.test(String(acc.marginMode || ''));
        const lines = [
            '🧊 Strategy ' + STRATEGY_VERSION + ' (frozen — learning off)' + (acc.type ? ' · ' + String(acc.type).replace('ACCOUNT_TRADE_MODE_', '') : ''),
            'Risk/trade: ' + set.riskCapPct + '% max, at most ' + set.maxLots + ' lots · today ' + v1DailyR().toFixed(2) + 'R (daily stop −' + set.dailyStopR + 'R)',
            'Exits: BE at ' + (set.beTrigger === '0.5r' ? '0.5R' : 'TP1') + ', then the stop steps up every 0.5R, ' + set.trailAtr + '× ATR behind · TP1 lot ' + (set.twoLegs && hedging ? 'held at the broker' : 'closed by the bot') + ' · all closed before the daily break' + (set.maxHoldHours > 0 ? ' / after ' + set.maxHoldHours + 'h' : '') + (set.minStopAtr > 0 ? ' · stops at least ' + set.minStopAtr + '× ATR' : ''),
            'Costs: spread + slippage must be ≤ ' + (set.costMaxFrac * 100).toFixed(0) + '% of the stop' + (v1UsualSpread(now) ? ' · usual spread now $' + v1UsualSpread(now).toFixed(2) : ''),
            'Drift check: ' + (cs.s || 0).toFixed(1) + '/' + set.cusumH + ' over ' + (cs.n || 0) + ' v1 trades (' + (cs.sumR || 0).toFixed(1) + 'R)' + (cs.alarmedAt ? ' ⚠️ ALARM' : ''),
        ];
        if (set.strategy === 'trend') { const tl = global._v1TrendLast; lines.push('📈 Strategy: trend-following — 4-hour breakouts with the 200-candle trend, stop 2× ATR trailing at the 10-candle low/high, held overnight' + (tl && tl.at ? ' · now: ' + (tl.dir ? tl.dir + ' signal' : tl.why) : '')); }
        if (set.strategy === 'ea') { const S = v1EaStrategy(set), el = global._v1EaLast; lines.push('🤖 Strategy: EA formulas — ' + (S ? S.name + ' (' + S.id + ', ' + S.timeframe + ' candles)' : 'no strategy loaded (V1_EA=' + (set.eaId || 'not set') + ')') + (el && el.at ? ' · now: ' + (el.dir ? el.dir + ' signal' : el.why) : '')); if (S) lines.push(S.describe()); }
        if (set.strategy === 'silverbullet' || set.strategy === 'ote') { const il = global._v1IctLast, pe = s._ictPending; lines.push('🎯 Strategy: ' + (set.strategy === 'ote' ? 'OTE on 1-hour candles — after a move that broke structure, a limit at its 70.5% pullback, stop at its start, one lot at its end, the rest at the −27% extension' : 'Silver Bullet on 5-minute candles — the first fair value gap in the 03:00 / 10:00 / 14:00 New York hours with untouched liquidity 2R+ away, stop beyond the gap, target that liquidity') + (pe ? ' · order waiting: ' + pe.dir + ' limit at ' + (+pe.limit).toFixed(2) : il && il.at ? ' · now: ' + (il.setup ? il.setup.dir + ' setup (' + il.setup.kz + ')' : il.why) : '')); }
        if (set.strategy === 'ict2022') { const il = global._v1IctLast, pe = s._ictPending; lines.push('🎯 Strategy: ICT 2022 model on ' + set.ictTf + ' candles — killzone raid of liquidity, shift with a fair value gap, limit entry in the gap, stop beyond the raid, 1R lot then 2R' + (pe ? ' · order waiting: ' + pe.dir + ' limit at ' + (+pe.limit).toFixed(2) : il && il.at ? ' · now: ' + (il.setup ? il.setup.dir + ' setup (' + il.setup.kz + ')' : il.why) : '')); }
        if (set.setupTf === '1h') lines.push('Setups: 1-hour chart (trend: daily / 4-hour / 1-hour), one new trade per 1-hour candle');
        if (set.dailyTrend || set.sweepAtr > 0) lines.push('Entry filters: ' + [set.dailyTrend ? 'daily trend must agree' : '', set.sweepAtr > 0 ? 'liquidity sweep of at least ' + set.sweepAtr + '× ATR' : ''].filter(Boolean).join(' · '));
        const bc = s._v1BlockCounts;
        if (bc && bc.date === sastDateStr(new Date())) {
            const top = Object.keys(bc).filter(k => k !== 'date').sort((a, b) => bc[b] - bc[a]).slice(0, 3).map(k => k + ' ×' + bc[k]);
            if (top.length) lines.push('Entries refused today: ' + top.join(', '));
        }
        const tb = v1EntryTimeBlock(now); if (tb) lines.push('⏸️ New entries paused: ' + tb);
        const ns = v1NewsState(now, false); if (set.newsBlock && ns.blocked) lines.push('⏸️ New entries paused: ' + ns.reason);
        if (set.newsBlock && !v1CalendarOk(now)) lines.push('📰 News calendar unavailable — blocking 08:25–08:50 New York time instead');
        if (s._v1LastBlock && s._v1LastBlock.at) lines.push('Last blocked entry: ' + s._v1LastBlock.reason + ' (' + v1SastTime(new Date(s._v1LastBlock.at).getTime()) + ' SAST)');
        const cp = s._candleProbe;
        if (cp && cp.ts) lines.push((cp.ok ? '📈 Price history: OK' : '🚫 Price history: FAILING (' + cp.error + ')') + ' at the last startup check, ' + v1SastTime(new Date(cp.ts).getTime()) + ' SAST');
        if (!set.heartbeatUrl) lines.push('💓 Heartbeat: not set (HEARTBEAT_URL)');
        return lines.join('\n');
    } catch (e) { return '🧊 Strategy ' + STRATEGY_VERSION; }
}

// ─── MAIN CYCLE INNER ────────────────────────────────────────────────────────
async function _runCycleInner() {
    let cfg = getCfg(), state = global._botState || {};
    _stampLastRun();
    // One-time reset of learning stats recorded before the candle-order fix
    // (no-op on every later cycle). See LEARNING EPOCH near loadJournal.
    try { ensureLearningEpoch(); } catch (e) { logger.warn('[learning-epoch] failed:', e.message); }
    _batchConfig = cfg;

    global.MIN_LOT_FOR_SPLIT = 0.03;
    if (global._botState && global._botState.botConfig) {
        global._botState.botConfig.minLotForSplit = 0.03;
    }
    // v1 (see the V1 section): this cycle's settings. The 1.5% risk floor
    // and everything below that rewrote cfg.risk / minScore each cycle is
    // skipped while v1 is on. 2026-10-24.
    const V1 = v1On() ? v1Settings() : null;
    cfg._v1 = V1;
    cfg._riskConfigured = cfg.risk;
    if (!V1) cfg.risk = Math.max(cfg.risk || 1.5, 1.5);

    // Enforce max 3 trades
    const MAX_POSITIONS = 3;
    cfg.maxT = MAX_POSITIONS;
    cfg.maxGlobalTrades = MAX_POSITIONS;

    let brokers = [{ token: cfg.token, accId: cfg.accId, region: cfg.region }].filter(b => b.token && b.accId);
    if (!cfg.token || !cfg.accId) {
        if (!brokers.length) return { status: 'skip', message: 'No credentials' };
    }
    if (state.botOff) return { status: 'stopped', message: 'Bot is off' };
    // (Paused is checked after open trades are managed — see below.)
    if (state.newsBlock) return { status: 'news_block', message: 'News block active' };

    if (!isTradingTime(cfg)) {
        // XM's daily break (~23:55–01:05 server time) is closed every night;
        // skip it quietly instead of sending the weekend message daily.
        if (v1On() && v1MarketState(Date.now()).reason === 'daily_break') return { status: 'daily_break', message: 'XM daily break — skipping cycle' };
        if (!state._weekendSkipNotified) {
            sendTelegram('💤 Market is closed — pausing until it reopens (no further attempts until then).');
            updateBotState({ _weekendSkipNotified: true });
        }
        return { status: 'market_closed', message: 'Market is closed, skipping cycle' };
    } else if (state._weekendSkipNotified) {
        updateBotState({ _weekendSkipNotified: false });
    }

    // v1: news is a pure entry block, checked at the entry gates below; the
    // calendar is refreshed here (cached for an hour).
    let newsEvents = V1 ? [] : await getLazyCalendar().catch(() => []), nw = V1 ? { blocked: false } : isNewsWindow(newsEvents);
    if (V1 && V1.newsBlock) await v1RefreshCalendar().catch(() => {});
    if (nw.blocked) {
        if (!state._newsAlertSent) { sendTelegram('📰 News Block\n' + nw.event + '\n' + nw.time + '\n(' + nw.minutesUntil + ' min away)');
            updateBotState({ _newsAlertSent: true }); }
        cfg._newsBlocked = true;
        cfg._newsMinutesUntil = nw.minutesUntil;
    } else {
        cfg._newsBlocked = false;
        if (state._newsAlertSent) updateBotState({ _newsAlertSent: false });
    }

    let mp = getModeParams(cfg), m5, m15, m30, h1, h4, m1;
    try {
        let res = await fetchAllTimeframes(cfg, mp);
        m5 = res[0]; m15 = res[1]; m30 = res[2]; h1 = res[3]; h4 = res[4]; m1 = res[5];
        // 'price' declared here (rather than further down, where it originally
        // was) because orderBook.getRecommendation(price) is called inside a
        // closure in the external-signals Promise.all below, well before the
        // old declaration point — a TDZ ReferenceError that cachedExternalFetch
        // silently swallowed, permanently sticking the order-book signal at
        // neutral every cycle. Fixed 2026-07-31.
        var price = m15[m15.length - 1].close;
        global._candleFailStreak = 0;
        // A partial/degraded fetch (fewer bars than requested, but not
        // outright empty) wouldn't throw here — indicators.detectSwings/
        // calcATR14/etc each have their own internal length guards that
        // silently fall back to defaults on thin data, so a cycle could run
        // to completion on incomplete candles without ever surfacing that
        // anything was wrong — just artificially weak scores with no
        // visibility into why. Treat too-thin data as a fetch failure
        // instead, same as an outright empty array. Added 2026-08-18.
        const MIN_BARS = { m15: 50, h1: 50, h4: 50, m30: 30, m5: 30, m1: 20 };
        const thin = [];
        if (m15.length < MIN_BARS.m15) thin.push(`m15:${m15.length}`);
        if (h1.length < MIN_BARS.h1) thin.push(`h1:${h1.length}`);
        if (h4.length < MIN_BARS.h4) thin.push(`h4:${h4.length}`);
        if (m30.length < MIN_BARS.m30) thin.push(`m30:${m30.length}`);
        if (mp.useM5 && m5.length < MIN_BARS.m5) thin.push(`m5:${m5.length}`);
        if (m1.length < MIN_BARS.m1) thin.push(`m1:${m1.length}`);
        if (thin.length) {
            global._candleFailStreak = (global._candleFailStreak || 0) + 1;
            _noteCandleFeed(false, 'Thin candle data: ' + thin.join(', '));
            return { status: 'error', message: 'Thin candle data: ' + thin.join(', ') };
        }
        _noteCandleFeed(true);
    } catch (e) {
        global._candleFailStreak = (global._candleFailStreak || 0) + 1;
        metrics.recordError(e);
        _noteCandleFeed(false, 'Candle fetch: ' + e.message);
        return { status: 'error', message: 'Candle fetch: ' + e.message };
    }

    let regime = detectRegime(h4, h1), session = getSessionContext(), dxy = V1 ? null : await getLazyDXY().catch(() => null);
    global._dxyData = dxy;
    // v1: outside data no longer feeds the score (it can't be replayed and
    // nothing has shown it helps), so it isn't fetched either.
    const dxyData = V1 ? null : await fetchDXY().catch(() => null);
    const treasuryData = V1 ? null : await fetchTreasury10y().catch(() => null);
    global._dxyData = dxyData;
    global._treasuryData = treasuryData;

    let d1 = await getLazyD1(cfg).catch(() => []), w1 = await getLazyW1(cfg).catch(() => []);
    global._lastCandles = m15;
    global._lastM1Candles = m1; // TP1-touch check between cycles (managePositions)

    // v1: one set of rules in every regime (regime-based risk, score bar,
    // breakeven and trail settings are off).
    let ro = V1 ? {} : getRegimeParams(regime.regime, cfg);
    if (ro.minScore !== undefined) cfg.minScore = ro.minScore;
    if (ro.risk !== undefined) cfg.risk = ro.risk;
    if (ro.rr !== undefined) cfg.rr = ro.rr;
    if (ro.beThreshold !== undefined) cfg.beThreshold = ro.beThreshold;
    if (ro.trailActivation !== undefined) cfg.trailActivation = ro.trailActivation;
    if (ro.maxT !== undefined) cfg.maxT = ro.maxT;
    if (ro.slBuf !== undefined) cfg.slBuf = ro.slBuf;
    mp = getModeParams(cfg);

    let spread = await getSpread(cfg).catch(() => null);
    global._v1Quote = spread;
    if (spread) {
        cfg._spread = spread.spread;
        if (V1) { cfg._v1UsualSpread = v1UsualSpread(Date.now()); v1NoteSpread(Date.now(), spread.spread); v1NoteBrokerTime(spread); }
        const spreadATR = spread.spread / indicators.calcATR14(m15);
        if (spreadATR > 0.5) {
            logger.warn('[Spread] High spread: ' + spreadATR + ' ATR');
        }
    }

    // ─── Fetch external data with 30s timeout ──────────────────────────────
    const [intermarketData, skewData, obPred] = V1 ? [{ sentiment: 'neutral', score: 0, components: {} }, { skew: 0, vix: 0 }, { direction: 'neutral', confidence: 0.5 }] : await Promise.race([
        Promise.all([
            fetchIntermarketMatrix().catch(() => ({ sentiment: 'neutral', score: 0, components: {} })),
            fetchVolatilitySkew().catch(() => ({ skew: 0, vix: 0 })),
            orderBookML.predict({ buyVolume: 1000, sellVolume: 800, spread: 0.001 }, m15[m15.length-1].close, indicators.calcATR14(m15))
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('external_data_timeout')), 30000))
    ]).catch(() => [
        { sentiment: 'neutral', score: 0, components: {} },
        { skew: 0, vix: 0 },
        { direction: 'neutral', confidence: 0.5 }
    ]);
    global._intermarketData = intermarketData;
    global._volatilitySkew = skewData;
    global._orderBookPrediction = obPred;

    // ─── Event‑weighted news sentiment ──────────────────────────────────────
    const newsEvents2 = V1 ? [] : await getLazyCalendar().catch(() => []);
    const highImpactEvents = newsEvents2.filter(e => e.impact === 'High' && e.country === 'USD');
    let eventImpact = 0;
    let eventBias = 'neutral';
    for (const e of highImpactEvents) {
        const t = new Date(e.date).getTime();
        const diff = (t - Date.now()) / 60000;
        if (diff > -30 && diff < 60) {
            eventImpact = 1.0 - Math.abs(diff) / 60;
            if (e.title && (e.title.includes('FOMC') || e.title.includes('Rate'))) eventBias = 'bearish';
            else if (e.title && (e.title.includes('NFP') || e.title.includes('Employment'))) eventBias = 'bullish';
            else if (e.title && (e.title.includes('CPI') || e.title.includes('Inflation'))) eventBias = 'bearish';
            break;
        }
    }
    global._newsEventWeight = { impact: eventImpact, bias: eventBias };

    // ─── FETCH EXTERNAL SIGNALS (non‑analysis dependent) with 30s timeout ──
    const defaultSignals = [
        { signal: 'neutral', confidence: 0, description: 'COT default' },
        { bias: 'neutral', confidence: 0, description: 'Macro default' },
        { signal: 'neutral', confidence: 0, description: 'Intermarket default' },
        { regime: 'normal', confidence: 0.5 },
        { bias: 'neutral', confidence: 0, description: 'News default' },
        { action: 'neutral', confidence: 0 },
        { signal: 'neutral', confidence: 0 },
        { bias: 'neutral', confidence: 0 },
        { bias: 'neutral', confidence: 0 },
        { signal: 'neutral', confidence: 0 },
        { signal: 'neutral', confidence: 0 },
        { risk: 'normal', sizeMultiplier: 1 },
        { bias: 'neutral', confidence: 0 }
    ];

    const externalSignals = V1 ? defaultSignals : await Promise.race([
        Promise.all([
            cachedExternalFetch('cot', () => cotAnalyzer.getPositioning(), 600000, 2, defaultSignals[0]),
            cachedExternalFetch('macro', () => macroFactors.getSignal(), 600000, 2, defaultSignals[1]),
            cachedExternalFetch('inter', () => intermarketAnalyzer.getDivergence(), 120000, 2, defaultSignals[2]),
            cachedExternalFetch('hmm', () => regimeHMM.detect(h4), 300000, 2, defaultSignals[3]),
            cachedExternalFetch('news', () => newsSentiment.getSignal(), 300000, 2, defaultSignals[4]),
            cachedExternalFetch('orderBook', () => orderBook.getRecommendation(price), 60000, 2, defaultSignals[5]),
            cachedExternalFetch('flow', () => flowDetector.getRecommendation(), 60000, 2, defaultSignals[6]),
            cachedExternalFetch('intermarketAdv', () => intermarketAdvanced.getRecommendation(), 120000, 2, defaultSignals[7]),
            cachedExternalFetch('newsNLP', () => newsNLP.getRecommendation(), 300000, 2, defaultSignals[8]),
            cachedExternalFetch('etf', () => etfFlows.getRecommendation(), 300000, 2, defaultSignals[9]),
            cachedExternalFetch('options', () => optionsPositioning.getRecommendation(), 300000, 2, defaultSignals[10]),
            cachedExternalFetch('econ', () => economicCalendar.getSignal(), 600000, 2, defaultSignals[11]),
            cachedExternalFetch('seasonality', () => seasonalityAdvanced.getRecommendation(new Date()), 600000, 2, defaultSignals[12])
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('signals_timeout')), 30000))
    ]).catch(() => defaultSignals);

    const [cotSig, macroSig, interSig, hmmRegime, newsSig,
           orderBookSig, flowSig, intermarketSig, newsNLPSig,
           etfSig, optionsSig, econSig, seasonalitySig] = externalSignals;

    let account;
    try { account = await getAccount(cfg); global._accountFailStreak = 0; } catch (e) { global._accountFailStreak = (global._accountFailStreak || 0) + 1;
        metrics.recordError(e); return { status: 'error', message: 'Account: ' + e.message }; }

    let balance = parseFloat(account.balance || 0), equity = parseFloat(account.equity || balance);
    global._v1Account = { currency: account.currency || null, balance, marginMode: account.marginMode || null, type: account.type || null };
    let positions = [];
    try { positions = await getPositions(cfg); } catch (e) {}

    let ourPositions = positions.filter(p => p.comment && p.comment.indexOf('ICT_BOT') !== -1);
    let symbolPositions = ourPositions.filter(p => isOurSymbol(cfg, p));

    // ─── MANAGE OPEN POSITIONS — every cycle, before any early return ────
    // Used to run further down, AFTER the max-positions and cooldown early
    // returns — so whenever 3 trades were open (or for a cycle after every
    // loss, during the post-loss cooldown) NO open trade got breakeven,
    // step-trail, partials or time exits until one of them hit its SL/TP on
    // its own. Moved up 2026-10-23. Also passes the live bid/ask (`spread`,
    // fetched above) so exits are judged on the executable price rather
    // than an M15 candle close.
    let atr14 = indicators.calcATR14(m15);
    // Trend mode (and any trend trade still open): 4-hour candles with enough
    // history for the 200-candle average and the trailing stop. See TREND.
    if (V1 && (V1.strategy === 'trend' || ourPositions.some(p => (loadPositionState(p.id) || {})._trend))) {
        try { global._v1TrendH4 = await getCandles(cfg, '4h', TREND.fetch); } catch (e) { logger.warn('[trend] 4-hour candles failed: ' + e.message); }
    }
    // EA mode (and any EA trade still open): each strategy's own candles. The
    // candle cache is skipped once a candle has finished since the last
    // fetch, so the rules see the new candle on the first cycle after it.
    if (V1) {
        for (const id of v1EaIdsInUse(V1, ourPositions)) {
            const S = EA.get(id);
            if (!S) continue;
            const ck = cfg.symbol + '_' + S.timeframe + '_' + S.fetchBars, cached = _candleCache[ck];
            if (Array.isArray(cached) && cached.length && Date.parse(cached[cached.length - 1].time) + S.tfMs <= Date.now()) delete _candleCacheTime[ck];
            try { (global._v1EaCandles = global._v1EaCandles || {})[id] = await getCandles(cfg, S.timeframe, S.fetchBars); } catch (e) { logger.warn('[ea] ' + id + ' ' + S.timeframe + ' candles failed: ' + e.message); }
        }
    }
    // ICT 2022 mode: setup candles (two days of history, for the previous
    // day's high and low) from the London killzone to the last order's
    // expiry; then the waiting limit order's fill or cancel. See ICT.
    if (V1 && V1.strategy === 'silverbullet') {
        // Silver Bullet: two days of 5-minute candles around its three windows.
        const dp = ictDayParts(Date.now());
        if (dp.tdm >= SB.windows[0].from - 5 && dp.tdm < SB.windows[2].to + 10) {
            try { global._v1IctCandles = await getCandles(cfg, '5m', 640); } catch (e) { logger.warn('[sb] candles failed: ' + e.message); }
        }
    }
    if (V1 && V1.strategy === 'ote') {
        try { global._v1IctCandles = await getCandles(cfg, '1h', 200); } catch (e) { logger.warn('[ote] candles failed: ' + e.message); }
    }
    if (V1 && V1.strategy === 'ict2022') {
        const tfm = ictTfMin(V1), dp = ictDayParts(Date.now());
        if (dp.tdm >= ICT.kzs[0].from - 5 && dp.tdm < ICT.kzs[1].confirmBy + ICT.orderBars * tfm + 5) {
            try { global._v1IctCandles = await getCandles(cfg, tfm === 15 ? '15m' : '5m', tfm === 15 ? 240 : 640); } catch (e) { logger.warn('[ict] candles failed: ' + e.message); }
        }
    }
    if (V1 && (isIctFamily(V1.strategy) || (global._botState || {})._ictPending)) {
        try { await v1IctSync(cfg, V1, ourPositions, spread); } catch (e) { logger.warn('[ict] order check failed: ' + e.message); }
    }
    if (ourPositions.length) {
        rehydratePositions(ourPositions);
        await managePositions(cfg, ourPositions, price, atr14, session.session, regime.regime, regime.volatility, regime, spread);
        // Management may have closed positions this cycle — refresh so the
        // max-positions / duplicate checks below see the real book.
        try {
            positions = await getPositions(cfg);
            ourPositions = positions.filter(p => p.comment && p.comment.indexOf('ICT_BOT') !== -1);
            symbolPositions = ourPositions.filter(p => isOurSymbol(cfg, p));
        } catch (e) { /* keep the pre-management snapshot */ }
    }

    // Record closed trades every cycle — this used to sit after the
    // max-positions return below, so it was skipped whenever 3 trades were
    // open. Moved up 2026-10-23 (see also trackOpenPosition).
    await reconcileClosedTrades(cfg, ourPositions).catch(e => logger.warn('[engine] Reconciliation failed:', e.message));

    // Paused = no NEW trades. This check used to be the first thing in the
    // cycle, so while paused, open trades got no breakeven, trailing or TP1
    // partial at all until you resumed. Now they're managed (above) and only
    // new entries stop here. Moved 2026-10-23.
    if (state.paused) return { status: 'paused', message: 'Bot is paused — open trades are still managed' };

    // ─── ENFORCE MAX 3 POSITIONS ──────────────────────────────────────────
    // v1 counts TRADES: a trade's TP1 leg (leg A) is part of the same trade.
    const tradesOpen = V1 ? ourPositions.filter(p => !v1IsLegA(p)) : ourPositions;
    const symbolTradesOpen = V1 ? symbolPositions.filter(p => !v1IsLegA(p)) : symbolPositions;
    if (tradesOpen.length >= MAX_POSITIONS) {
        logger.info(`[engine] Max positions reached (${tradesOpen.length}/${MAX_POSITIONS})`);
        return { status: 'max_positions', message: `Already have ${tradesOpen.length} positions` };
    }

    let sr = global._botState || {};
    let dailyPnl = sr.dailyPnl || 0, unreal = 0;
    ourPositions.forEach(p => unreal += parseFloat(p.unrealizedProfit || p.profit || 0));

    // v1 replaces these two warning-only limits (5%/10% and 8%/15% in
    // different places) with one daily stop at −3R that really stops entries.
    let dc = V1 ? { isBreached: false } : checkDailyLossLimit(dailyPnl, unreal, balance, cfg.maxDailyLoss || 12);
    if (dc.isBreached) { sendTelegram('⚠️ Daily loss threshold crossed ($' + dc.effectivePnl.toFixed(2) + ' / -$' + dc.limit.toFixed(2) + ', ' + dc.percent.toFixed(0) + '% of limit) — trading continues, pause removed'); }

    let monthlyPnl = sr.monthlyPnl || 0, mc = V1 ? { isBreached: false } : checkMonthlyLossLimit(monthlyPnl, balance, cfg.maxMonthlyLoss || 20);
    if (mc.isBreached) { sendTelegram('⚠️ Monthly loss threshold crossed ($' + mc.monthlyPnl.toFixed(2) + ' / -$' + mc.limit.toFixed(2) + ', ' + mc.percent.toFixed(0) + '% of limit) — trading continues, pause removed'); }

    let dailyTrades = sr.dailyTrades || 0;

    let lastTradeTime = sr.lastTradeTime || 0, msSinceLastTrade = Date.now() - lastTradeTime;
    let minGapMs = ((sr.consecLosses || 0) > 0 ? 5 : 1) * 60 * 1000;
    if (lastTradeTime > 0 && msSinceLastTrade < minGapMs) {
        return { status: 'cooldown', message: 'Cooldown: ' + Math.ceil((minGapMs - msSinceLastTrade) / 60000) + 'min remaining' + ((sr.consecLosses || 0) > 0 ? ' (post-loss)' : '') };
    }

    let dayBal = sr.dayBal || balance;
    if (!V1 && balance > 0 && dayBal > 0 && ((dayBal - balance) / dayBal * 100) >= cfg.dd) {
        if (!sr.ddAlertSentToday) { sendTelegram('⚠️ DD threshold crossed\nBalance: ' + cfg.currency + balance.toFixed(2) + '\nDay start: ' + cfg.currency + dayBal.toFixed(2) + '\nTrading continues, pause removed');
            updateBotState({ ddAlertSentToday: true }); }
    }

    await checkPendingLimitOrders(cfg).catch(e => logger.warn('[engine] pendingLimitOrders check failed:', e.message));

    let journal = loadJournal(), learnJ = learningJournal(journal), jWeights = calcJournalWeights(learnJ.trades, BOT_CODE_VERSION);
    let ap = V1 ? { adjusted: false } : getAdaptiveParams(state, learnJ.trades, regime.regime);
    if (ap.adjusted) { cfg.risk = ap.risk; cfg.minScore = ap.minScore; cfg.maxT = ap.maxTrades; cfg.trailActivation = ap.trailActivation;
        logger.info('[adaptive] Params adjusted: risk=' + cfg.risk + ', minScore=' + cfg.minScore + ', maxT=' + cfg.maxT); }

    let freq = V1 ? { minScoreAdjustment: 0, riskAdjustment: 1 } : getFrequencyAdjustedParams(journal.trades || [], FREQUENCY_CONFIG.dailyTarget || 10), minScoreAdj = (typeof freq.minScoreAdjustment === "number") ? freq.minScoreAdjustment : 0;
    if (freq.riskAdjustment !== 1 && freq.riskAdjustment) { cfg.risk = Math.min(3, Math.max(.3, cfg.risk * freq.riskAdjustment));
        logger.info('[frequency] Risk adjusted to ' + cfg.risk); }

    if (!V1 && cfg.useEquitySizing !== false) {
        let start = state.startingBalance || balance;
        if (!state.startingBalance) updateBotState({ startingBalance: balance });
        let growth = balance / Math.max(start, 1), mult = Math.min(2.0, Math.max(.5, growth));
        cfg.risk = Math.min(3, cfg.risk * mult);
        if (cfg.debug) logger.info('[DEBUG] Equity sizing: balance=' + balance + ', start=' + start + ', risk=' + cfg.risk);
    }

    let lossStreak = V1 ? { sizeMultiplier: 1 } : checkLossStreak(state);
    let sizeMultiplier = lossStreak.sizeMultiplier || 1.0;
    if (sizeMultiplier < 1) {
        cfg.risk = Math.max(0.3, cfg.risk * sizeMultiplier);
        logger.info(`[Loss Streak] Risk reduced to ${cfg.risk}% (${lossStreak.reason})`);
    }

    if (symbolTradesOpen.length >= cfg.maxT) return { status: 'max_trades', message: 'Max trades for ' + cfg.symbol + ' (' + symbolTradesOpen.length + '/' + cfg.maxT + ')' };
    if (tradesOpen.length >= MAX_POSITIONS) return { status: 'max_global_trades', message: 'Max global trades (' + tradesOpen.length + '/' + MAX_POSITIONS + ')' };

    // Trend mode replaces the ICT analysis and entries entirely.
    if (V1 && V1.strategy === 'trend') return await v1TrendCycle(cfg, V1, { m15, atr14, spread, ourPositions, balance });
    // So does the ICT 2022 model (V1_STRATEGY=ict2022).
    if (V1 && isIctFamily(V1.strategy)) return await v1IctCycle(cfg, V1, { m15, atr14, spread, ourPositions, balance });
    // And EA mode (V1_STRATEGY=ea): the formulas in src/ea/strategies/<V1_EA>.json.
    if (V1 && V1.strategy === 'ea') return await v1EaCycle(cfg, V1, { m15, atr14, spread, ourPositions, balance });

    // ─── Run full analysis ──────────────────────────────────────────────
    // 1-hour setups (V1_SETUP_TF=1h) analyse the next timeframes up — see
    // v1AnalysisFrames. The default passes the same candles as always.
    const aTf = v1AnalysisFrames(V1, { m5, m15, m30, h1, h4, d1, atr14 });
    global._v1SetupCandles = aTf.tf === '1h' ? aTf.m15 : null;
    let analysis = runFullAnalysis(aTf.m5, aTf.m15, aTf.m30, aTf.h1, aTf.h4, cfg, regime, d1, w1, price, aTf.atr);
    // runFullAnalysis's returned object never included price — /analysis
    // always showed "Price: —" regardless of actual market conditions,
    // unrelated to any trading logic (which correctly uses the local price
    // variable directly). Cosmetic only, but confusing when debugging
    // alongside a real issue. Fixed 2026-08-19.
    analysis.price = price;
    analysis.candlePrice = price;
    // /analysis was reporting the M15 candle's close as "current" price —
    // up to 15 min stale on its own (the candle isn't done forming yet),
    // worsened by the ~2 min candle cache TTL. All real trading logic is
    // unaffected (placeTrade already fetches a live bid/ask separately),
    // but this made /analysis misleading for live diagnosis, e.g. a
    // ~$20-140 gap vs the live chart reported 2026-08-20 and 2026-08-25.
    // Non-blocking: falls back to the candle close (kept in
    // analysis.candlePrice above) if the live quote fetch fails. Fixed
    // 2026-08-25.
    try {
        let sym = await resolveSymbol(cfg), pd = await maGet(cfg, '/symbols/' + encodeURIComponent(sym) + '/current-price', false);
        if (pd && pd.ask && pd.bid) analysis.price = (parseFloat(pd.ask) + parseFloat(pd.bid)) / 2;
    } catch (e) {}
    // Added a timestamp — /analysis had no way to show HOW OLD the
    // snapshot was. Reported 2026-08-20: analysis showed a price ~$50 away
    // from the live chart, matching where price was roughly 2 days earlier.
    // The most likely explanation is the cycle hasn't been completing
    // successfully — global._latestAnalysis only updates when a cycle
    // reaches this point, so if cycles have been failing (candle fetch,
    // connectivity, etc.), this snapshot silently goes stale with nothing
    // telling you so. Now /analysis can show staleness explicitly instead
    // of presenting old data as if it were current. Fixed 2026-08-20.
    analysis.ts = new Date().toISOString();
    // The newest M15 candle's OWN timestamp (not the bot's clock) — shown in
    // /analysis so a lagging data feed is visible. With the candle-order fix
    // this should be minutes old during market hours; before it, the "latest"
    // candle was really the oldest one in the window (~37h). Added 2026-10-23.
    try {
        const lc = m15[m15.length - 1];
        analysis.lastCandleTime = lc && lc.time ? new Date(lc.time).toISOString() : null;
        const ageMin = analysis.lastCandleTime ? (Date.now() - new Date(analysis.lastCandleTime).getTime()) / 60000 : 0;
        if (ageMin > 45 && Date.now() - (global._lastCandleAgeWarn || 0) > 60 * 60 * 1000) {
            global._lastCandleAgeWarn = Date.now();
            logger.warn(`[candles] Newest M15 candle is ${Math.round(ageMin)} min old (${analysis.lastCandleTime}) — data feed lagging?`);
        }
    } catch (e) { /* diagnostic only */ }
    global._latestAnalysis = analysis;
    global._lastRegime = regime.regime;

    let weighted = V1 ? { score: analysis.score, hits: analysis.hits } : applyJournalWeights(analysis, jWeights);
    analysis.score = weighted.score;
    analysis.hits = weighted.hits;

    // ─── Compute Trend Quality ──────────────────────────────────────────
    const candlesByTF = { d1, h4, h1, m30 };
    const trendQuality = computeTrendQuality(analysis, candlesByTF);
    analysis.trendQuality = trendQuality;
    analysis.trendScore = computeTrendScore(candlesByTF);

    // ─── Fetch ML/XGBoost (need analysis) with 10s timeout ──────────────
    let mlPred = { probability: 0.5, confidence: 0.5 };
    let xgboostSig = { probability: 0.5, confidence: 0.5 };
    if (!V1 && analysis && analysis.signal !== 'none') {
        try {
            const mlAndXGB = await Promise.race([
                Promise.all([
                    cachedExternalFetch('ml', () => goldModel.predict(analysis), 60000, 2, { probability: 0.5, confidence: 0.5 }),
                    cachedExternalFetch('xgboost', () => xgboost.getRecommendation(analysis), 60000, 2, { probability: 0.5, confidence: 0.5 })
                ]),
                new Promise((_, reject) => setTimeout(() => reject(new Error('ml_xgb_timeout')), 10000))
            ]).catch(() => [
                { probability: 0.5, confidence: 0.5 },
                { probability: 0.5, confidence: 0.5 }
            ]);
            mlPred = mlAndXGB[0];
            xgboostSig = mlAndXGB[1];
        } catch (e) {
            // use defaults
        }
    }

    // ─── Integrate all signals into analysis.score ──────────────────────
    let extraScore = 0;
    let extraHits = [];

    // Order book
    if (orderBookSig.action === 'bullish' && analysis.signal === 'buy') { extraScore += 0.3; extraHits.push('📊 Order book bullish +0.3'); }
    else if (orderBookSig.action === 'bearish' && analysis.signal === 'sell') { extraScore += 0.3; extraHits.push('📊 Order book bearish +0.3'); }
    else if (orderBookSig.action === 'bullish' && analysis.signal === 'sell') { extraScore -= 0.2; extraHits.push('⚠️ Order book bullish vs sell -0.2'); }
    else if (orderBookSig.action === 'bearish' && analysis.signal === 'buy') { extraScore -= 0.2; extraHits.push('⚠️ Order book bearish vs buy -0.2'); }

    // Flow
    if (flowSig.signal === 'bullish' && analysis.signal === 'buy') { extraScore += 0.2; extraHits.push('📊 Flow bullish +0.2'); }
    else if (flowSig.signal === 'bearish' && analysis.signal === 'sell') { extraScore += 0.2; extraHits.push('📊 Flow bearish +0.2'); }

    // Intermarket advanced
    if (intermarketSig.bias === 'bullish' && analysis.signal === 'buy') { extraScore += 0.3; extraHits.push('📈 Intermarket bullish +0.3'); }
    else if (intermarketSig.bias === 'bearish' && analysis.signal === 'sell') { extraScore += 0.3; extraHits.push('📈 Intermarket bearish +0.3'); }
    else if (intermarketSig.bias === 'bullish' && analysis.signal === 'sell') { extraScore -= 0.3; extraHits.push('⚠️ Intermarket bullish vs sell -0.3'); }
    else if (intermarketSig.bias === 'bearish' && analysis.signal === 'buy') { extraScore -= 0.3; extraHits.push('⚠️ Intermarket bearish vs buy -0.3'); }

    // News NLP
    if (newsNLPSig.bias === 'bullish' && analysis.signal === 'buy') { extraScore += 0.2; extraHits.push('📰 News NLP bullish +0.2'); }
    else if (newsNLPSig.bias === 'bearish' && analysis.signal === 'sell') { extraScore += 0.2; extraHits.push('📰 News NLP bearish +0.2'); }
    else if (newsNLPSig.bias === 'bullish' && analysis.signal === 'sell') { extraScore -= 0.2; extraHits.push('⚠️ News NLP bullish vs sell -0.2'); }
    else if (newsNLPSig.bias === 'bearish' && analysis.signal === 'buy') { extraScore -= 0.2; extraHits.push('⚠️ News NLP bearish vs buy -0.2'); }

    // ETF flows
    if (etfSig.signal === 'bullish' && analysis.signal === 'buy') { extraScore += 0.2; extraHits.push('📊 ETF flows bullish +0.2'); }
    else if (etfSig.signal === 'bearish' && analysis.signal === 'sell') { extraScore += 0.2; extraHits.push('📊 ETF flows bearish +0.2'); }

    // Options
    if (optionsSig.signal === 'bullish' && analysis.signal === 'buy') { extraScore += 0.15; extraHits.push('📊 Options bullish +0.15'); }
    else if (optionsSig.signal === 'bearish' && analysis.signal === 'sell') { extraScore += 0.15; extraHits.push('📊 Options bearish +0.15'); }

    // Seasonality advanced
    if (seasonalitySig.bias === 'bullish' && analysis.signal === 'buy') { extraScore += 0.2; extraHits.push('📅 Seasonality bullish +0.2'); }
    else if (seasonalitySig.bias === 'bearish' && analysis.signal === 'sell') { extraScore += 0.2; extraHits.push('📅 Seasonality bearish +0.2'); }

    // XGBoost
    if (xgboostSig.probability > 0.6 && analysis.signal !== 'none') { extraScore += 0.3; extraHits.push(`🧠 XGBoost confirms +0.3 (${(xgboostSig.probability*100).toFixed(0)}%)`); }
    else if (xgboostSig.probability < 0.4 && analysis.signal !== 'none') { extraScore -= 0.3; extraHits.push(`⚠️ XGBoost cautions -0.3 (${(xgboostSig.probability*100).toFixed(0)}%)`); }

    // COT
    if (cotSig.signal === 'bearish_reversal' && analysis.signal === 'buy') { extraScore -= 1.0; extraHits.push(`⚠️ COT bearish reversal -1.0 (${cotSig.description})`); }
    else if (cotSig.signal === 'bullish_reversal' && analysis.signal === 'sell') { extraScore -= 1.0; extraHits.push(`⚠️ COT bullish reversal -1.0 (${cotSig.description})`); }
    else if (cotSig.confidence > 0.6 && cotSig.signal === 'bearish' && analysis.signal === 'buy') { extraScore -= 0.5; extraHits.push(`⚠️ COT bearish positioning -0.5 (${cotSig.description})`); }
    else if (cotSig.confidence > 0.6 && cotSig.signal === 'bullish' && analysis.signal === 'sell') { extraScore -= 0.5; extraHits.push(`⚠️ COT bullish positioning -0.5 (${cotSig.description})`); }

    // Macro
    if (macroSig.bias === 'bullish' && analysis.signal === 'buy') { extraScore += 0.5; extraHits.push(`📊 Macro bullish +0.5 (${macroSig.description})`); }
    else if (macroSig.bias === 'bearish' && analysis.signal === 'sell') { extraScore += 0.5; extraHits.push(`📊 Macro bearish +0.5 (${macroSig.description})`); }
    else if (macroSig.bias === 'bullish' && analysis.signal === 'sell') { extraScore -= 0.5; extraHits.push(`⚠️ Macro bullish vs sell -0.5 (${macroSig.description})`); }
    else if (macroSig.bias === 'bearish' && analysis.signal === 'buy') { extraScore -= 0.5; extraHits.push(`⚠️ Macro bearish vs buy -0.5 (${macroSig.description})`); }

    // Intermarket basic
    if (interSig.signal === 'bullish' && analysis.signal === 'buy') { extraScore += 0.3; extraHits.push(`📈 Intermarket bullish +0.3 (${interSig.description})`); }
    else if (interSig.signal === 'bearish' && analysis.signal === 'sell') { extraScore += 0.3; extraHits.push(`📈 Intermarket bearish +0.3 (${interSig.description})`); }
    else if (interSig.signal === 'bullish' && analysis.signal === 'sell') { extraScore -= 0.3; extraHits.push(`⚠️ Intermarket bullish vs sell -0.3 (${interSig.description})`); }
    else if (interSig.signal === 'bearish' && analysis.signal === 'buy') { extraScore -= 0.3; extraHits.push(`⚠️ Intermarket bearish vs buy -0.3 (${interSig.description})`); }

    // ML
    if (mlPred.probability > 0.6 && analysis.signal !== 'none') { extraScore += 0.4; extraHits.push(`🧠 ML confirms +0.4 (prob ${(mlPred.probability*100).toFixed(0)}%)`); }
    else if (mlPred.probability < 0.4 && analysis.signal !== 'none') { extraScore -= 0.4; extraHits.push(`⚠️ ML cautions -0.4 (prob ${(mlPred.probability*100).toFixed(0)}%)`); }

    // News basic
    if (newsSig.bias === 'bullish' && analysis.signal === 'buy') { extraScore += 0.3; extraHits.push(`📰 News bullish +0.3 (${newsSig.description})`); }
    else if (newsSig.bias === 'bearish' && analysis.signal === 'sell') { extraScore += 0.3; extraHits.push(`📰 News bearish +0.3 (${newsSig.description})`); }
    else if (newsSig.bias === 'bullish' && analysis.signal === 'sell') { extraScore -= 0.3; extraHits.push(`⚠️ News bullish vs sell -0.3 (${newsSig.description})`); }
    else if (newsSig.bias === 'bearish' && analysis.signal === 'buy') { extraScore -= 0.3; extraHits.push(`⚠️ News bearish vs buy -0.3 (${newsSig.description})`); }

    // Apply extra score
    analysis.score = Math.min(12, Math.max(0, analysis.score + extraScore));
    analysis.hits = analysis.hits.concat(extraHits);

    // HMM regime adjustments
    const hmmRec = V1 ? null : regimeHMM.getRecommendation(hmmRegime.regime);
    if (hmmRec) {
        if (hmmRec.minScore !== undefined) cfg.minScore = Math.min(Math.max(cfg.minScore, hmmRec.minScore), 4);
        if (hmmRec.riskMult !== undefined) cfg.risk = Math.min(3, cfg.risk * hmmRec.riskMult);
        if (hmmRec.rr !== undefined) cfg.rr = hmmRec.rr;
        if (hmmRec.maxT !== undefined) cfg.maxT = Math.min(cfg.maxT, hmmRec.maxT);
        logger.info(`[HMM] Regime ${hmmRegime.regime} -> minScore=${cfg.minScore}, risk=${cfg.risk}, rr=${cfg.rr}, maxT=${cfg.maxT}`);
    }

    // ─── Apply direction adaptation ──────────────────────────────────────
    let dirBias;
    try { dirBias = V1 ? { buyBonus: 0, sellBonus: 0 } : getEpochDirectionBias(); } catch (e) { dirBias = { buyBonus: 0, sellBonus: 0 }; }
    // Was double-counting: analysis.score already has alignmentScore baked
    // in from runFullAnalysis (score = score + alignmentScore, logged as
    // the "Top-down alignment" hit). Adding it again here inflated
    // favorable-alignment scores and double-penalized unfavorable ones —
    // confirmed 2026-08-25 via a live case where hits summed to 3.2 but
    // the reported score was 4.1, exactly +0.9 (the alignmentScore for
    // that cycle) too high. Fixed to no longer re-add it.
    let finalScore = analysis.score;
    if (analysis.signal === 'buy') finalScore += dirBias.buyBonus;
    else if (analysis.signal === 'sell') finalScore += dirBias.sellBonus;

    let adjustedSignal = analysis.signal;
    if (analysis.topDownBias && analysis.topDownBias !== 'neutral') {
        if (analysis.topDownBias === 'bullish' && analysis.signal === 'sell' && dirBias.buyBonus > 0.5) {
            adjustedSignal = 'buy';
            finalScore += 0.5;
            analysis.hits.push('🔄 Direction flip: sell → buy (top-down bullish + buy performance)');
        } else if (analysis.topDownBias === 'bearish' && analysis.signal === 'buy' && dirBias.sellBonus > 0.5) {
            adjustedSignal = 'sell';
            finalScore += 0.5;
            analysis.hits.push('🔄 Direction flip: buy → sell (top-down bearish + sell performance)');
        }
    }
    analysis.signal = adjustedSignal;
    analysis.score = Math.min(12, Math.max(0, finalScore));

    // ─── Market condition checks ─────────────────────────────────────────
    if (analysis.regimeAtrRatio && analysis.regimeAtrRatio > 5.0) {
        logger.warn(`[engine] High ATR ratio ${analysis.regimeAtrRatio.toFixed(2)} – size will be adjusted`);
    }
    if (cfg._spread && atr14 > 0 && cfg._spread / atr14 > 0.5) {
        logger.warn(`[engine] Wide spread ${cfg._spread} / ATR ${atr14} = ${(cfg._spread / atr14).toFixed(2)} – proceed with caution`);
    }

    if (analysis.marketTrend && analysis.marketTrend.isStrongTrend && analysis.signal !== 'none') {
        let trendDir = analysis.marketTrend.direction === 'bullish' ? 'buy' : 'sell';
        if (analysis.signal !== trendDir && analysis.marketTrend.strength > 0.7) {
            analysis.score = Math.max(0, analysis.score - 2);
            analysis.hits.push(`⚠️ Counter-trend signal -2 (strong ${analysis.marketTrend.direction} trend)`);
        }
    }

    if (aTf.m15 && aTf.m15.length >= 10 && analysis.signal !== 'none') {
        let recent = aTf.m15.slice(-8);
        let rFirst = recent[0].close, rLast = recent[recent.length - 1].close;
        let rChangePct = (rLast - rFirst) / rFirst * 100;
        let recentDir = rChangePct > 0.1 ? 'buy' : rChangePct < -0.1 ? 'sell' : 'none';
        if (recentDir !== 'none' && analysis.signal !== recentDir) {
            let penalty = Math.min(2.5, Math.abs(rChangePct) * 3);
            analysis.score = Math.max(0, analysis.score - penalty);
            analysis.hits.push(`⚠️ Against last ${aTf.tf === '1h' ? '8h' : '2h'} price action -${penalty.toFixed(1)} (moved ${rChangePct.toFixed(2)}% ${recentDir === 'buy' ? 'up' : 'down'})`);
        }
    }

    // ─── Order Flow ──────────────────────────────────────────────────────
    if (cfg.useOrderFlow !== false) {
        try {
            const ofAnalyzer = new OrderFlowAnalyzer();
            const ofResult = ofAnalyzer.analyze(aTf.m15, aTf.atr);
            analysis.orderFlow = ofResult;
            if (ofResult.absorption) analysis.hits.push('Order flow: absorption detected');
            if (ofResult.exhaustion) analysis.hits.push('Order flow: exhaustion detected');
            if (analysis.signal === 'buy' && ofResult.buyRatio > 0.55) analysis.score += 0.3;
            else if (analysis.signal === 'sell' && ofResult.sellRatio > 0.55) analysis.score += 0.3;
        } catch (e) { logger.warn('[OrderFlow] Analysis failed:', e.message); }
    }

    // ─── ML Validation (existing) ──────────────────────────────────────
    if (!V1 && cfg.useMLValidation !== false) {
        try {
            const mlResult = predict(analysis, regime, session, cfg);
            analysis.mlWinProb = mlResult.probability || 0.5;
            analysis.mlConfidence = mlResult.confidence || 0.5;
            if (mlResult.probability > 0.6) {
                analysis.score += 0.5;
                analysis.hits.push('ML confirms +0.5 (prob ' + (mlResult.probability * 100).toFixed(0) + '%)');
            } else if (mlResult.probability < 0.4) {
                analysis.score = Math.max(0, analysis.score - 0.3);
                analysis.hits.push('ML cautions -0.3 (prob ' + (mlResult.probability * 100).toFixed(0) + '%)');
            }
            analysis.mlConfidence = mlResult.confidence;
        } catch (e) { logger.warn('[ML] Prediction failed:', e.message); }
    }

    // ─── Correlation ──────────────────────────────────────────────────────
    if (cfg.useCorrelation !== false) {
        try {
            const corrAnalyzer = new CorrelationAnalyzer();
            const corrResult = await corrAnalyzer.analyze(cfg.symbol, cfg);
            analysis.correlationDeviation = corrResult.deviation || 0;
            if (corrResult.signal === 'warning') {
                analysis.score = Math.max(0, analysis.score - 0.5);
                analysis.hits.push('⚠️ Correlation warning -0.5');
            } else if (corrResult.signal === 'caution') {
                analysis.score = Math.max(0, analysis.score - 0.2);
                analysis.hits.push('Correlation caution -0.2');
            }
        } catch (e) { logger.warn('[Correlation] Analysis failed:', e.message); }
    }

    // ─── Seasonality ──────────────────────────────────────────────────────
    if (!V1 && cfg.useSeasonality !== false) {
        try {
            const seasonAnalyzer = new SeasonalityAnalyzer();
            const now = new Date();
            const pattern = seasonAnalyzer.getPattern(now.getUTCDay(), now.getUTCHours());
            analysis.seasonalityPattern = pattern.pattern;
            if (pattern.pattern === 'breakout' || pattern.pattern === 'momentum') {
                analysis.score += 0.3;
                analysis.hits.push('Seasonality: ' + pattern.pattern + ' +0.3');
            } else if (pattern.pattern === 'range_bound' || pattern.pattern === 'reversal') {
                analysis.score = Math.max(0, analysis.score - 0.2);
                analysis.hits.push('Seasonality: ' + pattern.pattern + ' -0.2');
            }
        } catch (e) { logger.warn('[Seasonality] Analysis failed:', e.message); }
    }

    // ─── Macro Trend (existing) ──────────────────────────────────────────
    if (cfg.useMacroTrend !== false && analysis.macroTrend) {
        if (analysis.macroTrend.confidence > 0.7) {
            if (analysis.macroTrend.recommendation === 'buy' && analysis.signal === 'buy') {
                analysis.score += 0.5;
                analysis.hits.push('📊 Strong macro trend aligns +0.5');
            } else if (analysis.macroTrend.recommendation === 'sell' && analysis.signal === 'sell') {
                analysis.score += 0.5;
                analysis.hits.push('📊 Strong macro trend aligns +0.5');
            } else if (analysis.macroTrend.confidence > 0.8) {
                if ((analysis.macroTrend.recommendation === 'buy' && analysis.signal === 'sell') ||
                    (analysis.macroTrend.recommendation === 'sell' && analysis.signal === 'buy')) {
                    analysis.score = Math.max(0, analysis.score - 0.5);
                    analysis.hits.push('⚠️ Macro trend conflict -0.5');
                }
            }
        }
    }

    // ─── Statistical Validation ──────────────────────────────────────────
    if (!V1 && cfg.useStatisticalValidation !== false) {
        try {
            const validation = validateStrategy(analysis, learnJ, {
                minTrades: cfg.minTradesForValidation || 20,
                minWinRate: 0.40
            });
            if (validation.pass) {
                // ok
            } else if (validation.winRate < 0.35 && validation.trades >= 20) {
                analysis._sizeReduction = 0.7;
                analysis.hits.push('📊 Statistical caution: ' + validation.reason);
            }
        } catch (e) { logger.warn('[Stats] Validation failed:', e.message); }
    }

    // ─── Logging ──────────────────────────────────────────────────────────
    logger.info('[engine] Score: ' + analysis.score + '/12 | Bias: ' + analysis.bias + ' | Signal: ' + analysis.signal);
    logger.info('[engine] ML Prob: ' + (analysis.mlWinProb || 0.5).toFixed(2) + ' | Corr Dev: ' + (analysis.correlationDeviation || 0).toFixed(2));
    if (analysis.marketTrend) {
        logger.info('[engine] Market Trend: ' + analysis.marketTrend.direction + ' (strength: ' + analysis.marketTrend.strength.toFixed(2) + ')');
    }

    let sc = getSymConfig(cfg.symbol);
    if (spread && spread.spread > sc.spreadLimit * 2) {
        logger.warn(`[engine] Wide spread ${spread.spread} > ${sc.spreadLimit * 2} – proceed with caution`);
    }

    // Several bonuses (order flow, ML, seasonality, macro) are added after
    // the earlier clamp, so scores like 12.8/12 reached the journal/Telegram.
    analysis.score = Math.round(Math.min(12, Math.max(0, analysis.score)) * 100) / 100;

    let mpFull = getModeParams(cfg);
    let effMin = Math.max(mpFull.minScore, getSessionVolatilityPattern(analysis.session.session).minScore || 0);
    if (analysis.advancedRegime && analysis.advancedRegime.confidence > .5) {
        let rec = analysis.advancedRegime.recommendations;
        if (rec) {
            if (analysis.advancedRegime.regime === 'ranging') effMin = Math.max(effMin, 2);
            if (analysis.advancedRegime.regime === 'strong_trend') effMin = Math.max(effMin - 1, 1);
        }
    }
    effMin = Math.max(effMin, 3);

    let relaxed = getRelaxedParams(state, analysis, cfg, regime);
    // effMin at this point (from the session/regime-aware chain above,
    // lines 4232-4240) was previously discarded entirely and replaced with
    // relaxed.effectiveMinScore alone — meaning the actual live threshold
    // for taking a trade had zero awareness of session or regime context,
    // only idle time and recent global performance. Fixed 2026-08-08,
    // deliberately conservative given the reason this was investigated
    // (a losing week with heavy trade volume): the relaxer can still
    // TIGHTEN the threshold further (e.g. recent Sharpe is bad), but its
    // LOOSENING behavior is now capped at the context floor rather than
    // able to override it — idle time or one high-scoring setup can no
    // longer push the bar below what today's session/regime already
    // established as sensible.
    const contextFloor = effMin;
    const relaxerRaw = relaxed.effectiveMinScore + minScoreAdj;
    effMin = Math.min(8, relaxerRaw > contextFloor ? relaxerRaw : contextFloor);

    const globalAdj2 = enhancedLearner.getGlobalAdjustments();
    // Previously bounded only by Math.max(1, ...) — meaning this stage alone
    // could drag the live threshold as low as 1/12 even after the Aug 8 fix
    // capped the relaxer above. Now applies the same rule: the enhanced
    // learner can TIGHTEN the threshold further, but not loosen it below
    // the context floor (session/regime baseline) or a hard absolute floor.
    // Fixed 2026-08-12 — root cause of a too-low win rate: minScore could
    // reach dangerously low values once the relaxer, frequency manager, and
    // enhanced learner adjustments all stacked in the loosening direction.
    const ABS_MIN_SCORE_FLOOR = 4;
    const afterGlobal = effMin + globalAdj2.minScoreOffset;
    effMin = Math.max(ABS_MIN_SCORE_FLOOR, afterGlobal >= contextFloor ? afterGlobal : contextFloor);
    cfg.risk = Math.min(3, Math.max(0.3, cfg.risk * globalAdj2.riskMultiplier));
    if (!V1 && (globalAdj2.minScoreOffset !== 0 || globalAdj2.riskMultiplier !== 1)) {
        logger.info(`[EnhancedLearner] Applied adjustments: minScoreOffset=${globalAdj2.minScoreOffset}, riskMult=${globalAdj2.riskMultiplier}`);
    }
    // v1: one fixed score bar — BOT_MIN_SCORE (floor 4), or the session /
    // mode minimum if higher. No idle-time relaxer, frequency manager or
    // learner offsets, so the bar means the same thing every day. 2026-10-24.
    if (V1) {
        effMin = Math.max(4, cfg.minScore || 4, mpFull.minScore || 0, getSessionVolatilityPattern(analysis.session.session).minScore || 0);
        cfg.risk = cfg._riskConfigured;
    }

    if (cfg.debug) logger.info('[DEBUG] AGGRESSIVE effMin=' + effMin + ' (reason: ' + relaxed.reason + ')');

    // Tightened 2026-08-12 for precision (too many losses on trades that did
    // clear the score bar): now requires the trade to align with the higher
    // timeframe bias and have volume confirming the move — both were
    // previously optional, which let the score alone justify counter-trend
    // or unconfirmed entries. Also raised the bar on how well similar past
    // setups needed to have performed, and tightened the spread ceiling.
    // Previously hardcoded inline instead of using the project's own
    // configImports.TRADE_QUALITY_FILTERS (src/config/defaults.js) — which
    // turned out to already specify requireNewsAlignment: true and
    // maxSpreadMultiplier: 2.0, both silently overridden by the inline
    // guesses here (false and 2.5). Now pulls from the real config, falling
    // back to the same values only if the import fails. Fixed 2026-08-13
    // after the full project was shared and this drift became visible.
    let _tqCfg = configImports.TRADE_QUALITY_FILTERS || {
        requireHTFAlignment: true,
        requireVolumeConfirmation: true,
        requireNewsAlignment: true,
        requireSeasonality: true,
        minSimilarWinRate: 0.45,
        maxSpreadMultiplier: 2.0
    };
    // v1: the gate keeps its price-based checks (HTF alignment, VSA, spread,
    // volatile regime) and drops the learned / outside-data ones (news
    // direction, hour win rate, similar-setup win rate).
    if (V1) _tqCfg = Object.assign({}, _tqCfg, { requireNewsAlignment: false, requireSeasonality: false, minSimilarWinRate: 0 });
    let qr = evaluateTradeQuality(analysis, learnJ, _tqCfg);
    // Was advisory only (a -0.5 score penalty, no block), then partially
    // hardened 2026-08-13 to hard-block ONLY when the reason text matched
    // "HTF" — a stopgap at the time, since all I had was the Telegram output
    // text, not the actual filter logic. The full project was shared later
    // that day, revealing src/filters/trade-quality.js in full: `pass` is a
    // deliberate, well-formed AND across every sub-check (HTF alignment,
    // VSA/volume confirmation, news alignment, seasonality, similar-setup
    // win rate, spread, and an UNCONDITIONAL "regime==='volatile' &&
    // score<9" rule that isn't even gated by the config flags passed in).
    // The HTF-only text match was leaving a real gap: a trade that failed
    // ONLY the volatile-regime rule (without also failing HTF) still slipped
    // through on a token 0.5-point penalty. Now blocks on any qr.pass
    // failure, honoring the function's actual designed contract instead of
    // a partial guess at it. Fixed 2026-08-13.
    if (!qr.pass && analysis.signal !== 'none') {
        // Log the setup that was about to be taken before the quality gate
        // killed it — see COUNTERFACTUAL LOGGING above for why.
        logCounterfactual(analysis, analysis.signal, price, analysis.atr || atr14, regime, cfg, 'quality_gate: ' + qr.reasons.join('; '));
        analysis.hits.push('🚫 Blocked by quality check: ' + qr.reasons.join('; '));
        analysis.signal = 'none';
        analysis.score = 0;
    }

    let scalp = null;
    if (!V1 && analysis.signal !== 'none' && analysis.score < effMin) {
        scalp = analyzeScalp(m5, m15, atr14, price, session);
        if (scalp && scalp.signal !== 'none' && scalp.score >= 2) {
            logger.info('[scalp] Using scalp signal: ' + scalp.signal + ' score ' + scalp.score);
            analysis.signal = scalp.signal;
            analysis.score = scalp.score;
            analysis.hits = scalp.hits;
            analysis.entryType = 'scalp';
            analysis.scalpMultipliers = { stop: scalp.stopMultiplier || 0.25, take: scalp.takeMultiplier || 0.7 };
        }
    }

    if (cfg.debug) {
        logger.info('[DEBUG] AGGRESSIVE Analysis: Score=' + analysis.score + ', Signal=' + analysis.signal + ', Hits=' + JSON.stringify(analysis.hits));
        logger.info('[DEBUG] effMin=' + effMin);
    }

    if (analysis.signal === 'none' || analysis.score < effMin) {
        if (cfg.debug) logger.info('[DEBUG] No trade: signal=' + analysis.signal + ', score=' + analysis.score + ', min=' + effMin);
        // Score too low to trade but a real direction existed — log it too,
        // separately from quality_gate rejections, so "the bar is just too
        // high" and "the setup itself failed a specific check" can be told
        // apart in the report.
        if (analysis.signal !== 'none') {
            logCounterfactual(analysis, analysis.signal, price, analysis.atr || atr14, regime, cfg, 'below_min_score: ' + analysis.score + '/' + effMin);
        }
        updateBotState({ analysis: {
            score: analysis.score, bias: analysis.bias, signal: analysis.signal,
            hits: analysis.hits, price, kzOn: analysis.kzOn, sbOn: analysis.sbOn,
            liqSwept: analysis.liq && analysis.liq.swept, mssDir: analysis.mss && analysis.mss.dir,
            fvgCount: analysis.fvgs && analysis.fvgs.length, obCount: analysis.obs && analysis.obs.length,
            ote: analysis.ote, tripleZone: analysis.tripleZone, fullMTFAlign: analysis.fullMTFAlign,
            adx: analysis.adxData && analysis.adxData.adx, session: session.label,
            regime: regime.regime, nestedFVG: analysis.nestedFVG,
            divergence: analysis.divergence && analysis.divergence.type || 'none',
            patterns: analysis.patterns && analysis.patterns.patterns && analysis.patterns.patterns.length || 0,
            mtfScore: analysis.mtfScore && analysis.mtfScore.total || 0,
            vsaConfirms: analysis.vsaConfirms || false, hasBreaker: analysis.hasBreaker || false,
            candlePattern: analysis.candlePattern || null,
            newsSentiment: analysis.newsSentiment || 'neutral', newsScore: analysis.newsScore || 0,
            factors: analysis.factors || [],
            mlWinProb: analysis.mlWinProb || 0.5,
            correlationDeviation: analysis.correlationDeviation || 0,
            seasonalityPattern: analysis.seasonalityPattern || 'neutral',
            turtleSoup: analysis.turtleSoup || false,
            macroTrend: analysis.macroTrend || false,
            marketTrend: analysis.marketTrend || null,
            topDownBias: analysis.topDownBias || 'neutral',
            tradeDuration: analysis.tradeDuration || 'normal'
        }, bal: balance, eq: equity, positions: ourPositions });
        return { status: 'no_signal', message: 'Score ' + analysis.score + '/' + effMin, analysis };
    }

    let hasKeyConfluence = (analysis.fvgs && analysis.fvgs.length > 0) ||
                           (analysis.obs && analysis.obs.length > 0) ||
                           (analysis.mss && analysis.mss.dir !== 'neutral') ||
                           (analysis.bias !== 'neutral' && analysis.bias === analysis.signal);
    if (!hasKeyConfluence && analysis.score < 6) {
        return { status: 'no_confluence', message: 'No key confluence and score < 6', analysis };
    }

    let hasFVGorOB = (analysis.fvgs && analysis.fvgs.length || analysis.obs && analysis.obs.length);
    let hasRealMSS = (analysis.mss && analysis.mss.dir && analysis.mss.dir !== 'neutral') ||
                     (analysis.hits && analysis.hits.some(h => h && (h.includes('CHoCH') || h.includes('BOS'))));
    let hasJudas = !!(analysis.po3 && analysis.po3.judas && analysis.signal !== 'none');
    let hasAggro = cfg.mode === 'aggressive' && analysis.bias !== 'neutral' && analysis.signal !== 'none';
    let hasMSS = hasRealMSS || hasJudas || hasAggro;

    if (!hasMSS && analysis.score < 6) {
        return { status: 'no_mss', message: 'No MSS and score < 6', analysis };
    }

    let same = null;
    for (let p of symbolPositions) {
        if (!((analysis.signal === 'buy' && p.type === 'POSITION_TYPE_BUY') || (analysis.signal === 'sell' && p.type === 'POSITION_TYPE_SELL'))) continue;
        // v1: a second trade the same way is allowed once the first one's
        // stop is at breakeven or better (its own risk is then gone; the
        // open-risk cap in placeTrade checks the rest). Its TP1 leg doesn't
        // count as a separate trade.
        if (V1 && V1.sameDirAfterBE) {
            if (v1IsLegA(p)) continue;
            const e = parseFloat(p.openPrice) || 0, slp = parseFloat(p.stopLoss) || 0, isB = p.type === 'POSITION_TYPE_BUY';
            if (e && slp && (isB ? slp >= e : slp <= e)) continue;
        }
        same = p; break;
    }
    if (same) return { status: 'duplicate', message: 'Already have ' + analysis.signal + ' open', analysis };

    // ─── v1 entry gate: daily stop, trading hours, news, data, spread ────
    if (V1) {
        const setupBar = aTf.tf === '1h' && aTf.m15.length ? new Date(aTf.m15[aTf.m15.length - 1].time).getTime() : 0;
        const why = v1EntryGate(V1, { now: Date.now(), m15, atr: atr14, quote: spread, positions: ourPositions, usualSpread: cfg._v1UsualSpread })
            || v1EntryFilters(V1, analysis, aTf.m15, aTf.atr || analysis.atr)
            || (setupBar && setupBar === _v1LastEntryBar ? 'already traded this 1-hour candle' : null);
        if (why) {
            v1NoteBlock(why, analysis);
            logCounterfactual(analysis, analysis.signal, price, analysis.atr || atr14, regime, cfg, 'v1_gate: ' + why);
            if (/^daily stop/.test(why) && state._v1DailyStopNotified !== sastDateStr(new Date())) {
                updateBotState({ _v1DailyStopNotified: sastDateStr(new Date()) });
                sendTelegram('🛑 *Daily stop reached* — ' + why + '. No new trades until tomorrow (SAST); open trades are still managed.');
            }
            return { status: 'v1_blocked', message: 'Not placed: ' + why, analysis };
        }
        cfg._v1Positions = ourPositions;
    }

    let consecLosses = state.consecLosses || 0, consecWins = state.consecWins || 0;

    try {
        // ─── Update portfolio risk before placing trade ──────────────────
        portfolioRisk.update(equity, ourPositions);

        const trendFactor = 0.5 + (analysis.trendQuality || 50) / 100 * 1.5;
        const finalRegimeMult = (regime.lotMod || 1) * sizeMultiplier * Math.max(0.5, Math.min(2.0, trendFactor));

        if (DRY_RUN) {
            sendTelegram(`🧪 DRY RUN: ${analysis.signal.toUpperCase()} trade (score ${analysis.score}) at ${price.toFixed(2)} would be placed.`);
            return { status: 'dry_run', message: 'Dry run: ' + analysis.signal.toUpperCase() + ' trade', analysis };
        }

        // ─── Daily trade cap ──────────────────────────────────────────────
        // cfg.maxDailyTrades (botConfig.maxDailyTrades / MAX_DAILY_TRADES env,
        // default 20) existed but nothing ever checked it — the only limit on
        // re-entries was the 3-position cap and a 1-minute cooldown (the
        // 2026-08-13 incident placed 118 trades in a day). Counted from the
        // journal per SAST calendar day, so it can't drift. Added 2026-10-23.
        const maxDaily = cfg.maxDailyTrades > 0 ? cfg.maxDailyTrades : 20;
        const todayKey = sastDateStr(new Date());
        const placedToday = (journal.trades || []).filter(t => t && t.ts && sastDateStr(new Date(t.ts)) === todayKey).length;
        if (placedToday >= maxDaily) {
            if (state._dailyCapNotified !== todayKey) {
                updateBotState({ _dailyCapNotified: todayKey });
                sendTelegram(`⏸️ Daily trade cap reached (${placedToday}/${maxDaily}) — no new trades until tomorrow (SAST). Open trades are still managed.\nChange with MAX_DAILY_TRADES or botConfig.maxDailyTrades.`);
            }
            return { status: 'daily_cap', message: `Daily trade cap reached (${placedToday}/${maxDaily})`, analysis };
        }

        const trade = await placeTrade(cfg, analysis, balance, consecLosses, consecWins, finalRegimeMult, state);
        // placeTrade's refusals (R:R floor, 6+ conflicts, margin) used to be
        // reported only as "No order returned" — now says which.
        if (!trade || !trade.order) {
            // v1 refusals (size, cost, open risk) are expected outcomes, not failures.
            if (V1 && trade && trade.v1Block) {
                v1NoteBlock(trade.error, analysis);
                logCounterfactual(analysis, analysis.signal, price, analysis.atr || atr14, regime, cfg, 'v1_' + trade.v1Block + ': ' + trade.error);
                return { status: 'v1_blocked', message: 'Not placed: ' + trade.error, analysis };
            }
            return { status: 'trade_failed', message: (trade && trade.error) ? 'Not placed: ' + trade.error : 'No order returned', analysis };
        }

        if (V1 && aTf.tf === '1h' && aTf.m15.length) _v1LastEntryBar = new Date(aTf.m15[aTf.m15.length - 1].time).getTime();
        let tradeId = normalizePositionId(trade.order && (trade.order.positionId || trade.order.orderId) || String(Date.now()));
        analysis.tradeNumber = (state.totalTrades || 0) + 1;
        const tv1 = trade.v1;
        journalTrade(tradeId, analysis, trade.entryPrice, trade.sl, trade.tp, trade.lots, trade.tp1, trade.tp2, trade.tp3, analysis.factors, tv1 ? {
            strategyVersion: STRATEGY_VERSION, riskAmount: Math.round(tv1.riskAmount * 100) / 100, riskPct: Math.round(tv1.riskPct * 1000) / 1000,
            costFrac: typeof tv1.costFrac === 'number' ? Math.round(tv1.costFrac * 10000) / 10000 : null, spreadAtEntry: tv1.spreadAtEntry,
            decisionPrice: tv1.decisionPrice, legAId: tv1.legAId || null, twoLeg: !!tv1.twoLeg, serverTrail: !!tv1.serverTrail,
            currency: (global._v1Account || {}).currency || null, finalTp: trade.tp } : null);
        // Market fills are live positions now — watch them for closes from
        // this moment (a pending limit order joins once it shows up as a
        // position, otherwise an unfilled order would be "unreconcilable").
        if (String(trade.entryType || '').indexOf('limit') === -1 && (trade.order.positionId || trade.order.orderId)) {
            trackOpenPosition(tradeId);
            if (tv1 && tv1.legAId) trackOpenPosition(tv1.legAId);
        }

        updateBotState({
            weekTrades: (state.weekTrades || 0) + 1,
            dailyTrades: (state.dailyTrades || 0) + 1,
            lastTradeDir: analysis.signal,
            lastTradeSL: { price: trade.sl, time: new Date().toISOString() },
            consecPauseSent: false,
            lastSLHit: null,
            lastTradeTime: Date.now(),
            totalTrades: (state.totalTrades || 0) + 1,
            analysis: {
                score: analysis.score, bias: analysis.bias, signal: analysis.signal,
                hits: analysis.hits, price, kzOn: analysis.kzOn, sbOn: analysis.sbOn,
                liqSwept: analysis.liq && analysis.liq.swept, mssDir: analysis.mss && analysis.mss.dir,
                fvgCount: analysis.fvgs && analysis.fvgs.length, obCount: analysis.obs && analysis.obs.length,
                ote: analysis.ote, tripleZone: analysis.tripleZone, fullMTFAlign: analysis.fullMTFAlign,
                adx: analysis.adxData && analysis.adxData.adx, session: session.label,
                regime: regime.regime, nestedFVG: analysis.nestedFVG,
                divergence: analysis.divergence && analysis.divergence.type || 'none',
                patterns: analysis.patterns && analysis.patterns.patterns && analysis.patterns.patterns.length || 0,
                mtfScore: analysis.mtfScore && analysis.mtfScore.total || 0,
                vsaConfirms: analysis.vsaConfirms || false, hasBreaker: analysis.hasBreaker || false,
                candlePattern: analysis.candlePattern || null, entryType: analysis.entryType || 'main',
                newsSentiment: analysis.newsSentiment || 'neutral', newsScore: analysis.newsScore || 0,
                factors: analysis.factors || [],
                mlWinProb: analysis.mlWinProb || 0.5,
                correlationDeviation: analysis.correlationDeviation || 0,
                seasonalityPattern: analysis.seasonalityPattern || 'neutral',
                turtleSoup: analysis.turtleSoup || false,
                macroTrend: analysis.macroTrend || false,
                is3TPSplit: trade.is3TPSplit || false,
                marketTrend: analysis.marketTrend || null,
                topDownBias: analysis.topDownBias || 'neutral',
                tradeDuration: analysis.tradeDuration || 'normal'
            },
            bal: balance, eq: equity, positions: ourPositions
        });

        let extra = '';
        if (analysis.divergence && analysis.divergence.type !== 'none') extra += '\n🔄 Divergence: ' + analysis.divergence.type;
        if (analysis.patterns && analysis.patterns.patterns && analysis.patterns.patterns.length) extra += '\n📊 Pattern: ' + analysis.patterns.patterns[0].type;
        if (analysis.mtfScore && analysis.mtfScore.aligned) extra += '\n📈 MTF Score: ' + analysis.mtfScore.total.toFixed(1);
        if (analysis.nestedFVG) extra += '\n🎯 ' + analysis.nestedFVGLabel;
        if (analysis.vsaConfirms) extra += '\n📊 VSA confirms: ' + analysis.vsaSignal;
        if (analysis.hasBreaker) extra += '\n🔓 Breaker: ' + analysis.breakerSignal;
        if (analysis.candlePattern) extra += '\n🕯️ Pattern: ' + analysis.candlePattern;
        if (analysis.entryType === 'scalp') extra += '\n⚡ SCALP ENTRY';
        if (analysis.dxyTrend) extra += '\n📈 DXY: ' + analysis.dxyTrend.toUpperCase();
        if (analysis.mlWinProb && analysis.mlWinProb > 0.55) extra += '\n🤖 ML Conf: ' + (analysis.mlWinProb * 100).toFixed(0) + '%';
        if (analysis.seasonalityPattern && analysis.seasonalityPattern !== 'neutral') extra += '\n📅 Seasonality: ' + analysis.seasonalityPattern;
        if (analysis.correlationDeviation && analysis.correlationDeviation < 0.2) extra += '\n🔄 Correlation: Normal';
        if (analysis.turtleSoup && analysis.turtleSoup.pattern !== 'none') extra += '\n🐢 Turtle Soup: ' + analysis.turtleSoup.pattern;
        if (analysis.macroTrend && analysis.macroTrend.confidence > 0.6) extra += '\n📊 Macro Trend: ' + analysis.macroTrend.overall;
        if (analysis.marketTrend && analysis.marketTrend.isStrongTrend) extra += '\n📈 Trend: ' + analysis.marketTrend.direction.toUpperCase() + ' (strong)';
        if (analysis.topDownBias && analysis.topDownBias !== 'neutral') extra += '\n⬆️ Top-Down Bias: ' + analysis.topDownBias.toUpperCase();
        if (orderBookSig.confidence > 0.5) extra += '\n📊 Order Book: ' + orderBookSig.action + ' (conf ' + orderBookSig.confidence.toFixed(2) + ')';
        if (flowSig.confidence > 0.5) extra += '\n📊 Flow: ' + flowSig.signal + ' (conf ' + flowSig.confidence.toFixed(2) + ')';
        if (intermarketSig.confidence > 0.5) extra += '\n📈 Intermarket Adv: ' + intermarketSig.bias + ' (conf ' + intermarketSig.confidence.toFixed(2) + ')';
        if (newsNLPSig.confidence > 0.5) extra += '\n📰 News NLP: ' + newsNLPSig.bias + ' (conf ' + newsNLPSig.confidence.toFixed(2) + ')';
        if (etfSig.confidence > 0.5) extra += '\n📊 ETF Flows: ' + etfSig.signal + ' (conf ' + etfSig.confidence.toFixed(2) + ')';
        if (optionsSig.confidence > 0.5) extra += '\n📊 Options: ' + optionsSig.signal + ' (conf ' + optionsSig.confidence.toFixed(2) + ')';
        if (seasonalitySig.confidence > 0.5) extra += '\n📅 Seasonality: ' + seasonalitySig.bias + ' (conf ' + seasonalitySig.confidence.toFixed(2) + ')';
        if (xgboostSig.confidence > 0.5) extra += '\n🧠 XGBoost: ' + (xgboostSig.probability*100).toFixed(0) + '% (conf ' + xgboostSig.confidence.toFixed(2) + ')';
        if (cotSig.confidence > 0.5) extra += '\n📊 COT: ' + cotSig.signal + ' (conf ' + cotSig.confidence.toFixed(2) + ')';
        if (macroSig.confidence > 0.5) extra += '\n📈 Macro: ' + macroSig.bias + ' (conf ' + macroSig.confidence.toFixed(2) + ')';
        if (hmmRegime.confidence > 0.5) extra += '\n🌀 HMM Regime: ' + hmmRegime.regime + ' (conf ' + hmmRegime.confidence.toFixed(2) + ')';
        const portfolioRiskResult = portfolioRisk.getRecommendation(equity);
        const recoveryResult = recoveryManager.getRecommendation();
        if (portfolioRiskResult.drawdown > 0.05) extra += `\n📉 Portfolio DD: ${(portfolioRiskResult.drawdown*100).toFixed(1)}%`;
        if (recoveryResult.mode !== 'normal') extra += `\n🔄 Recovery: ${recoveryResult.mode} mode`;
        if (global._intermarketData && global._intermarketData.sentiment !== 'neutral') extra += `\n🌍 Intermarket: ${global._intermarketData.sentiment}`;
        if (global._volatilitySkew && global._volatilitySkew.vix > 0) extra += `\n📊 VIX: ${global._volatilitySkew.vix.toFixed(1)}`;
        extra += `\n⏱️ Trade type: ${analysis.tradeDuration || 'normal'}`;

        if (sizeMultiplier < 1) extra += `\n⚠️ Size reduced to ${(sizeMultiplier * 100).toFixed(0)}% due to loss streak`;
        let _conflictN = countConflicts(analysis.hits);
        if (_conflictN > 0 && !tv1) extra += `\n⚠️ ${_conflictN} conflict flag(s) — size scaled to ${(getConflictSizeMult(_conflictN) * 100).toFixed(0)}%`;

        // Runner trades show both targets (see "Runner structure" in placeTrade).
        const d1 = Math.abs(trade.tp1 - trade.entryPrice).toFixed(2), dF = Math.abs(trade.tp - trade.entryPrice).toFixed(2);
        let tpLines;
        if (tv1 && trade.tp !== trade.tp1) {
            const legLot = tv1.twoLeg ? parseFloat((trade.lots - tv1.mainLots).toFixed(2)) : trade.partialLot;
            tpLines = [tv1.twoLeg ? 'TP1: ' + trade.tp1.toFixed(2) + ' (' + d1 + 'pts) — ' + legLot + ' lot closes there at the broker; the stop then goes to breakeven'
                : trade.runner ? 'TP1: ' + trade.tp1.toFixed(2) + ' (' + d1 + 'pts) — the bot closes ' + legLot + ' lot; the stop then goes to breakeven'
                : 'TP1: ' + trade.tp1.toFixed(2) + ' (' + d1 + 'pts) — single lot: the stop goes to breakeven there',
                'Final TP: ' + trade.tp.toFixed(2) + ' (' + dF + 'pts) — after TP1 the stop steps up every 0.5R' + (tv1.serverTrail ? ' (also held on MetaAPI\'s servers)' : '')];
        } else if (trade.runner) {
            tpLines = ['TP1: ' + trade.tp1.toFixed(2) + ' (' + d1 + 'pts) — close ' + trade.partialLot + ' lot, SL to breakeven',
               'Final TP: ' + trade.tp.toFixed(2) + ' (' + dF + 'pts) — the rest runs with the trailing stop'];
        } else tpLines = ['TP: ' + trade.tp.toFixed(2) + ' (' + dF + 'pts)'];
        const riskLine = tv1
            ? 'Lots: ' + trade.lots + ' | Risk: ' + ((global._v1Account || {}).currency || cfg.currency) + ' ' + tv1.riskAmount.toFixed(2) + ' (' + tv1.riskPct.toFixed(2) + '%) | Cost: ' + (typeof tv1.costFrac === 'number' ? (tv1.costFrac * 100).toFixed(1) + '% of stop' : '—') + ' | score ' + analysis.score + '/12 · ' + STRATEGY_VERSION
            : 'Lots: ' + trade.lots + ' | Risk: ' + (cfg.risk || 1.5).toFixed(1) + '% (score ' + analysis.score + '/12)';
        if (tv1 && tv1.legAError) extra += '\n⚠️ TP1 leg not placed (' + String(tv1.legAError).slice(0, 80) + ') — ' + (trade.runner ? 'the bot closes the TP1 lot itself' : 'single position');
        sendTelegram(['✅ *TRADE PLACED* — ' + analysis.signal.toUpperCase() + (analysis.entryType === 'scalp' ? ' (SCALP)' : ''), '', 'Symbol: ' + cfg.symbol + ' | ' + session.label, 'Regime: ' + regime.regime, 'Entry: ' + trade.entryPrice.toFixed(2) + ' (' + trade.entryType + ')', 'SL: ' + trade.sl.toFixed(2) + ' (' + Math.abs(trade.entryPrice - trade.sl).toFixed(2) + 'pts)']
            .concat(tpLines)
            .concat([riskLine, extra, '', 'Hits: ' + analysis.hits.join(', ')])
            .filter(line => line !== '').join('\n'));

        saveZoneMemory();
        return { status: 'trade_placed', message: analysis.signal.toUpperCase() + ' ' + trade.lots + 'lot score ' + analysis.score + '/12', analysis, order: trade.order };
    } catch (e) {
        logger.error('[engine] Trade execution error:', e.message);
        metrics.recordError(e);
        if (shouldSendError(e.message)) sendTelegram('❌ Trade failed\n' + e.message + '\nScore: ' + analysis.score + '/12');
        return { status: 'error', message: 'Trade failed: ' + e.message, analysis };
    }
}

// ─── RUN CYCLE (with watchdog) ──────────────────────────────────────────────
let _cycleInFlight = false;
let _cycleStartTime = 0;

async function runCycle() {
    if (_cycleInFlight) {
        const stuckDuration = Date.now() - _cycleStartTime;
        if (stuckDuration > 180000) {
            logger.warn(`[engine] Previous cycle stuck for ${stuckDuration}ms, forcing reset`);
            _cycleInFlight = false;
        } else {
            logger.warn('[engine] runCycle skipped — previous cycle still in flight');
            return { status: 'skipped_overlap' };
        }
    }
    _cycleInFlight = true;
    _cycleStartTime = Date.now();
    let start = Date.now();
    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Cycle timed out after 120s')), 120000);
        });
        const result = await Promise.race([_runCycleInner(), timeoutPromise]);
        // v1: outside dead-man ping after a good cycle, and expiry reminders
        // (token / free database) once a day. Both never throw. 2026-10-24.
        if (v1On()) { v1Heartbeat(result); v1CheckReminders(getCfg()); }
        let dur = Date.now() - start;
        metrics.recordCycle(dur);
        let alert = metrics.shouldAlert();
        if (alert && alert.alert) sendTelegram('⚠️ Performance Alert: ' + alert.message);
        return result;
    } catch (e) {
        if (shouldSendError(e.message)) sendTelegram('🚨 Engine error: ' + e.message.slice(0, 200));
        metrics.recordError(e);
        logger.error('[engine] runCycle uncaught:', e && e.stack || e);
        _stampLastRun({ _lastCrash: { message: String(e && e.message || e), time: new Date().toISOString() } });
        return { status: 'error', message: 'Uncaught: ' + (e && e.message || e) };
    } finally {
        _cycleInFlight = false;
    }
}

// Standard FX/gold weekly market schedule (broker-server-independent
// convention: Friday ~21:00 UTC close, Sunday ~22:00 UTC open). This is
// industry convention, not verified against Trent's specific broker's
// exact close/open minute — named as constants so they're easy to adjust
// if XM's actual schedule differs. Added 2026-08-07 after isTradingTime
// was found to be a stub (always true) that was ALSO never called
// anywhere, meaning the bot had zero market-hours awareness of its own
// and relied entirely on the broker rejecting trades after the fact —
// the direct cause of repeated TRADE_RETCODE_MARKET_CLOSED spam, since
// every cycle re-ran full analysis and re-attempted the trade regardless
// of whether the market was actually open.
const MARKET_CLOSE_UTC_DAY = 5;   // Friday
const MARKET_CLOSE_UTC_HOUR = 21;
const MARKET_OPEN_UTC_DAY = 0;    // Sunday
const MARKET_OPEN_UTC_HOUR = 22;

function isTradingTime(cfg) {
    // v1: XM's real hours in server time (see v1MarketState), which follow
    // New York's clock changes. The fixed UTC hours below were only right in
    // US summer time: from November the bot would have started its Sunday
    // cycles an hour before gold reopened, on Friday's candles. 2026-10-24.
    if (v1On()) return v1MarketState(Date.now()).open;
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    // All of Saturday is closed.
    if (day === 6) return false;
    // Friday after the close hour is closed.
    if (day === MARKET_CLOSE_UTC_DAY && hour >= MARKET_CLOSE_UTC_HOUR) return false;
    // Sunday before the open hour is closed.
    if (day === MARKET_OPEN_UTC_DAY && hour < MARKET_OPEN_UTC_HOUR) return false;
    return true;
}

// Returns a YYYY-MM-DD string for the given date in SAST (Africa/Johannesburg),
// not UTC. The daily report used to bucket trades by UTC calendar day
// (`toISOString().split('T')[0]`) while everything else about the bot (the
// dashboard, trade timestamps shown to Trent) is SAST-oriented — trades
// placed in the UTC-date gap could fail to match "today" depending on when
// the report fired. Fixed 2026-08-13.
function sastDateStr(d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// ─── DETAILED DAILY TRADE LIST ─────────────────────────────────────────────
// Formats every trade placed today into a numbered, Telegram-friendly list
// and sends it in chunks (Telegram caps a single message at 4096 chars, and
// long messages are hard to read on mobile anyway). Each entry includes not
// just the trade itself but WHY it was taken: the confluence factors that
// fired, the individual score components recorded at entry, and the ML/RL
// model confidences — so it can be reviewed trade-by-trade, not just as a
// win/loss tally.
function formatDailyTradeLine(t, idx) {
    const time = t.ts ? new Date(t.ts).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';
    const dir = (t.signal || '?').toUpperCase();
    const entry = typeof t.entryPrice === 'number' ? t.entryPrice.toFixed(2) : (t.entryPrice || '?');
    const sl = typeof t.sl === 'number' ? t.sl.toFixed(2) : (t.sl || '?');
    const tp = typeof t.tp === 'number' ? t.tp.toFixed(2) : (t.tp || '?');
    const lots = t.lots != null ? t.lots : '?';
    let status, pnlStr;
    if (t.outcome === 'win') { status = '✅ WIN'; pnlStr = (t.pnl >= 0 ? '+' : '') + (t.pnl != null ? t.pnl.toFixed(2) : '0.00'); }
    else if (t.outcome === 'loss') { status = '❌ LOSS'; pnlStr = (t.pnl != null ? t.pnl.toFixed(2) : '0.00'); }
    else { status = '⏳ OPEN'; pnlStr = t.partialClosed ? 'partial ' + (t.partialPnl >= 0 ? '+' : '') + (t.partialPnl != null ? t.partialPnl.toFixed(2) : '0.00') : '—'; }
    const partials = [t.tp1Hit && 'TP1', t.tp2Hit && 'TP2', t.tp3Hit && 'TP3'].filter(Boolean).join('/');

    // "Why" — the confluence factors the score was built from, plus the
    // named signal booleans that were true at entry.
    const why = [];
    if (t.hits && t.hits.length) why.push(...t.hits);
    if (t.mssType) why.push('MSS:' + t.mssType);
    if (t.liqSwept) why.push('liquidity swept');
    if (t.ote) why.push('OTE');
    if (t.tripleZone) why.push('triple zone');
    if (t.fullMTFAlign) why.push('full MTF align');
    if (t.hasBreaker) why.push('breaker' + (t.breakerSignal ? ':' + t.breakerSignal : ''));
    if (t.vsaConfirms) why.push('VSA' + (t.vsaSignal ? ':' + t.vsaSignal : ''));
    if (t.judas) why.push('judas swing');
    if (t.eqHLBonus) why.push('eq H/L bonus');
    if (t.turtleSoup) why.push('turtle soup');
    if (t.candlePattern) why.push(t.candlePattern);
    const whyStr = why.length ? why.join(', ') : 'no confluence factors recorded';

    const mlStr = `ML conf ${Math.round((t.mlConfidence || 0) * 100)}% | win prob ${Math.round((t.mlWinProb != null ? t.mlWinProb : 0.5) * 100)}% | Bayesian ${Math.round((t.bayesianWinProb || 0) * 100)}%`;

    return `${idx}. ${time} ${dir} @ ${entry} | SL ${sl} TP ${tp} | ${lots} lots\n` +
           `   Score ${t.score != null ? t.score : '?'} (${t.sessionLabel || t.session || '?'}) — ${whyStr}\n` +
           `   ${mlStr}\n` +
           `   ${status} ${pnlStr}${partials ? ' [' + partials + ' hit]' : ''}`;
}

// Formats getFactorWinRates() output for Telegram. Only shows factors that
// cleared the minimum-sample bar in getFactorWinRates itself — this
// function doesn't add its own filtering, just presentation, so what you
// see here is exactly what had enough data to say something about.
async function sendFactorReport(allTrades) {
    const fw = getFactorWinRates(allTrades);
    if (fw.sampleSize < FACTOR_WIN_RATE_MIN_SAMPLE * 2) {
        await sendTelegram('📊 Factor Win Rates\n\n' + (fw.note || `Only ${fw.sampleSize} closed trades — not enough data yet.`));
        return;
    }
    let lines = [`📊 *Factor Win Rates* (${fw.sampleSize} closed trades)`];
    const boolKeys = Object.keys(fw.booleans);
    if (boolKeys.length) {
        lines.push('\n*Boolean factors (present vs absent):*');
        for (const factor of boolKeys) {
            const b = fw.booleans[factor];
            const p = b.present && b.present.winRate != null ? `${b.present.winRate}% (${b.present.trades})` : `n/a (${b.present ? b.present.trades : 0})`;
            const a = b.absent && b.absent.winRate != null ? `${b.absent.winRate}% (${b.absent.trades})` : `n/a (${b.absent ? b.absent.trades : 0})`;
            lines.push(`${factor}: present ${p} vs absent ${a}`);
        }
    }
    const catKeys = Object.keys(fw.categoricals);
    if (catKeys.length) {
        lines.push('\n*Categorical factors:*');
        for (const factor of catKeys) {
            lines.push(`${factor}: ` + fw.categoricals[factor].map(c => `${c.key} ${c.winRate}% (${c.trades})`).join(', '));
        }
    }
    if (!boolKeys.length && !catKeys.length) {
        lines.push('\nNo individual factor has enough sample size yet — check back after more trades.');
    }
    await sendTelegram(lines.join('\n'));
}

async function sendDailyTradeList(allTrades, today) {
    const all = allTrades || [];
    const todays = all
        .filter(t => t.ts && sastDateStr(new Date(t.ts)) === today)
        .sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    if (!todays.length) {
        // Diagnostic instead of a bare "no trades" — distinguishes a
        // genuinely quiet day from the journal having lost data (e.g. a
        // restart wiping /tmp before it could be backed up — see the
        // hydrateFromPostgres fix above).
        let diag;
        if (!all.length) {
            diag = 'Journal has 0 trades recorded, ever. If trades were placed today, they never reached the journal — check for a recent restart.';
        } else {
            const mostRecent = all[all.length - 1];
            diag = `Journal has ${all.length} trade(s) total, most recent placed ${mostRecent.ts || 'unknown time'}. If trades were placed today and aren't listed, the journal likely lost data (e.g. a restart) rather than this being an empty day.`;
        }
        await sendTelegram('📋 Trade List (' + today + ')\nNo trades matched today.\n\n' + diag);
        return;
    }
    const CHUNK = 6; // smaller than before — each entry now carries scoring + reasoning, so fewer fit per message under Telegram's 4096-char cap
    const totalChunks = Math.ceil(todays.length / CHUNK);
    for (let c = 0; c < totalChunks; c++) {
        const slice = todays.slice(c * CHUNK, (c + 1) * CHUNK);
        const header = totalChunks > 1
            ? `📋 Trade List (${today}) — part ${c + 1}/${totalChunks} (${todays.length} total)\n\n`
            : `📋 Trade List (${today}) — ${todays.length} trade${todays.length === 1 ? '' : 's'}\n\n`;
        const body = slice.map((t, i) => formatDailyTradeLine(t, c * CHUNK + i + 1)).join('\n\n');
        await sendTelegram(header + body);
        if (c < totalChunks - 1) await sleep(400); // avoid Telegram rate limiting on rapid-fire messages
    }
}

async function sendDailyReport() {
    try {
        let j = loadJournal(), closed = j.trades.filter(t => t.outcome !== null),
            today = sastDateStr(new Date()),
            todayTrades = closed.filter(t => t.closedTs && sastDateStr(new Date(t.closedTs)) === today),
            wins = todayTrades.filter(t => t.outcome === 'win').length,
            losses = todayTrades.filter(t => t.outcome === 'loss').length,
            total = todayTrades.reduce((s, t) => s + (t.pnl || 0), 0),
            wr = (wins + losses) > 0 ? wins / (wins + losses) * 100 : 0;
        sendTelegram('📊 Daily Report (' + today + ')\nTrades: ' + (wins + losses) + '\nWins: ' + wins + ', Losses: ' + losses + '\nWin Rate: ' + wr.toFixed(1) + '%\nP&L: ' + (total >= 0 ? '+' : '') + total.toFixed(2));
        const digestSummary = alertDigest.drainDigest();
        if (digestSummary) sendTelegram(digestSummary);
        const dashMetrics = dashboard.getMetrics();
        if (dashMetrics.totalTrades > 0) {
            sendTelegram(`📊 *Dashboard Metrics*\nWin Rate: ${(dashMetrics.winRate*100).toFixed(1)}%\nSharpe: ${dashMetrics.sharpe.toFixed(2)}\nProfit Factor: ${dashMetrics.profitFactor.toFixed(2)}\nDrawdown: ${(dashMetrics.currentDrawdown*100).toFixed(1)}%`);
        }
        // Trades since the 2026-10-23 fix (candle order + exit management)
        // are reported separately — that's the number that says whether the
        // fix is working. Score bands and MAE/MFE below also use only these
        // trades: before the fix, entries were picked from reversed candles
        // and MAE/MFE was measured against the moving stop, so older values
        // would only blur the picture.
        const sinceFix = learningTrades(j.trades).filter(t => t.outcome === 'win' || t.outcome === 'loss');
        try {
            const epochTs = getLearningEpochTs();
            if (epochTs) {
                const w = sinceFix.filter(t => t.outcome === 'win'), l = sinceFix.filter(t => t.outcome === 'loss');
                const sum = a => a.reduce((s2, t) => s2 + (t.pnl || 0), 0);
                const net = sum(sinceFix), gw = sum(w), gl = Math.abs(sum(l));
                const lines = [
                    'Closed trades: ' + sinceFix.length + ' (' + w.length + 'W / ' + l.length + 'L)' + (sinceFix.length ? ', win rate ' + (w.length / sinceFix.length * 100).toFixed(1) + '%' : ''),
                    'Net P&L: ' + (net >= 0 ? '+' : '') + net.toFixed(2),
                ];
                if (w.length && l.length) lines.push('Avg win ' + (gw / w.length).toFixed(2) + ' | avg loss -' + (gl / l.length).toFixed(2) + ' | profit factor ' + (gl > 0 ? (gw / gl).toFixed(2) : '—'));
                if (sinceFix.length < 30) lines.push('(Under 30 trades — too early to judge.)');
                sendTelegram('📈 *Since the ' + sastDateStr(new Date(epochTs)) + ' fix*\n' + lines.join('\n'));
            }
        } catch (sfErr) { logger.warn('[since-fix] Report failed:', sfErr && sfErr.message); }
        try {
            let bands = getScoreBandCalibration(sinceFix);
            if (bands.length) {
                let lines = bands.map(b => {
                    let flag = b.reliable ? '' : ' (n<10, low sample)';
                    return 'Score ' + b.score + '–' + b.score + '.9: ' + b.trades + ' trades, ' + b.winRate + '% win, avg ' + (b.avgPnl >= 0 ? '+' : '') + b.avgPnl + flag;
                });
                sendTelegram('🎯 Score Band Calibration (since fix, ' + sinceFix.length + ' closed trades)\n' + lines.join('\n'));
            }
        } catch (bandErr) { logger.warn('[score-band] Calibration report failed:', bandErr && bandErr.message); }
        try {
            let exc = getExcursionStats(sinceFix);
            if (exc && exc.overall) {
                let lines = ['Overall: MAE ' + exc.overall.avgMaeR + 'R, MFE ' + exc.overall.avgMfeR + 'R (' + exc.overall.trades + ' trades)'];
                if (exc.wins) lines.push('Wins: MAE ' + exc.wins.avgMaeR + 'R, MFE ' + exc.wins.avgMfeR + 'R (' + exc.wins.trades + ')');
                if (exc.losses) lines.push('Losses: MAE ' + exc.losses.avgMaeR + 'R, MFE ' + exc.losses.avgMfeR + 'R (' + exc.losses.trades + ')');
                if (exc.sampleWarning) lines.push('⚠️ ' + exc.sampleWarning);
                sendTelegram('📐 *MAE/MFE (since fix)*\n' + lines.join('\n'));
            }
        } catch (excErr) { logger.warn('[excursion] Report failed:', excErr && excErr.message); }
        try {
            let cfStats = getCounterfactualStats(j.trades);
            if (cfStats.resolved > 0) {
                let lines = ['Blocked-trade win rate: ' + cfStats.blockedWinRate + '% (' + cfStats.resolved + ' resolved, ' + cfStats.pending + ' pending)'];
                if (cfStats.takenWinRate !== null) lines.push('Taken-trade win rate: ' + cfStats.takenWinRate + '%');
                Object.keys(cfStats.byReason).forEach(k => { let r = cfStats.byReason[k]; lines.push(k + ': ' + r.winRate + '% would-win (' + r.total + ')'); });
                if (cfStats.sampleWarning) lines.push('⚠️ ' + cfStats.sampleWarning);
                sendTelegram('🔍 *Counterfactuals (blocked trades, since fix)*\n' + lines.join('\n'));
            }
        } catch (cfErr) { logger.warn('[counterfactual] Report failed:', cfErr && cfErr.message); }
        // Today-specific breakdowns — the daily version of the score
        // band/session/day analysis, so a losing day's pattern is
        // visible immediately rather than diluted into the all-time
        // average above. Added 2026-08-08.
        try {
            if (todayTrades.length) {
                let todayBands = getScoreBandCalibration(todayTrades);
                if (todayBands.length) {
                    let lines = todayBands.map(b => 'Score ' + b.score + '–' + b.score + '.9: ' + b.trades + ' trades, ' + b.winRate + '% win, avg ' + (b.avgPnl >= 0 ? '+' : '') + b.avgPnl);
                    sendTelegram('🎯 *Today by score*\n' + lines.join('\n'));
                }
                let sessions = getSessionBreakdown(todayTrades);
                if (sessions.length) {
                    let lines = sessions.map(s => s.key + ': ' + s.trades + ' trades, ' + (s.winRate !== null ? s.winRate + '% win' : 'n/a') + ', ' + (s.totalPnl >= 0 ? '+' : '') + s.totalPnl);
                    sendTelegram('🕐 *Today by session*\n' + lines.join('\n'));
                }
            }
        } catch (todayErr) { logger.warn('[today-breakdown] report failed:', todayErr && todayErr.message); }
        // Detailed per-trade list for the day — every trade PLACED today
        // (not just ones closed today), so a trade opened this morning that's
        // still running overnight still shows up as OPEN. This is the raw
        // material for Trent to manually review trade-by-trade performance,
        // separate from the aggregate stats above. Added 2026-08-12.
        try {
            await sendDailyTradeList(j.trades, today);
        } catch (listErr) { logger.warn('[daily-trade-list] report failed:', listErr && listErr.message); }
        // v1: results in R (the only number that compares across account
        // sizes) and what was refused, instead of retraining. 2026-10-24.
        if (v1On()) { try { await v1DailySummary(j.trades); } catch (v1Err) { logger.warn('[v1] daily summary failed:', v1Err && v1Err.message); } }
        else retrainML();
    } catch (e) { logger.warn('Daily report failed:', e.message); }
}

function _stampLastRun(extra) { extra = extra || {}; try { updateBotState({ lastRun: new Date().toISOString() }); if (extra && Object.keys(extra).length) updateBotState(extra); } catch (e) {} }

// ─── CHECK PENDING LIMIT ORDERS ────────────────────────────────────────────
async function checkPendingLimitOrders(cfg) {
    let pending = (global._botState && global._botState._pendingLimitOrders) || [];
    if (!pending.length) return;
    let now = Date.now(), still = [];
    for (let p of pending) {
        if (now < p.expiresAt) { still.push(p); continue; }
        try {
            let positions = await getPositions(cfg), filled = false;
            for (let pos of positions)
                if (pos.comment && pos.comment.indexOf('ICT_BOT') !== -1) {
                    if (Math.abs((pos.openPrice || 0) - p.limitPrice) < .5) { filled = true; break; }
                }
            if (filled) continue;
            if (p.orderId) try { await maPost(cfg, '/trade', { actionType: 'ORDER_CANCEL', orderId: p.orderId }); } catch (e) {}
            let spec = await getBrokerSymbolSpec(cfg).catch(() => null);
            let re = await reanchorStopsToLivePrice(cfg, p.dir, p.limitPrice, p.sl, p.tp, spec).catch(() => ({ sl: p.sl, tp: p.tp, entryPrice: p.limitPrice }));
            await maPost(cfg, '/trade', { symbol: cfg.symbol, actionType: p.dir === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL', volume: p.lots, stopLoss: re.sl, takeProfit: re.tp, comment: 'ICT_BOT|' + cfg.symbol + '|' + (p.analysis && p.analysis.score || 0) + '|MARKET_FALLBACK' });
            sendTelegram('📊 Limit not filled (' + p.dir + ' @ ' + p.limitPrice + ') — switched to market order');
        } catch (e) { still.push(p); }
    }
    let pruned = still.filter(p => now - p.placedAt < 60 * 60 * 1000);
    updateBotState({ _pendingLimitOrders: pruned });
}

// ─── HANDLE STREAK PROTECTION (disabled) ──────────────────────────────
function handleStreakProtection(state, outcome) {
    // No pause, only track
    return { paused: false, pauseUntil: 0, riskFactor: 1 };
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
    runCycle,
    hydrateFromPostgres,
    journalClose,
    updateBotState,
    normalizePositionId,
    getTradeId,
    validateStopLoss,
    validateTakeProfit,
    validateSLTPForPosition,
    cleanupCandleCache,
    clearIndicatorCache,
    getCachedIndicators,
    getLazyData,
    managePositions,
    safePositionOperation,
    checkFreeTradeSafe,
    getBeBuffer,
    getDynamicTPSplit,
    getSessionRiskMultiplier,
    getOptimalRR,
    getAdaptiveTrail,
    findSmartTPLevels,
    findSupportLevels,
    findResistanceLevels,
    getPartialCloseSL,
    runFullAnalysis,
    analyzeVolumeProfile,
    loadJournal,
    calcJournalWeights,
    getHitTagReport,
    getScoreBandCalibration,
    getExcursionStats,
    getCounterfactualStats,
    loadCounterfactuals,
    getSessionBreakdown,
    getDayOfWeekBreakdown,
    rehydratePositions,
    vsa,
    breaker,
    advancedRiskLib,
    backtestDB,
    metrics,
    getDashboardMetrics: () => dashboard.getMetrics(),
    sendDailyReport,
    sendDailyTradeList,
    getFactorWinRates,
    sendFactorReport,
    detectMarketTrend,
    checkLossStreak,
    reconcileClosedTrades,
    checkMetaApiAccount,
    startupMetaApiCheck,
    getCfg,
    // v1 (2026-10-24)
    STRATEGY_VERSION,
    v1Settings,
    v1On,
    getV1StatusText,
    v1StartupReport,
    v1DailySummary,
    v1MarketState,
    v1EntryTimeBlock,
    v1FlattenDue,
    v1NewsState,
    v1RefreshCalendar,
    v1PositionSize,
    v1OpenRisk,
    v1ServerLadder,
    v1LadderStop,
    v1IsLegA,
    v1EntryGate,
    v1EntryFilters,
    v1SweepDepth,
    v1AnalysisFrames,
    v1TrendSignal,
    ictScan,
    sbScan,
    oteScan,
    SB,
    OTE,
    ictDayParts,
    ictTfMin,
    ICT,
    v1TrendTrail,
    TREND,
    EA,
    v1EaCycle,
    v1EaContext,
    v1EaStrategy,
    v1PriceCapMult,
    v1DataCheck,
    v1UsDst,
    v1NyParts,
    v1TokenExpiry,
    v1CheckReminders,
    journalLegClose,
    getSessionHour,
    isTradingTime,
    getSessionContext,
    inSilverBullet,
    detectJudasSwing,
    detectEqualHighsLows,
    findLegForMSS,
    inOTE,
    premiumDiscount,
    detectNestedFVG,
    detectDivergence,
    detectPatternsICT,
    getMTFScore,
    analyzeTFForScore,
    analyseM5Entry,
    waitForM1Pullback,
    placeTrade,
    checkPendingLimitOrders,
    handleStreakProtection,
    computeTrendScore,
    donchian,
    ichimoku,
    chandelierExit,
    computeTrendQuality,
    volatilityFilter,
    exhaustionFilter,
    newsImpactFilter,
    updateBayesianWeights,
    getBayesianFactorWeight,
    OrderBookAnalyzer,
    FlowDetector,
    IntermarketAdvanced,
    NewsSentimentNLP,
    ETFFlows,
    OptionsPositioning,
    EconomicCalendar,
    SeasonalityAdvanced,
    PortfolioRiskManager,
    RecoveryManager,
    RLParamOptimizer,
    BayesianOptimizer,
    BacktestRunner,
    runBacktest,
    getBacktestHistory,
    XGBoostModel,
    Dashboard,
    ForwardValidator,
    TWAPExecutor,
    VWAPExecutor,
    IcebergExecutor
};

console.log('✅ bot-engine.js ready - v34.1 - MAX 3 TRADES, NO PAUSE');
console.log('🔥 KEY FEATURES (v34.1):');
console.log('   ✅ Max 3 open positions (hard limit)');
console.log('   ✅ Single order per signal (no split)');
console.log('   ✅ No loss-pause (trading always active)');
console.log('   ✅ Margin check before trade');
console.log('   ✅ All external fetches have timeouts');
console.log('   ✅ portfolioRiskResult defined');
