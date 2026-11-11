// Delivery Promise: estimated delivery dates for the storefront, built from
// the same courier rules, pincode padding, S2D times and holidays.
import { api, html, raw, date, esc, toast, formData } from '../core.js';

export async function render(view) {
  const [p, skus] = await Promise.all([api('/promise/settings'), api('/skus')]);
  view.innerHTML = html`
    <div class="page-head"><div><h1>Delivery Promise</h1><p>Show buyers "Get it by …" on product, cart and checkout pages.</p></div></div>
    <div class="grid grid-2">
      <form class="card" id="pf"><h2>Settings</h2><div class="form-grid">
        <label class="row full"><input type="checkbox" class="check" name="enabled" ${p.enabled ? raw('checked') : ''}> <b>Show delivery dates on my store</b></label>
        <label class="field">Order cut-off hour (24h)<input class="input" name="cutoff_hour" type="number" min="8" max="20" value="${p.cutoff_hour}"></label>
        <label class="field">Buffer days<input class="input" name="buffer_days" type="number" min="0" max="5" value="${p.buffer_days}"></label>
        <div class="full row"><label class="row"><input type="checkbox" class="check" name="product" ${p.show_on.product ? raw('checked') : ''}> Product page</label>
          <label class="row"><input type="checkbox" class="check" name="cart" ${p.show_on.cart ? raw('checked') : ''}> Cart</label>
          <label class="row"><input type="checkbox" class="check" name="checkout" ${p.show_on.checkout ? raw('checked') : ''}> Checkout</label></div>
        <div class="full"><button class="btn btn-primary">Save</button></div></div>
        <p class="muted small">Dates use your <a class="link" href="#/tat">delivery times & holidays</a>, <a class="link" href="#/pincodes">pincode padding</a> and <a class="link" href="#/couriers">courier priority</a>.</p></form>
      <section class="card"><h2>Preview</h2>
        <form class="row" id="pv"><input class="input" name="pincode" placeholder="Buyer pincode" inputmode="numeric" maxlength="6" style="max-width:160px" value="400053">
          <select class="select" name="sku" style="max-width:240px">${raw(skus.data.map((s) => `<option value="${esc(s.sku)}">${esc(s.name)}</option>`).join(''))}</select><button class="btn btn-outline">Check</button></form>
        <div id="widget" style="margin-top:16px"></div>
        <h3 style="margin-top:20px">Embed snippet</h3>
        <pre class="mono small" style="background:var(--bg);padding:12px;border-radius:10px;white-space:pre-wrap;margin:8px 0 0">&lt;div data-ut-promise data-sku="{{product.sku}}"&gt;&lt;/div&gt;
&lt;script src="${esc(location.origin)}/promise-widget.js" async&gt;&lt;/script&gt;</pre>
        <p class="muted small">Snippet is illustrative; the widget script isn't included in this build.</p></section>
    </div>`;
  view.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/promise/settings', { method: 'POST', body: { enabled: f.enabled.checked, cutoff_hour: f.cutoff_hour.value, buffer_days: f.buffer_days.value, show_on: { product: f.product.checked, cart: f.cart.checked, checkout: f.checkout.checked } } });
      toast('Delivery Promise saved');
      view.querySelector('#pv').requestSubmit();
    } catch (err) { toast(err.message, true); }
  });
  view.querySelector('#pv').addEventListener('submit', async (e) => {
    e.preventDefault();
    const w = view.querySelector('#widget');
    try {
      const r = await api('/promise/edd', { query: formData(e.target) });
      w.innerHTML = r.deliverable
        ? `<div style="border:1px solid var(--line);border-radius:12px;padding:14px"><b style="color:var(--green)">🚚 Get it by ${date(r.to)}</b><div class="muted small">Delivery between ${date(r.from)} and ${date(r.to)} to ${esc(r.pincode)} · order before ${r.cutoff_hour}:00 to ship ${date(r.ships_on)} · ${esc(r.zone)} zone</div></div>`
        : `<div style="border:1px solid var(--line);border-radius:12px;padding:14px"><b style="color:var(--red)">Not deliverable to ${esc(r.pincode)}</b><div class="muted small">${esc(r.message)}</div></div>`;
    } catch (err) { w.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; }
  });
  view.querySelector('#pv').requestSubmit();
}
