// Each service is a workspace ("desk") with its own orders, returns and cancellations.
'use strict';

const SERVICE_KINDS = new Set(['movers', 'warehouse', 'coldchain', 'customs', 'rental', 'packaging']);
const DESKS = {
  vehicle: (r) => r.section === 'vehicle',
  courier: (r) => r.section === 'courier',
  logistics: (r) => r.section === 'logistics' && !SERVICE_KINDS.has(r.kind),
  international: (r) => r.section === 'international',
  services: (r) => SERVICE_KINDS.has(r.kind),
  travel: (r) => ['travel', 'rides'].includes(r.section),
  pay: (r) => ['recharge', 'bills', 'business'].includes(r.section),
};

// Sub-services inside each desk.
const ttl = (r) => r.title || '';
const kg = (r) => Number(r.weight) || 0;
const SUBS = {
  vehicle: { two: (r) => /two-wheeler/i.test(ttl(r)), three: (r) => /three-wheeler/i.test(ttl(r)), mini: (r) => /mini truck/i.test(ttl(r)) },
  courier: { small: (r) => kg(r) < 5, parcel: (r) => kg(r) >= 5 && kg(r) < 30, heavy: (r) => kg(r) >= 30 },
  logistics: { ftl: (r) => /^full truck/i.test(ttl(r)), ptl: (r) => !/^full truck/i.test(ttl(r)) },
  international: { express: (r) => /express/i.test(ttl(r)), air: (r) => /air freight/i.test(ttl(r)), sea: (r) => /sea|ocean/i.test(ttl(r)) },
  services: Object.fromEntries([...SERVICE_KINDS].map((k) => [k, (r) => r.kind === k])),
  travel: { flights: (r) => r.kind === 'flight' || /^flight/i.test(ttl(r)), trains: (r) => r.kind === 'train' || /^train/i.test(ttl(r)), buses: (r) => r.kind === 'bus' || /^bus/i.test(ttl(r)), hotels: (r) => r.kind === 'hotel', stays: (r) => r.kind === 'stay', rides: (r) => r.section === 'rides' },
  pay: { mobile: (r) => r.kind === 'mobile' || /^mobile/i.test(ttl(r)), fastag: (r) => r.kind === 'fastag' || /fastag/i.test(ttl(r)), bills: (r) => r.section === 'bills' && !['transfer', 'voucher', 'gold'].includes(r.kind), transfer: (r) => r.kind === 'transfer', voucher: (r) => r.kind === 'voucher', gold: (r) => r.kind === 'gold', business: (r) => r.section === 'business' },
};
function pick(list, desk, sub) {
  const f = DESKS[desk]; const g = f && SUBS[desk] && SUBS[desk][sub];
  return list.filter((r) => (!f || f(r)) && (!g || g(r)));
}
function settingsOf(h, desk) {
  if (!h.deskSettings) h.deskSettings = {};
  if (!h.deskSettings[desk]) h.deskSettings[desk] = { sort: 'best', pay_mode: 'prepaid', pickup: '', blocked: [], seen: [], delay_hours: 2, stuck_hours: 4 };
  return h.deskSettings[desk];
}

// Finer than an order's group, for the status tabs. Takes a record already passed through live().
function stageOf(r) {
  if (r.status === 'CANCELLED') return 'cancelled';
  if (r.claim && /lost|damag/i.test(r.claim.type || '')) return 'lost';
  if (r.group === 'delivered' || r.group === 'transit') return r.group;
  if (r.status === 'PAY_LATER') return 'paylater';
  if (r.status === 'PICKUP_SCHEDULED' || (r.group === 'new' && r.scheduled_for)) return 'scheduled';
  return r.group === 'assigned' ? 'assigned' : 'new';
}
const cancellable = (r) => ['new', 'assigned'].includes(r.group) && !r.sample && r.status !== 'PAY_LATER' && r.status !== 'CANCELLED';
const refundOf = (r) => (r.refund != null ? r.refund : r.pay_mode === 'prepaid' ? r.amount : 0);

function stageCounts(list) {
  const out = { all: 0, paylater: 0, new: 0, scheduled: 0, assigned: 0, transit: 0, delivered: 0, lost: 0, cancelled: 0, cancellable: 0 };
  list.forEach((r) => { const s = stageOf(r); out[s]++; if (s !== 'cancelled') out.all++; if (cancellable(r)) out.cancellable++; });
  return out;
}

module.exports = { DESKS, SUBS, pick, settingsOf, stageOf, cancellable, refundOf, stageCounts };
