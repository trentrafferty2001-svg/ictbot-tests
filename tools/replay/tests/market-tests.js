// Tests for the other markets (XM's US100Cash#, GER40Cash#, BTCUSD#).
// Usage: node tools/replay/tests/market-tests.js   (from the project folder)
'use strict';
const path = require('path');
const be = require(path.resolve(__dirname, '../../../bot-engine.js'));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); } };
const U = (s) => Date.parse(s + 'Z');
const use = sym => { global._botState = { botConfig: { symbol: sym } }; };

// XM's names, as they appear in MT5 on this account
ok('US100Cash# is the Nasdaq', be.getSymConfig('US100Cash#').type === 'nas');
ok('GER40Cash# is the DAX', be.getSymConfig('GER40Cash#').type === 'ger');
ok('BTCUSD# is bitcoin', be.getSymConfig('BTCUSD#').type === 'btc');
ok('GOLD# is still gold', be.getSymConfig('GOLD#').type === 'gold');
ok('old names still work', be.getSymConfig('NAS100').type === 'nas' && be.getSymConfig('BTCUSD').type === 'btc' && be.getSymConfig('GER30').type === 'ger');
ok('the Nasdaq minimum stop is 5 points, not 20', be.getSymConfig('US100Cash#').minSL === 5);

// hours: gold, Nasdaq and bitcoin 01:10-23:50 server; the DAX 02:15-23:00.
// 2024-01-16 (Tuesday, winter): server = UTC+2.
use('GOLD#');
ok('gold: 01:30 server is open', be.v1MarketState(U('2024-01-15T23:30:00')).open);
ok('gold: 22:50 server allows entries', be.v1EntryTimeBlock(U('2024-01-16T20:50:00')) === null);
use('GER40Cash#');
ok('DAX: 01:30 server is closed', !be.v1MarketState(U('2024-01-15T23:30:00')).open);
ok('DAX: 02:20 server is open but too close to the open', be.v1MarketState(U('2024-01-16T00:20:00')).open && /15 min/.test(be.v1EntryTimeBlock(U('2024-01-16T00:20:00')) || ''));
ok('DAX: 10:00 server allows entries', be.v1EntryTimeBlock(U('2024-01-16T08:00:00')) === null);
ok('DAX: 22:50 server is flatten time', be.v1FlattenDue(U('2024-01-16T20:50:00')));
ok('DAX: 23:10 server is closed', !be.v1MarketState(U('2024-01-16T21:10:00')).open);
use('US100Cash#');
ok('Nasdaq: gold\'s hours', be.v1MarketState(U('2024-01-15T23:30:00')).open && !be.v1FlattenDue(U('2024-01-16T20:50:00')));
use('BTCUSD#');
ok('bitcoin: closed on Saturday (the bot keeps a weekday schedule)', !be.v1MarketState(U('2024-01-20T12:00:00')).open);

// the cost check's slippage allowance is in price units, so it follows the market
use('GOLD#'); const g = be.v1Settings().slippage;
use('US100Cash#'); const n = be.v1Settings().slippage;
use('BTCUSD#'); const b = be.v1Settings().slippage;
ok('slippage allowance: gold $0.10, Nasdaq 0.5 points, bitcoin $10', g === 0.10 && n === 0.5 && b === 10, [g, n, b]);

console.log('markets: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
