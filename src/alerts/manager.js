// ════════════════════════════════════════════════════════════════════════════
//  Alert Manager with multiple channels
//  Telegram + Console fallback
// ════════════════════════════════════════════════════════════════════════════

const { logger } = require('../logger');

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

let _telegramQueue = [];
let _telegramSending = false;
const MAX_QUEUE = 500;

class AlertManager {
  constructor() {
    this.channels = [];
    
    if (TG_TOKEN && TG_CHAT) {
      this.channels.push({ type: 'telegram', enabled: true, priority: 1 });
    }
    
    this.channels.push({ type: 'console', enabled: true, priority: 2 });
    
    this.lastSendTimes = {};
    this.cooldowns = {
      telegram: 100,
      console: 0,
    };
    
    logger.info(`Alert channels: ${this.channels.map(c => c.type).join(', ')}`);
  }
  
  async send(message, options = {}) {
    const { priority = 'normal', chatId = null, markdown = true } = options;
    
    const truncated = String(message).substring(0, 4000);
    const failures = [];
    
    const sortedChannels = [...this.channels].sort((a, b) => a.priority - b.priority);
    
    for (const channel of sortedChannels) {
      if (!channel.enabled) continue;
      
      const now = Date.now();
      const lastSend = this.lastSendTimes[channel.type] || 0;
      const cooldown = this.cooldowns[channel.type] || 100;
      if (now - lastSend < cooldown) {
        await new Promise(r => setTimeout(r, cooldown - (now - lastSend) + 10));
      }
      
      try {
        let success = false;
        
        switch (channel.type) {
          case 'telegram':
            success = await this.sendTelegram(truncated, chatId, markdown);
            break;
          case 'console':
            this.sendConsole(truncated, priority);
            success = true;
            break;
        }
        
        if (success) {
          this.lastSendTimes[channel.type] = Date.now();
          return { success: true, channel: channel.type };
        }
        
        failures.push({ channel: channel.type, reason: 'send returned false' });
      } catch (e) {
        failures.push({ channel: channel.type, error: e.message });
        logger.warn(`[alert] ${channel.type} failed: ${e.message}`);
      }
    }
    
    logger.error('[alert] All alert channels failed:', failures);
    console.error('[ALERT] ALL CHANNELS FAILED:', message.substring(0, 200));
    
    return { success: false, failures };
  }
  
  async sendTelegram(text, chatId, markdown) {
    if (!TG_TOKEN || !TG_CHAT) {
      logger.debug('[alert] Telegram not configured');
      return false;
    }
    
    const target = chatId || TG_CHAT;
    
    if (_telegramSending) {
      if (_telegramQueue.length >= MAX_QUEUE) {
        logger.warn('[alert] Telegram queue full, dropping message');
        return false;
      }
      return new Promise((resolve) => {
        _telegramQueue.push({ 
          text: text.substring(0, 4000), 
          chatId: target, 
          markdown,
          resolve 
        });
        if (!_telegramSending) this.processTelegramQueue();
      });
    }
    
    return this._sendTelegramImmediate(text, target, markdown);
  }
  
  async _sendTelegramImmediate(text, chatId, markdown) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      let response = await fetch(
        `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            ...(markdown ? { parse_mode: 'Markdown' } : {}),
            disable_web_page_preview: true,
          }),
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeout);
      
      const body = await response.json().catch(() => ({}));
      
      if (!response.ok || body.ok === false) {
        if (markdown && response.status === 400) {
          logger.debug('[alert] Telegram Markdown failed, retrying as plain text');
          const retryResponse = await fetch(
            `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text,
                disable_web_page_preview: true,
              }),
            }
          );
          const retryBody = await retryResponse.json().catch(() => ({}));
          return retryResponse.ok && retryBody.ok !== false;
        }
        
        logger.warn(`[alert] Telegram send failed: ${response.status}`, body);
        return false;
      }
      
      return true;
    } catch (e) {
      if (e.name === 'AbortError') {
        logger.warn('[alert] Telegram timeout');
      } else {
        logger.warn('[alert] Telegram error:', e.message);
      }
      return false;
    }
  }
  
  async processTelegramQueue() {
    if (_telegramSending || _telegramQueue.length === 0) return;
    
    _telegramSending = true;
    const batch = _telegramQueue.splice(0, 5);
    
    for (const item of batch) {
      const success = await this._sendTelegramImmediate(
        item.text, 
        item.chatId, 
        item.markdown
      );
      
      if (item.resolve) item.resolve(success);
      
      if (batch.length > 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    
    _telegramSending = false;
    
    if (_telegramQueue.length > 0) {
      setTimeout(() => this.processTelegramQueue(), 100);
    }
  }
  
  sendConsole(text, priority) {
    const prefix = priority === 'critical' ? '🚨' : '📢';
    console.log(`[${priority.toUpperCase()}] ${prefix} ${text}`);
    return true;
  }
  
  async critical(message, options = {}) {
    return this.send(message, { ...options, priority: 'critical' });
  }
  
  async warn(message, options = {}) {
    return this.send(message, { ...options, priority: 'warn' });
  }
  
  async info(message, options = {}) {
    return this.send(message, { ...options, priority: 'normal' });
  }
}

let _alertManager = null;

function getAlertManager() {
  if (!_alertManager) {
    _alertManager = new AlertManager();
  }
  return _alertManager;
}

const digest = require('./digest');

function sendTelegram(message, chatId, skipDigest) {
  // skipDigest: true for direct replies to a command the user just sent —
  // these should never be delayed into the daily digest, since the user
  // is actively waiting for a response right now. Added 2026-08-11 after
  // finding that command replies (e.g. /help) have no special prefix, so
  // digest.isUrgent() classified them as non-urgent and they were being
  // silently buffered instead of sent — the actual cause of reported
  // total command silence. Automated trade/breakeven/etc notifications
  // don't pass this and are unaffected.
  if (!skipDigest && !digest.isUrgent(message)) {
    const buffered = digest.bufferMessage(message);
    if (buffered) return;
    // Buffer full (shouldn't realistically happen in a day) — fall
    // through and send immediately rather than silently drop it.
  }
  const manager = getAlertManager();
  manager.send(message, { chatId, markdown: true }).catch(() => {});
}

module.exports = {
  AlertManager,
  getAlertManager,
  sendTelegram,
};
