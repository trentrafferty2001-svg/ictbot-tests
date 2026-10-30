// ════════════════════════════════════════════════════════════════════════════
//  ICT GOLD BOT PRO — Health Check Service v1.0
//  Comprehensive health monitoring for the bot
// ════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../lib/logger');

class HealthCheck {
  constructor(options = {}) {
    this.stateFile = options.stateFile || '/tmp/bot-state.json';
    this.db = options.db || null;
    this.staleThreshold = options.staleThreshold || 12; // minutes
  }
  
  async check() {
    const issues = [];
    const details = {};
    
    // Check state file
    try {
      const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
      const ago = state.lastRun ? (Date.now() - new Date(state.lastRun).getTime()) / 60000 : null;
      details.lastRun = state.lastRun;
      details.lastRunAgo = ago;
      
      if (ago !== null && ago > this.staleThreshold) {
        issues.push('stale');
      }
      if (state.botOff) issues.push('bot_stopped');
      if (state.paused) issues.push('bot_paused');
      if (state.newsBlock) issues.push('news_block');
      
      details.state = state;
    } catch(e) {
      issues.push('state_unreadable');
      logger.error('Health check: state unreadable', e.message);
    }
    
    // Check database
    if (this.db) {
      try {
        const botState = await this.db.getBotState();
        details.database = botState ? 'connected' : 'empty';
      } catch(e) {
        issues.push('database_error');
        details.database = 'error';
        logger.error('Health check: database error', e.message);
      }
    }
    
    // Check system
    const mem = process.memoryUsage();
    const memMB = mem.rss / 1024 / 1024;
    details.memory = {
      rss: memMB.toFixed(1),
      heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(1),
      heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(1),
    };
    
    if (memMB > 500) {
      issues.push('high_memory');
    }
    
    details.uptime = Math.round(process.uptime() / 60);
    details.pid = process.pid;
    details.hostname = os.hostname();
    
    const healthy = issues.length === 0;
    
    return {
      healthy,
      issues,
      details,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { HealthCheck };
