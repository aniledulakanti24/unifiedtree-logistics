// Competitive features. Where a real partner would be needed the behaviour is simulated:
// courier statistics, payment gateway, driver chat and integration health.
'use strict';
const crypto = require('crypto');
const wa = require('./whatsapp');

const hash = (s) => crypto.createHash('md5').update(String(s)).digest().readUInt32BE(0);
const newId = (p) => p + Date.now().toString(36).toUpperCase().slice(-5) + crypto.randomBytes(2).toString('hex').toUpperCase();
const NDR_REASONS = ['Receiver not available', 'Address incomplete', 'Receiver asked for a later date', 'Shop or office closed', 'Receiver refused'];
const INTEGRATIONS = [['couriers', 'Courier partners', 'Blue Dart, Delhivery, Xpressbees and others', 'Logistics'], ['vehicles', 'Vehicle partners', 'Porter, Rapido, Uber', 'Logistics'], ['freight', 'Freight and 3PL', 'BlackBuck, Mahindra Logistics, TCI', 'Logistics'], ['air', 'Flight inventory', 'Airline aggregator', 'Travel'], ['rail', 'Rail booking', 'Authorised rail agent', 'Travel'], ['hotels', 'Hotel inventory', 'Hotel aggregator', 'Travel'], ['payments', 'Payment gateway', 'UPI and netbanking', 'Money'], ['bbps', 'Bill payments', 'BBPS operating unit', 'Money'], ['fastag', 'FASTag issuers', 'NETC issuing banks', 'Money'], ['kyc', 'Identity checks', 'PAN and GSTIN verification', 'Compliance'], ['einvoice', 'E-invoicing', 'GST invoice registration portal', 'Compliance']];

module.exports = function register(routes, { send, users }, ctx, engine, hubCtx, bizCtx) {
  const { iso, day, credit, COURIERS, memberships } = ctx;
  const { hub, live, oops, text, takePayment, addRecord } = hubCtx;
  const localDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const P = (h) => {
    if (!h.parity) h.parity = { alloc: [], ndr: {}, payments: [], integrations: {}, templates: [] };
    if (!h.spend) h.spend = { rules: {}, usage: {}, approved: {}, requests: [] };
    return h.parity;
  };
  const ownerOnly = (role) => { if (role !== 'owner') throw oops(403, 'Only the account owner can do this.'); };

  // ---- 1. courier intelligence -------------------------------------------------------
  routes['GET /v1/hub/intel'] = hub(({ res, url }) => {
    const pin = text(url.searchParams.get('pin'), 6);
    if (!engine.pinPoint(pin)) throw oops(400, 'Enter a valid 6-digit pin code.');
    const rows = COURIERS.map((c) => {
      const s = hash(`${c.name}|${pin}`);
      const delivered = 84 + (s % 15); const rto = +(1 + ((s >>> 4) % 90) / 10).toFixed(1); const ndr = +(2 + ((s >>> 9) % 110) / 10).toFixed(1); const days = +(c.days * (0.8 + ((s >>> 13) % 40) / 100)).toFixed(1);
      return { courier: c.name, delivered, rto, ndr, days, shipments: 120 + (s % 4000), trend: ((s >>> 17) % 11) - 5, score: Math.round(delivered * 0.6 + (100 - rto * 5) * 0.2 + (100 - days * 8) * 0.2) };
    }).sort((a, b) => b.score - a.score);
    send(res, 200, { pin, rows, simulated: true });
  });
  routes['GET /v1/hub/alloc'] = hub(({ res, h }) => send(res, 200, { rules: P(h).alloc, couriers: COURIERS.map((c) => c.name) }));
  routes['POST /v1/hub/alloc'] = hub(({ res, body, h }) => {
    const p = P(h);
    if (!COURIERS.some((c) => c.name === body.courier)) throw oops(400, 'Pick a courier.');
    const min = Number(body.min_kg) || 0; const max = Number(body.max_kg) || 0;
    if (!(max > min)) throw oops(400, 'The maximum weight must be above the minimum.');
    p.alloc.push({ id: newId('AR'), min_kg: min, max_kg: max, courier: body.courier });
    send(res, 200, { rules: p.alloc });
  });
  routes['POST /v1/hub/alloc/remove'] = hub(({ res, body, h }) => { const p = P(h); p.alloc = p.alloc.filter((r) => r.id !== body.id); send(res, 200, { rules: p.alloc }); });

  // Failed delivery attempts, with one sample so the page can be tried.
  function ndrSync(h) {
    const p = P(h);
    if (!p.ndr.SAMPLE) p.ndr.SAMPLE = { id: 'SAMPLE', title: 'Courier parcel', provider: 'Delhivery', sub: 'Bengaluru → Pune', reason: NDR_REASONS[0], attempts: 1, status: 'ACTION', at: iso(Date.now() - day), sample: true };
    h.records.map(live).forEach((r) => {
      if (r.section === 'courier' && r.group === 'transit' && !r.sample && !p.ndr[r.id] && hash(r.id) % 3 === 0) p.ndr[r.id] = { id: r.id, title: r.title, provider: r.provider, sub: r.sub, reason: NDR_REASONS[hash(r.id) % NDR_REASONS.length], attempts: 1, status: 'ACTION', at: iso(Date.now()) };
    });
    return Object.values(p.ndr).sort((a, b) => b.at.localeCompare(a.at));
  }
  routes['GET /v1/hub/ndr'] = hub(({ res, h }) => send(res, 200, { data: ndrSync(h) }));
  routes['POST /v1/hub/ndr/action'] = hub(({ res, body, h }) => {
    ndrSync(h);
    const c = P(h).ndr[body.id];
    if (!c) throw oops(404, 'We could not find that delivery.');
    if (c.status !== 'ACTION') throw oops(400, 'This delivery has already been handled.');
    if (body.action === 'reattempt') { if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || body.date < localDay(Date.now())) throw oops(400, 'Pick a date from today onwards.'); Object.assign(c, { status: 'REATTEMPT', date: body.date, attempts: c.attempts + 1 }); }
    else if (body.action === 'address') { const a = text(body.address, 200); if (a.length < 8) throw oops(400, 'Enter the full corrected address.'); Object.assign(c, { status: 'REATTEMPT', address: a, attempts: c.attempts + 1 }); }
    else if (body.action === 'return') c.status = 'RETURNING';
    else throw oops(400, 'Pick an action.');
    send(res, 200, c);
  });

  // Bulk booking: preview with dry, then book every row with the chosen strategy.
  routes['POST /v1/hub/transport/bulk'] = hub(({ res, body, db, h }) => {
    const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 200);
    if (!rows.length) throw oops(400, 'Add at least one row.');
    const by = body.strategy === 'fastest' ? (a, b) => Date.parse(a.eta) - Date.parse(b.eta) : (a, b) => a.total - b.total;
    const results = rows.map((row, n) => {
      try {
        const route = engine.resolveRoute({ from_place: row.from, to_place: row.to });
        const input = engine.parseInput({ ...route, segment: 'b2c', weight: row.weight, priority: 'best' });
        const opts = engine.buildOptions(input).options.filter((o) => o.kind === 'courier').sort(by);
        if (!opts.length) throw new Error('No courier serves this route for this weight.');
        const option = opts[0];
        if (body.dry) return { n: n + 1, ok: true, provider: option.provider, total: option.total, from: input.from, to: input.to };
        if (!/^[6-9]\d{9}$/.test(row.phone || '')) throw new Error('Needs a 10-digit mobile number.');
        if (text(row.address, 200).length < 8) throw new Error('Needs a full delivery address.');
        takePayment(db, h, option.total, `${option.title} · ${option.provider}`);
        const { id } = engine.createBooking({ input, options: [option] }, option, { contact: { name: text(row.name, 60) || 'Receiver', phone: row.phone }, pickup_address: text(body.pickup_address, 200) || 'Saved pickup address', drop_address: text(row.address, 200) });
        addRecord(h, { id, booking_id: id, section: 'courier', title: option.title, provider: option.provider, sub: `${input.from} → ${input.to}`, amount: option.total, pay_mode: 'prepaid', status: 'BOOKED', label: 'Booking confirmed', weight: input.weight, drop_address: text(row.address, 200), receiver: { name: text(row.name, 60), phone: row.phone, consent: false } });
        return { n: n + 1, ok: true, id, provider: option.provider, total: option.total };
      } catch (e) { if (e.data || e.extra) throw e; return { n: n + 1, ok: false, error: e.message }; }
    });
    send(res, 200, { results, booked: results.filter((r) => r.ok).length, total: results.filter((r) => r.ok).reduce((s, r) => s + r.total, 0) });
  });

  // ---- 2. driver chat and calling ------------------------------------------------------
  const REPLIES = [[/where|location|reach|eta/i, 'I am on the way, should reach soon.'], [/call|phone/i, 'Please use the call button, it keeps both our numbers private.'], [/gate|floor|landmark|address/i, 'Got it, thank you. I will follow that.'], [/late|delay|wait/i, 'Sorry, there is some traffic. I am coming as fast as I can.']];
  routes['POST /v1/hub/orders/chat'] = hub(({ res, body, h }) => {
    const r = h.records.find((x) => x.id === body.id);
    if (!r || !r.booking_id) throw oops(404, 'Chat is not available for this booking.');
    const msg = text(body.text, 300);
    if (!msg) throw oops(400, 'Type a message.');
    r.chat = r.chat || [];
    r.chat.push({ from: 'you', text: msg, at: iso(Date.now()) });
    const hit = REPLIES.find(([re]) => re.test(msg));
    r.chat.push({ from: 'driver', text: hit ? hit[1] : 'Okay, noted.', at: iso(Date.now() + 1000) });
    send(res, 200, { chat: r.chat });
  });
  routes['POST /v1/hub/orders/call'] = hub(({ res, body, h }) => {
    const r = h.records.find((x) => x.id === body.id);
    if (!r || !r.booking_id) throw oops(404, 'Calling is not available for this booking.');
    send(res, 200, { masked: `+91 80•• ••${String(hash(r.id) % 9000 + 1000)}`, simulated: true });
  });

  // ---- 3. price lock and flexible trips -------------------------------------------------
  routes['GET /v1/hub/lock'] = hub(({ res, h }) => { h.locks = (h.locks || []).filter((l) => l.expires > Date.now()); send(res, 200, { data: h.locks }); });
  routes['POST /v1/hub/lock'] = hub(({ res, body, db, h, owner }) => {
    const e = hubCtx.offers.get(String(body.offer_id || ''));
    if (!e || e.owner !== owner || e.expires < Date.now()) throw oops(400, 'This price has expired. Please search again.');
    h.locks = h.locks || [];
    if (h.locks.some((l) => l.offer.id === e.offer.id)) throw oops(409, 'This price is already locked.');
    const fee = Math.min(499, Math.max(99, Math.round(e.offer.price * 0.02)));
    takePayment(db, h, fee, `Price lock · ${e.offer.record_title}`);
    const lock = { id: newId('PL'), offer: e.offer, fee, expires: Date.now() + 48 * 3600000 };
    h.locks.push(lock);
    send(res, 200, lock);
  });
  routes['POST /v1/hub/orders/reschedule'] = hub(({ res, body, h }) => {
    const r = h.records.find((x) => x.id === body.id);
    if (!r) throw oops(404, 'We could not find that booking.');
    if (!r.flex) throw oops(400, 'Only bookings with Flexible protection can be rescheduled for free.');
    if (r.status === 'CANCELLED') throw oops(400, 'This booking was cancelled.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || body.date < localDay(Date.now())) throw oops(400, 'Pick a date from today onwards.');
    if (r.rescheduled) throw oops(400, 'Flexible protection covers one free change.');
    r.rescheduled = true;
    r.sub = `${body.date} ${String(r.sub || '').replace(/^\d{4}-\d{2}-\d{2}\s*/, '')}`.trim();
    send(res, 200, { sub: r.sub });
  });

  // ---- 4. sandbox payment gateway, due payments --------------------------------------------
  routes['POST /v1/hub/payments/intent'] = hub(({ res, body, h }) => {
    const amount = Math.round(Number(body.amount));
    if (!(amount >= 100 && amount <= 100000)) throw oops(400, 'Add between ₹100 and ₹1,00,000.');
    if (!['upi', 'qr', 'netbanking', 'card'].includes(body.method)) throw oops(400, 'Pick a payment method.');
    const p = { id: newId('PAY'), amount, method: body.method, status: 'PENDING', at: iso(Date.now()) };
    P(h).payments.unshift(p);
    send(res, 200, p);
  });
  routes['POST /v1/hub/payments/confirm'] = hub(({ res, body, db, h }) => {
    const p = P(h).payments.find((x) => x.id === body.id);
    if (!p) throw oops(404, 'We could not find that payment.');
    if (p.status !== 'PENDING') throw oops(409, 'This payment has already finished.');
    if (body.result === 'success') { p.status = 'SUCCESS'; credit(db, p.amount, `Added by ${p.method.toUpperCase()} (sandbox) · ${p.id}`); } else p.status = 'FAILED';
    send(res, 200, { ...p, balance: db.balance });
  });
  routes['POST /v1/hub/autopay/pay-due'] = hub(({ res, body, db, h }) => {
    const limit = localDay(Date.now() + 7 * day);
    const due = h.accounts.filter((a) => a.type !== 'fastag' && a.next_due && a.next_due <= limit && (!body.id || a.id === body.id));
    if (!due.length) throw oops(400, 'Nothing is due in the next 7 days.');
    let paid = 0;
    due.forEach((a) => {
      takePayment(db, h, a.amount, `${a.provider} · ${a.label}`);
      addRecord(h, { section: ['bill', 'transfer'].includes(a.type) ? 'bills' : 'recharge', kind: a.type, title: a.type === 'transfer' ? `${a.provider} · regular payment` : a.type === 'bill' ? 'Bill payment' : 'Mobile recharge', provider: a.provider, sub: a.label, amount: a.amount, pay_mode: 'prepaid' });
      a.next_due = localDay(Date.parse(a.next_due) + 30 * day); paid += a.amount;
    });
    send(res, 200, { count: due.length, paid, wallet_balance: db.balance });
  });

  // ---- 5. spending limits and approvals ------------------------------------------------------
  const month = () => localDay(Date.now()).slice(0, 7);
  routes['GET /v1/hub/spend'] = hub(({ res, h, owner, role, user }) => {
    P(h);
    const members = [...memberships].filter(([, m]) => m.owner === owner).map(([key, m]) => ({ key, name: (users.get(key) || {}).name || key, role: m.role, used: (h.spend.usage[key] || {})[month()] || 0, rule: h.spend.rules[key] || null, allowance: h.spend.approved[key] || 0 }));
    send(res, 200, role === 'owner' ? { members, default_rule: h.spend.rules['*'] || null, requests: h.spend.requests } : { requests: h.spend.requests.filter((r) => r.by === user.key) });
  });
  routes['POST /v1/hub/spend/rule'] = hub(({ res, body, h, role }) => {
    ownerOnly(role); P(h);
    const key = text(body.key, 80);
    const monthly = Math.round(Number(body.monthly)) || 0; const perTxn = Math.round(Number(body.per_txn)) || 0;
    if (monthly < 0 || perTxn < 0) throw oops(400, 'Limits cannot be negative.');
    if (!monthly && !perTxn) delete h.spend.rules[key]; else h.spend.rules[key] = { monthly, per_txn: perTxn };
    send(res, 200, { ok: true });
  });
  routes['POST /v1/hub/spend/request'] = hub(({ res, body, h, user }) => {
    P(h);
    const amount = Math.round(Number(body.amount));
    if (!(amount > 0)) throw oops(400, 'Enter the amount.');
    const note = text(body.note, 200);
    if (note.length < 3) throw oops(400, 'Say what this payment is for.');
    const r = { id: newId('AP'), by: user.key, name: user.name || user.mobile || user.email, amount, note, status: 'PENDING', at: iso(Date.now()) };
    h.spend.requests.unshift(r);
    bizCtx.notify(h, 'return.updated', { title: 'Spending approval requested', body: `${r.name} · ₹${amount.toLocaleString('en-IN')} · ${note}` }, '#/business/spend');
    send(res, 200, r);
  });
  routes['POST /v1/hub/spend/decide'] = hub(({ res, body, h, role }) => {
    ownerOnly(role); P(h);
    const r = h.spend.requests.find((x) => x.id === body.id);
    if (!r) throw oops(404, 'We could not find that request.');
    if (r.status !== 'PENDING') throw oops(409, 'This request has already been decided.');
    r.status = body.approve ? 'APPROVED' : 'REJECTED';
    if (body.approve) h.spend.approved[r.by] = (h.spend.approved[r.by] || 0) + r.amount;
    send(res, 200, r);
  });

  // ---- 6. WhatsApp inbox, broadcasts, templates -----------------------------------------------
  routes['GET /v1/hub/biz/whatsapp/inbox'] = hub(({ res, h }) => {
    const b = bizCtx.bizOf(h);
    const threads = {};
    [...b.wa.log].reverse().forEach((m) => { (threads[m.to] = threads[m.to] || []).push(m); });
    send(res, 200, { threads: Object.entries(threads).map(([to, messages]) => ({ to, messages, last: messages[messages.length - 1], opted_out: b.wa.opted_out.includes(to) })).sort((a, c) => c.last.at.localeCompare(a.last.at)) });
  });
  routes['POST /v1/hub/biz/whatsapp/reply'] = hub(async ({ res, body, h }) => {
    const b = bizCtx.bizOf(h);
    const to = text(body.to, 10); const msg = text(body.text, 1000);
    if (!/^[6-9]\d{9}$/.test(to)) throw oops(400, 'Pick a conversation.');
    if (!msg) throw oops(400, 'Type a reply.');
    if (b.wa.opted_out.includes(to)) throw oops(400, 'This person has opted out.');
    const entry = bizCtx.logEntry(b, { to, body: msg, event: 'agent.reply', template: null });
    try { const r = await wa.sendText(to, msg); Object.assign(entry, { status: 'sent', wa_id: r.id, mode: r.mode }); } catch (e) { Object.assign(entry, { status: 'failed', error: e.message, mode: 'live' }); }
    send(res, 200, entry);
  });
  const tplView = (t) => (t.status === 'PENDING' && Date.now() - Date.parse(t.at) > 30000 ? { ...t, status: 'APPROVED' } : t);
  routes['GET /v1/hub/biz/whatsapp/templates'] = hub(({ res, h }) => send(res, 200, { builtin: Object.entries(wa.TEMPLATES).map(([name, body]) => ({ name, body, category: 'Utility', status: 'APPROVED' })), custom: P(h).templates.map(tplView) }));
  routes['POST /v1/hub/biz/whatsapp/templates'] = hub(({ res, body, h }) => {
    const p = P(h);
    const name = text(body.name, 40).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const content = text(body.body, 900);
    if (name.length < 3) throw oops(400, 'Give the template a name.');
    if (content.length < 10) throw oops(400, 'Write the message.');
    if (p.templates.some((t) => t.name === name) || wa.TEMPLATES[name]) throw oops(409, 'A template with that name already exists.');
    const t = { name, body: content, category: body.category === 'marketing' ? 'Marketing' : 'Utility', status: 'PENDING', at: iso(Date.now()) };
    p.templates.push(t);
    send(res, 200, t);
  });
  routes['POST /v1/hub/biz/whatsapp/broadcast'] = hub(async ({ res, body, h }) => {
    const b = bizCtx.bizOf(h); const p = P(h);
    const t = p.templates.map(tplView).find((x) => x.name === body.template);
    if (!t) throw oops(400, 'Pick a template.');
    if (t.status !== 'APPROVED') throw oops(400, 'This template is still waiting for approval.');
    const seen = new Map();
    h.records.forEach((r) => { if (r.receiver && r.receiver.phone && r.receiver.consent) seen.set(r.receiver.phone, r.receiver.name); });
    const list = [...seen].filter(([to]) => !b.wa.opted_out.includes(to));
    if (!list.length) throw oops(400, 'No one has agreed to receive messages yet.');
    for (const [to, name] of list) {
      const entry = bizCtx.logEntry(b, { to, body: t.body.replace(/\{\{1\}\}/g, name), template: t.name, event: 'broadcast' });
      try { const r = await wa.sendTemplate(to, t.name, [name]); Object.assign(entry, { status: 'sent', wa_id: r.id, mode: r.mode }); } catch (e) { Object.assign(entry, { status: 'failed', error: e.message, mode: 'live' }); }
    }
    send(res, 200, { sent: list.length, skipped_opted_out: seen.size - list.length });
  });

  // ---- 7. integrations and go-live checklist --------------------------------------------------
  routes['GET /v1/hub/integrations'] = hub(({ res, h }) => {
    const p = P(h);
    const list = INTEGRATIONS.map(([key, name, detail, group]) => { const s = p.integrations[key] || {}; return { key, name, detail, group, connected: !!s.connected, mode: 'Sandbox', last_test: s.last_test || null, latency: s.latency || null }; });
    const env = process.env;
    send(res, 200, { list, checklist: [
      ['Accounts and bookings saved to disk', true, 'Done. Move to a managed database before heavy traffic.'], ['Security headers and rate limits', true, 'Done.'], ['Health check endpoint', true, 'Done at /healthz.'],
      ['Google Maps key', !!env.GOOGLE_MAPS_API_KEY, 'Add GOOGLE_MAPS_API_KEY.'], ['WhatsApp Business API', wa.isLive(), 'Add your Meta credentials and approved templates.'], ['SMS provider for OTP', false, 'Sign up with an SMS provider. OTPs are shown on screen today.'],
      ['Signed courier and vehicle partner agreements', false, 'Needs contracts and live API keys.'], ['Licensed payment partner for the wallet', false, 'Holding customer money is regulated.'], ['GST structure confirmed by a chartered accountant', false, 'Decides if the single invoice is valid.'], ['Security audit and load test', false, 'Have an independent firm do this before launch.'],
    ].map(([label, done, note]) => ({ label, done, note })) });
  });
  routes['POST /v1/hub/integrations/connect'] = hub(({ res, body, h }) => {
    if (!INTEGRATIONS.some((x) => x[0] === body.key)) throw oops(404, 'Unknown integration.');
    const p = P(h); p.integrations[body.key] = { ...(p.integrations[body.key] || {}), connected: !!body.connected };
    send(res, 200, p.integrations[body.key]);
  });
  routes['POST /v1/hub/integrations/test'] = hub(({ res, body, h }) => {
    if (!INTEGRATIONS.some((x) => x[0] === body.key)) throw oops(404, 'Unknown integration.');
    const p = P(h); const latency = 80 + (hash(body.key + Math.floor(Date.now() / 60000)) % 300);
    p.integrations[body.key] = { ...(p.integrations[body.key] || {}), last_test: iso(Date.now()), latency };
    send(res, 200, { ok: true, latency, mode: 'Sandbox' });
  });
};
