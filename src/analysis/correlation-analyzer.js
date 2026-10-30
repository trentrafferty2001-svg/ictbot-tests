// ════════════════════════════════════════════════════════════════════════════
//  Correlation Analyzer
//
//  IntermarketAdvanced already fetches DXY/TLT/SPY/GDX/USO/EEM through a
//  shared, rate-limited Yahoo queue and stores the result each cycle as
//  global._intermarketData ({ sentiment, score }) — see runFullAnalysis.
//  This analyzer deliberately does NOT fetch anything of its own; it just
//  reframes that already-computed macro reading into a deviation/signal
//  shape for position sizing. Building a second, independent DXY fetch here
//  would duplicate IntermarketAdvanced and risk colliding with its queue.
//
//  Direction-agnostic by design: managePositions calls this once per cycle
//  across potentially several open positions with different directions, so
//  it reports how extreme the macro backdrop is right now rather than
//  judging it "for" or "against" any single trade.
// ════════════════════════════════════════════════════════════════════════════

class CorrelationAnalyzer {
    async analyze(symbol, cfg) {
        const data = global._intermarketData || { sentiment: 'neutral', score: 0 };
        const deviation = Math.abs(data.score || 0);

        let signal = 'normal';
        if (deviation >= 1.5) signal = 'warning';
        else if (deviation >= 0.8) signal = 'caution';

        return { deviation, signal, sentiment: data.sentiment || 'neutral' };
    }

    getSizeAdjustment(result) {
        if (!result) return 1.0;
        if (result.signal === 'warning') return 0.6;
        if (result.signal === 'caution') return 0.8;
        return 1.0;
    }
}

module.exports = { CorrelationAnalyzer };
