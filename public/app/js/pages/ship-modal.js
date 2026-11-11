// "Ship now" flow: pick a courier for one or more new orders, then book.
// Rates come from the order itself so pincode, SKU and courier rules apply.
import { api, modal, money, esc, toast, date, refreshCounts } from '../core.js';

export async function shipOrders(orders) {
  const first = orders[0];
  let quote;
  try { quote = await api('/orders/rates', { query: { id: first.id } }); }
  catch (err) { toast(err.message, true); return null; }
  const rows = quote.data.map((c) => `
    <label class="rate-row ${c.courier_id === quote.recommended_courier_id ? 'recommended' : ''}">
      <span class="row"><input type="radio" name="courier" value="${c.courier_id}" ${c.courier_id === quote.recommended_courier_id ? 'checked' : ''}>
        <span class="stack"><b>${esc(c.courier_name)}</b>${c.courier_id === quote.recommended_courier_id ? '<small class="badge badge-purple" style="width:max-content">Top pick by your priority</small>' : ''}</span></span>
      <span class="stack"><small class="muted">Delivery</small><b>${c.etd_days} days</b></span>
      <span class="stack"><small class="muted">Rating</small><b>${c.rating}★</b></span>
      <span class="stack"><small class="muted">Rate</small><b>${money(c.rate)}</b></span>
    </label>`).join('');
  const summary = orders.length === 1
    ? `Order <b>${esc(first.channel_order_id)}</b> to ${esc(first.customer.city)} (${esc(first.customer.pincode)}), ${first.package.weight} kg, ${esc(first.payment_method)}`
    : `<b>${orders.length} orders</b> — rates shown for the first order; each order is priced on its own lane and weight. If the chosen courier can't serve an order, its top courier is used.`;

  return modal({
    title: 'Select courier partner',
    wide: true,
    body: `<p class="muted" style="margin:0">${summary}</p>
      <p class="small muted" style="margin:0">Zone: <b>${esc(quote.zone)}</b> · Pickup: <b>${date(quote.pickup_date)}</b>${quote.padding_days ? ` · +${quote.padding_days} day pincode padding` : ''}</p>
      <div class="grid">${rows}</div><p class="form-error" id="shipErr"></p>`,
    footer: '<a class="btn btn-outline" href="#/couriers" data-close>Courier rules</a><span class="spacer"></span><button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="shipGo">Ship now</button>',
    onMount(el, close) {
      el.querySelector('#shipGo').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const courier = el.querySelector('input[name=courier]:checked').value;
        btn.disabled = true; btn.textContent = 'Booking…';
        try {
          const res = await api('/orders/ship', { method: 'POST', body: { order_ids: orders.map((o) => o.id), courier_id: Number(courier) } });
          toast(`${res.shipped.length} shipment${res.shipped.length > 1 ? 's' : ''} booked${res.failed.length ? `, ${res.failed.length} failed (${res.failed[0].reason})` : ` · AWB ${res.shipped[0].awb}`}`, !!res.failed.length);
          refreshCounts();
          close(res);
        } catch (err) {
          el.querySelector('#shipErr').innerHTML = esc(err.message) + (err.status === 402 ? ' <a class="link" href="#/billing" data-close>Recharge wallet</a>' : '');
          btn.disabled = false; btn.textContent = 'Ship now';
        }
      });
    },
  });
}
