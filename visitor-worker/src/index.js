// Visitor counter for tasnuba-yasmin.github.io.
// POST /hit records one visit (date, country, city) using Cloudflare's own geolocation.
// GET /stats returns daily counts with a country/city breakdown for the last year.
// No IP addresses or other identifying data are stored.

const ALLOWED_ORIGINS = [
  'https://tasnuba-yasmin.github.io',
  'http://localhost:8765',
];

const DAYS = 371; // 53 weeks, enough to fill the grid

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(request, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request), ...extra },
  });
}

// Dates are kept in Dhaka time so a "day" matches the site's own clock.
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
}

function looksLikeBot(request) {
  const ua = (request.headers.get('User-Agent') || '').toLowerCase();
  return !ua || /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor/.test(ua);
}

async function recordHit(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!ALLOWED_ORIGINS.includes(origin) || looksLikeBot(request)) {
    return json(request, { ok: false }, 202);
  }
  const cf = request.cf || {};
  const country = (cf.country || 'XX').slice(0, 2);
  const city = (cf.city || '').slice(0, 80);
  await env.DB.prepare(
    `INSERT INTO visits (day, country, city, count) VALUES (?1, ?2, ?3, 1)
     ON CONFLICT (day, country, city) DO UPDATE SET count = count + 1`
  ).bind(today(), country, city).run();
  return json(request, { ok: true });
}

async function stats(request, env) {
  const since = new Date(Date.now() - DAYS * 86400000);
  const sinceDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(since);
  const { results } = await env.DB.prepare(
    'SELECT day, country, city, count FROM visits WHERE day >= ?1 ORDER BY day, count DESC'
  ).bind(sinceDay).all();

  const days = {};
  let total = 0;
  for (const r of results) {
    const d = days[r.day] || (days[r.day] = { total: 0, places: [] });
    d.total += r.count;
    d.places.push({ country: r.country, city: r.city, count: r.count });
    total += r.count;
  }
  return json(request, { today: today(), total, days }, 200, { 'Cache-Control': 'public, max-age=60' });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (pathname === '/hit' && request.method === 'POST') return recordHit(request, env);
    if (pathname === '/stats' && request.method === 'GET') return stats(request, env);
    return json(request, { error: 'not found' }, 404);
  },
};
