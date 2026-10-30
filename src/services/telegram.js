// ════════════════════════════════════════════════════════════════════════════
//  ICT GOLD BOT PRO — Telegram Service v1.0
//  Handles all Telegram communication with queue, retries, and rate limiting
// ════════════════════════════════════════════════════════════════════════════

const https = require('https');
const logger = require('../lib/logger');
const db = require('../lib/database');
const { circuitBreakers } = require('../lib/circuitBreaker');

class TelegramService {
  constructor(options = {}) {
    this.token = options.token || process.env.TELEGRAM_BOT_TOKEN;
    this.defaultChatId = options.chatId || process.env.TELEGRAM_CHAT_ID;
    this.queue = [];
    this.processing = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.agent = new https.Agent({ keepAlive: true, maxSockets: 2 });
  }
  
  // Send a message
  async send(text, chatId = null, parseMode = 'Markdown') {
    const target = chatId || this.defaultChatId;
    if (!this.token || !target) {
      logger.warn('Telegram not configured');
      return;
    }
    
    // Queue the message
    this.queue.push({ text, chatId: target, parseMode });
    if (!this.processing) {
      this.processQueue();
    }
  }
  
  // Process the queue
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    if (this.retryCount > this.maxRetries) {
      logger.error('Telegram queue retry limit exceeded, clearing queue');
      this.queue = [];
      this.retryCount = 0;
      this.processing = false;
      return;
    }
    
    this.processing = true;
    
    // Take up to 5 messages at a time
    const batch = this.queue.splice(0, 5);
    
    let success = true;
    for (const item of batch) {
      try {
        await this._sendSingle(item.text, item.chatId, item.parseMode);
        // Rate limit: 1 message per 300ms
        await new Promise(r => setTimeout(r, 300));
      } catch(e) {
        logger.error('Telegram send error:', e.message);
        success = false;
        // Re-queue failed message
        this.queue.push(item);
      }
    }
    
    this.processing = false;
    this.retryCount = success ? 0 : this.retryCount + 1;
    
    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), success ? 100 : 5000);
    }
  }
  
  // Send a single message
  async _sendSingle(text, chatId, parseMode = 'Markdown') {
    // Sanitize text for Markdown
    const sanitized = this._sanitizeText(text);
    
    const body = JSON.stringify({
      chat_id: chatId,
      text: sanitized,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    });
    
    return circuitBreakers.telegram.execute(async () => {
      return new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.telegram.org',
          path: `/bot${this.token}/sendMessage`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          agent: this.agent,
          timeout: 10000,
        });
        
        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
        req.on('response', (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode !== 200) {
              // Retry without Markdown if parse error
              if (res.statusCode === 400 && data.includes('can\'t parse entities')) {
                logger.warn('Markdown parse error, retrying without formatting');
                this._sendSingle(text, chatId, null)
                  .then(resolve)
                  .catch(reject);
                return;
              }
              reject(new Error(`Telegram API error: ${res.statusCode} - ${data.substring(0, 200)}`));
            }
            resolve();
          });
        });
        req.write(body);
        req.end();
      });
    });
  }
  
  // Sanitize text for Telegram Markdown
  _sanitizeText(text) {
    if (!text) return '';
    
    // Escape special characters
    const specialChars = {
      '_': '\\_',
      '*': '\\*',
      '[': '\\[',
      ']': '\\]',
      '(': '\\(',
      ')': '\\)',
      '~': '\\~',
      '`': '\\`',
      '>': '\\>',
      '#': '\\#',
      '+': '\\+',
      '-': '\\-',
      '=': '\\=',
      '|': '\\|',
      '{': '\\{',
      '}': '\\}',
      '.': '\\.',
      '!': '\\!',
    };
    
    let escaped = '';
    for (const char of text) {
      if (specialChars[char]) {
        escaped += specialChars[char];
      } else {
        escaped += char;
      }
    }
    
    // Trim to Telegram's limit
    if (escaped.length > 4000) {
      escaped = escaped.substring(0, 3997) + '...';
    }
    
    return escaped;
  }
  
  // Handle incoming commands
  async handleCommand(text, chatId) {
    const state = global._botState || {};
    const C = state.botConfig?.currency || 'R';
    
    // Parse command
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    switch(cmd) {
      case '/status':
        return this._getStatus(state, C);
      case '/analysis':
        return this._getAnalysis(state);
      case '/on':
        return this._startBot(state);
      case '/off':
        return this._stopBot(state);
      case '/pause':
        return this._pauseBot(state);
      case '/resume':
        return this._resumeBot(state);
      case '/mode':
        return this._setMode(state, args[0]);
      case '/risk':
        return this._setRisk(state, args[0]);
      case '/close':
        return this._closeAll(state);
      case '/journal':
        return await this._getJournal(state);
      case '/performance':
        return await this._getPerformance(state);
      case '/help':
        return this._getHelp();
      default:
        return null;
    }
  }
  
  // Command handlers
  _getStatus(state, C) {
    const mode = state.activeMode || 'normal';
    const running = !state.botOff;
    const paused = state.paused;
    const status = !running ? 'STOPPED' : paused ? 'PAUSED' : 'RUNNING';
    const bal = state.bal ? `\nBalance: ${C}${parseFloat(state.bal).toFixed(2)}` : '';
    const openT = (state.positions||[]).length;
    const wins = state.wins || 0;
    const losses = state.losses || 0;
    const wr = (wins + losses) > 0 ? ((wins/(wins+losses))*100).toFixed(0) + '%' : '—';
    
    return `🤖 ICT Gold Bot Pro\n` +
      `Status: ${status}\n` +
      `Mode: ${mode.toUpperCase()}${bal}\n` +
      `Open trades: ${openT}\n` +
      `Win rate: ${wr}\n` +
      `/help for commands`;
  }
  
  _getAnalysis(state) {
    const a = state.analysis;
    if (!a || a.score == null) {
      return 'No analysis available yet. Start the bot to begin scanning.';
    }
    
    const score = a.score;
    const scoreBar = '█'.repeat(Math.min(Math.round(score), 10)) + '░'.repeat(Math.max(0, 10-Math.round(score)));
    return `📊 Analysis\n${scoreBar} ${score}/10\n` +
      `Bias: ${(a.bias||'neutral').toUpperCase()}\n` +
      `Signal: ${(a.signal||'none').toUpperCase()}\n` +
      `KZ: ${a.kzOn ? '✅' : '❌'}\n` +
      `Liquidity: ${a.liqSwept ? '✅' : '❌'}\n` +
      `MSS: ${a.mssDir || 'none'}\n` +
      `OTE: ${a.ote ? '✅' : '❌'}\n` +
      `Triple Zone: ${a.tripleZone ? '✅' : '❌'}\n` +
      `MTF Align: ${a.fullMTFAlign ? '✅' : '❌'}\n` +
      `Fresh FVGs: ${a.freshFVGs || 0}\n` +
      `Retested FVGs: ${a.retestedFVGs || 0}\n` +
      `ADX: ${a.adx || '—'}`;
  }
  
  _startBot(state) {
    global.writeStateSync({ botOff: false, botOffAt: null, status: 'scanning' });
    return '✅ Bot STARTED — engine is now active and scanning for setups.';
  }
  
  _stopBot(state) {
    global.writeStateSync({ botOff: true, botOffAt: new Date().toISOString(), status: 'stopped' });
    return '⏹ Bot STOPPED — engine is offline. Send /on to restart.';
  }
  
  _pauseBot(state) {
    global.writeStateSync({ paused: true, pausedAt: new Date().toISOString(), status: 'paused' });
    return '⏸ Bot PAUSED';
  }
  
  _resumeBot(state) {
    global.writeStateSync({ paused: false, pausedAt: null, status: 'scanning' });
    return '▶️ Bot RESUMED';
  }
  
  _setMode(state, mode) {
    if (!mode || mode === 'auto') {
      global.writeStateSync({ manualMode: false });
      return `Auto mode re-enabled. Current: ${state.activeMode || 'normal'}`;
    }
    if (['normal','sniper','aggressive'].includes(mode)) {
      global.writeStateSync({ activeMode: mode, manualMode: true });
      return `Mode: ${mode.toUpperCase()}`;
    }
    return 'Invalid mode. Options: normal, sniper, aggressive, auto';
  }
  
  _setRisk(state, value) {
    const val = parseFloat(value);
    if (isNaN(val) || val <= 0 || val > 10) {
      return `Current risk: ${state.botConfig?.risk || '1'}%\nUsage: /risk 1.5`;
    }
    const cfg = state.botConfig || {};
    global.writeStateSync({ botConfig: { ...cfg, risk: val } });
    return `Risk: ${val}%`;
  }
  
  _closeAll(state) {
    return 'Closing all positions... (This requires the dashboard to be open)';
  }
  
  async _getJournal(state) {
    try {
      const trades = await db.getTrades({}, 20);
      if (!trades.length) return 'No trades in history yet.';
      
      const C = state.botConfig?.currency || 'R';
      const total = trades.length;
      const wins = trades.filter(t => t.outcome === 'win').length;
      const losses = trades.filter(t => t.outcome === 'loss').length;
      const pnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
      
      return `📓 Recent Trades\n${total} trades | ${wins}W ${losses}L\nP&L: ${C}${pnl.toFixed(2)}\n\n` +
        trades.slice(0, 5).map(t => 
          `${t.outcome === 'win' ? '✅' : '❌'} ${t.symbol} ${t.direction.toUpperCase()} ${t.volume}lot @ ${t.entryPrice}\n` +
          `  ${t.outcome === 'win' ? '+' : ''}${t.pnl?.toFixed(2)}`
        ).join('\n');
    } catch(e) {
      logger.error('Journal error:', e.message);
      return 'Error fetching journal.';
    }
  }
  
  async _getPerformance(state) {
    try {
      const trades = await db.getTrades({}, 100);
      if (!trades.length) return 'No performance data yet.';
      
      const wins = trades.filter(t => t.outcome === 'win');
      const losses = trades.filter(t => t.outcome === 'loss');
      const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
      const winRate = trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) : 0;
      const C = state.botConfig?.currency || 'R';
      const best = trades.reduce((b, t) => (t.pnl || 0) > (b.pnl || 0) ? t : b, trades[0]);
      const worst = trades.reduce((b, t) => (t.pnl || 0) < (b.pnl || 0) ? t : b, trades[0]);
      
      return `📊 Performance\n${trades.length} trades | ${wins.length}W ${losses.length}L\n` +
        `Win Rate: ${winRate}%\n` +
        `Total P&L: ${C}${totalPnl.toFixed(2)}\n` +
        `Best: +${C}${(best.pnl||0).toFixed(2)}\n` +
        `Worst: ${C}${(worst.pnl||0).toFixed(2)}`;
    } catch(e) {
      logger.error('Performance error:', e.message);
      return 'Error fetching performance.';
    }
  }
  
  _getHelp() {
    return `📱 Commands\n` +
      `/status — Bot status\n` +
      `/on — Start bot\n` +
      `/off — Stop bot\n` +
      `/pause — Pause trading\n` +
      `/resume — Resume trading\n` +
      `/mode [normal|sniper|aggressive|auto]\n` +
      `/risk [0.5-10]\n` +
      `/analysis — Live confluence\n` +
      `/journal — Today's trades\n` +
      `/performance — All-time stats\n` +
      `/close — Close all positions\n` +
      `/help — This menu`;
  }
}

module.exports = { TelegramService };
