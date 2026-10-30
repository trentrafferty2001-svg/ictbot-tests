'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// See src/ml/validator.js for why this now follows DATA_DIR instead of a
// hardcoded /tmp path.
const DATA_DIR = process.env.DATA_DIR || '/tmp/data';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const OPTIMIZATION_FILE = path.join(DATA_DIR, 'genetic_weights.json');

/**
 * Genetic Algorithm Optimizer.
 * Uses a population of weight vectors, evaluates on journal trades.
 */
class GeneticOptimizer {
  constructor(config = {}) {
    this.populationSize = config.populationSize || 30;
    this.generations = config.generations || 20;
    this.mutationRate = config.mutationRate || 0.2;
    this.crossoverRate = config.crossoverRate || 0.8;
    this.eliteCount = Math.floor(this.populationSize * 0.1);
    this.fitnessMetric = config.fitnessMetric || 'sharpe'; // 'sharpe', 'winrate', 'expectancy'
  }

  /**
   * Run optimization on given trades.
   * @param {Array} trades - journal trades.
   * @param {Object} currentWeights - current CONFLUENCE_WEIGHTS.
   * @param {Object} currentQuality - current QUALITY_CONFIG.
   * @param {Object} bounds - optional min/max for each weight.
   * @returns {Object} optimized weights and quality config.
   */
  optimize(trades, currentWeights, currentQuality, bounds = {}) {
    const closed = trades.filter(t => t.outcome !== null);
    if (closed.length < 30) {
      return { weights: currentWeights, quality: currentQuality };
    }

    // Define genes: for each weight in CONFLUENCE_WEIGHTS, we have a value.
    // Also include minQualityScore from QUALITY_CONFIG.
    const weightKeys = Object.keys(currentWeights);
    const geneKeys = [...weightKeys, 'minQualityScore'];

    // Bounds: default -2 to +3 for weights, 4 to 12 for minQualityScore
    const defaultBounds = {};
    for (const key of weightKeys) {
      defaultBounds[key] = { min: -2, max: 3 };
    }
    defaultBounds.minQualityScore = { min: 4, max: 12 };

    // Override with provided bounds
    const finalBounds = { ...defaultBounds, ...bounds };

    // Create initial population: random variations around current values
    let population = [];
    for (let i = 0; i < this.populationSize; i++) {
      const genes = {};
      for (const key of geneKeys) {
        let value;
        if (key === 'minQualityScore') {
          value = currentQuality.minQualityScore || 8;
        } else {
          value = currentWeights[key] || 0;
        }
        // Add random perturbation
        const range = (finalBounds[key]?.max || 3) - (finalBounds[key]?.min || -2);
        const perturbation = (Math.random() - 0.5) * range * 0.2;
        value += perturbation;
        // Clamp
        value = Math.max(finalBounds[key]?.min || -2, Math.min(finalBounds[key]?.max || 3, value));
        genes[key] = value;
      }
      population.push(genes);
    }

    // Evaluate fitness for each individual
    const evaluate = (genes) => {
      // Construct weights and quality from genes
      const weights = {};
      for (const key of weightKeys) {
        weights[key] = genes[key];
      }
      const quality = { ...currentQuality, minQualityScore: genes.minQualityScore };

      // Simulate trades using these parameters
      // For speed, we use a heuristic scoring: compute win rate and average profit per trade on backtest
      // We'll apply the weights to the analysis of each trade (if we had stored analysis)
      // Since we don't have detailed analysis for each trade, we approximate by using the trade's score and hits.
      // This is a simplification: we assume each trade had a set of hits and a score.
      // We can re-run the analysis on historical candles if we stored them, but we don't.
      // Alternative: use the recorded score and hits to compute a boosted score and then determine if trade would have been taken.
      // For optimization, we'll use a simpler approach: compute the win rate and average return if we had used these weights.
      // We'll assign a pseudo-confidence based on the trade's score and hits.
      // This is a placeholder; a full implementation would re-run analysis on saved data.
      // We'll just return a random fitness for demonstration; but we need it to work.
      // In practice, we would have stored the full analysis for each trade, or we re-run on saved candles.
      // For now, we return a fitness based on the trade's outcome and the score (higher score => better).
      // This is not ideal but serves as a proof of concept.
      let totalProfit = 0;
      let wins = 0;
      let losses = 0;
      for (const t of closed) {
        // Simulate: if the trade's score is high and hits match weights, we'd have taken it.
        // We'll assume we took all trades, and weight the profit by the boost from the weights.
        // We'll compute a boost factor based on how many hits in the trade have positive weights.
        let boost = 1.0;
        if (t.hits && t.hits.length > 0) {
          let positive = 0, negative = 0;
          for (const hit of t.hits) {
            // Check if any key matches (we'll do a crude matching)
            for (const key of weightKeys) {
              if (hit.toLowerCase().includes(key.toLowerCase())) {
                if (weights[key] > 0) positive++;
                else if (weights[key] < 0) negative++;
              }
            }
          }
          boost = 1 + (positive - negative) * 0.05;
        }
        // Also include quality threshold: if trade's score >= minQualityScore, then we take it
        // We'll approximate: if (t.score >= quality.minQualityScore) then include, else skip.
        // For simplicity, we include all but weight profit by (score / quality.minQualityScore)
        const scoreFactor = Math.min(1.5, Math.max(0.5, t.score / quality.minQualityScore));
        const pnl = t.pnl || 0;
        const adjustedPnl = pnl * boost * scoreFactor;
        if (t.outcome === 'win') wins++;
        else losses++;
        totalProfit += adjustedPnl;
      }

      const totalTrades = wins + losses;
      if (totalTrades === 0) return -1000;
      const winRate = wins / totalTrades;
      const avgProfit = totalProfit / totalTrades;
      const expectancy = winRate * avgProfit + (1 - winRate) * (totalProfit < 0 ? totalProfit / totalTrades : 0);
      // Fitness: combine winRate and expectancy
      let fitness = 0;
      if (this.fitnessMetric === 'winrate') fitness = winRate;
      else if (this.fitnessMetric === 'expectancy') fitness = expectancy;
      else { // sharpe: simplistic, use avgProfit / std (we don't have std, use avgProfit * winRate)
        fitness = avgProfit * winRate;
      }
      // Penalize if too few trades taken (quality threshold too high)
      const tradeCount = totalTrades;
      if (tradeCount < 10) fitness *= 0.5;
      return fitness;
    };

    // Evolution loop
    let bestFitness = -Infinity;
    let bestGenes = null;
    for (let gen = 0; gen < this.generations; gen++) {
      // Evaluate fitness
      const fitnesses = population.map(genes => evaluate(genes));
      // Find best
      for (let i = 0; i < population.length; i++) {
        if (fitnesses[i] > bestFitness) {
          bestFitness = fitnesses[i];
          bestGenes = { ...population[i] };
        }
      }

      // Selection: tournament
      const newPopulation = [];
      // Elitism
      const sorted = population.map((g, idx) => ({ genes: g, fitness: fitnesses[idx] }))
        .sort((a, b) => b.fitness - a.fitness);
      for (let e = 0; e < this.eliteCount && e < sorted.length; e++) {
        newPopulation.push({ ...sorted[e].genes });
      }

      // Fill rest with crossover and mutation
      while (newPopulation.length < this.populationSize) {
        // Tournament selection
        const parent1 = this.tournamentSelect(sorted, 3);
        const parent2 = this.tournamentSelect(sorted, 3);
        let child;
        if (Math.random() < this.crossoverRate) {
          child = this.crossover(parent1, parent2);
        } else {
          child = { ...parent1 };
        }
        // Mutation
        if (Math.random() < this.mutationRate) {
          child = this.mutate(child, finalBounds);
        }
        newPopulation.push(child);
      }
      population = newPopulation;
    }

    // Return best genes as optimized weights and quality
    const bestWeights = {};
    for (const key of weightKeys) {
      bestWeights[key] = bestGenes[key];
    }
    const bestQuality = { ...currentQuality, minQualityScore: bestGenes.minQualityScore };

    // Save to file
    try {
      fs.writeFileSync(OPTIMIZATION_FILE, JSON.stringify({ weights: bestWeights, quality: bestQuality, fitness: bestFitness }, null, 2));
    } catch(e) {}

    return { weights: bestWeights, quality: bestQuality };
  }

  tournamentSelect(sorted, k) {
    let best = null;
    let bestFit = -Infinity;
    for (let i = 0; i < k; i++) {
      const idx = Math.floor(Math.random() * sorted.length);
      if (sorted[idx].fitness > bestFit) {
        bestFit = sorted[idx].fitness;
        best = sorted[idx].genes;
      }
    }
    return best;
  }

  crossover(parent1, parent2) {
    const child = {};
    const keys = Object.keys(parent1);
    for (const key of keys) {
      if (Math.random() < 0.5) {
        child[key] = parent1[key];
      } else {
        child[key] = parent2[key];
      }
    }
    return child;
  }

  mutate(genes, bounds) {
    const mutated = { ...genes };
    const keys = Object.keys(genes);
    const key = keys[Math.floor(Math.random() * keys.length)];
    const range = (bounds[key]?.max || 3) - (bounds[key]?.min || -2);
    const delta = (Math.random() - 0.5) * range * 0.3;
    let value = genes[key] + delta;
    value = Math.max(bounds[key]?.min || -2, Math.min(bounds[key]?.max || 3, value));
    mutated[key] = value;
    return mutated;
  }
}

/**
 * Run genetic optimization if enough trades and time elapsed.
 * @param {Array} trades - journal trades.
 * @param {Object} currentWeights - CONFLUENCE_WEIGHTS.
 * @param {Object} currentQuality - QUALITY_CONFIG.
 * @param {number} lastOptimization - timestamp of last run.
 * @param {number} intervalHours - how often to run.
 * @returns {Object} { optimized: boolean, weights, quality }
 */
function runGeneticOptimization(trades, currentWeights, currentQuality, lastOptimization, intervalHours = 24) {
  const now = Date.now();
  if (now - lastOptimization < intervalHours * 60 * 60 * 1000) {
    return { optimized: false, weights: currentWeights, quality: currentQuality };
  }

  const optimizer = new GeneticOptimizer({ fitnessMetric: 'sharpe' });
  const result = optimizer.optimize(trades, currentWeights, currentQuality);
  return { optimized: true, weights: result.weights, quality: result.quality };
}

module.exports = { runGeneticOptimization, GeneticOptimizer };
