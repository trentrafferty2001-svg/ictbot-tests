#!/usr/bin/env node
'use strict';
// EA converter: writes a strategy file as an MT5 Expert Advisor.
//   node tools/ea/export.js trend-4h          → ea-export/trend-4h.mq5
//   node tools/ea/export.js --all             → every strategy
//   node tools/ea/export.js trend-4h --out DIR
// Then in MetaTrader 5 (Windows, or a VPS): File → Open Data Folder →
// MQL5/Experts, copy the file in, open it in MetaEditor and press F7.
// Added 2026-10-30.
const fs = require('fs');
const path = require('path');
const EA = require(path.resolve(__dirname, '../../src/ea'));
const { toMq5 } = require(path.resolve(__dirname, '../../src/ea/mql5'));

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };
const out = path.resolve(arg('out', path.resolve(__dirname, '../../ea-export')));
const all = EA.loadAll(true);
for (const [f, e] of Object.entries(all.errors)) console.error('skipped ' + f + ': ' + e);
const ids = argv.includes('--all') ? Object.keys(all.strategies) : argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
if (!ids.length) { console.error('usage: node tools/ea/export.js <strategy id> | --all   (have: ' + Object.keys(all.strategies).join(', ') + ')'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
let bad = 0;
for (const id of ids) {
    const S = EA.get(id);
    if (!S) { console.error('no strategy "' + id + '"'); bad++; continue; }
    const file = path.join(out, S.id + '.mq5');
    fs.writeFileSync(file, toMq5(S));
    console.log('wrote ' + path.relative(process.cwd(), file));
}
process.exit(bad ? 1 : 0);
