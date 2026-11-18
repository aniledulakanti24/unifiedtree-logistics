// Seven more aggregator-only features (demo). None of them makes UT Log pay out of pocket:
//   1 Arrival cab-share  – travellers on the same train or flight heading the same way share one cab.
//                          The solo fare is held; the unused part is refunded once riders are matched.
//   2 Split-pay groups   – the organiser pays their share, the rest pay by link; it books when all have paid.
//   3 Weight proof       – the rider photographs the parcel on a scale at pickup; weight disputes are answered with it.
//   4 Address check      – an address score before shipping, and a link for the buyer to confirm it.
//   5 Return pooling     – returns from one area travel back together in one pickup.
//   6 Unboxing video     – recorded on the receiver link (see booking-api); it backs a damage claim.
//   7 Travel policy      – company rules; bookings outside them wait for an approver.
'use strict';
const crypto = require('crypto');

const hash = (s) => parseInt(crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 8), 16);
const rid = (p) => p + crypto.randomBytes(4).toString('hex').toUpperCase();
const key = () => crypto.randomBytes(9).toString('base64url');
const NAMES = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Isha', 'Arjun', 'Neha', 'Vihaan', 'Ananya', 'Karan', 'Pooja', 'Siddharth', 'Riya'];
const SHIP = ['courier', 'vehicle', 'logistics', 'international'];

module.exports = function register(routes, { send }, ctx, bookingCtx, hubCtx) {
  const { iso, day, credit } = ctx;
  const { hub, oops, text, takePayment, addRecord, requireApproval, late } = hubCtx;
  const now = () => Date.now();

  // ---- 1. arrival cab-share -------------------------------------------------------------------------
  // Upcoming flights, trains and buses: the arrival city is after the arrow in the title.
  const arrivalsOf = (h) => (h.records || []).filter((r) => r.section === 'travel' && String(r.title || '').includes('→') && ['flight', 'train', 'bus'].includes(r.kind || (/flight|train|bus/i.exec(r.title) || [''])[0].toLowerCase()) && r.status !== 'CANCELLED')
    .slice(0, 8).map((r) => {
      const to = String(r.title || '').split('→').pop().replace(/ via .*/, '').trim();
      const mode = r.kind || (/flight/i.test(r.title) ? 'flight' : /train/i.test(r.title) ? 'train' : 'bus');
      return { id: r.id, mode, title: r.title, provider: r.provider, sub: r.record_sub || r.sub || '', city: to, ref: r.pnr || r.id, hub: mode === 'flight' ? `${to} airport` : mode === 'train' ? `${to} railway station` : `${to} bus stand` };
    });
  const csQuotes = new Map();
  routes['GET /v1/hub/cabshare'] = hub(({ res, h }) => send(res, 200, { arrivals: arrivalsOf(h), rides: h.cabshares || [] }));
  routes['POST /v1/hub/cabshare/quote'] = hub(({ res, body, h, owner }) => {
    const a = arrivalsOf(h).find((x) => x.id === body.arrival_id);
    const hubName = a ? a.hub : text(body.hub, 60);
    const drop = text(body.drop, 60);
    if (hubName.length < 3) throw oops(400, 'Pick your arrival, or type the station or airport.');
    if (drop.length < 3) throw oops(400, 'Enter the area you are going to.');
    const seats = Math.min(3, Math.max(1, Number(body.seats) || 1));
    const seed = hash(hubName + drop.toLowerCase() + (a ? a.ref : ''));
    const km = 7 + (seed % 24);
    const solo = Math.round((70 + km * 19) / 5) * 5;
    const others = seed % 7 === 0 ? 0 : 1 + (seed % 3); // people on the same arrival heading the same way
    const riders = Math.min(4, others + seats);
    const perSeat = Math.ceil((solo * 1.12) / riders) * seats; // 12% for the pickup wait and detour, so it never costs us
    const q = { id: rid('CQ'), owner, hub: hubName, drop, km, seats, solo, others, riders, est_share: Math.min(solo, perSeat), save: Math.max(0, solo - Math.min(solo, perSeat)), arrival: a || null, expires: now() + 15 * 60000,
      mates: Array.from({ length: others }, (_, n) => ({ name: NAMES[(seed >> (n * 3)) % NAMES.length], to: n === 0 ? drop : `Near ${drop}`, bags: 1 + ((seed >> n) % 2) })) };
    csQuotes.set(q.id, q);
    send(res, 200, q);
  });
  routes['POST /v1/hub/cabshare/join'] = hub(({ res, body, db, h, owner }) => {
    const q = csQuotes.get(String(body.quote_id || ''));
    if (!q || q.owner !== owner || q.expires < now()) throw oops(400, 'This quote has expired. Check again.');
    requireApproval(h, q.solo);
    takePayment(db, h, q.solo, `Shared cab hold · ${q.hub} → ${q.drop}`);
    delete h.payApproval;
    csQuotes.delete(q.id);
    const rec = addRecord(h, { section: 'rides', kind: 'ride', title: `Shared cab · ${q.hub} → ${q.drop}`, provider: 'UT Log Cab-share', sub: `${q.seats} seat${q.seats > 1 ? 's' : ''} · matching riders`, amount: q.solo, pay_mode: 'prepaid', pay_via: 'wallet', status: 'IN_PROGRESS', label: 'Matching riders' });
    h.cabshares = h.cabshares || [];
    const ride = { id: rid('CS'), record_id: rec.id, hub: q.hub, drop: q.drop, seats: q.seats, held: q.solo, others: q.others, riders: q.riders, est_share: q.est_share, mates: q.mates, status: 'MATCHING', match_at: now() + 40000, at: iso(now()), arrival: q.arrival };
    h.cabshares.unshift(ride);
    send(res, 200, { id: ride.id, record_id: rec.id, amount: q.solo, wallet_balance: db.balance });
  });
  const sweepCabs = (db, h) => {
    for (const c of h.cabshares || []) {
      if (c.status !== 'MATCHING' || c.match_at > now()) continue;
      const rec = (h.records || []).find((r) => r.id === c.record_id);
      if (!c.others) { c.status = 'SOLO'; c.paid = c.held; if (rec) { rec.status = 'SUCCESS'; rec.label = 'Ride alone · nobody to share'; rec.sub = `${c.seats} seat · no co-riders`; } continue; }
      c.status = 'MATCHED'; c.paid = c.est_share; c.refund = c.held - c.est_share;
      c.cab = { driver: ['Ravi K', 'Suresh M', 'Imran S', 'Prakash D'][hash(c.id) % 4], vehicle: `KA 0${1 + (hash(c.id) % 9)} ${['MD', 'AB', 'HN'][hash(c.id) % 3]} ${1000 + (hash(c.id) % 8999)}`, model: c.riders > 3 ? 'Innova (6 seats)' : 'Dzire (4 seats)', meet: ['Exit gate 2, pickup bay B', 'Platform 1 exit, near the prepaid booth', 'Arrivals, pillar 6'][hash(c.hub) % 3], otp: 1000 + (hash(c.id + 'o') % 8999) };
      if (c.refund > 0) credit(db, c.refund, `Cab-share refund · ${c.riders} riders matched`);
      if (rec) { rec.amount = c.paid; rec.refund = c.refund; rec.refund_to = 'wallet'; rec.status = 'SUCCESS'; rec.label = `${c.riders} riders · cab assigned`; rec.sub = `${c.seats} seat${c.seats > 1 ? 's' : ''} · shared with ${c.others}`; }
    }
  };

  // ---- 2. split-pay group bookings -------------------------------------------------------------------
  // Groups are also kept in memory by id, so the public pay link finds them; every hub request re-registers them.
  const groups = new Map();
  const listGroups = (h) => (h.splits = h.splits || []);
  const pubGroup = (g) => ({ id: g.id, title: g.title, kind: g.kind, total: g.total, organiser: g.organiser, deadline: g.deadline, status: g.status,
    members: g.members.map((m) => ({ name: m.name, share: m.share, paid: !!m.paid_at, me: !!m.organiser })) });
  const confirmGroup = (h, g) => {
    if (g.status !== 'COLLECTING' || !g.members.every((m) => m.paid_at)) return;
    g.status = 'CONFIRMED'; g.confirmed_at = iso(now());
    const rec = addRecord(h, { section: g.kind === 'stay' ? 'travel' : g.kind === 'ride' ? 'rides' : 'travel', kind: g.kind, title: g.title, provider: g.provider || 'Split-pay group', sub: `${g.members.length} people · split ${g.members.length} ways`, amount: g.total, pay_mode: 'prepaid', pay_via: 'split', reference: g.id, pnr: ['flight', 'train', 'bus'].includes(g.kind) ? crypto.randomBytes(3).toString('hex').toUpperCase() : null });
    g.record_id = rec.id;
  };
  routes['GET /v1/hub/splitpay'] = hub(({ res, h }) => send(res, 200, { data: listGroups(h).map((g) => ({ ...pubGroup(g), record_id: g.record_id, members: g.members.map((m) => ({ ...m, link: m.organiser ? null : `/r/pay.html?g=${g.id}&k=${m.key}` })) })) }));
  routes['POST /v1/hub/splitpay/create'] = hub(({ res, body, db, h, user }) => {
    const title = text(body.title, 80); const total = Math.round(Number(body.total));
    const kind = ['flight', 'train', 'bus', 'stay', 'ride', 'other'].includes(body.kind) ? body.kind : 'other';
    const list = (Array.isArray(body.members) ? body.members : []).slice(0, 11).map((m) => ({ name: text(m.name, 40), phone: String(m.phone || '').replace(/\D/g, '').slice(-10) })).filter((m) => m.name);
    if (title.length < 3) throw oops(400, 'Name the booking, for example "Goa trip flights".');
    if (!(total >= 100 && total <= 500000)) throw oops(400, 'Enter a total between ₹100 and ₹5,00,000.');
    if (!list.length) throw oops(400, 'Add at least one other person.');
    if (list.some((m) => !/^[6-9]\d{9}$/.test(m.phone))) throw oops(400, 'Give each person a 10-digit mobile number.');
    const hours = Math.min(48, Math.max(1, Number(body.hours) || 6));
    const n = list.length + 1; const each = Math.floor(total / n); const mine = total - each * list.length;
    if (body.dry_run) return send(res, 200, { ok: true, amount: mine, each });
    requireApproval(h, mine);
    takePayment(db, h, mine, `Your share · ${title}`);
    delete h.payApproval;
    const organiser = (h.profile && h.profile.name) || (user && user.name) || 'You';
    const g = { id: rid('SP'), title, kind, total, provider: text(body.provider, 40), organiser, status: 'COLLECTING', at: iso(now()), deadline: iso(now() + hours * 3600000),
      members: [{ name: organiser, share: mine, organiser: true, paid_at: iso(now()), via: 'wallet' }, ...list.map((m) => ({ ...m, share: each, key: key(), paid_at: null }))] };
    listGroups(h).unshift(g); groups.set(g.id, { g, h, db });
    send(res, 200, { id: g.id, amount: mine, wallet_balance: db.balance });
  });
  routes['POST /v1/hub/splitpay/remind'] = hub(({ res, body, h }) => {
    const g = listGroups(h).find((x) => x.id === body.id); if (!g) throw oops(404, 'Group not found.');
    const pending = g.members.filter((m) => !m.paid_at).length;
    send(res, 200, { ok: true, sent: pending });
  });
  routes['POST /v1/hub/splitpay/simulate'] = hub(({ res, body, h }) => {
    const g = listGroups(h).find((x) => x.id === body.id); if (!g || g.status !== 'COLLECTING') throw oops(400, 'This group is not collecting any more.');
    const m = g.members.find((x) => !x.paid_at); if (!m) throw oops(400, 'Everyone has paid.');
    m.paid_at = iso(now()); m.via = 'UPI (demo)';
    confirmGroup(h, g);
    send(res, 200, { ok: true, status: g.status });
  });
  routes['POST /v1/hub/splitpay/cancel'] = hub(({ res, body, db, h }) => {
    const g = listGroups(h).find((x) => x.id === body.id); if (!g || g.status !== 'COLLECTING') throw oops(400, 'Only a group still collecting can be cancelled.');
    refundGroup(db, g, 'CANCELLED');
    send(res, 200, { ok: true });
  });
  function refundGroup(db, g, status) {
    g.status = status;
    for (const m of g.members) if (m.paid_at) { m.refunded = true; if (m.organiser) credit(db, m.share, `Refund · ${g.title} (${status === 'EXPIRED' ? 'not everyone paid' : 'cancelled'})`); }
  }
  routes['GET /v1/public/splitpay'] = async (req, res, body, url) => {
    const e = groups.get(url.searchParams.get('g') || ''); const m = e && e.g.members.find((x) => x.key && x.key === url.searchParams.get('k'));
    if (!m) return send(res, 404, { message: 'This pay link has expired or is not right. Ask the organiser for a new one.' });
    send(res, 200, { ...pubGroup(e.g), you: { name: m.name, share: m.share, paid: !!m.paid_at } });
  };
  routes['POST /v1/public/splitpay'] = async (req, res, body) => {
    const e = groups.get(String(body.g || '')); const m = e && e.g.members.find((x) => x.key && x.key === String(body.k || ''));
    if (!m) return send(res, 404, { message: 'This pay link has expired or is not right.' });
    if (e.g.status !== 'COLLECTING') return send(res, 400, { message: e.g.status === 'CONFIRMED' ? 'Everyone has paid; it is booked.' : 'This booking was not completed; any money paid is refunded.' });
    if (Date.parse(e.g.deadline) < now()) return send(res, 400, { message: 'The time to pay has passed.' });
    if (!m.paid_at) { m.paid_at = iso(now()); m.via = ['gpay', 'phonepe', 'paytm', 'bhim'].includes(body.app) ? `UPI · ${body.app}` : 'UPI'; confirmGroup(e.h, e.g); }
    send(res, 200, { ...pubGroup(e.g), you: { name: m.name, share: m.share, paid: true } });
  };
  const sweepSplits = (db, h) => {
    for (const g of h.splits || []) {
      if (!groups.has(g.id)) groups.set(g.id, { g, h, db });
      else { const e = groups.get(g.id); e.h = h; e.db = db; }
      if (g.status === 'COLLECTING' && Date.parse(g.deadline) < now()) refundGroup(db, g, 'EXPIRED');
    }
  };

  // ---- 3. weight proof at pickup ---------------------------------------------------------------------
  // Made once, when the order exists: the scale reading is within ±3% of what was declared.
  const proofOf = (r) => {
    if (r.wproof) return r.wproof;
    const declared = Number(r.weight) || 0.5; const s = hash(r.id + 'w');
    const kg = Math.max(0.05, Math.round(declared * (0.97 + (s % 61) / 1000) * 100) / 100);
    r.wproof = { kg, declared, at: iso(Date.parse(r.at) + (20 + (s % 70)) * 60000), rider: ['Manoj', 'Faisal', 'Kiran', 'Deepak', 'Santosh'][s % 5], scale: `UT-SC-${1000 + (s % 8999)}`, calibrated: iso(Date.parse(r.at) - (3 + (s % 20)) * day),
      dims: [20 + (s % 25), 15 + (s % 18), 8 + (s % 14)], gps: `${(12.9 + (s % 100) / 1000).toFixed(4)}, ${(77.58 + (s % 90) / 1000).toFixed(4)}`, seal: crypto.createHash('sha256').update(`${r.id}|${kg}|${s}`).digest('hex').slice(0, 16) };
    return r.wproof;
  };
  const shipOf = (h) => (h.records || []).filter((r) => SHIP.includes(r.section) && r.status !== 'CANCELLED');
  routes['GET /v1/hub/weightproof'] = hub(({ res, url, h }) => {
    const id = url.searchParams.get('id');
    if (id) { const r = (h.records || []).find((x) => x.id === id && SHIP.includes(x.section)); if (!r) throw oops(404, 'Order not found.'); return send(res, 200, { id: r.id, title: r.title, provider: r.provider, proof: proofOf(r), disputes: (h.wdisputes || []).filter((d) => d.id === r.id) }); }
    const list = shipOf(h).slice(0, 40).map((r) => ({ id: r.id, title: r.title, provider: r.provider, sub: r.sub, at: r.at, proof: proofOf(r) }));
    const ds = h.wdisputes || [];
    send(res, 200, { data: list, disputes: ds, saved: ds.filter((d) => d.outcome === 'REJECTED').reduce((t, d) => t + d.extra, 0), won: ds.filter((d) => d.outcome === 'REJECTED').length, lost: ds.filter((d) => d.outcome === 'ACCEPTED').length });
  });
  // Demo: the carrier re-weighs at their hub and asks for more. The pickup proof answers it.
  routes['POST /v1/hub/weightproof/dispute'] = hub(({ res, body, h }) => {
    const r = shipOf(h).find((x) => x.id === body.id); if (!r) throw oops(404, 'Order not found.');
    const p = proofOf(r); const s = hash(r.id + 'd' + (h.wdisputes || []).length);
    const claimed = Math.round((p.kg * (s % 5 === 0 ? 1.02 : 1.25 + (s % 40) / 100) + 0.0001) * 100) / 100;
    const courier = r.section === 'courier' || r.section === 'international';
    const slabs = (kg) => Math.ceil(kg / (courier ? 0.5 : 10)); // couriers bill per 500 g, vans and trucks per 10 kg
    const extra = Math.max(0, (slabs(claimed) - slabs(p.kg)) * (courier ? 38 : 120));
    const within = claimed <= p.kg * 1.05;
    const d = { id: r.id, case: rid('WD'), carrier: r.provider, claimed, proof_kg: p.kg, extra, at: iso(now()), outcome: within ? 'ACCEPTED' : 'REJECTED',
      reason: within ? 'Their reading is within 5% of the pickup weight, so it stands.' : `Pickup photo ${p.seal} shows ${p.kg} kg on a calibrated scale. The carrier's ${claimed} kg is rejected; no extra charge.` };
    (h.wdisputes = h.wdisputes || []).unshift(d);
    send(res, 200, d);
  });

  // ---- 4. address confidence -------------------------------------------------------------------------
  const LANDMARK = /\b(near|opp|opposite|behind|beside|next to|landmark|above|below|adjacent|in front of)\b/i;
  function scoreAddress(addr, pin, phone) {
    const a = String(addr || '').trim(); const p = String(pin || '').trim();
    const fails = 4 + (hash(p) % 27); // past failed deliveries at this pin code, per cent
    const checks = [
      [/\b(\d+[a-z]?|[a-z]-?\d+)\b/i.test(a) && /(flat|house|h\.?no|door|plot|#|no\.?|floor|\d+\s*[,/-])/i.test(a), 22, 'House or flat number', 'Add the house, flat or door number.'],
      [/(road|rd|street|st|lane|cross|main|nagar|layout|colony|sector|block|phase|marg|avenue)/i.test(a), 16, 'Street or area', 'Add the street, cross or area name.'],
      [LANDMARK.test(a), 14, 'Landmark', 'Add a landmark, e.g. "near Ganesh temple".'],
      [a.length >= 30, 10, 'Enough detail', 'The address is very short.'],
      [/^[1-8]\d{5}$/.test(p), 18, 'Valid pin code', 'Enter a 6-digit pin code.'],
      [!phone || /^[6-9]\d{9}$/.test(String(phone).replace(/\D/g, '').slice(-10)), 10, 'Reachable phone', 'The phone number does not look right.'],
      [!/(same as|n\/a|na$|test|asdf|xxx|\?\?)/i.test(a), 10, 'Not a placeholder', 'This looks like a placeholder, not a real address.'],
    ].map(([ok, w, label, tip]) => ({ ok: !!ok, w, label, tip }));
    let score = checks.reduce((t, c) => t + (c.ok ? c.w : 0), 0);
    score = Math.max(0, Math.min(100, score - Math.round(fails / 4)));
    return { score, grade: score >= 80 ? 'strong' : score >= 60 ? 'okay' : 'weak', checks, pin_fail_rate: fails, rto_risk: score >= 80 ? 'Low' : score >= 60 ? 'Medium' : 'High' };
  }
  const addrReqs = new Map();
  routes['POST /v1/hub/address/check'] = hub(({ res, body }) => {
    const address = text(body.address, 240);
    if (address.length < 5) throw oops(400, 'Paste the delivery address.');
    send(res, 200, { address, pin: text(body.pin, 6) || (address.match(/\b[1-8]\d{5}\b/) || [''])[0], ...scoreAddress(address, body.pin || (address.match(/\b[1-8]\d{5}\b/) || [''])[0], body.phone) });
  });
  routes['GET /v1/hub/address'] = hub(({ res, h }) => send(res, 200, { data: (h.addrConfirms || []).map((c) => ({ ...c, link: `/r/address.html?c=${c.id}&k=${c.key}` })) }));
  routes['POST /v1/hub/address/confirm'] = hub(({ res, body, h, db }) => {
    const address = text(body.address, 240); const name = text(body.name, 40); const phone = String(body.phone || '').replace(/\D/g, '').slice(-10);
    if (address.length < 5) throw oops(400, 'Paste the delivery address.');
    if (!/^[6-9]\d{9}$/.test(phone)) throw oops(400, 'Enter the buyer\'s 10-digit mobile number.');
    const pin = text(body.pin, 6) || (address.match(/\b[1-8]\d{5}\b/) || [''])[0];
    const c = { id: rid('AC'), key: key(), name: name || 'Buyer', phone, address, pin, before: scoreAddress(address, pin, phone).score, status: 'SENT', at: iso(now()), order: text(body.order, 20) };
    (h.addrConfirms = h.addrConfirms || []).unshift(c); addrReqs.set(c.id, { c, h, db });
    send(res, 200, { ...c, link: `/r/address.html?c=${c.id}&k=${c.key}` });
  });
  const pubAddr = (c) => ({ name: c.name, address: c.address, pin: c.pin, status: c.status, landmark: c.landmark || '', phone: `${c.phone.slice(0, 2)}••••••${c.phone.slice(-2)}` });
  routes['GET /v1/public/address'] = async (req, res, body, url) => {
    const e = addrReqs.get(url.searchParams.get('c') || ''); if (!e || e.c.key !== url.searchParams.get('k')) return send(res, 404, { message: 'This link has expired. Ask the seller to send it again.' });
    send(res, 200, pubAddr(e.c));
  };
  routes['POST /v1/public/address'] = async (req, res, body) => {
    const e = addrReqs.get(String(body.c || '')); if (!e || e.c.key !== String(body.k || '')) return send(res, 404, { message: 'This link has expired.' });
    const c = e.c; if (c.status !== 'SENT') return send(res, 400, { message: 'You have already answered. Thank you.' });
    const clean = (x, n) => String(x || '').replace(/[<>]/g, '').trim().slice(0, n);
    if (body.action === 'edit') { const a = clean(body.address, 240); if (a.length < 15) return send(res, 400, { message: 'Enter the full address.' }); c.address = a; c.status = 'UPDATED'; }
    else c.status = 'CONFIRMED';
    const lm = clean(body.landmark, 80); if (lm) c.landmark = lm;
    c.after = scoreAddress(c.address + (c.landmark ? `, near ${c.landmark}` : ''), c.pin, c.phone).score; c.answered_at = iso(now());
    send(res, 200, pubAddr(c));
  };
  routes['POST /v1/hub/address/simulate'] = hub(({ res, body, h }) => {
    const c = (h.addrConfirms || []).find((x) => x.id === body.id && x.status === 'SENT'); if (!c) throw oops(400, 'Nothing is waiting for the buyer.');
    c.landmark = 'Opposite the Ganesh temple'; c.status = 'CONFIRMED'; c.after = scoreAddress(`${c.address}, near ${c.landmark}`, c.pin, c.phone).score; c.answered_at = iso(now());
    send(res, 200, c);
  });
  const sweepAddr = (db, h) => { for (const c of h.addrConfirms || []) if (!addrReqs.has(c.id)) addrReqs.set(c.id, { c, h, db }); };

  // ---- 5. return pooling -----------------------------------------------------------------------------
  const AREAS = [['Indiranagar', '560038'], ['Koramangala', '560034'], ['HSR Layout', '560102'], ['Whitefield', '560066'], ['Jayanagar', '560041']];
  const ITEMS = ['Cotton kurta (M)', 'Running shoes 9', 'Bluetooth speaker', 'Steel bottle set', 'Denim jacket (L)', 'Ceramic mug pair', 'Yoga mat', 'Desk lamp', 'Saree, silk blend', 'Phone case'];
  const poolOf = (h) => {
    if (!h.rpool) {
      const t = now(); const items = [];
      for (let n = 0; n < 11; n++) { const [area, pin] = AREAS[(n * 7) % AREAS.length]; items.push({ id: `RT${3100 + n}`, item: ITEMS[n % ITEMS.length], area, pin, kg: [0.4, 0.8, 1.2, 0.6, 1.5][n % 5], buyer: NAMES[n], at: iso(t - (n % 4) * day - n * 3600000) }); }
      h.rpool = { settings: { enabled: true, day: 'Thursday', max_wait: 4 }, items, shipped: [] };
    }
    return h.rpool;
  };
  const single = (it) => Math.round(62 + it.kg * 24);
  const pooled = (list) => Math.round(85 + list.reduce((t, it) => t + it.kg, 0) * 11 + list.length * 8);
  const poolView = (p) => {
    const by = {}; p.items.forEach((it) => { (by[it.area] = by[it.area] || []).push(it); });
    const groupsOut = Object.entries(by).map(([area, list]) => {
      const separate = list.reduce((t, it) => t + single(it), 0); const one = list.length > 1 ? pooled(list) : separate;
      const oldest = Math.min(...list.map((it) => Date.parse(it.at))); const due = oldest + p.settings.max_wait * day;
      return { area, pin: list[0].pin, items: list, count: list.length, separate, pooled: one, saving: separate - one, oldest: iso(oldest), ship_by: iso(due), urgent: due - now() < day };
    }).sort((a, b) => b.saving - a.saving);
    return { settings: p.settings, groups: groupsOut, shipped: p.shipped, saved_total: p.shipped.reduce((t, s) => t + s.saving, 0), waiting: p.items.length };
  };
  routes['GET /v1/hub/returnpool'] = hub(({ res, h }) => send(res, 200, poolView(poolOf(h))));
  routes['POST /v1/hub/returnpool/settings'] = hub(({ res, body, h }) => {
    const p = poolOf(h);
    p.settings = { enabled: !!body.enabled, day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].includes(body.day) ? body.day : p.settings.day, max_wait: Math.min(7, Math.max(1, Number(body.max_wait) || p.settings.max_wait)) };
    send(res, 200, poolView(p));
  });
  routes['POST /v1/hub/returnpool/simulate'] = hub(({ res, h }) => {
    const p = poolOf(h); const n0 = p.items.length + p.shipped.reduce((t, s) => t + s.count, 0);
    for (let n = 0; n < 3; n++) { const k = n0 + n; const [area, pin] = AREAS[(k * 3) % AREAS.length]; p.items.push({ id: `RT${3100 + k}`, item: ITEMS[k % ITEMS.length], area, pin, kg: [0.5, 0.9, 1.1][n], buyer: NAMES[k % NAMES.length], at: iso(now()) }); }
    send(res, 200, poolView(p));
  });
  routes['POST /v1/hub/returnpool/ship'] = hub(({ res, body, db, h }) => {
    const p = poolOf(h); const g = poolView(p).groups.find((x) => x.area === body.area);
    if (!g) throw oops(404, 'Nothing is waiting in that area.');
    if (body.dry_run) return send(res, 200, { ok: true, amount: g.pooled });
    requireApproval(h, g.pooled);
    takePayment(db, h, g.pooled, `Pooled return pickup · ${g.area}`);
    delete h.payApproval;
    const rec = addRecord(h, { section: 'courier', kind: 'return', title: `Pooled returns · ${g.area}`, provider: 'Delhivery', sub: `${g.count} returns in one pickup → your warehouse`, amount: g.pooled, pay_mode: 'prepaid', pay_via: 'wallet', weight: Math.round(g.items.reduce((t, it) => t + it.kg, 0) * 10) / 10, status: 'PICKUP_SCHEDULED', label: 'Pickup booked', group: 'pickup' });
    p.items = p.items.filter((it) => it.area !== g.area);
    p.shipped.unshift({ area: g.area, count: g.count, amount: g.pooled, separate: g.separate, saving: g.saving, record_id: rec.id, at: iso(now()) });
    send(res, 200, { id: rec.id, amount: g.pooled, saving: g.saving, wallet_balance: db.balance });
  });

  // ---- 7. travel policy ------------------------------------------------------------------------------
  const DEFAULT_POLICY = { enabled: false, flight_cabin: 'economy', flight_max: 9000, train_classes: ['SL', '3A', '2A', 'CC', '3E'], hotel_night_max: 4500, bus_max: 2000, ride_max: 800, advance_days: 3, approver: 'Owner' };
  const polOf = (h) => (h.policy = h.policy || { ...DEFAULT_POLICY, requests: [] });
  const dateOf = (o) => Date.parse(((o.record_sub || o.sub || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '');
  function violations(p, o, amount) {
    const v = [];
    const nights = o.per_night ? Math.max(1, Math.round(o.price / o.per_night)) : 1;
    if (o.kind === 'flight') {
      if (p.flight_cabin === 'economy' && /business|first/i.test(o.sub || '')) v.push('Business class is not allowed; book economy.');
      if (p.flight_max && amount > p.flight_max) v.push(`Flights are capped at ₹${p.flight_max.toLocaleString('en-IN')}.`);
      const d = dateOf(o); if (p.advance_days && d && (d - now()) / day < p.advance_days - 1) v.push(`Flights must be booked ${p.advance_days} days ahead.`);
    }
    if (o.kind === 'train') { const cls = ((o.sub || '').split('·').pop() || '').trim(); if (cls && p.train_classes.length && !p.train_classes.includes(cls)) v.push(`Train class ${cls} is not allowed (allowed: ${p.train_classes.join(', ')}).`); }
    if ((o.kind === 'hotel' || o.kind === 'stay') && p.hotel_night_max && (o.per_night || amount / nights) > p.hotel_night_max) v.push(`Stays are capped at ₹${p.hotel_night_max.toLocaleString('en-IN')} a night.`);
    if (o.kind === 'bus' && p.bus_max && amount > p.bus_max) v.push(`Buses are capped at ₹${p.bus_max.toLocaleString('en-IN')}.`);
    if (o.kind === 'ride' && p.ride_max && amount > p.ride_max) v.push(`Rides are capped at ₹${p.ride_max.toLocaleString('en-IN')}.`);
    return v;
  }
  // Called by /hub/search/book before it charges. An approved request for the same trip lets it through once.
  late.policyGate = (h, o, amount, body) => {
    const p = polOf(h); if (!p.enabled) return;
    const v = violations(p, o, amount); if (!v.length) return;
    const pass = p.requests.find((r) => r.status === 'APPROVED' && !r.used && r.kind === o.kind && r.title === (o.record_title || o.title) && amount <= r.amount + 1 && Date.parse(r.decided_at) > now() - day);
    if (pass) { if (!body.dry_run) { pass.used = true; pass.used_at = iso(now()); } return; }
    const waiting = p.requests.find((r) => r.status === 'PENDING' && r.kind === o.kind && r.title === (o.record_title || o.title));
    throw oops(403, `Outside your travel policy: ${v.join(' ')}`, { policy: { violations: v, pending: !!waiting, offer: { kind: o.kind, title: o.record_title || o.title, provider: o.provider, sub: o.record_sub || o.sub, amount } } });
  };
  routes['GET /v1/hub/policy'] = hub(({ res, h }) => { const p = polOf(h); send(res, 200, { ...p, saved: p.requests.filter((r) => r.status === 'DECLINED').reduce((t, r) => t + r.amount, 0) }); });
  routes['POST /v1/hub/policy'] = hub(({ res, body, h }) => {
    const p = polOf(h); const num = (x, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(x) || 0)));
    Object.assign(p, { enabled: !!body.enabled, flight_cabin: body.flight_cabin === 'any' ? 'any' : 'economy', flight_max: num(body.flight_max, 0, 200000), hotel_night_max: num(body.hotel_night_max, 0, 100000), bus_max: num(body.bus_max, 0, 20000), ride_max: num(body.ride_max, 0, 10000), advance_days: num(body.advance_days, 0, 30),
      train_classes: (Array.isArray(body.train_classes) ? body.train_classes : []).filter((c) => ['SL', '3E', '3A', '2A', '1A', 'CC', 'EC', '2S'].includes(c)), approver: text(body.approver, 40) || 'Owner' });
    send(res, 200, p);
  });
  routes['POST /v1/hub/policy/request'] = hub(({ res, body, h }) => {
    const p = polOf(h); const o = body.offer || {};
    const reason = text(body.reason, 200); if (reason.length < 4) throw oops(400, 'Say why this booking is needed.');
    if (!o.title) throw oops(400, 'Nothing to approve.');
    const dup = p.requests.find((r) => r.status === 'PENDING' && r.kind === o.kind && r.title === o.title); if (dup) return send(res, 200, dup);
    const r = { id: rid('TP'), kind: text(o.kind, 12), title: text(o.title, 120), provider: text(o.provider, 40), sub: text(o.sub, 120), amount: Math.round(Number(o.amount) || 0), violations: (Array.isArray(body.violations) ? body.violations : []).slice(0, 5).map((x) => text(x, 160)), reason, by: (h.profile && h.profile.name) || 'You', at: iso(now()), status: 'PENDING' };
    p.requests.unshift(r);
    send(res, 200, r);
  });
  routes['POST /v1/hub/policy/decide'] = hub(({ res, body, h }) => {
    const r = polOf(h).requests.find((x) => x.id === body.id && x.status === 'PENDING'); if (!r) throw oops(404, 'That request is not waiting.');
    r.status = body.approve ? 'APPROVED' : 'DECLINED'; r.decided_at = iso(now()); r.note = text(body.note, 160);
    send(res, 200, r);
  });
  routes['POST /v1/hub/policy/check'] = hub(({ res, body, h }) => send(res, 200, { violations: violations(polOf(h), body.offer || {}, Number((body.offer || {}).amount) || 0) }));

  return { sweeps: [sweepCabs, sweepSplits, sweepAddr], scoreAddress };
};
