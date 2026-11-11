// Overview: today's numbers, orders by stage, the work queue in priority
// order, today's pickups and a quick quote.
import { api, store, html, raw, money, esc } from '../core.js';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function render(view) {
  if (!store.state.user) store.set({ user: await api('/auth/login/user') });
  const user = store.state.user;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  view.innerHTML = html`
    <section class="dispatch" aria-labelledby="dispatchTitle">
      <div class="dispatch__top">
        <div>
          <p class="dispatch__eyebrow">${today} · ${greeting()}${user.name ? ', ' + user.name.split(' ')[0] : ''}</p>
          <h1 id="dispatchTitle">Overview</h1>
        </div>
        <dl class="dispatch__stats" id="dispatchStats"></dl>
      </div>
      <div class="road">
        <div class="road__stops" id="roadStops">${raw('<div class="skeleton skeleton--dark"></div>'.repeat(5))}</div>
        <div class="road__exits" id="roadExits"></div>
      </div>
    </section>

    <div class="desk">
      <section class="queue" aria-labelledby="queueTitle">
        <h2 id="queueTitle">Next up</h2>
        <div id="queue"><div class="skeleton" style="height:96px"></div></div>
      </section>
      <div class="desk__side">
        <section class="pickupBoard" aria-labelledby="pickupTitle">
          <div class="pickupBoard__head">
            <h2 id="pickupTitle">Pickups</h2>
            <div class="seg" id="pickupSeg"><button aria-pressed="true" data-when="today">Today</button><button aria-pressed="false" data-when="tomorrow">Tomorrow</button></div>
          </div>
          <div id="pickups"></div>
        </section>
        <section class="card" aria-labelledby="quoteTitle">
          <h2 id="quoteTitle">Quick quote</h2>
          <form class="quickQuote" id="quickRate">
            <label class="field">From<input class="input" name="pickup" inputmode="numeric" maxlength="6" value="560034" required></label>
            <label class="field">To<input class="input" name="delivery" inputmode="numeric" maxlength="6" placeholder="110017" required></label>
            <label class="field">Kg<input class="input" name="weight" inputmode="decimal" value="0.5" required></label>
            <button class="btn btn-primary">Get rates</button>
          </form>
          <div id="quickRateOut" aria-live="polite"></div>
        </section>
      </div>
    </div>`;

  const [counts, actions] = await Promise.all([api('/homepage/order-count-details'), api('/homepage/next-best-actions')]);
  store.set({ counts });

  view.querySelector('#dispatchStats').innerHTML = [
    ['Orders today', counts.orders_today], ['Revenue today', money(counts.revenue_today)], ['Wallet', money(counts.wallet_balance)],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('');

  const stops = [['new', 'New', counts.new], ['readytoship', 'Ready', counts.ready_to_ship], ['pickup', 'Pickup', counts.pickup_scheduled],
    ['intransit', 'In transit', counts.in_transit], ['delivered', 'Delivered', counts.delivered]];
  view.querySelector('#roadStops').innerHTML = stops.map(([tab, label, n]) => {
    return `<a class="stop" href="#/orders/${tab}" aria-label="${plural(n, 'order')}: ${label}"><b>${n}</b><span>${label}</span></a>`;
  }).join('');
  view.querySelector('#roadExits').innerHTML = [['rto', 'Coming back (RTO)', counts.rto], ['onhold', 'On hold', counts.on_hold]]
    .map(([tab, label, n]) => `<a href="#/orders/${tab}">${label} <b>${n}</b></a>`).join('');

  view.querySelector('#queue').innerHTML = actions.data.length
    ? `<ol class="queue__list">${actions.data.map((a, i) => `<li class="ticket ${i === 0 ? 'ticket--top' : ''}">
        <b class="ticket__count">${a.count}</b>
        <span class="ticket__title">${esc(a.title)}</span>
        <a class="btn ${i === 0 ? 'btn-primary' : 'btn-outline'} btn-sm" href="${esc(a.path)}">${esc(a.cta)}</a></li>`).join('')}</ol>`
    : '<div class="empty"><p>Nothing needs you right now.</p></div>';

  async function loadPickups(when) {
    const el = view.querySelector('#pickups');
    const res = await api('/shipments/getpickup', { query: { from: when } });
    el.innerHTML = res.data.length
      ? `<ul class="pickupBoard__rows">${res.data.map((p) => `<li><span>${esc(p.courier)}</span><small>${esc(p.slot)}</small><b>${plural(p.count, 'parcel')}</b></li>`).join('')}</ul>`
      : `<p class="pickupBoard__none">No pickups ${when}.</p>`;
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
      out.innerHTML = `<ul class="quoteRows">${res.data.slice(0, 3).map((r) => `<li><span>${esc(r.courier_name)}</span><small>${esc(r.etd_days)} days</small><b>${money(r.rate)}</b></li>`).join('')}</ul>
        <a class="link small" href="#/tools?pickup=${encodeURIComponent(f.pickup.value)}&delivery=${encodeURIComponent(f.delivery.value)}&weight=${encodeURIComponent(f.weight.value)}">See all ${res.data.length} options</a>`;
    } catch (err) { out.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; }
  });
}
