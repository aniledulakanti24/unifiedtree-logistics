// Overview: today's numbers, orders by stage, the work queue in priority order, today's pickups and
// a quick quote.
import { api, store, html, raw, money, esc } from '../core.js';
import { tile } from '../hub/art.js';
import { icon } from '../hub/icons.js';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
// What each work item is about, for its icon and colour.
const ACT = [[/ship/i, 'truck', 'green'], [/fail|ndr|deliver/i, 'returnbox', 'coral'], [/rto|risk/i, 'shield', 'amber'], [/weight/i, 'scale', 'violet'], [/duplicate/i, 'doc', 'blue'], [/cod|remit/i, 'cash', 'green'], [/pickup/i, 'calendar', 'blue']];
const actOf = (t) => (ACT.find(([re]) => re.test(t)) || [, 'list', 'blue']).slice(1);

export async function render(view) {
  if (!store.state.user) store.set({ user: await api('/auth/login/user') });
  const user = store.state.user;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  view.innerHTML = html`
    <section class="ov-hero" aria-labelledby="ovTitle">
      <div class="ov-hero__t"><p class="ov-eyebrow">${today}</p><h1 id="ovTitle">${greeting()}${user.name ? ', ' + user.name.split(' ')[0] : ''}</h1><p class="ov-sub">Here is your shipping day at a glance.</p></div>
      <dl class="ov-kpis" id="ovKpis">${raw('<div class="skeleton skeleton--dark" style="height:64px"></div>'.repeat(3))}</dl>
    </section>
    <section class="ov-pipe" aria-label="Orders by stage"><div class="ov-pipe__row" id="ovStops">${raw('<div class="skeleton" style="height:120px"></div>'.repeat(5))}</div><div class="ov-exits" id="ovExits"></div></section>
    <div class="ov-grid">
      <section class="card ov-queue" aria-labelledby="queueTitle"><div class="ov-sec__h"><h2 id="queueTitle">Next up</h2><small>In order of what matters most</small></div><div id="queue"><div class="skeleton" style="height:96px"></div></div></section>
      <div class="ov-side">
        <section class="card ov-pick" aria-labelledby="pickupTitle">
          <div class="ov-sec__h"><h2 id="pickupTitle">${raw(icon('truck', 17))}Pickups</h2><div class="seg" id="pickupSeg"><button aria-pressed="true" data-when="today">Today</button><button aria-pressed="false" data-when="tomorrow">Tomorrow</button></div></div>
          <div id="pickups"></div>
        </section>
        <section class="card ov-quote" aria-labelledby="quoteTitle">
          <div class="ov-sec__h"><h2 id="quoteTitle">${raw(icon('rupee', 17))}Quick quote</h2><small>Every courier, one tap</small></div>
          <form class="ov-qf" id="quickRate">
            <label><span>From</span><input class="input" name="pickup" inputmode="numeric" maxlength="6" value="560034" required></label>
            <span class="ov-qf__arrow" aria-hidden="true">${raw(icon('chevron', 16))}</span>
            <label><span>To</span><input class="input" name="delivery" inputmode="numeric" maxlength="6" placeholder="110017" required></label>
            <label class="ov-qf__kg"><span>Kg</span><input class="input" name="weight" inputmode="decimal" value="0.5" required></label>
            <button class="btn btn-primary">${raw(icon('search', 16))}Get rates</button>
          </form>
          <div id="quickRateOut" aria-live="polite"></div>
        </section>
      </div>
    </div>`;

  const [counts, actions] = await Promise.all([api('/homepage/order-count-details'), api('/homepage/next-best-actions')]);
  store.set({ counts });

  view.querySelector('#ovKpis').innerHTML = [
    ['Orders today', counts.orders_today, 'orders', '#/orders'], ['Revenue today', money(counts.revenue_today), 'rupee', '#/dashboard'], ['Wallet', money(counts.wallet_balance), 'wallet', '#/wallet'],
  ].map(([label, value, ic, href]) => `<a class="ov-kpi" href="${href}"><span class="ov-kpi__ico">${tile(ic, 'green').value}</span><span><dt>${label}</dt><dd translate="no">${esc(value)}</dd></span></a>`).join('');

  const stops = [['new', 'New', counts.new, 'cart', 'blue', 'Waiting to be packed'], ['readytoship', 'Ready', counts.ready_to_ship, 'parcel', 'amber', 'Packed, need a courier'], ['pickup', 'Pickup', counts.pickup_scheduled, 'calendar', 'violet', 'Courier booked'],
    ['intransit', 'In transit', counts.in_transit, 'truck', 'coral', 'On the road'], ['delivered', 'Delivered', counts.delivered, 'home', 'green', 'Reached the buyer']];
  const total = Math.max(1, stops.reduce((t, s) => t + (s[2] || 0), 0));
  view.querySelector('#ovStops').innerHTML = stops.map(([tab, label, n, ic, tone, hint], i) => `<a class="ov-stop ov-stop--${tone}" href="#/orders/${tab}" aria-label="${plural(n, 'order')}: ${label}">
      <span class="ov-stop__top">${tile(ic, tone).value}<b>${n}</b></span><strong>${label}</strong><small>${hint}</small><i class="ov-stop__bar"><i style="width:${Math.round(((n || 0) / total) * 100)}%"></i></i>${i < stops.length - 1 ? `<span class="ov-stop__next" aria-hidden="true">${icon('chevron', 14)}</span>` : ''}</a>`).join('');
  view.querySelector('#ovExits').innerHTML = [['rto', 'Coming back (RTO)', counts.rto, 'returnbox'], ['onhold', 'On hold', counts.on_hold, 'alert']]
    .map(([tab, label, n, ic]) => `<a class="ov-exit ${n ? 'is-on' : ''}" href="#/orders/${tab}">${icon(ic, 15)}${label} <b>${n}</b></a>`).join('');

  view.querySelector('#queue').innerHTML = actions.data.length
    ? `<ol class="ov-q">${actions.data.map((a, i) => { const [ic, tone] = actOf(a.title + ' ' + a.path); return `<li class="ov-t ${i === 0 ? 'ov-t--top' : ''}">
        ${tile(ic, tone).value}<div class="grow"><b>${esc(a.title)}</b><small>${i === 0 ? 'Do this first' : `${a.count} to look at`}</small></div><span class="ov-t__n">${a.count}</span>
        <a class="btn ${i === 0 ? 'btn-primary' : 'btn-outline'} btn-sm" href="${esc(a.path)}">${esc(a.cta)}${icon('chevron', 14)}</a></li>`; }).join('')}</ol>`
    : `<div class="ov-clear">${tile('shield', 'green').value}<b>All clear</b><small>Nothing needs you right now.</small></div>`;

  async function loadPickups(when) {
    const el = view.querySelector('#pickups');
    const res = await api('/shipments/getpickup', { query: { from: when } });
    el.innerHTML = res.data.length
      ? `<ul class="ov-pk">${res.data.map((p) => `<li><span class="ov-pk__av">${esc(initials(p.courier))}</span><div class="grow"><b>${esc(p.courier)}</b><small>${icon('clock', 12)}${esc(p.slot)}</small></div><span class="ov-pk__n">${plural(p.count, 'parcel')}</span></li>`).join('')}</ul>`
      : `<div class="ov-clear ov-clear--sm">${tile('calendar', 'blue').value}<small>No pickups ${when}.</small></div>`;
  }
  view.querySelector('#pickupSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    view.querySelectorAll('#pickupSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    loadPickups(b.dataset.when);
  });
  loadPickups('today');

  view.querySelector('#quickRate').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const out = view.querySelector('#quickRateOut');
    try {
      const res = await api('/courier/serviceability', { query: { pickup_postcode: f.pickup.value, delivery_postcode: f.delivery.value, weight: f.weight.value } });
      out.innerHTML = `<ul class="ov-rates">${res.data.slice(0, 3).map((r, i) => `<li class="${i === 0 ? 'best' : ''}"><span class="ov-pk__av">${esc(initials(r.courier_name))}</span><div class="grow"><b>${esc(r.courier_name)}</b><small>${esc(r.etd_days)} day${r.etd_days === 1 ? '' : 's'}</small></div>${i === 0 ? '<em>Cheapest</em>' : ''}<b translate="no">${money(r.rate)}</b></li>`).join('')}</ul>
        <a class="link small" href="#/tools?pickup=${encodeURIComponent(f.pickup.value)}&delivery=${encodeURIComponent(f.delivery.value)}&weight=${encodeURIComponent(f.weight.value)}">See all ${res.data.length} options</a>`;
    } catch (err) { out.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; }
  });
}
