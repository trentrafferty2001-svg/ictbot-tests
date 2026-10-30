// ════════════════════════════════════════════════════════════════════════════
//  Seasonality Analyzer (intraday: day-of-week + hour-of-day)
//
//  SeasonalityAdvanced (src/analysis/seasonality-advanced.js) already covers
//  month/week/holiday patterns and is applied separately in managePositions.
//  This module is deliberately scoped to INTRADAY session behavior only —
//  day and hour — so the two are complementary, not duplicated.
//
//  Session windows (all UTC) follow the same kill-zone/session conventions
//  already used throughout the rest of this bot (anyKZ, inSilverBullet,
//  etc.):
//    - Asian session (00:00–07:00): historically choppier for gold
//    - London open (07:00–10:00) & London/NY overlap (12:00–16:00):
//      historically the most directional windows
//    - Broader London/NY session outside those opens: steady continuation
//    - Late Friday / weekend edge: reduced conviction, gap risk ahead
// ════════════════════════════════════════════════════════════════════════════

function classify(day, hour) {
    const isLateFriday = day === 5 && hour >= 19;
    const isWeekendEdge = day === 0 || isLateFriday || day === 6;
    const isLondonOpen = hour >= 7 && hour < 10;
    const isOverlap = hour >= 12 && hour < 16;
    const isAsian = hour >= 0 && hour < 7;
    const isBroaderSession = (hour >= 10 && hour < 12) || (hour >= 16 && hour < 19);

    if (isWeekendEdge) return 'reversal';
    if (isLondonOpen || isOverlap) return 'breakout';
    if (isAsian) return 'range_bound';
    if (isBroaderSession) return 'momentum';
    return 'momentum'; // default for anything not explicitly matched
}

class SeasonalityAnalyzer {
    getPattern(day, hour) {
        return { pattern: classify(day, hour) };
    }

    getSizeMultiplier(day, hour) {
        const pattern = classify(day, hour);
        switch (pattern) {
            case 'breakout': return 1.1;
            case 'momentum': return 1.0;
            case 'range_bound': return 0.8;
            case 'reversal': return 0.7;
            default: return 1.0;
        }
    }

    // Only consulted when a position is already profitable (see
    // managePositions). Deliberately conservative: this exit path has
    // never actually run before (the class it depends on didn't exist),
    // so it only triggers in a clearly justified window — heading into
    // the weekend, where holding a profitable position into low-liquidity
    // gap risk is a well-established reason to consider an early exit —
    // rather than a broad new rule that could unexpectedly cut winners
    // short in ways that haven't been reviewed.
    shouldHold(day, hour, profit) {
        const isLateFriday = day === 5 && hour >= 20;
        if (isLateFriday && profit > 0) return false;
        return true;
    }
}

module.exports = { SeasonalityAnalyzer };
