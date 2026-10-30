// Vercel Serverless Function — MetaAPI Proxy
// Proxies MetaAPI requests server-side to avoid CORS issues

const https = require('https');
const http  = require('http');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, auth-token');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let body = '';
  await new Promise((resolve) => {
    req.on('data', chunk => body += chunk);
    req.on('end', resolve);
  });

  let p = {};
  try { p = JSON.parse(body); } catch(e) {}

  const targetUrl = p.url;
  const token     = p.token;
  const method    = (p.method || 'GET').toUpperCase();
  const tradeBody = p.tradeBody;

  if (!targetUrl) { res.status(400).json({ error: 'Missing url' }); return; }
  if (!targetUrl.includes('agiliumtrade.ai')) { res.status(403).json({ error: 'Only agiliumtrade.ai URLs allowed' }); return; }
  if (!token) { res.status(400).json({ error: 'Missing token' }); return; }

  const bodyStr = (method !== 'GET' && tradeBody) ? JSON.stringify(tradeBody) : '';

  const reqHeaders = {
    'auth-token':   token,
    'Content-Type': 'application/json',
    'Accept':       'application/json',
    'User-Agent':   'ICTGoldBot/7.0'
  };
  if (bodyStr) reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);

  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(targetUrl); }
    catch(e) { res.status(400).json({ error: 'Invalid URL' }); resolve(); return; }

    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + parsed.search,
      method:   method,
      headers:  reqHeaders,
      timeout:  14000
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode).setHeader('Content-Type', 'application/json').end(data || '{}');
        resolve();
      });
    });

    proxyReq.setTimeout(14000, () => {
      proxyReq.destroy();
      res.status(504).json({ error: 'MetaAPI timeout' });
      resolve();
    });

    proxyReq.on('error', (e) => {
      res.status(500).json({ error: e.message });
      resolve();
    });

    if (bodyStr) proxyReq.write(bodyStr);
    proxyReq.end();
  });
};
