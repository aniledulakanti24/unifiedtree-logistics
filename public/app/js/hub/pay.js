// Mobile recharge, FASTag, business payments and auto-pay. Bills and Send Money are in bills.js.
import { api, esc, money, store, toast, modal, withBusy, dateTime, formData, inrHint, date } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';
import { deskTabs } from './desk.js';
import { payMethods, PAY_LABEL } from './checkout.js';
import { walletCheckout } from './wallet-checkout.js';
import { svcHero, BADGES } from './svc-hero.js';
import { emptyScene, statusPill, withFunds, refresh, filterBtn, openFilters, countActive } from './ui.js';

let catalog = null;
export const getCatalog = async () => { if (!catalog) catalog = await api('/hub/catalog'); return catalog; };
// Every payment page opens with the shared Travel & Bills header (back button, animated icon, promises).
export const head = (icon, tone, title, intro, opts = {}) => svcHero({ icon, tone, title, intro, badges: /Send Money|Gold|Voucher|Business/.test(title) ? BADGES.money : BADGES.pay, ...opts });
const canSee = (m) => { const p = store.state.user && store.state.user.permissions; return !p || (p[m] || 'none') !== 'none'; };
// Each payment page shows only itself; Travel & Bills is where you pick another one.
export const payTabs = () => '';
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
// Every recharge and bill pays the same way: check the details (so nobody pays for something that
// would be rejected), then the wallet checkout: review, PIN, receipt. info describes the payee.
export async function pay(btn, errEl, run, done, root, info) {
  errEl.textContent = '';
  let check;
  await withBusy(btn, async () => {
    try { check = await run({ dry_run: true }); } catch (e) { if (!e.quiet) errEl.textContent = e.message; }
  });
  if (!check) return;
  const meta = typeof info === 'function' ? info(check) : info || {};
  const r = await walletCheckout({ amount: check.amount, info: { fee: check.fee || 0, ...meta }, run });
  if (!r) return;
  refresh(); done(r);
}

// ---- mobile -----------------------------------------------------------------------
export async function renderMobile(view, { query }) {
  const c = await getCatalog();
  const OPC = { Jio: 'jio', Airtel: 'airtel', Vi: 'vi', BSNL: 'bsnl' };
  const opBadge = (op, big) => `<span class="op op--${OPC[op] || 'x'} ${big ? 'op--lg' : ''}" aria-hidden="true">${esc(op === 'Airtel' ? 'a' : op === 'BSNL' ? 'B' : op === 'Vi' ? 'Vi' : 'J')}</span>`;
  view.innerHTML = `${head('phone', 'green', 'Mobile Recharge', 'Prepaid plans for every operator, paid from your wallet.')}
    <div class="dash dash--even rc"><section class="card rc-main">
      <div class="rc-num"><label class="rc-num__f">${icon('phone', 20)}<span class="rc-num__cc">+91</span><input id="num" inputmode="numeric" maxlength="10" placeholder="Enter mobile number" autocomplete="tel-national" value="${esc(query.get('number') || '')}" aria-label="Mobile number"></label><span class="rc-num__hint" id="nh">We detect the operator and circle for you</span></div>
      <div id="recent" class="rc-recent"></div>
      <div id="who" class="rc-who" hidden></div>
      <div id="pick" class="rc-pick" hidden><label class="field">Operator<select class="select" id="op">${options(c.operators)}</select></label><label class="field">Circle<select class="select" id="ci">${options(c.circles)}</select></label></div>
      <div id="planBox" class="rc-plans" hidden>
        <div class="rc-plans__h"><h2 class="notop">Choose a plan</h2><label class="rc-find">${icon('search', 15)}<input id="pq" placeholder="Search ₹, GB or days" aria-label="Search plans"></label></div>
        <nav class="rc-tabs" id="tabs" role="tablist"></nav>
        <div id="plans" class="rc-grid"></div>
        <label class="row mt rc-auto"><input type="checkbox" class="check" id="auto"> Recharge this number automatically when the plan ends</label>
        <div class="mt">${payMethods()}</div>
      </div>
      <div id="empty" class="rc-empty">${tile('phone', 'green').value}<b>Enter a mobile number to see plans</b><small>Jio, Airtel, Vi and BSNL prepaid. Plans update for your circle.</small></div>
      <p class="form-error" id="err"></p>
    </section><aside class="dash__side"><section class="card" id="hist"></section></aside></div>
    <div class="rc-bar" id="bar" hidden><div class="grow"><b translate="no" id="barP"></b><small id="barD"></small></div><button class="btn btn-primary" id="go" type="button">${icon('shield', 16)}Proceed to pay</button></div>`;
  const $ = (s) => view.querySelector(s);
  const num = $('#num'); const opSel = $('#op'); const ciSel = $('#ci');
  let plans = []; let cats = []; let chosen = null; let tab = 'popular'; let info = null;

  // Numbers you recharged before, one tap to fill.
  api('/hub/orders', { query: { section: 'recharge', per_page: 50 } }).then((r) => {
    const seen = []; r.data.filter((x) => x.kind === 'mobile' && /^\d{10}$/.test(x.sub || '')).forEach((x) => { if (!seen.find((s) => s.sub === x.sub)) seen.push(x); });
    $('#recent').innerHTML = seen.length ? `<span class="muted small">Recent</span>${seen.slice(0, 4).map((x) => `<button type="button" data-n="${esc(x.sub)}">${opBadge(x.provider)}${esc(x.sub.slice(0, 5))} ${esc(x.sub.slice(5))}</button>`).join('')}` : '';
  }).catch(() => {});

  async function loadPlans() {
    const r = await api('/hub/plans', { query: { operator: opSel.value } });
    plans = r.plans; cats = r.categories; chosen = null; draw();
  }
  function who() {
    const cur = info && info.current;
    $('#who').hidden = !info;
    if (!info) return;
    $('#who').innerHTML = `${opBadge(opSel.value, true)}<div class="grow"><b>${esc(opSel.value)} Prepaid · ${esc(ciSel.value)}</b><small>${cur && cur.plan ? `Current plan ${esc(cur.plan)} · ${cur.days_left > 0 ? `ends ${esc(date(cur.ends))} (${cur.days_left} ${cur.days_left === 1 ? 'day' : 'days'} left)` : 'expired'}` : '<span class="rc-exp">No active plan. Recharge to keep calls and data working.</span>'}</small></div><button class="link" type="button" id="chg">Change</button>`;
  }
  async function lookup() {
    const n = num.value.replace(/\D/g, '');
    $('#err').textContent = '';
    if (n.length !== 10) { info = null; $('#planBox').hidden = true; $('#empty').hidden = false; $('#bar').hidden = true; $('#nh').textContent = 'We detect the operator and circle for you'; who(); return; }
    $('#nh').innerHTML = '<span class="spinner spinner--sm"></span>Detecting operator…';
    try {
      info = await api('/hub/recharge/lookup', { method: 'POST', body: { number: n } });
      opSel.value = info.operator; ciSel.value = info.circle;
      $('#nh').innerHTML = `${icon('check', 14)}Detected ${esc(info.operator)} · ${esc(info.circle)}`;
      $('#planBox').hidden = false; $('#empty').hidden = true;
      who(); await loadPlans();
    } catch (x) { $('#nh').textContent = ''; $('#err').textContent = x.message; }
  }
  function draw() {
    const q = $('#pq').value.trim().toLowerCase().replace('₹', '');
    const pool = q ? plans.filter((p) => `${p.price} ${p.data} ${p.validity} ${p.extras}`.toLowerCase().includes(q)) : plans.filter((p) => p.category === tab);
    $('#tabs').innerHTML = cats.map(([k, l]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${!q && k === tab}">${esc(l)}<i>${plans.filter((p) => p.category === k).length}</i></button>`).join('');
    $('#plans').innerHTML = pool.length ? pool.map((p, i) => `<button type="button" class="rc-plan" style="--i:${i}" data-p="${p.id}" aria-pressed="${p.id === chosen}">${p.tag ? `<em>${esc(p.tag)}</em>` : ''}<b translate="no">${esc(money(p.price))}</b>
        <span class="rc-plan__m"><span><small>Data</small>${esc(p.data)}</span><span><small>Validity</small>${esc(p.validity)}</span></span><small class="rc-plan__x">${esc(p.extras || '')}</small><span class="rc-plan__pick">${p.id === chosen ? `${icon('check', 14)}Selected` : 'Select'}</span></button>`).join('') : '<p class="muted">No plan matches that. Try another amount.</p>';
    const p = plans.find((x) => x.id === chosen);
    $('#bar').hidden = !p;
    if (p) { $('#barP').textContent = money(p.price); $('#barD').textContent = `${opSel.value} · ${p.data} · ${p.validity}`; }
  }
  num.addEventListener('input', () => { num.value = num.value.replace(/\D/g, '').slice(0, 10); if (num.value.length === 10 || info) lookup(); });
  $('#recent').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) { num.value = b.dataset.n; lookup(); } });
  $('#who').addEventListener('click', (e) => { if (e.target.closest('#chg')) $('#pick').hidden = !$('#pick').hidden; });
  opSel.addEventListener('change', () => { who(); loadPlans(); });
  ciSel.addEventListener('change', who);
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; $('#pq').value = ''; draw(); } });
  $('#pq').addEventListener('input', draw);
  $('#plans').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { chosen = b.dataset.p; draw(); } });
  const hist = () => historyCard($('#hist'), 'recharge', (x) => /Mobile/.test(x.title));
  $('#go').addEventListener('click', () => {
    const p = plans.find((x) => x.id === chosen);
    const n = num.value;
    pay($('#go'), $('#err'), (x) => api('/hub/recharge/mobile', { method: 'POST', body: { number: n, operator: opSel.value, plan_id: chosen, auto: $('#auto').checked, ...x } }),
      () => { chosen = null; draw(); lookup(); hist(); }, view,
      { title: 'Mobile recharge', payee: `${opSel.value} Prepaid`, sub: `+91 ${n.slice(0, 5)} ${n.slice(5)} · ${ciSel.value}`, icon: 'phone', tone: 'green', baseLabel: 'Plan amount', rows: [['Plan', `${p.data} · ${p.validity}`], ['Benefits', p.extras || '—']], refLabel: 'Operator reference' });
  });
  if (num.value.length === 10) await lookup();
  hist();
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
  go.addEventListener('click', () => { const d = formData(form); delete d.pm; pay(go, err, (x) => api('/hub/recharge/fastag', { method: 'POST', body: { ...d, auto: !!d.auto, ...x } }), (r) => { toast(`FASTag recharged · new balance ${money(r.balance)}`); view.querySelector('#bal').innerHTML = ''; hist(); }, view, { title: 'FASTag recharge', payee: `${d.issuer} FASTag`, sub: String(d.vehicle_no || '').toUpperCase(), icon: 'fastag', tone: 'coral', baseLabel: 'Recharge amount', refLabel: 'NETC reference' }); });
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
  go.addEventListener('click', () => pay(go, view.querySelector('#err'), (x) => { const d = formData(form); delete d.pm; return api('/hub/business/pay', { method: 'POST', body: { type, ...d, ...x } }); }, (r) => { form.reset(); hist(); }, view, () => { const d = formData(form); return { title: 'Business payment', payee: d.payee || 'Payee', sub: d.reference ? `Ref ${d.reference}` : '', icon: 'briefcase', tone: 'green' }; }));
  hist();
}

// ---- auto-pay ---------------------------------------------------------------------------
const ACCOUNT = { fastag: ['fastag', 'coral', 'FASTag'], mobile: ['phone', 'green', 'Mobile'], bill: ['bill', 'blue', 'Bill'], transfer: ['rupee', 'violet', 'Regular payment'] };
export async function renderAutopay(view) {
  view.innerHTML = `${head('repeat', 'violet', 'Auto-pay', 'Connect accounts once. They recharge from your wallet by themselves.', { badges: ['Never miss a due date', 'Stops if the wallet is low', 'Pause any time'], action: '<button class="btn btn-primary" id="add">+ Connect account</button>' })}${payTabs('autopay')}<div id="body"><div class="skeleton" style="height:220px"></div></div>`;
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
