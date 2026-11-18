// Business credit and carrier connections.
//   Business credit: a monthly credit line, what is used, the statement and repayment from the wallet.
//   Carrier connections: each partner's API link, sandbox or live, health, test calls and a call log.
import { api, esc, money, toast, modal, withBusy, dateTime, date } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';
import { refresh } from './ui.js';

const head = (ic, tone, title, intro, right = '') => `<div class="page-head ph-hero"><div class="row head-t">${tile(ic, tone).value}<div><h1>${esc(title)}</h1><p>${esc(intro)}</p></div></div><div class="row">${right}</div></div>`;

// ---- business credit ---------------------------------------------------------------------------
export async function renderCredit(view) {
  view.innerHTML = '<div class="skeleton" style="height:260px"></div>';
  const c = await api('/hub/credit');
  const again = () => renderCredit(view);
  if (!c.business) {
    view.innerHTML = `${head('card', 'violet', 'Business credit', 'Book now, pay once a month.')}<section class="card"><p class="notop">Business credit is for business accounts. Switch to Business with the switch in the top bar, then come back here.</p></section>`;
    return;
  }
  if (!c.active) {
    view.innerHTML = `${head('card', 'violet', 'Business credit', 'Book now, pay once a month.')}
      <section class="card cr-offer"><div class="cr-offer__t"><h2 class="notop">Get up to ${esc(money(100000))} of credit</h2><p>Charge trucks, vehicles and couriers to one monthly statement instead of topping up the wallet before every booking.</p>
        <ul class="cr-points"><li>${icon('calendar', 16)}Statement on the 1st, pay by the 15th: up to 45 days, no interest</li><li>${icon('receipt', 16)}One GST invoice for the month</li><li>${icon('shield', 16)}Wallet PIN still approves every charge</li></ul>
        <button class="btn btn-primary" id="crOn" type="button">${icon('check', 16)}Turn on business credit</button><p class="muted small">Demo: the limit is approved at once. A real lender checks GST returns, bank statements and a credit score first.</p></div><div class="cr-art" aria-hidden="true"><div class="cr-card"><span class="cr-card__chip"></span><span class="cr-card__brand">UT Log · Business</span><b class="cr-card__amt">${esc(money(100000))}</b><small>Credit limit</small><span class="cr-card__foot"><span>45 days</span><span>0% interest</span></span></div><div class="cr-card cr-card--back"></div></div></section>`;
    view.querySelector('#crOn').addEventListener('click', (e) => withBusy(e.currentTarget, async () => { try { await api('/hub/credit/apply', { method: 'POST' }); toast('Business credit is on'); again(); } catch (x) { toast(x.message, true); } }));
    return;
  }
  const pct = c.limit ? Math.round((c.used / c.limit) * 100) : 0;
  view.innerHTML = `${head('card', 'violet', 'Business credit', c.cycle, `<button class="btn btn-primary" id="crPay" type="button" ${c.used ? '' : 'disabled'}>${icon('wallet', 16)}Repay</button>`)}
    <div class="dash dash--even"><div class="dash__main">
      <section class="card cr-meter"><div class="cr-meter__n"><div><small>Available</small><b translate="no">${esc(money(c.available))}</b></div><div><small>Used</small><b translate="no">${esc(money(c.used))}</b></div><div><small>Limit</small><b translate="no">${esc(money(c.limit))}</b></div><div><small>Pay by</small><b>${esc(date(c.due_date))}</b></div></div>
        <div class="cr-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Credit used"><i style="width:${pct}%"></i></div><small class="muted">${pct}% used · this month ${esc(money(c.this_month.spent))} charged, ${esc(money(c.this_month.repaid))} repaid</small></section>
      <section class="card"><div class="card__head"><h2>Statement</h2></div>${c.ledger.length ? `<ul class="feed">${c.ledger.map((l) => `<li>${tile(l.type === 'repay' ? 'wallet' : 'truck', l.type === 'repay' ? 'green' : 'blue').value}<div class="feed__t"><b>${esc(l.note)}</b><small>${esc(dateTime(l.at))}${l.ref ? ` · <a class="link" href="#/my/orders/${esc(l.ref)}">${esc(l.ref)}</a>` : ''}</small></div><div class="feed__r"><b translate="no" class="${l.type === 'repay' ? 'pos' : ''}">${l.type === 'repay' ? '− ' : ''}${esc(money(l.amount))}</b></div></li>`).join('')}</ul>` : '<p class="muted notop">Nothing charged yet. Pick "Business credit" when you pay for a booking.</p>'}</section>
    </div><aside class="dash__side"><section class="card cr-help"><b>How it works</b><ol><li>At checkout, pay from <b>Business credit</b>.</li><li>Every charge joins this month's statement.</li><li>Repay from the wallet any time; the full amount is due on the 15th.</li></ol><p class="muted small">Late payment pauses credit until it is cleared. Demo: no interest or fees are charged.</p></section></aside></div>`;
  const pay = view.querySelector('#crPay');
  if (pay) pay.addEventListener('click', () => modal({
    title: 'Repay business credit',
    body: `<p class="notop">You owe <b translate="no">${esc(money(c.used))}</b>. Repay from your wallet.</p><label class="field">Amount (₹)<input class="input" id="crAmt" inputmode="numeric" value="${c.used}"></label><p class="form-error" id="crE"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="crGo">Repay</button>',
    onMount(el, close) { el.querySelector('#crGo').addEventListener('click', (e) => withBusy(e.currentTarget, async () => { try { await api('/hub/credit/repay', { method: 'POST', body: { amount: el.querySelector('#crAmt').value } }); close(true); toast('Repaid'); refresh(); again(); } catch (x) { el.querySelector('#crE').textContent = x.message; } })); },
  }));
}

// ---- carrier connections ----------------------------------------------------------------------
export async function renderCarriers(view) {
  view.innerHTML = '<div class="skeleton" style="height:260px"></div>';
  const d = await api('/hub/carriers');
  const again = () => renderCarriers(view);
  const kinds = [...new Set(d.data.map((c) => c.kind))];
  const row = (c) => `<tr data-c="${esc(c.name)}"><td><b>${esc(c.name)}</b><small class="muted block">${c.bookings_7d} booking${c.bookings_7d === 1 ? '' : 's'} in 7 days</small></td>
    <td><span class="cx-mode cx-mode--${c.mode}">${c.mode === 'live' ? 'Live' : 'Sandbox'}</span></td>
    <td><span class="cx-health cx-health--${c.health}"><i></i>${c.health === 'ok' ? 'Healthy' : 'Slow'}</span><small class="muted block">${c.uptime}% up · ${c.p95_ms} ms</small></td>
    <td>${c.rate_sync_min} min ago<small class="muted block">Webhooks ${c.webhooks_ok}% delivered</small></td>
    <td class="cx-act"><button class="btn btn-outline btn-sm" type="button" data-test>Test</button>${c.mode === 'live' ? '<button class="link" type="button" data-mode="sandbox">Use sandbox</button>' : c.agreement ? '<button class="btn btn-primary btn-sm" type="button" data-mode="live">Go live</button>' : '<button class="link" type="button" data-sign>Sign agreement</button>'}</td></tr>`;
  view.innerHTML = `${head('plug', 'green', 'Carrier connections', 'Every partner\'s API: rates, booking, tracking and cancelling.', '<a class="btn btn-outline" href="#/business/integrations">All integrations</a>')}
    <div class="cx-sum"><div class="card"><small>Live</small><b>${d.live} of ${d.total}</b></div><div class="card"><small>Healthy</small><b>${d.data.filter((c) => c.health === 'ok').length}</b></div><div class="card"><small>Bookings via API, 7 days</small><b>${d.data.reduce((t, c) => t + c.bookings_7d, 0)}</b></div><div class="card"><small>Average response</small><b>${Math.round(d.data.reduce((t, c) => t + c.p95_ms, 0) / d.data.length)} ms</b></div></div>
    <p class="callout mb">Demo: every connection is simulated. Going live with a partner needs a signed agreement, their production API keys and permission to use their name.</p>
    <div class="dash dash--even"><div class="dash__main">${kinds.map((k) => `<section class="card"><div class="card__head"><h2>${esc(k)}</h2></div><div class="table-wrap"><table class="cx-t"><thead><tr><th>Partner</th><th>Mode</th><th>Health</th><th>Rates synced</th><th></th></tr></thead><tbody>${d.data.filter((c) => c.kind === k).map(row).join('')}</tbody></table></div></section>`).join('')}</div>
    <aside class="dash__side"><section class="card"><div class="card__head"><h2>Call log</h2></div>${d.log.length ? `<ul class="cx-log">${d.log.map((l) => `<li><span class="cx-code cx-code--${l.status < 300 ? 'ok' : 'bad'}">${l.status}</span><div><b>${esc(l.carrier)}</b><small>${esc(l.call)} · ${esc(l.mode)}${l.ms ? ` · ${l.ms} ms` : ''}</small></div><small class="muted">${esc(dateTime(l.at))}</small></li>`).join('')}</ul>` : '<p class="muted notop">Run a test to see calls here.</p>'}</section></aside></div>`;
  view.onclick = async (e) => {
    const tr = e.target.closest('[data-c]'); if (!tr) return;
    const name = tr.dataset.c;
    if (e.target.closest('[data-sign]')) {
      return modal({ title: `Agreement with ${name}`, body: `<p class="notop">This records that UT Log has a signed reseller agreement with ${esc(name)}, covering rates, liability for lost goods, payment terms and use of their name.</p><p class="callout">Demo: nothing is signed for real.</p>`, footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="sg">Mark as signed</button>', onMount(el, close) { el.querySelector('#sg').addEventListener('click', async () => { try { await api('/hub/carriers/agreement', { method: 'POST', body: { name } }); close(true); toast('Agreement recorded'); again(); } catch (x) { toast(x.message, true); } }); } });
    }
    const m = e.target.closest('[data-mode]');
    if (m) { try { await api('/hub/carriers/mode', { method: 'POST', body: { name, mode: m.dataset.mode } }); toast(m.dataset.mode === 'live' ? `${name} is live` : `${name} is back on sandbox`); again(); } catch (x) { toast(x.message, true); } return; }
    if (e.target.closest('[data-test]')) {
      modal({
        title: `Test ${name}`,
        body: `<div class="seg cx-calls" role="group" aria-label="API call">${[['rates', 'Get rates'], ['book', 'Book'], ['track', 'Track'], ['cancel', 'Cancel']].map(([k, l], i) => `<button type="button" data-call="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div><pre class="cx-out" id="cxOut">Pick a call and press Run.</pre>`,
        footer: '<button class="btn btn-outline" data-close>Close</button><button class="btn btn-primary" id="cxRun">Run</button>',
        onMount(el) {
          let call = 'rates';
          el.querySelectorAll('[data-call]').forEach((b) => b.addEventListener('click', () => { call = b.dataset.call; el.querySelectorAll('[data-call]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
          el.querySelector('#cxRun').addEventListener('click', (ev) => withBusy(ev.currentTarget, async () => {
            const out = el.querySelector('#cxOut'); out.textContent = 'Calling…';
            try { const r = await api('/hub/carriers/test', { method: 'POST', body: { name, call } }); out.textContent = `${r.call}  →  ${r.status} in ${r.ms} ms\n\n${JSON.stringify(r.response, null, 2)}`; out.className = `cx-out ${r.ok ? '' : 'bad'}`; }
            catch (x) { out.textContent = x.message; }
          }));
        },
      }).then(() => again());
    }
  };
}
