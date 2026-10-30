// ════════════════════════════════════════════════════════════════════════════
//  Authentication Middleware
//  Uses crypto.timingSafeEqual to prevent timing attacks
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

// Random per-process key used only to normalize both inputs to a fixed-length
// digest before comparing — not used for anything else, doesn't need to
// survive a restart.
const _compareKey = crypto.randomBytes(32);

function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || b.length === 0) return false;

  // HMAC both sides to the same fixed length (32 bytes) first. Comparing the
  // raw strings directly would let a length mismatch short-circuit before
  // ever reaching timingSafeEqual, which leaks the correct length over many
  // attempts. Digests are always the same size, so this path is now
  // constant-time regardless of whether the input length is right or wrong.
  const digestA = crypto.createHmac('sha256', _compareKey).update(a, 'utf8').digest();
  const digestB = crypto.createHmac('sha256', _compareKey).update(b, 'utf8').digest();

  return crypto.timingSafeEqual(digestA, digestB);
}

function getBotKey() {
  return process.env.BOT_SECRET_KEY || '';
}

function requireBotKey(req, res, next) {
  const botKey = getBotKey();
  
  if (!botKey) {
    return res.status(401).json({ 
      error: 'Bot key not configured. Set BOT_SECRET_KEY environment variable.' 
    });
  }
  
  const provided = req.headers['x-bot-key'] || req.query.key || '';
  
  if (!timingSafeCompare(provided, botKey)) {
    return res.status(401).json({ error: 'Unauthorized - Invalid bot key' });
  }
  
  next();
}

function getCorsOrigins() {
  if (process.env.NODE_ENV === 'production') {
    const origins = process.env.ALLOWED_ORIGINS;
    if (!origins) {
      console.warn('[auth] No ALLOWED_ORIGINS configured in production!');
      return [];
    }
    return origins.split(',').map(o => o.trim()).filter(Boolean);
  }
  return '*';
}

module.exports = {
  timingSafeCompare,
  requireBotKey,
  getBotKey,
  getCorsOrigins,
};
