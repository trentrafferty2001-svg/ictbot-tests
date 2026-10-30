#!/usr/bin/env node
'use strict';

const https = require('https');
const url = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

function checkHealth() {
  return new Promise((resolve) => {
    const req = https.get(`${url}/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const ok = json.ok === true;
          console.log(`✅ Health check: ${ok ? 'PASS' : 'FAIL'}`);
          if (!ok) console.log(`   Issues: ${json.issues?.join(', ') || 'unknown'}`);
          process.exit(ok ? 0 : 1);
        } catch(e) {
          console.error('❌ Health check failed:', e.message);
          process.exit(1);
        }
      });
    });
    req.on('error', (err) => {
      console.error('❌ Health check error:', err.message);
      process.exit(1);
    });
    req.setTimeout(10000, () => {
      req.destroy();
      console.error('❌ Health check timeout');
      process.exit(1);
    });
    req.end();
  });
}

checkHealth();
