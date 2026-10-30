// src/utils/safe-fetch.js
const logger = require('../logger');

const cache = {};
const cacheTime = {};
const requestLog = [];
const MAX_REQUESTS_PER_MINUTE = 20;
const MIN_DELAY_MS = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function safeYahooFetch(url, key, maxRetries = 3, ttl = 60 * 60 * 1000) {
    const now = Date.now();
    if (cache[key] && now - cacheTime[key] < ttl) {
        return cache[key];
    }

    const oneMinuteAgo = now - 60000;
    const recent = requestLog.filter(t => t > oneMinuteAgo);
    if (recent.length >= MAX_REQUESTS_PER_MINUTE) {
        const waitTime = 60000 - (now - recent[0]) + 1000;
        logger.warn(`[safeFetch] Rate limit reached for ${key}, waiting ${waitTime}ms`);
        await sleep(waitTime);
    }

    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (requestLog.length > 0) {
                const lastRequest = requestLog[requestLog.length - 1];
                const elapsed = now - lastRequest;
                if (elapsed < MIN_DELAY_MS) {
                    await sleep(MIN_DELAY_MS - elapsed);
                }
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const resp = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });
            clearTimeout(timeout);

            if (resp.status === 429) {
                const wait = Math.min(30000, Math.pow(2, attempt) * 2000);
                logger.warn(`[safeFetch] 429 for ${key}, backing off ${wait}ms (attempt ${attempt+1}/${maxRetries})`);
                await sleep(wait);
                continue;
            }
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const data = await resp.json();
            cache[key] = data;
            cacheTime[key] = now;
            requestLog.push(now);
            if (requestLog.length > 100) requestLog.shift();
            return data;
        } catch (err) {
            lastError = err;
            if (err.name === 'AbortError') {
                logger.warn(`[safeFetch] Timeout for ${key} (attempt ${attempt+1}/${maxRetries})`);
            } else {
                logger.warn(`[safeFetch] Error for ${key}: ${err.message} (attempt ${attempt+1}/${maxRetries})`);
            }
            if (attempt < maxRetries - 1) {
                await sleep(2000);
            }
        }
    }
    logger.warn(`[safeFetch] Failed for ${key} after ${maxRetries} attempts: ${lastError?.message || 'unknown'}`);
    return null;
}

module.exports = { safeYahooFetch };
