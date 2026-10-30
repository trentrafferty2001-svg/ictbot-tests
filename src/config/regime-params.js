'use strict';

/**
 * Regime-specific parameter overrides.
 * @param {string} regime - 'trending' | 'ranging' | 'volatile' | 'normal' | 'low-vol'
 * @param {Object} baseParams - current config (risk, minScore, rr, etc.)
 * @returns {Object} overrides to apply.
 */
function getRegimeParams(regime, baseParams) {
  const overrides = {};

  switch (regime) {
    case 'trending':
      overrides.minScore = Math.max(4, (baseParams.minScore || 7) - 1);
      overrides.risk = Math.min(2.0, (baseParams.risk || 1) * 1.3);
      overrides.rr = Math.min(5, (baseParams.rr || 3) * 1.2);
      overrides.beThreshold = 0.4;
      overrides.trailActivation = 1.2;
      break;

    case 'ranging':
      overrides.minScore = Math.min(10, (baseParams.minScore || 7) + 2);
      overrides.risk = Math.max(0.5, (baseParams.risk || 1) * 0.6);
      overrides.rr = 2.0;
      overrides.beThreshold = 0.2;
      overrides.trailActivation = 2.0;
      overrides.maxT = Math.max(1, (baseParams.maxT || 3) - 1);
      break;

    case 'volatile':
      overrides.minScore = Math.min(10, (baseParams.minScore || 7) + 1);
      overrides.risk = Math.max(0.4, (baseParams.risk || 1) * 0.5);
      overrides.rr = 4.0;
      overrides.beThreshold = 0.6;
      overrides.trailActivation = 0.8;
      overrides.slBuf = (baseParams.slBuf || 15) * 1.5;
      break;

    case 'low-vol':
      overrides.minScore = Math.max(5, (baseParams.minScore || 7) - 1);
      overrides.risk = Math.min(1.5, (baseParams.risk || 1) * 1.2);
      overrides.rr = 2.5;
      overrides.beThreshold = 0.3;
      overrides.trailActivation = 1.5;
      break;

    default: // normal
      // keep base
      break;
  }

  return overrides;
}

module.exports = { getRegimeParams };
