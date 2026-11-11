// Mobile recharge, FASTag, business payments and auto-pay. Bills and Send Money are in bills.js.
import { api, esc, money, store, toast, modal, withBusy, dateTime, formData, inrHint, date } from '../core.js';
import { tile } from './art.js';
import { deskTabs } from './desk.js';
import { payMethods, checkout, PAY_LABEL } from './checkout.js';
import { emptyScene, statusPill, withFunds, refresh, filterBtn, openFilters, countActive } from './ui.js';

let catalog = null;
export const getCatalog = async () => { if (!catalog) catalog = await api('/hub/catalog'); return catalog; };
export const head = (icon, tone, title, intro) => `<div class="page-head"><div class="row head-t">${tile(icon, tone).value}<div><h1>${esc(title)}</h1><p>${esc(intro)}</p></div></div></div>`;
const canSee = (m) => { const p = store.state.user && store.state.user.permissions; return !p || (p[m] || 'none') !== 'none'; };
export const payTabs = (a) => `${canSee('recharge') ? deskTabs('pay', 'book') : ''}<nav class="tabs tabs--sub">${[['mobile', 'Mobile recharge', '#/pay/mobile', 'recharge'], ['fastag', 'FASTag', '#/pay/fastag', 'recharge'], ['bills', 'Bills & more', '#/pay/bills', 'recharge'], ['send', 'Send money', '#/pay/send', 'recharge'], ['autopay', 'Auto-pay', '#/autopay', 'autopay'], ...(store.state.accountType === 'business' ? [['business', 'Business payments', '#/pay/business', 'bizpay']] : [])].filter((t) => canSee(t[3])).map(([k, l, h]) => `<a href="${h}" class="${k === a ? 'active' : ''}">${l}</a>`).join('')}</nav>`;
export const options = (list, value) => list.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('');

export async function historyCard(el, section, kindFilter) {
  const r = await api('/hub/orders', { query: { section, per_page: 50 } });
  const all = r.data.filter(kindFilter || (() => true));
  const fields = [{ key: 'days', label: 'Date', options: [['', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days']] }];
  const f = { days: '' };
  const draw = () => {
    const since = f.days ? Date.now() - f.days * 864e5 : 0;
    const rows = all.filter((x) => Date.parse(x.at) >= since).slice(0, 5);
    el.innerHTML = `<div class="card__head"><h2>Recent payments</h2><div class="row">${filterBtn(countActive(fields, f), 'hF')}<a class="link" href="#/pay/orders">View all</a></div></div>${rows.length ? `<ul class="feed">${rows.map((x) => `<li><div class="feed__t"><b>${esc(x.title)}</b><small>${esc(x.provider)} · ${esc(x.sub || '')}${x.pay_via ? ` · ${PAY_LABEL[x.pay_via]}` : ''}</small></div><div class="feed__r"><b translate="no">${esc(money(x.amount))}</b><small>${esc(dateTime(x.at))}</small></div>${statusPill(x)}</li>`).join('')}</ul>` : '<p class="muted notop">No payments yet.</p>'}`;
    el.querySelector('#hF').onclick = (e) => openFilters(e.currentTarget, fields, f, (v) => { f.days = v.days; draw(); });
  };
  draw();
}
export async function pay(btn, errEl, run, done, root) {
  errEl.textContent = '';
  await withBusy(btn, async () => {
    try {
      // Check the details first, so nobody pays for something that would be rejected.
      const check = await run({ dry_run: true });
      const extra = await checkout(root, check.amount);
      if (!extra) return;
      const r = await withFunds(() => run(extra));
      refresh(); done(r);
    } catch (e) { if (!e.quiet) errEl.textContent = e.message; }
  });
}

// ---- mobile -----------------------------------------------------------------------
export async function renderMobile(view, { query }) {
  const c = await getCatalog();
  view.innerHTML = `${head('phone', 'green', 'Mobile Recharge', 'Prepaid plans for every operator.')}${payTabs('mobile')}
    <div class="dash dash--even"><section class="card"><form id="mf" class="form-grid" novalidate>
      <label class="field full">Mobile number<input class="input input--lg" name="number" inputmode="numeric" maxlength="10" placeholder="10-digit number" value="${esc(query.get('number') || '')}"></label>
      <label class="field">Operator<select class="select" name="operator">${options(c.operators)}</select></label><label class="field">Circle<select class="select" name="circle">${options(c.circles)}</select></label></form>
      <div class="section-head mt"><h2 class="notop">Choose a plan</h2><span id="plF"></span></div><div id="plans" class="plans"></div>
      <label class="row mt"><input type="checkbox" class="check" id="auto"> Recharge this number automatically when the plan ends</label>
      <div class="mt">${payMethods()}</div><p class="form-error" id="err"></p><button class="btn btn-primary btn-block mt" id="go" disabled>Select a plan</button></section>
      <aside class="dash__side"><section class="card" id="hist"></section></aside></div>`;
  const form = view.querySelector('#mf'); const go = view.querySelector('#go'); const plansEl = view.querySelector('#plans');
  let plans = []; let chosen = null; const planF = { kind: '' };
  async function load() {
    const r = await api('/hub/plans', { query: { operator: form.operator.value } });
    plans = r.plans; chosen = null; draw();
  }
  function draw() {
    const PF = [{ key: 'kind', label: 'Plan type', options: [['', 'All plans'], ['long', '84 days or more'], ['data', 'Data packs'], ['roaming', 'Roaming']] }];
    view.querySelector('#plF').innerHTML = filterBtn(countActive(PF, planF), 'pfB');
    view.querySelector('#pfB').onclick = (e) => openFilters(e.currentTarget, PF, planF, (v) => { planF.kind = v.kind; draw(); });
    const shownPlans = plans.filter((p) => (planF.kind === 'long' ? parseInt(p.validity, 10) >= 84 : planF.kind === 'data' ? p.tag === 'Data pack' : planF.kind === 'roaming' ? p.tag === 'Roaming' : true));
    plansEl.innerHTML = shownPlans.map((p) => `<button type="button" class="plan" data-p="${p.id}" aria-pressed="${p.id === chosen}"><b translate="no">${esc(money(p.price))}</b><span>${esc(p.data)}</span><small>${esc(p.validity)}</small>${p.tag ? `<em>${esc(p.tag)}</em>` : ''}</button>`).join('');
    const p = plans.find((x) => x.id === chosen);
    go.disabled = !p; go.textContent = p ? `Pay ${money(p.price)}` : 'Select a plan';
  }
  form.operator.addEventListener('change', load);
  plansEl.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { chosen = b.dataset.p; draw(); } });
  const hist = () => historyCard(view.querySelector('#hist'), 'recharge', (x) => /Mobile/.test(x.title));
  go.addEventListener('click', () => pay(go, view.querySelector('#err'), (x) => api('/hub/recharge/mobile', { method: 'POST', body: { number: form.number.value, operator: form.operator.value, plan_id: chosen, auto: view.querySelector('#auto').checked, ...x } }), (r) => { toast(`Recharge successful · ${r.id}`); form.number.value = ''; chosen = null; draw(); hist(); }, view));
  await load(); hist();
}

// ---- FASTag -----------------------------------------------------------------------
export async function renderFastag(view) {
  const c = await getCatalog();
  view.innerHTML = `${head('fastag', 'coral', 'FASTag', 'Check your balance, recharge, and never get stuck at a toll.')}${payTabs('fastag')}
    <div class="dash dash--even"><section class="card"><form id="ff" class="form-grid" novalidate>
      <label class="field full">Vehicle number<input class="input input--lg" name="vehicle_no" placeholder="KA 05 MN 4821" style="text-transform:uppercase"></label>
      <label class="field full">Issuing bank<select class="select" name="issuer">${options(c.fastag_issuers)}</select></label>
      <div class="full" id="bal"></div>
      <label class="field full">Recharge amount (₹)<input class="input" name="amount" inputmode="numeric" value="500"><small class="muted" id="fx"></small></label>
      <div class="row full">${[200, 500, 1000, 2000].map((a) => `<button type="button" class="btn btn-outline btn-sm" data-a="${a}">₹${a.toLocaleString('en-IN')}</button>`).join('')}</div>
      <label class="row full"><input type="checkbox" class="check" name="auto" id="auto"> Recharge automatically when the balance runs low</label>
      <div class="form-grid full" id="autoBox" hidden><label class="field">When balance is below (₹)<input class="input" name="threshold" inputmode="numeric" value="200"></label><label class="field">Add this amount (₹)<input class="input" name="auto_amount" inputmode="numeric" value="500"></label></div>
      ${payMethods()}</form><p class="form-error" id="err"></p><div class="row mt"><button class="btn btn-outline" id="check" type="button">Check balance</button><button class="btn btn-primary grow" id="go" type="button">Recharge FASTag</button></div></section>
      <aside class="dash__side"><section class="card" id="hist"></section></aside></div>`;
  const form = view.querySelector('#ff'); const err = view.querySelector('#err');
  const fx = () => { view.querySelector('#fx').textContent = inrHint(form.amount.value); };
  form.amount.addEventListener('input', fx); fx();
  view.querySelector('#auto').addEventListener('change', (e) => { view.querySelector('#autoBox').hidden = !e.target.checked; });
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) { form.amount.value = b.dataset.a; fx(); } });
  const hist = () => historyCard(view.querySelector('#hist'), 'recharge', (x) => /FASTag/.test(x.title));
  view.querySelector('#check').addEventListener('click', async () => {
    err.textContent = '';
    try { const r = await api('/hub/fastag/lookup', { method: 'POST', body: { vehicle_no: form.vehicle_no.value } }); view.querySelector('#bal').innerHTML = `<p class="callout notop">Balance for <b>${esc(r.vehicle_no)}</b>: <b translate="no">${esc(money(r.balance))}</b></p>`; }
    catch (e) { err.textContent = e.message; }
  });
  const go = view.querySelector('#go');
  go.addEventListener('click', () => { const d = formData(form); delete d.pm; pay(go, err, (x) => api('/hub/recharge/fastag', { method: 'POST', body: { ...d, auto: !!d.auto, ...x } }), (r) => { toast(`FASTag recharged · new balance ${money(r.balance)}`); view.querySelector('#bal').innerHTML = ''; hist(); }, view); });
  hist();
}

// ---- business payments -----------------------------------------------------------------
const BIZ_ICON = { vendor: ['team', 'green'], gst: ['percent', 'amber'], tds: ['receipt', 'blue'], rent: ['building', 'violet'], payroll: ['user', 'coral'], freight: ['truck', 'blue'], customs: ['globe', 'green'], saas: ['plug', 'violet'], pf: ['shield', 'green'], ptax: ['receipt', 'amber'], advtax: ['percent', 'coral'], utilities: ['electric', 'amber'] };
export async function renderBusiness(view, { query }) {
  if (store.state.accountType !== 'business') { view.innerHTML = `<div class="card">${emptyScene('Business payments are part of a Business account. Switch using the Personal / Business control at the top.', null, 'carton')}</div>`; return; }
  const c = await getCatalog();
  const type = c.business_types[query.get('type')] ? query.get('type') : 'vendor';
  const t = c.business_types[type];
  view.innerHTML = `${head('briefcase', 'green', 'Business Payments', 'Vendors, taxes, rent, payroll and freight invoices in one place.')}${payTabs('business')}
    <section class="card bh-sec"><h2>Pay for your business</h2><div class="bh-grid">${Object.entries(c.business_types).map(([k, v]) => `<a class="bh-tile ${k === type ? 'on' : ''}" href="#/pay/business?type=${k}">${tile(...(BIZ_ICON[k] || ['briefcase', 'green'])).value}<span>${esc(v.label)}</span></a>`).join('')}</div></section>
    <div class="dash dash--even"><section class="card"><h2>${esc(t.label)}</h2><form id="pf" class="form-grid" novalidate>
      <label class="field full">${esc(t.payee)}<input class="input" name="payee"></label><label class="field">${esc(t.ref)}<input class="input" name="reference"></label><label class="field">Amount (₹)<input class="input" name="amount" inputmode="numeric"><small class="muted" id="fx"></small></label>${payMethods()}</form>
      <p class="form-error" id="err"></p><button class="btn btn-primary btn-block mt" id="go" type="button">Pay now</button></section>
      <aside class="dash__side"><section class="card" id="hist"></section></aside></div>`;
  const form = view.querySelector('#pf'); const go = view.querySelector('#go');
  form.amount.addEventListener('input', () => { view.querySelector('#fx').textContent = inrHint(form.amount.value); });
  const hist = () => historyCard(view.querySelector('#hist'), 'business');
  go.addEventListener('click', () => pay(go, view.querySelector('#err'), (x) => { const d = formData(form); delete d.pm; return api('/hub/business/pay', { method: 'POST', body: { type, ...d, ...x } }); }, (r) => { toast(`Payment done · ${r.id}`); form.reset(); hist(); }, view));
  hist();
}

// ---- auto-pay ---------------------------------------------------------------------------
const ACCOUNT = { fastag: ['fastag', 'coral', 'FASTag'], mobile: ['phone', 'green', 'Mobile'], bill: ['bill', 'blue', 'Bill'], transfer: ['rupee', 'violet', 'Regular payment'] };
export async function renderAutopay(view) {
  view.innerHTML = `<div class="page-head"><div class="row head-t">${tile('repeat', 'violet').value}<div><h1>Auto-pay</h1><p>Connect accounts once. They recharge from your wallet by themselves.</p></div></div><button class="btn btn-primary" id="add">+ Connect account</button></div>${payTabs('autopay')}<div id="body"><div class="skeleton" style="height:220px"></div></div>`;
  const body = view.querySelector('#body');
  const af = { type: '' };
  const AF = [{ key: 'type', label: 'Account type', options: [['', 'All'], ['fastag', 'FASTag'], ['mobile', 'Mobile'], ['bill', 'Bill']] }];
  async function load() {
    const [d, sum] = await Promise.all([api('/hub/autopay'), api('/hub/summary')]);
    const w = d.wallet_rule;
    body.innerHTML = `
      <section class="card autopay-wallet">${tile('wallet', 'green').value}<div class="grow"><h2 class="notop">Wallet auto top-up</h2><p class="muted small notop">Adds money from your saved source when the wallet runs low. Current balance: <b translate="no">${esc(money(d.wallet_balance))}</b></p></div>
        <form id="wr" class="wr"><label class="field">Below (₹)<input class="input" name="threshold" inputmode="numeric" value="${w.threshold}"></label><label class="field">Add (₹)<input class="input" name="amount" inputmode="numeric" value="${w.amount}"></label><label class="field">From<input class="input" name="source" value="${esc(w.source)}"></label><label class="switch"><input type="checkbox" name="enabled" ${w.enabled ? 'checked' : ''} aria-label="Wallet auto top-up"><i></i></label></form></section>
      ${sum.upcoming.length ? `<section class="card mt"><div class="card__head"><h2>Coming up</h2><button class="btn btn-primary btn-sm" data-pay-due type="button">Pay all due this week</button></div><div class="upcoming">${sum.upcoming.map((u) => `<div class="up"><span class="up__d"><b>${new Date(u.due + 'T00:00:00').getDate()}</b><small>${new Date(u.due + 'T00:00:00').toLocaleDateString(undefined, { month: 'short' })}</small></span><div class="grow"><b>${esc(u.provider)}</b><small class="muted block">${esc(u.label)}</small></div><div class="feed__r"><b translate="no">${esc(money(u.amount))}</b><small>${u.auto ? 'Auto-pay' : 'Reminder only'}</small></div></div>`).join('')}</div></section>` : ''}
      <div class="section-head mt"><h2 class="notop">Connected accounts</h2>${filterBtn(countActive(AF, af), 'accF')}</div>
      ${d.accounts.length ? `<div class="accts">${d.accounts.filter((a) => !af.type || a.type === af.type).map((a) => { const [ic, tone, name] = ACCOUNT[a.type]; return `<article class="card acct" data-id="${a.id}"><div class="row">${tile(ic, tone).value}<div class="grow"><b>${esc(name)} · ${esc(a.provider)}</b><small class="muted block">${esc(a.label)}</small></div><label class="switch"><input type="checkbox" data-auto ${a.auto ? 'checked' : ''} aria-label="Auto-pay for ${esc(a.label)}"><i></i></label></div>
        ${a.balance != null ? `<p class="acct__bal"><small>Balance</small><b translate="no">${esc(money(a.balance))}</b></p>` : ''}
        <div class="form-grid mt">${a.threshold != null ? `<label class="field">Recharge below (₹)<input class="input" data-f="threshold" inputmode="numeric" value="${a.threshold}"></label>` : ''}<label class="field">${a.threshold != null ? 'Add (₹)' : 'Pay each cycle (₹)'}<input class="input" data-f="amount" inputmode="numeric" value="${a.amount}"></label>${a.type !== 'fastag' ? `<label class="field">Remind me<select class="select" data-f="remind_days">${[1, 3, 5, 7].map((n) => `<option value="${n}" ${(a.remind_days || 3) === n ? 'selected' : ''}>${n} ${n === 1 ? 'day' : 'days'} before</option>`).join('')}</select></label>` : ''}</div>
        <p class="muted small">${a.last_run ? `Last auto-pay ${esc(dateTime(a.last_run))}` : 'No auto-pay has run yet.'}</p>
        <div class="row"><button class="btn btn-outline btn-sm" type="button" data-sim>${a.type === 'fastag' ? 'Simulate a toll' : 'Simulate due date'}</button><button class="btn btn-danger btn-sm" type="button" data-rm>Disconnect</button></div></article>`; }).join('')}</div>` : `<div class="card">${emptyScene('Connect a FASTag, mobile number or bill to start.', null, 'carton')}</div>`}`;
    body.querySelector('#accF').onclick = (e) => openFilters(e.currentTarget, AF, af, (v) => { af.type = v.type; load(); });
    body.querySelector('#wr').addEventListener('change', async (e) => {
      const f = e.currentTarget; const v = formData(f);
      try { await api('/hub/autopay/wallet', { method: 'POST', body: { ...v, enabled: f.enabled.checked } }); toast(f.enabled.checked ? 'Wallet auto top-up is on' : 'Wallet auto top-up is off'); refresh(); } catch (err) { toast(err.message, true); load(); }
    });
  }
  body.addEventListener('change', async (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    try {
      if (e.target.dataset.auto != null) { await api('/hub/autopay/update', { method: 'POST', body: { id, auto: e.target.checked } }); toast(e.target.checked ? 'Auto-pay on' : 'Auto-pay off'); refresh(); }
      else if (e.target.dataset.f) { await api('/hub/autopay/update', { method: 'POST', body: { id, [e.target.dataset.f]: e.target.value } }); toast('Saved'); }
    } catch (err) { toast(err.message, true); load(); }
  });
  body.addEventListener('click', async (e) => {
    if (e.target.closest('[data-pay-due]')) { try { const r = await withFunds(() => api('/hub/autopay/pay-due', { method: 'POST', body: {} })); toast(`Paid ${r.count} ${r.count === 1 ? 'bill' : 'bills'} · ${money(r.paid)}`); refresh(); load(); } catch (x) { if (!x.quiet) toast(x.message, true); } return; }
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    try {
      if (e.target.closest('[data-sim]')) {
        const r = await withFunds(() => api('/hub/autopay/simulate', { method: 'POST', body: { id } }));
        toast(r.paid ? `${r.event}. Auto-pay added ${money(r.paid)} from your wallet.` : `${r.event}. No auto-pay needed.`);
        refresh(); load();
      } else if (e.target.closest('[data-rm]')) { await api('/hub/autopay/remove', { method: 'POST', body: { id } }); toast('Account disconnected'); refresh(); load(); }
    } catch (err) { if (!err.quiet) toast(err.message, true); }
  });
  view.querySelector('#add').addEventListener('click', () => connect(load));
  await load();
}

async function connect(done) {
  const c = await getCatalog();
  const providers = { fastag: c.fastag_issuers, mobile: c.operators, bill: Object.values(c.billers).flatMap((b) => b.list) };
  modal({
    title: 'Connect an account',
    body: `<form class="form-grid" id="af" novalidate><label class="field full">Account type<select class="select" name="type"><option value="fastag">FASTag</option><option value="mobile">Mobile</option><option value="bill">Bill</option></select></label>
      <label class="field full">Provider<select class="select" name="provider"></select></label><label class="field full"><span id="lbl">Vehicle number</span><input class="input" name="label"></label>
      <label class="field" id="thr">Recharge below (₹)<input class="input" name="threshold" inputmode="numeric" value="200"></label><label class="field">Amount (₹)<input class="input" name="amount" inputmode="numeric" value="500"></label></form><p class="form-error" id="afErr"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="afGo">Connect</button>',
    onMount(el, close) {
      const f = el.querySelector('#af');
      const sync = () => { f.provider.innerHTML = options(providers[f.type.value]); el.querySelector('#lbl').textContent = { fastag: 'Vehicle number', mobile: 'Mobile number', bill: 'Account number' }[f.type.value]; el.querySelector('#thr').hidden = f.type.value !== 'fastag'; };
      f.type.addEventListener('change', sync); sync();
      const go = el.querySelector('#afGo');
      go.addEventListener('click', () => withBusy(go, async () => { try { await api('/hub/autopay/account', { method: 'POST', body: formData(f) }); toast('Account connected, auto-pay on'); close(true); done(); } catch (e) { el.querySelector('#afErr').textContent = e.message; } }));
    },
  });
}
