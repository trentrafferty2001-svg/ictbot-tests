// ════════════════════════════════════════════════════════════════════════════
//  Position Sizing - Shared logic for trade and upgrade paths
// ════════════════════════════════════════════════════════════════════════════

const { logger } = require('../logger');

const MIN_LOT_FOR_SPLIT = 0.03;
const MAX_RISK_PCT = 3.0;

function calculateLotSize({
  balance,
  riskPct,
  slDist,
  contractSize,
  minVolume = 0.01,
  maxVolume = 100,
  volumeStep = 0.01,
  score = 0,
  maxRiskPct = MAX_RISK_PCT,
  minLotForSplit = MIN_LOT_FOR_SPLIT,
  forceSplit = false,
}) {
  if (balance <= 0) {
    logger.warn('[position-sizing] Balance <= 0, cannot calculate lot size');
    return { lots: 0, canSplit: false, riskAmount: 0, riskPct: 0 };
  }
  
  if (slDist <= 0) {
    logger.warn('[position-sizing] slDist <= 0, cannot calculate lot size');
    return { lots: 0, canSplit: false, riskAmount: 0, riskPct: 0 };
  }
  
  const riskAmount = balance * (riskPct / 100);
  const lotRaw = riskAmount / (slDist * contractSize);
  
  let clampedLot = Math.max(minVolume, Math.min(lotRaw, maxVolume));
  
  let canSplit = clampedLot >= minLotForSplit || forceSplit;
  
  if (!canSplit && score >= 9 && riskPct < 2.0) {
    const potentialLot = Math.max(minVolume, minLotForSplit);
    const potentialRisk = (potentialLot * slDist * contractSize) / balance * 100;
    if (potentialRisk <= maxRiskPct) {
      clampedLot = potentialLot;
      canSplit = true;
      logger.debug(`[position-sizing] Increased lot from ${lotRaw.toFixed(2)} to ${clampedLot.toFixed(2)} to enable split`);
    }
  }
  
  const lots = parseFloat(
    (Math.round(clampedLot / volumeStep) * volumeStep).toFixed(2)
  );
  
  const actualRiskAmount = lots * slDist * contractSize;
  const actualRiskPct = (actualRiskAmount / balance) * 100;
  
  const halfLots = parseFloat((lots * 0.5).toFixed(2));
  const canSplitFinal = canSplit && halfLots >= minVolume;
  
  return {
    lots,
    halfLots,
    canSplit: canSplitFinal,
    riskAmount: actualRiskAmount,
    riskPct: actualRiskPct,
    rawLot: lotRaw,
    contractSize,
    slDist,
  };
}

function calculateSplitVolumes(volume, minLot = 0.01) {
  let tp1Vol = parseFloat((volume * 0.40).toFixed(2));
  let tp2Vol = parseFloat((volume * 0.30).toFixed(2));
  let tp3Vol = parseFloat((volume * 0.30).toFixed(2));
  
  if (tp1Vol < minLot) tp1Vol = minLot;
  if (tp2Vol < minLot) tp2Vol = minLot;
  if (tp3Vol < minLot) tp3Vol = minLot;
  
  let total = tp1Vol + tp2Vol + tp3Vol;
  if (total > volume) {
    const diff = total - volume;
    if (tp3Vol >= diff) {
      tp3Vol = parseFloat((tp3Vol - diff).toFixed(2));
    } else if (tp2Vol >= diff) {
      tp2Vol = parseFloat((tp2Vol - diff).toFixed(2));
    } else {
      tp1Vol = parseFloat((tp1Vol - diff).toFixed(2));
    }
  }
  
  return { tp1Vol, tp2Vol, tp3Vol };
}

function calculateTPLevels(entryPrice, slDist, dir, rrMultiplier = 1.0) {
  const tp1 = dir === 'buy' 
    ? parseFloat((entryPrice + slDist * 1.0).toFixed(2))
    : parseFloat((entryPrice - slDist * 1.0).toFixed(2));
    
  const tp2 = dir === 'buy'
    ? parseFloat((entryPrice + slDist * 1.8).toFixed(2))
    : parseFloat((entryPrice - slDist * 1.8).toFixed(2));
    
  const tp3 = dir === 'buy'
    ? parseFloat((entryPrice + slDist * rrMultiplier).toFixed(2))
    : parseFloat((entryPrice - slDist * rrMultiplier).toFixed(2));
  
  return { tp1, tp2, tp3 };
}

function validateLotSize(lots, minVolume = 0.01, maxVolume = 100, volumeStep = 0.01) {
  if (lots < minVolume) return minVolume;
  if (lots > maxVolume) return maxVolume;
  return parseFloat((Math.round(lots / volumeStep) * volumeStep).toFixed(2));
}

module.exports = {
  calculateLotSize,
  calculateSplitVolumes,
  calculateTPLevels,
  validateLotSize,
  MIN_LOT_FOR_SPLIT,
  MAX_RISK_PCT,
};
