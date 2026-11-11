// Recharge & Bills: every category a UPI app offers, My Bills, offers, brand vouchers,
// digital gold and silver, and Send Money with regular payments.
import { api, esc, money, toast, withBusy, formData, date, inrHint, modal, dateTime } from '../core.js';
import { tile } from './art.js';
import { head, payTabs, pay, historyCard, options, getCatalog } from './pay.js';
import { payMethods } from './checkout.js';

const GROUPS = ['Telecom & Recharges', 'Utilities', 'Vehicle Payments', 'Finance & Tax', 'Housing & Society', 'Others'];
const ICON = { postpaid: ['phone', 'green'], dth: ['tv', 'blue'], cable: ['tv', 'violet'], play: ['gift', 'green'], roaming: ['globe', 'blue'], sim: ['phone', 'coral'], apple: ['gift', 'violet'], subscription: ['tv', 'rose'], electricity: ['electric', 'amber'], gas: ['flame', 'coral'], lpg: ['flame', 'amber'], water: ['drop', 'blue'], broadband: ['wifi', 'violet'], landline: ['phone', 'green'], prepaid_meter: ['electric', 'green'], ev: ['plug', 'green'], ncmc: ['card', 'blue'], metro: ['train', 'violet'], car_ins: ['ride', 'blue'], bike_ins: ['bike', 'green'], accident: ['shield', 'coral'], challan: ['doc', 'amber'], policycheck: ['shield', 'violet'], fleet: ['card', 'amber'], credit: ['card', 'violet'], loan: ['bank', 'blue'], insurance: ['shield', 'green'], rd: ['bank', 'green'], nps: ['bank', 'amber'], itr: ['receipt', 'blue'], tax: ['building', 'amber'], municipal: ['building', 'blue'], rent: ['home', 'green'], society: ['building', 'violet'], clubs: ['team', 'coral'], donation: ['heart', 'rose'], devotion: ['temple', 'amber'], education: ['school', 'blue'], hospital: ['hospital', 'coral'], rentcc: ['home', 'violet'], feescc: ['school', 'violet'] };
// Tiles that open their own page.
const SHORTCUTS = { 'Telecom & Recharges': [['#/pay/mobile', 'phone', 'blue', 'Mobile Recharge']], 'Vehicle Payments': [['#/pay/fastag', 'fastag', 'coral', 'FASTag Recharge']], 'Finance & Tax': [['#/pay/gold', 'coin', 'amber', 'Gold & Silver']], Others: [['#/pay/vouchers', 'gift', 'rose', 'Gift Cards & Vouchers'], ['#/pay/send', 'rupee', 'green', 'Send Money']] };
const REGULAR = [['rent', 'Rent'], ['maintenance', 'Maintenance'], ['newspaper', 'Newspaper'], ['grocery', 'Grocery or milk'], ['help', 'Domestic help'], ['family', 'Family'], ['salary', 'Fees or salary'], ['services', 'Services'], ['misc', 'Miscellaneous']];
const BTN = { fetch: 'Fetch bill', quote: 'Get quote', lookup: 'Check expiry' };

const catTile = (k, v, badge) => `<a class="bh-tile" href="#/pay/bills?cat=${k}" data-find="${esc(`${v.label} ${v.group} ${v.list.join(' ')}`.toLowerCase())}">${badge ? `<em class="bh-badge ${badge === '1.6% fee' ? 'bh-badge--fee' : badge === 'Offer' ? 'bh-badge--offer' : ''}">${esc(badge)}</em>` : ''}${tile(...(ICON[k] || ['bill', 'blue'])).value}<span>${esc(v.label)}</span></a>`;
const linkTile = ([h, i, t, l]) => `<a class="bh-tile" href="${h}" data-find="${esc(l.toLowerCase())}">${tile(i, t).value}<span>${esc(l)}</span></a>`;

// ---- the catalogue -----------------------------------------------------------------------
export async function renderBills(view, { query }) {
  const c = await getCatalog();
  if (c.billers[query.get('cat')]) return billForm(view, query, c);
  const home = await api('/hub/bill/home');
  const badgeOf = (k) => c.billers[k].badge || (home.offer_cats.includes(k) ? 'Offer' : '');
  view.innerHTML = `${head('bill', 'blue', 'Recharge & Bills', 'Every recharge, bill and payment a UPI app offers, in one place.')}${payTabs('bills')}
    <div class="bh-top"><label class="bh-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/></svg><input id="find" type="search" placeholder="Search billers, categories or your saved bills" aria-label="Search bills"></label><button class="btn btn-outline" id="mine" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>My Bills${home.saved.length ? `<span class="count">${home.saved.length}</span>` : ''}</button></div>
    <div id="hits"></div>
    <section class="card bh-sec" data-sec="suggested"><h2>Suggested for you</h2><div class="bh-grid">${home.suggested.map((k) => catTile(k, c.billers[k], badgeOf(k))).join('')}</div></section>
    ${home.offers.length ? `<section class="card bh-sec" data-sec="offers"><h2>Offers for you</h2><div class="bh-offers">${home.offers.map((o) => `<a class="bh-offer" href="#/pay/bills?cat=${o.cat}">${tile(...(ICON[o.cat] || ['gift', 'green'])).value}<div><b>${esc(o.title)}</b><small>${esc(o.label)} · ${esc(o.text)}</small></div><span class="bh-offer__go">Pay now →</span></a>`).join('')}</div><p class="muted small notop">Cashback is added to your wallet right after you pay.</p></section>` : ''}
    ${GROUPS.map((g) => `<section class="card bh-sec"><h2>${esc(g)}</h2><div class="bh-grid">${(SHORTCUTS[g] || []).slice(0, 1).map(linkTile).join('')}${Object.entries(c.billers).filter(([, v]) => v.group === g).map(([k, v]) => catTile(k, v, badgeOf(k))).join('')}${(SHORTCUTS[g] || []).slice(1).map(linkTile).join('')}</div></section>`).join('')}
    <section class="card bh-sec"><div class="card-h"><div><h2>Set up regular payments</h2><small>Send money every month and get a reminder before it is due.</small></div></div><div class="bh-chips">${REGULAR.map(([k, l]) => `<a href="#/pay/send?purpose=${k}&repeat=1">${esc(l)}</a>`).join('')}</div></section>
    <div class="ov-2">
      <a class="card bh-promo" href="#/pay/vouchers">${tile('gift', 'rose').value}<div><b>Brand vouchers</b><small>Gift cards from 20+ brands with cashback up to 7%.</small></div><span class="link">Browse →</span></a>
      <a class="card bh-promo" href="#/pay/gold">${tile('coin', 'amber').value}<div><b>Gold & silver savings</b><small>Buy 24K gold or silver from ₹10.</small></div><span class="link">Start →</span></a>
    </div>
    <p class="muted small">Sandbox: no real bill is paid. In production, bills run through the Bharat Bill Payment System (BBPS) with a licensed partner.</p>`;
  const find = view.querySelector('#find'); const hits = view.querySelector('#hits');
  find.addEventListener('input', () => {
    const q = find.value.trim().toLowerCase();
    view.querySelectorAll('.bh-sec').forEach((s) => { let any = false; s.querySelectorAll('.bh-tile').forEach((t) => { const on = !q || t.dataset.find.includes(q); t.hidden = !on; any = any || on; }); s.hidden = q && (!any || s.dataset.sec === 'offers'); });
    const saved = q ? home.saved.filter((s) => `${s.nickname} ${s.biller} ${s.account}`.toLowerCase().includes(q)) : [];
    hits.innerHTML = saved.length ? `<section class="card bh-sec"><h2>Your saved bills</h2>${savedList(saved, c)}</section>` : '';
  });
  view.querySelector('#mine').addEventListener('click', () => myBills(home.saved, c, () => renderBills(view, { query })));
}

const savedList = (list, c) => `<ul class="feed">${list.map((s) => `<li>${tile(...(ICON[s.cat] || ['bill', 'blue'])).value}<div class="feed__t"><b>${esc(s.nickname)}</b><small>${esc(c.billers[s.cat] ? c.billers[s.cat].label : s.cat)} · ${esc(s.biller)} · ${esc(s.account)}</small></div><div class="feed__r"><small>Last paid</small><b translate="no">${esc(money(s.last))}</b></div><a class="btn btn-primary btn-sm" href="#/pay/bills?cat=${s.cat}&biller=${encodeURIComponent(s.biller)}&account=${encodeURIComponent(s.account)}">Pay</a></li>`).join('')}</ul>`;
function myBills(saved, c, again) {
  modal({
    title: 'My Bills', wide: true,
    body: saved.length ? `<input class="input" id="mbF" type="search" placeholder="Search by nickname" aria-label="Search by nickname"><div id="mbL" class="mt">${savedList(saved, c)}</div>` : '<p class="notop">No saved bills yet. When you pay a bill, give it a nickname to save it here.</p>',
    onMount(el, close) {
      const f = el.querySelector('#mbF');
      const draw = () => { const q = f.value.trim().toLowerCase(); const list = saved.filter((s) => `${s.nickname} ${s.biller} ${s.account}`.toLowerCase().includes(q)); el.querySelector('#mbL').innerHTML = list.length ? savedList(list, c).replace(/<\/a><\/li>/g, (m, i) => m) : '<p class="muted">No saved bill matches.</p>'; el.querySelectorAll('#mbL li').forEach((li, n) => { const b = document.createElement('button'); b.className = 'icon-btn'; b.type = 'button'; b.title = 'Remove'; b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'; b.addEventListener('click', async () => { await api('/hub/bill/saved/remove', { method: 'POST', body: { id: list[n].id } }); saved.splice(saved.indexOf(list[n]), 1); toast('Removed'); draw(); again(); }); li.appendChild(b); }); };
      if (f) { f.addEventListener('input', draw); draw(); }
      el.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
    },
  });
}

// ---- one bill ------------------------------------------------------------------------------
async function billForm(view, query, c) {
  const cat = query.get('cat'); const b = c.billers[cat];
  const mode = b.mode || (b.open ? 'open' : 'fetch');
  const home = await api('/hub/bill/home');
  const mine = home.saved.filter((s) => s.cat === cat);
  const offer = home.offers.find((o) => o.cat === cat);
  view.innerHTML = `${head(ICON[cat] ? ICON[cat][0] : 'bill', 'blue', b.label, `${b.group} · ${b.list.length} ${b.list.length === 1 ? 'biller' : 'billers'}`)}${payTabs('bills')}
    <a class="link back-link" href="#/pay/bills">← All recharges and bills</a>
    <div class="dash dash--even"><section class="card">
      ${offer ? `<p class="bh-note bh-note--offer"><b>${esc(offer.title)}</b> ${esc(offer.text)}</p>` : ''}
      ${b.fee_pct ? `<p class="bh-note">Paid by credit card. A ${b.fee_pct}% convenience fee applies${offer && offer.waive ? ', waived on your first payment' : ''}.</p>` : ''}
      ${mine.length ? `<div class="bh-chips bh-chips--mine">${mine.map((s) => `<button type="button" data-fill="${esc(s.id)}">${esc(s.nickname)}</button>`).join('')}</div>` : ''}
      <form id="bf" class="form-grid" novalidate>
      <label class="field">${b.list.length > 1 ? 'Biller' : 'Provider'}<select class="select" name="biller">${options(b.list, query.get('biller') || undefined)}</select></label><label class="field">${esc(b.hint)}<input class="input" name="account" value="${esc(query.get('account') || '')}"></label>
      ${mode === 'open' ? `<label class="field full">Amount (₹)${b.min ? ` <small class="muted">from ₹${b.min}</small>` : ''}<input class="input" name="amount" inputmode="numeric"><small class="muted" id="fx"></small></label>` : ''}
      <div class="full" id="bill"></div>
      ${mode === 'lookup' ? '' : `<div class="full" id="pm" ${mode === 'open' ? '' : 'hidden'}>${payMethods({ card: !b.no_card, only: b.cc_only ? ['card', 'emi'] : null })}<label class="field mt">Save as (optional)<input class="input" name="save_as" maxlength="40" placeholder="A nickname, like Home electricity"></label></div>`}</form>
      <p class="form-error" id="err"></p><button class="btn btn-primary btn-block mt" id="go" type="button">${mode === 'open' ? 'Pay now' : BTN[mode]}</button></section>
      <aside class="dash__side"><section class="card" id="hist"></section></aside></div>`;
  const form = view.querySelector('#bf'); const err = view.querySelector('#err'); const btn = view.querySelector('#go'); const billEl = view.querySelector('#bill'); const pm = view.querySelector('#pm');
  if (mode === 'open') form.amount.addEventListener('input', () => { view.querySelector('#fx').textContent = inrHint(form.amount.value); });
  view.querySelectorAll('[data-fill]').forEach((x) => x.addEventListener('click', () => { const s = mine.find((m) => m.id === x.dataset.fill); form.biller.value = s.biller; form.account.value = s.account; form.dispatchEvent(new Event('input')); }));
  let bill = null;
  const hist = () => historyCard(view.querySelector('#hist'), 'bills', (x) => x.kind === cat);
  const reset = () => { bill = null; billEl.innerHTML = ''; if (mode !== 'open' && pm) pm.hidden = true; btn.textContent = mode === 'open' ? 'Pay now' : BTN[mode]; };
  const paid = (r) => { toast(`Paid · ${r.id}${r.cashback ? ` · ₹${r.cashback} cashback added` : ''}`); reset(); form.reset(); hist(); };
  const send = (body) => pay(btn, err, (x) => api('/hub/bill/pay', { method: 'POST', body: { category: cat, ...body, save_as: form.save_as ? form.save_as.value : '', ...x } }), paid, view);
  btn.addEventListener('click', () => {
    if (mode === 'open') return send({ biller: form.biller.value, account: form.account.value, amount: form.amount.value });
    if (bill) return send({ biller: bill.biller, account: bill.account, amount: view.querySelector('#amt').value, auto: view.querySelector('#bauto') && view.querySelector('#bauto').checked });
    err.textContent = '';
    return withBusy(btn, async () => {
      try {
        const r = await api('/hub/bill/fetch', { method: 'POST', body: { category: cat, biller: form.biller.value, account: form.account.value } });
        if (r.lookup) {
          billEl.innerHTML = `<div class="bh-result ${r.expired ? 'bh-result--bad' : ''}"><b>${r.expired ? 'Policy has expired' : `Policy expires in ${r.days} days`}</b><small>${esc(r.account)} · ${esc(r.insurer)} · ${r.expired ? 'expired' : 'valid till'} ${esc(date(r.expires))}</small><div class="row mt-s"><a class="btn btn-primary btn-sm" href="#/pay/bills?cat=car_ins&account=${encodeURIComponent(r.account)}">Renew car insurance</a><a class="btn btn-outline btn-sm" href="#/pay/bills?cat=bike_ins&account=${encodeURIComponent(r.account)}">Renew bike insurance</a></div></div>`;
          return;
        }
        bill = r;
        billEl.innerHTML = `<dl class="break"><div><dt>${r.quote ? 'Plan' : 'Customer'}</dt><dd>${esc(r.holder)}</dd></div><div><dt>${r.quote ? 'Cover until' : 'Due date'}</dt><dd>${esc(date(r.due))}</dd></div><div class="break__t"><dt>${r.quote ? 'Premium' : 'Amount due'}</dt><dd translate="no">${esc(money(r.amount))}</dd></div></dl>
          <label class="field mt">Amount to pay (₹)<input class="input" id="amt" inputmode="numeric" value="${r.amount}" ${r.quote ? 'readonly' : ''}></label>${r.quote ? '<p class="muted small">Sandbox quote. A real policy needs the insurer to issue it.</p>' : '<label class="row mt"><input type="checkbox" class="check" id="bauto"> Pay this bill automatically every month</label>'}`;
        pm.hidden = false; btn.textContent = r.quote ? 'Buy policy' : 'Pay bill';
      } catch (e) { err.textContent = e.message; }
    });
  });
  form.addEventListener('input', (e) => { if (bill && (!e.target || ['biller', 'account'].includes(e.target.name) || e.target === form)) reset(); });
  hist();
}

// ---- brand vouchers ---------------------------------------------------------------------------
const VTABS = [['best', 'Bestsellers'], ['deal', 'Special deals'], ['new', 'New launches']];
const initials = (n) => n.replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export async function renderVouchers(view, { query }) {
  const d = await api('/hub/vouchers');
  const tab = VTABS.some(([k]) => k === query.get('tab')) ? query.get('tab') : 'best';
  const catF = query.get('cat') || '';
  view.innerHTML = `${head('gift', 'rose', 'Brand Vouchers', 'Gift cards for shopping, food, travel and more, with cashback.')}${payTabs('bills')}
    <a class="link back-link" href="#/pay/bills">← All recharges and bills</a>
    <label class="bh-search bh-search--wide"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/></svg><input id="vf" type="search" placeholder="Search by brand name" aria-label="Search by brand name"></label>
    <section class="card bh-sec"><h2>Categories</h2><div class="bh-chips">${['', ...d.categories].map((c) => `<a href="#/pay/vouchers?cat=${encodeURIComponent(c)}&tab=${tab}" class="${c === catF ? 'on' : ''}">${esc(c || 'All')}</a>`).join('')}</div></section>
    <div class="dash dash--even"><section class="card"><nav class="tabs tabs--line">${VTABS.map(([k, l]) => `<a href="#/pay/vouchers?tab=${k}&cat=${encodeURIComponent(catF)}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</nav><ul class="vlist" id="vl"></ul></section>
      <aside class="dash__side"><section class="card"><h2>Your gift cards</h2>${d.mine.length ? `<ul class="feed">${d.mine.map((m) => `<li><div class="feed__t"><b>${esc(m.title)}</b><small class="mono">${esc(m.code)}</small></div><div class="feed__r"><b translate="no">${esc(money(m.amount))}</b><small>${esc(dateTime(m.at))}</small></div></li>`).join('')}</ul>` : '<p class="muted notop">Cards you buy appear here with their codes.</p>'}</section></aside></div>`;
  const list = view.querySelector('#vl'); const f = view.querySelector('#vf');
  const draw = () => {
    const q = f.value.trim().toLowerCase();
    const rows = d.data.filter((v) => (q ? v.brand.toLowerCase().includes(q) : v.tab === tab) && (!catF || v.category === catF));
    list.innerHTML = rows.length ? rows.map((v) => `<li><span class="vlogo">${esc(initials(v.brand))}</span><div class="grow"><b>${esc(v.brand)} gift card</b><small>From <span translate="no">${esc(money(v.from))}</span> · ${esc(v.category)}</small><small class="vcash">Get up to ${v.cashback}% cashback</small></div><button class="btn btn-outline btn-sm" data-buy="${esc(v.id)}" type="button">Buy</button></li>`).join('') : '<li class="muted">No brands match.</li>';
  };
  f.addEventListener('input', draw); draw();
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-buy]'); if (b) buyVoucher(d.data.find((v) => v.id === b.dataset.buy), () => renderVouchers(view, { query })); });
}
function buyVoucher(v, done) {
  modal({
    title: `${v.brand} gift card`,
    body: `<form class="form-grid" id="vb" novalidate><div class="field full"><span>Value</span><div class="bh-chips">${v.values.map((x, n) => `<label class="chip-pick"><input type="radio" name="amount" value="${x}" ${n ? '' : 'checked'}><span translate="no">${esc(money(x))}</span></label>`).join('')}</div></div>
      <label class="field full">Send to (optional)<input class="input" name="to" type="email" placeholder="Their email. Leave blank to keep it."></label>${payMethods({ card: true })}</form>
      <p class="callout">${v.cashback}% cashback goes to your wallet after you pay.</p><p class="form-error" id="ve"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="vgo">Pay</button>',
    onMount(el, close) {
      const go = el.querySelector('#vgo');
      go.addEventListener('click', () => { const d = formData(el.querySelector('#vb')); pay(go, el.querySelector('#ve'), (x) => api('/hub/vouchers/buy', { method: 'POST', body: { id: v.id, amount: d.amount, to: d.to, ...x } }), (r) => { close(); modal({ title: 'Gift card ready', body: `<div class="gateway"><b class="mono">${esc(r.code)}</b><p>${esc(money(r.amount))} ${esc(v.brand)} gift card${r.cashback ? ` · ₹${r.cashback} cashback added to your wallet` : ''}.</p><small class="muted">Sandbox code. It cannot be redeemed.</small></div>`, footer: '<button class="btn btn-primary" data-close>Done</button>' }); done(); }, el); });
    },
  });
}

// ---- gold and silver --------------------------------------------------------------------------
export async function renderGold(view) {
  const d = await api('/hub/gold');
  view.innerHTML = `${head('coin', 'amber', 'Gold & Silver', 'Buy 24K gold or 99.9% silver in small amounts.')}${payTabs('bills')}
    <a class="link back-link" href="#/pay/bills">← All recharges and bills</a>
    <div class="grid grid-3"><div class="card stat"><span class="stat__label">Gold you own</span><span class="stat__value">${d.holdings.gold} g</span></div><div class="card stat"><span class="stat__label">Silver you own</span><span class="stat__value">${d.holdings.silver} g</span></div><div class="card stat"><span class="stat__label">Value today</span><span class="stat__value" translate="no">${esc(money(d.value))}</span><span class="muted small">At sandbox prices</span></div></div>
    <div class="dash dash--even"><section class="card"><h2>Buy</h2><form id="gf" class="form-grid" novalidate>
      <div class="field full"><span>Metal</span><div class="seg" role="group"><button type="button" data-m="gold" aria-pressed="true">Gold · ₹${d.rates.gold.toLocaleString('en-IN')}/g</button><button type="button" data-m="silver" aria-pressed="false">Silver · ₹${d.rates.silver.toLocaleString('en-IN')}/g</button></div></div>
      <label class="field full">Amount (₹)<input class="input input--lg" name="amount" inputmode="numeric" value="500"><small class="muted" id="gx"></small></label>
      <div class="bh-chips full">${[100, 500, 1000, 5000].map((a) => `<button type="button" data-a="${a}">₹${a.toLocaleString('en-IN')}</button>`).join('')}</div>
      ${payMethods({ card: false })}</form><p class="form-error" id="ge"></p><button class="btn btn-primary btn-block mt" id="ggo" type="button">Buy gold</button>
      <p class="muted small">Prices include 3% GST. Sandbox: no real metal is bought, and prices are illustrative.</p></section>
      <aside class="dash__side"><section class="card"><h2>Your purchases</h2>${d.history.length ? `<ul class="feed">${d.history.map((r) => `<li><div class="feed__t"><b>${esc(r.title)}</b><small>${esc(dateTime(r.at))}</small></div><div class="feed__r"><b translate="no">${esc(money(r.amount))}</b></div></li>`).join('')}</ul>` : '<p class="muted notop">Nothing bought yet.</p>'}</section></aside></div>`;
  let metal = 'gold';
  const form = view.querySelector('#gf'); const go = view.querySelector('#ggo');
  const fx = () => { const a = Number(form.amount.value) || 0; view.querySelector('#gx').textContent = a ? `About ${((a / 1.03) / d.rates[metal]).toFixed(4)} g of ${metal}` : ''; };
  form.addEventListener('click', (e) => { const m = e.target.closest('[data-m]'); if (m) { metal = m.dataset.m; form.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-pressed', String(x === m))); go.textContent = `Buy ${metal}`; fx(); } const a = e.target.closest('[data-a]'); if (a) { form.amount.value = a.dataset.a; fx(); } });
  form.amount.addEventListener('input', fx); fx();
  go.addEventListener('click', () => pay(go, view.querySelector('#ge'), (x) => api('/hub/gold/buy', { method: 'POST', body: { metal, amount: form.amount.value, ...x } }), (r) => { toast(`Bought ${r.grams} g of ${metal}`); renderGold(view); }, view));
}

// ---- send money --------------------------------------------------------------------------------
const TYPES = [['upi', 'To UPI ID'], ['mobile', 'To mobile number'], ['bank', 'To bank account']];
export async function renderSend(view, { query }) {
  const type = TYPES.some(([k]) => k === query.get('to')) ? query.get('to') : 'upi';
  const purpose = REGULAR.some(([k]) => k === query.get('purpose')) ? query.get('purpose') : '';
  const repeat = query.get('repeat') === '1';
  const keep = `${purpose ? `&purpose=${purpose}` : ''}${repeat ? '&repeat=1' : ''}`;
  const fields = {
    upi: '<label class="field full">UPI ID<input class="input input--lg" name="to" placeholder="name@bank" autocomplete="off"></label>',
    mobile: '<label class="field full">Mobile number<input class="input input--lg" name="to" inputmode="numeric" maxlength="10" placeholder="10-digit number"></label>',
    bank: '<label class="field">Account number<input class="input" name="to" inputmode="numeric" autocomplete="off"></label><label class="field">IFSC<input class="input" name="ifsc" maxlength="11" placeholder="HDFC0001234" style="text-transform:uppercase"></label>',
  };
  view.innerHTML = `${head('rupee', 'green', 'Send Money', 'Send to any UPI ID, mobile number or bank account, once or every month.')}${payTabs('send')}
    <div class="dash dash--even"><section class="card"><nav class="tabs tabs--line">${TYPES.map(([k, l]) => `<a href="#/pay/send?to=${k}${keep}" class="${k === type ? 'active' : ''}">${l}</a>`).join('')}</nav><form id="sf" class="form-grid" novalidate>${fields[type]}
      <label class="field full">Recipient name<input class="input" name="name"></label><label class="field">Amount (₹)<input class="input" name="amount" inputmode="numeric"><small class="muted" id="fx"></small></label>
      <label class="field">Purpose<select class="select" name="purpose"><option value="">Choose (optional)</option>${REGULAR.map(([k, l]) => `<option value="${k}" ${k === purpose ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="field full">Note (optional)<input class="input" name="note" maxlength="60"></label>
      <label class="row full"><input type="checkbox" class="check" name="repeat" ${repeat ? 'checked' : ''}> Repeat every month, with a reminder 3 days before</label>
      ${payMethods({ card: false })}</form><p class="form-error" id="err"></p><button class="btn btn-primary btn-block mt" id="go" type="button">Send money</button></section>
      <aside class="dash__side"><section class="card" id="hist"></section></aside></div>`;
  const form = view.querySelector('#sf'); const go = view.querySelector('#go');
  form.amount.addEventListener('input', () => { view.querySelector('#fx').textContent = inrHint(form.amount.value); });
  const hist = () => historyCard(view.querySelector('#hist'), 'bills', (x) => x.kind === 'transfer');
  go.addEventListener('click', () => { const d = formData(form); delete d.pm; d.repeat = !!d.repeat; pay(go, view.querySelector('#err'), (x) => api('/hub/bill/transfer', { method: 'POST', body: { type, ...d, ...x } }), (r) => { toast(d.repeat ? `Sent · monthly reminder set in Auto-pay` : `Sent · ${r.id}`); form.reset(); hist(); }, view); });
  hist();
}
