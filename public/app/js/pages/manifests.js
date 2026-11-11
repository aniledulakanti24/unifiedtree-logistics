// Labels, manifests and invoices. Documents render as print-ready HTML in a
// new window, so "Save as PDF" in the print dialog gives the PDF.
import { api, html, raw, money, date, esc, emptyState, toast } from '../core.js';

// Code 39: 9 elements per char (bar/space alternating), 1 = wide.
const C39 = {
  0: '000110100', 1: '100100001', 2: '001100001', 3: '101100000', 4: '000110001', 5: '100110000', 6: '001110000', 7: '000100101', 8: '100100100', 9: '001100100',
  A: '100001001', B: '001001001', C: '101001000', D: '000011001', E: '100011000', F: '001011000', G: '000001101', H: '100001100', I: '001001100', J: '000011100',
  K: '100000011', L: '001000011', M: '101000010', N: '000010011', O: '100010010', P: '001010010', Q: '000000111', R: '100000110', S: '001000110', T: '000010110',
  U: '110000001', V: '011000001', W: '111000000', X: '010010001', Y: '110010000', Z: '011010000', '-': '010000101', '*': '010010100',
};
function barcode(text, height = 56) {
  const chars = `*${String(text).toUpperCase().replace(/[^0-9A-Z-]/g, '')}*`;
  let x = 0;
  let bars = '';
  for (const ch of chars) {
    C39[ch].split('').forEach((w, i) => {
      const width = w === '1' ? 3 : 1;
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${width}" height="${height}"/>`;
      x += width;
    });
    x += 1; // inter-character gap
  }
  return `<svg viewBox="0 0 ${x} ${height}" width="100%" height="${height}" preserveAspectRatio="none" fill="#000">${bars}</svg>`;
}

const PRINT_CSS = `*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#000;font-size:12px}
.page{page-break-after:always;padding:12px}.page:last-child{page-break-after:auto}
.label{width:4in;height:6in;border:1.5px solid #000;padding:10px;display:flex;flex-direction:column;gap:8px}
.box{border:1px solid #000;padding:6px}.row{display:flex;gap:8px;justify-content:space-between}.big{font-size:20px;font-weight:700}
.muted{color:#444}h2{margin:0 0 6px;font-size:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:5px;text-align:left;vertical-align:top}
.sign{margin-top:40px;display:flex;justify-content:space-between}.sign div{border-top:1px solid #000;width:40%;padding-top:4px;text-align:center}
.noprint{padding:10px;background:#f3f3f3;text-align:center}@media print{.noprint{display:none}}@page{margin:8mm}`;

function labelHtml(o, seller) {
  const cod = o.payment_method === 'COD';
  return `<div class="page"><div class="label">
    <div class="row"><b>${esc(seller.name)}</b><b>${esc(o.courier)}</b></div>
    <div class="box"><div class="muted">SHIP TO</div><div class="big">${esc(o.customer.name)}</div>
      <div>${esc(o.customer.address)}</div><div>${esc(o.customer.city)}, ${esc(o.customer.state)} <b>${esc(o.customer.pincode)}</b>${o.is_international ? ', ' + esc(o.customer.country) : ''}</div><div>Ph: ${esc(o.customer.phone)}</div></div>
    <div class="box" style="text-align:center">${barcode(o.awb)}<div class="big" style="letter-spacing:2px">${esc(o.awb)}</div></div>
    <div class="row"><div class="box" style="flex:1"><div class="muted">PAYMENT</div><div class="big">${cod ? 'COD ' + money(o.total) : 'PREPAID'}</div></div>
      <div class="box" style="flex:1"><div class="muted">WEIGHT / DIMS</div><b>${o.package.weight} kg</b><div>${o.package.length}×${o.package.breadth}×${o.package.height} cm</div></div></div>
    <div class="box"><div class="muted">ORDER ${esc(o.channel_order_id)} · ${date(o.created_at)}</div>${o.products.map((p) => `${esc(p.name)} × ${p.qty} <span class="muted">(${esc(p.sku || '—')})</span>`).join('<br>')}</div>
    <div class="box" style="margin-top:auto"><div class="muted">RETURN TO</div>${esc(o.pickup.nickname)}, ${esc(o.pickup.address)}, ${esc(o.pickup.city)} ${esc(o.pickup.pincode)} · ${esc(o.pickup.phone)}</div>
  </div></div>`;
}

function manifestHtml(orders, seller) {
  const byCourier = orders.reduce((m, o) => ((m[o.courier] = m[o.courier] || []).push(o), m), {});
  return Object.entries(byCourier).map(([courier, list]) => `<div class="page">
    <h2>Pickup manifest · ${esc(courier)}</h2>
    <p>${esc(seller.name)} · Manifest ${esc(list[0].manifest_id || '—')} · Pickup ${date(list[0].pickup_date)} · ${list.length} shipment${list.length > 1 ? 's' : ''}</p>
    <p class="muted">From: ${esc(list[0].pickup.nickname)}, ${esc(list[0].pickup.address)}, ${esc(list[0].pickup.city)} ${esc(list[0].pickup.pincode)}</p>
    <table><thead><tr><th>#</th><th>AWB</th><th>Order</th><th>Consignee</th><th>Pincode</th><th>Payment</th><th>Weight</th></tr></thead><tbody>
    ${list.map((o, i) => `<tr><td>${i + 1}</td><td>${esc(o.awb)}</td><td>${esc(o.channel_order_id)}</td><td>${esc(o.customer.name)}</td><td>${esc(o.customer.pincode)}</td><td>${o.payment_method === 'COD' ? 'COD ' + money(o.total) : 'Prepaid'}</td><td>${o.package.weight} kg</td></tr>`).join('')}
    </tbody></table>
    <p>Total COD to collect: <b>${money(list.filter((o) => o.payment_method === 'COD').reduce((s, o) => s + o.total, 0))}</b></p>
    <div class="sign"><div>Seller signature</div><div>Courier executive (name & signature)</div></div></div>`).join('');
}

function invoiceHtml(o, seller) {
  const taxable = o.total / 1.18;
  const intra = o.pickup.state && o.pickup.state === o.customer.state;
  const tax = o.total - taxable;
  return `<div class="page"><div class="row"><div><h2>Tax invoice</h2><div>${esc(seller.name)}</div><div class="muted">${esc(o.pickup.address)}, ${esc(o.pickup.city)} ${esc(o.pickup.pincode)}</div>
      ${seller.gstin ? `<div>GSTIN: ${esc(seller.gstin)}</div>` : '<div class="muted">GSTIN: add in KYC</div>'}</div>
    <div style="text-align:right"><div>Invoice <b>INV-${o.id}</b></div><div>Date ${date(o.created_at)}</div><div>Order ${esc(o.channel_order_id)}</div></div></div>
    <div class="box" style="margin:12px 0"><b>Bill / ship to</b><br>${esc(o.customer.name)}, ${esc(o.customer.address)}, ${esc(o.customer.city)} ${esc(o.customer.pincode)}${o.is_international ? ', ' + esc(o.customer.country) : ''} · ${esc(o.customer.phone)}</div>
    <table><thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Rate</th><th>Taxable value</th><th>${intra ? 'CGST 9% + SGST 9%' : 'IGST 18%'}</th><th>Total</th></tr></thead><tbody>
    ${o.products.map((p) => { const line = p.price * p.qty; const tv = line / 1.18; return `<tr><td>${esc(p.name)}</td><td>${esc(p.sku || '—')}</td><td>${p.qty}</td><td>${money(p.price / 1.18)}</td><td>${money(tv)}</td><td>${money(line - tv)}</td><td>${money(line)}</td></tr>`; }).join('')}
    </tbody></table>
    <p style="text-align:right">Taxable ${money(taxable)} · Tax ${money(tax)} · <b>Total ${money(o.total)}</b> (${o.payment_method})</p>
    <p class="muted">Prices include GST. This is a computer-generated invoice.</p></div>`;
}

// Builds the document HTML for the given orders. type: label | manifest | invoice
export async function buildDocs(type, ids) {
  const d = await api('/print/docs', { query: { type, ids: ids.join(',') } });
  const body = type === 'label' ? d.orders.map((o) => labelHtml(o, d.seller)).join('') : type === 'manifest' ? manifestHtml(d.orders, d.seller) : d.orders.map((o) => invoiceHtml(o, d.seller)).join('');
  const title = { label: 'Shipping labels', manifest: 'Pickup manifest', invoice: 'Invoices' }[type];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`;
}

// Prints through a hidden iframe, so no pop-up permission is needed.
export async function printDocs(type, ids) {
  let doc;
  try { doc = await buildDocs(type, ids); } catch (err) { toast(err.message, true); return; }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = doc;
  frame.onload = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.appendChild(frame);
  toast('Opening print dialog… choose "Save as PDF" to download.');
}

// Manifests page: shipments waiting for a manifest, and manifests by pickup.
export async function render(view) {
  view.innerHTML = html`<div class="page-head"><div><h1>Labels & manifests</h1><p>Print labels for packed orders and hand the manifest to the courier at pickup.</p></div></div>
    <div class="grid grid-2"><section class="card"><h2>Ready to ship · need labels</h2><div id="rts"></div></section><section class="card"><h2>Pickup manifests</h2><div id="mfs"></div></section></div>`;
  const [rts, pick] = await Promise.all([
    api('/orders/processing', { query: { tab: 'readytoship', per_page: 200, from: '2000-01-01' } }),
    api('/orders/processing', { query: { tab: 'pickup', per_page: 200, from: '2000-01-01' } }),
  ]);
  const rtsEl = view.querySelector('#rts');
  rtsEl.innerHTML = rts.data.length ? `<div class="row" style="margin-bottom:10px"><span class="muted">${rts.data.length} shipments</span><span class="spacer"></span>
      <button class="btn btn-outline btn-sm" data-print="label" data-ids="${rts.data.map((o) => o.id)}">Print all labels</button>
      <button class="btn btn-primary btn-sm" id="schedAll">Schedule pickup for all</button></div>` +
    rts.data.map((o) => `<div class="action-item"><span class="stack"><b class="mono">${esc(o.awb)}</b><small class="muted">${esc(o.channel_order_id)} · ${esc(o.courier)}</small></span><span class="spacer"></span>
      <button class="btn btn-outline btn-sm" data-print="label" data-ids="${o.id}">Label</button></div>`).join('')
    : emptyState('Nothing waiting for a label.').value;

  const groups = pick.data.reduce((m, o) => ((m[o.manifest_id || 'Unassigned'] = m[o.manifest_id || 'Unassigned'] || []).push(o), m), {});
  view.querySelector('#mfs').innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([mf, list]) => `<div class="action-item"><span class="stack"><b>${esc(mf)}</b>
      <small class="muted">${list.length} shipment${list.length > 1 ? 's' : ''} · ${[...new Set(list.map((o) => o.courier))].map(esc).join(', ')} · pickup ${date(list[0].pickup_date)}</small></span><span class="spacer"></span>
      <button class="btn btn-outline btn-sm" data-print="label" data-ids="${list.map((o) => o.id)}">Labels</button><button class="btn btn-primary btn-sm" data-print="manifest" data-ids="${list.map((o) => o.id)}">Manifest</button></div>`).join('')
    : emptyState('No pickups scheduled.').value;

  view.querySelector('.grid').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-print]');
    if (b) printDocs(b.dataset.print, b.dataset.ids.split(',').map(Number));
    if (e.target.id === 'schedAll') {
      try { const r = await api('/orders/pickup', { method: 'POST', body: { order_ids: rts.data.map((o) => o.id) } }); toast(`Pickup on ${date(r.pickup_date)} · manifest ${r.manifest_id}`); render(view); }
      catch (err) { toast(err.message, true); }
    }
  });
}
