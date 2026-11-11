// Single order: buyer, package, payment, RTO risk, shipment and timeline.
import { api, html, raw, money, dateTime, date, statusBadge, toast, refreshCounts, esc } from '../core.js';
import { shipOrders } from './ship-modal.js';
import { printDocs } from './manifests.js';

const LABEL = { NEW: 'Order created', ON_HOLD: 'Put on hold', READY_TO_SHIP: 'AWB assigned', PICKUP_SCHEDULED: 'Pickup scheduled', IN_TRANSIT: 'In transit', DELIVERED: 'Delivered', RTO: 'Returned to origin', CANCELLED: 'Cancelled' };

export async function render(view, { id }) {
  const o = await api('/orders/show', { query: { id } });
  const p = o.products[0];
  const open = ['NEW', 'ON_HOLD'].includes(o.status);
  const btn = (show, idAttr, cls, label) => (show ? `<button class="btn ${cls}" id="${idAttr}">${label}</button>` : '');
  view.innerHTML = html`
    <div class="page-head">
      <div><a class="link small" href="#/orders/all">← All orders</a><h1 style="margin-top:6px">Order ${o.channel_order_id} ${statusBadge(o.status)} ${o.type === 'EXCHANGE' ? statusBadge('EXCHANGE') : ''}</h1>
        <p>Created ${dateTime(o.created_at)} · ${o.channel}${o.is_international ? ' · International' : ''}</p></div>
      <div class="row">${raw([
        btn(o.status === 'NEW', 'shipBtn', 'btn-primary', 'Ship now'),
        btn(o.status === 'NEW', 'holdBtn', 'btn-outline', 'Put on hold'),
        btn(o.status === 'ON_HOLD', 'releaseBtn', 'btn-primary', 'Release'),
        btn(open && o.payment_method === 'COD' && !o.payment_link, 'payLinkBtn', 'btn-outline', 'Send prepaid link'),
        btn(!!o.awb, 'labelBtn', 'btn-outline', 'Print label'),
        btn(true, 'invoiceBtn', 'btn-outline', 'Invoice'),
        btn(open && !o.is_international, 'blockBtn', 'btn-outline', 'Block buyer'),
        btn(['NEW', 'READY_TO_SHIP', 'ON_HOLD'].includes(o.status), 'cancelBtn', 'btn-danger', 'Cancel'),
        o.status === 'DELIVERED' && !o.is_international ? `<a class="btn btn-outline" href="#/returns?create=${o.id}">Return</a><a class="btn btn-outline" href="#/exchanges?create=${o.id}">Exchange</a>` : '',
      ].join(''))}</div>
    </div>
    <div class="grid grid-3">
      <section class="card"><h2>Buyer</h2><div class="stack">
        <b>${o.customer.name}</b><span>${o.customer.phone}</span>
        <span class="muted">${o.customer.address}, ${o.customer.city}, ${o.customer.state} ${o.customer.pincode}${o.is_international ? ', ' + o.customer.country : ''}</span>
        <span>Address quality: ${raw(`<span class="badge ${{ Good: 'badge-green', Average: 'badge-amber', Poor: 'badge-red' }[o.address_quality.label]}">${esc(o.address_quality.label)}</span>`)}</span></div></section>
      <section class="card"><h2>Package</h2><div class="stack">
        <span><b>${p.name}</b> × ${p.qty}</span><span class="muted">SKU ${p.sku || '—'}</span>
        <span>${o.package.weight} kg · ${o.package.length}×${o.package.breadth}×${o.package.height} cm</span></div></section>
      <section class="card"><h2>Payment</h2><div class="stack">
        <span class="stat__value">${money(o.total)}</span><span>${o.payment_method}${o.payment_method === 'COD' ? (o.verified ? ' · verified' : ' · unverified') : ''}</span>
        ${o.payment_link ? raw(`<span class="muted small">Prepaid link sent ${dateTime(o.payment_link.sent_at)}</span>`) : ''}
        ${o.confirmation ? raw(`<span class="muted small">COD confirmation via ${esc(o.confirmation.via)}: <b>${esc(o.confirmation.result ? o.confirmation.result.replace('_', ' ').toLowerCase() : 'awaiting reply')}</b></span>`) : ''}
        ${o.freight ? raw(`<span class="muted">Freight charged: ${money(o.freight)}</span>`) : ''}</div></section>
      ${open && !o.is_international ? raw(html`<section class="card"><h2>RTO risk</h2><div class="stack">
        <span>${statusBadge(o.risk.level)} <b>${o.risk.score}</b><span class="muted">/100</span></span>
        ${o.risk.reasons.length ? raw(o.risk.reasons.map((r) => `<span class="muted small">• ${esc(r)}</span>`).join('')) : raw('<span class="muted small">No risk signals.</span>')}
        <a class="link small" href="#/rto">Open RTO Control Tower →</a></div></section>`) : ''}
      <section class="card"><h2>Pickup</h2><div class="stack">
        <b>${o.pickup ? o.pickup.nickname : '—'}</b><span class="muted">${o.pickup ? `${o.pickup.address}, ${o.pickup.city} ${o.pickup.pincode}` : ''}</span>
        ${o.pickup_date ? raw(`<span>Pickup date: <b>${date(o.pickup_date)}</b></span>`) : ''}${o.manifest_id ? raw(`<span class="muted small">Manifest ${esc(o.manifest_id)}</span>`) : ''}</div></section>
      <section class="card ${open && !o.is_international ? '' : 'span-2'}"><h2>Shipment</h2>
        ${o.awb ? raw(html`<div class="row" style="margin-bottom:16px"><span class="stack"><small class="muted">Courier</small><b>${o.courier}</b></span><span class="spacer"></span>
          <span class="stack"><small class="muted">AWB</small><b class="mono">${o.awb}</b></span><span class="spacer"></span><span class="stack"><small class="muted">Expected</small><b>${date(o.edd)}</b></span>
          <a class="btn btn-outline btn-sm" href="/track/?awb=${o.awb}" target="_blank" rel="noopener">Buyer view</a></div>`) : raw('<p class="muted">Not shipped yet.</p>')}
        ${o.ndr ? raw(html`<p class="badge badge-red" style="margin-bottom:12px">Delivery failed: ${o.ndr.reason} (attempt ${o.ndr.attempts})</p>`) : ''}
        ${o.hold_reason ? raw(html`<p class="badge badge-amber" style="margin-bottom:12px">On hold: ${o.hold_reason}</p>`) : ''}
        <ol class="timeline">${raw([...o.timeline].reverse().map((t) => `<li><b>${LABEL[t.status] || t.status}</b><div class="muted small">${dateTime(t.at)}${t.location ? ' · ' + esc(t.location) : ''}</div></li>`).join(''))}</ol>
      </section>
    </div>`;

  const again = () => render(view, { id });
  const act = async (fn, msg) => { try { await fn(); toast(msg); refreshCounts(); again(); } catch (err) { toast(err.message, true); } };
  const on = (sel, fn) => { const el = view.querySelector(sel); if (el) el.addEventListener('click', fn); };
  on('#shipBtn', async () => { if (await shipOrders([o])) again(); });
  on('#holdBtn', () => act(() => api('/orders/hold', { method: 'POST', body: { ids: [o.id], reason: 'Held from order page' } }), 'Order put on hold'));
  on('#releaseBtn', () => act(() => api('/orders/release', { method: 'POST', body: { ids: [o.id] } }), 'Order released'));
  on('#payLinkBtn', () => act(() => api('/orders/convert-prepaid', { method: 'POST', body: { id: o.id } }), 'Prepaid payment link sent to the buyer'));
  on('#cancelBtn', () => act(() => api('/orders/cancel', { method: 'POST', body: { ids: [o.id] } }), 'Order cancelled'));
  on('#blockBtn', () => act(() => api('/settings/blocklist', { method: 'POST', body: { type: 'phone', value: o.customer.phone, reason: `Blocked from order ${o.channel_order_id}` } }), 'Buyer blocked · open orders put on hold'));
  on('#labelBtn', () => printDocs('label', [o.id]));
  on('#invoiceBtn', () => printDocs('invoice', [o.id]));
}
