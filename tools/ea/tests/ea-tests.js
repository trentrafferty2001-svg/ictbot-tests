// Tests for the EA engine (src/ea): indicator maths, the formula language,
// strategy files, no look-ahead, and that the trend-4h strategy file gives
// exactly the hand-coded trend mode's decisions.
// Usage: node tools/ea/tests/ea-tests.js   (from the project folder)
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const EA = require(path.join(ROOT, 'src/ea'));
const I = EA.indicators, X = EA.expr;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const near = (a, b, tol) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol) * Math.max(1, Math.abs(b));
const sameSeries = (name, got, want, tol) => {
    let bad = -1;
    for (let i = 0; i < want.length; i++) if (!near(got[i], want[i], tol)) { bad = i; break; }
    ok(name, bad === -1 && got.length === want.length, bad === -1 ? { len: got.length } : { i: bad, got: got[bad], want: want[bad] });
};
const throwsLike = (name, fn, re) => { try { fn(); ok(name, false, 'did not throw'); } catch (e) { ok(name, re.test(e.message), e.message); } };

// deterministic random candles (a random walk with realistic wicks)
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function candles(n, seed, startMs, stepMs) {
    const r = rng(seed), out = [];
    let p = 2000;
    for (let i = 0; i < n; i++) {
        const o = p, c = o + (r() - 0.5) * 20, h = Math.max(o, c) + r() * 6, l = Math.min(o, c) - r() * 6;
        out.push({ time: new Date(startMs + i * stepMs).toISOString(), open: +o.toFixed(2), high: +h.toFixed(2), low: +l.toFixed(2), close: +c.toFixed(2), tickVolume: 100 + Math.floor(r() * 900) });
        p = c;
    }
    return out;
}
const cols = bars => ({ open: Float64Array.from(bars.map(b => b.open)), high: Float64Array.from(bars.map(b => b.high)), low: Float64Array.from(bars.map(b => b.low)), close: Float64Array.from(bars.map(b => b.close)) });

// ── 1. indicators against plain, slow reference versions ────────────────────
const B = cols(candles(600, 7, Date.UTC(2024, 0, 1), 3600000)), C = B.close, N = C.length;
const refSma = (s, n) => Array.from(s, (_, i) => i < n - 1 ? NaN : s.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n);
sameSeries('SMA = plain average', I.sma(C, 20), refSma(C, 20));
const refEma = (s, n) => { const a = 2 / (n + 1), o = []; let e; for (let i = 0; i < s.length; i++) { e = i === 0 ? s[0] : s[i] * a + e * (1 - a); o.push(i < n - 1 ? NaN : e); } return o; };
sameSeries('EMA = MT5 recursion from the first price', I.ema(C, 20), refEma(C, 20));
const refSmma = (s, n) => { const o = []; let v; for (let i = 0; i < s.length; i++) { if (i < n - 1) { o.push(NaN); continue; } v = i === n - 1 ? s.slice(0, n).reduce((a, b) => a + b, 0) / n : (v * (n - 1) + s[i]) / n; o.push(v); } return o; };
sameSeries('SMMA = Wilder average', I.smma(C, 14), refSmma(C, 14));
const refLwma = (s, n) => Array.from(s, (_, i) => { if (i < n - 1) return NaN; let a = 0, w = 0; for (let j = 0; j < n; j++) { a += s[i - j] * (n - j); w += n - j; } return a / w; });
sameSeries('LWMA = linear weights', I.lwma(C, 10), refLwma(C, 10));
const refRsi = (s, n) => { const o = Array(s.length).fill(NaN); let up = 0, dn = 0; for (let i = 1; i <= n; i++) { const d = s[i] - s[i - 1]; up += Math.max(d, 0); dn += Math.max(-d, 0); } up /= n; dn /= n; const f = () => dn ? 100 - 100 / (1 + up / dn) : up ? 100 : 50; o[n] = f(); for (let i = n + 1; i < s.length; i++) { const d = s[i] - s[i - 1]; up = (up * (n - 1) + Math.max(d, 0)) / n; dn = (dn * (n - 1) + Math.max(-d, 0)) / n; o[i] = f(); } return o; };
sameSeries('RSI = Wilder RSI', I.rsi(C, 14), refRsi(C, 14));
ok('RSI of a rising series is 100', I.rsi(Float64Array.from({ length: 40 }, (_, i) => 100 + i), 14)[39] === 100);
ok('RSI of a flat series is 50', I.rsi(new Float64Array(40).fill(5), 14)[39] === 50);
const tr = i => i === 0 ? B.high[0] - B.low[0] : Math.max(B.high[i], C[i - 1]) - Math.min(B.low[i], C[i - 1]);
const refAtr = n => Array.from(C, (_, i) => i < n ? NaN : Array.from({ length: n }, (_, j) => tr(i - j)).reduce((a, b) => a + b, 0) / n);
sameSeries('ATR = plain average of true ranges (MT5)', I.atr(B.high, B.low, C, 14), refAtr(14));
const m = I.macd(C, 12, 26, 9), e12 = refEma(C, 12), e26 = refEma(C, 26), mm = e12.map((x, i) => x - e26[i]);
sameSeries('MACD main = EMA12 - EMA26', m.main, mm);
sameSeries('MACD signal = SMA of main (MT5)', m.signal, refSma(mm.map(x => x), 9).map((x, i) => i < 25 + 8 ? NaN : x));
const bb = I.bands(C, 20, 2), sd = Array.from(C, (_, i) => { if (i < 19) return NaN; const w = Array.from(C.slice(i - 19, i + 1)), mu = w.reduce((a, b) => a + b, 0) / 20; return Math.sqrt(w.reduce((a, b) => a + (b - mu) * (b - mu), 0) / 20); });
sameSeries('Bands upper = SMA + 2 population SD', bb.upper, refSma(C, 20).map((x, i) => x + 2 * sd[i]));
sameSeries('Bands lower = SMA - 2 population SD', bb.lower, refSma(C, 20).map((x, i) => x - 2 * sd[i]));
sameSeries('StdDev', I.stddev(C, 20), sd);
const st = I.stochastic(B.high, B.low, C, 5, 3, 3);
const refK = Array.from(C, (_, i) => { if (i < 5 - 1 + 3 - 1) return NaN; let a = 0, b = 0; for (let k = i - 2; k <= i; k++) { const hh = Math.max(...B.high.slice(k - 4, k + 1)), ll = Math.min(...B.low.slice(k - 4, k + 1)); a += C[k] - ll; b += hh - ll; } return b === 0 ? 100 : a / b * 100; });
sameSeries('Stochastic %K with slowing', st.main, refK);
sameSeries('Stochastic %D = SMA of %K', st.signal, refSma(refK.map(x => x), 3));
const refAdx = n => { const a = 2 / (n + 1), P = [], M = [], A = []; let p = 0, q = 0, x = 0; P[0] = M[0] = A[0] = NaN; for (let i = 1; i < N; i++) { let u = B.high[i] - B.high[i - 1], d = B.low[i - 1] - B.low[i]; u = Math.max(u, 0); d = Math.max(d, 0); if (u > d) d = 0; else if (u < d) u = 0; else u = d = 0; const t = Math.max(B.high[i] - B.low[i], Math.abs(B.high[i] - C[i - 1]), Math.abs(B.low[i] - C[i - 1])); p = (t ? 100 * u / t : 0) * a + p * (1 - a); q = (t ? 100 * d / t : 0) * a + q * (1 - a); const dx = p + q ? 100 * Math.abs(p - q) / (p + q) : 0; x = dx * a + x * (1 - a); P[i] = i >= n ? p : NaN; M[i] = i >= n ? q : NaN; A[i] = i >= 2 * n ? x : NaN; } return { P, M, A }; };
const ad = I.adx(B.high, B.low, C, 14), rad = refAdx(14);
sameSeries('ADX (MetaQuotes version)', ad.adx, rad.A); sameSeries('+DI', ad.plusDi, rad.P); sameSeries('-DI', ad.minusDi, rad.M);
const typ = Float64Array.from(C, (c, i) => (B.high[i] + B.low[i] + c) / 3), ts = refSma(typ, 20);
sameSeries('CCI', I.cci(typ, 20), Array.from(typ, (v, i) => { if (i < 19) return NaN; let d = 0; for (let j = 0; j < 20; j++) d += Math.abs(typ[i - j] - ts[i]); d *= 0.015 / 20; return d ? (v - ts[i]) / d : 0; }));
sameSeries('Momentum = % of the price n bars back', I.momentum(C, 10), Array.from(C, (v, i) => i < 10 ? NaN : v * 100 / C[i - 10]));
sameSeries('Highest', I.highest(B.high, 20), Array.from(C, (_, i) => i < 19 ? NaN : Math.max(...B.high.slice(i - 19, i + 1))));
sameSeries('Lowest', I.lowest(B.low, 20), Array.from(C, (_, i) => i < 19 ? NaN : Math.min(...B.low.slice(i - 19, i + 1))));
ok('typical price', near(I.price(B, 'typical')[5], (B.high[5] + B.low[5] + C[5]) / 3));

// ── 2. the formula language ──────────────────────────────────────────────────
const env = { series: new Set(['close', 'high', 'low', 'fast', 'slow']), scalars: { entry: '', hour: '' } };
const run = (src, s, k, v) => { const a = X.parse(src); X.check(a, env, src); return X.toJs(a)({ s, v: v || {} }, k); };
const S1 = { close: [1, 2, 3, 4, 5], high: [2, 3, 4, 5, 6], low: [0, 1, 2, 3, 4], fast: [1, 1, 3, 3, 3], slow: [2, 2, 2, 2, 2] };
ok('a name means the last finished candle', run('close', S1, 4) === 5);
ok('[2] is one candle further back', run('close[2]', S1, 4) === 4);
ok('precedence: * before +, comparison last', run('1 + 2 * 3 == 7', S1, 4) === true);
ok('and binds tighter than or', run('true or false and false', S1, 4) === true);
ok('not', run('not close > 9', S1, 4) === true);
ok('unary minus', run('-close[3] + 10', S1, 4) === 7);
ok('min/max/abs', run('max(close, high[3], 1) + abs(-2) - min(low, 9)', S1, 4) === 5 + 2 - 4);  // close 5, high[3] 4, low 4
ok('cross_above true on the candle it crosses', run('cross_above(fast, slow)', S1, 2) === true);
ok('cross_above false a candle later', run('cross_above(fast, slow)', S1, 3) === false);
ok('cross_below', run('cross_below(slow, fast)', S1, 2) === true);
ok('missing value gives no answer (not false)', run('close[9] > 1', S1, 4) === null);
ok('not of a missing value still gives no answer', run('not (close[9] > 1)', S1, 4) === null);
ok('division by zero gives no answer', run('close / (high - high)', S1, 4) === null);
ok('scalars', run('entry - 2 * hour', S1, 4, { entry: 100, hour: 5 }) === 90);
throwsLike('unknown name', () => X.check(X.parse('closee > 1'), env, 'closee > 1'), /unknown name "closee"/);
throwsLike('[0] refused (the unfinished candle)', () => X.parse('close[0] > 1'), /unfinished candle/);
throwsLike('= instead of ==', () => X.parse('close = 1'), /use ==/);
throwsLike('number where a condition is needed', () => X.check(X.parse('close and true'), env, ''), /join conditions/);
throwsLike('a scalar can\'t take [n]', () => X.check(X.parse('entry[2]'), env, ''), /single number/);
throwsLike('unknown function', () => X.check(X.parse('foo(close)'), env, ''), /unknown function/);
throwsLike('trailing junk', () => X.parse('close > 1 )'), /unexpected/);
ok('text form keeps the meaning, with brackets only where needed', X.toText(X.parse('(a + b) * c > d - (e - f) and not (g or h)')) === '(a + b) * c > d - (e - f) and not (g or h)', X.toText(X.parse('(a + b) * c > d - (e - f) and not (g or h)')));
ok('MQL5 form', X.toMql(X.parse('cross_above(fast, slow[2]) and close > 2'), { fast: 'F', slow: 'S', close: 'C' }, {}) === '((F(1) > S(2) && F(2) <= S(3)) && (C(1) > 2.0))', X.toMql(X.parse('cross_above(fast, slow[2]) and close > 2'), { fast: 'F', slow: 'S', close: 'C' }, {}));

// ── 3. strategy files ─────────────────────────────────────────────────────────
const base = () => ({ id: 'x-test', timeframe: '1h', indicators: { e: 'EMA(close, 5)' }, buy: { when: 'close > e', stop: 'entry - 5' } });
ok('a minimal strategy compiles', EA.compile(base()).id === 'x-test');
throwsLike('bad id', () => EA.compile(Object.assign(base(), { id: 'Bad Id' })), /strategy id/);
throwsLike('bad timeframe', () => EA.compile(Object.assign(base(), { timeframe: '2h' })), /timeframe must be/);
throwsLike('reserved indicator name', () => EA.compile(Object.assign(base(), { indicators: { close: 'EMA(close, 5)' } })), /built-in name/);
throwsLike('unknown indicator', () => EA.compile(Object.assign(base(), { indicators: { e: 'EMMA(close, 5)' } })), /must be one of/);
throwsLike('wrong argument count', () => EA.compile(Object.assign(base(), { indicators: { e: 'EMA(close)' } })), /takes 2 values/);
throwsLike('price argument checked', () => EA.compile(Object.assign(base(), { indicators: { e: 'EMA(volume, 5)' } })), /must be a price/);
throwsLike('stop is required', () => EA.compile(Object.assign(base(), { buy: { when: 'close > e' } })), /buy\.stop is required/);
throwsLike('entry not allowed in entry rules', () => EA.compile(Object.assign(base(), { buy: { when: 'close > entry', stop: 'entry - 5' } })), /unknown name "entry"/);
throwsLike('risk not allowed in the stop', () => EA.compile(Object.assign(base(), { buy: { when: 'close > e', stop: 'entry - risk' } })), /unknown name "risk"/);
ok('risk allowed in the target', !!EA.compile(Object.assign(base(), { buy: { when: 'close > e', stop: 'entry - 5', target: 'entry + 2 * risk' } })).sides.buy.target);
throwsLike('MACD fast must be faster', () => EA.compile(Object.assign(base(), { indicators: { m: 'MACD(close, 26, 12, 9)' } })), /fast period/);
const all = EA.loadAll(true);
ok('every strategy file in src/ea/strategies loads', Object.keys(all.errors).length === 0, all.errors);
ok('trend-4h is there', !!EA.get('trend-4h'));

// levels: stop and target on the right side, else no trade
{
    const S = EA.compile({ id: 'lv-test', timeframe: '1h', buy: { when: 'true', stop: 'low', target: 'entry + 2 * risk' }, sell: { when: 'false', stop: 'high' } });
    const bars = candles(30, 3, Date.UTC(2024, 0, 1), 3600000), ctx = S.prepare(bars), k = 29, lo = bars[29].low;
    const L = S.levels(ctx, k, 'buy', lo + 4);
    ok('stop from the formula, target from risk', L.ok && near(L.stop, lo) && near(L.target, lo + 4 + 8), L);
    ok('a stop above a buy entry is refused', S.levels(ctx, k, 'buy', lo - 1).ok === false);
}

// ── 4. no look-ahead: a decision on candle k never changes when later candles exist
{
    const spec = { id: 'la-test', timeframe: '1h', indicators: { f: 'EMA(close, 8)', s: 'SMA(close, 21)', r: 'RSI(close, 14)', a: 'ATR(14)', m: 'MACD(close, 12, 26, 9)', ms: 'MACD_SIGNAL(close, 12, 26, 9)', x: 'ADX(14)', k: 'STOCH_K(5, 3, 3)', u: 'BB_UPPER(close, 20, 2)', c: 'CCI(typical, 20)' },
        buy: { when: 'cross_above(f, s) and r > 50 and m > ms and x > 10 or close > u', stop: 'entry - 2 * a', exit: 'cross_below(f, s)' }, sell: { when: 'cross_below(f, s) and r < 50 or k < 10 and c < -100', stop: 'entry + 2 * a', exit: 'cross_above(f, s)' } };
    const S = EA.compile(spec), bars = candles(700, 11, Date.UTC(2024, 0, 1), 3600000), full = S.prepare(bars);
    let diffs = 0, signals = 0;
    for (let k = 120; k < 650; k += 7) {
        const part = S.prepare(bars.slice(0, k + 1)), a = S.signal(part, k), b = S.signal(full, k);
        if (a.dir !== b.dir) diffs++; if (a.dir) signals++;
        if (S.exit(part, k, 'buy', 2000, 10) !== S.exit(full, k, 'buy', 2000, 10)) diffs++;
    }
    ok('decisions use finished candles only (no look-ahead)', diffs === 0 && signals > 3, { diffs, signals });
    // only finished candles count
    const now = Date.parse(bars[100].time) + 30 * 60000; // half-way through candle 100
    ok('the unfinished candle is left out', S.completed(bars, now).length === 100);
    const shuffled = bars.slice(0, 50).reverse();
    ok('candles out of order are not trusted', S.completed(shuffled, Date.parse(bars[60].time)).length === 1);
}

// ── 5. the trend-4h strategy file = the hand-coded trend mode ───────────────
process.env.LOG_LEVEL = 'error';
const be = require(path.join(ROOT, 'bot-engine.js'));
{
    const S = EA.get('trend-4h'), H4 = 4 * 3600000, t0 = Date.UTC(2023, 0, 2, 22); // a 4-hour boundary on XM's clock (winter)
    let agree = 0, differ = [], sig = 0, trails = 0;
    for (const seed of [1, 2, 3]) {
        const bars = candles(520, seed * 101, t0, H4);
        for (let k = 205; k < 519; k++) {
            const now = Date.parse(bars[k].time) + H4 + 60000;          // one minute into candle k+1
            const visible = bars.slice(0, k + 2);                        // incl. the unfinished candle
            const hand = be.v1TrendSignal(visible, now);
            const done = S.completed(visible, now), ctx = S.prepare(done), kk = done.length - 1;
            const ea = S.signal(ctx, kk);
            const stopHand = hand.dir ? (hand.dir === 'buy' ? 3000 - 2 * hand.atr : 3000 + 2 * hand.atr) : null;
            const lv = hand.dir ? S.levels(ctx, kk, hand.dir, 3000) : null;
            const same = hand.dir === ea.dir && near(ctx.s.sma200[kk], hand.sma, 1e-12) && near(ctx.s.hh20[kk - 1], hand.hh) && near(ctx.s.ll20[kk - 1], hand.ll) && near(ctx.s.atr20[kk], hand.atr, 1e-12) && (!hand.dir || near(lv.stop, stopHand, 1e-12));
            if (same) agree++; else if (differ.length < 3) differ.push({ seed, k, hand: { dir: hand.dir, sma: hand.sma, hh: hand.hh, ll: hand.ll, atr: hand.atr }, ea: { dir: ea.dir, sma: ctx.s.sma200[kk], hh: ctx.s.hh20[kk - 1], atr: ctx.s.atr20[kk] } });
            if (hand.dir) sig++;
            for (const isBuy of [true, false]) {
                const th = be.v1TrendTrail(visible, isBuy, now), te = S.trail(ctx, kk, isBuy ? 'buy' : 'sell', 3000, 50);
                if (near(th, te)) trails++; else if (differ.length < 3) differ.push({ trail: true, seed, k, isBuy, th, te });
            }
        }
    }
    ok('trend-4h gives the same entries, levels and stops as trend mode (' + agree + ' candles, ' + sig + ' signals)', differ.length === 0 && sig > 5, differ);
    ok('trend-4h trails like trend mode (' + trails + ' checks)', differ.length === 0);
}

// ── 6. bot settings ──────────────────────────────────────────────────────────
delete process.env.V1_STRATEGY; delete process.env.V1_EA;
ok('default strategy unchanged', be.v1Settings().strategy === 'ict');
process.env.V1_STRATEGY = 'EA'; process.env.V1_EA = 'Trend-4H';
ok('ea mode and strategy id read', be.v1Settings().strategy === 'ea' && be.v1Settings().eaId === 'trend-4h');
ok('status shows the EA strategy', /EA formulas — 4-hour breakout trend-follower/.test(be.getV1StatusText()));
process.env.V1_EA = 'nope';
ok('status says when the strategy is missing', /no strategy loaded/.test(be.getV1StatusText()));
delete process.env.V1_STRATEGY; delete process.env.V1_EA;

console.log('ea: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
