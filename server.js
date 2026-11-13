// UT Log dev server: serves /public and a mock of the auth + tracking API the
// marketing page talks to. Zero dependencies; all state is in memory.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./server/store');

// Optional secrets file. See .env.example.
try { if (process.loadEnvFile) process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) { /* no .env yet: demo mode */ }

const PORT = Number(process.env.PORT) || 3000;
const DEV = process.env.NODE_ENV !== 'production';
const ROOT = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

// ---- in-memory stores ----------------------------------------------------
const otps = new Map();        // mobile -> { code, expires, attempts }
const otpSends = new Map();    // mobile -> [timestamps]
const users = store.track('users', new Map());       // key (mobile or email) -> user
const sessions = store.track('sessions', new Map());    // token -> user key
const resetOtps = new Map();   // email -> { code, expires, confirmed }
const twofaChallenges = new Map(); // challenge id -> { key, code, expires, attempts }

const OTP_TTL_MS = 5 * 60 * 1000;
const SEND_WINDOW_MS = 10 * 60 * 1000;
const SEND_LIMIT = 5;
const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sixDigits = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
const newToken = () => crypto.randomBytes(24).toString('hex');

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') };
}
function checkPassword(pw, { salt, hash }) {
  const h = crypto.scryptSync(pw, salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

function issueSession(key) {
  const token = newToken();
  sessions.set(token, key);
  return token;
}

// ---- tracking mock: deterministic timeline from the id -------------------
const STAGES = ['Order placed', 'Picked up', 'In transit', 'Reached destination hub', 'Out for delivery', 'Delivered'];
const CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Jaipur'];
function trackingFor(id) {
  const seed = crypto.createHash('sha256').update(id).digest();
  const reached = 1 + (seed[0] % STAGES.length);
  const from = CITIES[seed[1] % CITIES.length];
  const to = CITIES[(seed[1] + 1 + (seed[2] % (CITIES.length - 1))) % CITIES.length];
  const start = Date.now() - reached * 9 * 3600 * 1000;
  return {
    id, origin: from, destination: to,
    status: STAGES[reached - 1],
    eta: new Date(start + 4 * 86400 * 1000).toISOString().slice(0, 10),
    events: STAGES.slice(0, reached).map((label, i) => ({
      label, at: new Date(start + i * 9 * 3600 * 1000).toISOString(),
      location: i < 2 ? from : i >= 3 ? to : 'Sorting centre',
    })).reverse(),
  };
}

// ---- helpers -------------------------------------------------------------
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', () => { req.rawBody = raw; try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
// Session tokens come from login; "utk_" tokens are API keys created in
// Settings → Security and resolve to the account owner.
let apiKeyResolver = null;
function authUser(req) {
  const m = /^Bearer (\w+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const key = sessions.get(m[1]);
  if (key) return users.get(key) || null;
  return m[1].startsWith('utk_') && apiKeyResolver ? apiKeyResolver(m[1]) : null;
}

// ---- API routes ----------------------------------------------------------
const routes = {
  'POST /v1/auth/onboard/request': async (req, res, body) => {
    const mobile = String(body.mobile || '');
    if (!MOBILE_RE.test(mobile)) return send(res, 400, { message: 'Invalid mobile number' });
    const now = Date.now();
    const recent = (otpSends.get(mobile) || []).filter((t) => now - t < SEND_WINDOW_MS);
    if (recent.length >= SEND_LIMIT) return send(res, 429, { message: 'Too many OTP requests' });
    otpSends.set(mobile, [...recent, now]);
    const code = sixDigits();
    otps.set(mobile, { code, expires: now + OTP_TTL_MS, attempts: 0 });
    console.log(`[otp] ${mobile} -> ${code}`);
    send(res, 200, { success: true, ...(DEV && { dev_otp: code }) });
  },

  'POST /v1/auth/onboard/validate': async (req, res, body) => {
    const mobile = String(body.mobile || '');
    const entry = otps.get(mobile);
    if (!entry || entry.expires < Date.now()) return send(res, 400, { message: 'OTP expired' });
    if (++entry.attempts > 5) { otps.delete(mobile); return send(res, 429, { message: 'Too many attempts' }); }
    if (String(body.otp) !== entry.code) return send(res, 400, { message: 'Incorrect OTP' });
    otps.delete(mobile);
    if (!users.has(mobile)) {
      users.set(mobile, {
        key: mobile, mobile, name: '', email: '', created: new Date().toISOString(),
        attribution: {
          utm_source: body.utm_source, utm_campaign: body.utm_campaign, utm_medium: body.utm_medium,
          utm_content: body.utm_content, utm_term: body.utm_term,
        },
      });
    }
    const user = users.get(mobile);
    send(res, 200, { token: issueSession(mobile), is_new: !user.name });
  },

  'POST /v1/auth/email/check': async (req, res, body) => {
    const email = String(body.email || '').toLowerCase();
    if (!EMAIL_RE.test(email)) return send(res, 400, { message: 'Invalid email' });
    send(res, 200, { exists: users.has(email) });
  },

  'POST /v1/auth/email/login': async (req, res, body) => {
    const user = users.get(String(body.email || '').toLowerCase());
    if (!user || !user.password || !checkPassword(String(body.password || ''), user.password)) {
      return send(res, 401, { message: 'Incorrect email or password' });
    }
    if (user.twofa) {
      const challenge = newToken();
      const code = sixDigits();
      twofaChallenges.set(challenge, { key: user.key, code, expires: Date.now() + OTP_TTL_MS, attempts: 0 });
      console.log(`[2fa] ${user.key} -> ${code}`);
      return send(res, 200, { twofa_required: true, challenge_id: challenge, ...(DEV && { dev_otp: code }) });
    }
    send(res, 200, { token: issueSession(user.key) });
  },

  'POST /v1/auth/email/2fa': async (req, res, body) => {
    const c = twofaChallenges.get(String(body.challenge_id || ''));
    if (!c || c.expires < Date.now()) return send(res, 400, { message: 'Code expired. Log in again.' });
    if (++c.attempts > 5) { twofaChallenges.delete(body.challenge_id); return send(res, 429, { message: 'Too many attempts' }); }
    if (String(body.otp) !== c.code) return send(res, 400, { message: 'That code is incorrect.' });
    twofaChallenges.delete(body.challenge_id);
    send(res, 200, { token: issueSession(c.key) });
  },

  'POST /v1/auth/email/signup': async (req, res, body) => {
    const email = String(body.email || '').toLowerCase();
    const password = String(body.password || '');
    if (!EMAIL_RE.test(email)) return send(res, 400, { message: 'Invalid email' });
    if (password.length < 8) return send(res, 400, { message: 'Password must be at least 8 characters' });
    if (users.has(email)) return send(res, 409, { message: 'Account already exists' });
    users.set(email, { key: email, email, mobile: '', name: '', password: hashPassword(password), created: new Date().toISOString() });
    send(res, 200, { token: issueSession(email) });
  },

  'POST /v1/users/reset/otp/send': async (req, res, body) => {
    const email = String(body.data || '').toLowerCase();
    if (!users.has(email)) return send(res, 404, { message: 'No account for that email' });
    const code = sixDigits();
    resetOtps.set(email, { code, expires: Date.now() + OTP_TTL_MS, confirmed: false });
    console.log(`[reset-otp] ${email} -> ${code}`);
    send(res, 200, { success: true, ...(DEV && { dev_otp: code }) });
  },

  'POST /v1/users/reset/otp/confirm': async (req, res, body) => {
    const email = String(body.data || '').toLowerCase();
    const entry = resetOtps.get(email);
    const ok = entry && entry.expires > Date.now() && String(body.otp).padStart(6, '0') === entry.code;
    if (ok) entry.confirmed = true;
    send(res, 200, { success: !!ok });
  },

  'POST /v1/users/reset/password': async (req, res, body) => {
    const email = String(body.data || '').toLowerCase();
    const entry = resetOtps.get(email);
    const password = String(body.password || '');
    if (!entry || !entry.confirmed || entry.expires < Date.now()) return send(res, 400, { message: 'Reset session expired' });
    if (password.length < 8) return send(res, 400, { message: 'Password must be at least 8 characters' });
    users.get(email).password = hashPassword(password);
    resetOtps.delete(email);
    send(res, 200, { success: true });
  },

  'POST /v1/me/password': async (req, res, body) => {
    const user = authUser(req);
    if (!user) return send(res, 401, { message: 'Unauthorised' });
    if (!user.password) return send(res, 400, { message: 'Your account signs in with a one-time code, so it has no password.' });
    if (!checkPassword(String(body.current || ''), user.password)) return send(res, 400, { message: 'Your current password is incorrect.' });
    const next = String(body.next || '');
    if (next.length < 8 || !/\d/.test(next)) return send(res, 400, { message: 'Use at least 8 characters, including a number.' });
    if (checkPassword(next, user.password)) return send(res, 400, { message: 'Choose a password you have not used here.' });
    user.password = hashPassword(next);
    send(res, 200, { success: true });
  },
  'GET /v1/me': async (req, res) => {
    const user = authUser(req);
    if (!user) return send(res, 401, { message: 'Unauthorised' });
    const { password, ...safe } = user;
    send(res, 200, safe);
  },

  'POST /v1/me': async (req, res, body) => {
    const user = authUser(req);
    if (!user) return send(res, 401, { message: 'Unauthorised' });
    if (body.name != null) user.name = String(body.name).slice(0, 80);
    if (body.email != null && EMAIL_RE.test(body.email)) user.email = String(body.email).toLowerCase();
    const { password, ...safe } = user;
    send(res, 200, safe);
  },

  'GET /v1/tracking': async (req, res, body, url) => {
    const awb = (url.searchParams.get('awb') || '').trim();
    const orderId = (url.searchParams.get('order_id') || '').trim();
    const phone = (url.searchParams.get('phone') || '').trim();
    if (awb) {
      if (!/^[A-Za-z0-9]{6,20}$/.test(awb)) return send(res, 400, { message: 'Enter a valid AWB number' });
      return send(res, 200, trackingFor('AWB' + awb.toUpperCase()));
    }
    if (!orderId || !MOBILE_RE.test(phone)) return send(res, 400, { message: 'Enter the order ID and the 10-digit phone number' });
    send(res, 200, trackingFor('ORD' + orderId + phone));
  },
};

const sellerCtx = require('./server/seller-api')(routes, { send, authUser, users });
require('./server/logistics-api')(routes, { send, authUser }, sellerCtx);
require('./server/account-api')(routes, { send, sessions, users, setApiKeyResolver: (fn) => { apiKeyResolver = fn; } }, sellerCtx);
require('./server/ops-api')(routes, { send, users }, sellerCtx);
const bookingCtx = require('./server/booking-api')(routes, { send, authUser }, sellerCtx);
// Partner (driver) app: sign-up, trips and payouts. Tracked data is restored by store.load() below.
require('./server/partner-api')(routes, { send, authUser }, bookingCtx);
const hubCtx = require('./server/hub-api')(routes, { send }, sellerCtx, bookingCtx);
const bizCtx = require('./server/business-api')(routes, { send }, sellerCtx, bookingCtx, hubCtx);
require('./server/orders-api')(routes, { send, users }, sellerCtx, bookingCtx, hubCtx, bizCtx);
require('./server/parity-api')(routes, { send, users }, sellerCtx, bookingCtx, hubCtx, bizCtx);
routes['GET /healthz'] = async (req, res) => send(res, 200, { status: 'ok', uptime_s: Math.round(process.uptime()), accounts: users.size });
if (store.load()) console.log(`Restored saved data from ${store.file}`);
store.start();

// ---- static files --------------------------------------------------------
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (['/app', '/track', '/returns', '/pricing', '/book', '/partners'].includes(rel)) { res.writeHead(301, { Location: rel + '/' + url.search }); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// Light per-address limit on writes, so one client cannot flood the API.
const writes = new Map();
setInterval(() => writes.clear(), 60000).unref();

http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.method === 'POST') {
    const ip = req.socket.remoteAddress; const n = (writes.get(ip) || 0) + 1; writes.set(ip, n);
    if (n > 600) return send(res, 429, { message: 'Too many requests. Try again in a minute.' });
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return serveStatic(req, res, url);
  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    await route(req, res, body, url);
  } catch (err) {
    console.error(err);
    send(res, 500, { message: 'Server error' });
  }
}).listen(PORT, () => console.log(`UT Log running at http://localhost:${PORT}`));
