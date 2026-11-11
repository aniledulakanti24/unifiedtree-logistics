// Finance: COD reconciliation (per AWB) and freight invoices & credit notes.
import { api, html, raw, money, date, esc, pager, emptyState, toast, store } from '../core.js';

const COD_STATUS = { MATCHED: ['Matched', 'badge-green'], SHORT: ['Short-paid', 'badge-red'], MISSING: ['Missing', 'badge-red'], PENDING: ['Not due yet', 'badge-amber'], DISPUTED: ['Disputed', 'badge-blue'] };

export async function renderCod(view, { query }) {
  const status = query.get('status') || '';
  const page = Number(query.get('page')) || 1;
  const d = await api('/cod/reconciliation', { query: { status, page, per_page: 20 } });
  const s = d.summary;
  view.innerHTML = html`
    <div class="page-head"><div><h1>COD reconciliation</h1><p>Every delivered COD shipment matched against the payouts you received. Payouts are due ${s.due_days} day${s.due_days > 1 ? 's' : ''} after delivery.</p></div>
      <a class="btn btn-outline" href="#/billing?tab=remittance">Payouts</a></div>
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat"><span class="stat__label">COD collected by couriers</span><span class="stat__value">${money(s.expected)}</span></div>
      <div class="card stat"><span class="stat__label">Remitted to you</span><span class="stat__value">${money(s.remitted)}</span></div>
      <div class="card stat"><span class="stat__label">Not due yet</span><span class="stat__value">${money(s.pending)}</span></div>
      <div class="card stat ${s.issues ? 'highlight' : ''}"><span class="stat__label">Discrepancies</span><span class="stat__value" style="color:${s.issues ? 'var(--red)' : 'inherit'}">${s.issues}</span>
        <span class="muted small">${money(s.missing)} missing · ${money(s.short_by)} short</span></div>
    </div>
    <nav class="tabs">${raw([['', 'All'], ['SHORT', 'Short-paid'], ['MISSING', 'Missing'], ['PENDING', 'Not due yet'], ['MATCHED', 'Matched'], ['DISPUTED', 'Disputed']].map(([k, l]) => `<a href="#/cod${k ? '?status=' + k : ''}" class="${k === status ? 'active' : ''}">${l}</a>`).join(''))}</nav>
    <div class="table-wrap"><table><thead><tr><th>AWB</th><th>Order</th><th>Courier</th><th>Delivered</th><th>COD</th><th>Remitted</th><th>Difference</th><th>UTR</th><th>Status</th><th></th></tr></thead><tbody id="rows">
    ${d.data.length ? raw(d.data.map((r) => `<tr data-awb="${esc(r.awb)}"><td class="mono">${esc(r.awb)}</td><td><a class="link" href="#/orders/view/${r.order_id}">${esc(r.channel_order_id)}</a></td><td>${esc(r.courier)}</td>
      <td>${date(r.delivered_at)}</td><td>${money(r.cod)}</td><td>${money(r.remitted)}</td><td>${r.difference ? `<b style="color:var(--red)">${money(r.difference)}</b>` : '—'}</td>
      <td class="mono small">${esc(r.utr || '—')}</td><td><span class="badge ${COD_STATUS[r.status][1]}">${COD_STATUS[r.status][0]}</span></td>
      <td>${['SHORT', 'MISSING'].includes(r.status) ? '<button class="btn btn-outline btn-sm" data-dispute>Raise dispute</button>' : r.ticket ? `<a class="link small" href="#/support?id=${r.ticket}">Ticket #${r.ticket}</a>` : ''}</td></tr>`).join(''))
      : raw(`<tr><td colspan="10">${emptyState('Nothing here.').value}</td></tr>`)}
    </tbody></table></div><div id="pager"></div>`;
  view.querySelector('#pager').appendChild(pager(d.meta, (p) => { location.hash = `#/cod?${status ? 'status=' + status + '&' : ''}page=${p}`; }));
  view.querySelector('#rows').addEventListener('click', async (e) => {
    if (!e.target.hasAttribute('data-dispute')) return;
    try { const r = await api('/cod/dispute', { method: 'POST', body: { awb: e.target.closest('tr').dataset.awb } }); toast(`Dispute raised · ticket #${r.ticket}`); renderCod(view, { query }); }
    catch (err) { toast(err.message, true); }
  });
}

// ---- invoices & credit notes ------------------------------------------------------
export async function renderInvoices(view, { query }) {
  const tab = query.get('tab') === 'weight' ? 'weight' : 'docs';
  view.innerHTML = html`<div class="page-head"><div><h1>Invoices & credit notes</h1><p>Monthly GST invoices for shipping charges, and credit notes for refunds.</p></div></div>
    <nav class="tabs"><a href="#/invoices" class="${tab === 'docs' ? 'active' : ''}">Invoices & credit notes</a><a href="#/invoices?tab=weight" class="${tab === 'weight' ? 'active' : ''}">Weight-dispute ledger</a></nav><div id="body"></div>`;
  const body = view.querySelector('#body');
  if (tab === 'weight') {
    const w = await api('/billing/weight-ledger');
    body.innerHTML = `<div class="table-wrap"><table><thead><tr><th>AWB</th><th>Product</th><th>Entered</th><th>Charged</th><th>Extra charge</th><th>Status</th><th>Debited</th></tr></thead><tbody>${
      w.data.map((x) => `<tr><td class="mono">${esc(x.awb)}</td><td>${esc(x.product)}</td><td>${x.entered_weight} kg</td><td>${x.charged_weight} kg</td><td>${money(x.extra_charge)}</td>
        <td>${esc(x.status.replace(/_/g, ' ').toLowerCase())}</td><td>${x.charged ? `<b>${money(x.charged)}</b>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
    return;
  }
  const d = await api('/billing/documents');
  body.innerHTML = (d.gstin ? '' : '<p class="badge badge-amber" style="margin-bottom:12px">Add your GSTIN in KYC to claim input tax credit on these invoices.</p>') +
    (d.data.length ? `<div class="table-wrap"><table><thead><tr><th>Document</th><th>Type</th><th>Month</th><th>Entries</th><th>Taxable</th><th>GST (18%)</th><th>Total</th><th></th></tr></thead><tbody>${
      d.data.map((x, i) => `<tr><td class="mono">${esc(x.number)}</td><td>${x.type === 'invoice' ? '<span class="badge badge-blue">Tax invoice</span>' : '<span class="badge badge-lime">Credit note</span>'}</td>
        <td>${new Date(x.month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</td><td>${x.count}</td><td>${money(x.taxable)}</td><td>${money(x.gst)}</td><td><b>${money(x.total)}</b></td>
        <td><button class="btn btn-outline btn-sm" data-i="${i}">Download PDF</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('No billable activity yet.').value);
  body.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) printDocument(d.data[Number(b.dataset.i)], d.gstin); });
}

function printDocument(doc, gstin) {
  const user = store.state.user || {};
  const title = doc.type === 'invoice' ? 'Tax invoice' : 'Credit note';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${doc.number}</title><style>
    body{font-family:Arial,sans-serif;color:#101C18;margin:32px;font-size:13px}h1{margin:0;font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border:1px solid #D9CDB3;padding:8px;text-align:left}th{background:#FBF5E6}.r{text-align:right}.top{display:flex;justify-content:space-between}.brand{color:#0F5B45;font-weight:800;font-size:18px}
  </style></head><body><div class="top"><div><div class="brand">UT Log</div><div>UT Log Logistics (demo issuer)</div><div>GSTIN: to be added</div></div>
    <div style="text-align:right"><h1>${title}</h1><div>${doc.number}</div><div>Period: ${doc.month}</div></div></div>
    <p><b>Billed to:</b> ${esc(user.company_name || 'Seller')} · GSTIN ${esc(gstin || 'not provided')}</p>
    <table><thead><tr><th>Description</th><th>SAC</th><th class="r">Taxable</th><th class="r">IGST 18%</th><th class="r">Amount</th></tr></thead><tbody>
    ${doc.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>996812</td><td class="r">${money(l.taxable)}</td><td class="r">${money(l.gst)}</td><td class="r">${money(l.amount)}</td></tr>`).join('')}
    <tr><th colspan="2">Total</th><th class="r">${money(doc.taxable)}</th><th class="r">${money(doc.gst)}</th><th class="r">${money(doc.total)}</th></tr></tbody></table>
    <p style="color:#6B7874;margin-top:24px">Computer-generated document for demo purposes. Replace the issuer details with your registered entity before use.</p></body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = html;
  frame.onload = () => { frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); };
  document.body.appendChild(frame);
  toast('Opening print dialog… choose "Save as PDF".');
}
