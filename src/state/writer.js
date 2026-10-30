// ════════════════════════════════════════════════════════════════════════════
//  State Writer with atomic operations and crash safety
//  Uses async writes with fsync for critical data
//  ADDED: optional Postgres persistence (falls back to file storage if
//  DATABASE_URL isn't set, or if the pg package hasn't been added yet —
//  safe to deploy before the database exists)
// ════════════════════════════════════════════════════════════════════════════

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { logger } = require('../logger');

const STATE_DIR = process.env.RENDER_VOLUME_PATH || '/tmp';
const STATE_FILE = path.join(STATE_DIR, 'bot-state.json');
const STATE_BAK = path.join(STATE_DIR, 'bot-state.bak.json');

const CRITICAL_FIELDS = new Set([
  '_openPositionIds',
  'dailyPnl',
  'monthlyPnl',
  'consecLosses',
  'consecWins',
  'positions',
  'tradeHistory',
  '_posState',
]);

// ─── Postgres (optional) ────────────────────────────────────────────────────
let _pgPool = null;
let _pgReady = false;
// Fixed 2026-10-24: reads used to run while the table setup below was still
// in flight (about 0.4 s at boot), so they always saw "no database". The bot
// then started from empty state on every restart, and its first saves
// overwrote the Postgres backup, which was never read back. Now:
//  - reads and writes wait for the setup (up to PG_INIT_WAIT_MS, so an
//    unreachable database can't hang startup), and
//  - Postgres writes stay off until the startup restore has finished
//    (server.js calls markRestoreDone()), so nothing written while the bot
//    is still starting can replace the backup before it has been read.
let _pgInit = null;
let _pgSettled = false;
let _restoreDone = false;
const PG_INIT_WAIT_MS = parseInt(process.env.PG_INIT_WAIT_MS || '30000', 10);
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    _pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    _pgInit = Promise.all([
      _pgPool.query(`CREATE TABLE IF NOT EXISTS bot_state (id INTEGER PRIMARY KEY DEFAULT 1, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`),
      _pgPool.query(`CREATE TABLE IF NOT EXISTS bot_named_state (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`),
    ])
      .then(() => { _pgReady = true; logger.info('[state] Postgres persistence active'); })
      .catch(e => logger.error('[state] Postgres table setup failed, falling back to file storage:', e.message))
      .finally(() => { _pgSettled = true; });
    // Safety net: if nothing ever calls markRestoreDone(), don't leave saving
    // to Postgres switched off for the life of the process.
    const t = setTimeout(markRestoreDone, 3 * 60 * 1000);
    if (t && typeof t.unref === 'function') t.unref();
  } catch (e) {
    logger.warn('[state] DATABASE_URL is set but the pg package is not installed — add "pg" to package.json to enable durable state. Falling back to file storage.');
  }
}

// Waits for the table setup once. If the database hangs, give up after the
// first timeout instead of making every later read and save wait again.
let _pgGaveUp = false;
async function _pgWait() {
  if (!_pgInit || _pgSettled || _pgGaveUp) return;
  let timer;
  const timedOut = await Promise.race([
    _pgInit.then(() => false),
    new Promise(resolve => { timer = setTimeout(() => resolve(true), PG_INIT_WAIT_MS); }),
  ]);
  clearTimeout(timer);
  if (timedOut && !_pgReady && !_pgGaveUp) {
    _pgGaveUp = true;
    logger.error(`[state] Postgres not ready after ${PG_INIT_WAIT_MS / 1000}s — carrying on with file storage (it is used again if the database comes up)`);
  }
}

// Called once the saved state has been loaded back at startup (see server.js).
function markRestoreDone() {
  if (_restoreDone) return;
  _restoreDone = true;
  if (_pgPool) logger.info('[state] Startup restore finished, saving to Postgres from now on');
}

// ─── Named-blob storage (generic key -> JSON, backed by the same pool) ─────
// Used for anything that was previously a standalone /tmp file with no
// cross-restart durability: trade journal, zone memory, seasonality stats,
// A/B testing state, TP-fix state, direction-bias stats, etc.

async function readNamedState(key) {
  await _pgWait();
  if (!_pgReady) return null;
  try {
    const res = await _pgPool.query('SELECT data FROM bot_named_state WHERE key = $1', [key]);
    return res.rows.length ? res.rows[0].data : null;
  } catch (e) {
    logger.error(`[state] Postgres readNamedState(${key}) failed:`, e.message);
    return null;
  }
}

async function writeNamedState(key, data) {
  if (!_restoreDone) return false;
  await _pgWait();
  if (!_pgReady) return false;
  try {
    await _pgPool.query(
      `INSERT INTO bot_named_state (key, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()`,
      [key, JSON.stringify(data)]
    );
    return true;
  } catch (e) {
    logger.error(`[state] Postgres writeNamedState(${key}) failed:`, e.message);
    return false;
  }
}

async function _pgRead() {
  await _pgWait();
  if (!_pgReady) return null;
  try {
    const res = await _pgPool.query('SELECT data FROM bot_state WHERE id = 1');
    return res.rows.length ? res.rows[0].data : null;
  } catch (e) {
    logger.error('[state] Postgres read failed, falling back to file:', e.message);
    return null;
  }
}

async function _pgWrite(state) {
  if (!_restoreDone) return false;
  await _pgWait();
  if (!_pgReady) return false;
  try {
    await _pgPool.query(
      `INSERT INTO bot_state (id, data, updated_at) VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(state)]
    );
    return true;
  } catch (e) {
    logger.error('[state] Postgres write failed, file copy still saved:', e.message);
    return false;
  }
}

let _writeQueue = [];
let _writeTimeout = null;
let _writeInProgress = false;

async function readState() {
  const fromDb = await _pgRead();
  if (fromDb && typeof fromDb === 'object') {
    logger.info('[state] Loaded from Postgres');
    return fromDb;
  }

  for (const file of [STATE_FILE, STATE_BAK]) {
    try {
      const data = await fs.readFile(file, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        logger.info(`[state] Loaded from ${path.basename(file)}`);
        return parsed;
      }
    } catch (e) {
      // Continue to next file
    }
  }
  
  logger.info('[state] Creating new state');
  const initialState = {
    lastRun: new Date().toISOString(),
    status: 'starting',
    botOff: false,
    paused: false,
    newsBlock: false,
    tradeHistory: [],
    positions: [],
    analysis: null,
    bal: 0,
    eq: 0,
    wins: 0,
    losses: 0,
    consecLosses: 0,
    consecWins: 0,
    dailyPnl: 0,
    monthlyPnl: 0,
    _createdAt: Date.now(),
  };
  
  await writeStateSync(initialState);
  return initialState;
}

async function writeState(updates, options = {}) {
  const { critical = false, immediate = false } = options;
  
  if (critical) {
    return writeStateSync(updates);
  }
  
  return new Promise((resolve, reject) => {
    _writeQueue.push({ updates, resolve, reject });
    
    if (immediate) {
      if (_writeTimeout) clearTimeout(_writeTimeout);
      _writeTimeout = setTimeout(processWriteQueue, 10);
    } else if (!_writeTimeout) {
      _writeTimeout = setTimeout(processWriteQueue, 1000);
    }
  });
}

async function processWriteQueue() {
  if (_writeInProgress || _writeQueue.length === 0) {
    _writeTimeout = null;
    return;
  }
  
  _writeInProgress = true;
  _writeTimeout = null;
  
  const merged = {};
  const callbacks = [];
  
  while (_writeQueue.length > 0) {
    const item = _writeQueue.shift();
    Object.assign(merged, item.updates);
    callbacks.push(item);
  }
  
  try {
    const current = global._botState || {};
    
    const criticalUpdate = {};
    const normalUpdate = {};
    
    for (const [key, value] of Object.entries(merged)) {
      if (CRITICAL_FIELDS.has(key)) {
        criticalUpdate[key] = value;
      } else {
        normalUpdate[key] = value;
      }
    }
    
    const newState = { ...current, ...normalUpdate, ...criticalUpdate };
    
    if (newState.log?.length > 200) newState.log = newState.log.slice(-200);
    if (newState.tradeHistory?.length > 500) newState.tradeHistory = newState.tradeHistory.slice(-500);
    
    global._botState = newState;
    
    const json = JSON.stringify(newState);
    
    await fs.writeFile(STATE_BAK, json, 'utf-8');
    await fs.writeFile(STATE_FILE, json, 'utf-8');
    await _pgWrite(newState);
    
    for (const item of callbacks) {
      item.resolve(item.updates);
    }
    
  } catch (e) {
    logger.error('[state] Write failed:', e.message);
    for (const item of callbacks) {
      item.reject(e);
    }
  } finally {
    _writeInProgress = false;
    if (_writeQueue.length > 0) {
      processWriteQueue();
    }
  }
}

function writeStateSync(updates) {
  try {
    const current = global._botState || {};
    const newState = { ...current, ...updates };
    
    if (newState.log?.length > 200) newState.log = newState.log.slice(-200);
    if (newState.tradeHistory?.length > 500) newState.tradeHistory = newState.tradeHistory.slice(-500);
    
    global._botState = newState;
    
    const json = JSON.stringify(newState);
    
    fsSync.writeFileSync(STATE_BAK, json, 'utf-8');
    fsSync.writeFileSync(STATE_FILE, json, 'utf-8');
    _pgWrite(newState).catch(() => {});
    
    return newState;
  } catch (e) {
    logger.error('[state] Sync write failed:', e.message);
    throw e;
  }
}

async function flushState() {
  if (_writeTimeout) {
    clearTimeout(_writeTimeout);
    _writeTimeout = null;
  }
  if (_writeQueue.length > 0) {
    await processWriteQueue();
  }
}

function emergencyWrite(updates) {
  try {
    const current = global._botState || {};
    const newState = { ...current, ...updates, _emergencySave: Date.now() };
    const json = JSON.stringify(newState);
    fsSync.writeFileSync(STATE_FILE, json, 'utf-8');
    fsSync.writeFileSync(STATE_BAK, json, 'utf-8');
  } catch (e) {
    console.error('[state] Emergency write failed:', e.message);
  }
}

process.on('beforeExit', async () => {
  await flushState();
});

process.on('SIGTERM', async () => {
  await flushState();
});

process.on('SIGINT', async () => {
  await flushState();
});

module.exports = {
  readState,
  writeState,
  writeStateSync,
  flushState,
  emergencyWrite,
  CRITICAL_FIELDS,
  readNamedState,
  writeNamedState,
  markRestoreDone,
};
