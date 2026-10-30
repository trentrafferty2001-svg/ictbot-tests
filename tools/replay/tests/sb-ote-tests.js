// Tests for the Silver Bullet and OTE setup scanners (V1_STRATEGY=silverbullet / ote).
// Usage: node tools/replay/tests/sb-ote-tests.js   (from the project folder)
'use strict';
const path = require('path');
const be = require(path.resolve(__dirname, '../../../bot-engine.js'));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const M = 60000, H = 3600000, U = (s) => Date.parse(s + 'Z');
const near = (a, b) => Math.abs(a - b) < 1e-6;

// ════════════════════════ Silver Bullet ════════════════════════
// Flat 5-minute candles around 2000. January (New York = UTC-5): the trading
// day 20240116 runs 2024-01-15 22:00 UTC → 2024-01-16 22:00 UTC.
// Previous day (20240115): high 2010, low 1990. Asian range (01:00-05:00 UTC):
// 1998-2003. London killzone (07:00-10:00 UTC): high 2000.5 (below the gap), low 1997.
// 10:00 New York window = 15:00-16:00 UTC.
function base(fromIso, toIso) {
    const out = [];
    for (let t = U(fromIso); t < U(toIso); t += 5 * M) out.push({ time: new Date(t).toISOString(), open: 2000, high: 2000.5, low: 1999.5, close: 2000 });
    return out;
}
const at = (c, iso) => c.findIndex(x => x.time === new Date(U(iso)).toISOString());
const set = (c, iso, o, h, l, cl) => { const i = at(c, iso); if (i < 0) throw new Error('no candle ' + iso); c[i] = Object.assign({}, c[i], { open: o, high: h, low: l, close: cl }); };
const fill = (c, fromIso, o, h, l, cl) => { for (let i = at(c, fromIso); i >= 0 && i < c.length; i++) c[i] = Object.assign({}, c[i], { open: o, high: h, low: l, close: cl }); };
function day(opts) {
    opts = opts || {};
    const c = base('2024-01-14T21:00:00', '2024-01-16T21:00:00');
    set(c, '2024-01-15T15:00:00', 2000, 2010, 1999.5, 2000);     // previous day high
    set(c, '2024-01-15T16:00:00', 2000, 2000.5, 1990, 2000);     // previous day low
    set(c, '2024-01-16T02:00:00', 2000, opts.asiaHigh || 2003, 1999.5, 2000);   // Asian high
    set(c, '2024-01-16T03:00:00', 2000, 2000.5, 1998, 2000);     // Asian low
    set(c, '2024-01-16T09:00:00', 2000, 2000.5, 1997, 2000);     // London low
    // the gap: first candle 15:00 (high 2000.4, low 1999.8), third 15:10 (low 2000.8)
    const g = opts.gapAt || '2024-01-16T15:00:00', t0 = U(g), iso = ms => new Date(ms).toISOString().slice(0, 19);
    set(c, iso(t0), 2000, 2000.4, 1999.8, 2000.2);
    set(c, iso(t0 + 5 * M), 2000.2, 2001.5, 2000.1, 2001.4);
    set(c, iso(t0 + 10 * M), 2001.4, 2001.6, 2000.8, 2001.3);
    fill(c, iso(t0 + 15 * M), 2001.3, 2001.6, 2001.0, 2001.3);
    return c;
}
let c = day(), r = be.sbScan(c, U('2024-01-16T15:16:00'), 5), s = r.setup;
ok('SB: buy setup in the 10:00 window', s && s.dir === 'buy' && s.kz === '10:00 window' && s.kzKey === '20240116-sb10', r);
ok('SB: entry at the gap\'s near edge, stop basis the first candle\'s low', s && near(s.entry, 2000.8) && near(s.far, 2000.4) && near(s.ext, 1999.8), s);
ok('SB: target is the nearest untouched high (Asian high, 2.2R)', s && s.level === 'Asian high' && near(s.targetPrice, 2003) && near(s.room, 2.2), s);
ok('SB: confirmed when the third candle closes', s && s.confirmAt === U('2024-01-16T15:15:00'), s && new Date(s.confirmAt).toISOString());
ok('SB: order lives until the window ends (11:00 New York)', s && s.expiresAt === U('2024-01-16T16:00:00'), s && new Date(s.expiresAt).toISOString());
ok('SB: nothing after the setup yet', s && !s.touched && !s.through && !s.stopped && !s.targetHit, s);

r = be.sbScan(c, U('2024-01-16T15:14:59'), 5);
ok('SB: the forming third candle is ignored', !r.setup, r.why);
r = be.sbScan(c, U('2024-01-16T14:59:00'), 5);
ok('SB: before the window there is no setup', !r.setup && r.kzKey === '20240116-sb03', r);

// an Asian high already taken earlier in the day: the next one is the previous day high
c = day(); set(c, '2024-01-16T12:00:00', 2000, 2003.2, 1999.5, 2000);
s = be.sbScan(c, U('2024-01-16T15:16:00'), 5).setup;
ok('SB: a high traded through earlier is spent; next is the previous day high (9.2R)', s && s.level === 'previous day high' && near(s.targetPrice, 2010) && near(s.room, 9.2), s);

// nearest liquidity too close (1.7R): that gap is skipped, no setup
c = day({ asiaHigh: 2002.5 });
r = be.sbScan(c, U('2024-01-16T15:16:00'), 5);
ok('SB: nearest liquidity under 2R → no setup', !r.setup && /only 1\.7R away/.test(r.why), r.why);

// a gap completed before the window doesn't count
c = day({ gapAt: '2024-01-16T14:45:00' });
r = be.sbScan(c, U('2024-01-16T15:30:00'), 5);
ok('SB: a gap that closed before 10:00 doesn\'t count', !r.setup, r);
// third candle 15:55-16:00 closes at the window's end: counts
c = day({ gapAt: '2024-01-16T15:45:00' });
s = be.sbScan(c, U('2024-01-16T16:01:00'), 5).setup;
ok('SB: third candle closing at 11:00 counts', s && s.confirmAt === U('2024-01-16T16:00:00') && s.expiresAt === U('2024-01-16T16:00:00'), s);
// third candle 16:00-16:05: after the window
c = day({ gapAt: '2024-01-16T15:50:00' });
r = be.sbScan(c, U('2024-01-16T16:06:00'), 5);
ok('SB: third candle after 11:00 doesn\'t count', !r.setup, r);

// pullback to the entry after the setup → touched
c = day(); set(c, '2024-01-16T15:20:00', 2001.3, 2001.4, 2000.7, 2001.0);
s = be.sbScan(c, U('2024-01-16T15:26:00'), 5).setup;
ok('SB: a pullback to the entry is seen', s && s.touched && !s.stopped, s);

// the 03:00 window (08:00 UTC) doesn't use the London range; the 14:00 one (19:00 UTC) uses the New York morning
c = day({ gapAt: '2024-01-16T08:10:00' });
r = be.sbScan(c, U('2024-01-16T08:26:00'), 5);
ok('SB: 03:00 window levels are previous day + Asia only', r.levels && r.levels.every(L => /previous day|Asian/.test(L.name)), r.levels && r.levels.map(L => L.name));
c = day({ gapAt: '2024-01-16T19:00:00' });
r = be.sbScan(c, U('2024-01-16T19:16:00'), 5);
ok('SB: 14:00 window adds the New York morning range', r.levels && r.levels.some(L => L.name === 'New York morning high'), r.levels && r.levels.map(L => L.name));
ok('SB: 14:00 setup found', r.setup && r.setup.kzKey === '20240116-sb14', r.why);

// sell: mirror image around 2000
function mirror(cs) { return cs.map(x => Object.assign({}, x, { open: 4000 - x.open, high: 4000 - x.low, low: 4000 - x.high, close: 4000 - x.close })); }
c = mirror(day()); s = be.sbScan(c, U('2024-01-16T15:16:00'), 5).setup;
ok('SB: sell mirror', s && s.dir === 'sell' && near(s.entry, 1999.2) && near(s.ext, 2000.2) && s.level === 'Asian low' && near(s.targetPrice, 1997) && near(s.room, 2.2), s);

// ════════════════════════ OTE ════════════════════════
// Hourly candles: 50 flat ones around 2000, then a swing high at 2005, a
// swing low at 1995 (the move's start), a rally that closes above 2005 (the
// break) to 2015 (the move's end), and a candle that doesn't go higher.
function ote(extra) {
    const t0 = U('2024-03-04T00:00:00'), out = [];
    for (let i = 0; i < 50; i++) out.push([2000, 2000.5, 1999.5, 2000]);
    out.push([2000, 2003, 2000, 2002.5], [2002.5, 2005, 2002, 2003], [2003, 2003.5, 2000, 2000.5], [2000.5, 2001, 1997, 1997.5],
        [1997.5, 1998, 1995, 1996], [1996, 1999, 1996, 1998.5], [1998.5, 2003, 1998, 2002.5], [2002.5, 2007, 2002, 2006.5],
        [2006.5, 2012, 2006, 2011.5], [2011.5, 2015, 2011, 2014], [2014, 2014, 2010, 2010.5]);
    for (const x of (extra || [])) out.push(x);
    return out.map((x, i) => ({ time: new Date(t0 + i * H).toISOString(), open: x[0], high: x[1], low: x[2], close: x[3] }));
}
const T = i => U('2024-03-04T00:00:00') + i * H;
c = ote([[2010.5, 2011, 2009, 2010], [2010, 2011, 2009, 2010]]);
r = be.oteScan(c, T(63) + M); s = r.setup;
ok('OTE: buy setup', s && s.dir === 'buy', r);
ok('OTE: move 1995 → 2015, broke the swing high 2005', s && near(s.moveStart, 1995) && near(s.moveEnd, 2015) && near(s.ref, 2005), s);
ok('OTE: entry 70.5%, far 79%, stop at the start', s && near(s.entry, 2015 - 0.705 * 20) && near(s.far, 2015 - 0.79 * 20) && near(s.ext, 1995), s);
ok('OTE: one lot at the old high, the rest at the -27% extension', s && near(s.tp1Price, 2015) && near(s.finalPrice, 2020.4), s);
ok('OTE: confirmed when the 60th candle closes; 12 hours to fill', s && s.confirmAt === T(61) && s.expiresAt === T(73), s && [new Date(s.confirmAt).toISOString(), new Date(s.expiresAt).toISOString()]);
ok('OTE: nothing after the setup yet', s && !s.touched && !s.through && !s.stopped && !s.beyond, s);

r = be.oteScan(c, T(60) + M);   // candle 60 still forming
ok('OTE: no setup until a candle fails to go higher', !r.setup, r);
c = ote([[2010.5, 2016, 2010, 2015.5], [2015.5, 2016, 2014, 2015]]);
r = be.oteScan(c, T(63) + M);
ok('OTE: a new high after the turn cancels that move', !r.setup || near(r.setup.moveEnd, 2016), r);
c = ote([[2010.5, 2011, 2000.5, 2001], [2001, 2002, 2000, 2001.5]]);
s = be.oteScan(c, T(63) + M).setup;
ok('OTE: a pullback to the entry is seen', s && s.touched && !s.through, s);

// too small: the same shape scaled down to a $2 move isn't 2x the ATR
c = ote([[2010.5, 2011, 2009, 2010]]).map((x, i) => i < 50 ? Object.assign({}, x, { high: 2002, low: 1998 }) : Object.assign({}, x, { open: 2000 + (x.open - 2000) / 10, high: 2000 + (x.high - 2000) / 10, low: 2000 + (x.low - 2000) / 10, close: 2000 + (x.close - 2000) / 10 }));
r = be.oteScan(c, T(62) + M);
ok('OTE: a move under 2x the 1-hour ATR is not a setup', !r.setup, r);

// sell: mirror
c = mirror(ote([[2010.5, 2011, 2009, 2010], [2010, 2011, 2009, 2010]]));
s = be.oteScan(c, T(63) + M).setup;
ok('OTE: sell mirror', s && s.dir === 'sell' && near(s.moveStart, 2005) && near(s.moveEnd, 1985) && near(s.entry, 1985 + 0.705 * 20) && near(s.finalPrice, 1979.6), s);

// a dip inside the move doesn't replace the whole move
c = ote([[2010.5, 2011, 2009, 2010]]);
c.splice(58, 0, { time: '', open: 2006.5, high: 2008, low: 2004, close: 2005 });   // a dip after the break
c.forEach((x, i) => { x.time = new Date(U('2024-03-04T00:00:00') + i * H).toISOString(); });
s = be.oteScan(c, T(63) + M).setup;
ok('OTE: anchored at the move\'s real start, not a dip inside it', s && near(s.moveStart, 1995), s);

console.log('sb-ote: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
