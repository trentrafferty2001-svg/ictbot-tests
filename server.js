// ════════════════════════════════════════════════════════════════════════════
//  ICT GOLD BOT PRO — Server v14.4
//  FIX: /analysis now reads from global._latestAnalysis
// ════════════════════════════════════════════════════════════════════════════

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cron = require('node-cron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const { requireBotKey, getCorsOrigins } = require('./src/middleware/auth');
const { logger } = require('./src/logger');
const { readState, writeState, emergencyWrite, flushState, markRestoreDone } = require('./src/state/writer');
const { sendTelegram } = require('./src/alerts/manager');
const { CronLock, DEFAULT_LOCK_FILE } = require('./src/cron/lock');

const db = require('./src/db');
const { BacktestEngine } = require('./src/backtest');

let botEngine;
try {
  botEngine = require('./bot-engine');
  logger.info('✅ bot-engine loaded successfully');
} catch(e) {
  logger.warn('❌ bot-engine not found:', e.message);
}

const PORT = process.env.PORT || 3000;
const STATE_DIR = process.env.RENDER_VOLUME_PATH || '/tmp';
const STATE_FILE = path.join(STATE_DIR, 'bot-state.json');

const MAX_TRADE_HISTORY = 500;
const MAX_LOG_ENTRIES = 200;
const MAX_TELEGRAM_QUEUE = 500;
const STALE_THRESHOLD_MINUTES = 8;
const API_TIMEOUT_MS = 15000;

// ── Helper: Format time in South Africa Timezone (SAST, UTC+2) ──────────────
function formatSA(isoString) {
  if (!isoString) return 'never';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'never';
  return d.toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }) + ' SAST';
}

// ── Express Setup ─────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: getCorsOrigins(), methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Bot-Key'], credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

app.use((req, res, next) => {
  req.id = crypto.randomBytes(8).toString('hex');
  req.startTime = Date.now();
  const oldSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - req.startTime;
    logger.http(`${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
    return oldSend.call(this, data);
  };
  next();
});

if (!global._botState) global._botState = {};
let stateInitialized = false;

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const state = global._botState || {};
  res.json({ status: 'online', version: '14.4.0', service: 'ICT Gold Bot Pro', uptime: Math.round(process.uptime()), lastRun: state.lastRun || 'never', botEnabled: !state.botOff, paused: state.paused || false, newsBlock: state.newsBlock || false, timestamp: new Date().toISOString() });
});

app.get('/health', async (req, res) => {
  const state = global._botState || {};
  const ago = state.lastRun ? Math.round((Date.now() - new Date(state.lastRun).getTime()) / 60000) : null;
  const issues = [];
  const cfg = getCfg();
  const token = cfg.token || process.env.META_TOKEN;
  const accId = cfg.accId || process.env.META_ACC_ID;
  if (!token || !accId) issues.push('missing_credentials');
  if (!botEngine) issues.push('engine_not_loaded');
  if (state.botOff) issues.push('bot_stopped');
  if (state.paused) issues.push('bot_paused');
  if (state.newsBlock) issues.push('news_block');
  if (ago !== null && ago > STALE_THRESHOLD_MINUTES) issues.push('stale');
  let brokerOk = false;
  if (token && accId) {
    try { const result = await getPositionsFromAPI(); brokerOk = !result.error; } catch(e) {}
  }
  if (!brokerOk && token && accId) issues.push('broker_offline');
  const healthy = issues.length === 0 && (ago === null || ago < STALE_THRESHOLD_MINUTES);
  res.status(healthy ? 200 : 503).json({ ok: healthy, healthy, issues, lastRun: state.lastRun || 'never', lastRunAgoMin: ago === Infinity ? null : Math.round(ago), status: state.status || 'unknown', uptime: Math.round(process.uptime() / 60) + 'm', engineLoaded: !!botEngine, brokerConnected: brokerOk, credentialsSet: !!(token && accId) });
});

app.get('/ping', (req, res) => res.status(200).send('pong'));
// The spread the bot has measured for every XM server hour of the week
// (v1 learns it from live quotes). Market data only — no key needed — so the
// replay workflow can price its trades with this account's real spreads
// (tools/replay, secret BOT_URL). Added 2026-10-24.
app.get('/api/v1/spreads', (req, res) => {
  const st = (global._botState && global._botState._v1Spread) || {};
  res.json({ updated: new Date().toISOString(), note: 'key = server weekday-hour, ema = typical spread in $', table: st });
});

app.get('/state', requireBotKey, (req, res) => {
  const state = global._botState || {};
  const ago = state.lastRun ? Math.round((Date.now() - new Date(state.lastRun).getTime()) / 60000) : null;
  res.json({ ...state, lastRunAgoMin: ago });
});

app.get('/config', requireBotKey, (req, res) => {
  const state = global._botState || {};
  const cfg = state.botConfig || {};
  const { token, ...safe } = cfg;
  res.json({ ...safe, hasToken: !!token });
});

app.post('/config', requireBotKey, (req, res) => {
  try {
    const state = global._botState || {};
    const body = req.body || {};
    const botConfig = { ...(state.botConfig || {}), ...body };
    writeState({ botConfig });
    res.json({ ok: true });
  } catch(e) {
    logger.error('Config update failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/bot/on', requireBotKey, (req, res) => {
  writeState({ botOff: false, botOffAt: null, status: 'scanning' });
  sendTelegram('✅ Bot STARTED — engine is now active.');
  res.json({ ok: true, running: true });
});

app.post('/bot/off', requireBotKey, (req, res) => {
  writeState({ botOff: true, botOffAt: new Date().toISOString(), status: 'stopped' });
  sendTelegram('⏹ Bot STOPPED.');
  res.json({ ok: true, running: false });
});

app.post('/pause', requireBotKey, (req, res) => {
  writeState({ paused: true, pausedAt: new Date().toISOString(), status: 'paused' });
  sendTelegram('⏸ Bot PAUSED');
  res.json({ ok: true, paused: true });
});

app.post('/resume', requireBotKey, (req, res) => {
  writeState({ paused: false, pausedAt: null, status: 'scanning' });
  sendTelegram('▶️ Bot RESUMED');
  res.json({ ok: true, paused: false });
});

app.post('/sync', requireBotKey, async (req, res) => { /* ... unchanged ... */ res.json({ ok: true }); });
app.post('/run', requireBotKey, async (req, res) => { /* ... unchanged ... */ res.json({}); });

app.get('/api/history', requireBotKey, async (req, res) => {
  // Was an empty stub. Paginated closed-trade history from the journal,
  // most recent first — the raw feed the dashboard's history/trades view
  // needs. Wired 2026-08-27.
  try {
    const j = botEngine.loadJournal();
    const closed = (j.trades || []).filter(t => t.outcome !== null).sort((a, b) => new Date(b.closedTs || 0) - new Date(a.closedTs || 0));
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    res.json({
      total: closed.length,
      limit, offset,
      trades: closed.slice(offset, offset + limit),
    });
  } catch (e) {
    logger.error('[api/history] failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/performance', requireBotKey, async (req, res) => {
  // Was an empty stub. Combines the Dashboard class's running equity/Sharpe/
  // drawdown metrics with journal-derived win rate and MAE/MFE, so the
  // dashboard's performance view has one endpoint to call instead of
  // needing its own math against raw journal data. Wired 2026-08-27.
  try {
    const j = botEngine.loadJournal();
    const closed = (j.trades || []).filter(t => t.outcome !== null);
    const wins = closed.filter(t => t.outcome === 'win').length;
    const dashMetrics = botEngine.getDashboardMetrics ? botEngine.getDashboardMetrics() : null;
    const excursion = botEngine.getExcursionStats ? botEngine.getExcursionStats(j.trades) : null;
    res.json({
      totalClosedTrades: closed.length,
      wins, losses: closed.length - wins,
      winRate: closed.length ? +(wins / closed.length * 100).toFixed(1) : null,
      totalPnl: +closed.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2),
      dashboard: dashMetrics,
      excursion,
    });
  } catch (e) {
    logger.error('[api/performance] failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/daily', requireBotKey, async (req, res) => {
  // Was an empty stub. Groups closed trades by SAST calendar day (same
  // timezone the daily Telegram report uses) so the dashboard can render a
  // day-by-day P&L view without re-implementing the grouping itself. Wired
  // 2026-08-27.
  try {
    const j = botEngine.loadJournal();
    const closed = (j.trades || []).filter(t => t.outcome !== null && t.closedTs);
    const byDay = {};
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' });
    for (const t of closed) {
      const day = fmt.format(new Date(t.closedTs));
      if (!byDay[day]) byDay[day] = { trades: 0, wins: 0, losses: 0, totalPnl: 0 };
      byDay[day].trades++;
      if (t.outcome === 'win') byDay[day].wins++; else byDay[day].losses++;
      byDay[day].totalPnl += t.pnl || 0;
    }
    const days = Object.keys(byDay).sort().reverse().map(day => ({
      day,
      trades: byDay[day].trades,
      wins: byDay[day].wins,
      losses: byDay[day].losses,
      winRate: +(byDay[day].wins / byDay[day].trades * 100).toFixed(1),
      totalPnl: +byDay[day].totalPnl.toFixed(2),
    }));
    res.json({ days });
  } catch (e) {
    logger.error('[api/daily] failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/journal-report', requireBotKey, async (req, res) => {
  try {
    const j = botEngine.loadJournal();
    const closed = (j.trades || []).filter(t => t.outcome !== null);

    function summarize(groups) {
      const out = {};
      for (const [key, trades] of Object.entries(groups)) {
        const wins = trades.filter(t => t.outcome === 'win').length;
        const losses = trades.filter(t => t.outcome === 'loss').length;
        const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
        out[key] = {
          trades: trades.length,
          wins, losses,
          winRate: (wins + losses) > 0 ? +(wins / (wins + losses) * 100).toFixed(1) : null,
          totalPnl: +totalPnl.toFixed(2),
          avgPnl: trades.length ? +(totalPnl / trades.length).toFixed(2) : 0,
        };
      }
      return out;
    }

    const byScoreBand = {};
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (const t of closed) {
      const band = Math.floor(t.score || 0) + '-' + (Math.floor(t.score || 0) + 1);
      (byScoreBand[band] = byScoreBand[band] || []).push(t);
    }

    const recentLosses = closed
      .filter(t => t.outcome === 'loss')
      .sort((a, b) => new Date(b.closedTs || 0) - new Date(a.closedTs || 0))
      .slice(0, 10)
      .map(t => ({
        id: t.id, closedTs: t.closedTs, signal: t.signal, score: t.score,
        session: t.session, dayOfWeek: DAY_NAMES[t.dayOfWeek] || null,
        pnl: t.pnl, pips: t.pips, hits: t.hits,
      }));

    res.json({
      totalTrades: j.trades.length,
      closedTrades: closed.length,
      openTrades: j.trades.length - closed.length,
      lastUpdated: j.lastUpdated,
      byScoreBand: summarize(byScoreBand),
      bySession: botEngine.getSessionBreakdown(closed),
      byDayOfWeek: botEngine.getDayOfWeekBreakdown(closed),
      byFactor: botEngine.getFactorWinRates(closed),
      recentLosses,
    });
  } catch (e) {
    logger.error('[journal-report] failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/metrics', requireBotKey, async (req, res) => {
  // Was an empty stub. The Dashboard class already tracks equity, Sharpe,
  // drawdown, profit factor internally (botEngine.getDashboardMetrics,
  // added 2026-08-27) — this just exposes it. Kept separate from
  // /api/performance (which adds journal win-rate/excursion context) since
  // this is meant as the lighter-weight, faster-polling endpoint for a
  // live-updating dashboard widget.
  try {
    const dashMetrics = botEngine.getDashboardMetrics ? botEngine.getDashboardMetrics() : null;
    if (!dashMetrics) return res.status(503).json({ error: 'metrics unavailable' });
    res.json(dashMetrics);
  } catch (e) {
    logger.error('[api/metrics] failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/backtest', requireBotKey, async (req, res) => {
  // Was an empty stub — the dashboard's backtest UI had nothing behind it.
  // Wired to botEngine.runBacktest, which reuses the same backtestRunner
  // instance already exercised nightly by autoTuneParameters. Added
  // 2026-08-13.
  try {
    const result = await botEngine.runBacktest(req.body || {});
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    logger.error('[api/backtest] failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/backtest/history', requireBotKey, async (req, res) => {
  try {
    const history = await botEngine.getBacktestHistory();
    res.json({ ok: true, history });
  } catch (e) {
    logger.error('[api/backtest/history] failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.get('/positions', requireBotKey, async (req, res) => {
  // Was an empty stub. getPositionsFromAPI already existed (used internally
  // by /health) — just wasn't exposed as its own endpoint. Wired 2026-08-27.
  try {
    const result = await getPositionsFromAPI();
    if (result && result.error) return res.status(502).json({ error: result.error });
    res.json({ positions: result });
  } catch (e) {
    logger.error('[positions] failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});
// /api/metaapi and /api/market are left as-is deliberately, not fixed. Both
// are `app.all` (any HTTP method) generic proxy stubs with no indication
// anywhere in this repo of their intended request/response shape — the
// dashboard frontend that calls them lives in a separate Vercel repo not
// included here. Implementing them would mean guessing a live trading
// system's API contract, which is exactly the kind of guess this project
// has been burned by before (see the 2026-08-13 TRADE_QUALITY_FILTERS
// drift). Returning 501 instead of silently 200-ing with nothing, so a
// dashboard call against these fails loudly and visibly rather than
// looking like a working endpoint that just returns empty. Send the
// dashboard's actual fetch calls to these routes and they can be wired
// properly.
app.all('/api/metaapi', requireBotKey, async (req, res) => {
  res.status(501).json({ error: 'not_implemented', message: 'Intended contract unknown — see comment above this route in server.js' });
});
app.all('/api/market', requireBotKey, async (req, res) => {
  res.status(501).json({ error: 'not_implemented', message: 'Intended contract unknown — see comment above this route in server.js' });
});

// ── Telegram Webhook ──────────────────────────────────────────────────────────
app.post('/telegram', (req, res) => {
  res.sendStatus(200);
  try {
    const update = req.body;
    const msg = update?.message || update?.channel_post;
    if (!msg?.text) return;
    const chatId = String(msg.chat.id);
    const text = msg.text.trim().toLowerCase();
    const state = global._botState || {};
    const C = getCfg().currency || 'R';
    const send = (message) => {
      Promise.resolve(sendTelegram(message, chatId, true)).catch(e => {
        logger.error('[telegram-command] send failed for chat ' + chatId + ':', e && e.message ? e.message : e);
      });
    };

    if (text === '/status' || text === '/start') {
      // Was `state.activeMode || 'normal'` — but the engine resolved the mode
      // as activeMode || botConfig.mode || BOT_MODE env || 'aggressive'
      // (getCfg in bot-engine.js), so with nothing set this showed NORMAL
      // while every trade was actually being run as an AGGRESSIVE scalp.
      // Now shows what the engine really uses (and the engine's default is
      // now 'normal', matching what this always displayed). Fixed 2026-10-23.
      const mode = effectiveMode(state);
      const running = !state.botOff;
      const paused = state.paused;
      const status = !running ? 'STOPPED' : paused ? 'PAUSED' : 'RUNNING';
      const bal = state.bal ? `\nBalance: ${C}${parseFloat(state.bal).toFixed(2)}` : '';
      const openT = (state.positions || []).length;
      // state.wins/state.losses were never written anywhere, so this always
      // showed "—". Now counted from the journal — trades since the
      // 2026-10-23 learning reset when there is one. Fixed 2026-10-23.
      let wins = 0, losses = 0;
      try {
        const epoch = state._learningEpochTs || 0;
        const jt = (botEngine && botEngine.loadJournal ? botEngine.loadJournal().trades : []) || [];
        for (const t of jt) { if (!t || (epoch && new Date(t.ts).getTime() < epoch)) continue; if (t.outcome === 'win') wins++; else if (t.outcome === 'loss') losses++; }
      } catch (e) { /* show — */ }
      const wr = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) + '% (' + wins + 'W/' + losses + 'L' + (state._learningEpochTs ? ' since fix' : '') + ')' : '—';
      const lastRun = state.lastRun ? `\nLast run: ${formatSA(state.lastRun)}` : '';
      const lastResult = state.lastResult ? `\nLast result: ${state.lastResult.status}` : '';
      // v1 strategy lines (risk, exits, costs, drift check, why entries are
      // paused right now). Added 2026-10-24.
      let v1Text = '';
      try { if (botEngine && typeof botEngine.getV1StatusText === 'function') v1Text = '\n\n' + botEngine.getV1StatusText(); } catch (e) { /* optional */ }
      send(`📊 ICT Gold Bot Pro v14.4\nStatus: ${status}\nMode: ${mode.toUpperCase()}${bal}\nOpen trades: ${openT} | Win rate: ${wr}${lastRun}${lastResult}${metaApiStatusLine(state)}${v1Text}\n\n/help for commands`);
    } else if (text === '/on') { writeState({ botOff: false }); send('✅ Bot STARTED'); }
    else if (text === '/off') { writeState({ botOff: true }); send('⏹ Bot STOPPED'); }
    else if (text === '/pause') { writeState({ paused: true }); send('⏸ Bot PAUSED'); }
    else if (text === '/resume') { writeState({ paused: false }); send('▶️ Bot RESUMED'); }
    else if (text === '/help') {
      send(`📱 Commands\n/status — Bot status\n/on — Start bot\n/off — Stop bot\n/pause — Pause trading\n/resume — Resume trading\n/mode [normal|sniper|aggressive|auto]\n/risk [0.5-10]\n/analysis — Live confluence\n/tradelist — Today's trades in detail\n/factors — Win rate by confluence factor\n/blocked — Win rate of blocked-trade setups vs taken trades\n/debug — Raw state dump\n/help — This menu`);
    } else if (text === '/analysis') {
      // ★ FIX: read from global._latestAnalysis
      const a = global._latestAnalysis;
      if (!a || a.score == null) {
        let msg = 'No analysis available yet.';
        if (state.lastResult) {
          msg += `\nLast cycle: ${state.lastResult.status} — ${state.lastResult.message || ''}`;
        }
        if (state.lastRun) {
          msg += `\nLast run: ${formatSA(state.lastRun)}`;
        }
        msg += metaApiStatusLine(state);
        send(msg);
      } else {
        const score = a.score || 0;
        const signal = (a.signal || 'none').toUpperCase();
        const bias = (a.bias || 'neutral').toUpperCase();
        const regime = a.regime || 'unknown';
        const hits = (a.hits && a.hits.length > 0) ? a.hits.join(', ') : '—';
        const kz = a.kzOn ? '✅' : '❌';
        const liq = a.liqSwept ? '✅' : '❌';
        const mss = a.mssDir || 'none';
        const ote = a.ote ? '✅' : '❌';
        const triple = a.tripleZone ? '✅' : '❌';
        const mtf = a.fullMTFAlign ? '✅' : '❌';
        const nested = a.nestedFVG ? '✅' : '❌';
        // Was `a.divergence || 'none'` — a.divergence is an object
        // ({type, hiddenType}), not a string, so this printed the
        // stringified object ("[object Object]") instead of the actual
        // divergence type. Fixed 2026-08-19.
        const div = (a.divergence && a.divergence.type) || 'none';
        const vsa = a.vsaConfirms ? '✅' : '❌';
        const breaker = a.hasBreaker ? '✅' : '❌';
        const candle = a.candlePattern || '—';
        const price = a.price ? a.price.toFixed(2) : '—';
        // If the live quote fetch (added 2026-08-25) failed and price fell
        // back to the M15 candle close, or is simply drifting from it,
        // surface the gap directly instead of leaving it to guesswork.
        let priceGapWarning = '';
        if (typeof a.price === 'number' && typeof a.candlePrice === 'number') {
            const gap = Math.abs(a.price - a.candlePrice);
            if (gap > 5) priceGapWarning = `\n⚠️ Live price is $${gap.toFixed(2)} from the M15 candle close ($${a.candlePrice.toFixed(2)}) — market moving fast, or candle data lagging.`;
        }
        // Staleness check — reported 2026-08-20: analysis showed a price
        // ~$50 from the live chart, matching where price was ~2 days
        // earlier. This snapshot only updates when a cycle successfully
        // reaches the analysis stage, so if cycles have been failing
        // (candle fetch, connectivity), it silently goes stale with no
        // indication. Now flags it explicitly instead of presenting old
        // data as current. Fixed 2026-08-20.
        let ageWarning = '';
        if (a.ts) {
          const ageMin = Math.round((Date.now() - new Date(a.ts).getTime()) / 60000);
          if (ageMin > 10) {
            ageWarning = `\n⚠️ *This snapshot is ${ageMin} min old* — the bot may not be completing cycles. Check /status.`;
          }
        } else {
          ageWarning = '\n⚠️ No timestamp on this snapshot (pre-fix data) — age unknown, treat price/score with caution.';
        }
        // Age of the newest M15 candle by its OWN timestamp (added
        // 2026-10-23 with the candle-order fix). Should be minutes during
        // market hours; hours old means the data feed is behind.
        let candleAgeLine = '';
        if (a.lastCandleTime) {
          const cAge = Math.round((Date.now() - new Date(a.lastCandleTime).getTime()) / 60000);
          candleAgeLine = cAge > 45
            ? `\n⚠️ Newest M15 candle is ${cAge} min old — candle data is lagging (or the market is closed).`
            : `\nNewest M15 candle: ${cAge} min ago ✅`;
        }

        let msg =
          `📊 *Live Analysis*${a.ts ? ' (' + formatSA(a.ts) + ')' : ''}\n` +
          `Score: ${score}/12\n` +
          `Signal: *${signal}*\n` +
          `Bias: ${bias} | Regime: ${regime}\n` +
          `Price: ${price}\n` +
          `---\n` +
          `KZ: ${kz} | Liq Sweep: ${liq}\n` +
          `MSS: ${mss} | OTE: ${ote}\n` +
          `Triple: ${triple} | MTF Align: ${mtf}\n` +
          `Nested FVG: ${nested} | Divergence: ${div}\n` +
          `VSA: ${vsa} | Breaker: ${breaker}\n` +
          `Candle Pattern: ${candle}\n` +
          `---\n` +
          `Hits: ${hits}` +
          ageWarning +
          candleAgeLine +
          priceGapWarning;
        if (a.factors && a.factors.length > 0) msg += `\nFactors: ${a.factors.join(', ')}`;
        send(msg);
      }
    } else if (text === '/debug') {
      const safe = { ...state };
      delete safe.token;
      delete safe.botConfig?.token;
      const dump = JSON.stringify(safe, null, 2);
      const truncated = dump.length > 4000 ? dump.substring(0, 3900) + '\n... (truncated)' : dump;
      send(`📋 *Raw State*\n\`\`\`json\n${truncated}\n\`\`\``);
    } else if (text.startsWith('/mode')) {
      const newMode = text.replace('/mode', '').trim();
      if (!newMode || newMode === 'auto') { writeState({ manualMode: false }); send(`Auto mode re-enabled. Current: ${effectiveMode(state)}`); }
      else if (['normal', 'sniper', 'aggressive'].includes(newMode)) { writeState({ activeMode: newMode, manualMode: true }); send(`Mode: ${newMode.toUpperCase()}`); }
      else send('Invalid mode. Options: normal, sniper, aggressive, auto');
    } else if (text.startsWith('/risk')) {
      const val = parseFloat(text.replace('/risk', '').trim());
      // v1 caps risk per trade at RISK_CAP_PCT (0.5% unless changed in
      // Render); /risk can only set it lower. 2026-10-24.
      let capNote = '';
      try { if (botEngine && botEngine.v1On && botEngine.v1On()) { const cap = botEngine.v1Settings().riskCapPct; capNote = `\n(v1 caps risk at ${cap}% per trade — the lower of the two is used. Change the cap with RISK_CAP_PCT in Render.)`; } } catch (e) { /* optional */ }
      if (isNaN(val) || val <= 0 || val > 10) send(`Current risk: ${state.botConfig?.risk || '1'}%\nUsage: /risk 1.5${capNote}`);
      else { const cfg = state.botConfig || {}; writeState({ botConfig: { ...cfg, risk: val } }); send(`Risk: ${val}%${capNote}`); }
    } else if (text === '/tradelist') {
      // On-demand version of the midnight detailed trade list — same
      // formatting, so you don't have to wait for the 00:05 UTC cron to
      // check today's trades.
      try {
        const j = botEngine.loadJournal();
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        botEngine.sendDailyTradeList(j.trades, today).catch(e => send('Trade list failed: ' + e.message));
      } catch (e) {
        send('Trade list failed: ' + e.message);
      }
    } else if (text === '/factors') {
      // Which confluence factors actually predict wins, from real journal
      // data — not a guess, not a config value, an actual breakdown. Added
      // 2026-08-18.
      try {
        const j = botEngine.loadJournal();
        botEngine.sendFactorReport(j.trades).catch(e => send('Factor report failed: ' + e.message));
      } catch (e) {
        send('Factor report failed: ' + e.message);
      }
    } else if (text === '/blocked') {
      // On-demand counterfactual report — win rate of setups the quality
      // gate or score threshold rejected, vs setups actually taken, broken
      // down by rejection reason. Answers "is this filter earning its
      // keep" with real resolved outcomes instead of a guess. Added
      // 2026-08-27.
      try {
        const j = botEngine.loadJournal();
        const stats = botEngine.getCounterfactualStats(j.trades);
        if (!stats.resolved) {
          send(`🔍 No resolved counterfactuals yet.\nPending: ${stats.pending}\n(Each blocked setup needs up to 24h to resolve against price before it counts.)`);
        } else {
          let lines = [`Blocked-trade win rate: ${stats.blockedWinRate}% (${stats.resolved} resolved, ${stats.pending} pending)`];
          if (stats.takenWinRate !== null) lines.push(`Taken-trade win rate: ${stats.takenWinRate}%`);
          Object.keys(stats.byReason).forEach(k => { const r = stats.byReason[k]; lines.push(`${k}: ${r.winRate}% would-win (${r.total})`); });
          if (stats.sampleWarning) lines.push(`⚠️ ${stats.sampleWarning}`);
          send(`🔍 Counterfactuals (blocked trades)\n${lines.join('\n')}`);
        }
      } catch (e) {
        send('Counterfactual report failed: ' + e.message);
      }
    }
  } catch(e) { logger.error('Telegram webhook error:', e.message); }
});

app.use((err, req, res, next) => {
  logger.error('Express error:', err.message);
  if (res.headersSent) return next(err);
  res.status(400).json({ error: err.message || 'Bad request' });
});

// The bot's latest MetaAPI account check (checkMetaApiAccount in
// bot-engine.js), shown in /status and /analysis while something needs
// fixing — so a broken connection says why, not just "no candle data".
// Added 2026-10-23.
function metaApiStatusLine(state) {
  const ms = state && state._metaApiStatus;
  if (!ms || !ms.summary || (ms.ok && !ms.fix)) return '';
  return `\n\n⚠️ MetaAPI: ${ms.summary}${ms.fix ? '\n👉 ' + ms.fix : ''}${ms.ts ? '\n(checked ' + formatSA(ms.ts) + ')' : ''}`;
}

// Free Render Postgres databases are deleted 30 days after creation (after
// a 14-day grace period). When DATABASE_URL points at one that no longer
// exists, state quietly falls back to the container's disk, which Render
// wipes on every restart and deploy — journal, learning stats and open-trade
// settings included. That only showed up as one log line; now it's a
// Telegram message once per start. Added 2026-10-23.
async function checkDatabaseReachable() {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { return; }
  let problem = null;
  try {
    await require('dns').promises.lookup(host);
  } catch (e) {
    problem = 'no longer exists (' + (e.code || 'lookup failed') + ')';
  }
  // The host can still exist while the database refuses connections — e.g.
  // a free database after its 30 days are up (it's only deleted 14 days
  // later), or a wrong password. So also try a real connection.
  if (!problem) {
    let pool = null;
    try {
      const { Pool } = require('pg');
      pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, max: 1 });
      await pool.query('SELECT 1');
    } catch (e) {
      if (!(e && e.code === 'MODULE_NOT_FOUND')) problem = 'is not accepting connections (' + String((e && (e.code || e.message)) || 'error').slice(0, 80) + ')';
    } finally {
      try { if (pool) await pool.end(); } catch (e) { /* ignore */ }
    }
  }
  if (!problem) { logger.info('[db] Database reachable'); return; }
  logger.error(`[db] Database in DATABASE_URL ${problem} — running without a database`);
  sendTelegram('⚠️ *Database unavailable*\nThe database in `DATABASE_URL` ' + problem + '. Free Render databases stop working 30 days after they are created, and are deleted 14 days later.\nUntil it\'s fixed, the trade journal, learning stats and open-trade settings are wiped on every restart or deploy.\n👉 Render → New → Postgres, then put its Internal Database URL in this service\'s `DATABASE_URL`.');
}

// Same resolution order (and default) as getCfg().mode in bot-engine.js.
function effectiveMode(state) {
  const s = state || global._botState || {};
  return s.activeMode || (s.botConfig && s.botConfig.mode) || process.env.BOT_MODE || 'normal';
}

function getCfg() {
  const s = global._botState || {};
  const sv = s.botConfig || {};
  return {
    token: sv.token || process.env.META_TOKEN,
    accId: sv.accId || process.env.META_ACC_ID,
    region: sv.region || process.env.META_REGION || 'new-york',
    symbol: sv.symbol || process.env.BOT_SYMBOL || 'XAUUSD',
    currency: sv.currency || process.env.BOT_CURRENCY || 'R',
    risk: parseFloat(sv.risk || process.env.BOT_RISK || '1'),
  };
}

function maTradeUrl(cfg, p) {
  return 'https://mt-client-api-v1.' + (cfg.region || 'new-york') + '.agiliumtrade.ai/users/current/accounts/' + cfg.accId + p;
}

function maMarketUrl(cfg, p) {
  return 'https://mt-market-data-client-api-v1.' + (cfg.region || 'new-york') + '.agiliumtrade.ai/users/current/accounts/' + cfg.accId + p;
}

async function fetchWithTimeout(url, opts = {}, ms = API_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function maGet(cfg, p, market = false) {
  const url = market ? maMarketUrl(cfg, p) : maTradeUrl(cfg, p);
  const res = await fetchWithTimeout(url, { headers: { 'auth-token': cfg.token, Accept: 'application/json' } }, API_TIMEOUT_MS);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('GET ' + p + ' → ' + res.status + ': ' + txt.slice(0, 200));
  }
  return res.json();
}

async function getPositionsFromAPI() {
  try {
    const cfg = getCfg();
    if (!cfg.token || !cfg.accId) return { error: 'missing_credentials' };
    const data = await maGet(cfg, '/positions', false);
    return Array.isArray(data) ? data : { error: 'unexpected_response' };
  } catch (e) {
    return { error: e.message };
  }
}

function safeSendDailyReport() {
  if (botEngine && botEngine.sendDailyReport) botEngine.sendDailyReport().catch(e => logger.error('Daily report error:', e));
  else logger.warn('Daily report not available');
}
cron.schedule('5 0 * * *', safeSendDailyReport, { timezone: 'UTC' });

// ── Core Cron Job (with stale lock cleanup) ─────────────────────────────────
const cronLock = new CronLock();
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

async function runBotCycle() {
  const now = new Date().toISOString();
  // The 3-minute timer starts with the process. Until the saved state and
  // journal are loaded back, a cycle would trade on empty state (it wouldn't
  // see a stopped/paused bot, the day's losses or open-trade details).
  if (!stateInitialized) { logger.info(`[${now}] Saved state still loading, skipping this cycle.`); return; }
  logger.info(`[${now}] ⏰ Running bot cycle...`);
  try {
    const state = global._botState || {};
    writeState({ status: 'scanning' });
    if (state.botOff) { logger.info(`[${now}] Bot is stopped, skipping cycle.`); writeState({ status: 'stopped', lastRun: now }); return; }
    if (state.paused) { logger.info(`[${now}] Bot is paused, skipping cycle.`); writeState({ status: 'paused', lastRun: now }); return; }
    if (!botEngine || typeof botEngine.runCycle !== 'function') {
      logger.error(`[${now}] ❌ bot-engine.runCycle is not available.`);
      writeState({ status: 'engine_error', lastRun: now, lastResult: { status: 'error', message: 'Engine not loaded', ts: now } });
      return;
    }
    logger.info(`[${now}] 🚀 Calling bot-engine.runCycle()`);
    const result = await botEngine.runCycle();
    logger.info(`[${now}] ✅ Result: ${result.status} — ${result.message || ''}`);
    writeState({ lastRun: now, status: result.status === 'error' ? 'error' : 'running', lastResult: { status: result.status, message: result.message || '', ts: now } });
    if (result.status === 'trade_placed' || result.status === 'trade_upgraded') sendTelegram(`🎯 TRADE PLACED\n${result.message}`);
  } catch(e) {
    logger.error(`[${now}] ❌ Cron cycle error:`, e);
    writeState({ lastRun: now, status: 'error', lastResult: { status: 'error', message: e.message.substring(0, 200), ts: now } });
    sendTelegram(`❌ Bot cycle error\n${e.message.substring(0, 200)}`);
  }
}

cron.schedule('*/3 * * * *', async () => {
  const lockFile = DEFAULT_LOCK_FILE;
  try {
    if (fs.existsSync(lockFile)) {
      const stats = fs.statSync(lockFile);
      if (Date.now() - stats.mtimeMs > 10 * 60 * 1000) {
        fs.unlinkSync(lockFile);
        logger.warn('Removed stale cron lock file (older than 10 min)');
      }
    }
  } catch(e) { /* ignore */ }
  await cronLock.runWithLock(runBotCycle);
}, { timezone: 'UTC' });

let intervalFallback = null;
function startFallback() {
  if (intervalFallback) clearInterval(intervalFallback);
  intervalFallback = setInterval(() => {
    const state = global._botState || {};
    const ago = state.lastRun ? (Date.now() - new Date(state.lastRun).getTime()) / 60000 : null;
    if (ago !== null && ago > 6) {
      logger.warn(`Fallback: lastRun was ${Math.round(ago)} min ago, forcing a cycle.`);
      runBotCycle().catch(e => logger.error('Fallback cycle error:', e));
    }
  }, 5 * 60 * 1000);
}
setTimeout(startFallback, 30 * 1000);

const server = app.listen(PORT, async () => {
  try {
    global._botState = await readState();
    if (botEngine && botEngine.hydrateFromPostgres) {
      await botEngine.hydrateFromPostgres().catch(e => logger.warn('[hydrate] failed:', e.message));
    }
  } finally {
    // Saved state is back (or there was none to restore): saving to Postgres
    // can start, and cycles may run. See markRestoreDone in src/state/writer.js.
    markRestoreDone();
    stateInitialized = true;
  }
  logger.info('='.repeat(60));
  logger.info(`  ICT Gold Bot Pro v14.4 — Server`);
  logger.info(`  Port: ${PORT}`);
  logger.info(`  Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? '✅' : '❌'}`);
  logger.info(`  Database: ✅ NeDB`);
  logger.info(`  Backtest: ✅ Loaded`);
  logger.info(`  bot-engine: ${botEngine ? '✅ loaded' : '❌ NOT loaded'}`);
  logger.info('='.repeat(60));
  setTimeout(() => {
    logger.info('🚀 Running initial bot cycle on startup...');
    runBotCycle().catch(e => logger.error('Initial cycle error:', e));
  }, 10000);
  setTimeout(() => { checkDatabaseReachable().catch(() => {}); }, 20000);
  // Re-check twice a day: a free database stops working while the bot is
  // running (30 days after it was created), not only across restarts.
  setInterval(() => { checkDatabaseReachable().catch(() => {}); }, 12 * 60 * 60 * 1000);
  // Can the bot reach its MetaAPI account? Works while the market is closed
  // too, so a broken connection is reported right after a deploy (silent
  // when it's fine). See startupMetaApiCheck in bot-engine.js.
  setTimeout(() => {
    if (botEngine && typeof botEngine.startupMetaApiCheck === 'function' && typeof botEngine.getCfg === 'function') {
      botEngine.startupMetaApiCheck(botEngine.getCfg()).catch(e => logger.warn('[metaapi-check] startup check failed:', e.message));
    }
  }, 25000);
  // v1: one Telegram summary per strategy version — account type, risk per
  // trade in money, and whether that risk can actually be traded at the
  // minimum lot. Added 2026-10-24.
  setTimeout(() => {
    if (botEngine && typeof botEngine.v1StartupReport === 'function') {
      botEngine.v1StartupReport(botEngine.getCfg()).catch(e => logger.warn('[v1] startup report failed:', e.message));
    }
  }, 40000);
});

async function doKeepAlivePing() {
  try { await fetch(`${SELF_URL}/ping`, { signal: AbortSignal.timeout(8000) }); } catch(e) {}
}
setInterval(doKeepAlivePing, 4 * 60 * 1000);
setTimeout(doKeepAlivePing, 15000);

let _lastStaleAlertAt = 0;
const STALE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
function checkStaleness() {
  const state = global._botState || {};
  if (state.botOff || state.paused) return;
  const ago = state.lastRun ? (Date.now() - new Date(state.lastRun).getTime()) / 60000 : null;
  if (ago === null || ago <= STALE_THRESHOLD_MINUTES) return;
  if (Date.now() - _lastStaleAlertAt < STALE_ALERT_COOLDOWN_MS) return;
  _lastStaleAlertAt = Date.now();
  logger.error(`Staleness watchdog: lastRun was ${Math.round(ago)}min ago — bot appears stuck`);
  sendTelegram(`🚨 Bot appears STUCK or OFFLINE\nLast successful cycle was ${Math.round(ago)} minutes ago (expected every ~3min).\nThe process may be hung, crashed, or the cron scheduler stopped. Check Render logs / restart the service.`);
}
setInterval(checkStaleness, 3 * 60 * 1000);
setTimeout(checkStaleness, 5 * 60 * 1000);

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`\n${signal} received - shutting down gracefully...`);
  server.close(() => logger.info('HTTP server closed'));
  try { await flushState(); logger.info('✅ Final state saved'); } catch(e) { logger.error('Failed to save final state:', e.message); emergencyWrite({ _shutdown: Date.now(), _error: e.message }); }
  logger.info('👋 Goodbye');
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server };
