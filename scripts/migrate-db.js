#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = process.env.RENDER_VOLUME_PATH || '/tmp';
const STATE_FILE = path.join(STATE_DIR, 'bot-state.json');

function migrate() {
  console.log('🔄 Running database migration...');

  if (!fs.existsSync(STATE_FILE)) {
    console.log('⚠️ No state file found, nothing to migrate');
    return;
  }

  const content = fs.readFileSync(STATE_FILE, 'utf-8');
  let state;

  try {
    state = JSON.parse(content);
  } catch(e) {
    console.error('❌ Invalid JSON, cannot migrate');
    process.exit(1);
  }

  // Add missing fields
  let migrated = false;

  if (!state._version) {
    state._version = '1.0.0';
    migrated = true;
    console.log('📝 Added version field');
  }

  if (!state.metrics) {
    state.metrics = {
      tradesPlaced: 0,
      tradesFailed: 0,
      cyclesRun: 0,
      cycleErrors: 0,
      startTime: Date.now()
    };
    migrated = true;
    console.log('📝 Added metrics');
  }

  if (!state.lastBackup) {
    state.lastBackup = null;
    migrated = true;
    console.log('📝 Added lastBackup');
  }

  if (migrated) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log('✅ Migration complete');
  } else {
    console.log('✅ No migration needed');
  }
}

migrate();
