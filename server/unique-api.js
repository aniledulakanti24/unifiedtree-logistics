// Features only an aggregator can offer (demo). Each is built so UT Log never pays out of pocket.
//   Carbon report: emissions for every booking, in the format used for BRSR (Scope 3, category 4).
//   Luggage ahead: a courier takes your bags to the hotel before your train or flight arrives.
//   Relay delivery: one booking for a truck to a city hub, then bikes or autos to many drops.
//   Receiver link: the receiver picks a slot, a neighbour or a locker; address changes need the sender.
//   Never stranded: if a partner cancels, the next partner at the same price or less takes over;
//     a dearer one needs the customer's yes.
//   Share a truck: pay the part-load price now; if a neighbour shares the truck, the difference comes back.
//   Book by chat: plain sentences in English, Hindi, Telugu, Tamil or Kannada become a booking.
'use strict';
const crypto = require('crypto');

const hash = (s) => parseInt(crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 8), 16);
const rid = (p) => p + crypto.randomBytes(4).toString('hex').toUpperCase();
// kg CO2e per tonne-km by how the goods move (indicative factors; a live report uses the carrier's own).
const FACTOR = { local: 0.21, intercity: 0.16, ftl: 0.075, ptl: 0.11, parcel: 0.13, air: 1.13, ship: 0.016, plane: 1.13 };

module.exports = function register(routes, { send }, ctx, bookingCtx, hubCtx) {
  const { iso, day, credit } = ctx;
  const engine = bookingCtx;
  const { hub, oops, text, takePayment, addRecord, live, requireApproval, quotes } = hubCtx;

  // ---- 7. carbon report ---------------------------------------------------------------------------
  const SHIP = ['vehicle', 'courier', 'logistics', 'international'];
  const emissionOf = (r) => {
    const kg = Number(r.weight) || 5; const km = Number(r.km || (r.freight && r.freight.km)) || ({ vehicle: 12, courier: 600, logistics: 600, international: 6000 }[r.section] || 300);
    const mode = r.mode || ({ vehicle: 'local', courier: 'parcel', logistics: 'ftl', international: 'air' }[r.section]);
    const co2 = r.co2 != null ? Number(r.co2) : +((kg / 1000) * km * (FACTOR[mode] || 0.15)).toFixed(2);
    return { kg, km, mode, co2, tkm: +((kg / 1000) * km).toFixed(3), best: r.co2_min != null ? Number(r.co2_min) : null, estimated: r.co2 == null };
  };
  routes['GET /v1/hub/carbon'] = hub(({ res, url, h }) => {
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '') ? url.searchParams.get('month') : new Date().toISOString().slice(0, 7);
    const all = h.records.filter((r) => SHIP.includes(r.section) && r.status !== 'CANCELLED');
    const rows = all.filter((r) => String(r.at).slice(0, 7) === month).map((r) => ({ id: r.id, at: r.at, title: r.title, provider: r.provider, sub: r.sub, amount: r.amount, ...emissionOf(r) }));
    const sum = (k) => +rows.reduce((t, r) => t + (r[k] || 0), 0).toFixed(2);
    const byMode = {}; rows.forEach((r) => { byMode[r.mode] = +((byMode[r.mode] || 0) + r.co2).toFixed(2); });
    const saving = +rows.reduce((t, r) => t + (r.best != null ? Math.max(0, r.co2 - r.best) : 0), 0).toFixed(2);
    const months = [...new Set(all.map((r) => String(r.at).slice(0, 7)))].sort().reverse().slice(0, 12);
    const trend = months.slice(0, 6).reverse().map((m) => ({ month: m, co2: +all.filter((r) => String(r.at).slice(0, 7) === m).reduce((t, r) => t + emissionOf(r).co2, 0).toFixed(1) }));
    const spend = rows.reduce((t, r) => t + (r.amount || 0), 0);
    send(res, 200, {
      month, months: months.length ? months : [month], rows, trend,
      total_kg: sum('co2'), tonne_km: sum('tkm'), shipments: rows.length, spend,
      per_tkm: sum('tkm') ? +(sum('co2') / sum('tkm')).toFixed(3) : 0, per_lakh: spend ? +(sum('co2') / (spend / 100000)).toFixed(1) : 0,
      by_mode: byMode, could_save_kg: saving, estimated: rows.filter((r) => r.estimated).length,
      brsr: { principle: 'Principle 6 · Essential indicator: other emissions (Scope 3)', category: 'GHG Protocol Scope 3 · Category 4: Upstream transportation and distribution', method: 'Distance-based: weight × distance × mode factor (kg CO2e per tonne-km)', factors: FACTOR, tco2e: +(sum('co2') / 1000).toFixed(4) },
    });
  });

  // ---- 5. luggage ahead -----------------------------------------------------------------------------
  // Quotes couriers for bags from home to the destination, arriving before the traveller.
  routes['POST /v1/hub/luggage/quote'] = hub(({ res, body, h, owner }) => {
    const trip = h.records.find((r) => r.id === body.trip_id && ['travel'].includes(r.section));
    if (!trip) throw oops(404, 'Pick one of your trips.');
    if (!/^\d{6}$/.test(String(body.from_pin || '')) || !/^\d{6}$/.test(String(body.to_pin || ''))) throw oops(400, 'Enter 6-digit pin codes for home and the hotel.');
    const bags = Math.max(1, Math.min(6, Math.floor(Number(body.bags) || 1)));
    const kg = Math.max(5, Math.min(32, Number(body.kg_per_bag) || 20));
    const travel = Date.parse(((trip.record_sub || trip.sub || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '') || Date.now() + 3 * day;
    const route = engine.resolveRoute({ from_place: body.from_pin, to_place: body.to_pin });
    const input = engine.parseInput({ ...route, segment: 'b2c', weight: bags * kg, pieces: bags, priority: 'best' });
    const opts = engine.buildOptions(input).options.filter((o) => o.kind === 'courier' && o.mode !== 'air');
    if (!opts.length) throw oops(400, 'No courier serves these pin codes yet. Try the nearest city pin code.');
    // Arrives at least 6 hours before the trip starts, so the bags are waiting.
    const ontime = opts.filter((o) => Date.parse(o.eta) <= travel - 6 * 3600000).sort((a, b) => a.total - b.total);
    const list = (ontime.length ? ontime : opts.sort((a, b) => Date.parse(a.eta) - Date.parse(b.eta))).slice(0, 4).map((o, i) => ({ ...o, id: `${i}${crypto.randomBytes(3).toString('hex')}`, in_time: Date.parse(o.eta) <= travel - 6 * 3600000 }));
    const id = crypto.randomBytes(8).toString('hex');
    quotes.set(id, { owner, section: 'courier', input, options: list, form: { from: body.from_pin, to: body.to_pin, weight: bags * kg, pieces: bags, category: 'Luggage', luggage_for: trip.id }, expires: Date.now() + 20 * 60000 });
    send(res, 200, { quote_id: id, options: list, trip: { id: trip.id, title: trip.title, starts: iso(travel) }, bags, kg_per_bag: kg, route: { from: input.from, to: input.to } });
  });

  // ---- 4. relay delivery ------------------------------------------------------------------------------
  const cityAreas = (key) => (engine.cities[key] ? engine.cities[key].localities.map((l) => l[0]) : []);
  const relayPlans = new Map();
  routes['POST /v1/hub/relay/quote'] = hub(({ res, body, owner }) => {
    const hubCity = String(body.hub_city || ''); const city = engine.cities[hubCity];
    if (!city) throw oops(400, 'Pick the city where the bikes take over.');
    const drops = (Array.isArray(body.drops) ? body.drops : []).slice(0, 12).map((d) => ({ area: String(d.area || ''), kg: Math.max(1, Math.min(750, Number(d.kg) || 0)), name: text(d.name, 60), phone: String(d.phone || '') })).filter((d) => cityAreas(hubCity).includes(d.area));
    if (drops.length < 2) throw oops(400, 'Add at least two drops in the hub city.');
    const total = drops.reduce((t, d) => t + d.kg, 0);
    const hubArea = cityAreas(hubCity).includes(body.hub_area) ? body.hub_area : cityAreas(hubCity)[0];
    // Leg 1: a truck (or part load) to the hub.
    const r1 = engine.resolveRoute({ from_place: body.from_place, to_place: `${hubArea}, ${city.name}` });
    if (r1.service === 'local') throw oops(400, 'The pickup is already in the hub city. Book the drops as normal vehicle orders.');
    const i1 = engine.parseInput({ ...r1, segment: 'b2b', weight: total, pieces: drops.length, priority: 'best' });
    const legs1 = engine.buildOptions(i1).options.filter((o) => ['ftl', 'ptl', 'intercity'].includes(o.mode)).sort((a, b) => a.total - b.total);
    if (!legs1.length) throw oops(400, 'No truck serves this route for this weight.');
    const trunk = legs1[0];
    // Leg 2: one bike, auto or mini truck per drop, leaving the hub an hour after the truck arrives.
    const handover = Date.parse(trunk.eta) + 3600000;
    const last = drops.map((d, n) => {
      const r2 = engine.resolveRoute({ from_place: `${hubArea}, ${city.name}`, to_place: `${d.area}, ${city.name}` });
      const i2 = engine.parseInput({ ...r2, segment: 'b2b', weight: d.kg, pieces: 1, priority: 'best', pickup_at: iso(handover + n * 5 * 60000) });
      const all2 = engine.buildOptions(i2).options.filter((x) => x.mode === 'local' && ['bike', 'auto', 'mini'].includes(x.vehicle)).sort((a, b) => a.total - b.total);
      const o = all2[0];
      if (!o) throw oops(400, `No vehicle can carry ${d.kg} kg to ${d.area}. Split that drop.`);
      return { drop: d, option: o, input: i2, backups: all2.filter((x) => x !== o && x.vehicle === o.vehicle).slice(0, 3) };
    });
    const id = crypto.randomBytes(8).toString('hex');
    const sum = trunk.total + last.reduce((t, l) => t + l.option.total, 0);
    relayPlans.set(id, { owner, trunk: { option: trunk, input: i1, backups: legs1.filter((x) => x !== trunk && x.mode === trunk.mode).slice(0, 3) }, last, hub: `UT relay hub, ${hubArea}, ${city.name}`, total: sum, expires: Date.now() + 20 * 60000 });
    send(res, 200, { plan_id: id, total: sum, hub: `UT relay hub · ${hubArea}, ${city.name}`, handover_at: iso(handover),
      legs: [{ leg: 1, kind: 'trunk', provider: trunk.provider, title: trunk.title, from: i1.from, to: `${hubArea} hub`, eta: trunk.eta, total: trunk.total, co2: +((total / 1000) * (i1.distanceKm || 0) * FACTOR[trunk.mode]).toFixed(1) },
        ...last.map((l, n) => ({ leg: n + 2, kind: 'last', provider: l.option.provider, title: l.option.title, from: `${hubArea} hub`, to: l.drop.area, kg: l.drop.kg, eta: l.option.eta, total: l.option.total }))] });
  });
  routes['POST /v1/hub/relay/book'] = hub(({ res, body, db, h, owner }) => {
    const p = relayPlans.get(String(body.plan_id || ''));
    if (!p || p.owner !== owner || p.expires < Date.now()) throw oops(400, 'This plan has expired. Plan it again.');
    if (body.dry_run) return send(res, 200, { ok: true, amount: p.total });
    requireApproval(h, p.total);
    takePayment(db, h, p.total, `Relay delivery · ${p.last.length} drops`);
    delete h.payApproval;
    const group = rid('RL'); const contact = { name: (h.profile && h.profile.name) || 'Sender', phone: /^[6-9]\d{9}$/.test((h.profile && h.profile.mobile) || '') ? h.profile.mobile : '9876543210' };
    const legs = [];
    const book = (input, option, from, to, n, kind, backups) => {
      const { id } = engine.createBooking({ input, section: kind === 'trunk' ? 'logistics' : 'vehicle' }, option, { contact, pickup_address: from, drop_address: to });
      addRecord(h, { id, booking_id: id, section: kind === 'trunk' ? 'logistics' : 'vehicle', title: `${option.title} · relay leg ${n}`, provider: option.provider, provider_type: option.provider_type, sub: `${input.from} → ${input.to}`, amount: option.total, pay_mode: 'prepaid', pay_via: 'wallet', status: 'BOOKED', label: n === 1 ? 'Relay · truck to hub' : 'Relay · waits for the truck', weight: input.weight, relay: { group, leg: n, of: p.last.length + 1, hub: p.hub }, mode: option.mode, co2: option.co2, km: Math.round(input.distanceKm || 0), bk_input: input, option_total: option.total, backups: backups || [], contact_name: contact.name, contact_phone: contact.phone, pickup_address: from, drop_address: to });
      legs.push({ id, leg: n, provider: option.provider });
    };
    book(p.trunk.input, p.trunk.option, body.pickup_address || p.trunk.input.from, p.hub, 1, 'trunk', p.trunk.backups);
    p.last.forEach((l, n) => book(l.input, l.option, p.hub, `${l.drop.name ? `${l.drop.name}, ` : ''}${l.drop.area}`, n + 2, 'last', l.backups));
    relayPlans.delete(body.plan_id);
    send(res, 200, { id: group, group, legs, amount: p.total, wallet_balance: db.balance });
  });

  // ---- 9. receiver link (sender side; the receiver's page uses the public routes in booking-api) ---
  const recOf = (h, id) => { const r = h.records.find((x) => x.id === id); if (!r || !r.booking_id) throw oops(404, 'We could not find that delivery.'); return r; };
  routes['POST /v1/hub/orders/receiver-link'] = hub(({ res, body, h }) => {
    const r = recOf(h, String(body.id || ''));
    const b = engine.bookingById(r.booking_id); if (!b) throw oops(400, 'This delivery has ended.');
    b.rx = b.rx || { key: crypto.randomBytes(9).toString('base64url'), prefs: {}, requests: [] };
    send(res, 200, { url: `/r/?id=${encodeURIComponent(b.id)}&k=${b.rx.key}`, prefs: b.rx.prefs, requests: b.rx.requests });
  });
  routes['GET /v1/hub/orders/receiver'] = hub(({ res, url, h }) => {
    const r = recOf(h, url.searchParams.get('id'));
    const b = engine.bookingById(r.booking_id);
    send(res, 200, b && b.rx ? { linked: true, prefs: b.rx.prefs, requests: b.rx.requests, unboxing: b.rx.unboxing ? { seconds: b.rx.unboxing.seconds, at: b.rx.unboxing.at, thumb: b.rx.unboxing.thumb, seal: b.rx.unboxing.hash.slice(0, 12), sealed: b.rx.unboxing.sealed } : null, damage: b.rx.damage || null } : { linked: false, prefs: {}, requests: [] });
  });
  // An address change asked by the receiver costs a re-route fee; the sender approves and pays it, or declines.
  routes['POST /v1/hub/orders/receiver-request'] = hub(({ res, body, db, h }) => {
    const r = recOf(h, String(body.id || ''));
    const b = engine.bookingById(r.booking_id); const q = b && b.rx && b.rx.requests.find((x) => x.id === body.request_id && x.status === 'pending');
    if (!q) throw oops(400, 'There is no pending request.');
    if (!body.approve) { q.status = 'declined'; q.decided_at = iso(Date.now()); return send(res, 200, { ok: true, status: 'declined' }); }
    if (body.dry_run) return send(res, 200, { ok: true, amount: q.fee });
    requireApproval(h, q.fee);
    takePayment(db, h, q.fee, `Re-route to new address · ${r.id}`);
    delete h.payApproval;
    q.status = 'approved'; q.decided_at = iso(Date.now());
    b.route.drop_address = q.address; r.drop_address = q.address; r.label = 'Re-routed to the receiver\'s new address';
    send(res, 200, { ok: true, status: 'approved', amount: q.fee, wallet_balance: db.balance });
  });

  // ---- 1. never stranded ----------------------------------------------------------------------------
  // A partner can cancel or miss the pickup. The next partner at the same price or less is booked at
  // once (any saving is refunded); a dearer one waits for the customer's yes, or the order is
  // cancelled with a full refund. UT Log never pays the gap.
  const REASON = ['cancelled the trip', 'did not reach the pickup in time', 'reported a vehicle breakdown'];
  function rebook(db, h, r, backup, why) {
    const { id } = engine.createBooking({ input: r.bk_input, section: r.section }, backup, { contact: { name: r.contact_name || 'Customer', phone: r.contact_phone || '9876543210' }, pickup_address: r.pickup_address || r.bk_input.from, drop_address: r.drop_address || r.bk_input.to });
    const before = r.provider; const saved = Math.max(0, r.option_total - backup.total);
    r.booking_id = id; r.provider = backup.provider; r.provider_type = backup.provider_type; r.title = backup.title;
    r.rebooked = [...(r.rebooked || []), { from: before, to: backup.provider, why, at: iso(Date.now()), saved }];
    r.label = `${before} ${why} · ${backup.provider} took over`;
    if (saved && r.pay_via === 'wallet') { credit(db, saved, `Refund · cheaper backup partner · ${r.id}`); r.amount -= saved; }
    r.stranded = null; r.option_total = backup.total; r.backups = (r.backups || []).filter((x) => x.id !== backup.id);
  }
  function strand(db, h, r) {
    const why = REASON[hash(r.id) % REASON.length];
    const same = (r.backups || []).filter((x) => x.total <= r.option_total).sort((a, b) => a.total - b.total)[0];
    if (same) return rebook(db, h, r, same, why);
    const dear = (r.backups || []).sort((a, b) => a.total - b.total)[0];
    if (dear) { r.stranded = { why, from: r.provider, offer: dear, extra: dear.total - r.option_total, at: iso(Date.now()) }; r.label = `${r.provider} ${why} · approve a backup partner`; return; }
    r.status = 'CANCELLED'; r.label = `${r.provider} ${why} · no backup free, fully refunded`;
    if (r.pay_via === 'wallet') credit(db, r.amount, `Refund · partner cancelled · ${r.id}`);
  }
  // Runs before every request: a booking whose partner was due to fail is handled now.
  const sweepStranded = (db, h) => {
    for (const r of h.records || []) {
      if (!r.risk || r.risk.done || r.risk.fail_at > Date.now() || r.status === 'CANCELLED' || !r.bk_input) continue;
      const lv = live(r);
      r.risk.done = true;
      if (['delivered', 'transit'].includes(lv.group)) continue; // already picked up: nothing to rescue
      strand(db, h, r);
    }
  };
  routes['POST /v1/hub/orders/simulate-failure'] = hub(({ res, body, h }) => {
    const r = recOf(h, String(body.id || ''));
    if (!r.bk_input) throw oops(400, 'This booking has no backup partners on record.');
    r.risk = { fail_at: Date.now() - 1, done: false };
    send(res, 200, { ok: true });
  });
  routes['POST /v1/hub/orders/stranded'] = hub(({ res, body, db, h }) => {
    const r = recOf(h, String(body.id || ''));
    if (!r.stranded) throw oops(400, 'Nothing is waiting for you on this order.');
    if (body.choice === 'cancel') { r.status = 'CANCELLED'; r.label = `${r.stranded.from} ${r.stranded.why} · cancelled, fully refunded`; if (r.pay_via === 'wallet') credit(db, r.amount, `Refund · partner cancelled · ${r.id}`); r.stranded = null; return send(res, 200, { ok: true, status: 'cancelled', wallet_balance: db.balance }); }
    const s = r.stranded;
    if (body.dry_run) return send(res, 200, { ok: true, amount: s.extra });
    requireApproval(h, s.extra);
    takePayment(db, h, s.extra, `Backup partner · ${s.offer.provider} · ${r.id}`);
    delete h.payApproval;
    r.amount += s.extra; r.option_total = s.offer.total;
    rebook(db, h, r, s.offer, s.why);
    send(res, 200, { ok: true, status: 'rebooked', provider: r.provider, amount: s.extra, wallet_balance: db.balance });
  });

  // ---- 6. share a truck ---------------------------------------------------------------------------------
  // Open loads from other businesses on popular lanes (simulated), refreshed each day.
  const NEIGHBOURS = ['Sri Balaji Traders', 'Kaveri Agro Foods', 'Deccan Hardware', 'Lakshmi Textiles', 'Om Sai Electricals', 'Coastal Spices Co', 'Metro Pharma Distributors', 'Green Leaf Organics'];
  const FILL = 0.91; const MARGIN = 1.1;
  const poolPrices = (from, to, kg, dateIso) => {
    const route = engine.resolveRoute({ from_place: from, to_place: to });
    if (route.service === 'local') throw oops(400, 'Sharing is for trips between cities.');
    const input = engine.parseInput({ ...route, segment: 'b2b', weight: kg, pieces: 1, priority: 'best', pickup_at: dateIso });
    const ptl = engine.buildOptions(input).options.filter((o) => o.mode === 'ptl').sort((x, y) => x.total - y.total)[0];
    const fullIn = engine.parseInput({ ...route, segment: 'b2b', weight: Math.max(kg * 2, 1500), pieces: 2, priority: 'best', pickup_at: dateIso });
    const truck = engine.buildOptions(fullIn).options.filter((o) => o.mode === 'ftl' && (o.max_kg || 0) >= Math.max(kg * 2, 1500)).sort((x, y) => x.total / (x.max_kg || 1) - y.total / (y.max_kg || 1))[0]; // lowest cost per kg: several businesses share it
    if (!truck || !ptl) throw oops(400, 'No truck or part load serves this route for this weight.');
    const cap = truck.max_kg || 3500;
    if (kg > cap * 0.6) throw oops(400, `This load fills most of a ${truck.title.replace('Full truck · ', '')}. Book the full truck instead.`);
    const share = Math.ceil(truck.total * (kg / cap) * MARGIN);
    if (share >= ptl.total) throw oops(400, `For ${kg} kg a part load (${ptl.total.toLocaleString('en-IN')}) is already cheaper than sharing. Book a part load.`);
    return { input, truck, ptl, cap, share, km: Math.round(input.distanceKm || 0) };
  };
  // Businesses already loading on this lane (simulated). Joining fills their truck to at least 91%.
  const openPools = (from, to, dateIso, cap, kg) => {
    const seed = hash(`${from}|${to}|${String(dateIso).slice(0, 10)}`);
    return Array.from({ length: 1 + (seed % 2) }, (_, i) => {
      const need = Math.ceil(cap * FILL) - kg; const theirs = Math.min(cap - kg, need + ((seed >> (i * 5)) % 4) * 50);
      return { id: `P${(seed >> (i * 4)) & 0xffff}${i}`, company: NEIGHBOURS[(seed + i * 3) % NEIGHBOURS.length], kg: theirs, leaves: iso(Date.parse(dateIso) + (2 + i * 3) * 3600000), rating: (4.2 + ((seed >> i) % 7) / 10).toFixed(1) };
    }).filter((p) => p.kg > 0 && p.kg + kg <= cap && p.kg + kg >= cap * FILL);
  };
  routes['POST /v1/hub/pool/quote'] = hub(({ res, body }) => {
    const kg = Number(body.weight); if (!(kg >= 50 && kg <= 3000)) throw oops(400, 'Sharing works for 50 kg to 3 tonnes.');
    const date = Date.parse(body.date || '') || Date.now() + day;
    const p = poolPrices(body.from_place, body.to_place, kg, iso(date));
    const open = openPools(p.input.from, p.input.to, iso(date), p.cap, kg).map((o) => ({ ...o, share: p.share, truck: p.truck.title.replace('Full truck · ', ''), eta: p.truck.eta, fill: Math.round(((o.kg + kg) / p.cap) * 100) }));
    send(res, 200, { from: p.input.from, to: p.input.to, km: p.km, weight: kg, truck: { title: p.truck.title.replace('Full truck · ', ''), provider: p.truck.provider, total: p.truck.total, capacity: p.cap, eta: p.truck.eta }, part_load: { provider: p.ptl.provider, total: p.ptl.total, eta: p.ptl.eta }, share: p.share, saving: p.ptl.total - p.share, faster_days: Math.max(0, Math.round((Date.parse(p.ptl.eta) - Date.parse(p.truck.eta)) / 864e5)), open });
  });
  routes['POST /v1/hub/pool/join'] = hub(({ res, body, db, h }) => {
    const kg = Number(body.weight); const date = Date.parse(body.date || '') || Date.now() + day;
    const p0 = poolPrices(body.from_place, body.to_place, kg, iso(date));
    const match = body.pool_id ? openPools(p0.input.from, p0.input.to, iso(date), p0.cap, kg).find((x) => x.id === body.pool_id) : null;
    if (body.pool_id && !match) throw oops(400, 'That shared load is full or has left. Pick another.');
    const p = p0;
    // Joining someone already paid: the shared price. Starting a new share: the part-load price now,
    // with the difference refunded if a partner joins before the cut-off.
    const charge = match ? p.share : p.ptl.total;
    if (body.dry_run) return send(res, 200, { ok: true, amount: charge });
    requireApproval(h, charge);
    takePayment(db, h, charge, match ? `Shared truck with ${match.company}` : 'Shared truck · part-load price held');
    delete h.payApproval;
    const contact = { name: (h.profile && h.profile.name) || 'Sender', phone: /^[6-9]\d{9}$/.test((h.profile && h.profile.mobile) || '') ? h.profile.mobile : '9876543210' };
    const base = { section: 'logistics', pay_mode: 'prepaid', pay_via: 'wallet', weight: kg, sub: `${p.input.from} → ${p.input.to}`, mode: 'ftl', km: p.km };
    if (match) {
      const { id } = engine.createBooking({ input: p.input, section: 'logistics' }, p.truck, { contact, pickup_address: body.pickup_address || p.input.from, drop_address: body.drop_address || p.input.to });
      const rec = addRecord(h, { ...base, id, booking_id: id, title: `Shared truck · ${p.truck.title.replace('Full truck · ', '')}`, provider: p.truck.provider, amount: charge, status: 'BOOKED', label: `Sharing with ${match.company} · ${match.kg} kg`, pool: { with: match.company, their_kg: match.kg, share: p.share, part_load: p.ptl.total, matched: true }, co2: +((kg / 1000) * p.km * FACTOR.ftl).toFixed(1) });
      return send(res, 200, { id: rec.id, matched: true, amount: charge, saved: p.ptl.total - p.share, wallet_balance: db.balance });
    }
    const decide = Date.now() + 2 * 60000; // demo cut-off; live: 6 pm the day before pickup
    const rec = addRecord(h, { ...base, id: rid('SH'), title: 'Shared truck · finding a partner', provider: 'UT Log pooling', amount: charge, status: 'POOLING', label: `Looking for a business to share with · decided by ${new Date(decide).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, pool: { decide_at: decide, share: p.share, part_load: p.ptl.total, truck: p.truck, ptl: p.ptl, input: p.input, contact, pickup_address: body.pickup_address || p.input.from, drop_address: body.drop_address || p.input.to } });
    send(res, 200, { id: rec.id, matched: false, amount: charge, decide_at: iso(decide), share: p.share, wallet_balance: db.balance });
  });
  const sweepPools = (db, h) => {
    for (const r of h.records || []) {
      const p = r.pool; if (r.status !== 'POOLING' || !p || p.decide_at > Date.now()) continue;
      const matched = hash(r.id) % 3 !== 0;
      const option = matched ? p.truck : p.ptl;
      const { id } = engine.createBooking({ input: p.input, section: 'logistics' }, option, { contact: p.contact, pickup_address: p.pickup_address, drop_address: p.drop_address });
      r.booking_id = id; r.provider = option.provider; r.status = 'BOOKED';
      if (matched) {
        const partner = NEIGHBOURS[hash(r.id) % NEIGHBOURS.length]; const back = p.part_load - p.share;
        r.title = 'Shared truck'; r.label = `Sharing with ${partner} · ₹${back.toLocaleString('en-IN')} refunded`; r.amount = p.share;
        credit(db, back, `Refund · shared truck found · ${r.id}`); r.pool = { with: partner, share: p.share, part_load: p.part_load, matched: true };
      } else { r.title = 'Part load (no sharing partner found)'; r.label = 'No partner in time · sent as a part load at the price you paid'; r.pool = { matched: false, part_load: p.part_load }; }
      r.co2 = +((r.weight / 1000) * (r.km || 0) * FACTOR[matched ? 'ftl' : 'ptl']).toFixed(1);
    }
  };

  // ---- 8. book by chat or voice ----------------------------------------------------------------------
  // Words people use for from, to, today, tomorrow and kilos in English, Hindi, Telugu, Tamil and Kannada.
  const FROM = ['from', 'se', 'sey', 'nunchi', 'nundi', 'irundhu', 'irunthu', 'inda', 'inda', 'से', 'నుంచి', 'నుండి', 'இருந்து', 'ಇಂದ', 'ರಿಂದ'];
  const TO = ['to', 'tak', 'ko', 'ki', 'ku', 'ke', 'varaku', 'ki', 'ge', 'tha', 'तक', 'को', 'కి', 'వరకు', 'க்கு', 'ಗೆ'];
  const ALIAS = {
    bengaluru: ['bengaluru', 'bangalore', 'blr', 'बेंगलुरु', 'बैंगलोर', 'బెంగళూరు', 'பெங்களூர்', 'ಬೆಂಗಳೂರು'],
    mumbai: ['mumbai', 'bombay', 'मुंबई', 'ముంబై', 'மும்பை', 'ಮುಂಬೈ'],
    delhi: ['delhi', 'new delhi', 'दिल्ली', 'ఢిల్లీ', 'டெல்லி', 'ದೆಹಲಿ'],
    hyderabad: ['hyderabad', 'hyd', 'हैदराबाद', 'హైదరాబాద్', 'ஹைதராபாத்', 'ಹೈದರಾಬಾದ್'],
    chennai: ['chennai', 'madras', 'चेन्नई', 'చెన్నై', 'சென்னை', 'ಚೆನ್ನೈ'],
    pune: ['pune', 'poona', 'पुणे', 'పుణె', 'புனே', 'ಪುಣೆ'],
  };
  const KG = /(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|kilogram|किलो|కిలో|కేజీ|கிலோ|ಕಿಲೋ|t\b|ton|tons|tonne|tonnes|टन)/i;
  function parseChat(raw) {
    const t = ` ${String(raw || '').toLowerCase().replace(/[,.!?]/g, ' ').replace(/\s+/g, ' ')} `;
    const hits = [];
    for (const [key, c] of Object.entries(engine.cities)) {
      c.localities.forEach(([name]) => { const i = t.indexOf(` ${name.toLowerCase()}`); if (i >= 0) hits.push({ i, len: name.length, place: `${name}, ${c.name}`, label: name, city: key }); });
      (ALIAS[key] || []).forEach((a) => { const i = t.indexOf(a); if (i >= 0 && !hits.some((x) => x.city === key && Math.abs(x.i - i) < 30)) hits.push({ i, len: a.length, place: c.name === 'Delhi NCR' ? 'Delhi' : c.name, label: c.name, city: key }); });
    }
    (t.match(/\b\d{6}\b/g) || []).forEach((pin) => hits.push({ i: t.indexOf(pin), len: 6, place: pin, label: pin, city: null }));
    hits.sort((a, b) => a.i - b.i);
    const uniq = hits.filter((x, n) => !hits.slice(0, n).some((y) => y.place === x.place));
    const after = (x) => t.slice(x.i + x.len, x.i + x.len + 14).trim().split(' ')[0];
    const before = (x) => t.slice(Math.max(0, x.i - 12), x.i).trim().split(' ').pop();
    let from = uniq.find((x) => before(x) === 'from' || FROM.includes(after(x))); let to = uniq.find((x) => x !== from && (['to', 'till', 'until'].includes(before(x)) || TO.includes(after(x))));
    if (!from) from = uniq.find((x) => x !== to); if (!to) to = uniq.find((x) => x !== from);
    const km = KG.exec(t); let weight = km ? Number(km[1]) * (/^(t|ton|tons|tonne|tonnes|टन)$/i.test(km[2]) ? 1000 : 1) : null;
    const tomorrow = /\b(tomorrow|tmrw|kal|kaal|repu|naalai|nalai|nale)\b|कल|రేపు|நாளை|ನಾಳೆ/.test(t);
    const tm = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje|bajey|gantalaki|gante|mani|ku)?\b/.exec(t.replace(KG, ' ').replace(/\b\d{6}\b/g, ' '));
    let hour = tm ? Number(tm[1]) : null;
    if (hour != null && (hour > 23 || (!tm[3] && !/subah|morning|shaam|evening|sham|raat|night|udayam|kaalai|sayantram|maalai|बजे|subha/.test(t)))) hour = null;
    if (hour != null && hour < 12 && (/pm|shaam|sham|evening|sayantram|maalai|raat|night/.test(t) || (tm[3] === 'pm'))) hour += 12;
    const when = new Date(Date.now() + (tomorrow ? day : 0)); if (hour != null) when.setHours(hour, tm[2] ? Number(tm[2]) : 0, 0, 0);
    const scheduled = tomorrow || hour != null;
    const missing = [!from && 'pickup', !to && 'drop', !weight && 'weight'].filter(Boolean);
    let section = null;
    if (from && to && weight) { const same = from.city && to.city && from.city === to.city; section = same ? (weight > 750 ? 'logistics' : 'vehicle') : weight > 3500 ? 'logistics' : weight >= 100 ? 'vehicle' : 'courier'; }
    return { from: from ? from.place : null, to: to ? to.place : null, from_label: from && from.label, to_label: to && to.label, weight, pickup_at: scheduled && when.getTime() > Date.now() ? iso(when.getTime()) : null, section, missing };
  }
  routes['POST /v1/hub/chat/parse'] = hub(({ res, body }) => send(res, 200, parseChat(body.text)));

  return { sweeps: [sweepStranded, sweepPools], parseChat, emissionOf };
};
