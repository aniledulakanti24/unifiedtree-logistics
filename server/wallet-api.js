// Wallet PIN and mobile number lookup (demo).
// The PIN is a 4-digit code asked before any wallet payment, like UPI or wallet apps do. It is stored
// as a salted hash, locks for 15 minutes after 5 wrong tries, and can be reset by the account owner.
'use strict';
const crypto = require('crypto');

const OPS = ['Jio', 'Airtel', 'Vi', 'BSNL'];
const CIRCLES = ['Karnataka', 'Maharashtra', 'Delhi NCR', 'Tamil Nadu', 'Telangana', 'Andhra Pradesh', 'Kerala', 'Gujarat', 'Rajasthan', 'West Bengal', 'Uttar Pradesh'];
const LOCK_MS = 15 * 60000;

module.exports = function register(routes, { send }, ctx, hubCtx) {
  const { iso, day } = ctx;
  const { hub, oops } = hubCtx;
  const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
  const valid = (pin) => /^\d{4}$/.test(String(pin || ''));
  const weak = (pin) => /^(\d)\1{3}$/.test(pin) || ['1234', '4321', '0123', '9876'].includes(pin);
  const state = (h) => {
    const p = h.walletPin;
    return { set: !!p, locked_until: p && p.locked_until > Date.now() ? iso(p.locked_until) : null };
  };

  routes['GET /v1/hub/wallet/pin'] = hub(({ res, h }) => send(res, 200, state(h)));

  // ---- wallet funding: default method, auto top-up and top-up history ---------------------------
  const FUNDING = ['upi', 'card', 'netbanking'];
  const monthOf = (t) => String(t).slice(0, 7);
  routes['GET /v1/hub/wallet/funding'] = hub(({ res, db, h }) => {
    const list = (h.instruments || []).map((x) => ({ ...x, can_fund: FUNDING.includes(x.type) }));
    const rule = h.wallet_rule;
    const ruleInst = list.find((x) => x.id === rule.instrument_id) || list.find((x) => x.is_default && x.can_fund) || null;
    const topups = h.topups || [];
    const mon = new Date().toISOString().slice(0, 7);
    const months = {};
    topups.filter((t) => t.status === 'SUCCESS').forEach((t) => { const m = monthOf(t.at); const r = months[m] || (months[m] = { month: m, count: 0, amount: 0, auto: 0 }); r.count++; r.amount += t.amount; if (t.kind === 'auto') r.auto += t.amount; });
    send(res, 200, {
      balance: db.balance, instruments: list, default_id: (list.find((x) => x.is_default) || {}).id || null,
      rule: { ...rule, instrument_id: ruleInst ? ruleInst.id : null, source: ruleInst ? ruleInst.label : rule.source, monthly_cap: rule.monthly_cap || 0,
        used_this_month: topups.filter((t) => t.kind === 'auto' && t.status === 'SUCCESS' && monthOf(t.at) === mon).reduce((s, t) => s + t.amount, 0) },
      topups: topups.slice(0, 60), months: Object.values(months).sort((a, b) => (a.month < b.month ? 1 : -1)).slice(0, 12),
    });
  });
  routes['POST /v1/hub/wallet/funding/rule'] = hub(({ res, body, h, user }) => {
    if (user.role && user.role !== 'owner') throw oops(403, 'Only the account owner can change auto top-up.');
    const rule = h.wallet_rule;
    const t = Math.round(Number(body.threshold ?? rule.threshold)); const m = Math.round(Number(body.amount ?? rule.amount));
    if (!(t >= 100 && t <= 100000)) throw oops(400, 'Set the low-balance limit between ₹100 and ₹1,00,000.');
    if (!(m >= 100 && m <= 100000)) throw oops(400, 'Top up between ₹100 and ₹1,00,000 at a time.');
    const cap = body.monthly_cap === '' || body.monthly_cap == null ? rule.monthly_cap || 0 : Math.round(Number(body.monthly_cap));
    if (!(cap === 0 || (cap >= m && cap <= 500000))) throw oops(400, 'The monthly limit must be at least one top-up, and at most ₹5,00,000. Use 0 for no limit.');
    let instId = rule.instrument_id || null;
    if (body.instrument_id != null) {
      const inst = (h.instruments || []).find((x) => x.id === body.instrument_id);
      if (!inst || !FUNDING.includes(inst.type)) throw oops(400, 'Pick a saved UPI ID, card or bank account to top up from.');
      instId = inst.id;
    }
    const enabled = body.enabled == null ? rule.enabled : !!body.enabled;
    if (enabled && !(h.instruments || []).some((x) => FUNDING.includes(x.type))) throw oops(400, 'Save a UPI ID, card or bank account first, so auto top-up has something to charge.');
    const inst = (h.instruments || []).find((x) => x.id === instId) || (h.instruments || []).find((x) => x.is_default && FUNDING.includes(x.type));
    Object.assign(rule, { enabled, threshold: t, amount: m, monthly_cap: cap, instrument_id: inst ? inst.id : null, source: inst ? inst.label : rule.source });
    send(res, 200, rule);
  });

  routes['POST /v1/hub/wallet/pin'] = hub(({ res, body, h, user }) => {
    if (user.role && user.role !== 'owner' && h.walletPin) throw oops(403, 'Only the account owner can change the wallet PIN.');
    const pin = String(body.pin || '');
    if (!valid(pin)) throw oops(400, 'Choose a 4-digit PIN.');
    if (weak(pin)) throw oops(400, 'That PIN is easy to guess. Avoid repeated or sequential digits.');
    if (h.walletPin && body.reset) {
      const rs = authOf(h).reset;
      if (!rs || rs.token !== body.reset_token || rs.expires < Date.now()) throw oops(403, 'Confirm with the code sent to your mobile before choosing a new PIN.', { needs_reset_code: true });
      authOf(h).reset = null;
    }
    if (h.walletPin && !body.reset) {
      const p = h.walletPin;
      if (!valid(body.current) || hashPin(body.current, p.salt) !== p.hash) throw oops(400, 'Your current PIN is not right.');
    }
    const salt = crypto.randomBytes(12).toString('hex');
    h.walletPin = { salt, hash: hashPin(pin, salt), fails: 0, locked_until: 0, set_at: iso(Date.now()) };
    send(res, 200, state(h));
  });

  routes['POST /v1/hub/wallet/pin/verify'] = hub(({ res, body, h }) => {
    const p = h.walletPin;
    if (!p) throw oops(400, 'Set a wallet PIN first.', { needs_pin: true });
    if (p.locked_until > Date.now()) throw oops(429, `Too many wrong tries. Try again after ${new Date(p.locked_until).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`, { locked: true });
    if (!valid(body.pin) || hashPin(body.pin, p.salt) !== p.hash) {
      p.fails = (p.fails || 0) + 1;
      if (p.fails >= 5) { p.fails = 0; p.locked_until = Date.now() + LOCK_MS; throw oops(429, 'Too many wrong tries. Your wallet PIN is locked for 15 minutes.', { locked: true }); }
      throw oops(400, `Wrong PIN. ${5 - p.fails} ${5 - p.fails === 1 ? 'try' : 'tries'} left.`, { left: 5 - p.fails });
    }
    p.fails = 0;
    send(res, 200, { ok: true });
  });

  // What a recharge app shows after you type a number: operator, circle and the current plan (demo data).
  routes['POST /v1/hub/recharge/lookup'] = hub(({ res, body, h }) => {
    const number = String(body.number || '');
    if (!/^[6-9]\d{9}$/.test(number)) throw oops(400, 'Enter a 10-digit mobile number.');
    const seed = crypto.createHash('md5').update(number).digest().readUInt32BE(0);
    const last = h.records.find((r) => r.kind === 'mobile' && r.sub === number && r.status !== 'CANCELLED');
    const operator = last ? last.provider : OPS[seed % OPS.length];
    const left = last ? Math.max(0, 28 - Math.floor((Date.now() - Date.parse(last.at)) / day)) : (seed % 30) - 3;
    send(res, 200, {
      number, operator, circle: CIRCLES[(seed >>> 3) % CIRCLES.length], type: 'Prepaid',
      current: left > 0 ? { plan: last ? last.plan || last.title : ['1.5 GB/day · 28 days', '2 GB/day · 28 days', '2 GB/day · 84 days'][seed % 3], ends: iso(Date.now() + left * day).slice(0, 10), days_left: left } : { plan: null, ends: null, days_left: 0, expired: true },
      last_recharge: last ? { amount: last.amount, at: last.at } : null,
    });
  });

  // ---- payment approval: the method each person chooses ------------------------------------------
  const DEV = process.env.NODE_ENV !== 'production' || process.env.UT_SANDBOX === '1';
  const METHODS = ['pin', 'password', 'otp', 'device'];
  const SKIP = [0, 100, 200, 500];
  const authOf = (h) => (h.walletAuth = h.walletAuth || { method: 'pin', skip_under: 0, password: null, device: null, otp: null, fails: 0, locked_until: 0 });
  const mask = (m) => (m ? `+91 •••••• ${String(m).slice(-4)}` : null);
  const lockedErr = (a) => oops(429, `Too many wrong tries. Try again after ${new Date(a.locked_until).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`, { locked: true });
  const authView = (h) => {
    const a = authOf(h);
    return { method: a.method, skip_under: a.skip_under, pin_set: !!h.walletPin, password_set: !!a.password, device: a.device && a.device.public_key ? { label: a.device.label, added: a.device.added } : null,
      mobile: mask(h.profile && h.profile.mobile), locked_until: Math.max(a.locked_until || 0, (h.walletPin && h.walletPin.locked_until) || 0) > Date.now() ? iso(Math.max(a.locked_until || 0, (h.walletPin && h.walletPin.locked_until) || 0)) : null };
  };
  routes['GET /v1/hub/wallet/auth'] = hub(({ res, h }) => send(res, 200, authView(h)));
  routes['POST /v1/hub/wallet/auth/method'] = hub(({ res, body, h, user }) => {
    if (user.role && user.role !== 'owner') throw oops(403, 'Only the account owner can change how payments are approved.');
    const a = authOf(h);
    if (body.method != null) {
      if (!METHODS.includes(body.method)) throw oops(400, 'Pick PIN, password, OTP or this device.');
      if (body.method === 'pin' && !h.walletPin) throw oops(400, 'Set your wallet PIN first.');
      if (body.method === 'password' && !a.password) throw oops(400, 'Set a payment password first.');
      if (body.method === 'device' && !a.device) throw oops(400, 'Add this device\'s fingerprint or face lock first.');
      if (body.method === 'otp' && !(h.profile && /^[6-9]\d{9}$/.test(h.profile.mobile || ''))) throw oops(400, 'Add your mobile number in My profile first.');
      a.method = body.method;
    }
    if (body.skip_under != null) { const v = Number(body.skip_under); if (!SKIP.includes(v)) throw oops(400, 'Pick one of the listed limits.'); a.skip_under = v; }
    send(res, 200, authView(h));
  });
  // A payment password: at least 6 characters with a letter and a number.
  routes['POST /v1/hub/wallet/password'] = hub(({ res, body, h, user }) => {
    if (user.role && user.role !== 'owner') throw oops(403, 'Only the account owner can change the payment password.');
    const a = authOf(h); const pw = String(body.password || '');
    if (pw.length < 6 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw oops(400, 'Use at least 6 characters, with a letter and a number.');
    if (a.password && body.reset) { if (!a.reset || a.reset.token !== body.reset_token || a.reset.expires < Date.now()) throw oops(403, 'Confirm with the code sent to your mobile first.', { needs_reset_code: true }); a.reset = null; }
    if (a.password && !body.reset && hashPin(String(body.current || ''), a.password.salt) !== a.password.hash) throw oops(400, 'Your current payment password is not right.');
    const salt = crypto.randomBytes(12).toString('hex');
    a.password = { salt, hash: hashPin(pw, salt), set_at: iso(Date.now()) };
    send(res, 200, authView(h));
  });
  // This device's fingerprint or face lock (WebAuthn). Demo: the credential id is stored and the
  // browser's own check is trusted; a live app verifies the signed challenge on the server.
  routes['POST /v1/hub/wallet/device'] = hub(({ res, body, h }) => {
    const a = authOf(h); const id = String(body.credential_id || '');
    if (!/^[A-Za-z0-9_-]{16,512}$/.test(id)) throw oops(400, 'This device could not be added. Try again.');
    const pk = String(body.public_key || '');
    if (!/^[A-Za-z0-9_-]{60,2000}$/.test(pk)) throw oops(400, 'This browser did not share the device key. Update it, or use PIN or OTP.');
    try { crypto.createPublicKey({ key: Buffer.from(pk, 'base64url'), format: 'der', type: 'spki' }); } catch (e) { throw oops(400, 'The device key could not be read. Try again.'); }
    a.device = { id, public_key: pk, alg: Number(body.alg) || -7, label: String(body.label || 'This device').slice(0, 60), added: iso(Date.now()) };
    send(res, 200, authView(h));
  });
  // A fresh challenge for the device to sign (WebAuthn assertion).
  routes['POST /v1/hub/wallet/device/challenge'] = hub(({ res, h }) => {
    const a = authOf(h);
    if (!a.device || !a.device.public_key) throw oops(400, 'Add this device again in My profile → Security.');
    a.challenge = { value: crypto.randomBytes(32).toString('base64url'), expires: Date.now() + 2 * 60000 };
    send(res, 200, { challenge: a.challenge.value, credential_id: a.device.id });
  });
  // Checks a signed assertion: right credential, our challenge, a "get" ceremony, and a valid signature.
  const deviceSigned = (a, body) => {
    const ch = a.challenge; a.challenge = null;
    if (!ch || ch.expires < Date.now() || body.credential_id !== a.device.id) return false;
    let client;
    try { client = Buffer.from(String(body.client_data || ''), 'base64url'); const cd = JSON.parse(client.toString('utf8')); if (cd.type !== 'webauthn.get' || cd.challenge !== ch.value) return false; } catch (e) { return false; }
    const authData = Buffer.from(String(body.authenticator_data || ''), 'base64url');
    if (authData.length < 37 || !(authData[32] & 0x01)) return false; // user present
    const signed = Buffer.concat([authData, crypto.createHash('sha256').update(client).digest()]);
    try { return crypto.verify('sha256', signed, { key: Buffer.from(a.device.public_key, 'base64url'), format: 'der', type: 'spki' }, Buffer.from(String(body.signature || ''), 'base64url')); } catch (e) { return false; }
  };
  routes['POST /v1/hub/wallet/device/remove'] = hub(({ res, h }) => {
    const a = authOf(h); a.device = null; if (a.method === 'device') a.method = h.walletPin ? 'pin' : 'otp';
    send(res, 200, authView(h));
  });
  // A 6-digit code to the registered mobile, valid 5 minutes. In development it is returned too.
  routes['POST /v1/hub/wallet/otp'] = hub(({ res, h }) => {
    const a = authOf(h); const m = h.profile && h.profile.mobile;
    if (!/^[6-9]\d{9}$/.test(m || '')) throw oops(400, 'Add your mobile number in My profile first.');
    if (a.otp && Date.now() - a.otp.sent < 30000) throw oops(429, 'Wait 30 seconds before asking for another code.');
    const code = String(crypto.randomInt(100000, 1000000));
    a.otp = { hash: crypto.createHash('sha256').update(code).digest('hex'), sent: Date.now(), expires: Date.now() + 5 * 60000 };
    send(res, 200, { sent_to: mask(m), expires_in: 300, ...(DEV && { dev_otp: code }) });
  });
  routes['POST /v1/hub/wallet/reset/verify'] = hub(({ res, body, h }) => {
    const a = authOf(h);
    if (a.locked_until > Date.now()) throw lockedErr(a);
    if (!a.otp || a.otp.expires < Date.now()) throw oops(400, 'Ask for a new code.');
    const ok = /^\d{6}$/.test(String(body.otp || '')) && crypto.createHash('sha256').update(String(body.otp)).digest('hex') === a.otp.hash;
    if (!ok) { a.fails = (a.fails || 0) + 1; if (a.fails >= 5) { a.fails = 0; a.locked_until = Date.now() + LOCK_MS; throw lockedErr(a); } throw oops(400, `Wrong code. ${5 - a.fails} ${5 - a.fails === 1 ? 'try' : 'tries'} left.`); }
    a.otp = null; a.fails = 0;
    a.reset = { token: crypto.randomBytes(12).toString('hex'), expires: Date.now() + 10 * 60000 };
    send(res, 200, { reset_token: a.reset.token });
  });
  // One check for every method; wrong tries share one counter and lock for 15 minutes after 5.
  // A passed check gives a one-time token for this amount, valid 5 minutes. The payment itself
  // is refused without it (see requireApproval in hub-api.js).
  const issue = (h, body, method) => { const token = crypto.randomBytes(12).toString('hex'); h.payApproval = { token, amount: Math.round(Number(body.amount) || 0), credit: !!body.credit, method, expires: Date.now() + 5 * 60000 }; return token; };
  routes['POST /v1/hub/wallet/approve'] = hub(({ res, body, h }) => {
    const a = authOf(h);
    if (!(Number(body.amount) > 0)) throw oops(400, 'Missing payment amount.');
    // Small payments under the person's own limit go through without a check (never on credit).
    if (body.method === 'skip') {
      if (!a.skip_under || Number(body.amount) > a.skip_under || body.credit) throw oops(403, 'This payment needs your approval.');
      return send(res, 200, { ok: true, method: 'skip', approval: issue(h, body, 'skip') });
    }
    const method = METHODS.includes(body.method) ? body.method : a.method;
    if (a.locked_until > Date.now()) throw lockedErr(a);
    let ok = false;
    if (method === 'pin') { const pn = h.walletPin; if (!pn) throw oops(400, 'Set a wallet PIN first.', { needs_pin: true }); ok = valid(body.pin) && hashPin(body.pin, pn.salt) === pn.hash; }
    else if (method === 'password') { if (!a.password) throw oops(400, 'Set a payment password first.'); ok = hashPin(String(body.password || ''), a.password.salt) === a.password.hash; }
    else if (method === 'otp') {
      if (!a.otp) throw oops(400, 'Ask for a code first.');
      if (a.otp.expires < Date.now()) { a.otp = null; throw oops(400, 'That code has expired. Ask for a new one.'); }
      ok = /^\d{6}$/.test(String(body.otp || '')) && crypto.createHash('sha256').update(String(body.otp)).digest('hex') === a.otp.hash;
      if (ok) a.otp = null;
    } else if (method === 'device') { if (!a.device || !a.device.public_key) throw oops(400, 'Add this device again first.'); ok = deviceSigned(a, body); }
    if (!ok) {
      a.fails = (a.fails || 0) + 1;
      if (a.fails >= 5) { a.fails = 0; a.locked_until = Date.now() + LOCK_MS; throw lockedErr(a); }
      const what = { pin: 'PIN', password: 'password', otp: 'code', device: 'fingerprint or face check' }[method];
      throw oops(400, `Wrong ${what}. ${5 - a.fails} ${5 - a.fails === 1 ? 'try' : 'tries'} left.`, { left: 5 - a.fails });
    }
    a.fails = 0;
    send(res, 200, { ok: true, method, approval: issue(h, body, method) });
  });
};
