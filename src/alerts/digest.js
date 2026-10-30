// ════════════════════════════════════════════════════════════════════════════
//  Digest buffer for non-urgent Telegram messages.
//
//  Added 2026-08-08 at the person's request ("only send it to me once a
//  day"). Rather than silence every message equally (which would also hide
//  genuine errors and real account-state changes — the exact things
//  several real bugs this engagement were only caught because the person
//  saw an odd message in real time), messages are split into two classes.
//
//  Redesigned 2026-08-11 after discovering the original allowlist-of-
//  urgent-patterns design was actively hiding real alerts: margin
//  failures, loss-threshold warnings, and a reconciliation failure were
//  all silently buffered because none matched the hardcoded urgent list,
//  which only anticipated message shapes known when it was first built.
//  Inverted: DEFERRABLE (buffered — the specific, deliberately narrow set
//  of routine progress-update messages this digest was actually built
//  for) is now the allowlist, and everything else defaults to URGENT
//  (sent immediately). A message type this hasn't seen before now fails
//  safe — sent right away — instead of silently vanishing for a day.
// ════════════════════════════════════════════════════════════════════════════

let _buffer = [];
const MAX_BUFFER = 300; // safety cap; a day's worth of non-urgent messages
                        // should never realistically approach this

// The ONLY message types eligible for deferral to the daily digest —
// routine, expected, non-error progress updates on an already-open,
// already-healthy position. Matched against the start of the message
// text. Anything not matching one of these is sent immediately.
const DEFERRABLE_PATTERNS = [
    '🔒 *Breakeven reached*',
    '🔒 *Trade is now RISK-FREE!*',
    '📶 *Step trail*',
    '🔒 Chandelier trail',
    '🔒 Sniper trail',
    '💤 Market is closed',
    '⚡ Scalp closed',
    '⚡ Scalp stopped',
];

function isUrgent(message) {
    const text = String(message);
    return !DEFERRABLE_PATTERNS.some(p => text.startsWith(p));
}

// Call this instead of sending immediately for a non-urgent message.
// Returns true if it was buffered, false if the buffer is full (caller
// should fall back to sending immediately rather than silently drop it).
function bufferMessage(message) {
    if (_buffer.length >= MAX_BUFFER) return false;
    _buffer.push({ text: String(message), ts: Date.now() });
    return true;
}

// Summarizes and clears the buffer. Groups by a short label derived from
// each message's own emoji/leading phrase (breakeven, trailing, step
// trail, risk-free, market-closed, other) with a count for each, rather
// than reproducing every individual message — the whole point of a digest
// is to compress, not just delay.
function drainDigest() {
    if (_buffer.length === 0) return null;

    const groups = {};
    for (const item of _buffer) {
        const label = classify(item.text);
        groups[label] = (groups[label] || 0) + 1;
    }

    const lines = Object.entries(groups)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => `${label}: ${count}`);

    const total = _buffer.length;
    _buffer = [];

    return `📨 ${total} routine update${total === 1 ? '' : 's'} today:\n` + lines.join('\n');
}

function classify(text) {
    if (text.includes('Breakeven reached')) return '🔒 Breakeven';
    if (text.includes('RISK-FREE')) return '🔒 Risk-free confirmations';
    if (text.includes('Step trail')) return '📶 Step trail moves';
    if (text.includes('Chandelier trail')) return '🔒 Chandelier trail moves';
    if (text.includes('Sniper trail')) return '🔒 Sniper trail moves';
    if (text.includes('Market is closed')) return '💤 Market closed notices';
    if (text.includes('Scalp closed') || text.includes('Scalp stopped')) return '⚡ Scalp exits';
    return '📢 Other';
}

function bufferSize() {
    return _buffer.length;
}

module.exports = { isUrgent, bufferMessage, drainDigest, bufferSize };
