// Billing: wallet balance + ledger, recharge, and COD remittances.
import { api, html, raw, money, dateTime, date, pager, emptyState, loadingRows, modal, toast, refreshCounts } from '../core.js';

export async function render(view, { query }) {
  const tab = query.get('tab') === 'remittance' ? 'remittance' : 'wallet';
  const page = Number(query.get('page')) || 1;
  view.innerHTML = html`
    <div class="page-head"><div><h1>Wallet &amp; payouts</h1></div><button class="btn btn-primary" id="recharge">Recharge wallet</button></div>
    <nav class="tabs"><a href="#/billing" class="${tab === 'wallet' ? 'active' : ''}">Wallet</a><a href="#/billing?tab=remittance" class="${tab === 'remittance' ? 'active' : ''}">COD remittance</a></nav>
    <div id="body"><div class="skeleton" style="height:120px"></div></div>`;
  view.querySelector('#recharge').addEventListener('click', () => recharge(view, query));
  const body = view.querySelector('#body');

  if (tab === 'wallet') {
    const w = await api('/account/wallet', { query: { page, per_page: 15 } });
    body.innerHTML = html`
      <div class="grid grid-3" style="margin-bottom:16px"><div class="card stat"><span class="stat__label">Wallet balance</span><span class="stat__value">${money(w.balance)}</span>
        ${w.balance < 500 ? raw('<span class="delta down">Low balance — recharge to keep shipping</span>') : ''}</div></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Credit</th><th>Debit</th></tr></thead><tbody>
      ${w.data.length ? raw(w.data.map((t) => html`<tr><td>${dateTime(t.at)}</td><td>${t.note}</td><td>${t.type === 'credit' ? raw(`<b style="color:var(--green)">${money(t.amount)}</b>`) : ''}</td><td>${t.type === 'debit' ? money(t.amount) : ''}</td></tr>`).join(''))
        : raw(`<tr><td colspan="4">${emptyState('No transactions yet.').value}</td></tr>`)}
      </tbody></table></div><div id="pager"></div>`;
    body.querySelector('#pager').appendChild(pager(w.meta, (p) => { location.hash = '#/billing?page=' + p; }));
  } else {
    const r = await api('/account/remittance');
    body.innerHTML = html`
      <div class="grid grid-3" style="margin-bottom:16px">
        <div class="card stat"><span class="stat__label">Next remittance</span><span class="stat__value">${money(r.upcoming.amount)}</span><span class="muted small">Expected ${date(r.upcoming.date)}</span></div>
        <div class="card stat"><span class="stat__label">Paid (last 3)</span><span class="stat__value">${money(r.data.reduce((s, x) => s + x.amount, 0))}</span></div>
        <div class="card stat"><span class="stat__label">Early COD</span>
          <label class="row"><input type="checkbox" class="check" id="ecod" ${r.early_cod ? raw('checked') : ''}> <b>${r.early_cod ? 'On · paid 1 day after delivery' : 'Off · paid 2 days after delivery'}</b></label>
          <span class="muted small">0.5% of the COD amount when on. <a class="link" href="#/cod">Reconcile payouts →</a></span></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>UTR</th><th>Shipments</th><th>Amount</th><th>Status</th></tr></thead><tbody>
      ${raw(r.data.map((x) => html`<tr><td>${date(x.date)}</td><td class="mono">${x.utr}</td><td>${x.shipments}</td><td><b>${money(x.amount)}</b></td><td><span class="badge badge-green">Paid</span></td></tr>`).join(''))}
      </tbody></table></div>`;
    body.querySelector('#ecod').addEventListener('change', async (e) => {
      try { await api('/account/early-cod', { method: 'POST', body: { enabled: e.target.checked } }); toast(e.target.checked ? 'Early COD turned on' : 'Early COD turned off'); render(view, { query }); }
      catch (err) { toast(err.message, true); }
    });
  }
}

async function recharge(view, query) {
  const amount = await modal({
    title: 'Recharge wallet',
    body: `<div class="row">${[500, 1000, 2000, 5000].map((a) => `<button class="btn btn-outline btn-sm" type="button" data-amt="${a}">₹${a.toLocaleString('en-IN')}</button>`).join('')}</div>
      <label class="field">Amount (₹)<input class="input" id="amt" inputmode="numeric" value="1000"></label>
      <p class="muted small" style="margin:0">Demo mode: the balance is credited instantly. Connect a payment gateway in <code>server/seller-api.js</code> for real recharges.</p>
      <p class="form-error" id="amtErr"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="amtGo">Add money</button>',
    onMount(el, close) {
      const input = el.querySelector('#amt');
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-amt]'); if (b) input.value = b.dataset.amt; });
      el.querySelector('#amtGo').addEventListener('click', async () => {
        try { await api('/account/wallet/recharge', { method: 'POST', body: { amount: Number(input.value.replace(/\D/g, '')) } }); close(true); }
        catch (err) { el.querySelector('#amtErr').textContent = err.message; }
      });
    },
  });
  if (amount) { toast('Wallet recharged'); refreshCounts(); render(view, { query }); }
}
