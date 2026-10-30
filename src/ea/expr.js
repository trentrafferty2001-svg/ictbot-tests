'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  EA engine — the equation language (added 2026-10-30)
//
//  A strategy's rules are written as small formulas, e.g.
//      close > ema200 and cross_above(rsi, 30)
//      entry - 2 * atr14
//  Each formula is parsed once (never eval'd) and compiled two ways: to a
//  JavaScript function (the bot, the replay) and to MQL5 source (the exported
//  Expert Advisor), so both read the same rules.
//
//  Bars are counted like MQL5's "shift": [1] is the last FINISHED candle,
//  [2] the one before it, and so on. A name without [n] means [1]. The
//  unfinished candle ([0]) can't be used, so a rule can never peek at a
//  price that hasn't happened yet.
//
//  Grammar (lowest precedence first):
//      or    := and (('or' | '||') and)*
//      and   := not (('and' | '&&') not)*
//      not   := ('not' | '!') not | cmp
//      cmp   := sum (('<' | '<=' | '>' | '>=' | '==' | '!=') sum)?
//      sum   := prod (('+' | '-') prod)*
//      prod  := unary (('*' | '/') unary)*
//      unary := '-' unary | post
//      post  := prim ('[' integer ']')?
//      prim  := number | 'true' | 'false' | name | name '(' args ')' | '(' or ')'
// ════════════════════════════════════════════════════════════════════════════

class ExprError extends Error {}

function tokenize(src) {
    const s = String(src), out = [];
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/[0-9.]/.test(c)) {
            const m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(i));
            if (!m) throw new ExprError('bad number at "' + s.slice(i, i + 10) + '"');
            out.push({ t: 'num', v: parseFloat(m[0]), raw: m[0], at: i }); i += m[0].length; continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
            out.push({ t: 'id', v: m[0], at: i }); i += m[0].length; continue;
        }
        const two = s.slice(i, i + 2);
        if (['<=', '>=', '==', '!=', '&&', '||'].indexOf(two) !== -1) { out.push({ t: 'op', v: two, at: i }); i += 2; continue; }
        if ('+-*/()[],<>!'.indexOf(c) !== -1) { out.push({ t: 'op', v: c, at: i }); i++; continue; }
        if (c === '=') throw new ExprError('use == to compare (at "' + s.slice(i, i + 10) + '")');
        throw new ExprError('unexpected "' + c + '" at position ' + i);
    }
    out.push({ t: 'end', at: s.length });
    return out;
}

function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const isOp = (v) => peek().t === 'op' && peek().v === v;
    const isWord = (v) => peek().t === 'id' && peek().v.toLowerCase() === v;
    const expect = (v) => { if (!isOp(v)) throw new ExprError('expected "' + v + '" at position ' + peek().at + ' in: ' + src); next(); };
    function or() { let l = and(); while (isOp('||') || isWord('or')) { next(); l = { k: 'bin', op: '||', l, r: and() }; } return l; }
    function and() { let l = not(); while (isOp('&&') || isWord('and')) { next(); l = { k: 'bin', op: '&&', l, r: not() }; } return l; }
    function not() { if (isOp('!') || isWord('not')) { next(); return { k: 'not', a: not() }; } return cmp(); }
    function cmp() {
        const l = sum();
        if (peek().t === 'op' && ['<', '<=', '>', '>=', '==', '!='].indexOf(peek().v) !== -1) { const op = next().v; return { k: 'bin', op, l, r: sum() }; }
        return l;
    }
    function sum() { let l = prod(); while (isOp('+') || isOp('-')) { const op = next().v; l = { k: 'bin', op, l, r: prod() }; } return l; }
    function prod() { let l = unary(); while (isOp('*') || isOp('/')) { const op = next().v; l = { k: 'bin', op, l, r: unary() }; } return l; }
    function unary() { if (isOp('-')) { next(); return { k: 'neg', a: unary() }; } if (isOp('+')) { next(); return unary(); } return post(); }
    function post() {
        const e = prim();
        if (isOp('[')) {
            if (e.k !== 'name') throw new ExprError('only a series name can take [n] (at position ' + peek().at + ')');
            next();
            const t = next();
            if (t.t !== 'num' || !Number.isInteger(t.v) || t.v < 0) throw new ExprError('[n] needs a whole number of candles back (at position ' + t.at + ')');
            if (t.v === 0) throw new ExprError(e.name + '[0] is the unfinished candle, which a rule can\'t use: [1] is the last finished one');
            expect(']');
            e.shift = t.v;
        }
        return e;
    }
    function prim() {
        const t = next();
        if (t.t === 'num') return { k: 'num', v: t.v, raw: t.raw };
        if (t.t === 'id') {
            const lw = t.v.toLowerCase();
            if (lw === 'true' || lw === 'false') return { k: 'bool', v: lw === 'true' };
            if (['and', 'or', 'not'].indexOf(lw) !== -1) throw new ExprError('"' + t.v + '" needs something before it (position ' + t.at + ')');
            if (isOp('(')) {
                next();
                const args = [];
                if (!isOp(')')) { args.push(or()); while (isOp(',')) { next(); args.push(or()); } }
                expect(')');
                return { k: 'call', fn: t.v, args };
            }
            return { k: 'name', name: t.v, shift: null };
        }
        if (t.t === 'op' && t.v === '(') { const e = or(); expect(')'); return e; }
        throw new ExprError('unexpected ' + (t.t === 'end' ? 'end of formula' : '"' + t.v + '"') + ' in: ' + src);
    }
    const ast = or();
    if (peek().t !== 'end') throw new ExprError('unexpected "' + peek().v + '" at position ' + peek().at + ' in: ' + src);
    return ast;
}

// ── checking: every name known, numbers and true/false used correctly ────────
// env: { series: Set of series names, scalars: { name: description } }
const FUNCS = {
    cross_above: { args: [2, 2], arg: 'num', ret: 'bool', series: true },
    cross_below: { args: [2, 2], arg: 'num', ret: 'bool', series: true },
    abs: { args: [1, 1], arg: 'num', ret: 'num' },
    min: { args: [2, 8], arg: 'num', ret: 'num' },
    max: { args: [2, 8], arg: 'num', ret: 'num' },
};
function check(ast, env, src) {
    let maxShift = 1;
    const used = new Set(), scalarsUsed = new Set();
    function t(e, extra) {
        switch (e.k) {
            case 'num': return 'num';
            case 'bool': return 'bool';
            case 'name': {
                if (env.series.has(e.name)) { const sh = (e.shift || 1) + extra; if (sh > maxShift) maxShift = sh; used.add(e.name); return 'num'; }
                if (Object.prototype.hasOwnProperty.call(env.scalars, e.name)) {
                    if (e.shift) throw new ExprError('"' + e.name + '" is a single number, not a series: it can\'t take [' + e.shift + ']');
                    scalarsUsed.add(e.name); return 'num';
                }
                throw new ExprError('unknown name "' + e.name + '" in: ' + src + '. Known here: ' + [...env.series].concat(Object.keys(env.scalars)).join(', '));
            }
            case 'neg': if (t(e.a, extra) !== 'num') throw new ExprError('"-" needs a number in: ' + src); return 'num';
            case 'not': if (t(e.a, extra) !== 'bool') throw new ExprError('"not" needs a true/false condition in: ' + src); return 'bool';
            case 'bin': {
                const a = t(e.l, extra), b = t(e.r, extra);
                if (e.op === '&&' || e.op === '||') { if (a !== 'bool' || b !== 'bool') throw new ExprError('"and"/"or" join conditions, not numbers, in: ' + src); return 'bool'; }
                if (a !== 'num' || b !== 'num') throw new ExprError('"' + e.op + '" needs numbers on both sides in: ' + src);
                return ['<', '<=', '>', '>=', '==', '!='].indexOf(e.op) !== -1 ? 'bool' : 'num';
            }
            case 'call': {
                const f = FUNCS[e.fn];
                if (!f) throw new ExprError('unknown function "' + e.fn + '" in: ' + src + ' (rules can use ' + Object.keys(FUNCS).join(', ') + '; indicators go in the "indicators" list)');
                if (e.args.length < f.args[0] || e.args.length > f.args[1]) throw new ExprError(e.fn + ' takes ' + (f.args[0] === f.args[1] ? f.args[0] : f.args[0] + '-' + f.args[1]) + ' values in: ' + src);
                for (const a of e.args) {
                    if (t(a, f.series ? extra + 1 : extra) !== f.arg) throw new ExprError(e.fn + ' needs numbers in: ' + src);
                    if (f.series) t(a, extra); // both candles of the cross count for the warm-up
                }
                return f.ret;
            }
        }
        throw new ExprError('bad formula: ' + src);
    }
    const type = t(ast, 0);
    return { type, maxShift, used: [...used], scalars: [...scalarsUsed] };
}

// ── JavaScript: (ctx, k, o) → value. ctx.s[name] is a series in time order,
// k the index of the last finished candle; o shifts everything further back
// (used by cross_above). A missing value (NaN, or before the data starts)
// sets ctx.bad, and the caller then treats the result as "no answer". ──────
function toJs(ast) {
    function c(e) {
        switch (e.k) {
            case 'num': { const v = e.v; return () => v; }
            case 'bool': { const v = e.v; return () => v; }
            case 'name': {
                const name = e.name, sh = (e.shift || 1) - 1;
                return (ctx, k, o) => {
                    const ser = ctx.s[name];
                    if (ser === undefined) { const v = ctx.v[name]; if (!(v === v) || v === undefined) ctx.bad = true; return v; }
                    const i = k - sh - o;
                    const v = i >= 0 ? ser[i] : NaN;
                    if (!(v === v)) ctx.bad = true;
                    return v;
                };
            }
            case 'neg': { const a = c(e.a); return (x, k, o) => -a(x, k, o); }
            case 'not': { const a = c(e.a); return (x, k, o) => !a(x, k, o); }
            case 'bin': {
                const a = c(e.l), b = c(e.r);
                switch (e.op) {
                    case '&&': return (x, k, o) => a(x, k, o) && b(x, k, o);
                    case '||': return (x, k, o) => a(x, k, o) || b(x, k, o);
                    case '+': return (x, k, o) => a(x, k, o) + b(x, k, o);
                    case '-': return (x, k, o) => a(x, k, o) - b(x, k, o);
                    case '*': return (x, k, o) => a(x, k, o) * b(x, k, o);
                    case '/': return (x, k, o) => { const d = b(x, k, o); if (d === 0) { x.bad = true; return NaN; } return a(x, k, o) / d; };
                    case '<': return (x, k, o) => a(x, k, o) < b(x, k, o);
                    case '<=': return (x, k, o) => a(x, k, o) <= b(x, k, o);
                    case '>': return (x, k, o) => a(x, k, o) > b(x, k, o);
                    case '>=': return (x, k, o) => a(x, k, o) >= b(x, k, o);
                    case '==': return (x, k, o) => a(x, k, o) === b(x, k, o);
                    case '!=': return (x, k, o) => a(x, k, o) !== b(x, k, o);
                }
                break;
            }
            case 'call': {
                const args = e.args.map(c);
                switch (e.fn) {
                    case 'cross_above': return (x, k, o) => args[0](x, k, o) > args[1](x, k, o) && args[0](x, k, o + 1) <= args[1](x, k, o + 1);
                    case 'cross_below': return (x, k, o) => args[0](x, k, o) < args[1](x, k, o) && args[0](x, k, o + 1) >= args[1](x, k, o + 1);
                    case 'abs': return (x, k, o) => Math.abs(args[0](x, k, o));
                    case 'min': return (x, k, o) => Math.min(...args.map(f => f(x, k, o)));
                    case 'max': return (x, k, o) => Math.max(...args.map(f => f(x, k, o)));
                }
            }
        }
        throw new ExprError('cannot compile ' + JSON.stringify(e));
    }
    const f = c(ast);
    // Evaluate: returns the value, or null when any input was missing.
    return (ctx, k) => { ctx.bad = false; const v = f(ctx, k, 0); return ctx.bad ? null : v; };
}

// ── MQL5 source. names: { series name → MQL5 function name taking a shift },
// scalars: { name → MQL5 expression }. Number literals are written as
// doubles; integer-looking values get ".0" so MQL5 never does integer
// division by accident. ──────────────────────────────────────────────────────
function toMql(ast, names, scalars) {
    const num = (e) => { const r = String(e.raw !== undefined ? e.raw : e.v); return /[.eE]/.test(r) ? r : r + '.0'; };
    function c(e, o) {
        switch (e.k) {
            case 'num': return num(e);
            case 'bool': return e.v ? 'true' : 'false';
            case 'name': {
                if (Object.prototype.hasOwnProperty.call(names, e.name)) return names[e.name] + '(' + ((e.shift || 1) + o) + ')';
                if (Object.prototype.hasOwnProperty.call(scalars, e.name)) return scalars[e.name];
                throw new ExprError('no MQL5 name for "' + e.name + '"');
            }
            case 'neg': return '(-' + c(e.a, o) + ')';
            case 'not': return '(!' + c(e.a, o) + ')';
            case 'bin': return '(' + c(e.l, o) + ' ' + e.op + ' ' + c(e.r, o) + ')';
            case 'call': {
                const a = (i, oo) => c(e.args[i], oo);
                switch (e.fn) {
                    case 'cross_above': return '(' + a(0, o) + ' > ' + a(1, o) + ' && ' + a(0, o + 1) + ' <= ' + a(1, o + 1) + ')';
                    case 'cross_below': return '(' + a(0, o) + ' < ' + a(1, o) + ' && ' + a(0, o + 1) + ' >= ' + a(1, o + 1) + ')';
                    case 'abs': return 'MathAbs(' + a(0, o) + ')';
                    case 'min': case 'max': {
                        const fn = e.fn === 'min' ? 'MathMin' : 'MathMax';
                        let s = a(0, o);
                        for (let i = 1; i < e.args.length; i++) s = fn + '(' + s + ', ' + a(i, o) + ')';
                        return s;
                    }
                }
            }
        }
        throw new ExprError('cannot write MQL5 for ' + JSON.stringify(e));
    }
    return c(ast, 0);
}

// Back to readable text (for messages and the strategy summary).
const PREC = { '||': 1, '&&': 2, '<': 3, '<=': 3, '>': 3, '>=': 3, '==': 3, '!=': 3, '+': 4, '-': 4, '*': 5, '/': 5 };
function toText(ast) {
    // brackets only where the order of operations needs them
    const prec = e => e.k === 'bin' ? PREC[e.op] : e.k === 'not' ? 2.5 : e.k === 'neg' ? 6 : 7;
    function c(e) {
        switch (e.k) {
            case 'num': return String(e.raw !== undefined ? e.raw : e.v);
            case 'bool': return e.v ? 'true' : 'false';
            case 'name': return e.name + (e.shift && e.shift !== 1 ? '[' + e.shift + ']' : '');
            case 'neg': return '-' + wrap(e.a, 6, false);
            case 'not': return 'not ' + wrap(e.a, 2.5, false);
            case 'bin': { const p = PREC[e.op], op = e.op === '&&' ? 'and' : e.op === '||' ? 'or' : e.op; return wrap(e.l, p, false) + ' ' + op + ' ' + wrap(e.r, p, true); }
            case 'call': return e.fn + '(' + e.args.map(c).join(', ') + ')';
        }
        return '?';
    }
    function wrap(e, p, right) { const q = prec(e), s = c(e); return q < p || (right && q === p && q >= 3) ? '(' + s + ')' : s; }
    return c(ast);
}

module.exports = { parse, check, toJs, toMql, toText, tokenize, ExprError, FUNCS };
