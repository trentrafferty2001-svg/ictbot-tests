// ════════════════════════════════════════════════════════════════════════════
//  File-based Lock for Cron Jobs
//  Prevents concurrent execution across multiple instances
// ════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const fsSync = require('fs');
const path = require('path');
const { logger } = require('../logger');

const STATE_DIR = process.env.RENDER_VOLUME_PATH || '/tmp';
const DEFAULT_LOCK_FILE = path.join(STATE_DIR, '.cron-lock');

class CronLock {
  constructor(lockFile = DEFAULT_LOCK_FILE, ttlMs = 60000) {
    this.lockFile = lockFile;
    this.ttlMs = ttlMs;
    this._held = false;
  }
  
  acquire() {
    if (this._held) {
      return true;
    }
    
    try {
      if (fsSync.existsSync(this.lockFile)) {
        const stat = fsSync.statSync(this.lockFile);
        const age = Date.now() - stat.mtimeMs;
        
        if (age < this.ttlMs) {
          logger.debug(`[cron-lock] Lock held by another process (${age}ms old)`);
          return false;
        }
        
        logger.warn(`[cron-lock] Removing stale lock (${age}ms old)`);
        fsSync.unlinkSync(this.lockFile);
      }
      
      fsSync.writeFileSync(this.lockFile, JSON.stringify({
        pid: process.pid,
        acquired: Date.now(),
        hostname: process.env.RENDER_INSTANCE_ID || 'unknown',
      }));
      
      this._held = true;
      logger.debug('[cron-lock] Lock acquired');
      return true;
      
    } catch (e) {
      logger.error('[cron-lock] Failed to acquire lock:', e.message);
      return false;
    }
  }
  
  release() {
    if (!this._held) return true;
    
    try {
      if (fsSync.existsSync(this.lockFile)) {
        const data = JSON.parse(fsSync.readFileSync(this.lockFile, 'utf-8'));
        if (data.pid === process.pid) {
          fsSync.unlinkSync(this.lockFile);
          this._held = false;
          logger.debug('[cron-lock] Lock released');
          return true;
        }
      }
      this._held = false;
      return true;
    } catch (e) {
      logger.error('[cron-lock] Failed to release lock:', e.message);
      return false;
    }
  }
  
  async runWithLock(fn) {
    if (!this.acquire()) {
      logger.info('[cron-lock] Skipping - lock not acquired');
      return null;
    }
    
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
  
  isLocked() {
    if (this._held) return true;
    
    try {
      if (!fsSync.existsSync(this.lockFile)) return false;
      const stat = fsSync.statSync(this.lockFile);
      return Date.now() - stat.mtimeMs < this.ttlMs;
    } catch (e) {
      return false;
    }
  }
  
  getLockInfo() {
    try {
      if (!fsSync.existsSync(this.lockFile)) return null;
      const data = JSON.parse(fsSync.readFileSync(this.lockFile, 'utf-8'));
      const stat = fsSync.statSync(this.lockFile);
      return {
        ...data,
        age: Date.now() - stat.mtimeMs,
        stale: Date.now() - stat.mtimeMs > this.ttlMs,
      };
    } catch (e) {
      return null;
    }
  }
}

module.exports = {
  CronLock,
  DEFAULT_LOCK_FILE,
};
