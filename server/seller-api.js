// Seller dashboard API (mock). Each signed-in account gets its own seeded,
// in-memory book of orders, shipments, returns, disputes and wallet entries.
// Paths mirror the shapes the dashboard calls: list endpoints take filter
// query params plus page/per_page, and return { data, meta: { pagination } }.
//
// The rates engine here applies the seller's rules (courier priority, pincode
// blocks/padding/zones, SKU rules, courier holidays), so quotes, bookings and
// delivery promises all agree. Other modules edit those rules in db.settings.
'use strict';
const crypto = require('crypto');

const STATUS = ['NEW', 'READY_TO_SHIP', 'PICKUP_SCHEDULED', 'IN_TRANSIT', 'DELIVERED', 'RTO', 'CANCELLED'];
const COURIERS = [
  { id: 1, name: 'Delhivery', base: 38, perKg: 34, days: 2, cod: 1.8 },
  { id: 2, name: 'DTDC', base: 29, perKg: 22, days: 5, cod: 1.5 },
  { id: 3, name: 'Blue Dart', base: 45, perKg: 40, days: 1, cod: 2.0 },
  { id: 4, name: 'Xpressbees', base: 32, perKg: 26, days: 4, cod: 1.6 },
  { id: 5, name: 'Coastal Cargo', base: 27, perKg: 20, days: 6, cod: 1.4 },
  { id: 6, name: 'Ecom Express', base: 31, perKg: 25, days: 4, cod: 1.6 },
  { id: 7, name: 'Shadowfax', base: 30, perKg: 27, days: 3, cod: 1.7 },
  { id: 8, name: 'Ekart', base: 28, perKg: 24, days: 4, cod: 1.5 },
  { id: 9, name: 'India Post', base: 22, perKg: 18, days: 7, cod: 1.2 },
  { id: 10, name: 'Gati', base: 36, perKg: 28, days: 4, cod: 1.8 },
];
const INTL_COURIERS = [
  { id: 11, name: 'GlobalAir Express', base: 650, perHalf: 210, days: 6 },
  { id: 12, name: 'OceanLink Economy', base: 420, perHalf: 150, days: 12 },
  { id: 13, name: 'Skyward Priority', base: 900, perHalf: 260, days: 4 },
  { id: 14, name: 'DHL Express', base: 1050, perHalf: 290, days: 3 },
  { id: 15, name: 'FedEx International', base: 980, perHalf: 275, days: 4 },
  { id: 16, name: 'UPS Worldwide', base: 960, perHalf: 270, days: 4 },
  { id: 17, name: 'Aramex', base: 700, perHalf: 220, days: 6 },
];
const COUNTRIES = { 'United States': 1.4, 'United Kingdom': 1.3, 'United Arab Emirates': 1.0, Singapore: 1.0, Australia: 1.5, Canada: 1.45, Germany: 1.35 };
const CITIES = [
  ['Bengaluru', 'KA', '560034'], ['Mumbai', 'MH', '400053'], ['New Delhi', 'DL', '110017'], ['Hyderabad', 'TS', '500081'],
  ['Pune', 'MH', '411014'], ['Chennai', 'TN', '600040'], ['Kolkata', 'WB', '700091'], ['Jaipur', 'RJ', '302017'],
  ['Ahmedabad', 'GJ', '380015'], ['Lucknow', 'UP', '226010'], ['Kochi', 'KL', '682024'], ['Indore', 'MP', '452010'],
];
const INTL_CITIES = [['New York', 'NY', '10001', 'United States'], ['London', 'LDN', 'EC1A1BB', 'United Kingdom'], ['Dubai', 'DU', '00000', 'United Arab Emirates'], ['Singapore', 'SG', '018956', 'Singapore'], ['Sydney', 'NSW', '2000', 'Australia'], ['Toronto', 'ON', 'M5H2N2', 'Canada']];
const FIRST = ['Aarav', 'Diya', 'Kabir', 'Isha', 'Rohan', 'Meera', 'Arjun', 'Sana', 'Vivaan', 'Anika', 'Dev', 'Tara', 'Ishaan', 'Nisha', 'Reyansh', 'Pooja'];
const LAST = ['Sharma', 'Iyer', 'Khan', 'Reddy', 'Patel', 'Das', 'Menon', 'Gupta', 'Singh', 'Nair', 'Joshi', 'Bose'];
const PRODUCTS = [
  ['Cotton Kurta Set', 'APP-KRT-01', 1299, 0.6, [30, 25, 4]], ['Ceramic Mug Pair', 'HOM-MUG-02', 549, 0.9, [20, 15, 12]], ['Wireless Earbuds', 'ELE-EAR-03', 1899, 0.3, [12, 10, 6]],
  ['Handmade Soap Box', 'BTY-SOP-04', 399, 0.5, [15, 10, 8]], ['Yoga Mat Pro', 'FIT-YOG-05', 1499, 1.6, [62, 15, 15]], ['Spice Gift Hamper', 'FOD-SPC-06', 899, 1.2, [30, 20, 12]],
  ['Leather Wallet', 'ACC-WLT-07', 799, 0.2, [12, 10, 3]], ['Table Lamp', 'HOM-LMP-08', 2199, 2.1, [35, 30, 30]], ['Kids Story Books (Set of 4)', 'BKS-KID-09', 649, 1.0, [28, 22, 6]],
];
const CHANNELS = [{ id: 1, name: 'Custom' }, { id: 2, name: 'Shopify' }, { id: 3, name: 'WooCommerce' }, { id: 4, name: 'Instagram' }];
const NDR_REASONS = ['Customer not available', 'Address incomplete', 'Customer refused delivery', 'Phone unreachable', 'Customer asked for future delivery'];
const RETURN_REASONS = ['Size issue', 'Damaged product', 'Wrong item received', 'Quality not as expected', 'No longer needed'];
const DELAY_REASONS = ['Weather disruption', 'Hub congestion', 'Address not located', 'Vehicle breakdown', 'Festive volume'];
const ZONES = ['Local', 'Regional', 'National', 'Special (NE / J&K)'];

// small deterministic PRNG so a seller's demo book is stable across restarts
function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const day = 86400000;
const iso = (t) => new Date(t).toISOString();
const ymd = (t) => iso(t).slice(0, 10);

function rateFor(courier, weightKg, cod, amount) {
  const slabs = Math.max(1, Math.ceil(weightKg / 0.5));
  const freight = courier.base + (slabs - 1) * courier.perKg / 2;
  const codCharge = cod ? Math.max(30, (amount * courier.cod) / 100) : 0;
  return Math.round((freight + codCharge) * 1.18); // incl. GST
}

const awbIndex = require('./store').track('awbIndex', new Map()); // awb -> { key, id } for the public tracking page
const newAwb = () => 'UT' + Math.floor(1e9 + Math.random() * 9e9);

function defaultSettings() {
  return {
    courier: { mode: 'recommended', enabled: Object.fromEntries(COURIERS.map((c) => [c.id, true])), order: COURIERS.map((c) => c.id) },
    pincode: { blocked: [], padding: [], zones: [] },
    tat: {
      s2d: [{ zone: 0, min: 1, max: 2 }, { zone: 1, min: 2, max: 4 }, { zone: 2, min: 3, max: 6 }, { zone: 3, min: 6, max: 9 }],
      blackout: [{ date: ymd(Date.now() + 9 * day), note: 'Festival holiday' }],
      courier_blackout: [{ courier_id: 3, date: ymd(Date.now() + 4 * day), note: 'Courier hub maintenance' }],
    },
    sku_rules: [], sku_pincode: [],
    smart_weight: false,
    delivery_boost: { enabled: false, channels: { ivr: true, whatsapp: true }, price_per_ndr: 12 },
    promise: { enabled: true, buffer_days: 1, show_on: { product: true, cart: true, checkout: true }, cutoff_hour: 14 },
    tracking_page: { brand_name: '', color: '#3B3FD8', support_phone: '', support_email: '', show_products: true, banner: 'Thanks for shopping with us!',
      store_url: '', recommendations: [], rating_enabled: true },
    returns_policy: { window_days: 30, allow_exchange: true, auto_approve: false, photos_required_for: ['Damaged product', 'Wrong item received'] },
    cod_confirm: { enabled: false, channels: { whatsapp: true, ivr: false }, no_response_action: 'hold', price_per_message: 1 },
    blocklist: [],
  };
}

// ---- team: members act on their owner's book with a role ------------------
const access = require('./access');
const store = require('./store');
const memberships = store.track('memberships', new Map()); // member user key -> { owner, role }
const invites = store.track('invites', new Map());     // contact (mobile or email) -> { owner, role, name, at }
const ROLES = ['owner', 'ops', 'finance', 'support', 'viewer'];
// Write access by role, as path prefixes under /v1/. Reads are open to every
// role except the owner-only pages listed in OWNER_ONLY.
const WRITE_PREFIXES = {
  ops: ['hub/', 'orders/', 'shipments/', 'tracking/', 'settings/courier', 'settings/pincode', 'settings/tat', 'settings/sku', 'skus', 'weight', 'boost/', 'radar/',
    'promise/', 'cod-confirm/', 'returns/', 'settings/blocklist', 'settings/returns-policy', 'settings/tracking-page', 'settings/smart-weight', 'channels/', 'tickets', 'reports/', 'settings/company/pickup', 'vas'],
  finance: ['hub/', 'account/', 'billing/', 'cod/', 'coupons/', 'reports/', 'tickets', 'kyc', 'agreements/'],
  support: ['shipments/ndr/', 'orders/returns/', 'orders/exchange/', 'returns/', 'tickets', 'reports/', 'radar/'],
  viewer: [],
};
const OWNER_ONLY = ['team', 'security', 'webhooks', 'hub/access', 'hub/integrations'];
// The account admin sets each role's access; see server/access.js.
function allowed(db, role, userKey, method, path, url) {
  if (role === 'owner') return true;
  if (OWNER_ONLY.some((p) => path.startsWith(p))) return false;
  if (path.startsWith('hub/profile')) return method === 'GET'; // account-wide settings
  return access.check(db, role, userKey, method, path, url, WRITE_PREFIXES[role]);
}

function seed(key) {
  const r = rng(key);
  const now = Date.now();
  const pickup = [
    { id: 1, nickname: 'Primary Warehouse', address: '12, Industrial Layout, Koramangala', city: 'Bengaluru', state: 'KA', pincode: '560034', phone: '9000000001', is_primary: true },
    { id: 2, nickname: 'Mumbai Store', address: '4th Floor, Link Road, Andheri West', city: 'Mumbai', state: 'MH', pincode: '400053', phone: '9000000002', is_primary: false },
  ];
  const skus = PRODUCTS.map(([name, sku, price, weight, [length, breadth, height]], i) => ({ id: i + 1, name, sku, price, weight, length, breadth, height, hsn: '6109' + i, category: sku.split('-')[0] }));
  const db = { orders: [], returns: [], disputes: [], wallet: [], balance: 2500, remittances: [], pickup, skus, reports: [], nextOrderId: 0, settings: defaultSettings(), activity: [] };
  for (let i = 0; i < 70; i++) {
    const created = now - Math.floor(r() * 30 * day);
    const [pname, sku, price, wt, dims] = pick(r, PRODUCTS);
    const qty = 1 + Math.floor(r() * 3);
    const intl = i % 10 === 3;
    const [city, state, pin, country] = intl ? pick(r, INTL_CITIES) : [...pick(r, CITIES), 'India'];
    const cod = !intl && r() < 0.55;
    const roll = r();
    const status = roll < 0.18 ? 'NEW' : roll < 0.3 ? 'READY_TO_SHIP' : roll < 0.38 ? 'PICKUP_SCHEDULED' : roll < 0.58 ? 'IN_TRANSIT' : roll < 0.86 ? 'DELIVERED' : roll < 0.95 ? 'RTO' : 'CANCELLED';
    const courier = status === 'NEW' || status === 'CANCELLED' ? null : intl ? pick(r, INTL_COURIERS) : pick(r, COURIERS);
    const weight = +(wt * qty).toFixed(2);
    const total = price * qty;
    const shortAddr = r() < 0.12;
    const o = {
      id: 100000 + i, channel_order_id: 'UT' + (5000 + i), channel: pick(r, CHANNELS).name, created_at: iso(created), type: 'FORWARD',
      customer: {
        name: `${pick(r, FIRST)} ${pick(r, LAST)}`, phone: '9' + String(Math.floor(r() * 1e9)).padStart(9, '0'), email: '',
        address: shortAddr ? 'Near temple' : `${1 + Math.floor(r() * 200)}, ${pick(r, ['Main Road', '2nd Cross, MG Layout', 'Sector 4, Phase 2', 'Flat 302, Lake View Apartments'])}`,
        city, state, pincode: pin, country,
      },
      products: [{ name: pname, sku, qty, price }],
      package: { weight, length: dims[0], breadth: dims[1], height: dims[2] },
      payment_method: cod ? 'COD' : 'Prepaid', total, pickup_address_id: r() < 0.75 ? 1 : 2, status, verified: r() < 0.7,
      is_international: intl, courier: courier && courier.name, courier_id: courier && courier.id,
      awb: courier ? newAwb() : null, freight: null, ndr: null, delay: null, edd: null, timeline: [{ status: 'NEW', at: iso(created), location: '' }],
    };
    if (courier) {
      o.freight = intl ? intlRate(courier, weight, country) : rateFor(courier, weight, cod, total);
      // Delivered/returned orders keep a historical EDD; live ones are dated
      // around today so only some are running late.
      const live = ['READY_TO_SHIP', 'PICKUP_SCHEDULED', 'IN_TRANSIT'].includes(status);
      o.edd = iso(live ? now + Math.floor(r() * 6 - 1.2) * day : created + (courier.days + 1) * day);
      awbIndex.set(o.awb, { key, id: o.id });
    }
    const steps = STATUS.slice(1, STATUS.indexOf(status) + 1).filter((s) => s !== 'CANCELLED');
    if (status === 'RTO') steps.splice(steps.indexOf('DELIVERED'), 1);
    steps.forEach((s, n) => o.timeline.push({ status: s, at: iso(Math.min(now, created + (n + 1) * 0.6 * day)), location: n < 2 ? 'Origin hub' : n === 2 ? 'Sorting centre' : city }));
    if (status === 'CANCELLED') o.timeline.push({ status: 'CANCELLED', at: iso(created + 0.2 * day) });
    if (status === 'IN_TRANSIT' && !intl && r() < 0.4) o.ndr = { reason: pick(r, NDR_REASONS), attempts: 1 + Math.floor(r() * 2), raised_at: iso(now - Math.floor(r() * 3 * day)), action: null };
    if (status === 'IN_TRANSIT' && Date.parse(o.edd) < now) o.delay = pick(r, DELAY_REASONS);
    db.orders.push(o);
  }
  // two duplicate orders: same buyer + SKU placed again within hours
  db.orders.filter((o) => o.status === 'NEW').slice(0, 2).forEach((o, i) => {
    db.orders.push({ ...JSON.parse(JSON.stringify(o)), id: 100070 + i, channel_order_id: 'UT' + (5070 + i), created_at: iso(Date.parse(o.created_at) + 3600000) });
  });
  db.nextOrderId = 100072;
  db.returns = db.orders.filter((o) => o.status === 'DELIVERED' && !o.is_international).slice(0, 6).map((o, i) => ({
    id: 9000 + i, order_id: o.id, channel_order_id: o.channel_order_id, customer: o.customer.name, product: o.products[0].name, sku: o.products[0].sku,
    reason: RETURN_REASONS[i % RETURN_REASONS.length], status: i % 3 === 0 ? 'RETURN_PENDING' : i % 3 === 1 ? 'RETURN_PICKED' : 'RETURN_DELIVERED',
    type: 'RETURN', qc: false, refund_mode: 'Original payment', created_at: iso(Date.parse(o.created_at) + 5 * day),
  }));
  db.disputes = db.orders.filter((o) => o.awb && o.status !== 'NEW' && !o.is_international).slice(0, 5).map((o, i) => ({
    id: 7000 + i, order_id: o.id, awb: o.awb, courier: o.courier, product: o.products[0].name, sku: o.products[0].sku,
    entered_weight: o.package.weight, charged_weight: +(o.package.weight + 0.5 + i * 0.25).toFixed(2),
    extra_charge: 40 + i * 18, status: i < 3 ? 'ACTION_REQUIRED' : 'ACCEPTED', raised_at: iso(now - (i + 1) * day),
  }));
  let balance = 2500;
  db.wallet = [{ id: 1, type: 'credit', amount: 2500, note: 'Opening recharge', at: iso(now - 30 * day) }];
  db.orders.filter((o) => o.freight).forEach((o, i) => {
    balance -= o.freight;
    db.wallet.push({ id: i + 2, type: 'debit', amount: o.freight, note: `Freight · AWB ${o.awb}`, at: o.timeline[1] ? o.timeline[1].at : o.created_at });
    if (balance < 800) { balance += 3000; db.wallet.push({ id: 1000 + i, type: 'credit', amount: 3000, note: 'Wallet recharge', at: o.created_at }); }
  });
  db.balance = balance;
  db.wallet.sort((a, b) => b.at.localeCompare(a.at));
  // COD payouts list the AWBs they pay. Orders delivered in the last 2 days
  // aren't due yet. One line is short-paid and one AWB is left out entirely,
  // so reconciliation has something to catch.
  const deliveredAt = (o) => Date.parse((o.timeline.find((t) => t.status === 'DELIVERED') || {}).at || o.created_at);
  const due = db.orders.filter((o) => o.status === 'DELIVERED' && o.payment_method === 'COD' && deliveredAt(o) < now - 2 * day)
    .sort((a, b) => deliveredAt(a) - deliveredAt(b));
  const missing = due.length > 3 ? due[1].awb : null;
  const lines = due.filter((o) => o.awb !== missing).map((o, i) => ({ awb: o.awb, order_id: o.id, cod: o.total, remitted: i === 2 ? o.total - 200 : o.total, delivered_at: iso(deliveredAt(o)) }));
  db.remittances = [];
  for (let i = 0; i < lines.length; i += 4) {
    const chunk = lines.slice(i, i + 4);
    const last = Math.max(...chunk.map((l) => Date.parse(l.delivered_at)));
    db.remittances.push({ id: 300 + db.remittances.length, utr: 'UTR' + (8800120 + db.remittances.length), date: iso(Math.min(now - day, last + 2 * day)), status: 'PAID', lines: chunk, amount: chunk.reduce((s, l) => s + l.remitted, 0) });
  }
  db.remittances.reverse();
  Object.assign(db, { tickets: [], webhooks: [], webhook_log: [], return_requests: [], nextTicketId: 1000 });
  return db;
}

function intlRate(c, weightKg, country) {
  const slabs = Math.max(1, Math.ceil(weightKg / 0.5));
  return Math.round((c.base + (slabs - 1) * c.perHalf) * (COUNTRIES[country] || 1.4) * 1.18);
}

// ---- rules engine ----------------------------------------------------------
function zoneOf(db, pickupPin, dropPin) {
  const mapped = db.settings.pincode.zones.find((z) => dropPin.startsWith(z.prefix));
  if (mapped) return Number(mapped.zone);
  if (/^(78|79|19|18)/.test(dropPin)) return 3; // north-east, J&K
  return pickupPin.slice(0, 2) === dropPin.slice(0, 2) ? 0 : pickupPin[0] === dropPin[0] ? 1 : 2;
}
function isWorkingDay(db, t, courierId) {
  const d = ymd(t);
  if (new Date(t).getUTCDay() === 0) return false;
  if (db.settings.tat.blackout.some((b) => b.date === d)) return false;
  if (courierId && db.settings.tat.courier_blackout.some((b) => b.date === d && Number(b.courier_id) === Number(courierId))) return false;
  return true;
}
// Next pickup: today before the cut-off hour, else the next working day.
function nextPickupDate(db, courierId) {
  let t = Date.now();
  if (new Date(t).getHours() >= (db.settings.promise.cutoff_hour || 14)) t += day;
  for (let i = 0; i < 14 && !isWorkingDay(db, t, courierId); i++) t += day;
  return ymd(t);
}
const ruleError = (status, message) => Object.assign(new Error(message), { status });

// Rates for a lane after every seller rule. Throws { status, message } when
// the lane is blocked or no courier is left.
function rates(db, { pickup, drop, weight, cod, amount, sku, country }) {
  const s = db.settings;
  if (country && country !== 'India') {
    const list = INTL_COURIERS.map((c) => ({ courier_id: c.id, courier_name: c.name, rate: intlRate(c, weight, country), etd_days: c.days, rating: 4.2 })).sort((a, b) => a.rate - b.rate);
    return { data: list, recommended_courier_id: list[0].courier_id, zone: 'International', pickup_date: nextPickupDate(db) };
  }
  const block = s.pincode.blocked.find((b) => b.pincode === drop && (b.scope === 'all' || (b.scope === 'cod' && cod)));
  if (block) throw ruleError(400, `Pincode ${drop} is blocked${block.scope === 'cod' ? ' for COD' : ''} by your rules${block.reason ? ` (${block.reason})` : ''}.`);
  if (sku && s.sku_pincode.some((m) => m.sku === sku && m.pincode === drop)) throw ruleError(400, `SKU ${sku} is not deliverable to ${drop} under your SKU rules.`);
  const zone = zoneOf(db, pickup, drop);
  const pad = (s.pincode.padding.find((p) => p.pincode === drop) || {}).days || 0;
  const skuRule = sku && s.sku_rules.find((x) => x.sku === sku);
  const today = Date.now();
  let couriers = COURIERS.filter((c) => s.courier.enabled[c.id] !== false)
    .filter((c) => !s.tat.courier_blackout.some((b) => b.date === ymd(today) && Number(b.courier_id) === c.id))
    .filter((c) => !(skuRule && skuRule.blocked.includes(c.id)));
  if (skuRule && skuRule.preferred.length) {
    const pref = couriers.filter((c) => skuRule.preferred.includes(c.id));
    if (pref.length) couriers = pref;
  }
  if (!couriers.length) throw ruleError(400, 'No courier is available for this shipment under your current courier rules.');
  const list = couriers.map((c) => ({
    courier_id: c.id, courier_name: c.name,
    rate: rateFor(c, weight, cod, amount) + zone * 12,
    etd_days: c.days + zone + Number(pad), rating: +(3.6 + ((c.id * 7) % 13) / 10).toFixed(1),
  }));
  const score = (x) => x.rate / 10 + x.etd_days * 4 - x.rating * 5;
  const order = s.courier.order;
  const sorters = {
    cheapest: (a, b) => a.rate - b.rate, fastest: (a, b) => a.etd_days - b.etd_days || a.rate - b.rate,
    custom: (a, b) => order.indexOf(a.courier_id) - order.indexOf(b.courier_id), recommended: (a, b) => score(a) - score(b),
  };
  list.sort(sorters[s.courier.mode] || sorters.recommended);
  return { data: list, recommended_courier_id: list[0].courier_id, zone: ZONES[zone], padding_days: Number(pad), pickup_date: nextPickupDate(db, list[0].courier_id) };
}

// ---- order intelligence ------------------------------------------------------
function addressQuality(c) {
  const a = (c.address || '').trim();
  let score = 0;
  if (/\d/.test(a)) score += 40;
  if (a.length >= 15) score += 30;
  if (/(road|street|cross|sector|layout|apartment|flat|floor|nagar|colony|block|phase)/i.test(a)) score += 30;
  return { score, label: score >= 70 ? 'Good' : score >= 40 ? 'Average' : 'Poor' };
}
const isBlocked = (db, c) => db.settings.blocklist.find((b) => (b.type === 'phone' && b.value === c.phone) || (b.type === 'pincode' && b.value === c.pincode) || (b.type === 'email' && c.email && b.value === c.email.toLowerCase()));
function riskOf(db, o) {
  const blocked = isBlocked(db, o.customer);
  if (blocked) return { score: 99, level: 'High', reasons: [`On your blocklist (${blocked.type})`] };
  if (o.is_international) return { score: 5, level: 'Low', reasons: [] };
  const reasons = [];
  let s = 8;
  if (o.payment_method === 'COD') { s += 28; reasons.push('Cash on delivery'); }
  if (o.payment_method === 'COD' && !o.verified) { s += 14; reasons.push('Buyer not verified'); }
  const aq = addressQuality(o.customer);
  if (aq.label === 'Poor') { s += 22; reasons.push('Incomplete address'); } else if (aq.label === 'Average') s += 8;
  const buyerRto = db.orders.filter((x) => x.id !== o.id && x.customer.phone === o.customer.phone && x.status === 'RTO').length;
  if (buyerRto) { s += 25; reasons.push(`Buyer has ${buyerRto} past RTO`); }
  const pinRto = db.orders.filter((x) => x.id !== o.id && x.customer.pincode === o.customer.pincode && x.status === 'RTO').length;
  if (pinRto) { s += Math.min(20, pinRto * 10); reasons.push(`High RTO pincode (${pinRto})`); }
  if (o.total > 2500 && o.payment_method === 'COD') { s += 8; reasons.push('High order value'); }
  s = Math.min(99, s);
  return { score: s, level: s >= 60 ? 'High' : s >= 35 ? 'Medium' : 'Low', reasons };
}
function duplicateIds(db) {
  const ids = new Set();
  const live = db.orders.filter((o) => o.status !== 'CANCELLED');
  for (const o of live) {
    if (o.status !== 'NEW') continue;
    const dup = live.find((x) => x.id !== o.id && x.customer.phone === o.customer.phone && x.products[0].sku === o.products[0].sku && Math.abs(Date.parse(x.created_at) - Date.parse(o.created_at)) < 3 * day && x.id < o.id);
    if (dup) ids.add(o.id);
  }
  return ids;
}

// ---- helpers ---------------------------------------------------------------
function paginate(list, url) {
  const per = Math.min(200, Math.max(1, Number(url.searchParams.get('per_page')) || 15));
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pages, Math.max(1, Number(url.searchParams.get('page')) || 1));
  return { data: list.slice((page - 1) * per, page * per), meta: { pagination: { total, per_page: per, current_page: page, total_pages: pages } } };
}
function inRange(isoStr, url) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const t = Date.parse(isoStr);
  if (from && t < Date.parse(from)) return false;
  if (to && t > Date.parse(to) + day - 1) return false;
  return true;
}

const TAB_STATUS = { new: ['NEW'], readytoship: ['READY_TO_SHIP'], pickup: ['PICKUP_SCHEDULED'], intransit: ['IN_TRANSIT'], delivered: ['DELIVERED'], rto: ['RTO'], onhold: ['ON_HOLD'], duplicate: ['NEW'], all: [...STATUS, 'ON_HOLD'] };

module.exports = function register(routes, { send, authUser, users }) {
  const books = store.track('books', new Map());
  const bookByKey = (key) => { if (!books.has(key)) books.set(key, seed(key)); return books.get(key); };
  const book = (user) => bookByKey((memberships.get(user.key) || {}).owner || user.key);

  // A pending invite is accepted the first time the invited person signs in.
  function membershipOf(user) {
    if (!memberships.has(user.key)) {
      const inv = [user.mobile, user.email].filter(Boolean).map((c) => [c, invites.get(c)]).find(([, i]) => i && i.owner !== user.key);
      if (inv) { memberships.set(user.key, { owner: inv[1].owner, role: inv[1].role }); invites.delete(inv[0]); }
    }
    return memberships.get(user.key) || { owner: user.key, role: 'owner' };
  }

  // Wrap a handler so it runs only for a signed-in seller, on their (or their
  // owner's) book, within their role. Successful writes go to the activity log.
  const seller = (fn) => async (req, res, body, url) => {
    const user = authUser(req);
    if (!user) return send(res, 401, { message: 'Session expired. Please log in again.' });
    const m = user.api_key_owner ? { owner: user.key, role: 'owner' } : membershipOf(user);
    const path = url.pathname.replace('/v1/', '');
    const db = bookByKey(m.owner);
    if (!allowed(db, m.role, user.key, req.method, path, url)) return send(res, 403, { message: `Your role (${access.roleName(db, m.role)}) can't do this. Ask the account admin for access.` });
    await fn({ req, res, body, url, user, db, role: m.role, ownerKey: m.owner, perms: access.permsOf(db, m.role, user.key) });
    if (req.method !== 'GET' && res.statusCode < 400) {
      db.activity.unshift({ id: Date.now() + Math.random(), at: iso(Date.now()), path, by: (user.name || user.mobile || user.email) + (m.role !== 'owner' ? ` (${m.role})` : '') });
      db.activity.length = Math.min(db.activity.length, 300);
    }
  };

  // ---- webhooks: signed POSTs to the seller's endpoints --------------------
  const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/i;
  function emit(db, event, data) {
    for (const h of db.webhooks.filter((w) => w.active && w.events.includes(event))) {
      const payload = JSON.stringify({ event, created_at: iso(Date.now()), data });
      const log = { id: Date.now() + Math.random(), hook_id: h.id, event, at: iso(Date.now()), status: 'PENDING', code: null };
      db.webhook_log.unshift(log);
      db.webhook_log.length = Math.min(db.webhook_log.length, 100);
      let target;
      try { target = new URL(h.url); } catch (e) { Object.assign(log, { status: 'FAILED', error: 'Invalid URL' }); continue; }
      if (PRIVATE_HOST.test(target.hostname) && !process.env.ALLOW_PRIVATE_WEBHOOKS) { Object.assign(log, { status: 'BLOCKED', error: 'Private addresses are blocked' }); continue; }
      const signature = crypto.createHmac('sha256', h.secret).update(payload).digest('hex');
      fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-UT-Event': event, 'X-UT-Signature': 'sha256=' + signature }, body: payload, signal: AbortSignal.timeout(5000), redirect: 'error' })
        .then((r) => Object.assign(log, { status: r.ok ? 'DELIVERED' : 'FAILED', code: r.status }))
        .catch((err) => Object.assign(log, { status: 'FAILED', error: err.name === 'TimeoutError' ? 'Timed out' : 'Connection failed' }));
    }
  }
  const shipEvent = (o) => ({ order_id: o.channel_order_id, awb: o.awb, courier: o.courier, status: o.status, edd: o.edd });
  const findOrder = (db, id) => db.orders.find((o) => o.id === Number(id));
  const move = (o, status, location = '') => { o.status = status; o.timeline.push({ status, at: iso(Date.now()), location }); };
  const debit = (db, amount, note) => { db.balance -= amount; db.wallet.unshift({ id: Date.now() + Math.random(), type: 'debit', amount, note, at: iso(Date.now()) }); };
  const credit = (db, amount, note) => { db.balance += amount; db.wallet.unshift({ id: Date.now() + Math.random(), type: 'credit', amount, note, at: iso(Date.now()) }); };
  const pickupOf = (db, o) => db.pickup.find((p) => p.id === o.pickup_address_id) || db.pickup[0];
  const decorate = (db, o, dups) => ({ ...o, risk: riskOf(db, o), address_quality: addressQuality(o.customer), duplicate: dups ? dups.has(o.id) : false });
  const ratesFor = (db, o) => rates(db, {
    pickup: pickupOf(db, o).pincode, drop: o.customer.pincode, weight: o.package.weight, cod: o.payment_method === 'COD',
    amount: o.total, sku: o.products[0].sku, country: o.customer.country,
  });

  routes['GET /v1/auth/login/user'] = seller(({ res, user, role, ownerKey, db, perms }) => {
    const { password, twofa_pending, ...safe } = user;
    const owner = users.get(ownerKey) || user;
    send(res, 200, { ...safe, role, role_name: access.roleName(db, role), permissions: perms, company_name: owner.name ? owner.name.split(' ')[0] + "'s Store" : 'My Store', plan: 'Pay as you go' });
  });

  // Sidebar menu. Items a role can't use are left out (the API also refuses).
  routes['GET /v1/settings/menuv2'] = seller(({ res, role }) => {
    // Stations follow an order's life. Each child is one page; badges add up on the station.
    const menu = [
      { key: 'today', label: 'Today', icon: 'home', children: [
        { label: 'Overview', path: '#/home' }, { label: 'Numbers', path: '#/dashboard' }, { label: 'Reports', path: '#/reports' },
      ] },
      { key: 'ship', label: 'Ship', icon: 'box', children: [
        { label: 'Orders', path: '#/orders/new', badge: 'orders' }, { label: 'Shipments', path: '#/shipments' }, { label: 'Bulk upload', path: '#/bulk' },
        { label: 'Labels & manifests', path: '#/manifests' }, { label: 'Rate calculator', path: '#/tools' }, { label: 'International quote', path: '#/intl-quote' }, { label: 'Bulk tracking', path: '#/track' },
      ] },
      { key: 'road', label: 'On the road', icon: 'route', children: [
        { label: 'Failed deliveries', path: '#/ndr', badge: 'ndr' }, { label: 'Delay Radar', path: '#/radar' }, { label: 'Delivery Boost', path: '#/boost' },
        { label: 'RTO risk', path: '#/rto' }, { label: 'COD confirmation', path: '#/cod-confirm' }, { label: 'Returns', path: '#/returns', badge: 'requests' },
        { label: 'Exchanges', path: '#/exchanges' }, { label: 'Weight disputes', path: '#/weight' }, { label: 'Support', path: '#/support', badge: 'tickets' },
      ] },
      { key: 'money', label: 'Money', icon: 'wallet', children: [
        { label: 'Wallet & payouts', path: '#/billing' }, { label: 'COD reconciliation', path: '#/cod' },
        { label: 'Invoices & credit notes', path: '#/invoices' }, { label: 'Rate card & coupons', path: '#/rate-card' },
      ] },
      { key: 'rules', label: 'Rules', icon: 'scale', children: [
        { label: 'Courier priority', path: '#/couriers' }, { label: 'Pincode rules', path: '#/pincodes' }, { label: 'Delivery time & holidays', path: '#/tat' },
        { label: 'SKU catalog & rules', path: '#/skus' }, { label: 'Weight Freeze', path: '#/freeze' }, { label: 'Delivery Promise', path: '#/promise' },
        { label: 'Return policy', path: '#/returns-policy' }, { label: 'Buyer blocklist', path: '#/blocklist' }, { label: 'Channels', path: '#/channels' },
      ] },
      // Not a station: opens from the profile menu.
      { key: 'account', label: 'Account', icon: 'gear', account: true, children: [
        { label: 'Company & pickup', path: '#/settings' }, { label: 'Team & roles', path: '#/team', owner: true }, { label: 'KYC & agreements', path: '#/kyc' },
        { label: 'Buyer notifications', path: '#/vas' }, { label: 'Tracking page', path: '#/tracking-page' }, { label: 'API & webhooks', path: '#/developers', owner: true },
        { label: 'Security', path: '#/security', owner: true }, { label: 'Activity log', path: '#/activity' }, { label: 'Video tutorials', path: '#/tutorials' },
        { label: 'Keyboard shortcuts', path: '#/shortcuts' }, { label: 'Refer & earn', path: '#/refer' },
      ] },
    ];
    const visible = menu.map((m) => ({ ...m, children: m.children.filter((c) => !c.owner || role === 'owner') }));
    send(res, 200, { data: visible, role });
  });

  routes['GET /v1/homepage/order-count-details'] = seller(({ res, db, perms }) => {
    const count = (s) => db.orders.filter((o) => o.status === s).length;
    const today = ymd(Date.now());
    const todays = db.orders.filter((o) => o.created_at.slice(0, 10) === today);
    send(res, 200, {
      orders_today: todays.length, revenue_today: todays.reduce((s, o) => s + o.total, 0),
      new: count('NEW'), ready_to_ship: count('READY_TO_SHIP'), pickup_scheduled: count('PICKUP_SCHEDULED'),
      in_transit: count('IN_TRANSIT'), delivered: count('DELIVERED'), rto: count('RTO'), on_hold: count('ON_HOLD'),
      ndr_pending: db.orders.filter((o) => o.ndr && !o.ndr.action).length, wallet_balance: perms.wallet === 'none' ? null : db.balance,
      return_requests: db.return_requests.filter((r) => r.status === 'REQUESTED').length,
      tickets_awaiting: db.tickets.filter((t) => t.status === 'AWAITING_YOU').length,
    });
  });

  routes['GET /v1/homepage/next-best-actions'] = seller(({ res, db }) => {
    const highRisk = db.orders.filter((o) => o.status === 'NEW' && riskOf(db, o).level === 'High').length;
    const actions = [
      { key: 'new', title: 'Orders waiting to be shipped', count: db.orders.filter((o) => o.status === 'NEW').length, cta: 'Ship now', path: '#/orders/new' },
      { key: 'ndr', title: 'Failed deliveries need your input', count: db.orders.filter((o) => o.ndr && !o.ndr.action).length, cta: 'Take action', path: '#/ndr' },
      { key: 'rto', title: 'High RTO-risk orders to review', count: highRisk, cta: 'Review', path: '#/rto' },
      { key: 'weight', title: 'Weight disputes to review', count: db.disputes.filter((d) => d.status === 'ACTION_REQUIRED').length, cta: 'Review', path: '#/weight' },
      { key: 'dup', title: 'Possible duplicate orders', count: duplicateIds(db).size, cta: 'Check', path: '#/orders/duplicate' },
      { key: 'hold', title: 'Orders on hold', count: db.orders.filter((o) => o.status === 'ON_HOLD').length, cta: 'Open', path: '#/orders/onhold' },
      { key: 'returns', title: 'Return requests to approve', count: db.return_requests.filter((r) => r.status === 'REQUESTED').length, cta: 'Review', path: '#/returns?tab=requests' },
      { key: 'tickets', title: 'Support replies waiting for you', count: db.tickets.filter((t) => t.status === 'AWAITING_YOU').length, cta: 'Reply', path: '#/support' },
    ];
    send(res, 200, { data: actions.filter((a) => a.count > 0) });
  });

  routes['GET /v1/shipments/getpickup'] = seller(({ res, db, url }) => {
    const when = url.searchParams.get('from') === 'tomorrow' ? 1 : 0;
    const rows = db.orders.filter((o) => o.status === (when ? 'READY_TO_SHIP' : 'PICKUP_SCHEDULED'));
    const byCourier = {};
    rows.forEach((o) => { byCourier[o.courier] = (byCourier[o.courier] || 0) + 1; });
    send(res, 200, { data: Object.entries(byCourier).map(([courier, count]) => ({ courier, count, slot: when ? 'Tomorrow, 10am–6pm' : 'Today, 2pm–6pm' })) });
  });

  routes['GET /v1/orders/processingordersfilters'] = seller(({ res, db }) => send(res, 200, {
    channels: CHANNELS, payment_methods: ['COD', 'Prepaid'], pickup_addresses: db.pickup.map((p) => ({ id: p.id, name: p.nickname })),
    couriers: [...COURIERS, ...INTL_COURIERS].map((c) => ({ id: c.id, name: c.name })), risk_levels: ['Low', 'Medium', 'High'],
  }));

  routes['GET /v1/orders/processing'] = seller(({ res, db, url }) => {
    const tab = url.searchParams.get('tab') || 'new';
    const statuses = TAB_STATUS[tab] || TAB_STATUS.all;
    const q = (url.searchParams.get('search') || '').toLowerCase();
    const pay = url.searchParams.get('payment_method');
    const channel = url.searchParams.get('channel_id');
    const pickupId = url.searchParams.get('pickup_address_id');
    const riskLevel = url.searchParams.get('risk');
    const intl = url.searchParams.get('is_international') === '1';
    const chName = channel && (CHANNELS.find((c) => c.id === Number(channel)) || {}).name;
    const dups = duplicateIds(db);
    const base = db.orders.filter((o) => !!o.is_international === intl && inRange(o.created_at, url));
    const list = base
      .filter((o) => statuses.includes(o.status) && (tab !== 'duplicate' || dups.has(o.id)))
      .filter((o) => !pay || o.payment_method === pay)
      .filter((o) => !chName || o.channel === chName)
      .filter((o) => !pickupId || o.pickup_address_id === Number(pickupId))
      .filter((o) => !q || [o.channel_order_id, o.awb, o.customer.name, o.customer.phone, o.products[0].sku].some((v) => v && String(v).toLowerCase().includes(q)))
      .map((o) => decorate(db, o, dups))
      .filter((o) => !riskLevel || o.risk.level === riskLevel)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const counts = Object.fromEntries(Object.entries(TAB_STATUS).map(([k, s]) => [k, base.filter((o) => s.includes(o.status) && (k !== 'duplicate' || dups.has(o.id))).length]));
    send(res, 200, { ...paginate(list, url), counts });
  });

  routes['GET /v1/orders/show'] = seller(({ res, db, url }) => {
    const o = findOrder(db, url.searchParams.get('id'));
    if (!o) return send(res, 404, { message: 'Order not found' });
    send(res, 200, { ...decorate(db, o, duplicateIds(db)), pickup: pickupOf(db, o) });
  });

  routes['POST /v1/orders/create'] = seller(({ res, db, body }) => {
    const c = body.customer || {};
    const p = body.product || {};
    const country = c.country || 'India';
    const intl = country !== 'India';
    if (!c.name || !(intl || /^[6-9]\d{9}$/.test(c.phone || '')) || !(intl ? /^[A-Za-z0-9 ]{3,10}$/.test(c.pincode || '') : /^\d{6}$/.test(c.pincode || '')) || !c.address || !c.city) {
      return send(res, 400, { message: 'Fill in the buyer name, phone, full address and a valid postal code.' });
    }
    if (intl && !COUNTRIES[country]) return send(res, 400, { message: 'We do not ship to that country yet.' });
    if (!p.name || !(Number(p.price) > 0) || !(Number(p.qty) > 0)) return send(res, 400, { message: 'Add a product with price and quantity.' });
    if (intl && body.payment_method === 'COD') return send(res, 400, { message: 'International orders must be prepaid.' });
    // Smart Weight Assurance: a frozen SKU always ships at its frozen size.
    const frozen = db.settings.smart_weight && db.freeze && db.freeze[p.sku];
    const cat = frozen || db.skus.find((s) => s.sku === p.sku);
    const qty = Number(p.qty);
    const weight = (!frozen && Number(body.weight)) || (cat ? +(cat.weight * qty).toFixed(2) : 0.5);
    const id = ++db.nextOrderId;
    const o = {
      id, channel_order_id: body.order_id || 'UT' + id, channel: body.channel || 'Custom', created_at: iso(Date.now()), type: body.type || 'FORWARD',
      customer: { name: c.name, phone: c.phone, email: c.email || '', address: c.address, city: c.city, state: c.state || '', pincode: String(c.pincode), country },
      products: [{ name: p.name, sku: p.sku || '', qty, price: Number(p.price) }],
      package: frozen ? { weight, length: frozen.length, breadth: frozen.breadth, height: frozen.height }
        : { weight, length: Number(body.length) || (cat ? cat.length : 10), breadth: Number(body.breadth) || (cat ? cat.breadth : 10), height: Number(body.height) || (cat ? cat.height : 10) },
      payment_method: body.payment_method === 'COD' ? 'COD' : 'Prepaid', total: Number(p.price) * qty,
      pickup_address_id: Number(body.pickup_address_id) || 1, status: 'NEW', verified: body.payment_method !== 'COD', is_international: intl,
      courier: null, courier_id: null, awb: null, freight: null, ndr: null, delay: null, edd: null, timeline: [{ status: 'NEW', at: iso(Date.now()), location: '' }],
      linked_return_id: body.linked_return_id || null,
    };
    // Blocked buyers go straight to On Hold; COD orders get a confirmation
    // message when automatic COD confirmation is on.
    const blocked = isBlocked(db, o.customer);
    if (blocked) { o.status = 'ON_HOLD'; o.hold_reason = `Buyer on blocklist (${blocked.type})`; o.timeline.push({ status: 'ON_HOLD', at: iso(Date.now()), location: '' }); }
    else if (o.payment_method === 'COD' && db.settings.cod_confirm.enabled) o.confirmation = { status: 'SENT', at: iso(Date.now()), via: db.settings.cod_confirm.channels.whatsapp ? 'WhatsApp' : 'IVR' };
    db.orders.unshift(o);
    emit(db, 'order.created', { order_id: o.channel_order_id, status: o.status, payment_method: o.payment_method, total: o.total });
    send(res, 200, { order_id: id, status: o.status });
  });

  routes['GET /v1/courier/serviceability'] = seller(({ res, db, url }) => {
    const pickupPin = url.searchParams.get('pickup_postcode') || '';
    const drop = url.searchParams.get('delivery_postcode') || '';
    const country = url.searchParams.get('country') || 'India';
    if (!/^\d{6}$/.test(pickupPin) || (country === 'India' && !/^\d{6}$/.test(drop))) return send(res, 400, { message: 'Enter valid 6-digit pickup and delivery pincodes.' });
    try {
      send(res, 200, rates(db, {
        pickup: pickupPin, drop, country, weight: Math.max(0.1, Number(url.searchParams.get('weight')) || 0.5),
        cod: url.searchParams.get('cod') === '1', amount: Number(url.searchParams.get('declared_value')) || 1000, sku: url.searchParams.get('sku') || '',
      }));
    } catch (err) { send(res, err.status || 500, { message: err.message }); }
  });

  routes['GET /v1/orders/rates'] = seller(({ res, db, url }) => {
    const o = findOrder(db, url.searchParams.get('id'));
    if (!o) return send(res, 404, { message: 'Order not found' });
    try { send(res, 200, ratesFor(db, o)); } catch (err) { send(res, err.status || 500, { message: err.message }); }
  });

  routes['POST /v1/orders/ship'] = seller(({ res, db, body, user }) => {
    const orders = (body.order_ids || []).map((id) => findOrder(db, id)).filter((o) => o && o.status === 'NEW');
    if (!orders.length) return send(res, 400, { message: 'Select at least one new order to ship.' });
    const shipped = [];
    const failed = [];
    for (const o of orders) {
      let quote;
      try { quote = ratesFor(db, o); } catch (err) { failed.push({ order_id: o.id, reason: err.message }); continue; }
      const pick = quote.data.find((c) => c.courier_id === Number(body.courier_id)) || (body.auto !== false ? quote.data[0] : null);
      if (!pick) { failed.push({ order_id: o.id, reason: 'Selected courier is not available for this order.' }); continue; }
      if (db.balance < pick.rate) { failed.push({ order_id: o.id, reason: `Wallet balance too low (need ₹${pick.rate}).` }); continue; }
      debit(db, pick.rate, `Freight · ${o.channel_order_id}`);
      Object.assign(o, { courier: pick.courier_name, courier_id: pick.courier_id, freight: pick.rate, awb: newAwb(), edd: iso(Date.now() + (pick.etd_days + 1) * day), pickup_date: quote.pickup_date });
      db.wallet[0].note = `Freight · AWB ${o.awb}`;
      awbIndex.set(o.awb, { key: user.key, id: o.id });
      move(o, 'READY_TO_SHIP');
      emit(db, 'shipment.created', shipEvent(o));
      shipped.push({ order_id: o.id, awb: o.awb, courier: o.courier, freight: o.freight, pickup_date: o.pickup_date });
    }
    if (!shipped.length) return send(res, failed[0].reason.startsWith('Wallet') ? 402 : 400, { message: failed[0].reason, failed });
    send(res, 200, { shipped, failed, wallet_balance: db.balance });
  });

  routes['POST /v1/orders/pickup'] = seller(({ res, db, body }) => {
    const orders = (body.order_ids || []).map((id) => findOrder(db, id)).filter((o) => o && o.status === 'READY_TO_SHIP');
    if (!orders.length) return send(res, 400, { message: 'Select ready-to-ship orders to schedule a pickup.' });
    orders.forEach((o) => { o.pickup_date = nextPickupDate(db, o.courier_id); o.manifest_id = o.manifest_id || 'MF' + Date.now().toString().slice(-7); move(o, 'PICKUP_SCHEDULED'); emit(db, 'shipment.pickup_scheduled', { ...shipEvent(o), pickup_date: o.pickup_date }); });
    send(res, 200, { scheduled: orders.length, pickup_date: orders[0].pickup_date, manifest_id: orders[0].manifest_id });
  });

  routes['POST /v1/orders/cancel'] = seller(({ res, db, body }) => {
    const orders = (body.ids || []).map((id) => findOrder(db, id)).filter((o) => o && ['NEW', 'READY_TO_SHIP', 'ON_HOLD'].includes(o.status));
    if (!orders.length) return send(res, 400, { message: 'Only new, on-hold or ready-to-ship orders can be cancelled.' });
    orders.forEach((o) => { if (o.freight && o.awb) credit(db, o.freight, `Refund · cancelled ${o.channel_order_id}`); move(o, 'CANCELLED'); emit(db, 'order.cancelled', { order_id: o.channel_order_id, awb: o.awb }); });
    send(res, 200, { cancelled: orders.length });
  });

  routes['POST /v1/orders/hold'] = seller(({ res, db, body }) => {
    const orders = (body.ids || []).map((id) => findOrder(db, id)).filter((o) => o && o.status === 'NEW');
    if (!orders.length) return send(res, 400, { message: 'Only new orders can be put on hold.' });
    orders.forEach((o) => { o.hold_reason = String(body.reason || 'Held by seller').slice(0, 120); move(o, 'ON_HOLD'); });
    send(res, 200, { held: orders.length });
  });
  routes['POST /v1/orders/release'] = seller(({ res, db, body }) => {
    const orders = (body.ids || []).map((id) => findOrder(db, id)).filter((o) => o && o.status === 'ON_HOLD');
    if (!orders.length) return send(res, 400, { message: 'Select orders that are on hold.' });
    orders.forEach((o) => { o.hold_reason = null; move(o, 'NEW'); });
    send(res, 200, { released: orders.length });
  });

  routes['POST /v1/orders/verify'] = seller(({ res, db, body }) => {
    const o = findOrder(db, body.id);
    if (!o) return send(res, 404, { message: 'Order not found' });
    o.verified = true;
    send(res, 200, { verified: true });
  });
  routes['POST /v1/orders/convert-prepaid'] = seller(({ res, db, body }) => {
    const o = findOrder(db, body.id);
    if (!o || o.payment_method !== 'COD' || !['NEW', 'ON_HOLD'].includes(o.status)) return send(res, 400, { message: 'Only unshipped COD orders can be converted.' });
    o.payment_link = { url: `https://pay.example.com/l/${o.id.toString(36)}`, sent_at: iso(Date.now()), status: 'SENT' };
    send(res, 200, o.payment_link);
  });

  routes['GET /v1/shipments/ndr/list'] = seller(({ res, db, url }) => {
    const status = url.searchParams.get('status') || 'unsuccessful';
    const list = db.orders.filter((o) => o.ndr && (status === 'unsuccessful' ? !o.ndr.action : !!o.ndr.action))
      .map((o) => ({ order_id: o.id, channel_order_id: o.channel_order_id, awb: o.awb, courier: o.courier, customer: o.customer, payment_method: o.payment_method, total: o.total, ...o.ndr }));
    send(res, 200, paginate(list, url));
  });

  routes['POST /v1/shipments/ndr/action'] = seller(({ res, db, body }) => {
    const o = findOrder(db, body.order_id);
    if (!o || !o.ndr) return send(res, 404, { message: 'NDR not found' });
    if (!['reattempt', 'rto'].includes(body.action)) return send(res, 400, { message: 'Choose re-attempt or return to origin.' });
    Object.assign(o.ndr, { action: body.action, action_at: iso(Date.now()), comment: String(body.comment || '').slice(0, 200), action_by: body.action_by || 'Seller' });
    if (body.action === 'rto') move(o, 'RTO');
    emit(db, 'ndr.actioned', { ...shipEvent(o), action: body.action, reason: o.ndr.reason });
    send(res, 200, { ok: true });
  });

  routes['GET /v1/orders/returns/new-return'] = seller(({ res, db, url }) => {
    const type = url.searchParams.get('type');
    send(res, 200, paginate(db.returns.filter((r) => !type || r.type === type), url));
  });
  routes['GET /v1/orders/return_reason'] = seller(({ res }) => send(res, 200, { data: RETURN_REASONS }));
  routes['POST /v1/orders/returns/create'] = seller(({ res, db, body }) => {
    const o = findOrder(db, body.order_id);
    if (!o || o.status !== 'DELIVERED') return send(res, 400, { message: 'Returns can be created only for delivered orders.' });
    if (db.returns.some((r) => r.order_id === o.id)) return send(res, 409, { message: 'A return or exchange already exists for this order.' });
    const r = {
      id: 9000 + db.returns.length + 1, order_id: o.id, channel_order_id: o.channel_order_id, customer: o.customer.name, product: o.products[0].name, sku: o.products[0].sku,
      qty: Math.min(Number(body.qty) || o.products[0].qty, o.products[0].qty), reason: body.reason || RETURN_REASONS[0], status: 'RETURN_PENDING',
      type: 'RETURN', qc: !!body.qc, qc_checks: body.qc ? ['Product matches', 'Tags intact', 'No damage'] : [], refund_mode: body.refund_mode || 'Original payment',
      pickup_address: body.pickup_address || `${o.customer.address}, ${o.customer.city} ${o.customer.pincode}`, created_at: iso(Date.now()),
      source: body.source || 'Seller',
    };
    db.returns.unshift(r);
    emit(db, 'return.created', { return_id: 'R' + r.id, order_id: r.channel_order_id, reason: r.reason, qty: r.qty });
    send(res, 200, r);
  });

  routes['GET /v1/weightdispute/list'] = seller(({ res, db, url }) => send(res, 200, paginate(db.disputes, url)));
  routes['POST /v1/weightdispute/action'] = seller(({ res, db, body }) => {
    const d = db.disputes.find((x) => x.id === Number(body.id));
    if (!d || d.status !== 'ACTION_REQUIRED') return send(res, 400, { message: 'This dispute is already closed.' });
    if (body.action === 'accept') { d.status = 'ACCEPTED'; debit(db, d.extra_charge, `Weight charge · AWB ${d.awb}`); }
    else if (body.action === 'dispute') { d.status = 'DISPUTE_RAISED'; d.remarks = String(body.remarks || '').slice(0, 300); }
    else return send(res, 400, { message: 'Unknown action' });
    send(res, 200, d);
  });

  routes['GET /v1/dashboard/performance-overview'] = seller(({ res, db, url }) => {
    const intl = url.searchParams.get('is_international') === '1';
    const to = Date.parse(url.searchParams.get('to_date') || ymd(Date.now())) + day - 1;
    const from = Date.parse(url.searchParams.get('from_date') || ymd(to - 29 * day));
    const span = to - from + 1;
    const scope = db.orders.filter((o) => !!o.is_international === intl);
    const pickRange = (a, b) => scope.filter((o) => { const t = Date.parse(o.created_at); return t >= a && t <= b; });
    const cur = pickRange(from, to);
    const prev = pickRange(from - span, from - 1);
    const shipped = cur.filter((o) => o.awb);
    const delivered = cur.filter((o) => o.status === 'DELIVERED').length;
    const closed = cur.filter((o) => ['DELIVERED', 'RTO'].includes(o.status)).length;
    const series = [];
    for (let t = from; t <= to; t += day) {
      const dayOrders = cur.filter((o) => { const x = Date.parse(o.created_at); return x >= t && x < t + day; });
      series.push({ date: ymd(t), orders: dayOrders.length, revenue: dayOrders.reduce((s, o) => s + o.total, 0) });
    }
    const byCourier = {};
    shipped.forEach((o) => {
      const c = (byCourier[o.courier] = byCourier[o.courier] || { courier: o.courier, shipments: 0, delivered: 0, rto: 0, freight: 0 });
      c.shipments++; c.freight += o.freight || 0;
      if (o.status === 'DELIVERED') c.delivered++;
      if (o.status === 'RTO') c.rto++;
    });
    const byRegion = {};
    cur.forEach((o) => { const k = intl ? o.customer.country : o.customer.state; byRegion[k] = (byRegion[k] || 0) + 1; });
    send(res, 200, {
      cards: {
        orders: { value: cur.length, previous: prev.length },
        revenue: { value: cur.reduce((s, o) => s + o.total, 0), previous: prev.reduce((s, o) => s + o.total, 0) },
        avg_shipping_cost: { value: shipped.length ? Math.round(shipped.reduce((s, o) => s + o.freight, 0) / shipped.length) : 0 },
        delivery_rate: { value: closed ? Math.round((delivered / closed) * 100) : 0 },
        cod_share: { value: cur.length ? Math.round((cur.filter((o) => o.payment_method === 'COD').length / cur.length) * 100) : 0 },
        ndr_rate: { value: shipped.length ? Math.round((shipped.filter((o) => o.ndr).length / shipped.length) * 100) : 0 },
      },
      series,
      status_split: [...STATUS, 'ON_HOLD'].map((s) => ({ status: s, count: cur.filter((o) => o.status === s).length })),
      couriers: Object.values(byCourier).sort((a, b) => b.shipments - a.shipments),
      states: Object.entries(byRegion).map(([state, orders]) => ({ state, orders })).sort((a, b) => b.orders - a.orders).slice(0, 6),
    });
  });

  routes['GET /v1/account/wallet'] = seller(({ res, db, url }) => send(res, 200, { balance: db.balance, ...paginate(db.wallet, url) }));
  routes['GET /v1/account/remittance'] = seller(({ res, db }) => {
    const paid = new Set(db.remittances.flatMap((r) => r.lines.map((l) => l.awb)));
    const early = db.account && db.account.early_cod;
    const pending = db.orders.filter((o) => o.status === 'DELIVERED' && o.payment_method === 'COD' && !paid.has(o.awb)).reduce((s, o) => s + o.total, 0);
    send(res, 200, { data: db.remittances.map(({ lines, ...r }) => ({ ...r, shipments: lines.length })), upcoming: { amount: pending, date: ymd(Date.now() + (early ? 1 : 2) * day) }, early_cod: !!early });
  });
  routes['POST /v1/account/early-cod'] = seller(({ res, db, body }) => {
    db.account = db.account || {};
    db.account.early_cod = !!body.enabled;
    send(res, 200, { early_cod: db.account.early_cod });
  });
  routes['POST /v1/account/wallet/recharge'] = seller(({ res, db, body }) => {
    const amount = Math.round(Number(body.amount));
    if (!(amount >= 100 && amount <= 100000)) return send(res, 400, { message: 'Recharge between ₹100 and ₹1,00,000.' });
    credit(db, amount, 'Wallet recharge (demo)');
    send(res, 200, { balance: db.balance });
  });

  routes['GET /v1/reports/all'] = seller(({ res, db, url }) => send(res, 200, paginate(db.reports, url)));
  routes['POST /v1/reports/generate'] = seller(({ res, db, body }) => {
    const types = { orders: 'Orders', shipments: 'Shipments', ndr: 'NDR', returns: 'Returns', wallet: 'Wallet ledger', rto_risk: 'RTO risk', activity: 'Activity log' };
    if (!types[body.type]) return send(res, 400, { message: 'Pick a report type.' });
    const r = { id: db.reports.length + 1, type: body.type, title: types[body.type] + ' report', from: body.from || '', to: body.to || '', status: 'READY', created_at: iso(Date.now()) };
    db.reports.unshift(r);
    send(res, 200, r);
  });
  routes['GET /v1/reports/download'] = seller(({ res, db, url }) => {
    const r = db.reports.find((x) => x.id === Number(url.searchParams.get('id')));
    if (!r) return send(res, 404, { message: 'Report not found' });
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const inR = (t) => (!r.from || t >= r.from) && (!r.to || t.slice(0, 10) <= r.to);
    let rows;
    if (r.type === 'wallet') rows = [['Date', 'Type', 'Amount', 'Note'], ...db.wallet.filter((w) => inR(w.at)).map((w) => [w.at, w.type, w.amount, w.note])];
    else if (r.type === 'returns') rows = [['Return ID', 'Type', 'Order', 'Customer', 'Product', 'Reason', 'Status'], ...db.returns.map((x) => [x.id, x.type, x.channel_order_id, x.customer, x.product, x.reason, x.status])];
    else if (r.type === 'activity') rows = [['Time', 'Action', 'By'], ...db.activity.filter((a) => inR(a.at)).map((a) => [a.at, a.path, a.by])];
    else if (r.type === 'rto_risk') rows = [['Order ID', 'Customer', 'Pincode', 'Payment', 'Risk score', 'Level', 'Reasons'], ...db.orders.filter((o) => o.status === 'NEW').map((o) => { const k = riskOf(db, o); return [o.channel_order_id, o.customer.name, o.customer.pincode, o.payment_method, k.score, k.level, k.reasons.join('; ')]; })];
    else {
      const list = db.orders.filter((o) => inR(o.created_at) && (r.type === 'orders' || (r.type === 'shipments' && o.awb) || (r.type === 'ndr' && o.ndr)));
      rows = [['Order ID', 'Date', 'Customer', 'City', 'Pincode', 'Country', 'Product', 'Qty', 'Amount', 'Payment', 'Status', 'Courier', 'AWB'],
        ...list.map((o) => [o.channel_order_id, o.created_at, o.customer.name, o.customer.city, o.customer.pincode, o.customer.country, o.products[0].name, o.products[0].qty, o.total, o.payment_method, o.status, o.courier, o.awb])];
    }
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${r.type}-report-${r.id}.csv"` });
    res.end(rows.map((row) => row.map(esc).join(',')).join('\n'));
  });

  routes['GET /v1/settings/company/pickup'] = seller(({ res, db }) => send(res, 200, { data: db.pickup }));
  routes['POST /v1/settings/company/pickup'] = seller(({ res, db, body }) => {
    if (!body.nickname || !body.address || !body.city || !/^\d{6}$/.test(body.pincode || '') || !/^[6-9]\d{9}$/.test(body.phone || '')) {
      return send(res, 400, { message: 'Fill in nickname, address, city, a 6-digit pincode and a 10-digit phone.' });
    }
    const p = { id: db.pickup.length + 1, nickname: String(body.nickname).slice(0, 40), address: String(body.address).slice(0, 200), city: String(body.city), state: String(body.state || ''), pincode: body.pincode, phone: body.phone, is_primary: false };
    db.pickup.push(p);
    send(res, 200, p);
  });

  // Support tickets. Every new ticket gets an acknowledgement with an SLA.
  const SLA_HOURS = { 'Shipment delay': 24, 'COD remittance': 48, 'Weight dispute': 48, 'Pickup issue': 12, 'Billing': 48, 'Other': 48 };
  function createTicket(db, { category, subject, ref, message, by }) {
    const cat = SLA_HOURS[category] ? category : 'Other';
    const now = Date.now();
    const t = {
      id: ++db.nextTicketId, category: cat, subject: String(subject || cat).slice(0, 120), ref: String(ref || '').slice(0, 40), status: 'OPEN',
      created_at: iso(now), due_by: iso(now + SLA_HOURS[cat] * 3600000),
      messages: [{ from: by || 'You', text: String(message || '').slice(0, 2000), at: iso(now) },
        { from: 'UT Support', text: `Thanks — we've logged this as #${db.nextTicketId}. A specialist will reply within ${SLA_HOURS[cat]} hours.`, at: iso(now + 1000) }],
    };
    db.tickets.unshift(t);
    return t;
  }

  // Shared with the other modules.
  return {
    createTicket,
    seller, book, books, bookByKey, findOrder, move, debit, credit, paginate, inRange, rates, ratesFor, riskOf, addressQuality, duplicateIds, emit, isBlocked,
    memberships, invites, ROLES, defaultSettings, rateFor,
    nextPickupDate, isWorkingDay, zoneOf, pickupOf, decorate, awbIndex, newAwb, iso, ymd, day,
    COURIERS, INTL_COURIERS, COUNTRIES, ZONES, CHANNELS, RETURN_REASONS, STATUS,
  };
};
