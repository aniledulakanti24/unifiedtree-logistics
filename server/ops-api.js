// Operations add-ons: team & roles, webhooks, buyer returns portal (public)
// + approval queue, COD reconciliation, automatic COD confirmation, freight
// invoices & credit notes, support tickets and the buyer blocklist.
'use strict';
const crypto = require('crypto');

const WEBHOOK_EVENTS = ['order.created', 'order.cancelled', 'order.confirmed', 'shipment.created', 'shipment.pickup_scheduled', 'ndr.actioned', 'return.created'];

module.exports = function register(routes, { send, users }, ctx) {
  const access = require('./access');
  const { seller, books, findOrder, move, debit, paginate, riskOf, emit, iso, ymd, day, memberships, invites, ROLES, createTicket, RETURN_REASONS } = ctx;
  const bad = (res, message) => send(res, 400, { message });
  const MOBILE = /^[6-9]\d{9}$/;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ---- team & roles ---------------------------------------------------------
  const ROLE_INFO = {
    owner: 'Everything, including team, API keys and security',
    ops: 'Orders, shipping, rules, returns, NDR and support',
    finance: 'Wallet, COD, invoices, KYC and reports',
    support: 'NDR, returns, exchanges and support tickets',
    viewer: 'Read-only access to every page',
  };
  routes['GET /v1/team'] = seller(({ res, ownerKey, db }) => {
    const owner = users.get(ownerKey);
    const members = [...memberships].filter(([, m]) => m.owner === ownerKey).map(([key, m]) => {
      const u = users.get(key) || {};
      return { key, name: u.name || '', contact: u.mobile || u.email, role: m.role, status: 'ACTIVE' };
    });
    const pending = [...invites].filter(([, i]) => i.owner === ownerKey).map(([contact, i]) => ({ key: contact, name: i.name, contact, role: i.role, status: 'INVITED', at: i.at }));
    send(res, 200, { roles: [{ key: 'owner', name: 'Owner', description: ROLE_INFO.owner }, ...Object.entries(access.ensure(db).roles).map(([key, r]) => ({ key, name: r.name, description: r.description }))],
      data: [{ key: ownerKey, name: owner && owner.name, contact: owner && (owner.mobile || owner.email), role: 'owner', status: 'ACTIVE' }, ...members, ...pending] });
  });
  routes['POST /v1/team/invite'] = seller(({ res, body, ownerKey, user, db }) => {
    const contact = String(body.contact || '').trim().toLowerCase();
    if (!MOBILE.test(contact) && !EMAIL.test(contact)) return bad(res, 'Enter a 10-digit mobile number or an email.');
    if (!access.validRole(db, body.role)) return bad(res, 'Pick a role.');
    if (contact === user.mobile || contact === user.email) return bad(res, "That's you.");
    const existing = [...users.values()].find((u) => u.mobile === contact || u.email === contact);
    if (existing && memberships.has(existing.key)) return bad(res, 'This person is already on a team.');
    invites.set(contact, { owner: ownerKey, role: body.role, name: String(body.name || '').slice(0, 60), at: iso(Date.now()) });
    send(res, 200, { ok: true, note: 'They join your account the next time they log in with this mobile number or email.' });
  });
  routes['POST /v1/team/role'] = seller(({ res, body, ownerKey, db }) => {
    if (!access.validRole(db, body.role)) return bad(res, 'Pick a role.');
    const m = memberships.get(body.key);
    const inv = invites.get(body.key);
    if (m && m.owner === ownerKey) m.role = body.role;
    else if (inv && inv.owner === ownerKey) inv.role = body.role;
    else return bad(res, 'Team member not found.');
    send(res, 200, { ok: true });
  });
  routes['POST /v1/team/remove'] = seller(({ res, body, ownerKey }) => {
    const m = memberships.get(body.key);
    if (m && m.owner === ownerKey) memberships.delete(body.key);
    else if (invites.has(body.key) && invites.get(body.key).owner === ownerKey) invites.delete(body.key);
    else return bad(res, 'Team member not found.');
    send(res, 200, { ok: true });
  });

  // ---- webhooks ---------------------------------------------------------------
  routes['GET /v1/webhooks'] = seller(({ res, db }) => send(res, 200, {
    events: WEBHOOK_EVENTS, data: db.webhooks.map(({ secret, ...h }) => ({ ...h, secret_hint: secret.slice(0, 6) + '…' })), log: db.webhook_log.slice(0, 30),
  }));
  routes['POST /v1/webhooks'] = seller(({ res, db, body }) => {
    let u;
    try { u = new URL(String(body.url || '')); } catch (e) { return bad(res, 'Enter a full URL, e.g. https://example.com/hooks/ut'); }
    if (!process.env.ALLOW_PRIVATE_WEBHOOKS) {
      if (u.protocol !== 'https:') return bad(res, 'Webhook URLs must use https.');
      if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/i.test(u.hostname)) return bad(res, 'Use a public URL — private and local addresses are blocked.');
    }
    const events = (body.events || []).filter((e) => WEBHOOK_EVENTS.includes(e));
    if (!events.length) return bad(res, 'Pick at least one event.');
    if (db.webhooks.length >= 5) return bad(res, 'You can have up to 5 webhooks.');
    const h = { id: crypto.randomBytes(4).toString('hex'), url: u.toString(), events, active: true, secret: 'whsec_' + crypto.randomBytes(16).toString('hex'), created_at: iso(Date.now()) };
    db.webhooks.push(h);
    send(res, 200, { id: h.id, secret: h.secret });
  });
  routes['POST /v1/webhooks/delete'] = seller(({ res, db, body }) => { db.webhooks = db.webhooks.filter((h) => h.id !== body.id); send(res, 200, { ok: true }); });
  routes['POST /v1/webhooks/test'] = seller(({ res, db, body }) => {
    const h = db.webhooks.find((x) => x.id === body.id);
    if (!h) return bad(res, 'Webhook not found.');
    const only = { ...db, webhooks: [{ ...h, events: [h.events[0]] }] };
    emit(only, h.events[0], { test: true, message: 'Test delivery from UT Log' });
    send(res, 200, { ok: true });
  });

  // ---- returns portal (public) + approval queue -------------------------------
  const deliveredAt = (o) => Date.parse((o.timeline.find((t) => t.status === 'DELIVERED') || {}).at || o.created_at);
  const hits = new Map(); // ip -> [timestamps], light rate limit for public lookups
  function limited(req) {
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
    list.push(now);
    hits.set(ip, list);
    return list.length > 20;
  }
  function findForBuyer(orderId, phone) {
    const id = String(orderId || '').trim().toUpperCase();
    const ph = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!id || ph.length !== 10) return null;
    for (const db of books.values()) {
      const o = db.orders.find((x) => x.channel_order_id.toUpperCase() === id && x.customer.phone === ph && x.type !== 'EXCHANGE');
      if (o) return { db, o };
    }
    return null;
  }
  function portalView(db, o) {
    const p = db.settings.returns_policy;
    const tp = db.settings.tracking_page;
    const age = Math.floor((Date.now() - deliveredAt(o)) / day);
    const existing = db.return_requests.find((r) => r.order_id === o.id) || db.returns.find((r) => r.order_id === o.id);
    let eligible = true, reason = '';
    if (o.status !== 'DELIVERED') { eligible = false; reason = 'Returns open once your order is delivered.'; }
    else if (age > p.window_days) { eligible = false; reason = `The ${p.window_days}-day return window for this order has closed.`; }
    else if (existing) { eligible = false; reason = 'A return or exchange already exists for this order.'; }
    return {
      store: { name: tp.brand_name || 'Your store', color: tp.color, support_email: tp.support_email, support_phone: tp.support_phone },
      order: { id: o.channel_order_id, status: o.status, delivered_days_ago: o.status === 'DELIVERED' ? age : null, items: o.products.map((x) => ({ name: x.name, sku: x.sku, qty: x.qty })) },
      policy: { window_days: p.window_days, allow_exchange: p.allow_exchange, photos_required_for: p.photos_required_for, reasons: RETURN_REASONS },
      exchange_options: p.allow_exchange ? db.skus.map((s) => ({ sku: s.sku, name: s.name })) : [],
      eligible, reason, request: existing ? { type: existing.type, status: existing.status, id: existing.id } : null,
    };
  }
  routes['POST /v1/public/returns/lookup'] = async (req, res, body) => {
    if (limited(req)) return send(res, 429, { message: 'Too many attempts. Try again in a minute.' });
    const hit = findForBuyer(body.order_id, body.phone);
    if (!hit) return send(res, 404, { message: "We couldn't find an order with that ID and phone number." });
    send(res, 200, portalView(hit.db, hit.o));
  };
  routes['POST /v1/public/returns/request'] = async (req, res, body) => {
    if (limited(req)) return send(res, 429, { message: 'Too many attempts. Try again in a minute.' });
    const hit = findForBuyer(body.order_id, body.phone);
    if (!hit) return send(res, 404, { message: "We couldn't find an order with that ID and phone number." });
    const { db, o } = hit;
    const view = portalView(db, o);
    if (!view.eligible) return bad(res, view.reason);
    const p = db.settings.returns_policy;
    const type = body.type === 'exchange' ? 'EXCHANGE' : 'RETURN';
    if (type === 'EXCHANGE' && !p.allow_exchange) return bad(res, 'This store does not offer exchanges.');
    if (!RETURN_REASONS.includes(body.reason)) return bad(res, 'Pick a reason.');
    if (p.photos_required_for.includes(body.reason) && !(Number(body.photos) >= 1)) return bad(res, 'Please add at least one photo for this reason.');
    const qty = Math.min(Math.max(1, Math.floor(Number(body.qty) || 1)), o.products[0].qty);
    const r = { id: 'RQ' + (db.return_requests.length + 101), order_id: o.id, channel_order_id: o.channel_order_id, customer: o.customer.name, product: o.products[0].name, sku: o.products[0].sku,
      type, qty, reason: body.reason, new_sku: type === 'EXCHANGE' ? String(body.new_sku || o.products[0].sku) : null, photos: Number(body.photos) || 0,
      comment: String(body.comment || '').slice(0, 300), status: 'REQUESTED', created_at: iso(Date.now()) };
    db.return_requests.unshift(r);
    if (p.auto_approve) decide(db, r, 'approve', 'Auto-approved by return policy');
    send(res, 200, { id: r.id, status: r.status });
  };
  function decide(db, r, action, note) {
    r.status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    r.decided_at = iso(Date.now());
    r.note = String(note || '').slice(0, 200);
    if (action !== 'approve') return;
    const o = findOrder(db, r.order_id);
    if (r.type === 'EXCHANGE') {
      const cat = db.skus.find((s) => s.sku === r.new_sku);
      const fwd = { ...JSON.parse(JSON.stringify(o)), id: ++db.nextOrderId, channel_order_id: o.channel_order_id + '-EX', created_at: iso(Date.now()), type: 'EXCHANGE',
        products: [{ name: cat ? cat.name : o.products[0].name, sku: r.new_sku, qty: r.qty, price: 0 }], total: 0, payment_method: 'Prepaid', verified: true, status: 'NEW',
        courier: null, courier_id: null, awb: null, freight: null, ndr: null, delay: null, edd: null, feedback: null, timeline: [{ status: 'NEW', at: iso(Date.now()), location: '' }] };
      db.orders.unshift(fwd);
      r.exchange_order_id = fwd.id;
    }
    const ret = { id: 9000 + db.returns.length + 1, order_id: o.id, channel_order_id: o.channel_order_id, customer: o.customer.name, product: o.products[0].name, sku: o.products[0].sku,
      qty: r.qty, reason: r.reason, status: 'RETURN_PENDING', type: r.type, qc: true, qc_checks: ['Product matches', 'Tags intact', 'No damage'],
      refund_mode: r.type === 'EXCHANGE' ? 'Exchange' : 'Original payment', exchange_order_id: r.exchange_order_id || null, new_sku: r.new_sku,
      pickup_address: `${o.customer.address}, ${o.customer.city} ${o.customer.pincode}`, created_at: iso(Date.now()), source: 'Buyer portal' };
    db.returns.unshift(ret);
    r.return_id = ret.id;
    emit(db, 'return.created', { return_id: 'R' + ret.id, order_id: ret.channel_order_id, reason: ret.reason, qty: ret.qty, type: ret.type });
  }
  routes['GET /v1/returns/requests'] = seller(({ res, db, url }) => {
    const status = url.searchParams.get('status');
    send(res, 200, paginate(db.return_requests.filter((r) => !status || r.status === status), url));
  });
  routes['POST /v1/returns/requests/decide'] = seller(({ res, db, body }) => {
    const r = db.return_requests.find((x) => x.id === body.id);
    if (!r || r.status !== 'REQUESTED') return bad(res, 'This request has already been decided.');
    if (!['approve', 'reject'].includes(body.action)) return bad(res, 'Approve or reject.');
    if (body.action === 'reject' && !String(body.note || '').trim()) return bad(res, 'Tell the buyer why it was rejected.');
    decide(db, r, body.action, body.note);
    send(res, 200, r);
  });
  routes['GET /v1/settings/returns-policy'] = seller(({ res, db }) => send(res, 200, { ...db.settings.returns_policy, reasons: RETURN_REASONS }));
  routes['POST /v1/settings/returns-policy'] = seller(({ res, db, body }) => {
    const p = db.settings.returns_policy;
    if (body.window_days != null && !(Number(body.window_days) >= 1 && Number(body.window_days) <= 90)) return bad(res, 'Return window must be 1–90 days.');
    if (body.window_days != null) p.window_days = Math.floor(Number(body.window_days));
    if ('allow_exchange' in body) p.allow_exchange = !!body.allow_exchange;
    if ('auto_approve' in body) p.auto_approve = !!body.auto_approve;
    if (Array.isArray(body.photos_required_for)) p.photos_required_for = body.photos_required_for.filter((x) => RETURN_REASONS.includes(x));
    send(res, 200, p);
  });

  // ---- COD reconciliation -----------------------------------------------------
  routes['GET /v1/cod/reconciliation'] = seller(({ res, db, url }) => {
    const now = Date.now();
    const paidLines = new Map();
    db.remittances.forEach((r) => r.lines.forEach((l) => paidLines.set(l.awb, { ...l, utr: r.utr, remitted_on: r.date })));
    const early = db.account && db.account.early_cod;
    const dueDays = early ? 1 : 2;
    const rows = db.orders.filter((o) => o.status === 'DELIVERED' && o.payment_method === 'COD' && o.awb).map((o) => {
      const l = paidLines.get(o.awb);
      const delivered = deliveredAt(o);
      let status;
      if (l) status = l.remitted < o.total ? 'SHORT' : 'MATCHED';
      else status = delivered < now - (dueDays + 7) * day ? 'MISSING' : 'PENDING';
      if (o.cod_dispute) status = 'DISPUTED';
      // Only money that is actually owed counts as a difference; not-yet-due
      // shipments aren't discrepancies.
      const difference = l ? o.total - l.remitted : status === 'MISSING' || (status === 'DISPUTED' && delivered < now - (dueDays + 7) * day) ? o.total : 0;
      return { awb: o.awb, order_id: o.id, channel_order_id: o.channel_order_id, courier: o.courier, cod: o.total, remitted: l ? l.remitted : 0,
        difference, utr: l ? l.utr : null, remitted_on: l ? l.remitted_on : null, delivered_at: iso(delivered), status, ticket: o.cod_dispute || null };
    }).sort((a, b) => b.delivered_at.localeCompare(a.delivered_at));
    const sum = (f) => rows.filter(f).reduce((s, r) => s + r.cod, 0);
    const filter = url.searchParams.get('status');
    send(res, 200, {
      summary: { expected: sum(() => true), remitted: rows.reduce((s, r) => s + r.remitted, 0), pending: sum((r) => r.status === 'PENDING'),
        short_by: rows.filter((r) => r.status === 'SHORT').reduce((s, r) => s + r.difference, 0), missing: sum((r) => r.status === 'MISSING'),
        issues: rows.filter((r) => ['SHORT', 'MISSING'].includes(r.status)).length, due_days: dueDays },
      ...paginate(rows.filter((r) => !filter || r.status === filter), url),
    });
  });
  routes['POST /v1/cod/dispute'] = seller(({ res, db, body }) => {
    const o = db.orders.find((x) => x.awb === body.awb);
    if (!o || o.payment_method !== 'COD' || o.status !== 'DELIVERED') return bad(res, 'Pick a delivered COD shipment.');
    if (o.cod_dispute) return send(res, 200, { ticket: o.cod_dispute });
    const t = createTicket(db, { category: 'COD remittance', subject: `COD remittance issue · ${o.awb}`, ref: o.awb,
      message: String(body.message || `COD of ₹${o.total} for ${o.awb} (${o.channel_order_id}) is missing or short in my remittances. Please check.`) });
    o.cod_dispute = t.id;
    send(res, 200, { ticket: t.id });
  });

  // ---- automatic COD confirmation -------------------------------------------
  routes['GET /v1/cod-confirm'] = seller(({ res, db }) => {
    const list = db.orders.filter((o) => o.confirmation).sort((a, b) => b.confirmation.at.localeCompare(a.confirmation.at))
      .map((o) => ({ id: o.id, channel_order_id: o.channel_order_id, customer: o.customer.name, total: o.total, status: o.status, risk: riskOf(db, o).level, ...o.confirmation }));
    const unconfirmed = db.orders.filter((o) => o.status === 'NEW' && o.payment_method === 'COD' && !o.verified && !o.confirmation).length;
    const count = (s) => list.filter((x) => x.status === s || x.result === s).length;
    send(res, 200, { settings: db.settings.cod_confirm, unconfirmed, stats: { sent: list.length, confirmed: count('CONFIRMED'), cancelled: count('CANCELLED'), no_response: count('NO_RESPONSE') }, data: list.slice(0, 50) });
  });
  routes['POST /v1/cod-confirm/settings'] = seller(({ res, db, body }) => {
    const c = db.settings.cod_confirm;
    if (body.channels && !body.channels.whatsapp && !body.channels.ivr) return bad(res, 'Keep at least one channel on.');
    if (body.no_response_action && !['hold', 'cancel'].includes(body.no_response_action)) return bad(res, 'Pick hold or cancel.');
    if ('enabled' in body) c.enabled = !!body.enabled;
    if (body.channels) c.channels = { whatsapp: !!body.channels.whatsapp, ivr: !!body.channels.ivr };
    if (body.no_response_action) c.no_response_action = body.no_response_action;
    send(res, 200, c);
  });
  // Sends confirmations to unconfirmed COD orders and processes the replies.
  // Replies are simulated: riskier orders are likelier to go unanswered.
  routes['POST /v1/cod-confirm/run'] = seller(({ res, db }) => {
    const c = db.settings.cod_confirm;
    if (!c.enabled) return bad(res, 'Turn on COD confirmation first.');
    const via = c.channels.whatsapp ? 'WhatsApp' : 'IVR call';
    const now = iso(Date.now());
    db.orders.filter((o) => o.status === 'NEW' && o.payment_method === 'COD' && !o.verified && !o.confirmation).forEach((o) => { o.confirmation = { status: 'SENT', at: now, via }; });
    const pending = db.orders.filter((o) => o.confirmation && o.confirmation.status === 'SENT' && ['NEW', 'ON_HOLD'].includes(o.status));
    if (!pending.length) return bad(res, 'No COD orders are waiting for confirmation.');
    const cost = pending.length * c.price_per_message;
    if (db.balance < cost) return send(res, 402, { message: `Wallet balance too low (need ₹${cost}).` });
    debit(db, cost, `COD confirmation · ${pending.length} messages`);
    const out = { confirmed: 0, cancelled: 0, no_response: 0 };
    pending.forEach((o) => {
      const level = riskOf(db, o).level;
      const roll = (o.id * 37) % 100;
      const [nr, cx] = level === 'High' ? [45, 25] : level === 'Medium' ? [20, 10] : [8, 4];
      const result = roll < cx ? 'CANCELLED' : roll < cx + nr ? 'NO_RESPONSE' : 'CONFIRMED';
      Object.assign(o.confirmation, { status: 'REPLIED', result, replied_at: iso(Date.now()) });
      if (result === 'CONFIRMED') { o.verified = true; if (o.status === 'ON_HOLD') { o.hold_reason = null; move(o, 'NEW'); } emit(db, 'order.confirmed', { order_id: o.channel_order_id }); out.confirmed++; }
      else if (result === 'CANCELLED') { move(o, 'CANCELLED'); o.cancel_reason = `Buyer cancelled on ${via}`; emit(db, 'order.cancelled', { order_id: o.channel_order_id, reason: o.cancel_reason }); out.cancelled++; }
      else {
        if (c.no_response_action === 'cancel') { move(o, 'CANCELLED'); o.cancel_reason = 'No reply to COD confirmation'; }
        else if (o.status === 'NEW') { o.hold_reason = 'No reply to COD confirmation'; move(o, 'ON_HOLD'); }
        out.no_response++;
      }
    });
    send(res, 200, { processed: pending.length, charged: cost, ...out });
  });

  // ---- freight invoices + credit notes ---------------------------------------
  const CATEGORY = (note) => (/^Freight/.test(note) ? 'Freight' : /^Weight/.test(note) ? 'Weight discrepancy charges' : /Boost/.test(note) ? 'Delivery Boost'
    : /COD confirmation/.test(note) ? 'COD confirmation' : 'Other services');
  function documents(db) {
    const months = {};
    for (const w of db.wallet) {
      const m = w.at.slice(0, 7);
      const doc = (months[m] = months[m] || { month: m, debits: [], credits: [] });
      if (w.type === 'debit') doc.debits.push(w);
      else if (/^Refund/.test(w.note)) doc.credits.push(w); // recharges and cashback aren't taxable supplies
    }
    return Object.values(months).sort((a, b) => b.month.localeCompare(a.month)).flatMap((m) => {
      const out = [];
      const tag = m.month.replace('-', '');
      const build = (type, list, prefix) => {
        const total = list.reduce((s, w) => s + w.amount, 0);
        const groups = {};
        list.forEach((w) => { const k = type === 'invoice' ? CATEGORY(w.note) : 'Freight refunds (cancelled shipments)'; groups[k] = (groups[k] || 0) + w.amount; });
        out.push({ number: `${prefix}/UT/${tag}/${String(list.length).padStart(3, '0')}`, type, month: m.month, count: list.length, total, taxable: +(total / 1.18).toFixed(2), gst: +(total - total / 1.18).toFixed(2),
          lines: Object.entries(groups).map(([label, amount]) => ({ label, amount, taxable: +(amount / 1.18).toFixed(2), gst: +(amount - amount / 1.18).toFixed(2) })) });
      };
      if (m.debits.length) build('invoice', m.debits, 'INV');
      if (m.credits.length) build('credit_note', m.credits, 'CN');
      return out;
    });
  }
  routes['GET /v1/billing/documents'] = seller(({ res, db }) => send(res, 200, { data: documents(db), gstin: (db.kyc && db.kyc.gstin) || null }));
  routes['GET /v1/billing/weight-ledger'] = seller(({ res, db }) => send(res, 200, { data: db.disputes.map((d) => ({ ...d, charged: d.status === 'ACCEPTED' ? d.extra_charge : 0 })) }));

  // ---- support tickets ----------------------------------------------------------
  routes['GET /v1/tickets'] = seller(({ res, db, url }) => {
    const status = url.searchParams.get('status');
    send(res, 200, paginate(db.tickets.filter((t) => !status || t.status === status).map(({ messages, ...t }) => ({ ...t, last: messages[messages.length - 1] })), url));
  });
  routes['GET /v1/tickets/show'] = seller(({ res, db, url }) => {
    const t = db.tickets.find((x) => x.id === Number(url.searchParams.get('id')));
    if (!t) return send(res, 404, { message: 'Ticket not found' });
    send(res, 200, t);
  });
  routes['POST /v1/tickets'] = seller(({ res, db, body, user }) => {
    if (!String(body.subject || '').trim() || !String(body.message || '').trim()) return bad(res, 'Add a subject and describe the issue.');
    const t = createTicket(db, { category: body.category, subject: body.subject, ref: body.ref, message: body.message, by: user.name || 'You' });
    send(res, 200, { id: t.id });
  });
  routes['POST /v1/tickets/reply'] = seller(({ res, db, body, user }) => {
    const t = db.tickets.find((x) => x.id === Number(body.id));
    if (!t || t.status === 'RESOLVED') return bad(res, 'This ticket is closed. Open a new one.');
    const text = String(body.message || '').trim();
    if (!text) return bad(res, 'Write a message.');
    t.messages.push({ from: user.name || 'You', text: text.slice(0, 2000), at: iso(Date.now()) });
    t.status = 'OPEN';
    send(res, 200, t);
  });
  routes['POST /v1/tickets/close'] = seller(({ res, db, body }) => {
    const t = db.tickets.find((x) => x.id === Number(body.id));
    if (!t) return bad(res, 'Ticket not found.');
    t.status = 'RESOLVED';
    t.messages.push({ from: 'UT Support', text: 'Marked as resolved. Reply here within 7 days if you need anything else.', at: iso(Date.now()) });
    send(res, 200, t);
  });
  // Demo support desk: answers open tickets so the "waiting for you" flow can
  // be seen. A real deployment would replace this with the helpdesk.
  setInterval(() => {
    const cutoff = Date.now() - 90000;
    for (const db of books.values()) {
      db.tickets.filter((t) => t.status === 'OPEN' && Date.parse(t.messages[t.messages.length - 1].at) < cutoff).forEach((t) => {
        t.messages.push({ from: 'UT Support', text: `We've raised this with the courier team for ${t.ref || 'your account'}. Could you confirm the details are correct, or share anything else we should know?`, at: iso(Date.now()) });
        t.status = 'AWAITING_YOU';
      });
    }
  }, 30000).unref();

  // ---- buyer blocklist ------------------------------------------------------------
  routes['GET /v1/settings/blocklist'] = seller(({ res, db }) => {
    const bl = db.settings.blocklist;
    const affected = db.orders.filter((o) => ['NEW', 'ON_HOLD'].includes(o.status) && bl.some((b) => (b.type === 'phone' && b.value === o.customer.phone) || (b.type === 'pincode' && b.value === o.customer.pincode))).length;
    send(res, 200, { data: bl, open_orders_affected: affected });
  });
  routes['POST /v1/settings/blocklist'] = seller(({ res, db, body }) => {
    const bl = db.settings.blocklist;
    if (body.action === 'remove') { db.settings.blocklist = bl.filter((b) => !(b.type === body.type && b.value === body.value)); return send(res, 200, { ok: true }); }
    const type = body.type;
    const value = String(body.value || '').trim().toLowerCase();
    const ok = { phone: MOBILE, pincode: /^\d{6}$/, email: EMAIL }[type];
    if (!ok || !ok.test(value)) return bad(res, 'Enter a valid 10-digit phone, 6-digit pincode or email.');
    if (bl.some((b) => b.type === type && b.value === value)) return bad(res, 'Already on your blocklist.');
    bl.unshift({ type, value, reason: String(body.reason || '').slice(0, 80), at: iso(Date.now()) });
    // Hold open orders from this buyer right away.
    let held = 0;
    db.orders.filter((o) => o.status === 'NEW' && ((type === 'phone' && o.customer.phone === value) || (type === 'pincode' && o.customer.pincode === value) || (type === 'email' && o.customer.email === value)))
      .forEach((o) => { o.hold_reason = `Buyer on blocklist (${type})`; move(o, 'ON_HOLD'); held++; });
    send(res, 200, { ok: true, held });
  });
};
