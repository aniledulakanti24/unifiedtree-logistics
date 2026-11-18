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
};
