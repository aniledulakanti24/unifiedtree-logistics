// Bulk order upload: CSV -> preview -> create, with per-row errors.
import { api, html, esc, toast, refreshCounts, withBusy } from '../core.js';

const COLUMNS = ['order_id', 'name', 'phone', 'address', 'city', 'state', 'pincode', 'country', 'product', 'sku', 'price', 'qty', 'payment_method', 'weight', 'length', 'breadth', 'height'];
const SAMPLE = [COLUMNS.join(','),
  'WEB-1001,Asha Verma,9876543210,"12, MG Road",Bengaluru,KA,560001,India,Cotton Kurta Set,APP-KRT-01,1299,1,Prepaid,0.6,30,25,4',
  'WEB-1002,Rahul Sen,9123456780,"Flat 4B, Park Street",Kolkata,WB,700016,India,Ceramic Mug Pair,HOM-MUG-02,549,2,COD,,,,'].join('\n');

// Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export async function render(view) {
  view.innerHTML = html`
    <div class="page-head"><div><h1>Bulk upload</h1><p>Create up to 500 orders at once from a CSV file.</p></div>
      <button class="btn btn-outline" id="sample">Download sample CSV</button></div>
    <section class="card" style="margin-bottom:16px">
      <label class="field">CSV file<input class="input" type="file" id="file" accept=".csv,text/csv"></label>
      <p class="muted small">Required: name, phone, address, city, pincode, product, price. Weight and size are filled from your SKU catalog when the SKU matches.</p>
    </section>
    <div id="preview"></div>`;
  view.querySelector('#sample').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([SAMPLE], { type: 'text/csv' }));
    a.download = 'ut-bulk-orders-sample.csv';
    a.click();
  });
  view.querySelector('#file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2e6) { toast('File is larger than 2 MB.', true); return; }
    const rows = parseCsv(await f.text());
    const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
    const missing = ['name', 'phone', 'address', 'city', 'pincode', 'product', 'price'].filter((c) => !head.includes(c));
    const pv = view.querySelector('#preview');
    if (missing.length) { pv.innerHTML = `<p class="form-error">Missing columns: ${esc(missing.join(', '))}. Use the sample file as a template.</p>`; return; }
    const objs = rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
    pv.innerHTML = `<div class="row" style="margin-bottom:12px"><b>${objs.length} rows</b><span class="spacer"></span><button class="btn btn-primary" id="go">Create ${objs.length} orders</button></div>
      <div class="table-wrap"><table><thead><tr><th>Row</th><th>Order</th><th>Buyer</th><th>Pincode</th><th>Product</th><th>Price × qty</th><th>Payment</th><th>Result</th></tr></thead><tbody>
      ${objs.slice(0, 200).map((o, i) => `<tr data-row="${i + 2}"><td>${i + 2}</td><td>${esc(o.order_id || 'auto')}</td><td>${esc(o.name)}<br><small class="muted">${esc(o.phone)}</small></td><td>${esc(o.pincode)}</td>
        <td>${esc(o.product)}<br><small class="muted">${esc(o.sku)}</small></td><td>₹${esc(o.price)} × ${esc(o.qty || 1)}</td><td>${esc(o.payment_method || 'Prepaid')}</td><td class="res muted">—</td></tr>`).join('')}
      </tbody></table></div>`;
    pv.querySelector('#go').addEventListener('click', (ev) => withBusy(ev.currentTarget, async () => {
      try {
        const r = await api('/orders/bulk', { method: 'POST', body: { rows: objs } });
        r.results.forEach((x) => {
          const cell = pv.querySelector(`tr[data-row="${x.row}"] .res`);
          if (cell) cell.innerHTML = x.ok ? `<a class="link" href="#/orders/view/${x.order_id}">Created</a>` : `<span style="color:var(--red)">${esc(x.error)}</span>`;
        });
        toast(`${r.created} created${r.failed ? `, ${r.failed} need fixing` : ''}`, !!r.failed);
        refreshCounts();
      } catch (err) { toast(err.message, true); }
    }));
  });
}
