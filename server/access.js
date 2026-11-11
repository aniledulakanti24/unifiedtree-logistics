// Role-based access the account admin controls. Each role has a level per module:
// none, view or manage. The server checks these on every request.
'use strict';

const MODULES = [
  { key: 'booking', label: 'Book transport', group: 'Shipping' }, { key: 'orders', label: 'Orders', group: 'Shipping' }, { key: 'returns', label: 'Returns', group: 'Shipping' }, { key: 'weight', label: 'Weight management', group: 'Shipping' }, { key: 'holidays', label: 'Partner holidays', group: 'Shipping' }, { key: 'tracking', label: 'Live tracking', group: 'Shipping' },
  { key: 'travel', label: 'Travel and rides', group: 'Book and pay' }, { key: 'recharge', label: 'Recharge and bills', group: 'Book and pay' }, { key: 'autopay', label: 'Auto-pay', group: 'Book and pay' }, { key: 'bizpay', label: 'Business payments', group: 'Book and pay' },
  { key: 'wallet', label: 'Wallet', group: 'Money' }, { key: 'rewards', label: 'Rewards', group: 'Money' }, { key: 'insights', label: 'Insights and budgets', group: 'Money' }, { key: 'gst', label: 'Single GST', group: 'Money' },
  { key: 'whatsapp', label: 'WhatsApp automation', group: 'Communication' }, { key: 'notifications', label: 'Notifications', group: 'Communication' }, { key: 'support', label: 'Help and tickets', group: 'Communication' }, { key: 'feedback', label: 'Feedback', group: 'Communication' },
  { key: 'seller_ship', label: 'Seller tools: shipping', group: 'Seller tools' }, { key: 'seller_finance', label: 'Seller tools: finance', group: 'Seller tools' },
];
const KEYS = MODULES.map((m) => m.key);
const all = (level) => Object.fromEntries(KEYS.map((k) => [k, level]));
const preset = (base, overrides) => ({ ...all(base), ...overrides });
const BUILT_IN = {
  admin: { name: 'Admin', description: 'Everything except changing who has access', perms: all('manage') },
  ops: { name: 'Operations', description: 'Shipping, returns and tracking', perms: preset('view', { booking: 'manage', orders: 'manage', returns: 'manage', weight: 'manage', holidays: 'manage', tracking: 'manage', whatsapp: 'manage', notifications: 'manage', support: 'manage', feedback: 'manage', seller_ship: 'manage', gst: 'none', bizpay: 'none' }) },
  finance: { name: 'Finance', description: 'Wallet, GST, payments and budgets', perms: preset('view', { wallet: 'manage', gst: 'manage', bizpay: 'manage', insights: 'manage', recharge: 'manage', autopay: 'manage', rewards: 'manage', seller_finance: 'manage', support: 'manage', feedback: 'manage', notifications: 'manage' }) },
  support: { name: 'Support', description: 'Help customers with orders and returns', perms: preset('none', { orders: 'view', returns: 'manage', tracking: 'view', weight: 'view', holidays: 'view', whatsapp: 'view', notifications: 'manage', support: 'manage', feedback: 'manage', seller_ship: 'view' }) },
  viewer: { name: 'Viewer', description: 'Can look, cannot change anything', perms: all('view') },
};

// Longest prefixes first where they overlap. null means every signed-in member may use it.
const PREFIXES = [
  ['hub/spend', null], ['hub/checkout/instruments', 'wallet'], ['hub/checkout', null], ['hub/intel', 'orders'], ['hub/ndr', 'orders'], ['hub/alloc', 'booking'], ['hub/lock', 'travel'], ['hub/payments', 'wallet'],
  ['hub/summary', null], ['hub/overview', null], ['hub/nav-counts', null], ['hub/config', null], ['hub/catalog', null], ['hub/geo', null], ['auth/', null], ['settings/menuv2', null], ['homepage/order-count', null], ['get/version', null], ['courier/applied_weight', null],
  ['hub/transport', 'booking'], ['hub/desk', 'booking'], ['hub/orders', 'orders'], ['hub/returns', 'returns'], ['hub/weight', 'weight'], ['hub/holidays', 'holidays'], ['hub/search', 'travel'], ['hub/calendar', 'travel'], ['hub/alerts', 'travel'],
  ['hub/recharge', 'recharge'], ['hub/vouchers', 'recharge'], ['hub/gold', 'recharge'], ['hub/plans', 'recharge'], ['hub/fastag', 'recharge'], ['hub/bill', 'recharge'], ['hub/business', 'bizpay'], ['hub/autopay', 'autopay'], ['hub/wallet', 'wallet'], ['account/wallet', 'wallet'], ['hub/rewards', 'rewards'], ['hub/coupon', 'rewards'], ['hub/insights', 'insights'], ['hub/budgets', 'insights'],
  ['hub/biz/shipments', 'tracking'], ['hub/biz/whatsapp', 'whatsapp'], ['hub/biz/gst', 'gst'], ['hub/biz/notifications', 'notifications'], ['hub/feedback', 'feedback'], ['tickets', 'support'],
  ['account/', 'seller_finance'], ['billing/', 'seller_finance'], ['cod/', 'seller_finance'], ['coupons/', 'seller_finance'], ['kyc', 'seller_finance'], ['agreements/', 'seller_finance'],
];
// POSTs that only read.
const READ_POSTS = new Set(['hub/transport/quote', 'hub/search', 'hub/calendar', 'hub/coupon/check', 'hub/bill/fetch', 'hub/fastag/lookup', 'hub/biz/notifications/read', 'hub/geo/reverse']);
const SECTION_MODULE = { vehicle: 'booking', courier: 'booking', logistics: 'booking', international: 'booking', travel: 'travel', rides: 'travel', recharge: 'recharge', bills: 'recharge', business: 'bizpay' };

const DESK_MODULE = { vehicle: 'booking', courier: 'booking', logistics: 'booking', international: 'booking', services: 'booking', travel: 'travel', pay: 'recharge' };
function moduleOf(path, url) {
  if ((path === 'hub/orders' || path.startsWith('hub/desk')) && url && DESK_MODULE[url.searchParams.get('desk')]) return DESK_MODULE[url.searchParams.get('desk')];
  if (path === 'hub/orders' && url) { const s = url.searchParams.get('section'); if (SECTION_MODULE[s]) return SECTION_MODULE[s]; }
  const hit = PREFIXES.find(([p]) => path.startsWith(p));
  return hit ? hit[1] : 'seller_ship';
}
function ensure(db) {
  if (!db.access) db.access = { roles: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(BUILT_IN).map(([k, r]) => [k, { ...r, builtin: true }])))), overrides: {} };
  return db.access;
}
function permsOf(db, role, userKey) {
  if (role === 'owner') return all('manage');
  const a = ensure(db);
  return { ...(a.roles[role] ? a.roles[role].perms : all('none')), ...(a.overrides[userKey] || {}) };
}
const roleName = (db, role) => (role === 'owner' ? 'Owner' : (ensure(db).roles[role] || {}).name || role);
const validRole = (db, role) => role !== 'owner' && !!ensure(db).roles[role];

// legacy: path prefixes built-in seller roles could already write to.
function check(db, role, userKey, method, path, url, legacy) {
  const mod = moduleOf(path, url);
  if (mod === null) return true;
  const level = permsOf(db, role, userKey)[mod] || 'none';
  if (level === 'none') return false;
  if (level === 'manage' || method === 'GET' || READ_POSTS.has(path)) return true;
  return mod.startsWith('seller') && (legacy || []).some((p) => path.startsWith(p));
}

module.exports = { MODULES, KEYS, ensure, permsOf, roleName, validRole, check };
