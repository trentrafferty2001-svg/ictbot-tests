'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  EA engine (added 2026-10-30)
//
//  Trades placed from formulas, the way an MT5 Expert Advisor works. Each
//  strategy is one JSON file in src/ea/strategies/ that names its indicators
//  and writes its rules as formulas (src/ea/expr.js):
//
//    {
//      "id": "trend-4h", "name": "...", "timeframe": "4h",
//      "indicators": { "sma200": "SMA(close, 200)", "atr20": "ATR(20)" },
//      "buy":  { "when": "close > sma200 and ...", "stop": "entry - 2 * atr20",
//                "target": null, "trail": "...", "exit": null },
//      "sell": { ... },
//      "options": { "maxOpen": 1, "holdOvernight": true }
//    }
//
//  The same file drives the live bot (V1_STRATEGY=ea, V1_EA=<id>), the
//  10-year replay test, and the .mq5 Expert Advisor export (src/ea/mql5.js).
//
//  Rules are checked once per finished candle of the strategy's timeframe.
//  Names in a rule:
//    • prices: open, high, low, close, volume (tick volume), median, typical,
//      weighted — with [n] for n candles back ([1] = last finished, the default)
//    • the strategy's own indicators, also with [n]
//    • hour, minute, dayofweek: the broker's server clock (XM/MT5: New York
//      time + 7 hours) when the new candle opens; nyhour: New York's hour
//    • spread: the current spread in price units
//    • entry (the fill price) and risk (|entry − stop|) in stop, target,
//      trail and exit formulas (risk not in stop)
//  Functions: cross_above(a, b), cross_below(a, b), abs, min, max.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const ind = require('./indicators');
const X = require('./expr');

const TF = {
    '5m': { ms: 5 * 60000, mql: 'PERIOD_M5' }, '15m': { ms: 15 * 60000, mql: 'PERIOD_M15' }, '30m': { ms: 30 * 60000, mql: 'PERIOD_M30' },
    '1h': { ms: 3600000, mql: 'PERIOD_H1' }, '4h': { ms: 4 * 3600000, mql: 'PERIOD_H4' }, '1d': { ms: 86400000, mql: 'PERIOD_D1' },
};
const PRICES = ['open', 'high', 'low', 'close', 'volume', 'median', 'typical', 'weighted'];
const APPLIED = { open: 'PRICE_OPEN', high: 'PRICE_HIGH', low: 'PRICE_LOW', close: 'PRICE_CLOSE', median: 'PRICE_MEDIAN', typical: 'PRICE_TYPICAL', weighted: 'PRICE_WEIGHTED' };
const SCALARS_WHEN = { hour: 'server hour 0-23', minute: 'server minute', dayofweek: 'server day, 0 = Sunday', nyhour: 'New York hour 0-23', spread: 'current spread' };
const SCALARS_STOP = Object.assign({ entry: 'fill price' }, SCALARS_WHEN);
const SCALARS_TRADE = Object.assign({ entry: 'fill price', risk: '|entry - initial stop|' }, SCALARS_WHEN);
const RESERVED = new Set(PRICES.concat(Object.keys(SCALARS_TRADE), Object.keys(X.FUNCS), ['and', 'or', 'not', 'true', 'false']));

// ── indicators a strategy can use ───────────────────────────────────────────
// args: 'src' = an applied price, 'int' = a whole number ≥ 1, 'num' = a number.
// warm(a): candles needed before the value is usable (and, for recursive
// averages, has settled to MT5's value: see indicators.js).
// mql: how the exported EA reads it — an MT5 indicator handle + buffer, or
// iHighest/iLowest.
const ma = (fn, mode, warmMult) => ({ args: ['src', 'int'], warm: a => warmMult * a[1] + 1, calc: (b, a) => fn(ind.price(b, a[0]), a[1]),
    mql: a => ({ handle: 'iMA(_Symbol, TF, ' + a[1] + ', 0, ' + mode + ', ' + APPLIED[a[0]] + ')', buffer: 0 }) });
const CTORS = {
    SMA: ma(ind.sma, 'MODE_SMA', 1), EMA: ma(ind.ema, 'MODE_EMA', 4), SMMA: ma(ind.smma, 'MODE_SMMA', 8), LWMA: ma(ind.lwma, 'MODE_LWMA', 1),
    RSI: { args: ['src', 'int'], warm: a => 8 * a[1] + 1, calc: (b, a) => ind.rsi(ind.price(b, a[0]), a[1]), mql: a => ({ handle: 'iRSI(_Symbol, TF, ' + a[1] + ', ' + APPLIED[a[0]] + ')', buffer: 0 }) },
    ATR: { args: ['int'], warm: a => a[0] + 2, calc: (b, a) => ind.atr(b.high, b.low, b.close, a[0]), mql: a => ({ handle: 'iATR(_Symbol, TF, ' + a[0] + ')', buffer: 0 }) },
    MACD: { args: ['src', 'int', 'int', 'int'], warm: a => 4 * a[2] + a[3] + 1, calc: (b, a) => ind.macd(ind.price(b, a[0]), a[1], a[2], a[3]).main, mql: a => ({ handle: 'iMACD(_Symbol, TF, ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' + APPLIED[a[0]] + ')', buffer: 0 }) },
    MACD_SIGNAL: { args: ['src', 'int', 'int', 'int'], warm: a => 4 * a[2] + a[3] + 1, calc: (b, a) => ind.macd(ind.price(b, a[0]), a[1], a[2], a[3]).signal, mql: a => ({ handle: 'iMACD(_Symbol, TF, ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' + APPLIED[a[0]] + ')', buffer: 1 }) },
    BB_MID: { args: ['src', 'int', 'num'], warm: a => a[1] + 1, calc: (b, a) => ind.bands(ind.price(b, a[0]), a[1], a[2]).mid, mql: a => ({ handle: 'iBands(_Symbol, TF, ' + a[1] + ', 0, ' + a[2] + ', ' + APPLIED[a[0]] + ')', buffer: 0 }) },
    BB_UPPER: { args: ['src', 'int', 'num'], warm: a => a[1] + 1, calc: (b, a) => ind.bands(ind.price(b, a[0]), a[1], a[2]).upper, mql: a => ({ handle: 'iBands(_Symbol, TF, ' + a[1] + ', 0, ' + a[2] + ', ' + APPLIED[a[0]] + ')', buffer: 1 }) },
    BB_LOWER: { args: ['src', 'int', 'num'], warm: a => a[1] + 1, calc: (b, a) => ind.bands(ind.price(b, a[0]), a[1], a[2]).lower, mql: a => ({ handle: 'iBands(_Symbol, TF, ' + a[1] + ', 0, ' + a[2] + ', ' + APPLIED[a[0]] + ')', buffer: 2 }) },
    STOCH_K: { args: ['int', 'int', 'int'], warm: a => a[0] + a[1] + a[2] + 1, calc: (b, a) => ind.stochastic(b.high, b.low, b.close, a[0], a[1], a[2]).main, mql: a => ({ handle: 'iStochastic(_Symbol, TF, ' + a[0] + ', ' + a[1] + ', ' + a[2] + ', MODE_SMA, STO_LOWHIGH)', buffer: 0 }) },
    STOCH_D: { args: ['int', 'int', 'int'], warm: a => a[0] + a[1] + a[2] + 1, calc: (b, a) => ind.stochastic(b.high, b.low, b.close, a[0], a[1], a[2]).signal, mql: a => ({ handle: 'iStochastic(_Symbol, TF, ' + a[0] + ', ' + a[1] + ', ' + a[2] + ', MODE_SMA, STO_LOWHIGH)', buffer: 1 }) },
    ADX: { args: ['int'], warm: a => 8 * a[0] + 1, calc: (b, a) => ind.adx(b.high, b.low, b.close, a[0]).adx, mql: a => ({ handle: 'iADX(_Symbol, TF, ' + a[0] + ')', buffer: 0 }) },
    PLUS_DI: { args: ['int'], warm: a => 4 * a[0] + 1, calc: (b, a) => ind.adx(b.high, b.low, b.close, a[0]).plusDi, mql: a => ({ handle: 'iADX(_Symbol, TF, ' + a[0] + ')', buffer: 1 }) },
    MINUS_DI: { args: ['int'], warm: a => 4 * a[0] + 1, calc: (b, a) => ind.adx(b.high, b.low, b.close, a[0]).minusDi, mql: a => ({ handle: 'iADX(_Symbol, TF, ' + a[0] + ')', buffer: 2 }) },
    CCI: { args: ['src', 'int'], warm: a => a[1] + 1, calc: (b, a) => ind.cci(ind.price(b, a[0]), a[1]), mql: a => ({ handle: 'iCCI(_Symbol, TF, ' + a[1] + ', ' + APPLIED[a[0]] + ')', buffer: 0 }) },
    MOMENTUM: { args: ['src', 'int'], warm: a => a[1] + 2, calc: (b, a) => ind.momentum(ind.price(b, a[0]), a[1]), mql: a => ({ handle: 'iMomentum(_Symbol, TF, ' + a[1] + ', ' + APPLIED[a[0]] + ')', buffer: 0 }) },
    STDDEV: { args: ['src', 'int'], warm: a => a[1] + 1, calc: (b, a) => ind.stddev(ind.price(b, a[0]), a[1]), mql: a => ({ handle: 'iStdDev(_Symbol, TF, ' + a[1] + ', 0, MODE_SMA, ' + APPLIED[a[0]] + ')', buffer: 0 }) },
    HIGHEST: { args: ['ohlc', 'int'], warm: a => a[1], calc: (b, a) => ind.highest(b[a[0]], a[1]), mql: a => ({ highest: true, series: 'MODE_' + a[0].toUpperCase(), get: 'i' + a[0][0].toUpperCase() + a[0].slice(1), count: a[1] }) },
    LOWEST: { args: ['ohlc', 'int'], warm: a => a[1], calc: (b, a) => ind.lowest(b[a[0]], a[1]), mql: a => ({ lowest: true, series: 'MODE_' + a[0].toUpperCase(), get: 'i' + a[0][0].toUpperCase() + a[0].slice(1), count: a[1] }) },
};

function parseIndicator(name, text) {
    let ast;
    try { ast = X.parse(text); } catch (e) { throw new X.ExprError('indicator "' + name + '": ' + e.message); }
    if (ast.k !== 'call' || !CTORS[ast.fn]) throw new X.ExprError('indicator "' + name + '" must be one of ' + Object.keys(CTORS).join(', ') + ', e.g. "EMA(close, 50)"; got: ' + text);
    const C = CTORS[ast.fn];
    if (ast.args.length !== C.args.length) throw new X.ExprError('indicator "' + name + '": ' + ast.fn + ' takes ' + C.args.length + ' values (' + C.args.join(', ') + '); got: ' + text);
    const args = ast.args.map((a, i) => {
        const want = C.args[i];
        if (want === 'src' || want === 'ohlc') {
            const ok = want === 'src' ? Object.keys(APPLIED) : ['open', 'high', 'low', 'close'];
            if (a.k !== 'name' || a.shift || ok.indexOf(a.name) === -1) throw new X.ExprError('indicator "' + name + '": value ' + (i + 1) + ' must be a price (' + ok.join(', ') + '); got: ' + text);
            return a.name;
        }
        if (a.k !== 'num') throw new X.ExprError('indicator "' + name + '": value ' + (i + 1) + ' must be a number; got: ' + text);
        if (want === 'int' && (!Number.isInteger(a.v) || a.v < 1 || a.v > 2000)) throw new X.ExprError('indicator "' + name + '": value ' + (i + 1) + ' must be a whole number from 1 to 2000; got: ' + text);
        if (want === 'num' && !(a.v > 0 && a.v < 100)) throw new X.ExprError('indicator "' + name + '": value ' + (i + 1) + ' must be a positive number; got: ' + text);
        return a.v;
    });
    if ((ast.fn === 'MACD' || ast.fn === 'MACD_SIGNAL') && !(args[1] < args[2])) throw new X.ExprError('indicator "' + name + '": the fast period must be shorter than the slow one');
    return { name, fn: ast.fn, args, text: ast.fn + '(' + args.join(', ') + ')', warm: C.warm(args), calc: b => C.calc(b, args), mql: C.mql(args) };
}

// ── compile a strategy file ─────────────────────────────────────────────────
function compile(spec) {
    if (!spec || typeof spec !== 'object') throw new X.ExprError('a strategy must be an object');
    const id = String(spec.id || '');
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) throw new X.ExprError('strategy id must be 2-40 lowercase letters, digits or dashes; got "' + id + '"');
    const tf = String(spec.timeframe || '').toLowerCase();
    if (!TF[tf]) throw new X.ExprError(id + ': timeframe must be one of ' + Object.keys(TF).join(', '));
    const indicators = [], seriesNames = new Set(PRICES);
    for (const name of Object.keys(spec.indicators || {})) {
        if (!/^[a-z_][a-z0-9_]{0,30}$/.test(name)) throw new X.ExprError(id + ': indicator name "' + name + '" must be lowercase letters, digits or _');
        if (RESERVED.has(name)) throw new X.ExprError(id + ': "' + name + '" is a built-in name; call the indicator something else');
        indicators.push(parseIndicator(name, String(spec.indicators[name])));
        seriesNames.add(name);
    }
    const env = (scalars) => ({ series: seriesNames, scalars });
    let maxShift = 1;
    const rule = (side, field, want, scalars, required) => {
        const src = spec[side] && spec[side][field];
        if (src === undefined || src === null || src === '') { if (required) throw new X.ExprError(id + ': ' + side + '.' + field + ' is required'); return null; }
        let ast, info;
        try { ast = X.parse(String(src)); info = X.check(ast, env(scalars), String(src)); }
        catch (e) { throw new X.ExprError(id + ' ' + side + '.' + field + ': ' + e.message); }
        if (info.type !== want) throw new X.ExprError(id + ' ' + side + '.' + field + ' must be ' + (want === 'bool' ? 'a condition (true/false)' : 'a price') + ': ' + src);
        if (info.maxShift > maxShift) maxShift = info.maxShift;
        return { src: String(src), text: X.toText(ast), ast, run: X.toJs(ast), used: info.used, scalars: info.scalars };
    };
    const sides = {};
    for (const side of ['buy', 'sell']) {
        if (!spec[side]) continue;
        sides[side] = {
            when: rule(side, 'when', 'bool', SCALARS_WHEN, true),
            stop: rule(side, 'stop', 'num', SCALARS_STOP, true),
            target: rule(side, 'target', 'num', SCALARS_TRADE, false),
            trail: rule(side, 'trail', 'num', SCALARS_TRADE, false),
            exit: rule(side, 'exit', 'bool', SCALARS_TRADE, false),
        };
    }
    if (!sides.buy && !sides.sell) throw new X.ExprError(id + ': needs a "buy" or a "sell" rule set');
    const o = spec.options || {};
    const num = (v, d, lo, hi, what) => { if (v === undefined || v === null) return d; const x = Number(v); if (!(x >= lo && x <= hi)) throw new X.ExprError(id + ': options.' + what + ' must be ' + lo + '-' + hi); return x; };
    const options = {
        maxOpen: num(o.maxOpen, 1, 1, 3, 'maxOpen'),
        holdOvernight: !!o.holdOvernight,          // false: closed before XM's daily break like v1's trades
        maxBars: num(o.maxBars, 0, 0, 10000, 'maxBars'),   // 0 = no time limit; else close after this many candles
        breakevenR: num(o.breakevenR, 0, 0, 20, 'breakevenR'), // 0 = off; else stop to entry once price is this many R in profit
    };
    // Candles needed: the slowest indicator's run-in plus the furthest look-back.
    const warm = indicators.reduce((m, x) => Math.max(m, x.warm), 2);
    const needBars = warm + maxShift + 2;
    const S = {
        id, name: String(spec.name || id), source: spec.source || null, notes: spec.notes || null, timeframe: tf, tfMs: TF[tf].ms, mqlTf: TF[tf].mql,
        indicators, sides, options, maxShift, needBars, fetchBars: Math.min(1000, needBars + 20), spec,
    };
    S.prepare = (bars) => prepare(S, bars);
    S.completed = (bars, now) => completedBars(S, bars, now);
    S.signal = (ctx, k, x) => signal(S, ctx, k, x);
    S.levels = (ctx, k, dir, entry, x) => levels(S, ctx, k, dir, entry, x);
    S.trail = (ctx, k, dir, entry, risk, x) => tradeRule(S, ctx, k, dir, 'trail', entry, risk, x);
    S.exit = (ctx, k, dir, entry, risk, x) => tradeRule(S, ctx, k, dir, 'exit', entry, risk, x);
    S.describe = () => describe(S);
    return S;
}

// ── candles → series ────────────────────────────────────────────────────────
const tms = t => typeof t === 'number' ? t : Date.parse(t);
// Only finished candles: a candle is finished once its whole period has passed.
function completedBars(S, bars, now) {
    const out = [];
    let last = -Infinity;
    for (const b of bars || []) {
        if (!b) continue;
        const t = tms(b.time);
        if (!(t === t) || t + S.tfMs > now) continue;
        if (t <= last) continue; // never trust order or duplicates (the reversed-candles bug, Oct 2026)
        last = t;
        out.push(b);
    }
    return out;
}
function prepare(S, bars) {
    const n = bars.length, f = k => new Float64Array(n);
    const B = { time: f(), open: f(), high: f(), low: f(), close: f(), volume: f() };
    for (let i = 0; i < n; i++) {
        const b = bars[i];
        B.time[i] = tms(b.time); B.open[i] = +b.open; B.high[i] = +b.high; B.low[i] = +b.low; B.close[i] = +b.close;
        B.volume[i] = +(b.tickVolume !== undefined ? b.tickVolume : b.volume) || 0;
    }
    const s = { open: B.open, high: B.high, low: B.low, close: B.close, volume: B.volume,
        median: ind.price(B, 'median'), typical: ind.price(B, 'typical'), weighted: ind.price(B, 'weighted') };
    for (const x of S.indicators) s[x.name] = x.calc(B);
    return { n, time: B.time, s, v: {}, bad: false, S };
}

// The broker's server clock (XM, like most MT5 brokers: New York time + 7h,
// i.e. GMT+3 while New York is on daylight saving, else GMT+2).
function usDst(ms) {
    const y = new Date(ms).getUTCFullYear(), nth = (m, n) => { const f = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - f) % 7) + (n - 1) * 7; };
    return ms >= Date.UTC(y, 2, nth(2, 2), 7) && ms < Date.UTC(y, 10, nth(10, 1), 6);
}
function clockVars(ms) {
    const dst = usDst(ms), srv = new Date(ms + (dst ? 3 : 2) * 3600000), ny = new Date(ms - (dst ? 4 : 5) * 3600000);
    return { hour: srv.getUTCHours(), minute: srv.getUTCMinutes(), dayofweek: srv.getUTCDay(), nyhour: ny.getUTCHours() };
}
function setVars(ctx, k, x, trade) {
    const t = k >= 0 && k < ctx.n ? ctx.time[k] + ctx.S.tfMs : NaN; // the new candle's open
    const c = t === t ? clockVars(t) : { hour: NaN, minute: NaN, dayofweek: NaN, nyhour: NaN };
    ctx.v = { hour: c.hour, minute: c.minute, dayofweek: c.dayofweek, nyhour: c.nyhour, spread: x && x.spread >= 0 ? +x.spread : 0 };
    if (trade) { ctx.v.entry = trade.entry; if (trade.risk !== undefined) ctx.v.risk = trade.risk; }
}

// ── decisions (k = index of the last finished candle) ───────────────────────
function signal(S, ctx, k, x) {
    if (k < S.needBars - 1) return { dir: null, why: 'only ' + (k + 1) + ' finished candles (needs ' + S.needBars + ')' };
    setVars(ctx, k, x);
    const res = {};
    for (const side of ['buy', 'sell']) if (S.sides[side]) res[side] = S.sides[side].when.run(ctx, k);
    if (res.buy === null || res.sell === null) return { dir: null, why: 'an indicator has no value yet' };
    if (res.buy && res.sell) return { dir: null, why: 'buy and sell rules both true — no trade' };
    const dir = res.buy ? 'buy' : res.sell ? 'sell' : null;
    return { dir, barTime: new Date(ctx.time[k]).toISOString(), why: dir ? S.sides[dir].when.text : 'no rule true', values: values(S, ctx, k) };
}
function levels(S, ctx, k, dir, entry, x) {
    const R = S.sides[dir];
    if (!R) return { ok: false, why: 'no ' + dir + ' rules' };
    setVars(ctx, k, x, { entry });
    const stop = R.stop.run(ctx, k);
    if (stop === null || !(stop === stop)) return { ok: false, why: 'stop formula has no value' };
    if (dir === 'buy' ? !(stop < entry) : !(stop > entry)) return { ok: false, why: 'stop ' + stop.toFixed(2) + ' is on the wrong side of entry ' + entry.toFixed(2) };
    const risk = Math.abs(entry - stop);
    let target = null;
    if (R.target) {
        setVars(ctx, k, x, { entry, risk });
        target = R.target.run(ctx, k);
        if (target === null || !(target === target)) return { ok: false, why: 'target formula has no value' };
        if (dir === 'buy' ? !(target > entry) : !(target < entry)) return { ok: false, why: 'target ' + target.toFixed(2) + ' is on the wrong side of entry ' + entry.toFixed(2) };
    }
    return { ok: true, stop, target, risk };
}
function tradeRule(S, ctx, k, dir, field, entry, risk, x) {
    const R = S.sides[dir] && S.sides[dir][field];
    if (!R || k < 0) return null;
    setVars(ctx, k, x, { entry, risk });
    const v = R.run(ctx, k);
    return v === null || (typeof v === 'number' && !(v === v)) ? null : v;
}
// Indicator values on the last finished candle, for messages.
function values(S, ctx, k) {
    const out = {};
    for (const x of S.indicators) { const v = ctx.s[x.name][k]; out[x.name] = v === v ? Math.round(v * 100) / 100 : null; }
    out.close = ctx.s.close[k];
    return out;
}
function describe(S) {
    const lines = [S.name + ' (' + S.id + ', ' + S.timeframe + ' candles)'];
    if (S.indicators.length) lines.push('Indicators: ' + S.indicators.map(x => x.name + ' = ' + x.text).join(', '));
    for (const side of ['buy', 'sell']) {
        const R = S.sides[side]; if (!R) continue;
        lines.push((side === 'buy' ? 'BUY' : 'SELL') + ' when ' + R.when.text + ' · stop ' + R.stop.text + (R.target ? ' · target ' + R.target.text : ' · no target') +
            (R.trail ? ' · trail ' + R.trail.text : '') + (R.exit ? ' · exit when ' + R.exit.text : ''));
    }
    const o = S.options;
    lines.push('Max ' + o.maxOpen + ' open · ' + (o.holdOvernight ? 'held overnight' : 'closed before the daily break') + (o.maxBars ? ' · closed after ' + o.maxBars + ' candles' : '') + (o.breakevenR ? ' · breakeven at ' + o.breakevenR + 'R' : ''));
    return lines.join('\n');
}

// ── the strategy files ──────────────────────────────────────────────────────
const DIR = path.join(__dirname, 'strategies');
let _cache = null;
function loadAll(force) {
    if (_cache && !force) return _cache;
    const out = {}, errors = {};
    let files = [];
    try { files = fs.readdirSync(DIR).filter(f => /\.json$/.test(f)).sort(); } catch (e) { /* no folder */ }
    for (const f of files) {
        try {
            const spec = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
            const S = compile(spec);
            if (S.id + '.json' !== f) throw new X.ExprError('file ' + f + ' holds strategy "' + S.id + '": the file name must be the id');
            out[S.id] = S;
        } catch (e) { errors[f] = e.message; }
    }
    _cache = { strategies: out, errors };
    return _cache;
}
function get(id) { const all = loadAll(); return all.strategies[String(id || '').trim().toLowerCase()] || null; }
function list() { const all = loadAll(); return Object.values(all.strategies).map(S => ({ id: S.id, name: S.name, timeframe: S.timeframe })); }

module.exports = { compile, get, list, loadAll, completedBars, prepare, clockVars, usDst, TF, CTORS, PRICES, indicators: ind, expr: X };
