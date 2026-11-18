// Eight more features only an aggregator can offer (demo). None of them makes UT Log pay out of pocket:
//   A Moving house     – movers + shift utilities + redirect deliveries + new address, in one plan.
//   B Book now or wait – a 14-day price outlook per route, from every carrier's history (simulated).
//   C Merge trips      – several pending city trips from one pickup become one multi-stop trip; the saving is refunded.
//   D Trip folders     – flights, stays, rides and parcels of one trip, grouped into one expense report with GST.
//   E Bulk gifting     – a list of receivers, each a courier booking with its own receiver link.
//   F Family wallet    – family members with monthly limits; bigger spends wait for your approval.
//   G Damage claims    – damage at delivery files the claim itself; the insurer pays, or the carrier is chased.
//   H Disruptions      – weather, strikes and festival rush on the route, with a better way to send.
'use strict';
const crypto = require('crypto');

const hash = (s) => parseInt(crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 8), 16);
const rid = (p) => p + crypto.randomBytes(4).toString('hex').toUpperCase();
const FESTIVALS = [['2026-11-08', 'Diwali'], ['2026-11-24', 'Guru Nanak Jayanti'], ['2026-12-25', 'Christmas'], ['2027-01-14', 'Sankranti / Pongal'], ['2027-03-04', 'Holi'], ['2027-03-26', 'Good Friday'], ['2027-08-15', 'Independence Day'], ['2027-09-04', 'Ganesh Chaturthi'], ['2027-10-29', 'Diwali']];
const UTILITY = ['electricity', 'gas', 'broadband', 'water', 'landline', 'lpg', 'dth'];

module.exports = function register(routes, { send }, ctx, bookingCtx, hubCtx) {
  const { iso, day, credit } = ctx;
  const engine = bookingCtx;
  const { hub, oops, text, takePayment, addRecord, live, requireApproval } = hubCtx;
  const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

  // ---- B. book now or wait ------------------------------------------------------------------------
  // Price index per day for a lane: weekends a little dearer, the week before a festival much dearer,
  // and a few days of lane-specific noise. 100 = today's price.
  const indexOn = (lane, t) => {
    const d = new Date(t); const wd = d.getDay();
    let k = 1 + (wd === 0 || wd === 6 ? 0.04 : 0) + ((hash(lane + dayOf(t)) % 9) - 4) / 100;
    for (const [f] of FESTIVALS) { const gap = (Date.parse(f) - t) / day; if (gap >= 0 && gap <= 7) k += 0.18 * (1 - gap / 8); if (gap < 0 && gap > -3) k += 0.06; }
    return k;
  };
  function outlook(section, from, to) {
    const lane = `${section}|${String(from).toLowerCase()}|${String(to).toLowerCase()}`;
    const t0 = Date.now(); const base = indexOn(lane, t0);
    const days = Array.from({ length: 14 }, (_, n) => { const t = t0 + n * day; return { date: dayOf(t), index: Math.round((indexOn(lane, t) / base) * 100), festival: (FESTIVALS.find(([f]) => { const g = (Date.parse(f) - t) / day; return g >= 0 && g <= 7; }) || [])[1] || null }; });
    const next3 = Math.max(...days.slice(1, 4).map((x) => x.index)); const low = days.reduce((a, b) => (b.index < a.index ? b : a));
    const advice = low.index <= 94 && low.date !== days[0].date ? { verdict: 'wait', text: `Prices on this route usually dip about ${100 - low.index}% around ${new Date(low.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. If it can wait, book then.` }
      : next3 >= 106 ? { verdict: 'now', text: `Prices on this route usually rise about ${next3 - 100}% in the next few days${days.slice(1, 4).find((x) => x.festival) ? ` before ${days.slice(1, 4).find((x) => x.festival).festival}` : ''}. Book now.` }
        : { verdict: 'steady', text: 'Prices on this route are steady for the next two weeks. Book whenever suits you.' };
    return { days, advice, based_on: 'Prices from every carrier on this route over the last 2 years (simulated)' };
  }
  // ---- H. disruptions ------------------------------------------------------------------------------
  const EVENTS = [
    ['rain', 'Heavy rain warning', 'IMD has an orange alert on the highway; trucks are running 4–8 hours late.', 'slow-road'],
    ['strike', 'Transporters\' strike', 'A one-day truckers\' strike is called at the state border; road freight may stop for a day.', 'stop-road'],
    ['festival', 'Festival rush', 'Festival traffic and loading queues at hubs; couriers are adding a day.', 'slow-all'],
    ['closure', 'Road work on the highway', 'A stretch is down to one lane at night; expect 2–3 hours extra.', 'slow-road'],
    ['fog', 'Dense fog at night', 'Low visibility at night; trucks wait till morning.', 'slow-road'],
  ];
  function disruptions(section, from, to, dateIso) {
    const t = Date.parse(dateIso || '') || Date.now(); const d = dayOf(t);
    const seed = hash(`${String(from).toLowerCase()}|${String(to).toLowerCase()}|${d}`);
    const out = [];
    if (seed % 10 < 3) out.push(EVENTS[seed % 5]);
    const fest = FESTIVALS.find(([f]) => { const g = (Date.parse(f) - t) / day; return g >= 0 && g <= 3; });
    if (fest && !out.some((e) => e[0] === 'festival')) out.push(['festival', `${fest[1]} rush`, `${fest[1]} is close: hubs are busy and couriers are adding a day.`, 'slow-all']);
    return out.map(([kind, title, detail, effect]) => ({ kind, title, detail, effect, delay_hours: effect === 'stop-road' ? 24 : effect === 'slow-all' ? 24 : 6,
      better: section === 'logistics' || section === 'vehicle' ? (effect === 'slow-all' ? 'Book a day earlier, or pick a partner with a later promise you can trust.' : 'Air cargo or an express courier avoids the highway for urgent goods.') : section === 'courier' ? 'Air express arrives on time; surface couriers may be a day late.' : 'Leave earlier or pick a later slot.' }));
  }
  routes['GET /v1/hub/outlook'] = hub(({ res, url }) => {
    const s = url.searchParams; const section = s.get('section') || 'courier'; const from = s.get('from') || ''; const to = s.get('to') || '';
    if (!from || !to) throw oops(400, 'Pick both ends of the route.');
    send(res, 200, { price: outlook(section, from, to), disruptions: disruptions(section, from, to, s.get('date')) });
  });

  // ---- A. moving house -----------------------------------------------------------------------------
  routes['POST /v1/hub/moving/plan'] = hub(({ res, body, h }) => {
    const date = Date.parse(body.date || ''); if (!date || date < Date.now() - day) throw oops(400, 'Pick your moving date.');
    const addr = text(body.new_address, 200); if (addr.length < 10) throw oops(400, 'Enter your new address.');
    if (!/^\d{6}$/.test(String(body.new_pincode || ''))) throw oops(400, 'Enter the 6-digit pin code of the new home.');
    // Utilities you pay through UT Log: from auto-pay, saved bills and past payments.
    const seen = new Set(); const bills = [];
    const push = (kind, provider, account, from) => { const k = `${kind}|${account}`; if (seen.has(k) || !UTILITY.includes(kind)) return; seen.add(k); bills.push({ id: `U${hash(k) % 1e6}`, kind, provider, account, from }); };
    (h.accounts || []).filter((a) => a.type === 'bill').forEach((a) => push(/gas/i.test(a.provider) ? 'gas' : 'electricity', a.provider, a.label, 'Auto-pay'));
    (h.savedBills || []).forEach((sb) => push(sb.cat, sb.provider || sb.biller || sb.cat, sb.account, 'Saved bill'));
    (h.records || []).filter((r) => r.section === 'bills').forEach((r) => push(r.kind, r.provider, r.sub, 'Paid before'));
    // Deliveries still on the way that have not been picked up can follow you to the new address.
    const deliveries = h.records.filter((r) => r.booking_id && ['vehicle', 'courier', 'logistics'].includes(r.section) && r.status !== 'CANCELLED').map((r) => ({ r, lv: live(r) })).filter(({ lv }) => lv.group === 'new').slice(0, 6)
      .map(({ r }) => ({ id: r.id, title: r.title, provider: r.provider, drop: r.drop_address || r.sub }));
    const plan = { id: rid('MV'), date: iso(date), size: body.size || '2bhk', from_city: text(body.from_city, 40), to_city: text(body.to_city, 40), new_address: addr, new_pincode: body.new_pincode, new_city: text(body.to_city, 40), bills, deliveries, created: iso(Date.now()) };
    h.moves = [plan, ...(h.moves || [])].slice(0, 5);
    send(res, 200, plan);
  });
  routes['POST /v1/hub/moving/apply'] = hub(({ res, body, h }) => {
    const plan = (h.moves || []).find((m) => m.id === body.plan_id); if (!plan) throw oops(400, 'Make the moving plan again.');
    const done = { bills: [], deliveries: [], address: false };
    // Utilities: a transfer request to each provider (demo: recorded as sent, confirmed in 2–4 days).
    (Array.isArray(body.bills) ? body.bills : []).forEach((id) => { const b = plan.bills.find((x) => x.id === id); if (!b || b.transfer) return; b.transfer = { status: 'requested', at: iso(Date.now()), effective: plan.date, ref: rid('TR') }; done.bills.push(b.provider); });
    // Deliveries not yet picked up: the drop address changes free of charge.
    (Array.isArray(body.deliveries) ? body.deliveries : []).forEach((id) => {
      const r = h.records.find((x) => x.id === id); if (!r || live(r).group !== 'new') return;
      r.drop_address = plan.new_address; r.label = 'Will deliver to your new home'; const b = engine.bookingById(r.booking_id); if (b) b.route.drop_address = plan.new_address; done.deliveries.push(r.id);
    });
    if (body.address) {
      h.profile.addresses = h.profile.addresses || [];
      if (!h.profile.addresses.some((a) => a.line === plan.new_address)) h.profile.addresses.unshift({ id: rid('AD'), label: 'New home', line: plan.new_address, city: plan.new_city, pincode: plan.new_pincode, default: true });
      h.profile.addresses.forEach((a, i) => { a.default = i === 0; }); done.address = true;
    }
    plan.applied = { at: iso(Date.now()), ...done };
    send(res, 200, plan);
  });
  routes['GET /v1/hub/moving'] = hub(({ res, h }) => send(res, 200, { data: h.moves || [] }));

  // ---- C. merge trips ------------------------------------------------------------------------------
  // Pending city trips (not picked up) from the same pickup area, booked within an hour of each other.
  const mergeGroups = (h) => {
    const pend = h.records.filter((r) => r.section === 'vehicle' && r.booking_id && r.bk_input && r.bk_input.service === 'local' && r.bk_input.cityKey && r.status !== 'CANCELLED' && !r.merged_into && live(r).group === 'new');
    const groups = {};
    pend.forEach((r) => { const k = `${r.bk_input.cityKey}|${r.bk_input.from}`; (groups[k] = groups[k] || []).push(r); });
    return Object.values(groups).map((g) => g.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))).filter((g) => g.length >= 2 && Date.parse(g[g.length - 1].at) - Date.parse(g[0].at) <= 3600000).map((g) => g.slice(0, 4));
  };
  const mergedQuote = (g) => {
    const i0 = g[0].bk_input; const city = i0.cityKey;
    const drops = g.map((r) => r.bk_input.to); const pts = [engine.areaPoint(city, i0.from), ...drops.map((a) => engine.areaPoint(city, a))];
    const km = +(pts.slice(1).reduce((t, p, n) => t + engine.haversine(pts[n], p), 0) * 1.35).toFixed(1);
    const weight = g.reduce((t, r) => t + (Number(r.bk_input.weight) || 0), 0);
    const cityName = engine.cities[city] ? engine.cities[city].name : '';
    const route = engine.resolveRoute({ from_place: `${i0.from}, ${cityName}`, to_place: `${drops[drops.length - 1]}, ${cityName}` });
    const input = engine.parseInput({ ...route, segment: i0.segment || 'b2c', weight, pieces: g.length, priority: 'best' });
    input.distanceKm = km; input.to = `${drops[drops.length - 1]} (+${g.length - 1} stop${g.length > 2 ? 's' : ''})`;
    const opt = engine.buildOptions(input).options.filter((o) => o.mode === 'local' && ['bike', 'auto', 'mini'].includes(o.vehicle)).sort((a, b) => a.total - b.total)[0];
    if (!opt) return null;
    const total = opt.total + 40 * (g.length - 1); const was = g.reduce((t, r) => t + r.amount, 0);
    return { input, option: { ...opt, total, price: opt.price + 40 * (g.length - 1) }, total, was, saving: was - total, km, drops };
  };
  routes['GET /v1/hub/merge'] = hub(({ res, h }) => {
    const out = mergeGroups(h).map((g) => { const q = mergedQuote(g); return q && q.saving > 0 ? { ids: g.map((r) => r.id), from: g[0].bk_input.from, drops: q.drops, trips: g.map((r) => ({ id: r.id, provider: r.provider, to: r.bk_input.to, amount: r.amount })), was: q.was, merged: q.total, saving: q.saving, partner: q.option.provider, vehicle: q.option.title } : null; }).filter(Boolean);
    send(res, 200, { data: out });
  });
  routes['POST /v1/hub/merge'] = hub(({ res, body, db, h }) => {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const g = mergeGroups(h).find((x) => x.length === ids.length && x.every((r) => ids.includes(r.id)));
    if (!g) throw oops(400, 'These trips can no longer be merged. One may already be on its way.');
    const q = mergedQuote(g); if (!q || q.saving <= 0) throw oops(400, 'Merging would not save anything for these trips.');
    const c = { name: g[0].contact_name || 'Customer', phone: g[0].contact_phone || '9876543210' };
    const { id } = engine.createBooking({ input: q.input, section: 'vehicle' }, q.option, { contact: c, pickup_address: g[0].pickup_address || q.input.from, drop_address: g.map((r) => r.drop_address || r.bk_input.to).join(' → ') });
    g.forEach((r) => { r.status = 'CANCELLED'; r.merged_into = id; r.label = `Merged into one trip · ${id}`; });
    const rec = addRecord(h, { id, booking_id: id, section: 'vehicle', title: `${q.option.title} · ${g.length} drops`, provider: q.option.provider, sub: `${q.input.from} → ${q.drops.join(' → ')}`, amount: q.total, pay_mode: 'prepaid', pay_via: 'wallet', status: 'BOOKED', label: `Merged ${g.length} trips · ${g.length} drops`, merged_from: g.map((r) => r.id), weight: q.input.weight, mode: 'local', km: Math.round(q.km), co2: q.option.co2 });
    credit(db, q.saving, `Refund · ${g.length} trips merged into one · ${id}`);
    send(res, 200, { id: rec.id, saving: q.saving, amount: q.total, wallet_balance: db.balance });
  });

  // ---- D. trip folders -----------------------------------------------------------------------------
  const GST = { flight: 5, train: 5, bus: 5, hotel: 12, stay: 12, ride: 5, courier: 18, vehicle: 18, logistics: 12 };
  const travelDay = (r) => Date.parse(((r.record_sub || r.sub || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '') || Date.parse(r.at);
  routes['GET /v1/hub/trips'] = hub(({ res, h }) => {
    const items = h.records.filter((r) => (r.section === 'travel' || r.section === 'rides' || r.luggage_for) && r.status !== 'CANCELLED').map((r) => ({ id: r.id, kind: r.kind || (r.luggage_for ? 'courier' : r.section === 'rides' ? 'ride' : 'travel'), title: r.title, provider: r.provider, sub: r.sub || r.record_sub, amount: r.amount || 0, at: r.at, on: travelDay(r), luggage_for: r.luggage_for || null }))
      .sort((a, b) => a.on - b.on);
    // A trip is everything within 4 days of each other; luggage follows its own ticket.
    const trips = [];
    items.forEach((it) => {
      const own = it.luggage_for && trips.find((t) => t.items.some((x) => x.id === it.luggage_for));
      const last = trips[trips.length - 1];
      if (own) own.items.push(it); else if (last && it.on - last.end <= 4 * day) { last.items.push(it); last.end = Math.max(last.end, it.on); } else trips.push({ start: it.on, end: it.on, items: [it] });
    });
    // A trip is anchored on a ticket or a stay; rides and parcels on their own are not a trip.
    const anchor = (x) => ['flight', 'train', 'bus', 'hotel', 'stay'].includes(x.kind) || /^(Flight|Train|Bus)/.test(x.title || '');
    const out = trips.filter((t) => t.items.some(anchor)).reverse().map((t, n) => {
      const main = t.items.find(anchor); const dest = String(main.title).includes('→') ? String(main.title).split('→').pop().replace(/ via .*/, '').trim() : String(main.title).split(',').pop().trim();
      const rows = t.items.map((x) => { const rate = GST[x.kind] || 18; const taxable = +(x.amount / (1 + rate / 100)).toFixed(2); return { ...x, gst_rate: rate, taxable, gst: +(x.amount - taxable).toFixed(2) }; });
      return { id: `TRIP${hash(t.start + dest) % 1e6}`, name: `Trip to ${dest}`, start: iso(t.start), end: iso(t.end), items: rows, total: rows.reduce((s, x) => s + x.amount, 0), gst: +rows.reduce((s, x) => s + x.gst, 0).toFixed(2), status: (h.tripStatus || {})[`TRIP${hash(t.start + dest) % 1e6}`] || 'draft' };
    });
    send(res, 200, { data: out });
  });
  routes['POST /v1/hub/trips/submit'] = hub(({ res, body, h }) => { h.tripStatus = h.tripStatus || {}; h.tripStatus[String(body.id)] = 'submitted'; send(res, 200, { ok: true }); });

  // ---- E. bulk gifting -------------------------------------------------------------------------------
  const giftPlans = new Map();
  routes['POST /v1/hub/gifting/quote'] = hub(({ res, body, owner }) => {
    if (!/^\d{6}$/.test(String(body.from_pin || ''))) throw oops(400, 'Enter the 6-digit pin code you send from.');
    const kg = Math.max(0.25, Math.min(10, Number(body.weight) || 1));
    const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 500);
    if (!rows.length) throw oops(400, 'Add at least one receiver.');
    const lines = rows.map((r, n) => {
      const name = text(r.name, 60); const phone = String(r.phone || '').replace(/\D/g, '').slice(-10); const pin = String(r.pincode || '').trim(); const address = text(r.address, 200);
      if (name.length < 2) return { n: n + 1, ok: false, error: 'Add a name' };
      if (!/^[6-9]\d{9}$/.test(phone)) return { n: n + 1, name, ok: false, error: 'Needs a 10-digit mobile' };
      if (!/^\d{6}$/.test(pin)) return { n: n + 1, name, ok: false, error: 'Needs a 6-digit pin code' };
      if (address.length < 8) return { n: n + 1, name, ok: false, error: 'Needs a full address' };
      try {
        const route = engine.resolveRoute({ from_place: body.from_pin, to_place: pin });
        const input = engine.parseInput({ ...route, segment: 'b2b', weight: kg, pieces: 1, priority: 'best' });
        const o = engine.buildOptions(input).options.filter((x) => x.kind === 'courier' && x.mode === 'parcel').sort((a, b) => a.total - b.total)[0];
        if (!o) return { n: n + 1, name, ok: false, error: 'No courier serves this pin code' };
        return { n: n + 1, ok: true, name, phone, pin, address, provider: o.provider, total: o.total, eta: o.eta, _o: o, _i: input };
      } catch (e) { return { n: n + 1, name, ok: false, error: e.message }; }
    });
    const ok = lines.filter((l) => l.ok); const id = crypto.randomBytes(8).toString('hex');
    giftPlans.set(id, { owner, lines: ok, title: text(body.title, 60) || 'Gift', expires: Date.now() + 30 * 60000 });
    send(res, 200, { plan_id: id, total: ok.reduce((t, l) => t + l.total, 0), ok: ok.length, failed: lines.filter((l) => !l.ok), lines: lines.map(({ _o, _i, ...l }) => l) });
  });
  routes['POST /v1/hub/gifting/book'] = hub(({ res, body, db, h, owner }) => {
    const p = giftPlans.get(String(body.plan_id || '')); if (!p || p.owner !== owner || p.expires < Date.now()) throw oops(400, 'This list has expired. Check it again.');
    const total = p.lines.reduce((t, l) => t + l.total, 0);
    requireApproval(h, total); takePayment(db, h, total, `Gifting · ${p.lines.length} parcels`); delete h.payApproval;
    const group = rid('GF'); const c = { name: (h.profile && (h.profile.company || h.profile.name)) || 'Sender', phone: /^[6-9]\d{9}$/.test((h.profile && h.profile.mobile) || '') ? h.profile.mobile : '9876543210' };
    const sent = p.lines.map((l) => {
      const { id } = engine.createBooking({ input: l._i, section: 'courier' }, l._o, { contact: c, pickup_address: `${c.name}, ${l._i.from}`, drop_address: `${l.name}, ${l.address}` });
      const b = engine.bookingById(id); if (b) b.rx = { key: crypto.randomBytes(9).toString('base64url'), prefs: {}, requests: [] };
      addRecord(h, { id, booking_id: id, section: 'courier', title: `${p.title} · ${l.name}`, provider: l.provider, sub: `${l._i.from} → ${l.pin}`, amount: l.total, pay_mode: 'prepaid', pay_via: 'wallet', status: 'BOOKED', label: 'Gift booked · receiver can pick a slot', weight: l._i.weight, gift: { group, name: l.name, phone: l.phone }, receiver: { name: l.name, phone: l.phone }, mode: 'parcel', co2: l._o.co2, km: Math.round(l._i.distanceKm || 0) });
      return { id, name: l.name, phone: l.phone, provider: l.provider, link: b ? `/r/?id=${encodeURIComponent(id)}&k=${b.rx.key}` : null };
    });
    giftPlans.delete(body.plan_id);
    send(res, 200, { id: group, group, sent, amount: total, wallet_balance: db.balance });
  });

  // ---- F. family wallet ------------------------------------------------------------------------------
  const famOf = (h) => (h.family = h.family || { members: [], requests: [], month: dayOf(Date.now()).slice(0, 7) });
  const roll = (f) => { const m = dayOf(Date.now()).slice(0, 7); if (f.month !== m) { f.month = m; f.members.forEach((x) => { x.spent = 0; }); } };
  routes['GET /v1/hub/family'] = hub(({ res, h }) => { const f = famOf(h); roll(f); send(res, 200, f); });
  routes['POST /v1/hub/family/member'] = hub(({ res, body, h }) => {
    const f = famOf(h);
    if (body.remove) { f.members = f.members.filter((m) => m.id !== body.id); return send(res, 200, f); }
    const name = text(body.name, 40); if (name.length < 2) throw oops(400, 'Enter their name.');
    const phone = String(body.phone || ''); if (!/^[6-9]\d{9}$/.test(phone)) throw oops(400, 'Enter their 10-digit mobile number.');
    const limit = Math.max(0, Math.round(Number(body.monthly_limit) || 0)); const over = Math.max(0, Math.round(Number(body.approve_over) || 0));
    const m = f.members.find((x) => x.id === body.id) || (() => { if (f.members.length >= 6) throw oops(400, 'Up to 6 family members.'); const x = { id: rid('FM'), spent: 0 }; f.members.push(x); return x; })();
    Object.assign(m, { name, phone, relation: text(body.relation, 20) || 'Family', monthly_limit: limit, approve_over: over, services: Array.isArray(body.services) ? body.services.filter((x) => ['rides', 'travel', 'bills', 'recharge', 'parcels'].includes(x)) : ['rides', 'recharge', 'bills'] });
    send(res, 200, f);
  });
  // Demo: a family member books something from their own phone.
  const ASKS = [['rides', 'Uber Go · college to home', 180, 420], ['recharge', 'Mobile recharge · Jio 2 GB/day', 299, 349], ['travel', 'Bus · Bengaluru to Mysuru', 450, 900], ['bills', 'Broadband bill', 600, 999], ['parcels', 'Courier · documents to Chennai', 120, 260]];
  routes['POST /v1/hub/family/simulate'] = hub(({ res, body, db, h }) => {
    const f = famOf(h); roll(f); const m = f.members.find((x) => x.id === body.id); if (!m) throw oops(400, 'Pick a family member.');
    const allowed = ASKS.filter((a) => (m.services || []).includes(a[0])); if (!allowed.length) throw oops(400, `${m.name} has no services allowed.`);
    const [svc, what, lo, hi] = allowed[crypto.randomInt(0, allowed.length)]; const amount = lo + crypto.randomInt(0, hi - lo + 1);
    const req = { id: rid('FR'), member: m.id, name: m.name, service: svc, what, amount, at: iso(Date.now()) };
    if (m.monthly_limit && m.spent + amount > m.monthly_limit) { req.status = 'blocked'; req.note = `Over ${m.name}'s monthly limit of ₹${m.monthly_limit.toLocaleString('en-IN')}`; }
    else if (m.approve_over && amount > m.approve_over) { req.status = 'pending'; req.note = `Over ₹${m.approve_over.toLocaleString('en-IN')}, so it needs your approval`; }
    else { takePayment(db, h, amount, `Family · ${m.name} · ${what}`); m.spent += amount; req.status = 'paid'; req.note = 'Within the limits you set'; }
    f.requests.unshift(req); f.requests = f.requests.slice(0, 50);
    send(res, 200, { family: f, request: req, wallet_balance: db.balance });
  });
  routes['POST /v1/hub/family/decide'] = hub(({ res, body, db, h }) => {
    const f = famOf(h); const req = f.requests.find((r) => r.id === body.id && r.status === 'pending'); if (!req) throw oops(400, 'Nothing is waiting.');
    if (!body.approve) { req.status = 'declined'; req.decided = iso(Date.now()); return send(res, 200, f); }
    if (body.dry_run) return send(res, 200, { ok: true, amount: req.amount });
    requireApproval(h, req.amount); takePayment(db, h, req.amount, `Family · ${req.name} · ${req.what}`); delete h.payApproval;
    const m = f.members.find((x) => x.id === req.member); if (m) m.spent += req.amount;
    req.status = 'approved'; req.decided = iso(Date.now());
    send(res, 200, { ...f, wallet_balance: db.balance });
  });

  // ---- G. instant damage claims ------------------------------------------------------------------------
  // Insured: the insurer reviews the photos and pays the wallet (demo: a minute later). Not insured:
  // the claim goes to the carrier under its own liability; UT Log never pays it.
  function autoClaim(r, source, note) {
    if (r.claim) return;
    const insured = (r.insurance || 0) > 0 && (r.declared || 0) > 0;
    r.claim = insured ? { type: 'Damage', auto: true, source, note, at: iso(Date.now()), status: 'UNDER_REVIEW', insurer: 'Acko General (demo)', payout: Math.round(r.declared * 0.6), decide_at: Date.now() + 60000 }
      : { type: 'Damage', auto: true, source, note, at: iso(Date.now()), status: 'WITH_CARRIER', payout: 0, carrier: r.provider, carrier_limit: Math.min(5000, Math.round((r.amount || 0) * 10)) };
  }
  const sweepClaims = (db, h) => {
    for (const r of h.records || []) {
      // A receiver reported damage on their link page.
      if (r.booking_id && !r.claim) { const b = engine.bookingById(r.booking_id); if (b && b.rx && b.rx.damage) { autoClaim(r, 'receiver', b.rx.damage.note); if (r.claim && b.rx.unboxing) { r.claim.evidence = { kind: 'Unboxing video', seconds: b.rx.unboxing.seconds, seal: b.rx.unboxing.hash.slice(0, 12), sealed: b.rx.unboxing.sealed }; if (r.claim.decide_at) r.claim.decide_at = Date.now() + 20000; if (r.claim.status === 'WITH_CARRIER') r.claim.carrier_note = 'Unboxing video attached: the carrier cannot say it left in good shape.'; } else if (r.claim) r.claim.evidence = null; } }
      if (r.freight && r.freight.pod && r.freight.pod.damage && !r.claim) autoClaim(r, 'proof of delivery', r.freight.pod.remarks);
      if (r.claim && r.claim.auto && r.claim.status === 'UNDER_REVIEW' && r.claim.decide_at <= Date.now()) { r.claim.status = 'APPROVED'; r.claim.paid_at = iso(Date.now()); credit(db, r.claim.payout, `Insurance payout · ${r.claim.insurer} · ${r.id}`); }
    }
  };

  return { sweeps: [sweepClaims], outlook, disruptions };
};
