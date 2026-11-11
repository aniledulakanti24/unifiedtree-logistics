// Weight disputes: courier-measured weight vs. what the seller entered.
import { api, html, raw, money, date, esc, statusBadge, pager, emptyState, loadingRows, modal, toast, refreshCounts } from '../core.js';

// Weight Freeze: lock a SKU's packed weight with photo proof so later courier
// disputes above it close automatically.
export async function renderFreeze(view) {
  const d = await api('/weight-freeze');
  view.innerHTML = html`
    <div class="page-head"><div><h1>Weight Freeze</h1><p>Freeze the packed weight and box size of each SKU. Disputes above the frozen weight are closed in your favour.</p></div>
      <label class="row card" style="padding:10px 14px"><input type="checkbox" class="check" id="smart" ${d.smart_weight ? raw('checked') : ''}><span class="stack"><b>Smart Weight Assurance</b><small class="muted">Auto-fill frozen weights on new orders</small></span></label></div>
    <div class="table-wrap"><table><thead><tr><th>SKU</th><th>Catalog weight</th><th>Frozen weight</th><th>Chargeable</th><th>Disputes</th><th>Status</th><th></th></tr></thead><tbody id="rows">
    ${raw(d.data.map((s) => html`<tr data-sku="${s.sku}"><td class="stack"><b>${s.name}</b><small class="muted mono">${s.sku}</small></td><td>${s.weight} kg · ${s.length}×${s.breadth}×${s.height}</td>
      <td>${s.freeze ? `${s.freeze.weight} kg · ${s.freeze.length}×${s.freeze.breadth}×${s.freeze.height}` : '—'}</td><td>${s.freeze ? s.freeze.chargeable + ' kg' : '—'}</td><td>${s.disputes}</td>
      <td>${s.freeze ? statusBadge('FROZEN') : raw('<span class="badge">Not frozen</span>')}</td>
      <td>${s.freeze ? raw('<button class="btn btn-outline btn-sm" data-act="unfreeze">Unfreeze</button>') : raw('<button class="btn btn-primary btn-sm" data-act="freeze">Freeze</button>')}</td></tr>`).join(''))}
    </tbody></table></div>`;
  view.querySelector('#smart').addEventListener('change', async (e) => { await api('/settings/smart-weight', { method: 'POST', body: { enabled: e.target.checked } }); toast('Saved'); });
  view.querySelector('#rows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const sku = b.closest('tr').dataset.sku;
    const s = d.data.find((x) => x.sku === sku);
    if (b.dataset.act === 'unfreeze') { await api('/weight-freeze/unfreeze', { method: 'POST', body: { sku } }); toast('Unfrozen'); renderFreeze(view); return; }
    const r = await modal({
      title: `Freeze ${s.name}`,
      body: `<div class="form-grid"><label class="field">Packed weight (kg)<input class="input" id="fw" inputmode="decimal" value="${s.weight}"></label><span></span>
        <label class="field">Length (cm)<input class="input" id="fl" type="number" value="${s.length}"></label><label class="field">Breadth (cm)<input class="input" id="fb" type="number" value="${s.breadth}"></label>
        <label class="field">Height (cm)<input class="input" id="fh" type="number" value="${s.height}"></label>
        <label class="field">Photos (product on scale, box with tape)<input class="input" id="fp" type="file" accept="image/*" multiple></label></div>
        <p class="muted small" style="margin:0">Photos stay on your device in this demo; only the count is sent.</p><p class="form-error" id="fErr"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="fGo">Submit</button>',
      onMount: (el, close) => el.querySelector('#fGo').addEventListener('click', async () => {
        const v = (id) => el.querySelector(id).value;
        try { close(await api('/weight-freeze/request', { method: 'POST', body: { sku, weight: v('#fw'), length: v('#fl'), breadth: v('#fb'), height: v('#fh'), photos: el.querySelector('#fp').files.length } })); }
        catch (err) { el.querySelector('#fErr').textContent = err.message; }
      }),
    });
    if (r) { toast(`Frozen at ${r.chargeable} kg${r.disputes_closed ? ` · ${r.disputes_closed} dispute${r.disputes_closed > 1 ? 's' : ''} closed` : ''}`); renderFreeze(view); }
  });
}

export async function render(view, { query }) {
  const page = Number(query.get('page')) || 1;
  view.innerHTML = html`
    <div class="page-head"><div><h1>Weight disputes</h1><p>Accept the courier's weight or raise a dispute with product photos within 7 days.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>AWB</th><th>Product</th><th>Courier</th><th>Entered</th><th>Charged</th><th>Extra charge</th><th>Raised</th><th>Status</th><th>Action</th></tr></thead>
    <tbody id="rows">${loadingRows(9, 4)}</tbody></table></div><div id="pager"></div>`;

  const res = await api('/weightdispute/list', { query: { page, per_page: 15 } });
  const rows = view.querySelector('#rows');
  rows.innerHTML = res.data.length ? res.data.map((d) => html`<tr data-id="${d.id}">
    <td><a class="link mono" href="#/orders/view/${d.order_id}">${d.awb}</a></td><td>${d.product}</td><td>${d.courier}</td>
    <td>${d.entered_weight} kg</td><td><b>${d.charged_weight} kg</b></td><td>${money(d.extra_charge)}</td><td>${date(d.raised_at)}</td>
    <td>${statusBadge(d.status)}</td>
    <td>${d.status === 'ACTION_REQUIRED' ? raw('<div class="row"><button class="btn btn-outline btn-sm" data-act="accept">Accept</button><button class="btn btn-primary btn-sm" data-act="dispute">Dispute</button></div>') : '—'}</td>
  </tr>`).join('') : `<tr><td colspan="9">${emptyState('No weight discrepancies.').value}</td></tr>`;
  view.querySelector('#pager').appendChild(pager(res.meta, (p) => { location.hash = '#/weight?page=' + p; }));

  rows.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = Number(b.closest('tr').dataset.id);
    let remarks = '';
    if (b.dataset.act === 'dispute') {
      const r = await modal({
        title: 'Raise a dispute',
        body: '<label class="field">Why is the charged weight wrong?<textarea class="input" id="wdNote" rows="3" maxlength="300" placeholder="e.g. Product weighs 0.5 kg, packed in a 20×15×8 cm box"></textarea></label>',
        footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="wdGo">Submit dispute</button>',
        onMount: (el, close) => el.querySelector('#wdGo').addEventListener('click', () => close(el.querySelector('#wdNote').value.trim() || 'Weight is incorrect')),
      });
      if (!r) return;
      remarks = r;
    }
    try {
      await api('/weightdispute/action', { method: 'POST', body: { id, action: b.dataset.act, remarks } });
      toast(b.dataset.act === 'accept' ? 'Accepted · charge debited from wallet' : 'Dispute raised with the courier');
      refreshCounts();
      render(view, { query });
    } catch (err) { toast(err.message, true); }
  });
}
