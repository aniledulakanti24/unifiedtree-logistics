// Freight, credit and carrier connections (demo).
//   Business credit: a monthly credit line for business accounts. Bookings can be charged to it and
//   repaid from the wallet; each month is one statement.
//   Truck paperwork: consignment note (LR) on every truck booking, e-way bill generation (mimics the
//   government e-way bill API), proof of delivery upload, and detention (waiting) charges.
//   Carrier connections: each partner's API connection with sandbox or live mode, health, test calls
//   and a call log. Nothing here talks to a real carrier or the e-way bill portal.
'use strict';
const crypto = require('crypto');

const hash = (s) => parseInt(crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 8), 16);
const CREDIT_LIMIT = 100000;
// Partners, by what they carry. Mirrors the providers in the booking engine.
const CARRIERS = [
  ['Porter', 'Vehicles in the city'], ['Rapido', 'Vehicles in the city'], ['Uber', 'Vehicles in the city'], ['Borzo', 'Vehicles in the city'],
  ['Blue Dart', 'Courier'], ['Delhivery', 'Courier'], ['Xpressbees', 'Courier'], ['DTDC', 'Courier'], ['Ecom Express', 'Courier'], ['Shadowfax', 'Courier'], ['Ekart', 'Courier'], ['India Post', 'Courier'], ['Gati', 'Courier'], ['Safexpress', 'Courier'], ['TCI Express', 'Courier'],
  ['BlackBuck', 'Trucks'], ['Mahindra Logistics', 'Trucks'], ['TCI Freight', 'Trucks'], ['Highway Freightlines', 'Trucks'],
  ['DHL Express', 'International'], ['FedEx International', 'International'], ['Aramex', 'International'], ['UPS Worldwide', 'International'],
];
const CALLS = { rates: 'GET /rates', book: 'POST /shipments', track: 'GET /shipments/{id}/track', cancel: 'POST /shipments/{id}/cancel' };

module.exports = function register(routes, { send }, ctx, hubCtx) {
  const { iso, day } = ctx;
  const { hub, oops, text, takePayment, live, requireApproval } = hubCtx;
  const business = (h) => h.profile && h.profile.account_type === 'business';

  // ---- business credit --------------------------------------------------------------------------
  const creditOf = (h) => {
    const c = h.credit || { active: false, limit: 0, used: 0, ledger: [] };
    const now = new Date();
    const due = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    const month = now.toISOString().slice(0, 7);
    const lines = c.ledger.filter((l) => l.at.slice(0, 7) === month);
    return { active: !!c.active, limit: c.limit, used: c.used, available: Math.max(0, c.limit - c.used), due_date: iso(due.getTime()), cycle: 'Monthly · statement on the 1st, pay by the 15th', interest_free_days: 45,
      this_month: { spent: lines.filter((l) => l.type === 'charge').reduce((t, l) => t + l.amount, 0), repaid: lines.filter((l) => l.type === 'repay').reduce((t, l) => t + l.amount, 0) },
      ledger: c.ledger.slice(0, 40), months: [...new Set(c.ledger.map((l) => l.at.slice(0, 7)))].slice(0, 12) };
  };
  routes['GET /v1/hub/credit'] = hub(({ res, h }) => send(res, 200, { business: business(h), ...creditOf(h) }));
  routes['POST /v1/hub/credit/apply'] = hub(({ res, h }) => {
    if (!business(h)) throw oops(400, 'Business credit is for business accounts. Switch to Business first.');
    if (h.credit && h.credit.active) throw oops(400, 'Business credit is already on for this account.');
    // Demo check: a real lender would check GST filings, bank statements and a bureau score.
    h.credit = { active: true, limit: CREDIT_LIMIT, used: 0, ledger: [], opened: iso(Date.now()) };
    send(res, 200, creditOf(h));
  });
  routes['POST /v1/hub/credit/repay'] = hub(({ res, body, db, h }) => {
    const c = h.credit;
    if (!c || !c.active) throw oops(400, 'Business credit is not on for this account.');
    const amount = Math.round(Number(body.amount));
    if (!(amount > 0)) throw oops(400, 'Enter an amount to repay.');
    if (amount > c.used) throw oops(400, `You owe ${c.used}. Repay up to that amount.`);
    takePayment(db, h, amount, 'Business credit repayment');
    c.used -= amount;
    c.ledger.unshift({ id: 'CR' + crypto.randomBytes(4).toString('hex').toUpperCase(), at: iso(Date.now()), type: 'repay', amount, note: 'Repaid from wallet' });
    send(res, 200, { ...creditOf(h), wallet_balance: db.balance });
  });
  // The booking handler charges credit through this.
  const chargeCredit = (h, amount, note, ref) => {
    const c = h.credit;
    if (!business(h)) throw oops(400, 'Business credit is for business accounts.');
    if (!c || !c.active) throw oops(400, 'Turn on business credit first, in Wallet → Business credit.');
    if (c.limit - c.used < amount) throw oops(400, `Not enough credit left: ₹${(c.limit - c.used).toLocaleString('en-IN')} available. Repay some, or pay from the wallet.`);
    c.used += amount;
    c.ledger.unshift({ id: 'CR' + crypto.randomBytes(4).toString('hex').toUpperCase(), at: iso(Date.now()), type: 'charge', amount, note, ref });
  };
  const creditCheck = (h, amount) => { const c = h.credit; if (!business(h) || !c || !c.active) throw oops(400, 'Turn on business credit first.'); if (c.limit - c.used < amount) throw oops(400, `Not enough credit left: ₹${(c.limit - c.used).toLocaleString('en-IN')} available.`); };

  // ---- truck paperwork --------------------------------------------------------------------------
  const truckRec = (h, id) => {
    const r = h.records.find((x) => x.id === id);
    if (!r) throw oops(404, 'We could not find that booking.');
    if (!r.freight) throw oops(400, 'Freight documents are for truck and van bookings.');
    return r;
  };
  // Detention: free hours at each end, then an hourly charge. Waiting time is simulated once the
  // truck reaches each end.
  const detentionOf = (rec) => {
    const r = live ? { ...rec, ...live(rec) } : rec;
    const f = rec.freight; const seed = hash(rec.id);
    const reached = ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(r.status) || r.group === 'transit' || r.group === 'delivered';
    const delivered = r.status === 'DELIVERED' || r.group === 'delivered';
    const load = reached ? 70 + (seed % 140) : null; const unload = delivered ? 50 + ((seed >> 3) % 170) : null;
    const over = (m) => (m == null ? 0 : Math.max(0, Math.ceil((m - f.free_hours * 60) / 60)));
    const hours = over(load) + over(unload);
    const charge = hours * f.rate_per_hour;
    // Billed once the truck is unloaded; until then it is an estimate.
    return { free_hours: f.free_hours, rate_per_hour: f.rate_per_hour, loading_mins: load, unloading_mins: unload, chargeable_hours: hours, charge, final: delivered, paid: f.detention_paid || null, due: delivered && charge && !f.detention_paid ? charge : 0 };
  };
  routes['GET /v1/hub/freight'] = hub(({ res, url, h }) => {
    const r = truckRec(h, url.searchParams.get('id'));
    send(res, 200, { ...r.freight, detention: detentionOf(r), value: r.declared || (r.form && Number(r.form.value)) || 0, needs_ewb: (r.declared || (r.form && Number(r.form.value)) || 0) > 50000 });
  });
  // Paying detention: from the wallet or business credit, with the person's approval.
  routes['POST /v1/hub/freight/detention/pay'] = hub(({ res, body, db, h }) => {
    const r = truckRec(h, String(body.id || ''));
    const dt = detentionOf(r);
    if (!dt.due) throw oops(400, dt.paid ? 'Detention is already paid.' : 'Nothing is due yet. It is billed once the truck is unloaded.');
    const credit = body.pay_from === 'credit';
    if (body.dry_run) return send(res, 200, { ok: true, amount: dt.due });
    requireApproval(h, dt.due, credit);
    if (credit) chargeCredit(h, dt.due, `Detention · ${r.provider} · ${r.id}`, r.id); else takePayment(db, h, dt.due, `Detention · ${r.provider} · ${r.id}`);
    delete h.payApproval;
    r.freight.detention_paid = { amount: dt.due, at: iso(Date.now()), via: credit ? 'credit' : 'wallet', hours: dt.chargeable_hours };
    send(res, 200, { id: r.id, amount: dt.due, pay_via: credit ? 'credit' : 'wallet', wallet_balance: db.balance });
  });
  // E-way bill: mirrors the government API. Part A is the invoice; Part B the vehicle.
  routes['POST /v1/hub/freight/ewaybill'] = hub(({ res, body, h }) => {
    const r = truckRec(h, String(body.id || ''));
    if (r.status === 'CANCELLED') throw oops(400, 'This booking is cancelled.');
    const inv = text(body.invoice_no, 16); const value = Math.round(Number(body.invoice_value)); const hsn = String(body.hsn || '').trim();
    if (!/^[A-Za-z0-9/-]{1,16}$/.test(inv)) throw oops(400, 'Enter the invoice number (letters, digits, / or -).');
    if (!(value > 0)) throw oops(400, 'Enter the invoice value in rupees.');
    if (!/^\d{4,8}$/.test(hsn)) throw oops(400, 'Enter the HSN code of the goods (4 to 8 digits).');
    if (body.to_gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(body.to_gstin).toUpperCase())) throw oops(400, 'Enter a valid receiver GSTIN, or leave it blank for an unregistered receiver.');
    const km = r.freight.km || 300;
    const now = Date.now();
    // Validity: 1 day for every 200 km (normal cargo), ending at midnight.
    const validDays = Math.max(1, Math.ceil(km / 200));
    const until = new Date(now + validDays * day); until.setHours(23, 59, 59, 0);
    r.freight.ewb = { no: String(100000000000 + (hash(r.id + inv) % 899999999999)).slice(0, 12), at: iso(now), valid_until: iso(until.getTime()), invoice_no: inv, invoice_value: value, hsn, to_gstin: body.to_gstin ? String(body.to_gstin).toUpperCase() : null, vehicle_no: r.freight.vehicle_no, km, part_b: !!r.freight.vehicle_no, status: 'ACTIVE' };
    send(res, 200, r.freight.ewb);
  });
  routes['POST /v1/hub/freight/ewaybill/cancel'] = hub(({ res, body, h }) => {
    const r = truckRec(h, String(body.id || ''));
    const e = r.freight.ewb;
    if (!e || e.status !== 'ACTIVE') throw oops(400, 'There is no active e-way bill on this booking.');
    if (Date.now() - Date.parse(e.at) > day) throw oops(400, 'An e-way bill can be cancelled only within 24 hours of generating it.');
    e.status = 'CANCELLED'; e.cancelled_at = iso(Date.now());
    send(res, 200, e);
  });
  // Proof of delivery: receiver name, a note and a photo of the signed LR.
  routes['POST /v1/hub/freight/pod'] = hub(({ res, body, h }) => {
    const r = truckRec(h, String(body.id || ''));
    const name = text(body.receiver_name, 60);
    if (name.length < 2) throw oops(400, 'Enter the name of the person who received the goods.');
    const photo = typeof body.photo === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(body.photo) ? body.photo : null;
    if (photo && photo.length > 450000) throw oops(400, 'The photo is too large. Use one under 300 KB.');
    r.freight.pod = { receiver_name: name, remarks: text(body.remarks, 200), photo, at: iso(Date.now()), shortage: !!body.shortage, damage: !!body.damage };
    send(res, 200, r.freight.pod);
  });

  // ---- carrier connections ----------------------------------------------------------------------
  const conn = (h, name) => { h.carriers = h.carriers || {}; return (h.carriers[name] = h.carriers[name] || { mode: 'sandbox', agreement: false }); };
  const log = (h, entry) => { h.carrier_log = [{ at: iso(Date.now()), ...entry }, ...(h.carrier_log || [])].slice(0, 60); };
  const viewOf = (h, [name, kind]) => {
    const c = conn(h, name); const seed = hash(name + new Date().toISOString().slice(0, 13));
    const used = h.records.filter((r) => r.provider === name && Date.now() - Date.parse(r.at) < 7 * day).length;
    return { name, kind, mode: c.mode, agreement: c.agreement, signed_at: c.signed_at || null, health: seed % 23 === 0 ? 'degraded' : 'ok', uptime: +(99 + (seed % 99) / 100).toFixed(2), p95_ms: 180 + (seed % 520), rate_sync_min: 1 + (seed % 14), webhooks_ok: +(97 + (seed % 30) / 10).toFixed(1), bookings_7d: used, endpoints: Object.keys(CALLS) };
  };
  routes['GET /v1/hub/carriers'] = hub(({ res, h }) => {
    const list = CARRIERS.map((c) => viewOf(h, c));
    send(res, 200, { data: list, live: list.filter((c) => c.mode === 'live').length, total: list.length, log: (h.carrier_log || []).slice(0, 30) });
  });
  routes['POST /v1/hub/carriers/test'] = hub(({ res, body, h }) => {
    const c = CARRIERS.find((x) => x[0] === body.name); if (!c) throw oops(400, 'Pick a carrier.');
    const call = CALLS[body.call] ? body.call : 'rates';
    const v = viewOf(h, c); const ms = Math.round(v.p95_ms * (0.4 + Math.random() * 0.6));
    const ok = v.health === 'ok' || Math.random() > 0.4;
    const sample = { rates: { lane: '560034 → 400053', weight_kg: 2, options: [{ service: 'Surface', rate: 96, days: 4 }, { service: 'Express', rate: 148, days: 2 }] }, book: { awb: String(hash(Date.now()) % 1e10).padStart(10, '7'), label_url: 'https://sandbox.example/label.pdf', pickup: 'scheduled' }, track: { status: 'IN_TRANSIT', last_scan: 'Hub, Bengaluru', eta: iso(Date.now() + 2 * day) }, cancel: { cancelled: true } }[call];
    const entry = { carrier: c[0], call: CALLS[call], mode: v.mode, status: ok ? 200 : 503, ms };
    log(h, entry);
    send(res, 200, { ...entry, ok, response: ok ? sample : { error: 'Service temporarily unavailable', retry_after: 30 } });
  });
  routes['POST /v1/hub/carriers/agreement'] = hub(({ res, body, h }) => {
    const c = CARRIERS.find((x) => x[0] === body.name); if (!c) throw oops(400, 'Pick a carrier.');
    const x = conn(h, c[0]); x.agreement = true; x.signed_at = iso(Date.now());
    log(h, { carrier: c[0], call: 'Agreement signed', mode: x.mode, status: 200, ms: 0 });
    send(res, 200, viewOf(h, c));
  });
  routes['POST /v1/hub/carriers/mode'] = hub(({ res, body, h }) => {
    const c = CARRIERS.find((x) => x[0] === body.name); if (!c) throw oops(400, 'Pick a carrier.');
    const mode = body.mode === 'live' ? 'live' : 'sandbox';
    const x = conn(h, c[0]);
    if (mode === 'live' && !x.agreement) throw oops(400, `Sign the ${c[0]} agreement before going live.`);
    x.mode = mode;
    log(h, { carrier: c[0], call: mode === 'live' ? 'Switched to live' : 'Switched to sandbox', mode, status: 200, ms: 0 });
    send(res, 200, viewOf(h, c));
  });

  return { chargeCredit, creditCheck };
};
