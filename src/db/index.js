// ════════════════════════════════════════════════════════════════════════════
//  Database Layer - NeDB
//  Provides persistent storage for trades, performance, and bot state
// ════════════════════════════════════════════════════════════════════════════

const Datastore = require('nedb');
const path = require('path');
const fs = require('fs');

// ── Ensure data directory exists ────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || '/tmp/data';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Database instances ──────────────────────────────────────────────────────
const db = {
  trades: new Datastore({ 
    filename: path.join(DATA_DIR, 'trades.db'), 
    autoload: true 
  }),
  performance: new Datastore({ 
    filename: path.join(DATA_DIR, 'performance.db'), 
    autoload: true 
  }),
  daily: new Datastore({ 
    filename: path.join(DATA_DIR, 'daily.db'), 
    autoload: true 
  }),
  backtest: new Datastore({ 
    filename: path.join(DATA_DIR, 'backtest.db'), 
    autoload: true 
  }),
  botState: new Datastore({ 
    filename: path.join(DATA_DIR, 'botstate.db'), 
    autoload: true 
  }),
};

// ── Ensure indexes ──────────────────────────────────────────────────────────
db.trades.ensureIndex({ fieldName: 'positionId', unique: true });
db.trades.ensureIndex({ fieldName: 'closedAt' });
db.trades.ensureIndex({ fieldName: 'outcome' });
db.performance.ensureIndex({ fieldName: 'date' });
db.daily.ensureIndex({ fieldName: 'date', unique: true });
db.backtest.ensureIndex({ fieldName: 'createdAt' });

// ── Trade functions ─────────────────────────────────────────────────────────

function saveTrade(trade) {
  return new Promise((resolve, reject) => {
    const doc = {
      ...trade,
      createdAt: new Date().toISOString(),
    };
    db.trades.insert(doc, (err, newDoc) => {
      if (err) reject(err);
      else resolve(newDoc);
    });
  });
}

function getTrades(query = {}, limit = 100, skip = 0) {
  return new Promise((resolve, reject) => {
    db.trades.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
  });
}

function updateTrade(positionId, outcome, pnl) {
  return new Promise((resolve, reject) => {
    db.trades.update(
      { positionId: positionId },
      { 
        $set: { 
          outcome, 
          pnl, 
          closedAt: new Date().toISOString() 
        } 
      },
      { multi: false },
      (err, numReplaced) => {
        if (err) reject(err);
        else resolve(numReplaced);
      }
    );
  });
}

function getTradeStats() {
  return new Promise((resolve, reject) => {
    db.trades.find({}, (err, docs) => {
      if (err) {
        reject(err);
        return;
      }
      
      const closed = docs.filter(t => t.outcome !== null);
      const wins = closed.filter(t => t.outcome === 'win');
      const losses = closed.filter(t => t.outcome === 'loss');
      
      resolve({
        total: docs.length,
        closed: closed.length,
        wins: wins.length,
        losses: losses.length,
        winRate: closed.length > 0 ? wins.length / closed.length : 0,
        totalPnl: closed.reduce((s, t) => s + (t.pnl || 0), 0),
        avgWin: wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length : 0,
        avgLoss: losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0)) / losses.length : 0,
      });
    });
  });
}

// ── Performance functions ───────────────────────────────────────────────────

function savePerformance(data) {
  return new Promise((resolve, reject) => {
    const doc = {
      ...data,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };
    db.performance.insert(doc, (err, newDoc) => {
      if (err) reject(err);
      else resolve(newDoc);
    });
  });
}

function getPerformance(days = 30) {
  return new Promise((resolve, reject) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    db.performance.find({ createdAt: { $gte: cutoff.toISOString() } })
      .sort({ createdAt: -1 })
      .exec((err, docs) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (docs.length === 0) {
          resolve({
            daily: [],
            summary: {
              totalTrades: 0,
              winRate: 0,
              totalPnl: 0,
              bestDay: 0,
              worstDay: 0,
              avgDay: 0,
            }
          });
          return;
        }
        
        const pnls = docs.map(d => d.pnl || 0);
        const totalTrades = docs.reduce((s, d) => s + (d.trades || 0), 0);
        const wins = docs.reduce((s, d) => s + (d.wins || 0), 0);
        const totalPnl = pnls.reduce((s, p) => s + p, 0);
        
        resolve({
          daily: docs,
          summary: {
            totalTrades,
            winRate: totalTrades > 0 ? wins / totalTrades : 0,
            totalPnl,
            bestDay: Math.max(...pnls),
            worstDay: Math.min(...pnls),
            avgDay: pnls.length > 0 ? totalPnl / pnls.length : 0,
          }
        });
      });
  });
}

// ── Daily stats functions ──────────────────────────────────────────────────

function saveDailyStats(data) {
  return new Promise((resolve, reject) => {
    const date = new Date().toISOString().split('T')[0];
    const doc = {
      ...data,
      date,
      updatedAt: new Date().toISOString(),
    };
    db.daily.update(
      { date },
      { $set: doc },
      { upsert: true },
      (err, numReplaced, newDoc) => {
        if (err) reject(err);
        else resolve(newDoc);
      }
    );
  });
}

function getDailyStats(days = 30) {
  return new Promise((resolve, reject) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    db.daily.find({ date: { $gte: cutoff.toISOString().split('T')[0] } })
      .sort({ date: -1 })
      .exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
  });
}

// ── Backtest functions ──────────────────────────────────────────────────────

function saveBacktestResult(data) {
  return new Promise((resolve, reject) => {
    const doc = {
      ...data,
      createdAt: new Date().toISOString(),
    };
    db.backtest.insert(doc, (err, newDoc) => {
      if (err) reject(err);
      else resolve(newDoc);
    });
  });
}

function getBacktestHistory(limit = 20) {
  return new Promise((resolve, reject) => {
    db.backtest.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
  });
}

// ── Bot state functions ────────────────────────────────────────────────────

function saveBotState(data) {
  return new Promise((resolve, reject) => {
    const doc = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    db.botState.update(
      { _id: 'botState' },
      { $set: doc },
      { upsert: true },
      (err, numReplaced, newDoc) => {
        if (err) reject(err);
        else resolve(newDoc);
      }
    );
  });
}

function getBotState() {
  return new Promise((resolve, reject) => {
    db.botState.findOne({ _id: 'botState' }, (err, doc) => {
      if (err) reject(err);
      else resolve(doc || {});
    });
  });
}

function updateBotState(updates) {
  return new Promise((resolve, reject) => {
    db.botState.update(
      { _id: 'botState' },
      { $set: { ...updates, updatedAt: new Date().toISOString() } },
      { upsert: true },
      (err, numReplaced, newDoc) => {
        if (err) reject(err);
        else resolve(newDoc);
      }
    );
  });
}

// ── Export all functions ────────────────────────────────────────────────────

module.exports = {
  saveTrade,
  getTrades,
  updateTrade,
  getTradeStats,
  savePerformance,
  getPerformance,
  saveDailyStats,
  getDailyStats,
  saveBacktestResult,
  getBacktestHistory,
  saveBotState,
  getBotState,
  updateBotState,
};
