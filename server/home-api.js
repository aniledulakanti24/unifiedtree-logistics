// Dashboard live panels: where shipments are in the pipeline, what is on the road right now,
// which partners you ship with most, and the connected website store. Read-only.
'use strict';
const desks = require('./desks');

const TRANSPORT = ['vehicle', 'courier', 'logistics', 'international'];
const STAGES = [['booked', 'Booked'], ['pickup', 'Pickup'], ['transit', 'In transit'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];
const stageKey = (r) => { const s = desks.stageOf(r); return s === 'assigned' ? 'pickup' : ['transit', 'delivered', 'cancelled'].includes(s) ? s : s === 'lost' ? 'transit' : 'booked'; };

module.exports = function register(routes, { send }, ctx, hubCtx) {
  const { day } = ctx;
  const { hub, live } = hubCtx;

  // Orders that need an OTP right now, for the floating card: the pickup OTP while the driver is
  // assigned or coming, and the delivery OTP once it is out for delivery or about to arrive.
  routes['GET /v1/hub/otp-orders'] = hub(({ res, h }) => {
    const now = h.records.filter((r) => TRANSPORT.includes(r.section) && r.booking_id && r.status !== 'CANCELLED').slice(0, 60).map(live);
    const list = now.map((r) => {
      if (!r.otp || r.status === 'CANCELLED' || r.group === 'delivered') return null;
      const pickup = !!r.otp.pickup;
      if (pickup && !['ASSIGNED', 'ARRIVING'].includes(r.status)) return null; // no driver yet: nothing to share
      if (!pickup && !(r.status === 'OUT_FOR_DELIVERY' || (r.remaining_min != null && r.remaining_min <= 20))) return null;
      const [from, to] = String(r.sub || '').split(/\s*→\s*/);
      return { id: r.id, section: r.section, title: r.title, provider: r.provider, kind: pickup ? 'pickup' : 'delivery', otp: pickup ? r.otp.pickup : r.otp.delivery,
        label: r.label, status: r.status, eta_min: r.remaining_min, from: from || '', to: to || '', reference: r.reference || '',
        driver: r.driver ? { name: r.driver.name, phone: r.driver.phone, vehicle_no: r.driver.vehicle_no, rating: r.driver.rating } : null,
        share_with: pickup ? 'driver at pickup' : (r.receiver && r.receiver.name) || 'the receiver' };
    }).filter(Boolean);
    send(res, 200, { data: list });
  });

  function period(url) {
    const p = (v, end) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3] + (end ? 1 : 0)).getTime() : NaN; };
    const a = p(url.searchParams.get('from')); const b = p(url.searchParams.get('to'), true);
    if (a < b) return [a, b];
    const days = Math.max(1, Math.min(366, Number(url.searchParams.get('days')) || 30));
    return [Date.now() - days * day, Infinity];
  }

  routes['GET /v1/hub/overview/live'] = hub(({ res, url, h }) => {
    const [since, until] = period(url);
    const all = h.records.filter((r) => TRANSPORT.includes(r.section)).map(live);
    const inPeriod = all.filter((r) => { const t = Date.parse(r.at); return t >= since && t < until; });

    // Pipeline: every shipment booked in the period, by where it is now.
    const counts = Object.fromEntries(STAGES.map(([k]) => [k, 0]));
    inPeriod.forEach((r) => { counts[stageKey(r)]++; });
    const pipeline = STAGES.map(([key, label]) => ({ key, label, count: counts[key] }));

    // On the road now, whatever the period: closest to arriving first.
    const moving = all.filter((r) => ['new', 'assigned', 'transit'].includes(r.group) && r.status !== 'CANCELLED')
      .sort((a, b) => (a.remaining_min == null ? 1e9 : a.remaining_min) - (b.remaining_min == null ? 1e9 : b.remaining_min));
    const active = moving.slice(0, 6).map((r) => ({ id: r.id, section: r.section, title: r.title, provider: r.provider, sub: r.sub, reference: r.reference || '', label: r.label, stage: stageKey(r),
      progress: r.progress != null ? r.progress : 0, remaining_min: r.remaining_min, promised_by: r.promised_by || null, driver: r.driver ? { name: r.driver.name, vehicle_no: r.driver.vehicle_no } : null, booking_id: r.booking_id || null }));

    // Recently delivered, to round out the live panel when little is moving.
    const delivered = all.filter((r) => r.group === 'delivered' && !r.sample).sort((a, b) => b.at.localeCompare(a.at)).slice(0, Math.max(0, 4 - active.length))
      .map((r) => ({ id: r.id, section: r.section, title: r.title, provider: r.provider, sub: r.sub, reference: r.reference || '', at: r.at, amount: r.amount }));

    // Partners you ship with most in the period.
    const paid = inPeriod.filter((r) => r.status !== 'CANCELLED');
    const total = paid.reduce((s, r) => s + r.amount, 0);
    const by = {};
    paid.forEach((r) => { const p = by[r.provider] || (by[r.provider] = { name: r.provider, section: r.section, orders: 0, spend: 0, delivered: 0 }); p.orders++; p.spend += r.amount; if (r.group === 'delivered') p.delivered++; });
    const partners = Object.values(by).sort((a, b) => b.orders - a.orders || b.spend - a.spend).slice(0, 5)
      .map((p) => ({ ...p, avg: Math.round(p.spend / p.orders), share: total ? Math.round((p.spend / total) * 100) : 0 }));

    const w = h.website;
    const chans = w ? (w.stores || (w.connected ? [{ name: w.name, platform: w.platform }] : [])) : [];
    const store = chans.length ? {
      connected: true, name: chans.length > 1 ? `${chans.length} sales channels` : chans[0].name, platform: chans[0].platform, channels: chans.map((c) => ({ name: c.name, platform: c.platform })), auto_ship: !!w.auto_ship,
      pending: w.orders.filter((o) => o.status === 'pending').length,
      cod_value: w.orders.filter((o) => o.status === 'pending' && o.payment === 'cod').reduce((s, o) => s + o.value, 0),
      today: w.orders.filter((o) => Date.parse(o.at) >= new Date().setHours(0, 0, 0, 0)).length,
      shipped: w.orders.filter((o) => o.status === 'shipped').length,
    } : { connected: false };

    send(res, 200, { pipeline, total: inPeriod.length, moving: moving.length, active, delivered, partners, store });
  });
};
