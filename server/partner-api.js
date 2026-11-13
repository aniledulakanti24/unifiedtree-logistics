// UT Partner app: drivers sign up, go online, take trips and get paid.
// Customer bookings on UT's own partner network are offered here first (see dispatch in
// booking-api); sample trips keep the app useful in the sandbox when no customer is booking.
'use strict';
const crypto = require('crypto');
const store = require('./store');

module.exports = function partnerApi(routes, { send, authUser }, engine) {
  const drivers = store.track('drivers', new Map());
  const offersFor = new Map(); // driver key -> current sample offers, so accept can find them
  const iso = (t) => new Date(t).toISOString();
  const text = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
  const fail = (res, status, message) => send(res, status, { message });
  const COMMISSION = 0.18; // UT keeps 18% of the customer fare
  const SAMPLE_OTP = { pickup: '1234', delivery: '5678' };
  const VEH = Object.fromEntries(engine.VEHICLES.map((v) => [v.key, v]));
  const cityName = (k) => (engine.cities[k] && engine.cities[k].name) || '';

  // Every route needs a signed-in user; most need a partner profile too.
  const withUser = (fn, needDriver = true) => async (req, res, body, url) => {
    const user = authUser(req);
    if (!user) return fail(res, 401, 'Please sign in.');
    const d = drivers.get(user.key) || null;
    if (needDriver && !d) return fail(res, 404, 'Finish partner sign-up first.');
    try { await fn({ req, res, body: body || {}, url, user, d }); } catch (e) { fail(res, 400, e.message); }
  };
  const publicDriver = (d) => ({ name: d.name, phone: `+91 ${d.phone.slice(0, 5)} •••••`, vehicle_no: d.vehicle_no, rating: d.rating, partner: true });
  const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); };
  const stats = (d) => {
    const t0 = today0(); const w0 = t0 - 6 * 864e5;
    const sum = (from) => d.trips.filter((x) => Date.parse(x.at) >= from).reduce((s, x) => s + x.earn, 0);
    return { today: sum(t0), week: sum(w0), trips_today: d.trips.filter((x) => Date.parse(x.at) >= t0).length, trips: d.trips.length, balance: d.balance, rating: d.rating, acceptance: d.offered ? Math.round((d.accepted / d.offered) * 100) : 100 };
  };
  const view = (d) => ({ profile: { name: d.name, phone: d.phone, city: d.city, city_name: cityName(d.city), vehicle: d.vehicle, vehicle_name: (VEH[d.vehicle] || {}).name, vehicle_no: d.vehicle_no, upi: d.upi, dl: d.dl.replace(/.(?=.{4})/g, '•'), status: d.status, joined_at: d.joined_at, docs: d.docs }, online: d.online, active: d.active, stats: stats(d) });

  routes['GET /v1/partner/me'] = withUser(({ res, d, user }) => send(res, 200, d ? view(d) : { profile: null, suggest: { name: user.name || '', phone: user.mobile || '' } }), false);

  // Sign-up: who you are, your vehicle, your documents and where to pay you.
  routes['POST /v1/partner/signup'] = withUser(({ res, body, user, d }) => {
    if (d) throw new Error('You are already a UT partner.');
    const name = text(body.name, 60);
    if (name.length < 2) throw new Error('Enter your full name as on your driving licence.');
    const phone = text(body.phone, 10);
    if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a 10-digit mobile number.');
    if (!engine.cities[body.city]) throw new Error('Pick the city you drive in.');
    if (!VEH[body.vehicle]) throw new Error('Pick your vehicle type.');
    const vno = text(body.vehicle_no, 14).toUpperCase().replace(/\s+/g, ' ');
    if (!/^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{3,4}$/.test(vno)) throw new Error('Enter the vehicle number as on the RC, like KA 05 MN 4821.');
    const dl = text(body.dl, 16).toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z]{2}\d{13}$/.test(dl)) throw new Error('Enter the 15-character driving licence number, like KA0520190012345.');
    if (!body.consent) throw new Error('Agree to the background check to continue.');
    const upi = text(body.upi, 60);
    if (upi && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(upi)) throw new Error('Enter a UPI ID like name@bank, or leave it for later.');
    const docs = { dl: !!body.docs && !!body.docs.dl, rc: !!body.docs && !!body.docs.rc, selfie: !!body.docs && !!body.docs.selfie };
    if (!docs.dl || !docs.rc || !docs.selfie) throw new Error('Add photos of your licence and RC, and a selfie.');
    const nd = { key: user.key, name, phone, city: body.city, vehicle: body.vehicle, vehicle_no: vno, dl, upi, docs, status: 'verified', online: false, rating: 4.8, trips: [], balance: 0, payouts: [], active: null, offered: 0, accepted: 0, declined: [], joined_at: iso(Date.now()) };
    drivers.set(user.key, nd);
    send(res, 200, view(nd));
  }, false);

  routes['POST /v1/partner/online'] = withUser(({ res, body, d }) => {
    if (!body.online && d.active) throw new Error('Finish or hand back your current trip before going offline.');
    d.online = !!body.online;
    send(res, 200, view(d));
  });
  routes['POST /v1/partner/profile'] = withUser(({ res, body, d }) => {
    if (body.upi != null) { const upi = text(body.upi, 60); if (upi && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(upi)) throw new Error('Enter a UPI ID like name@bank.'); d.upi = upi; }
    send(res, 200, view(d));
  });

  // ---- offers ---------------------------------------------------------------------
  const km = (a, b) => (a && b ? engine.haversine(a, b) : null);
  function sampleOffers(d) {
    const bucket = Math.floor(Date.now() / 45000);
    const city = engine.cities[d.city]; const v = VEH[d.vehicle];
    const seed = crypto.createHash('md5').update(d.key + bucket).digest();
    const loc = city.localities;
    const list = [0, 1].map((n) => {
      const a = loc[seed[n * 2] % loc.length]; let b = loc[seed[n * 2 + 1] % loc.length];
      if (a === b) b = loc[(loc.indexOf(a) + 1) % loc.length];
      const dist = Math.max(2, +engine.haversine([a[1], a[2]], [b[1], b[2]]).toFixed(1));
      const fare = Math.round(v.base + v.per_km * dist * 1.15);
      return { id: `SJ${bucket.toString(36).toUpperCase()}${n}`, kind: 'sample', vehicle: d.vehicle, vehicle_name: v.name, pickup: { area: a[0], city: city.name, pt: [a[1], a[2]] }, drop: { area: b[0], city: city.name, pt: [b[1], b[2]] }, km: dist, to_pickup_min: 3 + (seed[6 + n] % 7), earn: Math.round(fare * (1 - COMMISSION)), fare, load: n ? 'Cartons · 40 kg' : 'Parcel · 6 kg', expires_at: iso((bucket + 1) * 45000) };
    });
    return list.filter((o) => !d.declined.includes(o.id));
  }
  function customerOffers(d) {
    return engine.dispatchPool().filter((b) => b.option.vehicle === d.vehicle && (!b.route.city || b.route.city === cityName(d.city)) && !d.declined.includes(b.id)).map((b) => ({
      id: b.id, kind: 'customer', vehicle: b.option.vehicle, vehicle_name: (VEH[b.option.vehicle] || {}).name, provider: b.option.provider,
      pickup: { area: b.route.from, city: b.route.city || '', pt: b.from_pt }, drop: { area: b.route.to, city: b.route.city || '', pt: b.to_pt },
      km: b.route.distance_km || km(b.from_pt, b.to_pt), to_pickup_min: b.option.eta_pickup_min || 6, earn: Math.round(b.option.total * (1 - COMMISSION)), fare: b.option.total,
      load: `${b.load.category || 'Goods'} · ${b.load.weight} kg`, expires_at: iso(b.dispatch.until),
    }));
  }
  routes['GET /v1/partner/offers'] = withUser(({ res, d }) => {
    if (!d.online || d.active) return send(res, 200, { offers: [] });
    const sample = sampleOffers(d); offersFor.set(d.key, sample);
    send(res, 200, { offers: [...customerOffers(d), ...sample] });
  });
  routes['POST /v1/partner/decline'] = withUser(({ res, body, d }) => {
    d.offered++; d.declined = [String(body.id || ''), ...d.declined].slice(0, 40);
    send(res, 200, view(d));
  });
  routes['POST /v1/partner/accept'] = withUser(({ res, body, d }) => {
    if (!d.online) throw new Error('Go online to take trips.');
    if (d.active) throw new Error('Finish your current trip first.');
    const id = String(body.id || '');
    d.offered++;
    if (id.startsWith('SJ')) {
      const o = (offersFor.get(d.key) || []).find((x) => x.id === id);
      if (!o || Date.parse(o.expires_at) < Date.now()) throw new Error('This trip has expired.');
      d.active = { ...o, stage: 'to_pickup', accepted_at: iso(Date.now()), pickup: { ...o.pickup, address: `Gate 2, ${o.pickup.area}`, contact: { name: 'Sample sender', phone: '98450 •••••' } }, drop: { ...o.drop, address: `Shop 14, ${o.drop.area}`, contact: { name: 'Sample receiver', phone: '99000 •••••' } }, sample_otp: SAMPLE_OTP };
    } else {
      const b = engine.assignDriver(id, publicDriver(d));
      const o = customerOffers({ ...d, declined: [] }).find((x) => x.id === id) || {};
      const places = b.places || {};
      d.active = { id, kind: 'customer', vehicle_name: (VEH[b.option.vehicle] || {}).name, provider: b.option.provider, km: b.route.distance_km, earn: Math.round(b.option.total * (1 - COMMISSION)), fare: b.option.total, load: `${b.load.category || 'Goods'} · ${b.load.weight} kg`,
        pickup: { area: b.route.from, address: b.route.pickup_address, pt: b.from_pt, contact: { name: b.contact.name, phone: `${b.contact.phone.slice(0, 5)} •••••` } },
        drop: { area: b.route.to, address: b.route.drop_address, pt: b.to_pt, contact: null }, stage: 'to_pickup', accepted_at: iso(Date.now()), to_pickup_min: o.to_pickup_min || 6, places };
    }
    d.accepted++;
    send(res, 200, view(d));
  });

  // ---- the trip ---------------------------------------------------------------------
  const NEXT = { arrived: ['to_pickup', 'at_pickup'], pickup: ['at_pickup', 'to_drop'], deliver: ['to_drop', 'done'] };
  routes['POST /v1/partner/trip'] = withUser(({ res, body, d }) => {
    const a = d.active;
    if (!a) throw new Error('You have no trip right now.');
    if (body.action === 'release') {
      if (a.stage === 'to_drop') throw new Error('The goods are with you. Deliver them, or call support.');
      if (a.kind === 'customer') engine.stepTrip(a.id, 'release');
      d.active = null; d.declined = [a.id, ...d.declined].slice(0, 40);
      return send(res, 200, view(d));
    }
    const step = NEXT[body.action];
    if (!step || a.stage !== step[0]) throw new Error('That step does not apply right now.');
    const otp = text(body.otp, 4);
    if (body.action !== 'arrived' && !/^\d{4}$/.test(otp)) throw new Error('Enter the 4-digit OTP.');
    if (a.kind === 'customer') engine.stepTrip(a.id, body.action, otp);
    else if (body.action !== 'arrived' && otp !== a.sample_otp[body.action === 'pickup' ? 'pickup' : 'delivery']) throw new Error(`That OTP is not right. In the sandbox it is ${a.sample_otp[body.action === 'pickup' ? 'pickup' : 'delivery']}.`);
    a.stage = step[1];
    a[`${body.action}_at`] = iso(Date.now());
    if (a.stage === 'done') {
      d.trips.unshift({ id: a.id, kind: a.kind, at: iso(Date.now()), from: a.pickup.area, to: a.drop.area, km: a.km, earn: a.earn, fare: a.fare });
      d.trips = d.trips.slice(0, 200);
      d.balance += a.earn;
      const done = a; d.active = null;
      return send(res, 200, { ...view(d), completed: { earn: done.earn, from: done.pickup.area, to: done.drop.area } });
    }
    send(res, 200, view(d));
  });

  // ---- money ------------------------------------------------------------------------
  routes['GET /v1/partner/earnings'] = withUser(({ res, d }) => {
    const days = Array.from({ length: 7 }, (_, i) => { const from = today0() - (6 - i) * 864e5; const list = d.trips.filter((x) => { const t = Date.parse(x.at); return t >= from && t < from + 864e5; }); return { day: iso(from).slice(0, 10), earn: list.reduce((s, x) => s + x.earn, 0), trips: list.length }; });
    send(res, 200, { ...stats(d), days, trips: d.trips.slice(0, 30), payouts: d.payouts.slice(0, 10), upi: d.upi, commission: COMMISSION });
  });
  routes['POST /v1/partner/payout'] = withUser(({ res, d }) => {
    if (!d.upi) throw new Error('Add your UPI ID in Account to get paid.');
    if (d.balance < 1) throw new Error('Nothing to pay out yet. Complete a trip first.');
    const p = { id: 'PO' + Date.now().toString(36).toUpperCase(), amount: d.balance, upi: d.upi, at: iso(Date.now()), status: 'Sent (sandbox)' };
    d.payouts.unshift(p); d.balance = 0;
    send(res, 200, { payout: p, ...view(d) });
  });
};
