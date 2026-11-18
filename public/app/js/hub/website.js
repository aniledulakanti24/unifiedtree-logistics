// Sales channels: connect marketplaces (Amazon, Flipkart, Meesho…), store builders (Shopify,
// WooCommerce…) and your own website. Orders from every channel land in one inbox; ship them with
// the best courier or city vehicle. Shipped orders also appear in All Orders with the channel's order number.
import { api, esc, money, toast, modal, withBusy, dateTime, formData } from '../core.js';
import { payWithApproval } from './wallet-checkout.js';
import { icon } from './icons.js';
import { withFunds, refresh } from './ui.js';

const TABS = [['pending', 'To ship'], ['shipped', 'Shipped'], ['cancelled', 'Cancelled'], ['all', 'All']];
const GROUPS = [['Marketplace', 'Marketplaces', 'Sell on Amazon, Flipkart and others? Ship their seller-fulfilled orders from here.'], ['Store builder', 'Store builders', 'Your Shopify, WooCommerce, Wix or Magento store.'], ['Your website', 'Your own website', 'Any site you built yourself, using our order API.']];
const POLL_MS = 30000;
const endpoint = () => `${location.origin}/v1/public/website/orders`;
const ago = (t) => { const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

// Brand mark: a coloured initial with the company's icon over it when it loads.
export const channelLogo = (p, size = 34) => {
  const name = p.platform_name || p.name || '';
  const color = p.color || '#0e7c66';
  const ini = p.key === 'custom' || p.platform === 'custom' ? icon('globe', Math.round(size * 0.5)) : esc(name.replace(/^My own /, '').slice(0, 1).toUpperCase());
  return `<span class="ch-logo" style="--ch:${esc(color)};width:${size}px;height:${size}px" aria-hidden="true"><i>${ini}</i>${p.domain ? `<img src="https://www.google.com/s2/favicons?domain=${esc(p.domain)}&sz=64" alt="" onload="if (this.naturalWidth < 32) this.remove(); else this.classList.add('ok')" onerror="this.remove()">` : ''}</span>`;
};

// Shown inside All Orders under the "Online stores" service: `head` is the All Orders header and
// service chips, `tabLink(tab)` builds the address for this view's own tabs.
export async function render(view, { query, head, tabLink }) {
  const tab = TABS.some(([k]) => k === query.get('wtab')) ? query.get('wtab') : 'pending';
  let ch = query.get('wch') || '';
  let q = '';
  view.innerHTML = `${head}<div class="skeleton" style="height:360px"></div>`;
  let d = await api('/hub/website');
  let shownKey = null; // a freshly made store key, shown once
  const again = () => render(view, { query, head, tabLink });
  const link = (t, c = ch) => `${tabLink(t)}${c ? `&wch=${encodeURIComponent(c)}` : ''}`;
  const pf = (key) => d.platforms.find((p) => p.key === key) || {};
  const storeOf = (id) => d.stores.find((s) => s.id === id);

  function paint() {
    if (!d.connected) { view.innerHTML = head + emptyScreen(); return; }
    if (ch && !storeOf(ch)) ch = '';
    const inCh = d.orders.filter((o) => !ch || o.store_id === ch);
    const c = ch ? storeOf(ch) : d.counts;
    const needle = q.trim().toLowerCase();
    const list = inCh.filter((o) => (tab === 'all' || o.status === tab) && (!needle || `${o.number} ${o.customer.name} ${o.customer.phone} ${o.address} ${o.items.map((x) => x.name).join(' ')}`.toLowerCase().includes(needle)));
    const custom = d.stores.find((s) => s.platform === 'custom');
    view.innerHTML = `${head}
      <section class="chs">
        <div class="chs__h"><div><h2>Sales channels</h2><small>${d.stores.length} connected · ships from ${esc(d.pickup)} · new demo orders about every ${d.minutes_per_order} min per channel</small></div>
          <div class="chs__tools"><label class="chs-auto" title="Book a partner as soon as an order arrives"><span class="switch"><input type="checkbox" id="auto" ${d.auto_ship ? 'checked' : ''} aria-label="Auto-ship new orders"><i></i></span><span><b>Auto-ship</b><small>${d.ship_by} partner</small></span></label>
          <button class="btn btn-outline btn-sm" id="set" type="button">${icon('sliders', 15)}Settings</button></div></div>
        <div class="chs__row">
          <a class="chs-card chs-card--all ${!ch ? 'on' : ''}" href="${link(tab, '')}"><span class="chs-card__ico">${icon('columns', 18)}</span><span class="grow"><b>All channels</b><small>${d.counts.pending} to ship · ${d.orders.length} orders</small></span></a>
          ${d.stores.map((s) => `<div class="chs-card ${ch === s.id ? 'on' : ''}" style="--ch:${esc(s.color)}"><a class="chs-card__main" href="${link(tab, s.id)}">${channelLogo(s, 36)}<span class="grow"><b>${esc(s.name)}</b><small><i class="chs-live"></i>${esc(s.platform_name)} · synced ${esc(ago(s.last_pull))}</small></span>${s.pending ? `<em class="chs-card__n" title="To ship">${s.pending}</em>` : ''}</a>
            <button class="chs-card__more" type="button" data-menu="${esc(s.id)}" aria-label="Options for ${esc(s.name)}">⋯</button></div>`).join('')}
          <button class="chs-card chs-card--add" type="button" id="add"><span class="chs-card__ico">${icon('plus', 18)}</span><span class="grow"><b>Connect a channel</b><small>Amazon, Flipkart, Shopify…</small></span></button>
        </div>
      </section>
      <div class="ao-kpis chs-kpis">${kpi('cart', 'caution', 'To ship', c.pending, 'Waiting for a pickup', link('pending'))}${kpi('clock', 'trust', 'Orders today', c.today, 'Across ' + (ch ? 'this channel' : 'all channels'), link('all'))}${kpi('cash', 'gold', 'Cash on delivery', money(c.cod_value), 'To collect from buyers', link('pending'))}${kpi('trend', 'go', 'Sales', money(c.sales), 'Orders not cancelled', link('all'))}</div>
      <div class="chs-bar">
        <nav class="tabs tabs--line">${TABS.map(([k, l]) => `<a href="${link(k)}" class="${k === tab ? 'active' : ''}">${l}<span class="count">${k === 'all' ? inCh.length : inCh.filter((o) => o.status === k).length}</span></a>`).join('')}</nav>
        <div class="chs-bar__r"><label class="chs-search">${icon('search', 15)}<input id="wq" type="search" placeholder="Order, buyer, item…" value="${esc(q)}" aria-label="Search channel orders"></label>
          <button class="btn btn-outline btn-sm" id="sim1" type="button">${icon('sparkle', 15)}Simulate order</button></div>
      </div>
      ${tab === 'pending' ? `<div class="bulkbar" id="bulk" hidden><span id="bulkN"></span><button class="btn btn-primary btn-sm" data-bulk="cheapest" type="button">Ship with cheapest</button><button class="btn btn-outline btn-sm" data-bulk="fastest" type="button">Ship with fastest</button></div>` : ''}
      ${list.length ? table(list, tab) : `<div class="card empty chs-none">${icon(tab === 'pending' ? 'check' : 'cart', 28)}<p>${needle ? 'No orders match your search.' : tab === 'pending' ? 'All caught up. New orders from your channels will show up here.' : 'No orders here yet.'}</p></div>`}
      ${custom ? devCard(custom, shownKey) : ''}`;
  }
  const kpi = (ic, tone, label, value, note, href) => `<a class="ao-kpi ao-kpi--${tone}" href="${href}"><span class="ao-kpi__ico">${icon(ic, 18)}</span><span class="ao-kpi__t"><small>${esc(label)}</small><b translate="no">${esc(value)}</b><em>${esc(note)}</em></span></a>`;
  const items = (o) => o.items.map((x) => `${x.qty} × ${x.name}`).join(', ');
  function table(list, t) {
    return `<div class="table-wrap"><table class="orders chs-table"><thead><tr>${t === 'pending' ? '<th><input type="checkbox" class="check" id="all" aria-label="Select all"></th>' : ''}<th>Order</th><th>Customer</th><th>Ship to</th><th>Items</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead><tbody>
      ${list.map((o) => { const p = pf(o.platform_key); return `<tr>${t === 'pending' ? `<td><input type="checkbox" class="check" data-sel="${esc(o.id)}" aria-label="Select ${esc(o.number)}"></td>` : ''}
        <td><div class="chs-ord">${channelLogo({ ...p, platform: o.platform_key, platform_name: o.platform }, 30)}<span class="stack"><b class="mono">${esc(o.number)}</b><small class="muted">${esc(o.platform)} · ${esc(ago(o.at))}${o.simulated ? ' · sample' : ''}</small></span></div></td>
        <td class="stack"><b>${esc(o.customer.name)}</b><small class="muted">${esc(o.customer.phone)}</small></td>
        <td class="wsite-addr">${esc(o.address)}</td>
        <td class="stack wsite-items"><span>${esc(items(o))}</span><small class="muted">${esc(o.weight)} kg packed</small></td>
        <td class="stack"><b translate="no">${esc(money(o.value))}</b>${o.payment === 'cod' ? '<span class="chs-pay chs-pay--cod">Cash on delivery</span>' : '<span class="chs-pay">Paid online</span>'}</td>
        <td class="stack">${statusOf(o)}</td>
        <td>${o.status === 'pending' ? `<div class="row row--nw"><button class="btn btn-primary btn-sm" data-ship="${esc(o.id)}" type="button">${icon('truck', 14)}Ship</button><button class="btn btn-ghost btn-sm" data-cancel="${esc(o.id)}" type="button" aria-label="Cancel ${esc(o.number)}">Cancel</button></div>` : o.status === 'shipped' ? `<a class="btn btn-outline btn-sm" href="#/my/orders/${esc(o.record_id)}">Track</a>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>`;
  }
  function statusOf(o) {
    if (o.status === 'pending') return '<span class="badge badge-amber">To ship</span>';
    if (o.status === 'cancelled') return `<span class="badge badge-red">Cancelled</span><small class="muted">${esc(o.cancel_reason || '')}</small>`;
    const tr = o.tracking || {};
    const tone = tr.group === 'cancelled' ? 'red' : tr.group === 'delivered' ? 'green' : 'blue';
    return `<span class="badge badge-${tone}">${esc(tr.label || 'Booked')}</span><small class="muted">${esc(o.ship.provider)} · ${esc(money(o.ship.amount))}</small>`;
  }

  // ---- connect --------------------------------------------------------------------------
  const grid = () => GROUPS.map(([g, title, sub]) => `<div class="chp-g"><h3>${title}</h3><small>${sub}</small><div class="chp">${d.platforms.filter((p) => p.group === g).map((p) => { const n = d.stores.filter((s) => s.platform === p.key).length; return `<button type="button" class="chp__o" data-pf="${p.key}" style="--ch:${esc(p.color)}">${channelLogo(p, 40)}<b>${esc(p.name)}</b><small>${n ? `<span class="chp__on">${icon('check', 12)}Connected${n > 1 ? ` ×${n}` : ''}</span>` : esc(p.note || (p.key === 'custom' ? 'Via our order API' : 'Orders sync automatically'))}</small></button>`; }).join('')}</div></div>`).join('');
  function emptyScreen() {
    const show = d.platforms.filter((p) => p.domain).slice(0, 10);
    return `<section class="card chs-empty"><div class="chs-empty__art" aria-hidden="true">${show.map((p, i) => `<span style="--i:${i}">${channelLogo(p, 42)}</span>`).join('')}</div>
      <h2>Bring all your online orders into one place</h2><p class="muted">Connect the marketplaces and stores you sell on. Their orders land here and you ship them with the cheapest or fastest partner in one click, paid from your wallet.</p>
      <ul class="chs-empty__pts"><li>${icon('cart', 16)}Amazon, Flipkart, Meesho, Myntra and more</li><li>${icon('truck', 16)}Auto-ship as orders arrive</li><li>${icon('cash', 16)}Track cash on delivery to collect</li></ul></section>
      <section class="card chs-pick">${grid()}<p class="muted small">Demo: connections are simulated. Sample orders start arriving as soon as you connect.</p></section>`;
  }
  function connect(key) {
    const p = pf(key);
    const f = (name, label, ph, extra = '') => `<label class="field full">${label}<input class="input" name="${name}" placeholder="${esc(ph)}" autocomplete="off" ${extra}></label>`;
    modal({
      title: `Connect ${p.name}`,
      body: `<div class="chc">${channelLogo(p, 46)}<div><b>${esc(p.name)}</b><small class="muted block">${esc(p.group)}${p.note ? ` · ${esc(p.note)}` : ''}</small></div></div>
        <form class="form-grid" id="cf" novalidate><input type="hidden" name="platform" value="${esc(p.key)}">
          ${p.needs.includes('seller_id') ? f('seller_id', esc(p.id_label), p.id_hint) : ''}
          ${p.needs.includes('store_url') ? f('store_url', 'Store address', 'https://mystore.com', 'autocomplete="url"') : ''}
          ${p.needs.includes('token') ? `${f('token', 'Access key', `Paste the key from ${p.name}`)}<small class="muted full chc__hint">${icon('info', 13)} ${esc(p.hint)}</small>` : `<small class="muted full chc__hint">${icon('info', 13)} ${esc(p.hint)}. You get the key after connecting.</small>`}
          ${f('name', 'Name in UT Log (optional)', p.group === 'Marketplace' ? `${p.name} India` : 'My Store', 'maxlength="60"')}
        </form>
        <ul class="chc__pts"><li>${icon('check', 14)}New orders sync every few minutes</li><li>${icon('check', 14)}Tracking numbers go back to ${esc(p.key === 'custom' ? 'your site' : p.name)} when you ship</li><li>${icon('shield', 14)}Read orders and update shipping only. We never touch payouts</li></ul>
        <p class="form-error" id="ce" role="alert"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Connect</button>',
      onMount(el, close) {
        el.querySelector('input:not([type=hidden])')?.focus();
        const go = el.querySelector('#go');
        go.addEventListener('click', () => withBusy(go, async () => {
          try {
            const r = await api('/hub/website/connect', { method: 'POST', body: formData(el.querySelector('#cf')) });
            shownKey = r.store_key; d = r; ch = r.store_id; close(true); refresh();
            const s = storeOf(r.store_id);
            toast(`${p.name} connected. ${s ? s.pending : 0} orders are waiting to ship.`);
            location.hash = link('pending', r.store_id);
          } catch (x) { el.querySelector('#ce').textContent = x.message; }
        }));
      },
    });
  }
  function addChannel() {
    modal({ title: 'Connect a sales channel', wide: true, body: `<div class="chs-pick chs-pick--m">${grid()}</div>`, footer: '<button class="btn btn-outline" data-close>Close</button>',
      onMount(el, close) { el.addEventListener('click', (e) => { const b = e.target.closest('[data-pf]'); if (b) { close(true); setTimeout(() => connect(b.dataset.pf), 60); } }); } });
  }
  async function storeMenu(id) {
    const s = storeOf(id);
    modal({
      title: s.name,
      body: `<div class="chc">${channelLogo(s, 46)}<div><b>${esc(s.platform_name)}</b><small class="muted block">${esc(s.account)} · connected ${esc(dateTime(s.connected_at))}</small></div></div>
        <div class="chm"><div><b>${s.pending}</b><small>To ship</small></div><div><b>${s.shipped}</b><small>Shipped</small></div><div><b>${s.today}</b><small>Today</small></div><div><b translate="no">${esc(money(s.sales))}</b><small>Sales</small></div></div>
        <div class="chm-acts"><button class="btn btn-outline btn-sm" id="s1" type="button">${icon('sparkle', 15)}Simulate 1 order</button><button class="btn btn-outline btn-sm" id="s5" type="button">Simulate 5</button></div>
        <hr><p class="small muted">Disconnecting stops new orders from ${esc(s.platform_name)}. Orders already here, and shipments booked for them, stay.</p>
        <p class="form-error" id="e" role="alert"></p>`,
      footer: '<button class="btn btn-danger" id="dis">Disconnect</button><button class="btn btn-outline" data-close>Close</button>',
      onMount(el, close) {
        const sim = (n) => async (e) => withBusy(e.currentTarget, async () => { try { d = await api('/hub/website/simulate', { method: 'POST', body: { count: n, store_id: id } }); close(true); toast(d.auto ? `${d.arrived} new, ${d.auto.shipped} auto-shipped` : `${d.arrived} new ${d.arrived === 1 ? 'order' : 'orders'} from ${s.name}`); refresh(); paint(); } catch (x) { el.querySelector('#e').textContent = x.message; } });
        el.querySelector('#s1').addEventListener('click', sim(1));
        el.querySelector('#s5').addEventListener('click', sim(5));
        el.querySelector('#dis').addEventListener('click', async () => {
          try { d = await api('/hub/website/disconnect', { method: 'POST', body: { store_id: id } }); close(true); toast(`${s.name} disconnected. Its past orders are kept.`); if (ch === id) ch = ''; refresh(); paint(); } catch (x) { el.querySelector('#e').textContent = x.message; }
        });
      },
    });
  }

  // ---- shipping ---------------------------------------------------------------------------
  async function shipOne(id) {
    let qt;
    try { qt = await api('/hub/website/quote', { method: 'POST', body: { id } }); } catch (x) { toast(x.message, true); return; }
    const o = qt.order;
    modal({
      title: `Ship ${o.platform} ${o.number}`, wide: true,
      body: `<p class="notop muted">${esc(o.customer.name)} · ${esc(o.address)} · ${esc(o.weight)} kg · ${o.payment === 'cod' ? `collect ${esc(money(o.value))} on delivery` : 'paid online'}</p>
        <p class="small muted">${qt.section === 'vehicle' ? 'Same city: a bike or auto picks up now and delivers today.' : 'Another city: a courier picks up and delivers by the date shown.'}</p>
        <div class="wsite-opts" role="radiogroup" aria-label="Delivery partner">${qt.options.map((x, i) => `<label class="wsite-opt"><input type="radio" name="opt" value="${esc(x.id)}" ${i === 0 ? 'checked' : ''}><span class="grow"><b>${esc(x.provider)}</b> ${x.tags.map((t) => `<i class="badge ${t === 'Cheapest' ? 'badge-green' : 'badge-orange'}">${esc(t)}</i>`).join(' ')}<small class="muted block">${esc(x.title)} · ★ ${esc(x.rating)} · arrives by ${esc(dateTime(x.eta))}</small></span><span class="stack ta-r"><b translate="no">${esc(money(x.amount))}</b>${x.cod_fee ? `<small class="muted">incl. ${esc(money(x.cod_fee))} COD fee</small>` : ''}</span></label>`).join('')}</div>
        <p class="form-error" id="se" role="alert"></p>`,
      footer: '<button class="btn btn-outline" data-close>Not now</button><button class="btn btn-primary" id="book">Book pickup</button>',
      onMount(el, close) {
        const b = el.querySelector('#book');
        b.addEventListener('click', () => withBusy(b, async () => {
          const sel = el.querySelector('[name=opt]:checked');
          if (!sel) { el.querySelector('#se').textContent = 'Pick a delivery partner.'; return; }
          try {
            const d = await api('/hub/website/ship', { method: 'POST', body: { id, option_id: sel.value, dry_run: true } });
            el.closest('.modal-backdrop').hidden = true;
            const r = await payWithApproval({ path: '/hub/website/ship', body: { id, option_id: sel.value }, total: d.total, info: { title: `Ship ${o.platform} ${o.number}`, payee: 'Delivery partner', icon: 'parcel', tone: 'amber', baseLabel: 'Shipping' } });
            el.closest('.modal-backdrop').hidden = false;
            if (!r) return;
            close(true); toast(`${o.number} booked. Track it under Shipped.`); refresh(); again();
          } catch (x) { if (!x.quiet) el.querySelector('#se').textContent = x.message; }
        }));
      },
    });
  }
  async function shipMany(ids, by) {
    try {
      const d = await api('/hub/website/ship', { method: 'POST', body: { ids, by, dry_run: true } });
      const r = await payWithApproval({ path: '/hub/website/ship', body: { ids, by }, total: d.total, info: { title: `Ship ${d.count} ${d.count === 1 ? 'order' : 'orders'}`, payee: 'Delivery partners', icon: 'parcel', tone: 'amber', baseLabel: 'Shipping' } });
      if (!r) return;
      toast(`${r.shipped} ${r.shipped === 1 ? 'order' : 'orders'} booked for ${money(r.amount)}${r.failed.length ? `. ${r.failed.length} could not be booked: ${r.failed[0].message}` : ''}`, !!r.failed.length);
      refresh(); again();
    } catch (x) { if (!x.quiet) toast(x.message, true); }
  }
  async function cancel(id) {
    const o = d.orders.find((x) => x.id === id);
    const yes = await modal({ title: `Cancel ${o.number}?`, body: `<p class="notop">The order stays in your list as cancelled. Cancel it on ${esc(o.platform)} too, and refund the buyer there if they paid online.</p>`, footer: '<button class="btn btn-outline" data-close>Keep order</button><button class="btn btn-danger" id="y">Cancel order</button>', onMount: (el, close) => el.querySelector('#y').addEventListener('click', () => close(true)) });
    if (!yes) return;
    try { d = await api('/hub/website/cancel', { method: 'POST', body: { id } }); toast(`${o.number} cancelled`); refresh(); paint(); } catch (x) { toast(x.message, true); }
  }
  function settings() {
    modal({
      title: 'Channel settings',
      body: `<form class="form-grid" id="sf" novalidate>
          <label class="field full">Ship from (pickup area)<select class="select" name="pickup">${d.pickups.map((p) => `<option ${p === d.pickup ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
          <label class="field full">When auto-shipping, pick the<select class="select" name="ship_by"><option value="cheapest" ${d.ship_by === 'cheapest' ? 'selected' : ''}>Cheapest partner</option><option value="fastest" ${d.ship_by === 'fastest' ? 'selected' : ''}>Fastest partner</option></select></label></form>
        <p class="small muted">These apply to every connected channel.</p><p class="form-error" id="e" role="alert"></p>`,
      footer: '<button class="btn btn-outline" data-close>Close</button><button class="btn btn-primary" id="save">Save</button>',
      onMount(el, close) {
        const s = el.querySelector('#save');
        s.addEventListener('click', () => withBusy(s, async () => { try { d = await api('/hub/website/settings', { method: 'POST', body: formData(el.querySelector('#sf')) }); close(true); toast('Channel settings saved'); paint(); } catch (x) { el.querySelector('#e').textContent = x.message; } }));
      },
    });
  }

  const picked = () => [...view.querySelectorAll('[data-sel]:checked')].map((c) => c.dataset.sel);
  view.onchange = async (e) => {
    if (e.target.id === 'all') view.querySelectorAll('[data-sel]').forEach((c) => { c.checked = e.target.checked; });
    if (e.target.id === 'all' || e.target.dataset.sel) { const n = picked().length; const bar = view.querySelector('#bulk'); if (bar) { bar.hidden = !n; view.querySelector('#bulkN').textContent = `${n} selected`; } }
    if (e.target.id === 'auto') {
      try { d = await api('/hub/website/settings', { method: 'POST', body: { auto_ship: e.target.checked } }); toast(d.auto_ship ? `Auto-ship on: new orders are booked with the ${d.ship_by} partner.` : 'Auto-ship off'); paint(); } catch (x) { e.target.checked = !e.target.checked; toast(x.message, true); }
    }
  };
  view.oninput = (e) => {
    if (e.target.id !== 'wq') return;
    q = e.target.value; const at = e.target.selectionStart;
    paint(); const i = view.querySelector('#wq'); i.focus(); i.setSelectionRange(at, at);
  };
  view.onclick = async (e) => {
    const t = e.target.closest('[data-ship]'); if (t) { shipOne(t.dataset.ship); return; }
    const c = e.target.closest('[data-cancel]'); if (c) { cancel(c.dataset.cancel); return; }
    const b = e.target.closest('[data-bulk]'); if (b) { shipMany(picked(), b.dataset.bulk); return; }
    const m = e.target.closest('[data-menu]'); if (m) { storeMenu(m.dataset.menu); return; }
    const p = e.target.closest('[data-pf]'); if (p) { connect(p.dataset.pf); return; }
    if (e.target.closest('#add')) { addChannel(); return; }
    if (e.target.closest('#set')) { settings(); return; }
    const sim = e.target.closest('#sim1');
    if (sim) {
      await withBusy(sim, async () => {
        try {
          d = await api('/hub/website/simulate', { method: 'POST', body: { count: 1, store_id: ch || undefined } });
          const o = d.orders[0];
          toast(d.auto ? `New ${o.platform} order ${o.number}, auto-shipped` : `New ${o.platform} order ${o.number}`);
          refresh(); paint();
        } catch (x) { toast(x.message, true); }
      });
      return;
    }
    if (e.target.closest('#rekey')) {
      const yes = await modal({ title: 'Make a new store key?', body: '<p class="notop">The current key stops working straight away. Update your website with the new one.</p>', footer: '<button class="btn btn-outline" data-close>Keep current key</button><button class="btn btn-primary" id="y">Make new key</button>', onMount: (el, close) => el.querySelector('#y').addEventListener('click', () => close(true)) });
      if (!yes) return;
      try { const r = await api('/hub/website/key', { method: 'POST', body: { store_id: e.target.closest('#rekey').dataset.store } }); shownKey = r.store_key; const s = storeOf(r.store_id); if (s) s.key_prefix = r.key_prefix; paint(); toast('New store key made. Copy it now.'); } catch (x) { toast(x.message, true); }
      return;
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Copied'); } catch (x) { toast('Could not copy. Select the text and copy it.', true); } }
  };
  paint();

  // Keep the inbox live while it's open.
  const timer = setInterval(async () => {
    if (!d.connected || document.hidden || document.querySelector('.modal-backdrop, .modal') || document.activeElement?.id === 'wq') return;
    try {
      const r = await api('/hub/website');
      if (r.arrived) { d = r; toast(`${r.arrived} new ${r.arrived === 1 ? 'order' : 'orders'} from your channels`); refresh(); paint(); }
    } catch (x) { /* try again next time */ }
  }, POLL_MS);
  return () => clearInterval(timer);
}

// How the store's own website sends orders in.
function devCard(s, key) {
  const k = key || 'wsk_your_store_key';
  const sample = `curl -X POST ${endpoint()} \\
  -H "Content-Type: application/json" \\
  -H "X-Store-Key: ${k}" \\
  -d '{
    "order_number": "#5001",
    "customer": { "name": "Asha Rao", "phone": "9876543210" },
    "address": "12, 4th Cross, Indiranagar, Bengaluru",
    "pincode": "560038",
    "payment": "cod",
    "items": [{ "name": "Cotton kurta", "sku": "KUR-01", "qty": 1, "price": 899, "weight_kg": 0.4 }]
  }'`;
  return `<details class="card wsite-dev" ${key ? 'open' : ''}><summary><span class="grow"><b>${icon('code', 16)} Send orders from ${esc(s.name)}</b><small class="muted block">Post each new order from your checkout code to UT Log.</small></span>${icon('chevron', 16)}</summary>
    <div class="row"><p class="grow small notop">${key ? '' : `Store key: <span class="mono">${esc(s.key_prefix)}</span> (hidden). Make a new key if you've lost it.`}</p><button class="btn btn-outline btn-sm" id="rekey" data-store="${esc(s.id)}" type="button">New store key</button></div>
    ${key ? `<div class="callout">Your store key: <b class="mono">${esc(key)}</b> <button class="btn btn-outline btn-sm" data-copy="${esc(key)}" type="button">Copy</button><br>Copy it now. For your safety we only show it once.</div>` : ''}
    <pre class="code">${esc(sample)}</pre>
    <p class="muted small">Send a 6-digit <span class="mono">pincode</span> so we can price delivery. <span class="mono">payment</span> is <span class="mono">cod</span> or <span class="mono">prepaid</span>. A repeated <span class="mono">order_number</span> is refused, so retries are safe.</p></details>`;
}
