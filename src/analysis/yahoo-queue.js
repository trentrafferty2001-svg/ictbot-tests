// src/analysis/yahoo-queue.js
//
// Shared request queue for query1.finance.yahoo.com.
//
// Problem this fixes: ETFFlows, IntermarketAdvanced, OptionsPositioning, and
// EconomicCalendar (indirectly, via its own host) each retry independently on
// a 429. On a cold start (fresh deploy — every in-memory cache is empty at
// once), all of them fire their first-ever fetch burst within the same few
// seconds, converging on the same endpoint. Each one backing off and
// retrying just adds more concurrent requests to the same wall, which is
// what produced the escalating "Rate limited ... waiting Nms" cascade across
// multiple modules simultaneously.
//
// Fix: every Yahoo Finance call in the app goes through this single queue.
// The queue guarantees a minimum spacing between ANY two requests, no matter
// which module issued them, and centralizes retry/backoff so a 429 slows
// down the whole queue rather than prompting four independent retry loops.
//
// Usage (replaces a raw `fetch(url)` call to Yahoo):
//   const { yahooFetch } = require('./yahoo-queue');
//   const resp = await yahooFetch(url);
//   // resp is a standard fetch Response — call .json() etc. as before.

const logger = require('../logger');

const MIN_SPACING_MS = 1200;   // floor between any two outbound requests
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 15000;

class YahooQueue {
    constructor() {
        this._queue = Promise.resolve();
        this._lastRequestAt = 0;
        // When a 429 is hit, every subsequent request waits until this
        // timestamp before even attempting a fetch — this is what lets one
        // module's rate limit protect the others instead of only itself.
        this._cooldownUntil = 0;
        // Tracks consecutive 429s across the WHOLE queue (not just one
        // call's own retry loop), so the backoff actually escalates across
        // a multi-module cascade instead of resetting to the base delay
        // every time a different symbol/module happens to be next in line.
        // Resets to 0 on any non-429 response.
        this._consecutive429s = 0;
    }

    async _waitForSlot() {
        const now = Date.now();
        const earliestBySpacing = this._lastRequestAt + MIN_SPACING_MS;
        const earliest = Math.max(earliestBySpacing, this._cooldownUntil, now);
        const wait = earliest - now;
        if (wait > 0) {
            await new Promise(r => setTimeout(r, wait));
        }
        this._lastRequestAt = Date.now();
    }

    async _fetchOnce(url, label) {
        await this._waitForSlot();
        const resp = await fetch(url);
        if (resp.status === 429) {
            this._consecutive429s++;
            // Exponential backoff, capped at MAX_BACKOFF_MS: 2s, 4s, 8s, 15s, 15s...
            const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, this._consecutive429s - 1), MAX_BACKOFF_MS);
            this._cooldownUntil = Date.now() + backoff;
            logger.warn(`[YahooQueue] 429 for ${label || url}, cooling down queue ${backoff}ms (consecutive: ${this._consecutive429s})`);
        } else {
            this._consecutive429s = 0;
        }
        return resp;
    }

    // Serializes this call behind whatever is already queued, so two
    // concurrent callers never both slip through _waitForSlot at once.
    async yahooFetch(url, label) {
        const task = this._queue.then(() => this._runWithRetries(url, label));
        // Keep the chain alive even if this call ultimately rejects, so the
        // next queued caller isn't stuck behind a rejected promise forever.
        this._queue = task.catch(() => {});
        return task;
    }

    async _runWithRetries(url, label) {
        let lastErr = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const resp = await this._fetchOnce(url, label);
                if (resp.status === 429) {
                    lastErr = new Error('HTTP 429');
                    continue; // cooldown already set in _fetchOnce; loop respects it via _waitForSlot
                }
                return resp;
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error(`[YahooQueue] Failed after ${MAX_RETRIES} attempts: ${label || url}`);
    }
}

// Single shared instance — this is the point of the module. Every caller
// requiring this file gets the same queue.
const sharedQueue = new YahooQueue();

module.exports = {
    yahooFetch: (url, label) => sharedQueue.yahooFetch(url, label),
    _sharedQueue: sharedQueue // exposed for tests / diagnostics only
};
