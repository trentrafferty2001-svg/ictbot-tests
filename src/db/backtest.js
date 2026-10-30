// ════════════════════════════════════════════════════════════════════════════
//  Backtest Results Database - Store and analyze backtest results
//  Extends NeDB with specialized backtest storage
// ════════════════════════════════════════════════════════════════════════════

const path = require('path');
const Datastore = require('nedb');
const { logger } = require('../logger');

// ── Database Setup ──────────────────────────────────────────────────────────
const BACKTEST_DB_PATH = process.env.BACKTEST_DB_PATH || '/tmp/backtest-results.db';
const backtestDB = new Datastore({ 
  filename: BACKTEST_DB_PATH,
  autoload: true 
});

// ── Schema ──────────────────────────────────────────────────────────────────
/*
{
  _id: string,
  timestamp: ISO date,
  symbol: string,
  startDate: string,
  endDate: string,
  mode: string,
  riskPerTrade: number,
  minScore: number,
  initialBalance: number,
  dataSource: string,
  simulateSpread: boolean,
  walkForward: boolean,
  monteCarlo: boolean,
  results: {
    totalTrades: number,
    winRate: number,
    totalPnl: number,
    wins: number,
    losses: number,
    profitFactor: number,
    maxDrawdownPct: number,
    expectancy: number,
    confidenceInterval?: { low: number, high: number },
    walkForwardResults?: Array<{ window: string, winRate: number, totalPnl: number }>
  },
  trades: Array<{
    entryPrice: number,
    exitPrice: number,
    direction: string,
    pnl: number,
    score: number,
    timestamp: ISO date
  }>
}
*/

// ── CRUD Operations ─────────────────────────────────────────────────────────

/**
 * Save a backtest result
 */
function saveBacktestResult(data) {
  return new Promise((resolve, reject) => {
    const doc = {
      timestamp: new Date().toISOString(),
      ...data,
      _id: data._id || crypto.randomBytes(16).toString('hex'),
    };
    
    backtestDB.insert(doc, (err, newDoc) => {
      if (err) {
        logger.error('[backtestDB] Save error:', err.message);
        reject(err);
      } else {
        logger.info(`[backtestDB] Saved backtest result: ${newDoc._id}`);
        resolve(newDoc);
      }
    });
  });
}

/**
 * Get backtest results with filtering
 */
function getBacktestResults(filter = {}, limit = 20) {
  return new Promise((resolve, reject) => {
    backtestDB
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec((err, docs) => {
        if (err) {
          logger.error('[backtestDB] Get error:', err.message);
          reject(err);
        } else {
          resolve(docs);
        }
      });
  });
}

/**
 * Get a single backtest result by ID
 */
function getBacktestResultById(id) {
  return new Promise((resolve, reject) => {
    backtestDB.findOne({ _id: id }, (err, doc) => {
      if (err) {
        logger.error('[backtestDB] Get by ID error:', err.message);
        reject(err);
      } else {
        resolve(doc);
      }
    });
  });
}

/**
 * Get aggregated backtest statistics
 */
function getBacktestStats() {
  return new Promise((resolve, reject) => {
    backtestDB.find({}, (err, docs) => {
      if (err) {
        logger.error('[backtestDB] Stats error:', err.message);
        reject(err);
        return;
      }
      
      if (docs.length === 0) {
        resolve({
          totalBacktests: 0,
          avgWinRate: 0,
          avgProfitFactor: 0,
          bestWinRate: null,
          worstWinRate: null,
        });
        return;
      }
      
      const withResults = docs.filter(d => d.results);
      const winRates = withResults.map(d => d.results.winRate || 0);
      const profitFactors = withResults.map(d => d.results.profitFactor || 0);
      
      resolve({
        totalBacktests: docs.length,
        avgWinRate: winRates.reduce((s, v) => s + v, 0) / winRates.length,
        avgProfitFactor: profitFactors.reduce((s, v) => s + v, 0) / profitFactors.length,
        bestWinRate: Math.max(...winRates),
        worstWinRate: Math.min(...winRates),
        bestProfitFactor: Math.max(...profitFactors),
        worstProfitFactor: Math.min(...profitFactors),
        bestResult: withResults.reduce((best, d) => 
          d.results.winRate > (best?.results?.winRate || 0) ? d : best, null
        ),
      });
    });
  });
}

/**
 * Delete backtest result by ID
 */
function deleteBacktestResult(id) {
  return new Promise((resolve, reject) => {
    backtestDB.remove({ _id: id }, {}, (err, numRemoved) => {
      if (err) {
        logger.error('[backtestDB] Delete error:', err.message);
        reject(err);
      } else {
        resolve(numRemoved);
      }
    });
  });
}

/**
 * Get performance by mode across backtests
 */
function getPerformanceByMode() {
  return new Promise((resolve, reject) => {
    backtestDB.find({}, (err, docs) => {
      if (err) {
        reject(err);
        return;
      }
      
      const byMode = {};
      
      for (const d of docs) {
        if (!d.results) continue;
        const mode = d.mode || 'normal';
        if (!byMode[mode]) {
          byMode[mode] = { 
            backtests: 0, 
            totalWinRate: 0, 
            totalProfitFactor: 0,
            totalTrades: 0,
            wins: 0,
            losses: 0,
          };
        }
        byMode[mode].backtests++;
        byMode[mode].totalWinRate += d.results.winRate || 0;
        byMode[mode].totalProfitFactor += d.results.profitFactor || 0;
        byMode[mode].totalTrades += d.results.totalTrades || 0;
        byMode[mode].wins += d.results.wins || 0;
        byMode[mode].losses += d.results.losses || 0;
      }
      
      for (const mode in byMode) {
        const m = byMode[mode];
        m.avgWinRate = m.totalWinRate / m.backtests;
        m.avgProfitFactor = m.totalProfitFactor / m.backtests;
        m.totalWinRate = undefined;
        m.totalProfitFactor = undefined;
      }
      
      resolve(byMode);
    });
  });
}

/**
 * Compare two backtest runs
 */
function compareBacktests(id1, id2) {
  return Promise.all([
    getBacktestResultById(id1),
    getBacktestResultById(id2),
  ]).then(([r1, r2]) => {
    if (!r1 || !r2) {
      throw new Error('One or both backtest results not found');
    }
    
    return {
      comparison: [
        { metric: 'Win Rate', a: r1.results.winRate, b: r2.results.winRate },
        { metric: 'Profit Factor', a: r1.results.profitFactor, b: r2.results.profitFactor },
        { metric: 'Total P&L', a: r1.results.totalPnl, b: r2.results.totalPnl },
        { metric: 'Max Drawdown', a: r1.results.maxDrawdownPct, b: r2.results.maxDrawdownPct },
        { metric: 'Expectancy', a: r1.results.expectancy, b: r2.results.expectancy },
        { metric: 'Total Trades', a: r1.results.totalTrades, b: r2.results.totalTrades },
      ],
      a: {
        id: id1,
        mode: r1.mode,
        startDate: r1.startDate,
        endDate: r1.endDate,
        results: r1.results,
      },
      b: {
        id: id2,
        mode: r2.mode,
        startDate: r2.startDate,
        endDate: r2.endDate,
        results: r2.results,
      },
      better: r1.results.winRate > r2.results.winRate ? 'A' : 'B',
    };
  });
}

module.exports = {
  saveBacktestResult,
  getBacktestResults,
  getBacktestResultById,
  getBacktestStats,
  deleteBacktestResult,
  getPerformanceByMode,
  compareBacktests,
};
