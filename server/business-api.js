// Business module: WhatsApp automation, the notification centre, live shipment tracking,
// the single consolidated GST invoice, and map configuration.
'use strict';
const crypto = require('crypto');
const wa = require('./whatsapp');

const PUBLIC_URL = () => process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
const newId = (p) => p + Date.now().toString(36).toUpperCase().slice(-5) + crypto.randomBytes(2).toString('hex').toUpperCase();
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const trackUrl = (d) => `${PUBLIC_URL()}/track/?id=${d.booking_id || d.id}`;

// Events the platform raises. "to" is the default WhatsApp recipient.
const EVENTS = {
  'booking.created': { label: 'Booking confirmed', tone: 'green', icon: 'list', on: true, to: 'both', template: 'ut_booking_confirmed', params: (d) => [d.name, d.id, d.provider, trackUrl(d)], title: (d) => `Booked with ${d.provider}`, body: (d) => `${d.id} · ${d.sub}` },
  'driver.assigned': { label: 'Driver or pickup assigned', tone: 'blue', icon: 'user', on: true, to: 'sender', template: 'ut_driver_assigned', params: (d) => [d.name, d.provider, d.id, trackUrl(d)], title: (d) => `${d.provider} assigned`, body: (d) => `${d.id} · ${d.sub}` },
  'shipment.picked_up': { label: 'Picked up', tone: 'blue', icon: 'parcel', on: true, to: 'both', template: 'ut_picked_up', params: (d) => [d.name, d.id, d.provider, trackUrl(d)], title: () => 'Shipment picked up', body: (d) => `${d.id} · ${d.sub}` },
  'shipment.out_for_delivery': { label: 'Out for delivery', tone: 'amber', icon: 'truck', on: true, to: 'receiver', template: 'ut_out_for_delivery', params: (d) => [d.name, d.id, trackUrl(d)], title: () => 'Out for delivery', body: (d) => `${d.id} · ${d.sub}` },
  'shipment.delivered': { label: 'Delivered', tone: 'green', icon: 'shield', on: true, to: 'both', template: 'ut_delivered', params: (d) => [d.name, d.id, d.provider], title: () => 'Delivered', body: (d) => `${d.id} · ${d.sub}` },
  'shipment.delayed': { label: 'Running late', tone: 'coral', icon: 'bell', on: true, to: 'sender', template: 'ut_delayed', params: (d) => [d.name, d.id, d.provider, trackUrl(d)], title: () => 'Shipment running late', body: (d) => `${d.id} with ${d.provider}` },
  'booking.cancelled': { label: 'Cancelled', tone: 'coral', icon: 'list', on: false, to: 'both', template: 'ut_cancelled', params: (d) => [d.name, d.id], title: () => 'Booking cancelled', body: (d) => `${d.id} · ${d.sub}` },
  'payment.due': { label: 'Payment due soon', tone: 'amber', icon: 'bill', on: false, to: 'ops', template: 'ut_payment_due', params: (d) => [d.name, d.provider, inr(d.amount), d.due], title: (d) => `${d.provider} due soon`, body: (d) => `${inr(d.amount)} on ${d.due}` },
  'wallet.low': { label: 'Wallet balance low', tone: 'coral', icon: 'wallet', on: false, to: 'ops', template: 'ut_wallet_low', params: (d) => [d.name, inr(d.balance)], title: () => 'Wallet balance is low', body: (d) => `${inr(d.balance)} left` },
  'invoice.ready': { label: 'GST invoice ready', tone: 'green', icon: 'receipt', on: false, to: 'ops', template: 'ut_invoice_ready', params: (d) => [d.name, d.invoice_no, d.month, inr(d.total)], title: (d) => `GST invoice ${d.invoice_no}`, body: (d) => `${d.month} · ${inr(d.total)}` },
  'return.updated': { label: 'Returns', tone: 'coral', icon: 'repeat', title: (d) => d.title, body: (d) => d.body },
  'customer.reschedule': { label: 'Customer asked to reschedule', tone: 'amber', icon: 'bell', inbound: true, title: (d) => 'Reschedule requested on WhatsApp', body: (d) => `${d.id || 'A customer'} · from ${d.from}` },
};
const STATUS_EVENT = { ASSIGNED: 'driver.assigned', PICKUP_SCHEDULED: 'driver.assigned', PICKED_UP: 'shipment.picked_up', OUT_FOR_DELIVERY: 'shipment.out_for_delivery', DELIVERED: 'shipment.delivered', CANCELLED: 'booking.cancelled' };

// Indicative GST treatment. Confirm with your tax adviser and edit here; rules change.
// section or kind -> [rate %, SAC heading, input credit available, description]
const GST_RULES = {
  vehicle: [5, '9968', false, 'Local delivery'], courier: [18, '9968', true, 'Courier'], logistics: [18, '9965', true, 'Goods transport (forward charge)'], international: [0, '9965', false, 'International transport (check zero rating)'],
  flight: [5, '9964', true, 'Air travel, economy'], flight_business: [18, '9964', true, 'Air travel, premium'], train: [5, '9964', true, 'Rail travel'], bus: [5, '9964', false, 'Bus travel'],
  hotel: [5, '9963', false, 'Accommodation up to ₹7,500 a night'], hotel_premium: [18, '9963', true, 'Accommodation above ₹7,500 a night'], ride: [5, '9964', false, 'Local passenger ride'], mobile: [18, '9984', true, 'Telecom'],
};
const STATES = { '07': 'Delhi', '09': 'Uttar Pradesh', 19: 'West Bengal', 23: 'Madhya Pradesh', 24: 'Gujarat', 27: 'Maharashtra', 29: 'Karnataka', 32: 'Kerala', 33: 'Tamil Nadu', 36: 'Telangana', 37: 'Andhra Pradesh', '06': 'Haryana', '08': 'Rajasthan' };

function validGstin(g) {
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const sum = [...g.slice(0, 14)].reduce((s, c, i) => { const p = chars.indexOf(c) * (i % 2 ? 2 : 1); return s + Math.floor(p / 36) + (p % 36); }, 0);
  return chars[(36 - (sum % 36)) % 36] === g[14];
}

module.exports = function register(routes, { send }, ctx, engine, hubCtx) {
  const { books, iso, day, paginate } = ctx;
  const { hub, live, oops, text } = hubCtx;

  function bizOf(h) {
    if (!h.biz) {
      h.biz = { notifications: [], prefs: {}, seen: { status: {}, flags: {} }, gst: { legal_name: '', address: '', auto_whatsapp: false },
        wa: { ops: '', log: [], opted_out: [], rules: Object.fromEntries(Object.entries(EVENTS).filter(([, e]) => e.template).map(([k, e]) => [k, { enabled: e.on, to: e.to }])) } };
    }
    return h.biz;
  }
  const biz = (fn) => hub(async (c) => {
    if (c.h.profile.account_type !== 'business') throw oops(403, 'This is part of a Business account. Switch to Business to use it.');
    await fn({ ...c, b: bizOf(c.h) });
  });
  const prefOf = (b, event, channel) => { const p = b.prefs[event]; return p && p[channel] != null ? p[channel] : !['sms', 'email'].includes(channel); };

  // ---- WhatsApp sending -----------------------------------------------------------
  function logEntry(b, entry) { const e = { id: newId('WM'), at: iso(Date.now()), direction: 'out', status: 'queued', ...entry }; b.wa.log.unshift(e); b.wa.log.length = Math.min(b.wa.log.length, 300); return e; }
  async function sendTemplateTo(b, event, to, data) {
    const def = EVENTS[event];
    const params = def.params({ ...data, name: data.name || 'there' });
    const entry = logEntry(b, { event, to, template: def.template, body: wa.render(def.template, params) });
    try { const r = await wa.sendTemplate(to, def.template, params); Object.assign(entry, { status: 'sent', wa_id: r.id, mode: r.mode }); }
    catch (err) { Object.assign(entry, { status: 'failed', error: err.message, mode: 'live' }); }
  }
  function dispatchWhatsApp(h, b, event, data) {
    if (h.profile.account_type !== 'business') return;
    const rule = b.wa.rules[event];
    if (!rule || !rule.enabled) return;
    const list = [];
    if ((rule.to === 'sender' || rule.to === 'both') && data.contact_phone) list.push([data.contact_phone, data.contact_name]);
    if ((rule.to === 'receiver' || rule.to === 'both') && data.receiver && data.receiver.phone && data.receiver.consent) list.push([data.receiver.phone, data.receiver.name]);
    if (rule.to === 'ops' && b.wa.ops) list.push([b.wa.ops, h.profile.company || h.profile.name]);
    const unique = new Map(list);
    unique.forEach((name, to) => { if (!b.wa.opted_out.includes(to)) sendTemplateTo(b, event, to, { ...data, name }); });
  }

  // ---- notifications ------------------------------------------------------------------
  function raise(h, b, event, data, link) {
    const def = EVENTS[event];
    if (prefOf(b, event, 'inapp')) {
      b.notifications.unshift({ id: newId('NT'), at: iso(Date.now()), event, tone: def.tone, icon: def.icon, title: def.title(data), body: def.body(data), link, read: false, browser: prefOf(b, event, 'browser'), via: ['sms', 'email'].filter((c) => prefOf(b, event, c)) });
      b.notifications.length = Math.min(b.notifications.length, 200);
    }
    if (def.template) dispatchWhatsApp(h, b, event, data);
  }
  const once = (b, key) => { if (b.seen.flags[key]) return false; b.seen.flags[key] = true; return true; };

  // Watches an account for changes and raises events. Runs on a timer and before reads.
  function sync(db) {
    const h = db.hub;
    if (!h) return;
    const b = bizOf(h);
    h.records.forEach((r) => {
      if (r.sample || !r.booking_id) return;
      const v = live(r);
      const link = `#/${r.section}/orders`;
      const prev = b.seen.status[r.id];
      if (prev === v.status) { if (v.group === 'transit' && v.promised_by && Date.parse(v.promised_by) < Date.now() && once(b, `late:${r.id}`)) raise(h, b, 'shipment.delayed', v, link); return; }
      b.seen.status[r.id] = v.status;
      if (prev === undefined) raise(h, b, 'booking.created', v, link);
      const ev = STATUS_EVENT[v.status];
      if (ev && once(b, `${ev}:${r.id}`)) raise(h, b, ev, v, link);
    });
    if (db.balance < 1000) { if (once(b, 'wallet-low')) raise(h, b, 'wallet.low', { balance: db.balance }, '#/wallet'); } else delete b.seen.flags['wallet-low'];
    h.accounts.forEach((a) => {
      if (!a.next_due || a.type === 'fastag') return;
      const days = Math.round((Date.parse(a.next_due) - Date.now()) / day);
      if (days <= 3 && once(b, `due:${a.id}:${a.next_due}`)) raise(h, b, 'payment.due', { provider: a.provider, amount: a.amount, due: a.next_due }, '#/autopay');
    });
  }
  setInterval(() => { for (const db of books.values()) { try { sync(db); } catch (err) { console.error('[business sync]', err.message); } } }, 3000).unref();

  routes['GET /v1/hub/biz/notifications'] = biz(({ res, url, db, b }) => {
    sync(db);
    const unread = b.notifications.filter((n) => !n.read).length;
    send(res, 200, { ...paginate(b.notifications, url), unread, prefs: Object.entries(EVENTS).map(([event, e]) => ({ event, label: e.label, inapp: prefOf(b, event, 'inapp'), browser: prefOf(b, event, 'browser'), sms: prefOf(b, event, 'sms'), email: prefOf(b, event, 'email'), whatsapp: e.template ? !!b.wa.rules[event].enabled : null })) });
  });
  routes['POST /v1/hub/biz/notifications/read'] = biz(({ res, body, b }) => {
    b.notifications.forEach((n) => { if (body.all || n.id === body.id) n.read = true; });
    send(res, 200, { unread: b.notifications.filter((n) => !n.read).length });
  });
  routes['POST /v1/hub/biz/notifications/prefs'] = biz(({ res, body, b }) => {
    if (!EVENTS[body.event]) throw oops(400, 'Unknown notification.');
    if (body.channel === 'whatsapp') { if (!b.wa.rules[body.event]) throw oops(400, 'That event has no WhatsApp message.'); b.wa.rules[body.event].enabled = !!body.value; }
    else if (['inapp', 'browser', 'sms', 'email'].includes(body.channel)) { b.prefs[body.event] = { ...(b.prefs[body.event] || {}), [body.channel]: !!body.value }; }
    else throw oops(400, 'Unknown channel.');
    send(res, 200, { ok: true });
  });

  // ---- WhatsApp automation API --------------------------------------------------------------
  const logView = (e) => { if (e.mode !== 'simulated' || e.direction === 'in' || e.status !== 'sent') return e; const age = Date.now() - Date.parse(e.at); return { ...e, status: age > 6000 ? 'read' : age > 2000 ? 'delivered' : 'sent' }; };
  routes['GET /v1/hub/biz/whatsapp'] = biz(({ res, db, b }) => {
    sync(db);
    const log = b.wa.log.map(logView);
    send(res, 200, { status: wa.status(), ops: b.wa.ops, opted_out: b.wa.opted_out.length, webhook_url: `${PUBLIC_URL()}/v1/public/whatsapp/webhook`, stats: { sent: log.filter((l) => l.direction === 'out' && l.status !== 'failed').length, read: log.filter((l) => l.status === 'read').length, failed: log.filter((l) => l.status === 'failed').length, inbound: log.filter((l) => l.direction === 'in').length },
      rules: Object.entries(b.wa.rules).map(([event, r]) => ({ event, ...r, label: EVENTS[event].label, template: EVENTS[event].template, body: wa.TEMPLATES[EVENTS[event].template] })), log: log.slice(0, 40) });
  });
  routes['POST /v1/hub/biz/whatsapp/rule'] = biz(({ res, body, b }) => {
    const r = b.wa.rules[body.event];
    if (!r) throw oops(400, 'Unknown automation.');
    if (body.enabled != null) r.enabled = !!body.enabled;
    if (body.to != null) { if (!['sender', 'receiver', 'both', 'ops'].includes(body.to)) throw oops(400, 'Pick who receives this.'); r.to = body.to; }
    send(res, 200, r);
  });
  routes['POST /v1/hub/biz/whatsapp/settings'] = biz(({ res, body, b }) => {
    const ops = text(body.ops, 10);
    if (ops && !/^[6-9]\d{9}$/.test(ops)) throw oops(400, 'Enter a 10-digit mobile number.');
    b.wa.ops = ops;
    send(res, 200, { ops });
  });
  routes['POST /v1/hub/biz/whatsapp/test'] = biz(async ({ res, body, h, b }) => {
    const to = text(body.to, 10);
    if (!/^[6-9]\d{9}$/.test(to)) throw oops(400, 'Enter a 10-digit mobile number.');
    await sendTemplateTo(b, 'booking.created', to, { name: h.profile.name || 'there', id: 'TEST-001', provider: 'UT Log', sub: 'Test message', booking_id: 'TEST-001' });
    send(res, 200, logView(b.wa.log[0]));
  });

  // Keyword bot for replies from customers.
  async function inbound(h, b, from, message, opts) {
    const cmd = text(message, 200).toUpperCase();
    logEntry(b, { direction: 'in', to: from, body: text(message, 500), status: 'received', mode: opts.simulate ? 'simulated' : 'live' });
    const mine = h.records.map(live).find((r) => r.booking_id && (r.contact_phone === from || (r.receiver && r.receiver.phone === from)));
    let reply;
    if (cmd === 'STOP') { if (!b.wa.opted_out.includes(from)) b.wa.opted_out.push(from); reply = 'You will no longer get updates. Reply START to turn them back on.'; }
    else if (cmd === 'START') { b.wa.opted_out = b.wa.opted_out.filter((x) => x !== from); reply = 'Updates are back on. Reply STOP at any time to turn them off.'; }
    else if (cmd === 'TRACK' || cmd === 'STATUS') reply = mine ? `Booking ${mine.id} with ${mine.provider}: ${mine.label}. Track it here: ${trackUrl(mine)}` : 'We could not find a booking for this number.';
    else if (cmd === 'RESCHEDULE') { raise(h, b, 'customer.reschedule', { id: mine && mine.id, from }, '#/business/whatsapp'); reply = 'Thanks. We have told the sender you want a different time. They will contact you.'; }
    else reply = 'Reply TRACK for your delivery status, RESCHEDULE to ask for a new time, or STOP to turn off updates.';
    const entry = logEntry(b, { to: from, body: reply, template: null, event: 'bot.reply' });
    try { const r = await wa.sendText(from, reply, opts); Object.assign(entry, { status: 'sent', wa_id: r.id, mode: r.mode }); }
    catch (err) { Object.assign(entry, { status: 'failed', error: err.message, mode: 'live' }); }
    return reply;
  }
  routes['POST /v1/hub/biz/whatsapp/simulate'] = biz(async ({ res, body, h, b }) => {
    const from = text(body.from, 10);
    if (!/^[6-9]\d{9}$/.test(from)) throw oops(400, 'Enter a 10-digit mobile number.');
    if (!text(body.text, 200)) throw oops(400, 'Type a message.');
    send(res, 200, { reply: await inbound(h, b, from, body.text, { simulate: true }) });
  });

  // Meta webhook: registration handshake, then signed events.
  routes['GET /v1/public/whatsapp/webhook'] = async (req, res, body, url) => {
    const token = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!token || url.searchParams.get('hub.mode') !== 'subscribe' || url.searchParams.get('hub.verify_token') !== token) { res.writeHead(403); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(String(url.searchParams.get('hub.challenge') || ''));
  };
  routes['POST /v1/public/whatsapp/webhook'] = async (req, res, body) => {
    if (!wa.verifySignature(req.rawBody || '', req.headers['x-hub-signature-256'])) { res.writeHead(401); return res.end(); }
    res.writeHead(200); res.end();
    const accounts = [...books.values()].filter((d) => d.hub);
    for (const entry of body.entry || []) for (const change of entry.changes || []) {
      const v = change.value || {};
      for (const s of v.statuses || []) for (const d of accounts) { const log = bizOf(d.hub).wa.log.find((l) => l.wa_id === s.id); if (log) log.status = s.status; }
      for (const m of v.messages || []) {
        if (m.type !== 'text') continue;
        const from = String(m.from).replace(/^91/, '');
        const d = accounts.find((x) => x.hub.records.some((r) => r.contact_phone === from || (r.receiver && r.receiver.phone === from)));
        if (d) await inbound(d.hub, bizOf(d.hub), from, m.text.body, {}).catch((err) => console.error('[whatsapp inbound]', err.message));
      }
    }
  };

  // ---- live tracking ----------------------------------------------------------------------------
  routes['GET /v1/hub/biz/shipments'] = biz(({ res, h, db }) => {
    sync(db);
    const list = h.records.filter((r) => r.booking_id && r.status !== 'CANCELLED').map((r) => {
      const v = live(r);
      const t = engine.trackById(r.booking_id);
      if (!t) return null;
      const late = v.group === 'transit' && v.promised_by && Date.parse(v.promised_by) < Date.now();
      const a = t.from_pt; const z = t.to_pt;
      return { id: r.id, booking_id: r.booking_id, section: r.section, title: r.title, provider: r.provider, sub: r.sub, group: v.group, label: v.label, progress: t.progress, remaining_min: t.remaining_min, promised_by: t.promised_by, late: !!late, driver: t.driver, from_pt: a, to_pt: z, position: a && z ? [a[0] + (z[0] - a[0]) * t.progress, a[1] + (z[1] - a[1]) * t.progress] : null, receiver: r.receiver ? r.receiver.name : '', at: r.at, tracking_url: `/track/?id=${r.booking_id}` };
    }).filter(Boolean);
    const active = list.filter((s) => s.group !== 'delivered');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    send(res, 200, { data: list, stats: { active: active.length, moving: active.filter((s) => s.group === 'transit').length, late: active.filter((s) => s.late).length, delivered: list.filter((s) => s.group === 'delivered').length } });
  });

  // ---- single consolidated GST invoice -----------------------------------------------------------
  function ruleFor(r) {
    if (r.section === 'bills' || r.section === 'business') return null;
    if (r.section === 'recharge') return /FASTag/.test(r.title) || r.kind === 'fastag' ? null : GST_RULES.mobile;
    if (r.section === 'rides') return GST_RULES.ride;
    if (r.section === 'travel') {
      if (r.kind === 'hotel' || r.kind === 'stay') return r.per_night > 7500 ? GST_RULES.hotel_premium : GST_RULES.hotel;
      if (r.kind === 'bus' || /^Bus/.test(r.title)) return GST_RULES.bus;
      if (r.kind === 'train' || /^Train/.test(r.title)) return GST_RULES.train;
      return r.premium ? GST_RULES.flight_business : GST_RULES.flight;
    }
    return GST_RULES[r.section] || null;
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  function invoice(h, b, month) {
    const p = h.profile;
    const supplierState = process.env.UT_GST_STATE || '29';
    const buyerState = p.gstin ? p.gstin.slice(0, 2) : '';
    const inter = !!buyerState && buyerState !== supplierState;
    const rows = h.records.filter((r) => r.status !== 'CANCELLED' && localMonth(r.at) === month);
    const lines = []; const excluded = [];
    rows.forEach((r) => {
      const rule = ruleFor(r);
      if (!rule) { excluded.push({ id: r.id, title: r.title, provider: r.provider, amount: r.amount }); return; }
      const [rate, sac, itc, desc] = rule;
      const taxable = round2(r.amount / (1 + rate / 100));
      const tax = round2(r.amount - taxable);
      lines.push({ id: r.id, at: r.at, provider: r.provider, title: r.title, sub: r.sub, sac, rate, itc, desc, taxable, tax, cgst: inter ? 0 : round2(tax / 2), sgst: inter ? 0 : round2(tax / 2), igst: inter ? tax : 0, total: r.amount, pay_mode: r.pay_mode });
    });
    const sum = (k, a = lines) => round2(a.reduce((s, l) => s + l[k], 0));
    const groups = {};
    lines.forEach((l) => { const k = `${l.sac}|${l.rate}|${l.itc}`; (groups[k] = groups[k] || { sac: l.sac, rate: l.rate, itc: l.itc, desc: l.desc, count: 0, taxable: 0, tax: 0, total: 0 }); groups[k].count++; groups[k].taxable = round2(groups[k].taxable + l.taxable); groups[k].tax = round2(groups[k].tax + l.tax); groups[k].total = round2(groups[k].total + l.total); });
    return { month, invoice_no: `UT/${month.replace('-', '')}/${(crypto.createHash('md5').update(p.gstin + month).digest().readUInt16BE(0) % 9000) + 1000}`, buyer: { legal_name: b.gst.legal_name || p.company, gstin: p.gstin, state: STATES[buyerState] || '', address: b.gst.address }, supplier: { name: 'UT Log', gstin: process.env.UT_GSTIN || '', state: STATES[supplierState] || '' }, inter_state: inter, lines, excluded, hsn: Object.values(groups), providers: new Set(lines.map((l) => l.provider)).size, taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), tax: sum('tax'), total: sum('total'), itc_eligible: sum('tax', lines.filter((l) => l.itc)), ready: !!(p.gstin && (b.gst.legal_name || p.company)) };
  }
  const localMonth = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  routes['GET /v1/hub/biz/gst'] = biz(({ res, url, h, b }) => {
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '') ? url.searchParams.get('month') : localMonth(Date.now());
    const months = Array.from({ length: 6 }, (_, n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return localMonth(d); });
    send(res, 200, { ...invoice(h, b, month), months, settings: { ...b.gst, gstin: h.profile.gstin, company: h.profile.company } });
  });
  routes['POST /v1/hub/biz/gst/settings'] = biz(({ res, body, h, b }) => {
    const g = text(body.gstin, 15).toUpperCase();
    if (g && !validGstin(g)) throw oops(400, 'That GSTIN is not valid. Check the number and try again.');
    h.profile.gstin = g;
    b.gst.legal_name = text(body.legal_name, 100);
    b.gst.address = text(body.address, 250);
    b.gst.auto_whatsapp = !!body.auto_whatsapp;
    if (b.gst.legal_name && !h.profile.company) h.profile.company = b.gst.legal_name;
    send(res, 200, { ok: true });
  });
  routes['POST /v1/hub/biz/gst/share'] = biz(({ res, url, body, h, b }) => {
    const inv = invoice(h, b, /^\d{4}-\d{2}$/.test(body.month || '') ? body.month : localMonth(Date.now()));
    if (!inv.ready) throw oops(400, 'Add your GSTIN and legal name first.');
    if (!b.wa.ops) throw oops(400, 'Add an operations number in WhatsApp settings first.');
    const rule = b.wa.rules['invoice.ready'];
    sendTemplateTo(b, 'invoice.ready', b.wa.ops, { name: inv.buyer.legal_name, invoice_no: inv.invoice_no, month: inv.month, total: inv.total });
    raise(h, b, 'invoice.ready', { invoice_no: inv.invoice_no, month: inv.month, total: inv.total, name: inv.buyer.legal_name }, '#/business/gst');
    send(res, 200, { ok: true, automation_on: !!rule.enabled });
  });

  // ---- maps ---------------------------------------------------------------------------------------
  routes['GET /v1/hub/config'] = hub(({ res }) => send(res, 200, { maps: { provider: process.env.GOOGLE_MAPS_API_KEY ? 'google' : 'osm', key: process.env.GOOGLE_MAPS_API_KEY || '' }, whatsapp: wa.status(), support: { phone: process.env.SUPPORT_PHONE || '', email: process.env.SUPPORT_EMAIL || '' } }));
  routes['POST /v1/hub/geo/reverse'] = hub(({ res, body }) => {
    const lat = Number(body.lat); const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw oops(400, 'That location is not valid.');
    send(res, 200, engine.nearest(lat, lng));
  });

  return { notify: (h, event, data, link) => raise(h, bizOf(h), event, data, link), bizOf, logEntry };
};
