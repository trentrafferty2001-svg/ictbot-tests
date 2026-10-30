#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_DIR = process.env.RENDER_VOLUME_PATH || '/tmp';
const STATE_FILE = path.join(STATE_DIR, 'bot-state.json');
const BACKUP_DIR = path.join(STATE_DIR, 'backups');

function createBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  if (!fs.existsSync(STATE_FILE)) {
    console.error('❌ No state file found to backup');
    return;
  }

  const content = fs.readFileSync(STATE_FILE, 'utf-8');
  const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `state-${timestamp}-${hash}.json`);

  fs.copyFileSync(STATE_FILE, backupFile);
  console.log(`✅ Backup created: ${backupFile}`);

  // Keep only last 30 backups
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('state-'))
    .sort()
    .reverse();

  if (backups.length > 30) {
    for (let i = 30; i < backups.length; i++) {
      fs.unlinkSync(path.join(BACKUP_DIR, backups[i]));
      console.log(`🗑️ Removed old backup: ${backups[i]}`);
    }
  }
}

createBackup();
