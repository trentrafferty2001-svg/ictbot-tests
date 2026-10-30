// src/ml/xgboost-model.js
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

// This is a simplified version – in production, use the xgboost npm package.
// Since xgboost requires native bindings, we'll use a lightweight fallback.
class XGBoostModel {
    constructor() {
        this.model = null;
        this.features = [
            'score', 'adx', 'atrRatio', 'sessionScore', 'dxyAlign',
            'hour', 'dayOfWeek', 'hasMSS', 'hasFVG', 'hasOB',
            'turtleSoup', 'liquiditySweep', 'macroTrend', 'regime'
        ];
        this.file = path.join('/tmp', 'xgboost_model.json');
        this.load();
        this.trained = false;
    }

    load() {
        try {
            if (fs.existsSync(this.file)) {
                this.model = JSON.parse(fs.readFileSync(this.file, 'utf8'));
                this.trained = true;
                logger.info('[XGBoost] Model loaded');
            }
        } catch (e) {
            logger.warn('[XGBoost] No model found, using default');
        }
    }

    save() {
        try {
            fs.writeFileSync(this.file, JSON.stringify(this.model || {}, null, 2));
        } catch (e) {}
    }

    // Simple tree ensemble simulation
    // Each tree: array of nodes with { feature, threshold, value }
    // For production, use actual XGBoost via Python bridge or npm package
    _predictTree(features, tree) {
        let node = 0;
        while (true) {
            const n = tree[node];
            if (!n || n.isLeaf) return n?.value || 0;
            const val = features[n.feature] || 0;
            if (val <= n.threshold) {
                node = n.left;
            } else {
                node = n.right;
            }
            if (node === undefined || node === null) return 0;
        }
    }

    predict(features) {
        if (!this.trained || !this.model) {
            return this._fallbackPredict(features);
        }
        let score = this.model.bias || 0;
        for (const tree of this.model.trees || []) {
            score += this._predictTree(features, tree);
        }
        const prob = 1 / (1 + Math.exp(-score));
        return { probability: prob, confidence: 0.5 + Math.abs(prob - 0.5) };
    }

    _fallbackPredict(features) {
        // Simple linear fallback
        let score = -0.5;
        score += (features.score || 5) * 0.08;
        score += (features.adx || 20) * 0.005;
        score += (features.atrRatio || 1) * -0.05;
        score += (features.dxyAlign || 0) * 0.03;
        if (features.hasMSS) score += 0.2;
        if (features.hasFVG) score += 0.15;
        if (features.turtleSoup) score += 0.1;
        const prob = 1 / (1 + Math.exp(-score));
        return { probability: prob, confidence: 0.5 + Math.abs(prob - 0.5) * 0.5 };
    }

    train(trades) {
        // In production, this would train an actual XGBoost model.
        // For this implementation, we simulate by building a simple decision tree ensemble.
        logger.info('[XGBoost] Training on', trades.length, 'trades');
        if (trades.length < 30) {
            logger.warn('[XGBoost] Not enough trades to train');
            return false;
        }
        // Simple dummy training – just store win rates per feature
        const model = { trees: [], bias: 0 };
        const features = this.features;
        const closed = trades.filter(t => t.outcome !== null);
        const wins = closed.filter(t => t.outcome === 'win').length;
        const overall = closed.length > 0 ? wins / closed.length : 0.5;
        model.bias = Math.log(overall / (1 - overall || 0.001));
        // Build simple trees for each feature
        for (const f of features) {
            const tree = { nodes: [] };
            // Find threshold that splits best
            const values = closed.map(t => t[f] || 0);
            const thresholds = [...new Set(values)].sort((a,b) => a-b);
            let bestSplit = 0, bestGain = -Infinity;
            for (const th of thresholds.slice(1, -1)) {
                const left = closed.filter(t => (t[f] || 0) <= th);
                const right = closed.filter(t => (t[f] || 0) > th);
                if (left.length < 3 || right.length < 3) continue;
                const lw = left.filter(t => t.outcome === 'win').length / left.length;
                const rw = right.filter(t => t.outcome === 'win').length / right.length;
                const gain = Math.abs(lw - rw);
                if (gain > bestGain) { bestGain = gain; bestSplit = th; }
            }
            if (bestGain > 0.05) {
                const left = closed.filter(t => (t[f] || 0) <= bestSplit);
                const right = closed.filter(t => (t[f] || 0) > bestSplit);
                const lw = left.filter(t => t.outcome === 'win').length / left.length;
                const rw = right.filter(t => t.outcome === 'win').length / right.length;
                // Simple tree: root split, then two leaves
                const treeObj = {
                    nodes: [
                        { feature: f, threshold: bestSplit, left: 1, right: 2 },
                        { isLeaf: true, value: Math.log(lw / (1 - lw || 0.001)) * 0.5 },
                        { isLeaf: true, value: Math.log(rw / (1 - rw || 0.001)) * 0.5 }
                    ]
                };
                model.trees.push(treeObj);
            }
        }
        this.model = model;
        this.trained = true;
        this.save();
        logger.info('[XGBoost] Training complete');
        return true;
    }

    async getRecommendation(analysis) {
        const features = this.extractFeatures(analysis);
        const result = this.predict(features);
        return {
            probability: result.probability,
            confidence: result.confidence,
            features,
            description: `XGBoost: ${(result.probability*100).toFixed(0)}% win prob`
        };
    }

    extractFeatures(analysis) {
        const sessionMap = { london: 1, ny_open: 1.2, ny: 0.8, ny_close: 0.5, tokyo: 0.5, off_hours: 0.2 };
        return {
            score: analysis.score || 5,
            adx: analysis.adxData?.adx || 20,
            atrRatio: analysis.regimeAtrRatio || 1,
            sessionScore: sessionMap[analysis.session?.session] || 0.5,
            dxyAlign: analysis.dxyTrend === 'bullish' ? 1 : analysis.dxyTrend === 'bearish' ? -1 : 0,
            hour: new Date().getUTCHours() / 24,
            dayOfWeek: new Date().getUTCDay() / 7,
            hasMSS: analysis.mss?.dir !== 'neutral' ? 1 : 0,
            hasFVG: analysis.fvgs?.length > 0 ? 1 : 0,
            hasOB: analysis.obs?.length > 0 ? 1 : 0,
            turtleSoup: analysis.turtleSoup && analysis.turtleSoup.pattern !== 'none' ? 1 : 0,
            liquiditySweep: analysis.liquiditySweep && analysis.liquiditySweep.swept ? 1 : 0,
            macroTrend: analysis.macroTrend && analysis.macroTrend.confidence > 0.6 ? 1 : 0,
            regime: analysis.regime === 'trending' ? 1 : analysis.regime === 'ranging' ? 0 : 0.5
        };
    }
}

module.exports = { XGBoostModel };
