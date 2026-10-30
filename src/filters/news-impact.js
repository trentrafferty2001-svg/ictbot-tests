// src/filters/news-impact.js
function newsImpactFilter(events, impactThreshold = 'High') {
  const now = Date.now();
  const before = 30 * 60 * 1000;
  const after = 15 * 60 * 1000;
  for (const e of events) {
    try {
      const t = new Date(e.date).getTime();
      if (isNaN(t)) continue;
      const impact = e.impact || 'Medium';
      if (impact === impactThreshold || impactThreshold === 'all') {
        if (now >= t - before && now <= t + after) {
          const minutesUntil = Math.max(0, (t - now) / 60000);
          return { blocked: true, event: e.title || e.name, minutesUntil, impact };
        }
      }
    } catch (_) {}
  }
  return { blocked: false, minutesUntil: Infinity };
}

module.exports = { newsImpactFilter };
