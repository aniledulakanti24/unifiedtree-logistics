// Account + commerce: sales channels, rate card & coupons, buyer
// notifications (VAS), tracking page (branding, recommendations, ratings),
// refer & earn, KYC & agreements, security (2FA, sessions, API keys),
// activity log and help.
'use strict';
const crypto = require('crypto');

const CHANNEL_CATALOG = [
  { key: 'shopify', name: 'Shopify', needs: ['store_url', 'api_key'] },
  { key: 'woocommerce', name: 'WooCommerce', needs: ['store_url', 'api_key'] },
  { key: 'magento', name: 'Magento', needs: ['store_url', 'api_key'] },
  { key: 'amazon', name: 'Amazon', needs: ['seller_id', 'api_key'] },
  { key: 'instagram', name: 'Instagram Shop', needs: ['handle'] },
  { key: 'custom', name: 'Custom API', needs: [] },
];
const COUPONS = [
  { code: 'WELCOME100', title: '₹100 cashback on first recharge of ₹500+', cashback: 100, min_recharge: 500 },
  { code: 'SHIP50', title: '₹50 off shipping credits', cashback: 50, min_recharge: 0 },
];
const VAS_EVENTS = ['Order confirmed', 'Shipped', 'Out for delivery', 'Delivered', 'Delivery failed (NDR)', 'Return picked up'];
const TUTORIALS = [
  ['Getting started: ship your first order', 'Basics', '4:12'], ['Connect your Shopify store', 'Channels', '3:05'],
  ['Bulk upload orders with CSV', 'Orders', '5:30'], ['Handle failed deliveries (NDR)', 'NDR', '6:02'],
  ['Avoid weight disputes with Weight Freeze', 'Weight', '3:48'], ['Set courier priority and pincode rules', 'Rules', '7:15'],
  ['Reduce RTO with risk scores and COD confirmation', 'RTO', '5:10'], ['Reconcile COD payouts', 'Billing', '4:40'],
];

module.exports = function register(routes, { send, sessions, users, setApiKeyResolver }, ctx) {
  const { seller, credit, paginate, iso, ZONES, COURIERS, rateFor, books } = ctx;
  const bad = (res, message) => send(res, 400, { message });
  const DEFAULTS = () => ({
    coupons_used: [], channels: [], early_cod: false,
    vas: Object.fromEntries(VAS_EVENTS.map((e, i) => [e, { whatsapp: i < 4, sms: i === 1 || i === 3, email: true }])), vas_usage: { whatsapp: 412, sms: 168, email: 530 },
    referrals: [], agreements: [{ id: 1, title: 'Seller terms of service v3', accepted_at: null }, { id: 2, title: 'COD remittance agreement', accepted_at: null }],
    api_keys: [],
  });
  // Fills any missing fields so flags set elsewhere (e.g. early_cod) survive.
  const acct = (db) => (db.account = Object.assign(DEFAULTS(), db.account || {}));

  // API keys resolve to the owner of the account that created them.
  const keyIndex = require('./store').track('keyIndex', new Map()); // sha256(secret) -> owner user key
  setApiKeyResolver((token) => {
    const owner = keyIndex.get(crypto.createHash('sha256').update(token).digest('hex'));
    const u = owner && users.get(owner);
    return u ? { ...u, api_key_owner: true } : null;
  });

  // ---- sales channels -------------------------------------------------------
  routes['GET /v1/channels'] = seller(({ res, db }) => {
    const a = acct(db);
    send(res, 200, { data: CHANNEL_CATALOG.map((c) => ({ ...c, connection: a.channels.find((x) => x.key === c.key) || null })) });
  });
  routes['POST /v1/channels/connect'] = seller(({ res, db, body }) => {
    const c = CHANNEL_CATALOG.find((x) => x.key === body.key);
    if (!c) return bad(res, 'Unknown channel.');
    if (c.needs.includes('store_url') && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(body.store_url || '')) return bad(res, 'Enter your store URL, e.g. https://mystore.com');
    if (c.needs.includes('api_key') && String(body.api_key || '').length < 8) return bad(res, 'Paste the API access token from your store admin.');
    if (c.needs.includes('seller_id') && !body.seller_id) return bad(res, 'Enter your seller ID.');
    if (c.needs.includes('handle') && !/^@?[\w.]{2,30}$/.test(body.handle || '')) return bad(res, 'Enter your shop handle.');
    const a = acct(db);
    a.channels = a.channels.filter((x) => x.key !== c.key).concat({
      key: c.key, name: c.name, store: body.store_url || body.seller_id || body.handle || 'API', connected_at: iso(Date.now()), last_sync: null, auto_sync: true, imported: 0,
    });
    send(res, 200, { ok: true });
  });
  routes['POST /v1/channels/disconnect'] = seller(({ res, db, body }) => { const a = acct(db); a.channels = a.channels.filter((x) => x.key !== body.key); send(res, 200, { ok: true }); });
  routes['POST /v1/channels/sync'] = seller(async ({ res, db, body, req, url }) => {
    const ch = acct(db).channels.find((x) => x.key === body.key);
    if (!ch) return bad(res, 'Connect the channel first.');
    const n = 1 + Math.floor(Math.random() * 3);
    const cities = [['Pune', '411014'], ['Kochi', '682024'], ['Jaipur', '302017'], ['Lucknow', '226010']];
    for (let i = 0; i < n; i++) {
      const s = db.skus[(Date.now() + i) % db.skus.length];
      const [city, pin] = cities[(Date.now() + i) % cities.length];
      const fake = { statusCode: 200, writeHead(x) { this.statusCode = x; }, end() {} };
      await routes['POST /v1/orders/create'](req, fake, {
        channel: ch.name, payment_method: i % 2 ? 'COD' : 'Prepaid',
        customer: { name: ['Riya Kapoor', 'Manav Shah', 'Ira Pillai'][i % 3], phone: '98' + String(10000000 + Math.floor(Math.random() * 89999999)), address: `${12 + i}, 3rd Cross, Main Road`, city, pincode: pin },
        product: { name: s.name, sku: s.sku, price: s.price, qty: 1 },
      }, url);
    }
    ch.last_sync = iso(Date.now());
    ch.imported += n;
    send(res, 200, { imported: n });
  });

  // ---- rate card + coupons (pay as you go) ---------------------------------
  routes['GET /v1/rate-card'] = seller(({ res, db }) => send(res, 200, {
    zones: ZONES,
    couriers: COURIERS.map((c) => ({ name: c.name, days: c.days,
      first_500g: ZONES.map((_, z) => rateFor(c, 0.5, false, 0) + z * 12),
      additional_500g: Math.round((c.perKg / 2) * 1.18), cod: `₹30 or ${c.cod}% (higher)` })),
    coupons: COUPONS.map((c) => ({ ...c, used: acct(db).coupons_used.includes(c.code) })),
  }));
  routes['POST /v1/coupons/apply'] = seller(({ res, db, body }) => {
    const code = String(body.code || '').trim().toUpperCase();
    const c = COUPONS.find((x) => x.code === code);
    const a = acct(db);
    if (!c) return bad(res, 'That coupon code is not valid.');
    if (a.coupons_used.includes(code)) return bad(res, 'You have already used this coupon.');
    const recharged = db.wallet.filter((w) => w.type === 'credit' && /recharge/i.test(w.note)).reduce((m, w) => Math.max(m, w.amount), 0);
    if (recharged < c.min_recharge) return bad(res, `Recharge at least ₹${c.min_recharge} to use this coupon.`);
    a.coupons_used.push(code);
    credit(db, c.cashback, `Coupon ${code} cashback`);
    send(res, 200, { credited: c.cashback, balance: db.balance });
  });

  // ---- buyer notifications (VAS) --------------------------------------------
  routes['GET /v1/vas'] = seller(({ res, db }) => { const a = acct(db); send(res, 200, { events: VAS_EVENTS, matrix: a.vas, usage: a.vas_usage, prices: { whatsapp: 0.9, sms: 0.25, email: 0 } }); });
  routes['POST /v1/vas'] = seller(({ res, db, body }) => {
    const a = acct(db);
    if (!body.matrix) return bad(res, 'Nothing to save.');
    VAS_EVENTS.forEach((e) => { const m = body.matrix[e] || {}; a.vas[e] = { whatsapp: !!m.whatsapp, sms: !!m.sms, email: !!m.email }; });
    send(res, 200, a.vas);
  });

  // ---- tracking page: branding, product picks, buyer ratings ---------------
  const ratings = (db) => {
    const fb = db.orders.filter((o) => o.feedback).map((o) => ({ ...o.feedback, order_id: o.channel_order_id }));
    return { count: fb.length, average: fb.length ? +(fb.reduce((s, f) => s + f.rating, 0) / fb.length).toFixed(1) : null, recent: fb.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10) };
  };
  routes['GET /v1/settings/tracking-page'] = seller(({ res, db }) => send(res, 200, { ...db.settings.tracking_page, skus: db.skus.map((s) => ({ sku: s.sku, name: s.name, price: s.price })), ratings: ratings(db) }));
  routes['POST /v1/settings/tracking-page'] = seller(({ res, db, body }) => {
    if (body.color && !/^#[0-9a-f]{6}$/i.test(body.color)) return bad(res, 'Pick a colour.');
    if (body.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.support_email)) return bad(res, 'Enter a valid support email.');
    if (body.support_phone && !/^[6-9]\d{9}$/.test(body.support_phone)) return bad(res, 'Enter a 10-digit support phone.');
    if (body.store_url && !/^https:\/\/[^\s.]+\.[^\s]+$/.test(body.store_url)) return bad(res, 'Store URL must start with https://');
    const tp = db.settings.tracking_page;
    ['brand_name', 'color', 'support_phone', 'support_email', 'banner', 'store_url'].forEach((k) => { if (k in body) tp[k] = String(body[k]).slice(0, 160); });
    if ('show_products' in body) tp.show_products = !!body.show_products;
    if ('rating_enabled' in body) tp.rating_enabled = !!body.rating_enabled;
    if (Array.isArray(body.recommendations)) {
      if (body.recommendations.length > 4) return bad(res, 'Pick up to 4 products to recommend.');
      tp.recommendations = body.recommendations.filter((s) => db.skus.some((x) => x.sku === s));
    }
    send(res, 200, tp);
  });

  // ---- refer & earn ---------------------------------------------------------
  routes['GET /v1/refer'] = seller(({ res, db, user }) => {
    const code = 'UT' + crypto.createHash('sha1').update(user.key).digest('hex').slice(0, 6).toUpperCase();
    const refs = acct(db).referrals;
    send(res, 200, { code, link: `/?ref=${code}#signup`, reward_per_referral: 500, data: refs, earned: refs.filter((r) => r.status === 'REWARDED').length * 500 });
  });
  routes['POST /v1/refer/invite'] = seller(({ res, db, body }) => {
    const to = String(body.contact || '').trim();
    if (!/^[6-9]\d{9}$/.test(to) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return bad(res, 'Enter a 10-digit mobile number or an email.');
    const refs = acct(db).referrals;
    if (refs.some((r) => r.contact === to)) return bad(res, 'You have already invited this person.');
    refs.unshift({ contact: to, status: 'INVITED', at: iso(Date.now()) });
    send(res, 200, { ok: true });
  });

  // ---- KYC + agreements -----------------------------------------------------
  routes['GET /v1/kyc'] = seller(({ res, db }) => send(res, 200, { kyc: db.kyc || null, agreements: acct(db).agreements }));
  routes['POST /v1/kyc'] = seller(({ res, db, body }) => {
    const pan = String(body.pan || '').toUpperCase();
    const gstin = String(body.gstin || '').toUpperCase();
    if (!['Individual', 'Proprietorship', 'Partnership', 'Private Limited', 'LLP'].includes(body.business_type)) return bad(res, 'Pick your business type.');
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return bad(res, 'Enter a valid PAN (e.g. ABCDE1234F).');
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return bad(res, 'Enter a valid GSTIN or leave it blank.');
    if (gstin && gstin.slice(2, 12) !== pan) return bad(res, 'The GSTIN must contain your PAN.');
    if (!/^\d{9,18}$/.test(body.account_no || '')) return bad(res, 'Enter your bank account number.');
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(body.ifsc || '').toUpperCase())) return bad(res, 'Enter a valid IFSC (e.g. HDFC0001234).');
    db.kyc = { business_type: body.business_type, pan, gstin, account_no: '•••• ' + String(body.account_no).slice(-4), ifsc: String(body.ifsc).toUpperCase(), status: 'VERIFIED', at: iso(Date.now()) };
    send(res, 200, db.kyc);
  });
  routes['POST /v1/agreements/accept'] = seller(({ res, db, body }) => {
    const ag = acct(db).agreements.find((x) => x.id === Number(body.id));
    if (!ag) return bad(res, 'Unknown agreement.');
    ag.accepted_at = ag.accepted_at || iso(Date.now());
    send(res, 200, ag);
  });

  // ---- security: 2FA, sessions, API keys ------------------------------------
  const tokensOf = (user) => [...sessions].filter(([, k]) => k === user.key).map(([t]) => t);
  routes['GET /v1/security'] = seller(({ res, db, user, req }) => {
    const current = (req.headers.authorization || '').slice(7);
    send(res, 200, {
      twofa: !!user.twofa, has_password: !!user.password,
      sessions: tokensOf(user).map((t) => ({ id: t.slice(0, 8), current: t === current, device: t === current ? 'This browser' : 'Other device' })),
      api_keys: acct(db).api_keys.map(({ secret, ...k }) => k),
    });
  });
  routes['POST /v1/security/2fa/start'] = seller(({ res, user }) => {
    if (!user.mobile && !user.email) return bad(res, 'Add a mobile number or email first.');
    user.twofa_pending = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    console.log(`[2fa-setup] ${user.key} -> ${user.twofa_pending}`);
    send(res, 200, { sent_to: user.mobile ? '+91 ••••••' + user.mobile.slice(-4) : user.email, ...(process.env.NODE_ENV !== 'production' && { dev_otp: user.twofa_pending }) });
  });
  routes['POST /v1/security/2fa/confirm'] = seller(({ res, user, body }) => {
    if (!user.twofa_pending || String(body.otp) !== user.twofa_pending) return bad(res, 'That code is incorrect.');
    user.twofa = true;
    delete user.twofa_pending;
    send(res, 200, { twofa: true });
  });
  routes['POST /v1/security/2fa/disable'] = seller(({ res, user }) => { user.twofa = false; send(res, 200, { twofa: false }); });
  routes['POST /v1/security/sessions/revoke-others'] = seller(({ res, user, req }) => {
    const current = (req.headers.authorization || '').slice(7);
    let n = 0;
    tokensOf(user).forEach((t) => { if (t !== current) { sessions.delete(t); n++; } });
    send(res, 200, { revoked: n });
  });
  routes['POST /v1/security/api-keys'] = seller(({ res, db, body, ownerKey }) => {
    const name = String(body.name || '').trim();
    if (!name) return bad(res, 'Name the key (e.g. "Warehouse ERP").');
    const keys = acct(db).api_keys;
    if (keys.length >= 5) return bad(res, 'You can have up to 5 API keys.');
    const secret = 'utk_' + crypto.randomBytes(18).toString('hex');
    const hash = crypto.createHash('sha256').update(secret).digest('hex');
    const k = { id: crypto.randomBytes(4).toString('hex'), name: name.slice(0, 40), prefix: secret.slice(0, 10) + '…', created_at: iso(Date.now()), secret: hash };
    keys.push(k);
    keyIndex.set(hash, ownerKey);
    send(res, 200, { id: k.id, name: k.name, secret });
  });
  routes['POST /v1/security/api-keys/revoke'] = seller(({ res, db, body }) => {
    const a = acct(db);
    const k = a.api_keys.find((x) => x.id === body.id);
    if (k) keyIndex.delete(k.secret);
    a.api_keys = a.api_keys.filter((x) => x.id !== body.id);
    send(res, 200, { ok: true });
  });

  // ---- activity log ---------------------------------------------------------
  const LABELS = {
    'orders/create': 'Created an order', 'orders/ship': 'Shipped orders', 'orders/pickup': 'Scheduled a pickup', 'orders/cancel': 'Cancelled orders',
    'orders/hold': 'Put orders on hold', 'orders/release': 'Released orders from hold', 'orders/verify': 'Verified a COD order', 'orders/convert-prepaid': 'Sent a prepaid payment link',
    'orders/bulk': 'Bulk-uploaded orders', 'orders/returns/create': 'Created a return', 'orders/exchange/create': 'Created exchanges', 'shipments/ndr/action': 'Acted on a failed delivery',
    'weightdispute/action': 'Responded to a weight dispute', 'weight-freeze/request': 'Froze a SKU weight', 'weight-freeze/unfreeze': 'Unfroze a SKU weight', 'account/wallet/recharge': 'Recharged the wallet',
    'account/early-cod': 'Changed Early COD', 'settings/courier': 'Changed courier priority', 'settings/pincode': 'Changed pincode rules', 'settings/tat': 'Changed delivery-time or holiday rules',
    'settings/sku-rules': 'Changed SKU courier rules', 'settings/sku-pincode': 'Changed SKU pincode rules', skus: 'Saved a SKU', 'skus/delete': 'Deleted a SKU', 'boost/run': 'Ran Delivery Boost',
    'boost/settings': 'Changed Delivery Boost settings', 'channels/connect': 'Connected a sales channel', 'channels/sync': 'Synced a sales channel', 'channels/disconnect': 'Disconnected a sales channel',
    kyc: 'Submitted KYC', 'agreements/accept': 'Accepted an agreement', 'security/2fa/start': 'Requested a two-factor setup code', 'security/2fa/confirm': 'Turned on two-factor login',
    'security/2fa/disable': 'Turned off two-factor login', 'security/api-keys': 'Created an API key', 'security/api-keys/revoke': 'Revoked an API key',
    'security/sessions/revoke-others': 'Signed out other devices', 'reports/generate': 'Generated a report', 'refer/invite': 'Invited a seller', 'coupons/apply': 'Applied a coupon',
    vas: 'Changed buyer notifications', 'settings/tracking-page': 'Updated the tracking page', 'promise/settings': 'Changed Delivery Promise', 'settings/smart-weight': 'Changed Smart Weight Assurance',
    'radar/escalate': 'Escalated a delayed shipment', 'settings/company/pickup': 'Added a pickup address', 'team/invite': 'Invited a team member', 'team/role': 'Changed a team role',
    'team/remove': 'Removed a team member', 'webhooks': 'Saved a webhook', 'webhooks/delete': 'Deleted a webhook', 'webhooks/test': 'Sent a test webhook',
    'returns/requests/decide': 'Decided a return request', 'settings/returns-policy': 'Changed the return policy', 'cod-confirm/settings': 'Changed COD confirmation',
    'cod-confirm/run': 'Processed COD confirmations', 'cod/dispute': 'Disputed a COD remittance', tickets: 'Opened a support ticket', 'tickets/reply': 'Replied to a support ticket',
    'tickets/close': 'Closed a support ticket', 'settings/blocklist': 'Changed the buyer blocklist',
  };
  routes['GET /v1/activity'] = seller(({ res, db, url }) => send(res, 200, paginate(db.activity.map((a) => ({ ...a, label: LABELS[a.path] || a.path.replace(/[-/]/g, ' ') })), url)));

  // ---- help -----------------------------------------------------------------
  routes['GET /v1/help/tutorials'] = seller(({ res }) => send(res, 200, { data: TUTORIALS.map(([title, topic, length], i) => ({ id: i + 1, title, topic, length, url: '' })) }));
};
