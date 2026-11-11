// All Shipments (AWB-centric list) and bulk tracking.
import { api, html, raw, money, date, dateTime, esc, statusBadge, pager, emptyState, loadingRows, daysAgo, isoDay } from '../core.js';
import { printDocs } from './manifests.js';

const STATUSES = ['READY_TO_SHIP', 'PICKUP_SCHEDULED', 'IN_TRANSIT', 'DELIVERED', 'RTO', 'CANCELLED'];

export async function render(view, { query }) {
  const state = { search: query.get('search') || '', status: query.get('status') || '', courier_id: query.get('courier_id') || '',
    is_international: query.get('is_international') || '', from: query.get('from') || daysAgo(29), to: query.get('to') || isoDay(Date.now()), page: Number(query.get('page')) || 1 };
  const filters = await api('/orders/processingordersfilters');
  view.innerHTML = html`
    <div class="page-head"><div><h1>Shipments</h1><p>Every booked shipment by AWB, across couriers.</p></div><a class="btn btn-outline" href="#/track">Bulk tracking</a></div>
    <form class="toolbar" id="tb">
      <input class="input" type="search" name="search" placeholder="AWB, order ID, buyer" value="${state.search}">
      <select class="select" name="status"><option value="">All statuses</option>${raw(STATUSES.map((s) => `<option value="${s}" ${s === state.status ? 'selected' : ''}>${statusBadge(s).value.replace(/<[^>]+>/g, '')}</option>`).join(''))}</select>
      <select class="select" name="courier_id"><option value="">All couriers</option>${raw(filters.couriers.map((c) => `<option value="${c.id}" ${String(c.id) === state.courier_id ? 'selected' : ''}>${esc(c.name)}</option>`).join(''))}</select>
      <select class="select" name="is_international"><option value="">Domestic</option><option value="1" ${state.is_international ? 'selected' : ''}>International</option></select>
      <input class="input" type="date" name="from" value="${state.from}" aria-label="From"><input class="input" type="date" name="to" value="${state.to}" aria-label="To">
    </form>
    <div class="table-wrap"><table><thead><tr><th>AWB</th><th>Order</th><th>Buyer</th><th>Courier</th><th>Weight / freight</th><th>Expected</th><th>Last update</th><th>Status</th><th></th></tr></thead>
    <tbody id="rows">${loadingRows(9)}</tbody></table></div><div id="pager"></div>`;
  const tb = view.querySelector('#tb');
  const go = (patch) => { const qs = new URLSearchParams(Object.entries({ ...state, ...patch }).filter(([k, v]) => v && !(k === 'page' && v === 1))); location.hash = '#/shipments?' + qs; };
  const read = () => Object.fromEntries(['search', 'status', 'courier_id', 'is_international', 'from', 'to'].map((k) => [k, tb[k].value.trim()]));
  tb.addEventListener('submit', (e) => { e.preventDefault(); go({ ...read(), page: 1 }); });
  tb.addEventListener('change', (e) => { if (e.target.type !== 'search') go({ ...read(), page: 1 }); });

  const res = await api('/shipments/all', { query: { ...state, per_page: 20 } });
  view.querySelector('#rows').innerHTML = res.data.length ? res.data.map((s) => html`<tr>
    <td class="stack"><a class="link mono" href="/track/?awb=${s.awb}" target="_blank" rel="noopener">${s.awb}</a>${s.manifest_id ? raw(`<small class="muted">${esc(s.manifest_id)}</small>`) : ''}</td>
    <td><a class="link" href="#/orders/view/${s.id}">${s.channel_order_id}</a></td>
    <td class="stack"><b>${s.customer.name}</b><small class="muted">${s.customer.city}, ${s.customer.pincode}</small></td>
    <td>${s.courier}</td><td class="stack"><span>${s.weight} kg</span><small class="muted">${money(s.freight)}</small></td>
    <td class="stack"><span>${date(s.edd)}</span>${s.delayed ? raw('<small class="badge badge-red">Delayed</small>') : ''}</td>
    <td class="stack"><small>${dateTime(s.last.at)}</small><small class="muted">${s.last.location || ''}</small></td>
    <td>${statusBadge(s.status)}</td>
    <td><button class="btn btn-outline btn-sm" data-label="${s.id}">Label</button></td></tr>`).join('')
    : `<tr><td colspan="9">${emptyState('No shipments match these filters.').value}</td></tr>`;
  view.querySelector('#pager').appendChild(pager(res.meta, (page) => go({ page })));
  view.querySelector('#rows').addEventListener('click', (e) => { const b = e.target.closest('[data-label]'); if (b) printDocs('label', [Number(b.dataset.label)]); });
}

export async function renderTrack(view) {
  view.innerHTML = html`
    <div class="page-head"><div><h1>Bulk tracking</h1><p>Paste up to 100 AWB numbers, separated by commas, spaces or new lines.</p></div></div>
    <form class="card" id="tf" style="margin-bottom:16px"><textarea class="input mono" name="awbs" rows="4" placeholder="UT1234567890, UT9876543210"></textarea>
      <div class="row" style="margin-top:12px"><button class="btn btn-primary">Track</button><button class="btn btn-outline" type="button" id="fill">Use my in-transit AWBs</button><span class="form-error" id="err"></span></div></form>
    <div id="out"></div>`;
  const form = view.querySelector('#tf');
  view.querySelector('#fill').addEventListener('click', async () => {
    const r = await api('/shipments/all', { query: { status: 'IN_TRANSIT', from: '2000-01-01', per_page: 30 } });
    form.awbs.value = r.data.map((s) => s.awb).join('\n');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    view.querySelector('#err').textContent = '';
    try {
      const r = await api('/tracking/bulk', { method: 'POST', body: { awbs: form.awbs.value } });
      const found = r.data.filter((x) => x.found).length;
      view.querySelector('#out').innerHTML = `<p class="muted">${found} of ${r.data.length} found.</p><div class="table-wrap"><table><thead><tr><th>AWB</th><th>Order</th><th>Courier</th><th>Status</th><th>Last update</th><th>Expected</th></tr></thead><tbody>${
        r.data.map((x) => x.found ? `<tr><td class="mono">${esc(x.awb)}</td><td><a class="link" href="#/orders/view/${x.order_id}">${esc(x.channel_order_id)}</a></td><td>${esc(x.courier)}</td><td>${statusBadge(x.status).value}</td>
          <td>${dateTime(x.last.at)} ${x.last.location ? '· ' + esc(x.last.location) : ''}</td><td>${date(x.edd)}</td></tr>` : `<tr><td class="mono">${esc(x.awb)}</td><td colspan="5" class="muted">Not found in your account</td></tr>`).join('')}</tbody></table></div>`;
    } catch (err) { view.querySelector('#err').textContent = err.message; }
  });
}
