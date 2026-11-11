// Rate calculator: compare couriers for a lane, weight and payment mode.
import { api, html, raw, money, esc, formData } from '../core.js';

export async function render(view, { query }) {
  view.innerHTML = html`
    <div class="page-head"><div><h1>Rate calculator</h1><p>Compare courier rates and delivery times before you ship.</p></div></div>
    <div class="grid tools-grid">
      <form class="card" id="rateForm"><div class="form-grid">
        <label class="field">Pickup pincode<input class="input" name="pickup" inputmode="numeric" maxlength="6" value="${query.get('pickup') || '560034'}" required></label>
        <label class="field">Delivery pincode<input class="input" name="delivery" inputmode="numeric" maxlength="6" value="${query.get('delivery') || ''}" required></label>
        <label class="field">Weight (kg)<input class="input" name="weight" inputmode="decimal" value="${query.get('weight') || '0.5'}" required></label>
        <label class="field">Declared value (₹)<input class="input" name="value" inputmode="numeric" value="1000"></label>
        <label class="field">Length (cm)<input class="input" name="l" type="number" value="10"></label>
        <label class="field">Breadth (cm)<input class="input" name="b" type="number" value="10"></label>
        <label class="field">Height (cm)<input class="input" name="h" type="number" value="10"></label>
        <label class="field">Payment<select class="select" name="cod"><option value="0">Prepaid</option><option value="1">COD</option></select></label>
        <button class="btn btn-primary full">Calculate</button><p class="form-error full" id="rateErr"></p>
      </div></form>
      <section class="card" id="rates"><p class="muted">Enter a delivery pincode to see rates.</p></section>
    </div>`;
  const form = view.querySelector('#rateForm');
  form.addEventListener('input', (e) => { if (['pickup', 'delivery'].includes(e.target.name)) e.target.value = e.target.value.replace(/\D/g, ''); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const vol = (Number(d.l) * Number(d.b) * Number(d.h)) / 5000;
    const weight = Math.max(Number(d.weight) || 0, vol);
    view.querySelector('#rateErr').textContent = '';
    try {
      const res = await api('/courier/serviceability', { query: { pickup_postcode: d.pickup, delivery_postcode: d.delivery, weight, cod: d.cod, declared_value: d.value } });
      view.querySelector('#rates').innerHTML = `<div class="row" style="margin-bottom:12px"><h2 style="margin:0">${res.data.length} couriers available</h2><span class="spacer"></span><span class="muted small">Chargeable weight ${weight.toFixed(2)} kg · rates incl. GST</span></div>
        <div class="grid">${res.data.map((c) => `<div class="rate-row ${c.courier_id === res.recommended_courier_id ? 'recommended' : ''}">
          <span class="stack"><b>${esc(c.courier_name)}</b>${c.courier_id === res.recommended_courier_id ? '<small class="badge badge-purple" style="width:max-content">Best value</small>' : ''}</span>
          <span class="stack"><small class="muted">Delivery</small><b>${c.etd_days} days</b></span>
          <span class="stack"><small class="muted">Rating</small><b>${c.rating}★</b></span>
          <span class="stack"><small class="muted">Rate</small><b>${money(c.rate)}</b></span></div>`).join('')}</div>`;
    } catch (err) { view.querySelector('#rateErr').textContent = err.message; }
  });
  if (query.get('delivery')) form.requestSubmit();
}
