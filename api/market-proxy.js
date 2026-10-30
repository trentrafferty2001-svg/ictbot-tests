// Vercel Serverless Function — Market Data Proxy
const https = require('https');
const http  = require('http');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const targetUrl = req.query.url;
  if (!targetUrl) { res.status(400).json({ error: 'Missing url' }); return; }

  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(targetUrl); }
    catch(e) { res.status(400).json({ error: 'Invalid URL' }); resolve(); return; }

    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'ICTGoldBot/7.0' },
      timeout: 10000
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode).setHeader('Content-Type', 'application/json').end(data || '{}');
        resolve();
      });
    });

    proxyReq.setTimeout(10000, () => {
      proxyReq.destroy();
      res.status(504).json({ error: 'Timeout' });
      resolve();
    });

    proxyReq.on('error', (e) => {
      res.status(500).json({ error: e.message });
      resolve();
    });

    proxyReq.end();
  });
};
