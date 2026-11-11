// Add a single order manually (domestic or international), optionally from
// a catalog SKU so weight and box size fill in automatically.
import { api, html, raw, esc, formData, toast, withBusy, refreshCounts } from '../core.js';

export async function render(view) {
  const [pickup, skus, countries] = await Promise.all([api('/settings/company/pickup'), api('/skus'), api('/international/countries')]);
  view.innerHTML = html`
    <div class="page-head"><div><a class="link small" href="#/orders/new">← Orders</a><h1 style="margin-top:6px">Add order</h1></div></div>
    <form class="grid grid-2" id="orderForm" novalidate>
      <section class="card"><h2>Buyer details</h2><div class="form-grid">
        <label class="field">Full name<input class="input" name="name" required autocomplete="off"></label>
        <label class="field">Mobile number<input class="input" name="phone" inputmode="tel" maxlength="15" required></label>
        <label class="field full">Address<input class="input" name="address" required placeholder="House/flat no., street, area, landmark"></label>
        <label class="field">Country<select class="select" name="country"><option>India</option>${raw(countries.data.map((c) => `<option>${esc(c)}</option>`).join(''))}</select></label>
        <label class="field"><span id="pinLabel">Pincode</span><input class="input" name="pincode" maxlength="10" required></label>
        <label class="field">City<input class="input" name="city" required></label>
        <label class="field">State<input class="input" name="state"></label>
        <label class="field full">Email (optional)<input class="input" name="email" type="email"></label>
      </div><p class="muted small" id="addrHint"></p></section>
      <section class="card"><h2>Order details</h2><div class="form-grid">
        <label class="field full">From catalog<select class="select" name="catalog"><option value="">— Enter product manually —</option>${raw(skus.data.map((s) => `<option value="${esc(s.sku)}">${esc(s.name)} (${esc(s.sku)})</option>`).join(''))}</select></label>
        <label class="field full">Product name<input class="input" name="pname" required></label>
        <label class="field">SKU<input class="input" name="sku"></label>
        <label class="field">Unit price (₹)<input class="input" name="price" inputmode="decimal" required></label>
        <label class="field">Quantity<input class="input" name="qty" type="number" min="1" value="1" required></label>
        <label class="field">Payment<select class="select" name="payment_method"><option>Prepaid</option><option>COD</option></select></label>
        <label class="field">Order ID (optional)<input class="input" name="order_id" placeholder="Auto-generated"></label>
        <label class="field">Pickup address<select class="select" name="pickup_address_id">${raw(pickup.data.map((p) => `<option value="${p.id}">${esc(p.nickname)}</option>`).join(''))}</select></label>
      </div></section>
      <section class="card span-2"><h2>Package</h2><div class="row">
        <label class="field">Dead weight (kg)<input class="input" name="weight" inputmode="decimal" value="0.5" style="width:140px"></label>
        <label class="field">Length (cm)<input class="input" name="length" type="number" value="10" style="width:120px"></label>
        <label class="field">Breadth (cm)<input class="input" name="breadth" type="number" value="10" style="width:120px"></label>
        <label class="field">Height (cm)<input class="input" name="height" type="number" value="10" style="width:120px"></label>
        <span class="muted small" id="volWeight"></span>
      </div></section>
      <div class="span-2 row"><p class="form-error" id="formErr"></p><span class="spacer"></span>
        <button class="btn btn-outline" type="submit" data-then="list">Add order</button>
        <button class="btn btn-primary" type="submit" data-then="ship">Add & ship now</button></div>
    </form>`;

  const form = view.querySelector('#orderForm');
  const f = form.elements;
  const vol = () => {
    const v = (Number(f.length.value) * Number(f.breadth.value) * Number(f.height.value)) / 5000;
    view.querySelector('#volWeight').textContent = `Volumetric weight ${v.toFixed(2)} kg · you're charged for the higher of the two.`;
  };
  const intl = () => f.country.value !== 'India';
  form.addEventListener('input', (e) => {
    if (e.target.name === 'phone' && !intl()) e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    if (e.target.name === 'pincode' && !intl()) e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (['length', 'breadth', 'height'].includes(e.target.name)) vol();
    if (e.target.name === 'address') {
      const a = e.target.value;
      view.querySelector('#addrHint').textContent = a && (!/\d/.test(a) || a.length < 15) ? 'Tip: add a house number and street — incomplete addresses are the top cause of RTO.' : '';
    }
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'country') {
      view.querySelector('#pinLabel').textContent = intl() ? 'Postal code' : 'Pincode';
      f.payment_method.value = 'Prepaid';
      f.payment_method.querySelector('option:last-child').disabled = intl();
    }
    if (e.target.name === 'catalog') {
      const s = skus.data.find((x) => x.sku === e.target.value);
      if (!s) return;
      Object.assign(f.pname, { value: s.name }); f.sku.value = s.sku; f.price.value = s.price;
      f.weight.value = s.weight; f.length.value = s.length; f.breadth.value = s.breadth; f.height.value = s.height;
      vol();
    }
  });
  vol();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.submitter;
    const d = formData(form);
    view.querySelector('#formErr').textContent = '';
    withBusy(btn, async () => {
      try {
        const res = await api('/orders/create', { method: 'POST', body: {
          order_id: d.order_id, payment_method: d.payment_method, pickup_address_id: d.pickup_address_id,
          customer: { name: d.name, phone: d.phone, email: d.email, address: d.address, city: d.city, state: d.state, pincode: d.pincode, country: d.country },
          product: { name: d.pname, sku: d.sku, price: d.price, qty: d.qty },
          weight: d.weight, length: d.length, breadth: d.breadth, height: d.height,
        } });
        toast('Order added');
        refreshCounts();
        location.hash = btn.dataset.then === 'ship' ? `#/orders/view/${res.order_id}` : `#/orders/new${intl() ? '?is_international=1' : ''}`;
      } catch (err) { view.querySelector('#formErr').textContent = err.message; }
    });
  });
}
