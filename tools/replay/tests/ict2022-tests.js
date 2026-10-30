// Tests for the ICT 2022 model's setup scanner (V1_STRATEGY=ict2022).
// Usage: node tools/replay/tests/ict2022-tests.js   (from the project folder)
'use strict';
const path = require('path');
const be = require(path.resolve(__dirname, '../../../bot-engine.js'));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const M = 60000, U = (s) => Date.parse(s + 'Z');

// ── trading-day clock ────────────────────────────────────────────────────────
let d = be.ictDayParts(U('2024-01-16T07:00:00'));            // 02:00 New York (EST)
ok('London killzone start in winter', d.tdm === 540 && d.day === 20240116, d);
d = be.ictDayParts(U('2024-07-16T06:00:00'));                // 02:00 New York (EDT)
ok('London killzone start in summer', d.tdm === 540 && d.day === 20240716, d);
d = be.ictDayParts(U('2024-01-15T22:00:00'));                // 17:00 New York: a new trading day
ok('day starts at 17:00 New York', d.tdm === 0 && d.day === 20240116, d);
d = be.ictDayParts(U('2024-01-15T21:59:00'));
ok('one minute earlier is the previous day', d.tdm === 1439 && d.day === 20240115, d);

// ── a London killzone sell: raid of the Asian high, shift, fair value gap ───
// Flat 5-minute candles around 2000 from Sunday 16:00 New York; the previous
// trading day (Monday's) has a high of 2010 and a low of 1990, the Asian range
// (Mon 20:00-24:00 New York = Tue 01:00-05:00 UTC) 1998.5-2003.
function base(fromIso, toIso) {
    const out = [];
    for (let t = U(fromIso); t < U(toIso); t += 5 * M) out.push({ time: new Date(t).toISOString(), open: 2000, high: 2000.5, low: 1999.5, close: 2000 });
    return out;
}
const at = (c, iso) => c.findIndex(x => x.time === new Date(U(iso)).toISOString());
const set = (c, iso, o, h, l, cl) => { const i = at(c, iso); if (i < 0) throw new Error('no candle ' + iso); c[i] = Object.assign({}, c[i], { open: o, high: h, low: l, close: cl }); };
function london() {
    const c = base('2024-01-14T21:00:00', '2024-01-16T09:00:00');
    set(c, '2024-01-15T15:00:00', 2000, 2010, 1999.5, 2000);   // previous day high
    set(c, '2024-01-15T16:00:00', 2000, 2000.5, 1990, 2000);   // previous day low
    set(c, '2024-01-16T02:00:00', 2000, 2003, 1999.5, 2000);   // Asian high
    set(c, '2024-01-16T03:00:00', 2000, 2000.5, 1998.5, 2000); // Asian low
    // London killzone (07:00 UTC = 02:00 New York)
    set(c, '2024-01-16T07:00:00', 2000, 2000.6, 1999.9, 2000.4);
    set(c, '2024-01-16T07:05:00', 2000.4, 2000.8, 2000.1, 2000.6);
    set(c, '2024-01-16T07:10:00', 2000.6, 2000.7, 1999.6, 2000.0); // swing low 1999.6
    set(c, '2024-01-16T07:15:00', 2000.0, 2001.5, 1999.9, 2001.4);
    set(c, '2024-01-16T07:20:00', 2001.4, 2003.6, 2001.3, 2002.0); // raid of the Asian high: extreme 2003.6
    set(c, '2024-01-16T07:25:00', 2002.0, 2002.2, 2000.5, 2000.7);
    set(c, '2024-01-16T07:30:00', 2000.7, 2000.8, 1998.8, 1999.0); // closes below 1999.6; gap 2000.8-2001.3
    for (let i = at(c, '2024-01-16T07:35:00'); i < c.length; i++) c[i] = Object.assign({}, c[i], { open: 1999, high: 1999.4, low: 1998.6, close: 1999 });
    return c;
}
let c = london();
let r = be.ictScan(c, U('2024-01-16T07:36:00'), 5);
let s = r.setup;
ok('sell setup found', s && s.dir === 'sell', r);
ok('raided the Asian high', s && s.level === 'Asian high' && s.levelPrice === 2003, s);
ok('extreme, swing and gap', s && s.ext === 2003.6 && s.ref === 1999.6 && s.entry === 2000.8 && s.far === 2001.3, s);
ok('London killzone key', s && s.kz === 'London' && s.kzKey === '20240116-london', s);
ok('confirmed at the close of the 07:30 candle', s && s.confirmAt === U('2024-01-16T07:35:00'), s && new Date(s.confirmAt).toISOString());
ok('order life 12 candles', s && s.expiresAt === U('2024-01-16T08:35:00'), s && new Date(s.expiresAt).toISOString());
ok('nothing after the setup yet', s && !s.touched && !s.through && !s.stopped, s);

r = be.ictScan(c, U('2024-01-16T07:34:59'), 5);
ok('the forming 07:30 candle is ignored', !r.setup && /waiting for a close below 1999\.60/.test(r.why), r.why);
r = be.ictScan(c, U('2024-01-16T06:59:00'), 5);
ok('before the killzone: nothing', !r.setup && /waiting for the London killzone/.test(r.why), r.why);

// already spent before the killzone
c = london(); set(c, '2024-01-16T06:00:00', 2000, 2003.2, 1999.5, 2000);
r = be.ictScan(c, U('2024-01-16T07:36:00'), 5);
ok('a high taken before the killzone is spent', !r.setup && /sells: no raid yet/.test(r.why), r.why);

// no gap: the 07:30 candle overlaps the 07:20 candle's low
c = london(); set(c, '2024-01-16T07:30:00', 2000.7, 2001.4, 1998.8, 1999.0);
r = be.ictScan(c, U('2024-01-16T07:36:00'), 5);
ok('no fair value gap, no setup', !r.setup && /waiting for a fair value gap/.test(r.why), r.why);

// a new extreme before the shift restarts the count
c = london();
set(c, '2024-01-16T07:25:00', 2002.0, 2004.1, 2001.9, 2003.0);  // new extreme 2004.1
set(c, '2024-01-16T07:30:00', 2003.0, 2003.1, 2001.0, 2001.2);
set(c, '2024-01-16T07:35:00', 2001.2, 2001.3, 1998.9, 1999.1);   // closes below 1999.6, gap 2001.3 < 2001.9
r = be.ictScan(c, U('2024-01-16T07:41:00'), 5);
s = r.setup;
ok('new extreme: setup from 2004.1', s && s.ext === 2004.1 && s.entry === 2001.3 && s.far === 2001.9, s || r.why);

// the shift must come within 12 candles of the extreme
c = london();
for (let k = 0; k < 13; k++) { const t = new Date(U('2024-01-16T07:25:00') + k * 5 * M).toISOString().slice(0, 19); set(c, t, 2002, 2002.4, 2001.6, 2002); }
set(c, '2024-01-16T08:30:00', 2002, 2002.1, 1998.9, 1999.0);
r = be.ictScan(c, U('2024-01-16T08:36:00'), 5);
ok('no shift within 12 candles: no setup', !r.setup && /no shift within 12 candles/.test(r.why), r.why);

// what happened after the setup
c = london(); set(c, '2024-01-16T07:35:00', 1999, 2000.9, 1998.6, 1999.2);
r = be.ictScan(c, U('2024-01-16T07:41:00'), 5);
ok('a later candle touching the entry is seen', r.setup && r.setup.touched && !r.setup.through, r.setup);
c = london(); set(c, '2024-01-16T07:35:00', 1999, 2001.5, 1998.6, 2001.2);
r = be.ictScan(c, U('2024-01-16T07:41:00'), 5);
ok('a later candle through the gap is seen', r.setup && r.setup.through && !r.setup.stopped, r.setup);

// mirror image: a buy after a raid of the Asian low
const mirror = cc => cc.map(x => ({ time: x.time, open: 4000 - x.open, high: 4000 - x.low, low: 4000 - x.high, close: 4000 - x.close }));
c = mirror(london());
r = be.ictScan(c, U('2024-01-16T07:36:00'), 5);
s = r.setup;
ok('buy setup (mirror)', s && s.dir === 'buy' && s.level === 'Asian low' && s.levelPrice === 1997, s || r.why);
ok('buy levels mirror', s && s.ext === 1996.4 && s.ref === 2000.4 && s.entry === 1999.2 && s.far === 1998.7, s);

// the previous day only counts when it's complete
c = london().filter(x => Date.parse(x.time) >= U('2024-01-15T00:00:00'));
r = be.ictScan(c, U('2024-01-16T07:36:00'), 5);
ok('incomplete previous day: its levels are left out', r.setup && !(r.levels || []).some(L => /previous day/.test(L.name)), r.levels);
c = london();
r = be.ictScan(c, U('2024-01-16T07:36:00'), 5);
ok('complete previous day: high 2010, low 1990', (r.levels || []).some(L => L.name === 'previous day high' && L.price === 2010) && (r.levels || []).some(L => L.name === 'previous day low' && L.price === 1990), r.levels);

// New York killzone: the London killzone's high and low are also liquidity
function newYork() {
    const c = base('2024-01-14T21:00:00', '2024-01-16T14:00:00');
    set(c, '2024-01-15T15:00:00', 2000, 2010, 1999.5, 2000);
    set(c, '2024-01-15T16:00:00', 2000, 2000.5, 1990, 2000);
    set(c, '2024-01-16T02:00:00', 2000, 2003, 1999.5, 2000);       // Asian high 2003
    set(c, '2024-01-16T03:00:00', 2000, 2000.5, 1996, 2000);       // Asian low 1996
    set(c, '2024-01-16T08:00:00', 2000, 2000.5, 1998, 2000);       // London low 1998 (London high 2000.5)
    set(c, '2024-01-16T12:00:00', 2000, 2000.8, 1999.6, 2000.2);   // 07:00 New York; swing high 2000.8
    set(c, '2024-01-16T12:05:00', 2000.2, 2000.3, 1999.9, 2000.0);
    set(c, '2024-01-16T12:10:00', 2000.0, 2000.1, 1997.5, 1997.8); // raids the London low: extreme 1997.5
    set(c, '2024-01-16T12:15:00', 1997.8, 2000.6, 1997.6, 2000.5); // displacement
    set(c, '2024-01-16T12:20:00', 2000.5, 2001.2, 2000.3, 2001.0); // closes above 2000.8; gap 2000.1-2000.3
    for (let i = at(c, '2024-01-16T12:25:00'); i < c.length; i++) c[i] = Object.assign({}, c[i], { open: 2001, high: 2001.4, low: 2000.6, close: 2001 });
    return c;
}
c = newYork();
r = be.ictScan(c, U('2024-01-16T12:26:00'), 5);
s = r.setup;
ok('New York killzone buy from a London-low raid', s && s.dir === 'buy' && s.level === 'London low' && s.kz === 'New York', s || r.why);
ok('NY buy: extreme, swing, gap', s && s.ext === 1997.5 && s.ref === 2000.8 && s.entry === 2000.3 && s.far === 2000.1, s);
ok('London levels are listed for New York', (r.levels || []).some(L => L.name === 'London high') && (r.levels || []).some(L => L.name === 'London low' && L.price === 1998), r.levels);
r = be.ictScan(c, U('2024-01-16T08:00:00'), 5);
ok('London killzone has no London levels', !(r.levels || []).some(L => /^London/.test(L.name)), r.levels);

// settings
delete process.env.V1_STRATEGY; delete process.env.V1_ICT_TF;
ok('default strategy unchanged', be.v1Settings().strategy === 'ict' && be.v1Settings().ictTf === '5m');
process.env.V1_STRATEGY = 'ICT2022'; process.env.V1_ICT_TF = '15m';
ok('ict2022 and 15m read', be.v1Settings().strategy === 'ict2022' && be.v1Settings().ictTf === '15m' && be.ictTfMin(be.v1Settings()) === 15);
ok('status shows the ICT mode', /Strategy: ICT 2022 model on 15m/.test(be.getV1StatusText()));
process.env.V1_STRATEGY = 'trend';
ok('trend still read', be.v1Settings().strategy === 'trend');
delete process.env.V1_STRATEGY; delete process.env.V1_ICT_TF;

console.log('ict2022: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
