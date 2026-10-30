// ════════════════════════════════════════════════════════════════════════════
//  src/optimization/statistical-validator.js
//  Statistical validation using binomial confidence intervals
//  Ensures win rate is statistically significant
// ════════════════════════════════════════════════════════════════════════════

function binomialConfidence(wins, total, confidenceLevel = 0.95) {
  if (total === 0) return { lower: 0, upper: 1, mean: 0, significant: false };

  const p = wins / total;
  const z = confidenceLevel === 0.95 ? 1.96 : 1.645;
  const se = Math.sqrt((p * (1 - p)) / total);

  const lower = Math.max(0, p - z * se);
  const upper = Math.min(1, p + z * se);

  return {
    lower,
    upper,
    mean: p,
    margin: z * se,
    significant: lower > 0.45
  };
}

function validateWinRate(trades, minTrades = 20, confidenceLevel = 0.95) {
  const closed = trades.filter(t => t.outcome !== null);
  if (closed.length < minTrades) {
    return {
      valid: false,
      reason: `Insufficient trades: ${closed.length}/${minTrades}`,
      winRate: closed.length > 0 ? closed.filter(t => t.outcome === 'win').length / closed.length : 0,
      trades: closed.length,
      confidence: null
    };
  }

  const wins = closed.filter(t => t.outcome === 'win').length;
  const total = closed.length;
  const winRate = wins / total;
  
  const result = binomialConfidence(wins, total, confidenceLevel);

  return {
    valid: result.significant,
    winRate,
    trades: total,
    confidence: result,
    reason: result.significant 
      ? `Win rate ${(winRate * 100).toFixed(1)}% is statistically significant (95% CI: ${(result.lower * 100).toFixed(1)}%-${(result.upper * 100).toFixed(1)}%)`
      : `Win rate ${(winRate * 100).toFixed(1)}% is NOT statistically significant (95% CI: ${(result.lower * 100).toFixed(1)}%-${(result.upper * 100).toFixed(1)}%)`
  };
}

function validateStrategy(analysis, journal, options = {}) {
  const minTrades = options.minTrades || 20;
  const minWinRate = options.minWinRate || 0.45;
  
  const trades = journal.trades || [];
  const closed = trades.filter(t => t.outcome !== null);
  
  if (closed.length < minTrades) {
    return {
      pass: false,
      reason: `Need ${minTrades} trades, have ${closed.length}`,
      winRate: closed.length > 0 ? closed.filter(t => t.outcome === 'win').length / closed.length : 0,
      trades: closed.length
    };
  }

  const wins = closed.filter(t => t.outcome === 'win').length;
  const winRate = wins / closed.length;
  
  const result = binomialConfidence(wins, closed.length);
  
  // Also check if similar setups have good win rate
  let similarWinRate = null;
  if (analysis && journal.trades) {
    const similar = findSimilarTrades(journal.trades, analysis);
    if (similar.length >= 5) {
      const similarWins = similar.filter(t => t.outcome === 'win').length;
      similarWinRate = similarWins / similar.length;
    }
  }

  const pass = result.significant && (similarWinRate === null || similarWinRate >= minWinRate);

  return {
    pass,
    winRate,
    trades: closed.length,
    confidence: result,
    similarWinRate,
    reason: pass 
      ? `Strategy validated: ${(winRate * 100).toFixed(1)}% win rate (${closed.length} trades)`
      : `Strategy needs improvement: ${(winRate * 100).toFixed(1)}% win rate (${closed.length} trades)`
  };
}

function findSimilarTrades(trades, analysis) {
  const closed = trades.filter(t => t.outcome !== null).slice(-50);
  const similar = [];
  
  for (const t of closed) {
    let matches = 0;
    if (t.signal === analysis.signal) matches++;
    if (t.session === analysis.session?.session) matches++;
    if (Math.abs(t.score - analysis.score) < 3) matches++;
    if (t.liqSwept === analysis.liq?.swept) matches++;
    if (t.ote === analysis.ote) matches++;
    if (matches >= 2) {
      similar.push(t);
      if (similar.length >= 20) break;
    }
  }
  
  return similar;
}

module.exports = {
  binomialConfidence,
  validateWinRate,
  validateStrategy,
  findSimilarTrades
};
