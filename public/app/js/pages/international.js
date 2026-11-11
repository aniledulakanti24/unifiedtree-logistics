// International quotes. (The international dashboard is a scope switch on
// the main Dashboard.)
import { api, html, raw, money, esc, formData } from '../core.js';

export async function renderQuote(view) {
  const countries = await api('/international/countries');
  view.innerHTML = html`
    <div class="page-head"><div><h1>International quote</h1><p>Compare export couriers, estimate duties and see the documents you'll need.</p></div></div>
    <div class="grid tools-grid">
      <form class="card" id="qf"><div class="form-grid">
        <label class="field full">Destination country<select class="select" name="country">${raw(countries.data.map((c) => `<option>${esc(c)}</option>`).join(''))}</select></label>
        <label class="field">Weight (kg)<input class="input" name="weight" inputmode="decimal" value="1"></label>
        <label class="field">Declared value (₹)<input class="input" name="value" inputmode="numeric" value="5000"></label>
        <button class="btn btn-primary full">Get quote</button><p class="form-error full" id="qErr"></p>
      </div></form>
      <section class="card" id="qOut"><p class="muted">Pick a country to see rates.</p></section>
    </div>`;
  const form = view.querySelector('#qf');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    view.querySelector('#qErr').textContent = '';
    try {
      const q = await api('/international/quote', { query: formData(form) });
      view.querySelector('#qOut').innerHTML = `<h2>${q.data.length} couriers to ${esc(form.country.value)}</h2>
        <div class="grid">${q.data.map((c) => `<div class="rate-row ${c.courier_id === q.recommended_courier_id ? 'recommended' : ''}"><b>${esc(c.courier_name)}</b>
          <span class="stack"><small class="muted">Transit</small><b>${c.etd_days} days</b></span><span class="stack"><small class="muted">Rating</small><b>${c.rating}★</b></span><span class="stack"><small class="muted">Freight</small><b>${money(c.rate)}</b></span></div>`).join('')}</div>
        <div class="grid grid-2" style="margin-top:16px"><div class="card" style="box-shadow:none;background:var(--bg)"><span class="stat__label">Estimated import duty (buyer pays)</span>
          <div class="stat__value">${money(q.duties_estimate)}</div><small class="muted">${Math.round(q.duty_rate * 100)}% of declared value · indicative only</small></div>
          <div class="card" style="box-shadow:none;background:var(--bg)"><span class="stat__label">Documents needed</span><ul style="margin:6px 0 0;padding-left:18px">${q.documents.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div></div>
        <p class="muted small">To ship, add an order with an international address — <a class="link" href="#/orders/add">Add order</a>.</p>`;
    } catch (err) { view.querySelector('#qErr').textContent = err.message; }
  });
  form.requestSubmit();
}
