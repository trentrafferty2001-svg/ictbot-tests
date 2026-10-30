#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = process.env.RENDER_VOLUME_PATH || '/tmp';
const STATE_FILE = path.join(STATE_DIR, 'bot-state.json');
const BACKUP_DIR = path.join(STATE_DIR, 'backups');

function restoreBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.error('❌ No backup directory found');
    process.exit(1);
  }

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('state-'))
    .sort()
    .reverse();

  if (backups.length === 0) {
    console.error('❌ No backups found');
    process.exit(1);
  }

  console.log(`📋 Found ${backups.length} backups`);
  console.log(`Latest: ${backups[0]}`);

  const latest = path.join(BACKUP_DIR, backups[0]);
  const content = fs.readFileSync(latest, 'utf-8');

  // Validate JSON
  try {
    JSON.parse(content);
  } catch(e) {
    console.error('❌ Backup file is corrupt:', e.message);
    process.exit(1);
  }

  // Restore
  fs.writeFileSync(STATE_FILE, content);
  console.log(`✅ Restored from: ${backups[0]}`);
}

restoreBackup();
