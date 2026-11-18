// Sales channels: connect your marketplaces (Amazon, Flipkart, Meesho, Myntra…), store builders
// (Shopify, WooCommerce…) and your own website. Orders from every channel land in one inbox,
// ready to ship with the best courier or city vehicle. Connections are simulated: orders are
// mimicked from a sample catalogue, except those your own site posts to
// POST /v1/public/website/orders with its store key, which are real input.
'use strict';
const crypto = require('crypto');

// group, needs (fields asked when connecting), id label/hint, demo order number format, logo domain, brand colour.
const PLATFORMS = [
  { key: 'amazon', name: 'Amazon', group: 'Marketplace', domain: 'amazon.in', color: '#ff9900', needs: ['seller_id', 'token'], id_label: 'Seller ID (Merchant token)', id_hint: 'e.g. A2X4K9EXAMPLE', hint: 'Seller Central → Apps and Services → Develop apps → SP-API refresh token', num: () => `403-${rnd(7)}-${rnd(7)}`, note: 'Self Ship and Easy Ship orders' },
  { key: 'flipkart', name: 'Flipkart', group: 'Marketplace', domain: 'flipkart.com', color: '#2874f0', needs: ['seller_id', 'token'], id_label: 'Seller ID', id_hint: 'e.g. a1b2c3d4e5f6g7h8', hint: 'Seller Hub → Manage Profile → Developer access → Application secret', num: () => `OD${rnd(18)}`, note: 'Self-ship and Smart Fulfilment orders' },
  { key: 'meesho', name: 'Meesho', group: 'Marketplace', domain: 'meesho.com', color: '#9f2089', needs: ['seller_id', 'token'], id_label: 'Supplier ID', id_hint: 'e.g. 123456', hint: 'Supplier Panel → Settings → API access', num: () => `${rnd(12)}_1`, note: 'Supplier orders' },
  { key: 'myntra', name: 'Myntra', group: 'Marketplace', domain: 'myntra.com', color: '#ff3f6c', needs: ['seller_id', 'token'], id_label: 'Partner ID', id_hint: 'e.g. 4321', hint: 'Myntra Partner Portal → Integrations → API key', num: () => `${rnd(7)}-${rnd(7)}-${rnd(5)}01`, note: 'Seller-fulfilled orders' },
  { key: 'ajio', name: 'AJIO', group: 'Marketplace', domain: 'ajio.com', color: '#2c4152', needs: ['seller_id', 'token'], id_label: 'Vendor code', id_hint: 'e.g. V12345', hint: 'AJIO Seller Central → Integrations', num: () => `FN${rnd(10)}`, note: 'Drop-ship orders' },
  { key: 'jiomart', name: 'JioMart', group: 'Marketplace', domain: 'jiomart.com', color: '#0078ad', needs: ['seller_id', 'token'], id_label: 'Seller ID', id_hint: 'e.g. JM100234', hint: 'JioMart Seller Portal → API credentials', num: () => `JM${rnd(12)}`, note: 'Seller-fulfilled orders' },
  { key: 'etsy', name: 'Etsy', group: 'Marketplace', domain: 'etsy.com', color: '#f1641e', needs: ['seller_id', 'token'], id_label: 'Shop name', id_hint: 'e.g. HandloomByAsha', hint: 'Etsy → Shop Manager → Settings → Apps → API key', num: () => rnd(10), note: 'International handmade orders' },
  { key: 'ebay', name: 'eBay', group: 'Marketplace', domain: 'ebay.com', color: '#e53238', needs: ['seller_id', 'token'], id_label: 'eBay user ID', id_hint: 'e.g. asha_crafts', hint: 'eBay Developers → User tokens', num: () => `${rnd(2)}-${rnd(5)}-${rnd(5)}`, note: 'Global orders' },
  { key: 'shopify', name: 'Shopify', group: 'Store builder', domain: 'shopify.com', color: '#5e8e3e', needs: ['store_url', 'token'], hint: 'Admin → Settings → Apps → Develop apps → Admin API access token', num: (w) => `#${++w.seq}` },
  { key: 'woocommerce', name: 'WooCommerce', group: 'Store builder', domain: 'woocommerce.com', color: '#7f54b3', needs: ['store_url', 'token'], hint: 'WooCommerce → Settings → Advanced → REST API → consumer key', num: (w) => `#${++w.seq}` },
  { key: 'wix', name: 'Wix', group: 'Store builder', domain: 'wix.com', color: '#0c6efc', needs: ['store_url', 'token'], hint: 'Wix dashboard → Settings → API keys', num: (w) => `#${++w.seq}` },
  { key: 'magento', name: 'Magento', group: 'Store builder', domain: 'magento.com', color: '#ee672f', needs: ['store_url', 'token'], hint: 'Admin → System → Integrations → Access token', num: (w) => `${1e8 + ++w.seq}` },
  { key: 'custom', name: 'My own website', group: 'Your website', domain: '', color: '#0e7c66', needs: ['store_url'], hint: 'Your site sends each order to UT Log with a store key', num: (w) => `#${++w.seq}` },
];
const rnd = (n) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');
const publicPlatform = ({ num, ...p }) => p;
// Sample catalogue for mimicked orders: name, SKU, price ₹, weight kg.
const CATALOG = [
  ['Cotton kurta', 'KUR-01', 899, 0.4], ['Ceramic mug set (4)', 'MUG-04', 749, 1.6], ['Running shoes', 'SHO-22', 2499, 0.9],
  ['Wireless earbuds', 'EAR-10', 1799, 0.3], ['Organic honey 1 kg', 'HON-1K', 549, 1.2], ['Table lamp', 'LMP-03', 1299, 1.8],
  ['Yoga mat', 'YOG-06', 999, 1.1], ['Cast-iron skillet', 'SKL-10', 1599, 2.6], ['Story books (set of 5)', 'BKS-05', 650, 1.4],
  ['Bedsheet, king size', 'BED-K1', 1149, 1.3], ['Steel water bottle', 'BOT-75', 449, 0.5], ['Handloom saree', 'SAR-09', 3299, 0.7],
];
const NAMES = ['Priya Sharma', 'Rahul Verma', 'Ananya Iyer', 'Karthik Reddy', 'Meera Nair', 'Arjun Mehta', 'Sneha Kulkarni', 'Vikram Singh', 'Fatima Shaikh', 'Rohan Das', 'Divya Menon', 'Aditya Joshi'];
const STREETS = ['12, 4th Cross', 'Flat 302, Lake View Apts', '7/A, Temple Street', 'House 45, 2nd Main', 'B-1104, Green Heights', '18, Station Road', 'Plot 9, Sector 2'];
// Towns outside the served metro areas: couriers reach them by pin code.
const TOWNS = [['Jaipur', '302017'], ['Kochi', '682024'], ['Lucknow', '226010'], ['Indore', '452001'], ['Mysuru', '570017'], ['Coimbatore', '641018']];
const MINUTES_PER_ORDER = 12; // per channel, while you're away: about one new order every 12 minutes (up to 6 at a time)

module.exports = function register(routes, { send }, ctx, engine, hubCtx) {
  const { iso, bookByKey } = ctx;
  const { hub, hubOf, live, oops, text, takePayment, addRecord } = hubCtx;
  const keyIndex = require('./store').track('websiteKeys', new Map()); // sha256(store key) -> "owner|channelId"
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const pick = (a) => a[crypto.randomInt(0, a.length)];
  const phone = () => String(crypto.randomInt(6, 10)) + String(crypto.randomInt(1e8, 1e9));
  const cities = engine.cities;
  const pickupList = () => Object.entries(cities).flatMap(([key, c]) => c.localities.map(([area]) => ({ key: `${area}, ${c.name}`, area, city: c.name, cityKey: key })));
  const P = (key) => PLATFORMS.find((p) => p.key === key) || PLATFORMS[PLATFORMS.length - 1];

  // One record per account; channels live in w.stores. Older single-store data is moved in place.
  function siteOf(h) {
    if (!h.website) h.website = { stores: [], auto_ship: false, ship_by: 'cheapest', pickup: 'Koramangala, Bengaluru', seq: 1041, orders: [] };
    const w = h.website;
    if (!w.stores) {
      w.stores = [];
      if (w.connected && w.platform) {
        const s = { id: 'CH' + crypto.randomBytes(3).toString('hex').toUpperCase(), platform: w.platform, name: w.name || P(w.platform).name, account: w.store_url || '', key: w.key || null, key_prefix: w.key_prefix || '', connected_at: w.connected_at || iso(Date.now()), last_pull: w.last_pull || w.connected_at || iso(Date.now()) };
        w.stores.push(s);
        w.orders.forEach((o) => { if (!o.store_id) { o.store_id = s.id; o.platform_key = s.platform; } });
      }
      ['connected', 'platform', 'store_url', 'name', 'key', 'key_prefix', 'connected_at', 'last_pull'].forEach((k) => delete w[k]);
    }
    return w;
  }
  const storeOf = (w, id) => w.stores.find((s) => s.id === id);

  // ---- mimicked orders ----------------------------------------------------------------
  function fakeOrder(w, store, at) {
    const pickup = engine.resolvePlace(w.pickup) || { cityKey: 'bengaluru' };
    const roll = crypto.randomInt(0, 10);
    let place; let address;
    if (roll < 5 && pickup.cityKey) { // same city: a bike or auto can take it today
      const l = cities[pickup.cityKey].localities.filter(([a]) => a !== pickup.area);
      const area = pick(l)[0];
      place = area; address = `${pick(STREETS)}, ${area}, ${cities[pickup.cityKey].name}`;
    } else if (roll < 8) { // another metro
      const others = Object.entries(cities).filter(([k]) => k !== pickup.cityKey);
      const [, c] = pick(others); const area = pick(c.localities)[0];
      place = area; address = `${pick(STREETS)}, ${area}, ${c.name}`;
    } else {
      const [town, pin] = pick(TOWNS);
      place = pin; address = `${pick(STREETS)}, ${town}`;
    }
    const r = engine.resolvePlace(place);
    const lines = crypto.randomInt(1, 4);
    const items = [];
    for (let i = 0; i < lines; i++) {
      const [name, sku, price, kg] = pick(CATALOG);
      const have = items.find((x) => x.sku === sku);
      if (have) have.qty++; else items.push({ name, sku, price, kg, qty: crypto.randomInt(1, 3) });
    }
    // Marketplaces collect payment themselves far more often; COD is still common on Meesho and Flipkart.
    const codShare = { amazon: 3, flipkart: 5, meesho: 7, myntra: 4, ajio: 4, jiomart: 5, etsy: 0, ebay: 0 }[store.platform] ?? 4;
    return makeOrder(w, store, { at, customer: { name: pick(NAMES), phone: phone(), email: '' }, address: `${address} ${r ? r.pin : ''}`.trim(), place, items, payment: crypto.randomInt(0, 10) < codShare ? 'cod' : 'prepaid', simulated: true });
  }
  function makeOrder(w, store, o) {
    const value = o.items.reduce((s, x) => s + x.price * x.qty, 0);
    const weight = Math.max(0.5, +(o.items.reduce((s, x) => s + (x.kg || 0.5) * x.qty, 0) + 0.2).toFixed(1)); // + packing
    const p = P(store.platform);
    const order = { id: 'WO' + crypto.randomBytes(4).toString('hex').toUpperCase(), number: o.number || p.num(w), store_id: store.id, platform_key: p.key, platform: p.name, at: o.at || iso(Date.now()),
      customer: o.customer, address: o.address, place: o.place, items: o.items, value, weight, payment: o.payment, status: 'pending', simulated: !!o.simulated };
    w.orders.unshift(order);
    if (w.orders.length > 400) w.orders.length = 400;
    return order;
  }
  // New orders that "arrived" on each channel since the last look, so the inbox feels live.
  function pull(db, h) {
    const w = siteOf(h);
    const now = Date.now(); const made = [];
    w.stores.forEach((s) => {
      const since = Date.parse(s.last_pull || s.connected_at) || now;
      const n = Math.min(6, Math.floor((now - since) / (MINUTES_PER_ORDER * 60000)));
      if (n < 1) return;
      for (let i = n; i >= 1; i--) made.push(fakeOrder(w, s, iso(now - Math.round(((now - since) * (i - 0.5)) / n))));
      s.last_pull = iso(now);
    });
    if (made.length && w.auto_ship) ship(db, h, made.map((o) => o.id), w.ship_by, true);
    return made;
  }

  // ---- shipping --------------------------------------------------------------------------
  const VEHICLE_OK = (o) => o.mode === 'local' && ['bike', 'auto', 'mini'].includes(o.vehicle) && !['Contractor', 'Third-party logistics'].includes(o.provider_type);
  function optionsFor(w, order) {
    let route;
    try { route = engine.resolveRoute({ from_place: w.pickup, to_place: order.place }); } catch (e) { throw oops(400, `${order.number}: ${e.message}`); }
    const section = route.service === 'local' ? 'vehicle' : 'courier';
    const pieces = Math.min(20, order.items.reduce((s, x) => s + x.qty, 0));
    const input = engine.parseInput({ ...route, weight: order.weight, pieces, segment: 'b2c', category: 'E-commerce', priority: 'best' });
    if (input.service === 'national') { const a = engine.pinPoint(input.fromPin); const z = engine.pinPoint(input.toPin); if (a) input.fromPt = [a.lat, a.lng]; if (z) input.toPt = [z.lat, z.lng]; }
    const fits = engine.buildOptions(input).options.filter((o) => (section === 'vehicle' ? VEHICLE_OK(o) : o.kind === 'courier'))
      .filter((o) => order.payment !== 'cod' || o.provider !== 'India Post');
    if (!fits.length) throw oops(400, `${order.number}: no partner can take this order right now.`);
    return { section, input, options: fits };
  }
  const codFee = (order, o) => (order.payment === 'cod' ? Math.max(25, Math.round(o.total * 0.015)) : 0);
  const etaOf = (o) => (typeof o.eta === 'number' ? o.eta : Date.parse(o.eta)); // the engine hands ETAs back as ISO strings
  const choose = (list, by) => [...list].sort(by === 'fastest' ? (a, b) => etaOf(a) - etaOf(b) || a.total - b.total : (a, b) => a.total - b.total || etaOf(a) - etaOf(b))[0];

  const held = new Map(); // channel order id -> the quote shown to the user, so its option ids stay valid
  function shipOne(db, h, w, order, by, optionId) {
    const kept = optionId && held.get(order.id);
    const q = kept && kept.expires > Date.now() ? kept.q : optionsFor(w, order);
    held.delete(order.id);
    const option = optionId ? q.options.find((o) => o.id === optionId) : choose(q.options, by);
    if (!option) throw oops(400, 'That option is no longer available. Pick another.');
    const fee = codFee(order, option);
    const amount = option.total + fee;
    const st = storeOf(w, order.store_id);
    const pickupAddr = `${(st && st.name) || h.profile.company || 'My store'} warehouse, ${w.pickup}`;
    const contact = { name: text(h.profile.company || h.profile.name || (st && st.name) || 'Store', 60), phone: /^[6-9]\d{9}$/.test(h.profile.mobile || '') ? h.profile.mobile : '9876543210' };
    takePayment(db, h, amount, `${order.platform} ${order.number} · ${option.provider}`);
    const { id } = engine.createBooking({ input: q.input, section: q.section }, option, { contact, pickup_address: pickupAddr, drop_address: order.address });
    const rec = addRecord(h, { id, booking_id: id, section: q.section, title: option.title, provider: option.provider, provider_type: option.provider_type,
      sub: `${w.pickup.split(',')[0]} → ${order.address.split(',').slice(-1)[0].trim()}`, amount, gross: amount, fee, pay_mode: 'prepaid', pay_via: 'wallet', status: 'BOOKED', label: 'Booking confirmed',
      weight: order.weight, reference: `${order.platform} ${order.number}`, source: 'website', channel: order.platform_key, website_order: order.id, cod_collect: order.payment === 'cod' ? order.value : 0,
      pickup_address: pickupAddr, drop_address: order.address, contact_name: contact.name, contact_phone: contact.phone, receiver: { name: order.customer.name, phone: order.customer.phone, consent: true } });
    Object.assign(order, { status: 'shipped', shipped_at: iso(Date.now()), record_id: rec.id, ship: { section: q.section, provider: option.provider, title: option.title, amount, eta: iso(etaOf(option)) } });
    return rec;
  }
  function ship(db, h, ids, by, quiet) {
    const w = siteOf(h);
    const done = []; const failed = []; let first = null;
    for (const id of ids) {
      const order = w.orders.find((o) => o.id === id && o.status === 'pending');
      if (!order) continue;
      try { done.push(shipOne(db, h, w, order, by)); } catch (e) {
        first = first || e;
        failed.push({ id, number: order.number, message: e.message });
        if (e.status === 402 || e.status === 403) break; // out of money or over a limit: stop here
      }
    }
    if (!quiet && !done.length && first) throw first.status ? first : oops(400, first.message);
    return { shipped: done.length, amount: done.reduce((s, r) => s + r.amount, 0), failed };
  }

  // ---- views -----------------------------------------------------------------------------
  function view(h) {
    const w = siteOf(h);
    const orders = w.orders.map((o) => {
      const base = o.platform_key ? o : { ...o, platform_key: (PLATFORMS.find((p) => p.name === o.platform) || {}).key || 'custom' };
      if (o.status !== 'shipped') return base;
      const r = h.records.find((x) => x.id === o.record_id);
      const l = r ? live(r) : null;
      return { ...base, tracking: l ? { label: l.status === 'CANCELLED' ? 'Cancelled' : l.label, group: l.group } : null };
    });
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    const stats = (list) => ({ pending: list.filter((o) => o.status === 'pending').length, shipped: list.filter((o) => o.status === 'shipped').length, cancelled: list.filter((o) => o.status === 'cancelled').length,
      today: list.filter((o) => Date.parse(o.at) >= day0.getTime()).length, cod_value: list.filter((o) => o.status === 'pending' && o.payment === 'cod').reduce((s, o) => s + o.value, 0),
      sales: list.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.value, 0) });
    return {
      connected: w.stores.length > 0,
      stores: w.stores.map((s) => { const p = P(s.platform); return { id: s.id, platform: s.platform, platform_name: p.name, group: p.group, domain: p.domain, color: p.color, name: s.name, account: s.account, key_prefix: s.key_prefix, connected_at: s.connected_at, last_pull: s.last_pull, ...stats(orders.filter((o) => o.store_id === s.id)) }; }),
      auto_ship: w.auto_ship, ship_by: w.ship_by, pickup: w.pickup, minutes_per_order: MINUTES_PER_ORDER,
      counts: stats(orders), orders, platforms: PLATFORMS.map(publicPlatform), pickups: pickupList().map((p) => p.key),
    };
  }

  routes['GET /v1/hub/website'] = hub(({ res, db, h }) => { const fresh = pull(db, h); send(res, 200, { ...view(h), arrived: fresh.length }); });

  routes['POST /v1/hub/website/connect'] = hub(({ res, h, user, body, ownerKey }) => {
    if (user.role && user.role !== 'owner') throw oops(403, 'Only the account owner can connect a sales channel.');
    const b = body || {};
    const p = PLATFORMS.find((x) => x.key === b.platform);
    if (!p) throw oops(400, 'Pick the channel to connect.');
    const url = text(b.store_url, 120).replace(/\/+$/, '');
    if (p.needs.includes('store_url') && !/^https?:\/\/[^\s/.]+\.[^\s]+$/.test(url)) throw oops(400, 'Enter your store address, e.g. https://mystore.com');
    const seller = text(b.seller_id, 60);
    if (p.needs.includes('seller_id') && seller.length < 3) throw oops(400, `Enter your ${p.id_label}.`);
    if (p.needs.includes('token') && text(b.token, 300).length < 8) throw oops(400, `Paste the access key from ${p.name}. ${p.hint}.`);
    const w = siteOf(h);
    const account = p.needs.includes('seller_id') ? seller : url;
    if (w.stores.some((s) => s.platform === p.key && s.account.toLowerCase() === account.toLowerCase())) throw oops(409, `This ${p.name} account is already connected.`);
    if (w.stores.length >= 20) throw oops(400, 'You can connect up to 20 channels.');
    const s = { id: 'CH' + crypto.randomBytes(3).toString('hex').toUpperCase(), platform: p.key, name: text(b.name, 60) || (p.needs.includes('seller_id') ? `${p.name} · ${seller}` : url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]), account, key: null, key_prefix: '', connected_at: iso(Date.now()), last_pull: iso(Date.now()) };
    let key = null;
    if (p.key === 'custom') { key = 'wsk_' + crypto.randomBytes(16).toString('hex'); s.key = sha(key); s.key_prefix = key.slice(0, 12) + '…'; keyIndex.set(s.key, `${ownerKey}|${s.id}`); }
    w.stores.push(s);
    // A first batch from the last few hours, so there is something to ship straight away.
    for (let i = 4; i >= 1; i--) fakeOrder(w, s, iso(Date.now() - i * 41 * 60000));
    send(res, 200, { ...view(h), store_key: key, store_id: s.id });
  });
  routes['POST /v1/hub/website/disconnect'] = hub(({ res, h, user, body }) => {
    if (user.role && user.role !== 'owner') throw oops(403, 'Only the account owner can disconnect a channel.');
    const w = siteOf(h);
    const s = storeOf(w, body.store_id);
    if (!s) throw oops(404, 'We could not find that channel.');
    if (s.key) keyIndex.delete(s.key);
    w.stores = w.stores.filter((x) => x !== s);
    if (!w.stores.length) w.auto_ship = false;
    send(res, 200, view(h));
  });
  routes['POST /v1/hub/website/key'] = hub(({ res, h, ownerKey, body }) => {
    const w = siteOf(h);
    const s = body.store_id ? storeOf(w, body.store_id) : w.stores.find((x) => x.platform === 'custom');
    if (!s || s.platform !== 'custom') throw oops(400, 'Store keys are for your own website. Connect it first.');
    const key = 'wsk_' + crypto.randomBytes(16).toString('hex');
    if (s.key) keyIndex.delete(s.key);
    s.key = sha(key); s.key_prefix = key.slice(0, 12) + '…';
    keyIndex.set(s.key, `${ownerKey}|${s.id}`);
    send(res, 200, { store_key: key, key_prefix: s.key_prefix, store_id: s.id });
  });
  routes['POST /v1/hub/website/settings'] = hub(({ res, body, h }) => {
    const w = siteOf(h);
    if (body.pickup != null) { if (!pickupList().some((p) => p.key === body.pickup)) throw oops(400, 'Pick a pickup area from the list.'); w.pickup = body.pickup; }
    if (body.ship_by != null) w.ship_by = body.ship_by === 'fastest' ? 'fastest' : 'cheapest';
    if (body.auto_ship != null) w.auto_ship = !!body.auto_ship;
    send(res, 200, view(h));
  });
  routes['POST /v1/hub/website/simulate'] = hub(({ res, body, db, h }) => {
    const w = siteOf(h);
    if (!w.stores.length) throw oops(400, 'Connect a channel first.');
    const n = Math.max(1, Math.min(10, Math.floor(Number(body.count) || 1)));
    const only = body.store_id ? storeOf(w, body.store_id) : null;
    const made = [];
    for (let i = 0; i < n; i++) made.push(fakeOrder(w, only || pick(w.stores), iso(Date.now() - (n - 1 - i) * 1000)));
    const auto = w.auto_ship ? ship(db, h, made.map((o) => o.id), w.ship_by, true) : null;
    send(res, 200, { ...view(h), arrived: n, auto });
  });
  routes['POST /v1/hub/website/quote'] = hub(({ res, body, h }) => {
    const w = siteOf(h);
    const order = w.orders.find((o) => o.id === body.id);
    if (!order) throw oops(404, 'We could not find that order.');
    const q = optionsFor(w, order);
    held.set(order.id, { q, expires: Date.now() + 20 * 60000 });
    for (const [k, v] of held) if (v.expires < Date.now()) held.delete(k);
    const list = [...q.options].sort((a, b) => a.total - b.total).slice(0, 5);
    const fast = Math.min(...list.map(etaOf));
    send(res, 200, { section: q.section, order, options: list.map((o, i) => ({ id: o.id, provider: o.provider, title: o.title, rating: o.rating, eta: iso(etaOf(o)), total: o.total, cod_fee: codFee(order, o), amount: o.total + codFee(order, o), tags: [...(i === 0 ? ['Cheapest'] : []), ...(etaOf(o) === fast ? ['Fastest'] : [])] })) });
  });
  routes['POST /v1/hub/website/ship'] = hub(({ res, body, db, h }) => {
    const w = siteOf(h);
    if (body.option_id) {
      const order = w.orders.find((o) => o.id === body.id && o.status === 'pending');
      if (!order) throw oops(400, 'This order is already shipped or cancelled.');
      const rec = shipOne(db, h, w, order, w.ship_by, body.option_id);
      return send(res, 200, { shipped: 1, amount: rec.amount, failed: [], wallet_balance: db.balance });
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 50) : [];
    if (!ids.length) throw oops(400, 'Pick at least one order to ship.');
    send(res, 200, { ...ship(db, h, ids, body.by === 'fastest' ? 'fastest' : body.by === 'cheapest' ? 'cheapest' : w.ship_by), wallet_balance: db.balance });
  });
  routes['POST /v1/hub/website/cancel'] = hub(({ res, body, h }) => {
    const order = siteOf(h).orders.find((o) => o.id === body.id);
    if (!order || order.status !== 'pending') throw oops(400, 'Only orders not yet shipped can be cancelled here. Cancel a shipped one from All Orders.');
    Object.assign(order, { status: 'cancelled', cancelled_at: iso(Date.now()), cancel_reason: text(body.reason, 120) || 'Cancelled by store' });
    send(res, 200, view(h));
  });

  // ---- your own website posts orders here --------------------------------------------------
  routes['POST /v1/public/website/orders'] = async (req, res, body) => {
    const key = String(req.headers['x-store-key'] || '').trim();
    const hit = key && keyIndex.get(sha(key));
    if (!hit) return send(res, 401, { message: 'Send your store key in the X-Store-Key header.' });
    const [owner, storeId] = String(hit).split('|');
    const db = bookByKey(owner);
    const h = hubOf(db, { name: '', email: '', mobile: '' });
    const w = siteOf(h);
    const s = storeId ? storeOf(w, storeId) : w.stores.find((x) => x.platform === 'custom') || w.stores[0];
    if (!s) return send(res, 409, { message: 'This store is disconnected in UT Log.' });
    const c = body.customer || {};
    if (!text(c.name)) return send(res, 400, { message: 'customer.name is required.' });
    if (!/^[6-9]\d{9}$/.test(String(c.phone || ''))) return send(res, 400, { message: 'customer.phone must be a 10-digit mobile number.' });
    const pin = String(body.pincode || (body.shipping_address && body.shipping_address.pincode) || '');
    const place = /^\d{6}$/.test(pin) ? pin : text(body.area, 60);
    if (!engine.resolvePlace(place)) return send(res, 400, { message: 'Send a 6-digit pincode for the delivery address.' });
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 30).map((x) => ({ name: text(x.name, 80) || 'Item', sku: text(x.sku, 30), price: Math.max(0, Number(x.price) || 0), kg: Math.max(0.05, Number(x.weight_kg) || 0.5), qty: Math.max(1, Math.min(99, Math.floor(Number(x.qty) || 1))) }));
    if (!items.length) return send(res, 400, { message: 'Send at least one item.' });
    const number = text(body.order_number, 30);
    if (number && w.orders.some((o) => o.store_id === s.id && o.number === number)) return send(res, 409, { message: `Order ${number} was already received.` });
    const order = makeOrder(w, s, { number: number || undefined, customer: { name: text(c.name, 60), phone: String(c.phone), email: text(c.email, 80) }, address: text(body.address, 200) || place, place, items, payment: body.payment === 'cod' ? 'cod' : 'prepaid' });
    let auto = null;
    if (w.auto_ship) auto = ship(db, h, [order.id], w.ship_by, true);
    send(res, 201, { id: order.id, order_number: order.number, status: order.status, auto_ship: auto });
  };

  // Orders waiting to ship, for the sidebar badge; and channel names for other panels.
  return { pendingOf: (h) => siteOf(h).orders.filter((o) => o.status === 'pending').length, siteOf };
};
