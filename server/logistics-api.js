// Logistics modules: shipments, bulk upload, print documents, tracking,
// international, exchanges, courier/pincode/TAT/SKU rules, weight freeze,
// RTO control tower, Delivery Boost, delay radar and delivery promise.
'use strict';

module.exports = function register(routes, { send, authUser }, ctx) {
  const { seller, findOrder, move, debit, paginate, inRange, rates, ratesFor, riskOf, addressQuality, decorate, duplicateIds, nextPickupDate,
    pickupOf, awbIndex, books, iso, ymd, day, COURIERS, COUNTRIES, ZONES, RETURN_REASONS, createTicket, defaultSettings } = ctx;
  const publicDb = { settings: defaultSettings() }; // default rules for public quotes
  const bad = (res, message) => send(res, 400, { message });
  const PIN = /^\d{6}$/;

  // ---- shipments ------------------------------------------------------------
  routes['GET /v1/shipments/all'] = seller(({ res, db, url }) => {
    const status = url.searchParams.get('status');
    const courier = Number(url.searchParams.get('courier_id')) || 0;
    const q = (url.searchParams.get('search') || '').toLowerCase();
    const intl = url.searchParams.get('is_international') === '1';
    const list = db.orders
      .filter((o) => o.awb && !!o.is_international === intl && inRange(o.created_at, url))
      .filter((o) => !status || o.status === status)
      .filter((o) => !courier || o.courier_id === courier)
      .filter((o) => !q || [o.awb, o.channel_order_id, o.customer.name, o.customer.phone].some((v) => String(v).toLowerCase().includes(q)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({ id: o.id, awb: o.awb, channel_order_id: o.channel_order_id, courier: o.courier, courier_id: o.courier_id, status: o.status, customer: o.customer,
        weight: o.package.weight, freight: o.freight, payment_method: o.payment_method, total: o.total, edd: o.edd, pickup_date: o.pickup_date, manifest_id: o.manifest_id,
        last: o.timeline[o.timeline.length - 1], delayed: !!o.delay }));
    send(res, 200, paginate(list, url));
  });

  routes['POST /v1/tracking/bulk'] = seller(({ res, db, body }) => {
    const awbs = [...new Set(String(body.awbs || '').split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 100);
    if (!awbs.length) return bad(res, 'Paste at least one AWB number.');
    send(res, 200, { data: awbs.map((awb) => {
      const o = db.orders.find((x) => x.awb === awb);
      return o ? { awb, found: true, order_id: o.id, channel_order_id: o.channel_order_id, courier: o.courier, status: o.status, edd: o.edd, last: o.timeline[o.timeline.length - 1], city: o.customer.city }
        : { awb, found: false };
    }) });
  });

  // Public, unauthenticated: powers the seller-branded tracking page.
  routes['GET /v1/public/track'] = async (req, res, body, url) => {
    const awb = (url.searchParams.get('awb') || '').trim().toUpperCase();
    const hit = awbIndex.get(awb);
    const db = hit && books.get(hit.key);
    const o = db && findOrder(db, hit.id);
    if (!o) return send(res, 404, { message: 'We could not find that tracking number.' });
    const tp = db.settings.tracking_page;
    const recs = tp.recommendations.map((sku) => db.skus.find((s) => s.sku === sku)).filter(Boolean)
      .map((s) => ({ name: s.name, price: s.price, url: tp.store_url ? `${tp.store_url.replace(/\/$/, '')}/search?q=${encodeURIComponent(s.sku)}` : '' }));
    send(res, 200, {
      awb, status: o.status, courier: o.courier, edd: o.edd, delayed: !!o.delay, destination: `${o.customer.city}, ${o.customer.pincode}`,
      timeline: [...o.timeline].reverse(), products: tp.show_products ? o.products.map((p) => ({ name: p.name, qty: p.qty })) : [],
      brand: { name: tp.brand_name || 'Your store', color: tp.color, support_phone: tp.support_phone, support_email: tp.support_email, banner: tp.banner, store_url: tp.store_url },
      recommendations: recs, can_rate: tp.rating_enabled && o.status === 'DELIVERED' && !o.feedback, feedback: o.feedback ? { rating: o.feedback.rating } : null,
    });
  };

  // Buyer rating after delivery, from the tracking page. One per shipment.
  routes['POST /v1/public/track/feedback'] = async (req, res, body) => {
    const awb = String(body.awb || '').trim().toUpperCase();
    const hit = awbIndex.get(awb);
    const db = hit && books.get(hit.key);
    const o = db && findOrder(db, hit.id);
    if (!o) return send(res, 404, { message: 'We could not find that tracking number.' });
    const rating = Math.round(Number(body.rating));
    if (!(rating >= 1 && rating <= 5)) return bad(res, 'Pick 1 to 5 stars.');
    if (o.status !== 'DELIVERED' || !db.settings.tracking_page.rating_enabled) return bad(res, 'Ratings open once your order is delivered.');
    if (o.feedback) return send(res, 409, { message: 'Thanks — you already rated this delivery.' });
    o.feedback = { rating, comment: String(body.comment || '').slice(0, 300), at: iso(Date.now()) };
    send(res, 200, { ok: true });
  };

  // Public rate quote for the pricing page (default rules, no account).
  routes['GET /v1/public/rates'] = async (req, res, body, url) => {
    const pickupPin = url.searchParams.get('pickup') || '';
    const drop = url.searchParams.get('delivery') || '';
    const weight = Number(url.searchParams.get('weight'));
    if (!PIN.test(pickupPin) || !PIN.test(drop)) return bad(res, 'Enter valid 6-digit pickup and delivery pincodes.');
    if (!(weight > 0 && weight <= 50)) return bad(res, 'Weight must be between 0.1 and 50 kg.');
    try {
      const q = rates(publicDb, { pickup: pickupPin, drop, weight, cod: url.searchParams.get('cod') === '1', amount: Number(url.searchParams.get('value')) || 1000 });
      if (!authUser(req)) return send(res, 200, { locked: true, count: q.data.length });
      send(res, 200, { zone: q.zone, data: q.data.map(({ courier_name, rate, etd_days }) => ({ courier_name, rate, etd_days })) });
    } catch (err) { send(res, err.status || 500, { message: err.message }); }
  };

  // ---- print documents (labels, manifests, invoices) -----------------------
  routes['GET /v1/print/docs'] = seller(({ res, db, url, user }) => {
    const ids = (url.searchParams.get('ids') || '').split(',').map(Number).filter(Boolean);
    const type = url.searchParams.get('type');
    const orders = ids.map((id) => findOrder(db, id)).filter(Boolean);
    if (!orders.length) return bad(res, 'Select orders to print.');
    if (type !== 'invoice' && orders.some((o) => !o.awb)) return bad(res, 'Labels and manifests need shipped orders (with an AWB).');
    send(res, 200, {
      type, generated_at: iso(Date.now()),
      seller: { name: user.name ? user.name.split(' ')[0] + "'s Store" : 'My Store', gstin: (db.kyc && db.kyc.gstin) || '' },
      orders: orders.map((o) => ({ ...o, pickup: pickupOf(db, o) })),
    });
  });

  // ---- bulk upload ----------------------------------------------------------
  routes['POST /v1/orders/bulk'] = seller(async ({ res, db, body, req, url, user }) => {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
    if (!rows.length) return bad(res, 'The file has no order rows.');
    const results = [];
    for (const [i, r] of rows.entries()) {
      const fake = { statusCode: 200, body: null, writeHead(s) { this.statusCode = s; }, end(b) { this.body = JSON.parse(b); } };
      await routes['POST /v1/orders/create'](req, fake, {
        order_id: r.order_id, payment_method: r.payment_method, pickup_address_id: r.pickup_address_id, channel: 'Bulk upload',
        customer: { name: r.name, phone: r.phone, address: r.address, city: r.city, state: r.state, pincode: r.pincode, country: r.country || 'India' },
        product: { name: r.product, sku: r.sku, price: r.price, qty: r.qty || 1 }, weight: r.weight, length: r.length, breadth: r.breadth, height: r.height,
      }, url);
      results.push(fake.statusCode < 400 ? { row: i + 2, ok: true, order_id: fake.body.order_id } : { row: i + 2, ok: false, error: fake.body.message });
    }
    send(res, 200, { created: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length, results });
  });

  // ---- international --------------------------------------------------------
  routes['GET /v1/international/countries'] = seller(({ res }) => send(res, 200, { data: Object.keys(COUNTRIES) }));
  routes['GET /v1/international/quote'] = seller(({ res, db, url }) => {
    const country = url.searchParams.get('country');
    const weight = Number(url.searchParams.get('weight'));
    if (!COUNTRIES[country]) return bad(res, 'Pick a destination country.');
    if (!(weight > 0 && weight <= 30)) return bad(res, 'Weight must be between 0.1 and 30 kg.');
    const value = Number(url.searchParams.get('value')) || 0;
    const q = rates(db, { country, weight, pickup: '560034', drop: '' });
    const dutyRate = { 'United States': 0.08, 'United Kingdom': 0.2, Germany: 0.19, Australia: 0.1, Canada: 0.13 }[country] || 0.05;
    send(res, 200, { ...q, duties_estimate: Math.round(value * dutyRate), duty_rate: dutyRate, documents: ['Commercial invoice', 'IEC code', 'KYC of exporter', value > 25000 ? 'Shipping bill (CSB-V)' : 'CSB-IV declaration'] });
  });

  // ---- exchanges ------------------------------------------------------------
  routes['POST /v1/orders/exchange/create'] = seller(({ res, db, body }) => {
    const ids = (body.order_ids || []).map(Number);
    if (!ids.length) return bad(res, 'Select delivered orders to exchange.');
    const created = [];
    const failed = [];
    for (const id of ids) {
      const o = findOrder(db, id);
      if (!o || o.status !== 'DELIVERED') { failed.push({ order_id: id, reason: 'Not a delivered order' }); continue; }
      if (db.returns.some((r) => r.order_id === o.id)) { failed.push({ order_id: id, reason: 'Already has a return or exchange' }); continue; }
      const p = o.products[0];
      const newSku = body.new_sku || p.sku;
      const cat = db.skus.find((s) => s.sku === newSku);
      const fwdId = ++db.nextOrderId;
      const fwd = {
        ...JSON.parse(JSON.stringify(o)), id: fwdId, channel_order_id: o.channel_order_id + '-EX', created_at: iso(Date.now()), type: 'EXCHANGE',
        products: [{ name: cat ? cat.name : p.name, sku: newSku, qty: p.qty, price: 0 }], total: 0, payment_method: 'Prepaid', verified: true,
        status: 'NEW', courier: null, courier_id: null, awb: null, freight: null, ndr: null, delay: null, edd: null, timeline: [{ status: 'NEW', at: iso(Date.now()), location: '' }],
        note: String(body.note || '').slice(0, 120),
      };
      db.orders.unshift(fwd);
      const r = {
        id: 9000 + db.returns.length + 1, order_id: o.id, channel_order_id: o.channel_order_id, customer: o.customer.name, product: p.name, sku: p.sku, qty: p.qty,
        reason: body.reason || RETURN_REASONS[0], status: 'RETURN_PENDING', type: 'EXCHANGE', exchange_order_id: fwdId, new_sku: newSku, qc: true,
        qc_checks: ['Product matches', 'Tags intact', 'No damage'], refund_mode: 'Exchange', created_at: iso(Date.now()),
      };
      db.returns.unshift(r);
      created.push({ return_id: r.id, exchange_order_id: fwdId });
    }
    if (!created.length) return bad(res, failed[0].reason);
    send(res, 200, { created, failed });
  });

  // ---- courier priority -----------------------------------------------------
  routes['GET /v1/settings/courier'] = seller(({ res, db }) => {
    const shipped = db.orders.filter((o) => o.awb && !o.is_international);
    send(res, 200, { ...db.settings.courier, couriers: COURIERS.map((c) => {
      const mine = shipped.filter((o) => o.courier_id === c.id);
      const closed = mine.filter((o) => ['DELIVERED', 'RTO'].includes(o.status));
      return { id: c.id, name: c.name, days: c.days, shipments: mine.length, delivery_rate: closed.length ? Math.round((closed.filter((o) => o.status === 'DELIVERED').length / closed.length) * 100) : null };
    }) });
  });
  routes['POST /v1/settings/courier'] = seller(({ res, db, body }) => {
    const s = db.settings.courier;
    if (body.mode && !['recommended', 'cheapest', 'fastest', 'custom'].includes(body.mode)) return bad(res, 'Unknown priority mode.');
    if (body.enabled && !Object.values(body.enabled).some(Boolean)) return bad(res, 'Keep at least one courier enabled.');
    if (body.order && (body.order.length !== COURIERS.length || !COURIERS.every((c) => body.order.includes(c.id)))) return bad(res, 'Order must list every courier once.');
    if (body.mode) s.mode = body.mode;
    if (body.enabled) s.enabled = Object.fromEntries(COURIERS.map((c) => [c.id, body.enabled[c.id] !== false]));
    if (body.order) s.order = body.order.map(Number);
    send(res, 200, s);
  });

  // ---- pincode rules --------------------------------------------------------
  routes['GET /v1/settings/pincode'] = seller(({ res, db }) => send(res, 200, { ...db.settings.pincode, zones_list: ZONES }));
  routes['POST /v1/settings/pincode'] = seller(({ res, db, body }) => {
    const p = db.settings.pincode;
    const { list, action } = body;
    if (!['blocked', 'padding', 'zones'].includes(list)) return bad(res, 'Unknown rule list.');
    if (action === 'remove') { p[list].splice(Number(body.index), 1); return send(res, 200, p); }
    const pins = String(body.pincodes || body.pincode || '').split(/[\s,]+/).filter(Boolean);
    if (list === 'zones') {
      if (!/^\d{2,6}$/.test(body.prefix || '') || !(Number(body.zone) >= 0 && Number(body.zone) <= 3)) return bad(res, 'Enter a 2–6 digit pincode prefix and a zone.');
      p.zones = p.zones.filter((z) => z.prefix !== body.prefix).concat({ prefix: body.prefix, zone: Number(body.zone) });
      return send(res, 200, p);
    }
    if (!pins.length || !pins.every((x) => PIN.test(x))) return bad(res, 'Enter one or more valid 6-digit pincodes.');
    if (list === 'blocked') {
      if (!['all', 'cod'].includes(body.scope)) return bad(res, 'Choose whether to block all orders or only COD.');
      pins.forEach((pin) => { p.blocked = p.blocked.filter((b) => b.pincode !== pin).concat({ pincode: pin, scope: body.scope, reason: String(body.reason || '').slice(0, 80) }); });
    } else {
      const days = Number(body.days);
      if (!(days >= 1 && days <= 10)) return bad(res, 'Padding must be 1–10 days.');
      pins.forEach((pin) => { p.padding = p.padding.filter((b) => b.pincode !== pin).concat({ pincode: pin, days }); });
    }
    send(res, 200, p);
  });
  routes['GET /v1/pincode/check'] = seller(({ res, db, url }) => {
    const pin = url.searchParams.get('pincode') || '';
    if (!PIN.test(pin)) return bad(res, 'Enter a valid 6-digit pincode.');
    const from = db.pickup[0].pincode;
    const out = {};
    for (const [mode, cod] of [['prepaid', false], ['cod', true]]) {
      try { const q = rates(db, { pickup: from, drop: pin, weight: 0.5, cod, amount: 1000 }); out[mode] = { serviceable: true, couriers: q.data.length, fastest_days: Math.min(...q.data.map((x) => x.etd_days)), zone: q.zone }; }
      catch (err) { out[mode] = { serviceable: false, reason: err.message }; }
    }
    send(res, 200, { pincode: pin, ...out });
  });

  // ---- delivery time (S2D) and holidays ------------------------------------
  routes['GET /v1/settings/tat'] = seller(({ res, db }) => send(res, 200, { ...db.settings.tat, zones_list: ZONES, couriers: COURIERS.map((c) => ({ id: c.id, name: c.name })), next_pickup: nextPickupDate(db) }));
  routes['POST /v1/settings/tat'] = seller(({ res, db, body }) => {
    const t = db.settings.tat;
    if (body.s2d) {
      if (!body.s2d.every((z) => Number(z.min) >= 0 && Number(z.max) >= Number(z.min) && Number(z.max) <= 20)) return bad(res, 'Each zone needs min ≤ max, up to 20 days.');
      t.s2d = body.s2d.map((z, i) => ({ zone: i, min: Number(z.min), max: Number(z.max) }));
      return send(res, 200, t);
    }
    const list = body.list;
    if (!['blackout', 'courier_blackout'].includes(list)) return bad(res, 'Unknown list.');
    if (body.action === 'remove') { t[list].splice(Number(body.index), 1); return send(res, 200, t); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || body.date < ymd(Date.now())) return bad(res, 'Pick today or a future date.');
    if (list === 'courier_blackout' && !COURIERS.some((c) => c.id === Number(body.courier_id))) return bad(res, 'Pick a courier.');
    t[list].push({ date: body.date, note: String(body.note || '').slice(0, 60), ...(list === 'courier_blackout' && { courier_id: Number(body.courier_id) }) });
    t[list].sort((a, b) => a.date.localeCompare(b.date));
    send(res, 200, t);
  });

  // ---- SKU catalog + SKU rules ----------------------------------------------
  routes['GET /v1/skus'] = seller(({ res, db }) => send(res, 200, { data: db.skus, rules: db.settings.sku_rules, pincode_map: db.settings.sku_pincode, couriers: COURIERS.map((c) => ({ id: c.id, name: c.name })) }));
  routes['POST /v1/skus'] = seller(({ res, db, body }) => {
    const sku = String(body.sku || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,30}$/.test(sku) || !body.name) return bad(res, 'Enter a product name and a SKU (letters, numbers, dashes).');
    const nums = ['price', 'weight', 'length', 'breadth', 'height'].map((k) => Number(body[k]));
    if (nums.some((n) => !(n > 0))) return bad(res, 'Price, weight and dimensions must be positive numbers.');
    const existing = db.skus.find((s) => s.sku === sku);
    const rec = { name: String(body.name).slice(0, 80), sku, price: nums[0], weight: nums[1], length: nums[2], breadth: nums[3], height: nums[4], hsn: String(body.hsn || ''), category: String(body.category || '') };
    if (existing) Object.assign(existing, rec); else db.skus.push({ id: db.skus.length + 1, ...rec });
    send(res, 200, rec);
  });
  routes['POST /v1/skus/delete'] = seller(({ res, db, body }) => {
    db.skus = db.skus.filter((s) => s.sku !== body.sku);
    db.settings.sku_rules = db.settings.sku_rules.filter((r) => r.sku !== body.sku);
    send(res, 200, { ok: true });
  });
  routes['POST /v1/settings/sku-rules'] = seller(({ res, db, body }) => {
    if (!db.skus.some((s) => s.sku === body.sku)) return bad(res, 'Pick a SKU from your catalog.');
    const preferred = (body.preferred || []).map(Number);
    const blocked = (body.blocked || []).map(Number);
    if (preferred.some((id) => blocked.includes(id))) return bad(res, 'A courier cannot be both preferred and blocked.');
    db.settings.sku_rules = db.settings.sku_rules.filter((r) => r.sku !== body.sku);
    if (preferred.length || blocked.length) db.settings.sku_rules.push({ sku: body.sku, preferred, blocked });
    send(res, 200, db.settings.sku_rules);
  });
  routes['POST /v1/settings/sku-pincode'] = seller(({ res, db, body }) => {
    const m = db.settings.sku_pincode;
    if (body.action === 'remove') { m.splice(Number(body.index), 1); return send(res, 200, m); }
    if (!db.skus.some((s) => s.sku === body.sku) || !PIN.test(body.pincode || '')) return bad(res, 'Pick a SKU and a 6-digit pincode.');
    if (!m.some((x) => x.sku === body.sku && x.pincode === body.pincode)) m.push({ sku: body.sku, pincode: body.pincode });
    send(res, 200, m);
  });

  // ---- weight freeze --------------------------------------------------------
  routes['GET /v1/weight-freeze'] = seller(({ res, db }) => {
    const fr = db.freeze || (db.freeze = {});
    send(res, 200, { smart_weight: db.settings.smart_weight, data: db.skus.map((s) => ({ ...s, freeze: fr[s.sku] || null,
      disputes: db.disputes.filter((d) => d.sku === s.sku).length })) });
  });
  routes['POST /v1/weight-freeze/request'] = seller(({ res, db, body }) => {
    const s = db.skus.find((x) => x.sku === body.sku);
    if (!s) return bad(res, 'Pick a SKU.');
    const w = ['weight', 'length', 'breadth', 'height'].map((k) => Number(body[k]));
    if (w.some((n) => !(n > 0))) return bad(res, 'Enter the packed weight and box dimensions.');
    if (!(Number(body.photos) >= 2)) return bad(res, 'Upload at least 2 photos (product on scale, and box with tape measure).');
    const vol = (w[1] * w[2] * w[3]) / 5000;
    db.freeze = db.freeze || {};
    db.freeze[body.sku] = { weight: w[0], length: w[1], breadth: w[2], height: w[3], chargeable: +Math.max(w[0], vol).toFixed(2), status: 'FROZEN', at: iso(Date.now()) };
    let closed = 0;
    db.disputes.forEach((d) => { if (d.sku === body.sku && d.status === 'ACTION_REQUIRED' && d.charged_weight > db.freeze[body.sku].chargeable) { d.status = 'RESOLVED_FROZEN'; closed++; } });
    send(res, 200, { ...db.freeze[body.sku], disputes_closed: closed });
  });
  routes['POST /v1/weight-freeze/unfreeze'] = seller(({ res, db, body }) => { if (db.freeze) delete db.freeze[body.sku]; send(res, 200, { ok: true }); });
  routes['POST /v1/settings/smart-weight'] = seller(({ res, db, body }) => { db.settings.smart_weight = !!body.enabled; send(res, 200, { smart_weight: db.settings.smart_weight }); });

  // ---- RTO control tower ----------------------------------------------------
  routes['GET /v1/rto/overview'] = seller(({ res, db, url }) => {
    const level = url.searchParams.get('level');
    const open = db.orders.filter((o) => ['NEW', 'ON_HOLD'].includes(o.status) && !o.is_international).map((o) => decorate(db, o, duplicateIds(db)));
    const closed = db.orders.filter((o) => ['DELIVERED', 'RTO'].includes(o.status) && !o.is_international);
    const byPin = {};
    closed.forEach((o) => { const k = o.customer.pincode; byPin[k] = byPin[k] || { pincode: k, city: o.customer.city, orders: 0, rto: 0 }; byPin[k].orders++; if (o.status === 'RTO') byPin[k].rto++; });
    const aq = { Good: 0, Average: 0, Poor: 0 };
    open.forEach((o) => { aq[o.address_quality.label]++; });
    send(res, 200, {
      rto_rate: closed.length ? Math.round((closed.filter((o) => o.status === 'RTO').length / closed.length) * 100) : 0,
      levels: ['High', 'Medium', 'Low'].map((l) => ({ level: l, count: open.filter((o) => o.risk.level === l).length })),
      address_quality: aq,
      risky_pincodes: Object.values(byPin).filter((p) => p.rto).sort((a, b) => b.rto / b.orders - a.rto / a.orders).slice(0, 8),
      ...paginate(open.filter((o) => !level || o.risk.level === level).sort((a, b) => b.risk.score - a.risk.score), url),
    });
  });

  // ---- Delivery Boost (automated NDR rescue) --------------------------------
  routes['GET /v1/boost'] = seller(({ res, db }) => {
    const handled = db.orders.filter((o) => o.ndr && o.ndr.action_by === 'Delivery Boost');
    send(res, 200, { settings: db.settings.delivery_boost, pending: db.orders.filter((o) => o.ndr && !o.ndr.action).length,
      stats: { contacted: handled.length, rescued: handled.filter((o) => o.ndr.action === 'reattempt').length, rto: handled.filter((o) => o.ndr.action === 'rto').length },
      log: handled.map((o) => ({ order_id: o.id, channel_order_id: o.channel_order_id, customer: o.customer.name, outcome: o.ndr.action, note: o.ndr.comment, at: o.ndr.action_at })) });
  });
  routes['POST /v1/boost/settings'] = seller(({ res, db, body }) => {
    const b = db.settings.delivery_boost;
    if (body.channels && !body.channels.ivr && !body.channels.whatsapp) return bad(res, 'Keep at least one channel on.');
    if ('enabled' in body) b.enabled = !!body.enabled;
    if (body.channels) b.channels = { ivr: !!body.channels.ivr, whatsapp: !!body.channels.whatsapp };
    send(res, 200, b);
  });
  routes['POST /v1/boost/run'] = seller(({ res, db }) => {
    const b = db.settings.delivery_boost;
    if (!b.enabled) return bad(res, 'Turn on Delivery Boost first.');
    const pending = db.orders.filter((o) => o.ndr && !o.ndr.action);
    if (!pending.length) return bad(res, 'No failed deliveries are waiting.');
    const cost = pending.length * b.price_per_ndr;
    if (db.balance < cost) return send(res, 402, { message: `Wallet balance too low (need ₹${cost}).` });
    debit(db, cost, `Delivery Boost · ${pending.length} NDRs`);
    const results = pending.map((o, i) => {
      const reattempt = (o.id + i) % 10 < 7; // ~70% of buyers confirm a new slot
      const via = b.channels.whatsapp && (i % 2 || !b.channels.ivr) ? 'WhatsApp' : 'IVR call';
      Object.assign(o.ndr, { action: reattempt ? 'reattempt' : 'rto', action_at: iso(Date.now()), action_by: 'Delivery Boost',
        comment: reattempt ? `Buyer confirmed re-delivery via ${via}` : `No response on ${via}; returned to origin` });
      if (!reattempt) move(o, 'RTO');
      return { order_id: o.id, outcome: o.ndr.action };
    });
    send(res, 200, { processed: results.length, rescued: results.filter((r) => r.outcome === 'reattempt').length, charged: cost });
  });

  // ---- delay radar ----------------------------------------------------------
  routes['GET /v1/radar'] = seller(({ res, db }) => {
    const now = Date.now();
    const active = db.orders.filter((o) => ['IN_TRANSIT', 'PICKUP_SCHEDULED', 'READY_TO_SHIP'].includes(o.status) && o.edd);
    const delayed = active.filter((o) => o.delay || Date.parse(o.edd) < now).map((o) => ({
      id: o.id, awb: o.awb, channel_order_id: o.channel_order_id, courier: o.courier, status: o.status, city: o.customer.city, edd: o.edd,
      days_late: Math.max(0, Math.ceil((now - Date.parse(o.edd)) / day)), reason: o.delay || 'Awaiting courier update',
    })).sort((a, b) => b.days_late - a.days_late);
    const group = (k) => Object.entries(delayed.reduce((m, d) => ((m[d[k]] = (m[d[k]] || 0) + 1), m), {})).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    send(res, 200, { active: active.length, delayed: delayed.length, on_time_rate: active.length ? Math.round((1 - delayed.length / active.length) * 100) : 100,
      by_reason: group('reason'), by_courier: group('courier'), data: delayed });
  });
  routes['POST /v1/radar/escalate'] = seller(({ res, db, body }) => {
    const o = findOrder(db, body.id);
    if (!o) return send(res, 404, { message: 'Order not found' });
    if (o.escalation_ticket) return send(res, 200, { ticket: o.escalation_ticket });
    const t = createTicket(db, { category: 'Shipment delay', subject: `Delayed shipment ${o.awb}`, ref: o.awb,
      message: `Shipment ${o.awb} (${o.courier}) was expected by ${ymd(Date.parse(o.edd))}. Reason shown: ${o.delay || 'none'}. Please expedite.` });
    o.escalation_ticket = t.id;
    send(res, 200, { ticket: t.id });
  });

  // ---- delivery promise (EDD on the storefront) -----------------------------
  routes['GET /v1/promise/settings'] = seller(({ res, db }) => send(res, 200, db.settings.promise));
  routes['POST /v1/promise/settings'] = seller(({ res, db, body }) => {
    const p = db.settings.promise;
    if (body.buffer_days != null && !(Number(body.buffer_days) >= 0 && Number(body.buffer_days) <= 5)) return bad(res, 'Buffer must be 0–5 days.');
    if (body.cutoff_hour != null && !(Number(body.cutoff_hour) >= 8 && Number(body.cutoff_hour) <= 20)) return bad(res, 'Cut-off must be between 8 and 20 (24h).');
    if ('enabled' in body) p.enabled = !!body.enabled;
    if (body.buffer_days != null) p.buffer_days = Number(body.buffer_days);
    if (body.cutoff_hour != null) p.cutoff_hour = Number(body.cutoff_hour);
    if (body.show_on) p.show_on = { product: !!body.show_on.product, cart: !!body.show_on.cart, checkout: !!body.show_on.checkout };
    send(res, 200, p);
  });
  routes['GET /v1/promise/edd'] = seller(({ res, db, url }) => {
    const pin = url.searchParams.get('pincode') || '';
    if (!PIN.test(pin)) return bad(res, 'Enter a valid 6-digit pincode.');
    const sku = url.searchParams.get('sku') || '';
    const cat = db.skus.find((s) => s.sku === sku);
    let q;
    try { q = rates(db, { pickup: db.pickup[0].pincode, drop: pin, weight: cat ? cat.weight : 0.5, cod: false, amount: cat ? cat.price : 1000, sku }); }
    catch (err) { return send(res, 200, { pincode: pin, deliverable: false, message: err.message }); }
    const zoneIdx = ZONES.indexOf(q.zone);
    const s2d = db.settings.tat.s2d[zoneIdx] || { min: 2, max: 5 };
    const p = db.settings.promise;
    const ship = Date.parse(q.pickup_date);
    const fastest = Math.min(...q.data.map((c) => c.etd_days));
    const addWorking = (t, n) => { let x = t; let left = n; while (left > 0) { x += day; if (new Date(x).getUTCDay() !== 0) left--; } return x; };
    const from = addWorking(ship, Math.max(s2d.min, fastest) + p.buffer_days);
    const to = addWorking(ship, Math.max(s2d.max, fastest + 1) + p.buffer_days + q.padding_days);
    send(res, 200, { pincode: pin, deliverable: true, zone: q.zone, ships_on: q.pickup_date, from: ymd(from), to: ymd(to), cutoff_hour: p.cutoff_hour });
  });

  // ---- order-level helpers used by the RTO / risk screens ------------------
  routes['GET /v1/orders/risk'] = seller(({ res, db, url }) => {
    const o = findOrder(db, url.searchParams.get('id'));
    if (!o) return send(res, 404, { message: 'Order not found' });
    send(res, 200, { risk: riskOf(db, o), address_quality: addressQuality(o.customer) });
  });
};
