// ICT Gold Bot Pro — Service Worker v19
// STRATEGY:
//   index.html  → NETWORK FIRST (always get latest from Vercel)
//   JS/CSS/data → NETWORK FIRST with cache fallback
//   Icons/images → CACHE FIRST (truly static)
//   API calls   → NETWORK ONLY (never cache)

'use strict';
var CACHE_STATIC = 'ictbot-static-v1'; // icons/images — rarely change
var CACHE_APP    = 'ictbot-app-v19';   // app files — always fresh from network

// Static files that genuinely never change
var STATIC_ASSETS = ['/icon.png', '/badge.png'];

// ── Install — cache only truly static assets ─────────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting(); // activate immediately, don't wait for old tabs to close
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(function(c) { return c.addAll(STATIC_ASSETS); })
      .catch(function() {}) // never block install on cache failure
  );
});

// ── Activate — delete ALL old caches, claim all clients immediately ───────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE_STATIC && k !== CACHE_APP; })
          .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim(); // take control of all open tabs immediately
    })
  );
});

// ── Fetch strategy ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  var req = e.request;

  // ── 1. Never intercept API / external calls ─────────────────────────────────
  if (
    url.includes('netlify/functions') ||
    url.includes('api.gold-api')      ||
    url.includes('yahoo.com')         ||
    url.includes('agiliumtrade')      ||
    url.includes('onrender.com')      ||
    url.includes('tradingview.com')   ||
    url.includes('faireconomy.media') ||
    url.includes('telegram.org')
  ) {
    e.respondWith(
      fetch(req).catch(function() {
        return new Response('{"error":"offline"}', {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // ── 2. Static assets (icons) — cache first ──────────────────────────────────
  if (url.includes('/icon.png') || url.includes('/badge.png')) {
    e.respondWith(
      caches.match(req).then(function(cached) {
        return cached || fetch(req).then(function(r) {
          var clone = r.clone();
          caches.open(CACHE_STATIC).then(function(c) { c.put(req, clone); });
          return r;
        });
      })
    );
    return;
  }

  // ── 3. HTML, JS data files — NETWORK FIRST, cache as fallback ───────────────
  // This ensures every deployment is picked up immediately
  e.respondWith(
    fetch(req, { cache: 'no-cache' }) // always ask network for fresh version
      .then(function(r) {
        // Only cache successful responses
        if (r && r.status === 200) {
          var clone = r.clone();
          caches.open(CACHE_APP).then(function(c) { c.put(req, clone); });
        }
        return r;
      })
      .catch(function() {
        // Network failed — fall back to cache so app works offline
        return caches.match(req).then(function(cached) {
          return cached || new Response('App offline — please check connection.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});

// ── Background bot state ───────────────────────────────────────────────────────
var botConfig = null, bgTimer = null, lastPing = 0;
var RENDER_URL = 'https://ictgoldbot.onrender.com';

self.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.type === 'BOT_PING') {
    lastPing  = Date.now();
    botConfig = e.data.config;
    if (!bgTimer) bgTimer = setInterval(bgCheck, 35000);
  }
  if (e.data.type === 'BOT_STOP') {
    if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
    clearStatusNotif();
  }
});

async function bgCheck() {
  var clients = await self.clients.matchAll({ type: 'window' });
  var tabAlive = clients.length > 0 && (Date.now() - lastPing < 40000);
  if (tabAlive) { updateStatusNotif('🟢 Running', 'Tab active'); return; }
  if (!botConfig) return;
  try {
    var r = await fetch(RENDER_URL + '/api/market?url='
      + encodeURIComponent('https://api.gold-api.com/price/XAU'));
    if (r.ok) {
      var d     = await r.json();
      var price = parseFloat(d.price || 0).toFixed(2);
      updateStatusNotif('🟢 BG Active', 'GOLD ' + price);
      clients.forEach(function(c) { c.postMessage({ type: 'BG_PRICE', price: price }); });
    }
  } catch(err) {
    updateStatusNotif('🟡 BG Mode', 'Waiting…');
  }
}

function updateStatusNotif(status, detail) {
  self.registration.showNotification('⚡ ICT Gold Bot', {
    body: status + ' | ' + detail,
    icon: '/icon.png', badge: '/badge.png',
    tag: 'ictbot-status',
    renotify: false, silent: true, requireInteraction: false,
    actions: [{ action: 'open', title: '📊 Open' }, { action: 'stop', title: '⏹ Stop' }]
  }).catch(function() {});
}

function clearStatusNotif() {
  self.registration.getNotifications({ tag: 'ictbot-status' })
    .then(function(ns) { ns.forEach(function(n) { n.close(); }); })
    .catch(function() {});
}

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'open' || !e.action) {
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(function(clients) {
        if (clients.length) return clients[0].focus();
        return self.clients.openWindow('/');
      })
    );
  }
  if (e.action === 'stop') {
    self.clients.matchAll({ type: 'window' })
      .then(function(clients) {
        clients.forEach(function(c) { c.postMessage({ type: 'STOP_BOT' }); });
      });
    clearStatusNotif();
  }
});
