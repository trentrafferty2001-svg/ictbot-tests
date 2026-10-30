// ════════════════════════════════════════════════════════════════════════════
//  Configuration Defaults – v23.0 (24/7 Trading)
// ════════════════════════════════════════════════════════════════════════════

const SCORE_THRESHOLDS = { low: 7, medium: 8, high: 10, elite: 11, max: 12 };
const RISK_MULTIPLIERS = { 7: 0.3, 8: 0.5, 10: 1.0, 11: 1.5, max: 2.0 };
function getRiskMultiplier(score) {
  if (score < 7) return RISK_MULTIPLIERS[7];
  if (score <= 8) return RISK_MULTIPLIERS[8];
  if (score <= 10) return RISK_MULTIPLIERS[10];
  if (score <= 11) return RISK_MULTIPLIERS[11];
  return RISK_MULTIPLIERS.max;
}

const CONFLUENCE_WEIGHTS = {
  fvg: 2, ob: 2, mss: 1, liqSweep: 1, htfBias: 1, fullMTFAlign: 2,
  ote: 2, tripleZone: 1, killZone: 2, silverBullet: 2, divergence: 2,
  pattern: 1, absorption: 1, adxTrending: 0, adxRanging: -1,
  vsaBullish: 1, vsaBearish: 1, breakerBlock: 2, inverseFVG: 2,
  candlePattern: 1, newsBullish: 1, newsBearish: -1,
};

const SESSION_FACTORS = {
  london: { volatility: 1.5, minScore: 6, skip: false, bias: 'bullish' },
  london_mid: { volatility: 1.0, minScore: 7, skip: false, bias: 'neutral' },
  ny_open: { volatility: 1.2, minScore: 6, skip: false, bias: 'bullish' },
  ny: { volatility: 0.8, minScore: 8, skip: false, bias: 'neutral' },
  ny_close: { volatility: 0.7, minScore: 8, skip: false, bias: 'bearish' },
  tokyo: { volatility: 0.6, minScore: 8, skip: false, bias: 'neutral' },
  asian_mid: { volatility: 0.4, minScore: 9, skip: false, bias: 'neutral' },
  sydney: { volatility: 0.4, minScore: 9, skip: false, bias: 'neutral' },
  pre_london: { volatility: 0.5, minScore: 8, skip: false, bias: 'neutral' },
  off_hours: { volatility: 0.3, minScore: 10, skip: true, bias: 'neutral' },
};

const SWING_CONFIG = { windowSize: 3, minMovePct: 0.15, maxSwings: 8 };
const MSS_CONFIG = { breakThreshold: 0.1 };
const OB_CONFIG = { zoneTolerancePct: 0.15 };
const VSA_CONFIG = { volumeMAPeriod: 20, highVolumeThreshold: 1.5, lowVolumeThreshold: 0.5, climaxVolumeThreshold: 3.0, absorptionCandles: 3, minConfidence: 60 };
const BREAKER_CONFIG = { maxAge: 30, minQuality: 3, activationDistance: 2.0 };
const ADVANCED_RISK_CONFIG = { partialLevels: [1.0,2.0,3.0], partialVolumes: [0.3,0.3,0.4], maxHoldHours: 48, beThreshold: 0.3, trailActivation: 1.5, minTrailDistance: 0.01, kellyMinRisk: 0.1, kellyMaxRisk: 3.0, dailyLossLimit: 5, monthlyLossLimit: 10, maxDailyTrades: 5 };
const GATE_RELAXER_CONFIG = { idleHoursThreshold: 4, idleHoursHard: 24, minScoreFloor: 4, highScoreThreshold: 9 };
const SCALPER_CONFIG = { activeSessions: ['london','ny_open','ny'], minScore: 3, stopMultiplier: 0.5, takeMultiplier: 1.5, freshCandles: 3 };
const FREQUENCY_CONFIG = { dailyTarget: 2, lookbackDays: 7, minDaysForAdjustment: 3, riskAdjustFactor: 0.1 };
const WORKER_CONFIG = { maxWorkers: 2, workerTimeoutMs: 30000, idleTimeoutMs: 300000, cleanupIntervalMs: 60000 };
const POSITION_CONFIG = { maxRiskPct: 3.0, minLotForSplit: 0.03, partialCloseThreshold: 0.95, tp1ProfitPct: 0.95, tp2ProfitPct: 1.7, beThreshold: 0.3, trailActivation: 1.5, maxHoldHours: 48 };
const BACKTEST_CONFIG = { dataSources: { YAHOO_FUTURES: 'GC=F', YAHOO_SPOT: 'XAUUSD=X' }, defaultDataSource: 'YAHOO_FUTURES', spreadSimulation: { enabled: true, defaultSpreadPips: 0.3, volatilityMultiplier: 1.5 }, walkForward: { enabled: false, windowDays: 30, stepDays: 7 }, monteCarlo: { enabled: false, iterations: 100, sampleSize: 0.7 } };

// ── 24/7 TRADING: Remove all time restrictions ─────────────────────────────
const STREAK_CONFIG = { consecLossesToPause: 1, pauseDurationHours: 1, reduceRiskAfterWinStreak: 3, riskReductionFactor: 0.7 };
const M1_ENTRY_CONFIG = { enabled: true, maxWaitCandles: 3, pullbackDepth: 0.618 };
const TIME_FILTER_CONFIG = {
  allowedSessions: null,
  allowedHours: null,
  blockWeekend: false,
  avoidSessionStartMinutes: 0,
};
const RISK_CONFIG = { baseRiskPct: 0.5, maxRiskPct: 1.5, volatileRegimeRiskFactor: 0.6, highConvictionBonus: 1.2, lossReductionFactor: 0.5, winIncreaseFactor: 1.1 };
const QUALITY_CONFIG = { minQualityScore: 8, useJournalWeights: true, similarityLookback: 20, minSimilarWinRate: 0.45 };
const VOLATILITY_CONFIG = { maxATRRatio: 2.0, minATRRatio: 0.3 };
const MACD_CONFIG = { fast: 12, slow: 26, signal: 9 };
const EMA_CONFIG = { periods: [20, 50, 200] };

// ── NEW: Advanced Risk & Auto-Optimization ──────────────────────────────────
const ADVANCED_RISK = {
  useKelly: true,
  useAntiMartingale: true,
  maxDailyLossPct: 5,
  maxMonthlyLossPct: 10,
  maxConsecutiveLosses: 3,
  coolDownAfterLoss: 2,
};

const TRADE_QUALITY_FILTERS = {
  requireHTFAlignment: true,
  requireVolumeConfirmation: true,
  requireNewsAlignment: true,
  requireSeasonality: true,
  minSimilarWinRate: 0.45,
  maxSpreadMultiplier: 2.0,
};

const AUTO_OPTIMIZER = {
  enabled: true,
  intervalHours: 24,
  lookbackDays: 14,
  optimizeWeights: true,
  optimizeThresholds: true,
};

function getConfigValue(saved, env, defaultValue) {
  if (saved !== undefined && saved !== null && saved !== '') return saved;
  if (env !== undefined && env !== null && env !== '') return env;
  return defaultValue;
}
function getNumberConfig(saved, env, defaultValue) {
  const val = getConfigValue(saved, env, defaultValue);
  return typeof val === 'number' ? val : parseFloat(val) || defaultValue;
}
function getBooleanConfig(saved, env, defaultValue) {
  const val = getConfigValue(saved, env, defaultValue);
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
  return !!val;
}

module.exports = {
  SCORE_THRESHOLDS, RISK_MULTIPLIERS, CONFLUENCE_WEIGHTS, SESSION_FACTORS,
  SWING_CONFIG, MSS_CONFIG, OB_CONFIG, VSA_CONFIG, BREAKER_CONFIG,
  ADVANCED_RISK_CONFIG, BACKTEST_CONFIG, POSITION_CONFIG, WORKER_CONFIG,
  GATE_RELAXER_CONFIG, SCALPER_CONFIG, FREQUENCY_CONFIG,
  STREAK_CONFIG, M1_ENTRY_CONFIG, TIME_FILTER_CONFIG,
  RISK_CONFIG, QUALITY_CONFIG, VOLATILITY_CONFIG, MACD_CONFIG, EMA_CONFIG,
  ADVANCED_RISK, TRADE_QUALITY_FILTERS, AUTO_OPTIMIZER,
  getRiskMultiplier, getConfigValue, getNumberConfig, getBooleanConfig,
};
