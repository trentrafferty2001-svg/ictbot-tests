// ════════════════════════════════════════════════════════════════════════════
//  Direction Bias
//
//  Tracks a rolling window of recent win/loss outcomes per trade direction
//  (buy vs sell) and, once there's enough sample size on both sides, gives a
//  small confluence bonus to whichever direction has genuinely been
//  outperforming recently — the idea being that the current market regime
//  may currently favor one side over the other.
//
//  Deliberately conservative: below MIN_SAMPLES per direction, or when the
//  two directions are roughly balanced, both bonuses stay at 0 — matching
//  the neutral behavior this call site has always had until now (the
//  underlying function never existed before this fix).
//
//  Owns its own small persistence: in-memory rolling arrays, capped, with a
//  fire-and-forget backup to Postgres after every update and a hydrate()
//  step (called once from bot-engine.js's hydrateFromPostgres at boot) that
//  restores from Postgres if this process hasn't accumulated anything yet.
// ════════════════════════════════════════════════════════════════════════════

const { readNamedState, writeNamedState } = require('../state/writer');

const MAX_HISTORY = 20;
const MIN_SAMPLES = 8;
const MAX_BONUS = 0.8;

let _dirStats = { buy: [], sell: [] };

function normalizeSignal(signal) {
    const s = String(signal || '').toLowerCase();
    if (s === 'buy' || s === 'sell') return s;
    return null;
}

function updateDirectionStats(signal, outcome) {
    const dir = normalizeSignal(signal);
    if (!dir) return;
    const result = outcome === 'win' ? 'win' : 'loss';

    _dirStats[dir].push(result);
    if (_dirStats[dir].length > MAX_HISTORY) {
        _dirStats[dir] = _dirStats[dir].slice(-MAX_HISTORY);
    }

    writeNamedState('directionStats', _dirStats).catch(() => {});
}

function winRate(arr) {
    if (!arr.length) return null;
    return arr.filter(r => r === 'win').length / arr.length;
}

function getDirectionBias() {
    const buyRate = winRate(_dirStats.buy);
    const sellRate = winRate(_dirStats.sell);

    if (_dirStats.buy.length < MIN_SAMPLES || _dirStats.sell.length < MIN_SAMPLES || buyRate === null || sellRate === null) {
        return { buyBonus: 0, sellBonus: 0 };
    }

    const diff = buyRate - sellRate; // -1 .. +1
    const buyBonus = diff > 0 ? Math.min(diff * 1.5, MAX_BONUS) : 0;
    const sellBonus = diff < 0 ? Math.min(-diff * 1.5, MAX_BONUS) : 0;

    return { buyBonus, sellBonus };
}

async function hydrate() {
    if (_dirStats.buy.length > 0 || _dirStats.sell.length > 0) return false; // already have same-process data, never clobber
    try {
        const saved = await readNamedState('directionStats');
        if (saved && Array.isArray(saved.buy) && Array.isArray(saved.sell)) {
            _dirStats = { buy: saved.buy.slice(-MAX_HISTORY), sell: saved.sell.slice(-MAX_HISTORY) };
            return true;
        }
    } catch (e) {
        // best-effort — leave _dirStats at its empty default
    }
    return false;
}

module.exports = { updateDirectionStats, getDirectionBias, hydrate };
