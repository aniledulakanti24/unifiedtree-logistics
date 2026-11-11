// Central wallet: every service pays from here, prepaid; pay-on-delivery is tracked here too.
import { api, esc, money, moneyIn, getCurrency, toast, modal, dateTime, pager, withBusy, inrHint } from '../core.js';
import { duo, scene, tile } from './art.js';
import { addMoney, area, hbars, refresh, SECTION_LABEL, downloadCsv, filterBtn, openFilters, countActive, moneyTabs } from './ui.js';

export async function render(view, { query }) {
  const page = Number(query.get('page')) || 1;
  const type = query.get('type') || '';
  const days = query.get('days') || ''; const min = query.get('min') || '';
  const WF = [{ key: 'days', label: 'Date', options: [['', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']] }, { key: 'min', label: 'Minimum amount (₹)', placeholder: 'Any' }];
  view.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const w = await api('/hub/wallet', { query: { page, type, days, min, per_page: 12 } });
  const first = w.series[0].balance; const last = w.series[w.series.length - 1].balance;
  const change = first ? ((last - first) / first) * 100 : 0;
  const other = getCurrency() === 'INR' ? 'USD' : 'INR';
  const link = (patch) => { const q = new URLSearchParams({ type, days, min, ...patch }); ['type', 'days', 'min'].forEach((k) => { if (!q.get(k)) q.delete(k); }); return `#/wallet?${q}`; };
  view.innerHTML = `
    <div class="page-head"><div class="row head-t">${tile('wallet', 'green').value}<div><h1>Wallet</h1><p>One balance for transport, travel, recharges, bills and business payments.</p></div></div><a class="btn btn-outline" href="#/autopay">Auto top-up: ${w.rule.enabled ? 'On' : 'Off'}</a></div>${moneyTabs('wallet')}
    <section class="wallet-hero">
      <div class="wallet-hero__l">
        <p class="wallet-hero__k">Total balance <button class="eye" id="eye" type="button" aria-label="Hide balance" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button></p>
        <div class="row wallet-hero__v"><b id="bal" translate="no" data-count="${w.balance}" data-fmt="money">${esc(money(w.balance))}</b><span class="badge ${change >= 0 ? 'badge-green' : 'badge-red'}">${change >= 0 ? '+' : ''}${change.toFixed(1)}% 30 days</span></div>
        <p class="muted notop" translate="no">≈ ${esc(moneyIn(w.balance, other))}</p>
        <div class="row wallet-hero__a"><button class="btn btn-primary" id="add" type="button">${duo('arrowdown', 'hide').value}Add money</button><button class="btn btn-outline" id="wd" type="button">Withdraw</button><button class="btn btn-outline" id="csv" type="button">Statement</button></div>
      </div>
      <div class="wallet-hero__art">${scene('wallet').value}</div>
      <div class="wallet-hero__line" id="line"></div>
    </section>
    <div class="grid grid-3">
      <div class="card stat"><span class="stat__label">Added, 30 days</span><span class="stat__value" translate="no">${esc(money(w.added_30))}</span></div>
      <div class="card stat"><span class="stat__label">Spent, 30 days</span><span class="stat__value" translate="no">${esc(money(w.spent_30))}</span></div>
      <div class="card stat"><span class="stat__label">Pay on delivery due</span><span class="stat__value" translate="no">${esc(money(w.pay_on_delivery_due))}</span><span class="muted small">${w.pay_on_delivery_count} open ${w.pay_on_delivery_count === 1 ? 'booking' : 'bookings'}, not taken from wallet</span></div>
    </div>
    <div class="dash dash--even">
      <section><div class="tab-row"><nav class="tabs">${[['', 'All'], ['credit', 'Money in'], ['debit', 'Money out']].map(([k, l]) => `<a href="${link({ type: k })}" class="${k === type ? 'active' : ''}">${l}</a>`).join('')}</nav>${filterBtn(countActive(WF, { days, min }))}</div>
        <div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th style="text-align:end">Amount</th></tr></thead><tbody>${w.data.map((t) => `<tr><td class="nowrap">${esc(dateTime(t.at))}</td><td>${esc(t.note)}</td><td style="text-align:end"><b translate="no" class="${t.type === 'credit' ? 'pos' : ''}">${t.type === 'credit' ? '+' : '−'}${esc(money(t.amount))}</b></td></tr>`).join('')}</tbody></table></div><div id="pg"></div></section>
      <aside class="dash__side"><section class="card"><h2>Prepaid spend by service, 30 days</h2>${w.by_section.length ? hbars(w.by_section, (r) => SECTION_LABEL[r.section]) : '<p class="muted notop">Nothing spent yet.</p>'}</section>
      <section class="card"><h2>How payment works</h2><ul class="plain-list"><li><b>Prepaid</b> is taken from this wallet when you book.</li><li><b>Pay on delivery</b> is paid directly to the provider, with a small fee.</li><li><b>Refunds</b> for cancelled prepaid bookings return here at once.</li></ul></section></aside>
    </div>`;
  area(view.querySelector('#line'), w.series);
  view.querySelector('#pg').appendChild(pager(w.meta, (p) => { location.hash = link({ page: p }); }));
  const again = () => render(view, { query });
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, WF, { days, min }, (v) => { location.hash = link({ ...v, page: 1 }); }));
  view.querySelector('#add').addEventListener('click', () => addMoney().then((ok) => ok && again()));
  view.querySelector('#wd').addEventListener('click', () => withdraw(w.balance, again));
  view.querySelector('#csv').addEventListener('click', () => downloadCsv('ut-log-wallet.csv', [['Date', 'Type', 'Amount INR', 'Description'], ...w.data.map((t) => [t.at, t.type, t.amount, t.note])]));
  const eye = view.querySelector('#eye');
  eye.addEventListener('click', () => { const hide = eye.getAttribute('aria-pressed') !== 'true'; eye.setAttribute('aria-pressed', String(hide)); eye.setAttribute('aria-label', hide ? 'Show balance' : 'Hide balance'); view.querySelector('#bal').textContent = hide ? '••••••' : money(w.balance); });
}

function withdraw(balance, done) {
  modal({
    title: 'Withdraw to bank or UPI',
    body: `<label class="field">Amount (₹)<input class="input" id="amt" inputmode="numeric"></label><p class="muted small notop" id="fx"></p><p class="muted small notop">Available: ${esc(money(balance))}. Demo mode: no money is transferred. Payouts go to the UPI ID or bank account in your <a class="link" href="#/profile">profile</a>.</p><p class="form-error" id="err"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Withdraw</button>',
    onMount(el, close) {
      const input = el.querySelector('#amt');
      input.addEventListener('input', () => { el.querySelector('#fx').textContent = inrHint(input.value); });
      el.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
      const go = el.querySelector('#go');
      go.addEventListener('click', () => withBusy(go, async () => { try { await api('/hub/wallet/withdraw', { method: 'POST', body: { amount: input.value } }); toast('Withdrawal recorded'); refresh(); close(true); done(); } catch (e) { el.querySelector('#err').textContent = e.message; } }));
    },
  });
}
