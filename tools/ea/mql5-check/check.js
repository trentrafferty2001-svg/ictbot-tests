#!/usr/bin/env node
'use strict';
// Checks exported .mq5 files with a C++ compiler against mql5shim.h: catches
// typos, unknown names, wrong argument counts and type mistakes before the
// file reaches MetaEditor. Not a substitute for compiling in MetaEditor.
// Usage: node tools/ea/mql5-check/check.js ea-export/*.mq5   (needs g++)
// Added 2026-10-30.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: check.js FILE.mq5 ...'); process.exit(1); }
const shim = path.join(__dirname, 'mql5shim.h'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mq5check-'));
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8').split('\n').map(l => /^\s*#property\b/.test(l) || /^\s*#include\s*<Trade\\Trade\.mqh>/.test(l) ? '' : l.replace(/^input\s+/, '')).join('\n');
  const cpp = path.join(tmp, path.basename(f, '.mq5') + '.cpp');
  fs.writeFileSync(cpp, src);
  const r = cp.spawnSync('g++', ['-std=c++17', '-fsyntax-only', '-Wall', '-Wno-unused-parameter', '-Wno-unused-function', '-include', shim, cpp], { encoding: 'utf8' });
  const out = (r.stderr || '') + (r.stdout || '');
  if (r.status !== 0 || /warning:/.test(out)) { bad++; console.log('PROBLEM ' + f + '\n' + out.split(tmp + '/').join('')); }
  else console.log('ok ' + f);
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
