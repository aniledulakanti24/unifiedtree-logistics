// Central wallet: every service pays from here, prepaid; pay-on-delivery is tracked here too.
import { api, esc, money, moneyIn, getCurrency, toast, modal, dateTime, pager, withBusy, inrHint, store } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';
import { ART } from './wallet-art.js';
import { addMoney, area, refresh, SECTION_LABEL, downloadCsv, filterBtn, openFilters, countActive, moneyTabs } from './ui.js';

// What each line in the statement is, from its description.
const KIND = [
  [/added|top.?up|deposit/i, 'wallet', 'green', 'Money added'], [/refund/i, 'returnbox', 'blue', 'Refund'], [/cashback|reward/i, 'gift', 'amber', 'Cashback'],
  [/withdraw/i, 'bank', 'violet', 'Withdrawal'], [/recharge/i, 'phone', 'green', 'Recharge'], [/fastag/i, 'fastag', 'coral', 'FASTag'],
  [/flight|indigo|air india|akasa|spicejet/i, 'plane', 'blue', 'Flight'], [/train/i, 'train', 'green', 'Train'], [/bus/i, 'bus', 'coral', 'Bus'],
  [/hotel|stay|room/i, 'hotel', 'violet', 'Stay'], [/shopify|woocommerce|wix|website/i, 'cart', 'green', 'Website order'], [/\bride\b|rapido|uber|\bola\b/i, 'ride', 'amber', 'Ride'], [/courier|parcel/i, 'parcel', 'amber', 'Courier'],
  [/truck|load|logistics/i, 'truck', 'blue', 'Logistics'], [/wheeler|vehicle|bike|auto/i, 'bike', 'green', 'Vehicle'], [/international|dhl|export/i, 'globe', 'violet', 'International'],
  [/bill|electric|water|gas|broadband|bescom|insurance|loan|rent/i, 'bill', 'amber', 'Bill'], [/gift card|voucher/i, 'gift', 'rose', 'Gift card'], [/gold|silver/i, 'coin', 'amber', 'Gold & silver'],
  [/sent to|transfer|upi/i, 'rupee', 'green', 'Transfer'],
];
const kindOf = (t) => (KIND.find(([re]) => re.test(t.note)) || [null, t.type === 'credit' ? 'wallet' : 'receipt', t.type === 'credit' ? 'green' : 'blue', t.type === 'credit' ? 'Money in' : 'Payment']).slice(1);
const DONUT = ['#0e7c66', '#2a78d6', '#e6a23c', '#6250d6', '#eb6834', '#d14f82', '#2fb37a', '#8a9a95'];
const dayLabel = (iso) => {
  const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

function donut(rows) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (!total) return '<p class="muted notop">Nothing spent in the last 30 days.</p>';
  const R = 52; const C = 2 * Math.PI * R; let off = 0;
  const arcs = rows.map((r, i) => { const len = (r.amount / total) * C; const a = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${DONUT[i % DONUT.length]}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" style="--d:${i * 90}ms"/>`; off += len; return a; }).join('');
  return `<div class="wl-donut"><svg viewBox="0 0 140 140" aria-hidden="true"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--surface-2, #eef2f1)" stroke-width="18"/><g transform="rotate(-90 70 70)">${arcs}</g></svg><div class="wl-donut__c"><small>Spent</small><b translate="no">${esc(money(total))}</b></div></div>
    <ul class="wl-legend">${rows.map((r, i) => `<li style="--i:${i}"><i style="background:${DONUT[i % DONUT.length]}"></i><span>${esc(SECTION_LABEL[r.section] || r.section)}</span><b translate="no">${esc(money(r.amount))}</b><small>${Math.round((r.amount / total) * 100)}%</small></li>`).join('')}</ul>`;
}

export async function render(view, { query }) {
  const page = Number(query.get('page')) || 1;
  const type = query.get('type') || '';
  const days = query.get('days') || ''; const min = query.get('min') || '';
  const WF = [{ key: 'days', label: 'Date', options: [['', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']] }, { key: 'min', label: 'Minimum amount (₹)', placeholder: 'Any' }];
  view.innerHTML = '<div class="skeleton" style="height:260px;border-radius:22px"></div>';
  const [w, rw] = await Promise.all([api('/hub/wallet', { query: { page, type, days, min, per_page: 12 } }), api('/hub/rewards').catch(() => null)]);
  const other = getCurrency() === 'INR' ? 'USD' : 'INR';
  const link = (patch) => { const q = new URLSearchParams({ type, days, min, ...patch }); ['type', 'days', 'min'].forEach((k) => { if (!q.get(k)) q.delete(k); }); return `#/wallet?${q}`; };
  const tier = rw && rw.tier ? rw.tier : { name: 'Silver' };
  const low = w.balance < (w.rule.threshold || 500);

  view.innerHTML = `${moneyTabs('wallet')}
    <div class="page-head wl2-head"><div class="row head-t">${tile('wallet', 'green').value}<div><h1>Wallet</h1><p>One balance for transport, travel, recharges, bills and business payments.</p></div></div>
      <div class="row"><a class="btn btn-outline" href="#/pay/send">${icon('rupee', 16)}Send money</a><button class="btn btn-outline" id="wd" type="button">${icon('bank', 16)}Withdraw</button><button class="btn btn-outline" id="csv" type="button">${icon('download', 16)}Statement</button></div></div>

    <div class="wl2-kpis">
      <section class="card wl2-k wl2-k--bal" style="--i:0"><span class="wl2-art">${ART.wallet}</span>
        <div class="wl2-k__top"><span class="wl2-k__ico">${icon('wallet', 17)}</span><span>Wallet balance</span><button class="wl2-eye" id="eye" type="button" aria-label="Hide balance" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
        <b class="wl2-k__v" id="bal" translate="no" data-count="${w.balance}" data-fmt="money">${esc(money(w.balance))}</b>
        <small class="wl2-k__n ${low ? 'is-low' : ''}">${low ? `${icon('alert', 13)}Below ${esc(money(w.rule.threshold || 500))}. Add money to keep booking.` : `≈ ${esc(moneyIn(w.balance, other))}`}</small>
        <button class="btn btn-primary wl2-add" id="add" type="button">${icon('plus', 16)}Add money</button>
      </section>
      <section class="card wl2-k" style="--i:1"><span class="wl2-art">${ART.in}</span><div class="wl2-k__top"><span class="wl2-k__ico wl2-k__ico--in">${icon('plus', 17)}</span><span>Money in · 30 days</span></div>
        <b class="wl2-k__v" translate="no" data-count="${w.added_30}" data-fmt="money">${esc(money(w.added_30))}</b><small class="wl2-k__n">Top-ups, refunds and cashback</small><div class="wl2-spark" id="line"></div></section>
      <section class="card wl2-k" style="--i:2"><span class="wl2-art">${ART.out}</span><div class="wl2-k__top"><span class="wl2-k__ico wl2-k__ico--out">${icon('trend', 17)}</span><span>Money out · 30 days</span></div>
        <b class="wl2-k__v" translate="no" data-count="${w.spent_30}" data-fmt="money">${esc(money(w.spent_30))}</b><small class="wl2-k__n">Across ${w.by_section.length} ${w.by_section.length === 1 ? 'service' : 'services'}</small>
</section>
      <a class="card wl2-k" style="--i:3" href="#/rewards"><span class="wl2-art">${ART.points}</span><div class="wl2-k__top"><span class="wl2-k__ico wl2-k__ico--pts">${icon('star', 17)}</span><span>Reward points</span><em class="wl2-tier">${esc(tier.name)}</em></div>
        <b class="wl2-k__v" data-count="${rw ? rw.points : 0}">${rw ? rw.points.toLocaleString('en-IN') : '—'}</b>
        ${rw && rw.tier && rw.tier.next ? `<span class="wl2-prog"><i style="width:${Math.min(100, Math.round((rw.tier.spend / rw.tier.next.at) * 100))}%"></i></span><small class="wl2-k__n">${esc(money(rw.tier.next.need))} more spend for ${esc(rw.tier.next.name)}</small>` : '<small class="wl2-k__n">Top tier reached</small>'}</a>
    </div>

    <div class="dash dash--even wl2-main">
      <section class="card wl2-tx">
        <div class="wl2-tx__h"><h2 class="notop">Transactions</h2><div class="row"><nav class="wl-seg" aria-label="Show">${[['', 'All'], ['credit', 'Money in'], ['debit', 'Money out']].map(([k, l]) => `<a href="${link({ type: k, page: 1 })}" class="${k === type ? 'on' : ''}">${l}</a>`).join('')}</nav>${filterBtn(countActive(WF, { days, min }))}</div></div>
        ${w.data.length ? `<div class="table-wrap wl2-table"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th style="text-align:end">Amount</th></tr></thead><tbody>${w.data.map((t, i) => { const [ic, tone, what] = kindOf(t); return `<tr style="--i:${i}"><td class="nowrap"><b>${esc(dayLabel(t.at))}</b><small>${esc(new Date(t.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))}</small></td><td><div class="wl2-desc">${tile(ic, tone).value}<span>${esc(t.note)}</span></div></td><td><span class="wl2-type wl2-type--${t.type}">${esc(what)}</span></td><td style="text-align:end"><b translate="no" class="wl-amt ${t.type === 'credit' ? 'in' : 'out'}">${t.type === 'credit' ? '+' : '−'}${esc(money(t.amount))}</b></td></tr>`; }).join('')}</tbody></table></div>` : `<div class="wl-empty"><span class="wl2-emptyart">${ART.empty}</span><b>No transactions here</b><small>Try another filter, or add money to get started.</small></div>`}
        <div id="pg"></div>
      </section>
      <aside class="dash__side">
        <section class="card"><div class="wl2-side-h"><h2 class="notop">Spend by service</h2><small>Last 30 days</small></div>${donut(w.by_section)}</section>
        <section class="card wl-auto ${w.rule.enabled ? 'is-on' : ''}" id="auto">
          <div class="wl-auto__h"><span class="wl-auto__ico wl-auto__ico--art">${ART.auto}</span><div class="grow"><b>Auto top-up</b><small id="autoTxt">${w.rule.enabled ? `When the balance drops below ${esc(money(w.rule.threshold))}, add ${esc(money(w.rule.amount))} from ${esc(w.rule.source)}.` : 'Never run out mid-booking. Top up automatically when the balance runs low.'}</small></div><label class="switch"><input type="checkbox" id="autoOn" ${w.rule.enabled ? 'checked' : ''} aria-label="Auto top-up"><i></i></label></div>
          <a class="link small" href="#/autopay">Change amount and source</a></section>
        <section class="card wl-how"><h2 class="notop">How payment works</h2><ul>
          <li><span class="wl2-how">${ART.prepaid}</span><div><b>Prepaid</b><small>Taken from this wallet when you book, after your PIN.</small></div></li>
          <li><span class="wl2-how">${ART.refund}</span><div><b>Refunds and cashback</b><small>Land back here at once.</small></div></li></ul></section>
      </aside>
    </div>`;
  area(view.querySelector('#line'), w.series);
  view.querySelector('#pg').appendChild(pager(w.meta, (pg) => { location.hash = link({ page: pg }); }));
  const again = () => render(view, { query });
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, WF, { days, min }, (v) => { location.hash = link({ ...v, page: 1 }); }));
  view.querySelector('#add').addEventListener('click', () => addMoney().then((ok) => ok && again()));
  view.querySelector('#wd').addEventListener('click', () => withdraw(w.balance, again));
  view.querySelector('#csv').addEventListener('click', () => downloadCsv('ut-log-wallet.csv', [['Date', 'Type', 'Amount INR', 'Description'], ...w.data.map((t) => [t.at, t.type, t.amount, t.note])]));
  const eye = view.querySelector('#eye');
  eye.addEventListener('click', () => { const hide = eye.getAttribute('aria-pressed') !== 'true'; eye.setAttribute('aria-pressed', String(hide)); eye.setAttribute('aria-label', hide ? 'Show balance' : 'Hide balance'); view.querySelector('#bal').textContent = hide ? '₹ ••••••' : money(w.balance); });
  // Turn auto top-up on or off right here.
  view.querySelector('#autoOn').addEventListener('change', async (e) => {
    try {
      const r = await api('/hub/autopay/wallet', { method: 'POST', body: { ...w.rule, enabled: e.target.checked } });
      w.rule = r; view.querySelector('#auto').classList.toggle('is-on', r.enabled);
      view.querySelector('#autoTxt').textContent = r.enabled ? `When the balance drops below ${money(r.threshold)}, add ${money(r.amount)} from ${r.source}.` : 'Never run out mid-booking. Top up automatically when the balance runs low.';
      toast(r.enabled ? 'Auto top-up is on' : 'Auto top-up is off');
    } catch (x) { e.target.checked = !e.target.checked; toast(x.message, true); }
  });
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
