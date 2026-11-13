// Pieces shared by the dashboard pages: wallet top-up, payment choice, filter chips,
// status pills, empty scenes and the two small chart types.
import { api, esc, money, store, toast, modal, refreshCounts, inrHint, date } from '../core.js';
import { duo, scene } from './art.js';
import { popover } from './prefs.js';
import { isPhone, intentPanel } from './upi.js';

export const refresh = () => { refreshCounts().catch(() => {}); window.dispatchEvent(new CustomEvent('ut:refresh')); };

// Pseudo QR for the sandbox gateway.
const fakeQr = (seed) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; let out = ''; for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) { const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); h = (h * 1664525 + 1013904223) >>> 0; const on = corner ? (x % 6 === 0 || y % 6 === 0 || ((x % 14) > 1 && (x % 14) < 5 && (y % 14) > 1 && (y % 14) < 5)) : (h >> 16) & 1; if (on) out += `<rect x="${x}" y="${y}" width="1" height="1"/>`; } return `<svg class="qr" viewBox="0 0 21 21" aria-label="Sandbox payment code">${out}</svg>`; };

// Add money through the sandbox gateway. No card details are ever asked for.
export function addMoney(prefill = 1000, why, start = 'upi') {
  const presets = [500, 1000, 2000, 5000, 10000];
  return modal({
    title: 'Add money to wallet',
    body: `${why ? `<p class="callout">${esc(why)}</p>` : ''}
      <div class="row">${presets.map((a) => `<button class="btn btn-outline btn-sm" type="button" data-amt="${a}">₹${a.toLocaleString('en-IN')}</button>`).join('')}</div>
      <label class="field">Amount (₹)<input class="input" id="amt" inputmode="numeric" value="${Math.max(100, Math.ceil(prefill))}"></label>
      <p class="muted small notop" id="amtFx"></p>
      <div class="pay2 pay4" role="radiogroup" aria-label="Payment method">${[['upi', 'UPI'], ['qr', 'Scan QR'], ['card', 'Card'], ['netbanking', 'Netbanking'], ['giftcard', 'Gift card']].map(([v, l]) => `<label class="pay"><input type="radio" name="m" value="${v}" ${v === start ? 'checked' : ''}><span><b>${l}</b></span></label>`).join('')}</div>
      <div id="gcBox" hidden><label class="field">Gift card code<input class="input mono" id="gcCode" placeholder="e.g. UTGC-2026-DEMO-0500" autocomplete="off" style="text-transform:uppercase"></label><p class="muted small notop">The card's full value goes into your wallet. Use it for any booking, recharge or bill.</p></div>
      <p class="muted small notop">Sandbox payment: no real money is taken.</p><p class="form-error" id="amtErr"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="amtGo">Continue</button>',
    onMount(el, close) {
      const input = el.querySelector('#amt');
      const fx = () => { el.querySelector('#amtFx').textContent = inrHint(input.value.replace(/\D/g, '')); };
      input.addEventListener('input', fx); fx();
      // Gift card: no amount to pick, the code decides it.
      const amtBits = [el.querySelector('.row'), input.closest('.field'), el.querySelector('#amtFx')];
      const mode = () => { const gc = el.querySelector('[name=m]:checked').value === 'giftcard'; el.querySelector('#gcBox').hidden = !gc; amtBits.forEach((x) => { if (x) x.hidden = gc; }); el.querySelector('#amtGo').textContent = gc ? 'Redeem' : 'Continue'; if (gc) el.querySelector('#gcCode').focus(); };
      el.addEventListener('change', (e) => { if (e.target.name === 'm') mode(); }); mode();
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-amt]'); if (b) { input.value = b.dataset.amt; fx(); } });
      el.querySelector('#amtGo').addEventListener('click', async () => {
        try {
          const method = el.querySelector('[name=m]:checked').value;
          if (method === 'giftcard') {
            const r = await api('/hub/wallet/redeem', { method: 'POST', body: { code: el.querySelector('#gcCode').value } });
            toast(`${money(r.amount)} added from your gift card`); refresh(); close(true); return;
          }
          const p = await api('/hub/payments/intent', { method: 'POST', body: { amount: Number(input.value.replace(/\D/g, '')), method } });
          const label = { upi: 'Approve the request in your UPI app', qr: 'Scan this code with any UPI app', card: 'Confirm on your sandbox card', netbanking: 'Complete the payment on your bank page' }[method];
          if (method === 'upi' && isPhone()) el.querySelector('.modal__body').innerHTML = `${intentPanel({ amount: p.amount, ref: p.id })}<p class="callout">Sandbox: nothing is charged. Choose how this test payment ends.</p><p class="form-error" id="gErr"></p>`;
          else el.querySelector('.modal__body').innerHTML = `<div class="gateway">${method === 'qr' ? fakeQr(p.id) : '<span class="spinner"></span>'}<b translate="no">${esc(money(p.amount))}</b><p>${esc(label)}</p><small class="muted mono">${esc(p.id)}</small></div><p class="callout">Sandbox: choose how this test payment ends.</p><p class="form-error" id="gErr"></p>`;
          el.querySelector('.modal__foot').innerHTML = '<button class="btn btn-outline" id="gFail">Simulate failure</button><button class="btn btn-primary" id="gOk">Simulate success</button>';
          const finish = async (result) => {
            try { await api('/hub/payments/confirm', { method: 'POST', body: { id: p.id, result } }); if (result === 'success') { toast('Money added to your wallet'); refresh(); close(true); } else { toast('Payment failed. Nothing was charged.', true); close(false); } }
            catch (err) { el.querySelector('#gErr').textContent = err.message; }
          };
          el.querySelector('#gOk').addEventListener('click', () => finish('success'));
          el.querySelector('#gFail').addEventListener('click', () => finish('failed'));
        } catch (err) { el.querySelector('#amtErr').textContent = err.message; }
      });
    },
  });
}

// Asks the owner to approve a payment above this person's limit.
function requestApproval(amount) {
  return modal({
    title: 'Approval needed',
    body: `<p class="notop">This payment of ${esc(money(amount))} is above your spending limit. Send it to the account owner for approval, then book again.</p><label class="field">What is it for?<input class="input" id="why"></label><p class="form-error" id="e"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="y">Request approval</button>',
    onMount: (el, close) => el.querySelector('#y').addEventListener('click', async () => { try { await api('/hub/spend/request', { method: 'POST', body: { amount, note: el.querySelector('#why').value } }); toast('Sent for approval'); close(true); } catch (x) { el.querySelector('#e').textContent = x.message; } }),
  });
}

// Runs a payment; on "not enough balance" offers a top-up and retries once.
export async function withFunds(run) {
  try { return await run(); }
  catch (err) {
    if (err.data && err.data.needs_approval) { await requestApproval(err.data.amount); const stop = new Error('Waiting for approval.'); stop.quiet = true; throw stop; }
    if (!err.data || !err.data.needs_topup) throw err;
    const ok = await addMoney(err.data.shortfall, `You need ₹${Number(err.data.shortfall).toLocaleString('en-IN')} more to complete this payment.`);
    if (!ok) { const stop = new Error('Payment not completed.'); stop.quiet = true; throw stop; }
    return run();
  }
}

export const payChoice = (name, { later = 'Pay on delivery', laterHint = 'Pay in cash when the service is done', allowLater = true, value = 'prepaid' } = {}) => `
  <div class="pay2" role="radiogroup" aria-label="Payment">
    <label class="pay"><input type="radio" name="${name}" value="prepaid" ${value === 'prepaid' ? 'checked' : ''}>${duo('wallet').value}<span><b>Pay online</b><small>UPI, card, wallet and more</small></span></label>
    ${allowLater ? `<label class="pay"><input type="radio" name="${name}" value="cod" ${value === 'cod' ? 'checked' : ''}>${duo('cash').value}<span><b>${esc(later)}</b><small>${esc(laterHint)}</small></span></label>` : ''}
  </div>`;

// Coupon and reward points for a checkout. The server re-checks both when you pay.
export function mountDeals(root, { section, amount, onChange }) {
  const state = { coupon: '', discount: 0, use_points: false, points: 0 };
  root.innerHTML = '<div class="skeleton" style="height:42px"></div>';
  api('/hub/rewards').then((r) => {
    const offers = r.coupons.filter((c) => !c.used && (!c.sections || c.sections.includes(section)));
    const usable = () => Math.min(r.points, Math.floor((amount - state.discount) * 0.1));
    root.innerHTML = `<div class="deal"><div class="deal__row"><input class="input" id="cp" placeholder="Coupon code" aria-label="Coupon code" autocomplete="off" style="text-transform:uppercase"><button class="btn btn-outline" id="cpGo" type="button">Apply</button></div>
      ${offers.length ? `<div class="chips">${offers.map((c) => `<button type="button" class="chip" data-cp="${esc(c.code)}" title="${esc(c.label)}" translate="no">${esc(c.code)}</button>`).join('')}</div>` : ''}<small id="cpMsg" class="muted"></small>
      ${r.points >= 1 ? `<label class="row deal__pts"><input type="checkbox" class="check" id="pts"> <span id="ptsT"></span></label>` : ''}</div>`;
    const msg = root.querySelector('#cpMsg'); const input = root.querySelector('#cp'); const pts = root.querySelector('#pts');
    const sync = () => { state.points = state.use_points ? usable() : 0; if (pts) root.querySelector('#ptsT').textContent = `Use ${usable()} reward points (${money(usable())} off)`; onChange(state); };
    const apply = async (code) => {
      if (!code) { state.coupon = ''; state.discount = 0; msg.textContent = ''; return sync(); }
      try { const c = await api('/hub/coupon/check', { method: 'POST', body: { code, section, amount } }); state.coupon = c.code; state.discount = c.discount; msg.textContent = `Applied: ${c.label}`; msg.className = 'pos'; }
      catch (e) { state.coupon = ''; state.discount = 0; msg.textContent = e.message; msg.className = 'form-error'; }
      return sync();
    };
    root.querySelector('#cpGo').addEventListener('click', () => apply(input.value.trim().toUpperCase()));
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-cp]'); if (b) { input.value = b.dataset.cp; apply(b.dataset.cp); } });
    if (pts) pts.addEventListener('change', () => { state.use_points = pts.checked; sync(); });
    sync();
  }).catch(() => { root.innerHTML = ''; });
  return state;
}

// Filter icon and panel, used on every list. Field: { key, label, options | type, def }.
const FUNNEL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8.200V19l-4 2v-7.800z"/></svg>';
export const countActive = (fields, values) => fields.filter((f) => String(values[f.key] ?? '') !== String(f.def ?? '')).length;
export const filterBtn = (active = 0, id = 'flt') => `<button class="filter-btn ${active ? 'on' : ''}" id="${id}" type="button" aria-haspopup="dialog" aria-label="Filters${active ? `, ${active} active` : ''}" title="Filters">${FUNNEL}<span>Filters</span>${active ? `<i>${active}</i>` : ''}</button>`;
export function openFilters(anchor, fields, values, onApply) {
  popover(anchor, `<h2 class="pop__title">Filters</h2><form class="pop__form">${fields.map((f) => `<label class="field">${esc(f.label)}${f.options ? `<select class="select" name="${f.key}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(values[f.key] ?? f.def ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : `<input class="input" name="${f.key}" inputmode="decimal" value="${esc(values[f.key] ?? '')}" placeholder="${esc(f.placeholder || '')}">`}</label>`).join('')}<div class="pop__actions"><button class="btn btn-outline btn-sm" type="button" data-clear>Clear</button><button class="btn btn-primary btn-sm" type="submit">Apply</button></div></form>`, (el, close) => {
    const form = el.querySelector('form');
    const read = () => Object.fromEntries(fields.map((f) => [f.key, form[f.key].value]));
    form.addEventListener('submit', (e) => { e.preventDefault(); const v = read(); close(); onApply(v); });
    el.querySelector('[data-clear]').addEventListener('click', () => { const v = Object.fromEntries(fields.map((f) => [f.key, f.def ?? ''])); close(); onApply(v); });
  });
}

// Wallet, Rewards and Insights are one section.
export function moneyTabs(active) {
  const p = store.state.user && store.state.user.permissions;
  const can = (m) => !p || (p[m] || 'none') !== 'none';
  return `<nav class="tabs tabs--line">${[['wallet', 'Wallet', 'wallet'], ['rewards', 'Rewards', 'rewards'], ['insights', 'Insights', 'insights']].filter(([, , m]) => can(m)).map(([k, l]) => `<a href="#/${k}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}</nav>`;
}

export const SORTS = [['best', 'Recommended'], ['fast', 'Fastest'], ['low', 'Price: low to high'], ['rating', 'Top rated']];
export function sortChips(active, sorts = SORTS) {
  return `<div class="chips" role="group" aria-label="Sort">${sorts.map(([k, l]) => `<button type="button" class="chip" data-sort="${k}" aria-pressed="${k === active}">${esc(l)}</button>`).join('')}</div>`;
}
export const TAG_TONE = { 'Your rule': 'green', Recommended: 'green', Cheapest: 'blue', Fastest: 'amber', Closest: 'amber', 'Top rated': 'purple' };
export const tagBadges = (tags = []) => tags.map((t) => `<span class="badge badge-${TAG_TONE[t] || ''}">${esc(t)}</span>`).join('');
export const star = (r) => `<span class="rating" title="Rating ${r} out of 5"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.500 3 6.100 6.700 1-4.900 4.700 1.200 6.700-6-3.200-6 3.200 1.200-6.700L2.300 9.600l6.700-1z"/></svg>${Number(r).toFixed(1)}</span>`;

const PILL = { new: ['blue', 'New'], assigned: ['amber', 'Assigned'], transit: ['amber', 'In transit'], delivered: ['green', 'Completed'], cancelled: ['', 'Cancelled'] };
export function statusPill(r) { const [tone, fallback] = PILL[r.group] || ['', r.status]; return `<span class="badge ${tone ? 'badge-' + tone : ''}">${esc(r.group === 'cancelled' ? 'Cancelled' : r.label || fallback)}</span>`; }

export function emptyScene(text, cta, art = 'delivery') {
  return `<div class="empty-scene">${scene(art).value}<p>${esc(text)}</p>${cta ? `<a class="btn btn-primary" href="${esc(cta.href)}">${esc(cta.label)}</a>` : ''}</div>`;
}

// ---- charts: one series each, one hue, values on hover ---------------------------
const shortDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function bars(el, data, label) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  el.className = 'bars';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${label}: ${data.map((d) => `${shortDay(d.day)} ${money(d.amount)}`).join(', ')}`);
  el.innerHTML = `<div class="bars__plot">${data.map((d, i) => `<div class="bars__col" data-i="${i}"><i style="height:${d.amount ? Math.max(3, (d.amount / max) * 100) : 0}%"></i></div>`).join('')}<div class="tip" hidden></div></div>
    <div class="bars__axis"><span>${esc(shortDay(data[0].day))}</span><span>${esc(shortDay(data[data.length - 1].day))}</span></div>`;
  const tip = el.querySelector('.tip');
  const plot = el.querySelector('.bars__plot');
  plot.addEventListener('mousemove', (e) => {
    const col = e.target.closest('.bars__col');
    if (!col) return;
    const d = data[Number(col.dataset.i)];
    tip.hidden = false;
    tip.innerHTML = `<small>${esc(shortDay(d.day))}</small><b>${esc(money(d.amount))}</b>`;
    const x = col.offsetLeft + col.offsetWidth / 2;
    tip.style.left = Math.max(44, Math.min(x, plot.clientWidth - 44)) + 'px';
  });
  plot.addEventListener('mouseleave', () => { tip.hidden = true; });
}

export function area(el, data, key = 'balance') {
  const W = 600; const H = 90;
  const vals = data.map((d) => d[key]);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const y = (v) => H - 6 - ((v - min) / Math.max(1, max - min)) * (H - 16);
  const x = (i) => (i / (data.length - 1)) * W;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join('');
  el.classList.add('area');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `Balance over the last ${data.length} days, from ${money(vals[0])} to ${money(vals[vals.length - 1])}`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="area__fill" d="${line}L${W} ${H}L0 ${H}Z"/><path class="area__line" d="${line}" vector-effect="non-scaling-stroke"/></svg><i class="area__cross" hidden></i><div class="tip" hidden></div>`;
  const tip = el.querySelector('.tip'); const cross = el.querySelector('.area__cross');
  el.addEventListener('mousemove', (e) => {
    const r = el.getBoundingClientRect();
    const i = Math.max(0, Math.min(data.length - 1, Math.round(((e.clientX - r.left) / r.width) * (data.length - 1))));
    const px = (i / (data.length - 1)) * r.width;
    cross.hidden = false; cross.style.left = px + 'px';
    tip.hidden = false; tip.innerHTML = `<small>${esc(shortDay(data[i].day))}</small><b>${esc(money(data[i][key]))}</b>`;
    tip.style.left = Math.max(48, Math.min(px, r.width - 48)) + 'px';
  });
  el.addEventListener('mouseleave', () => { tip.hidden = true; cross.hidden = true; });
}

export function hbars(rows, labelOf = (r) => r.name) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return `<div class="hbars">${rows.map((r) => `<div class="hbar"><span class="hbar__l">${esc(labelOf(r))}</span><span class="hbar__t"><i style="width:${Math.max(2, (r.amount / max) * 100)}%"></i></span><b>${esc(money(r.amount))}</b></div>`).join('')}</div>`;
}

export const SECTION_LABEL = { vehicle: 'Vehicle', courier: 'Courier', logistics: 'Logistics', international: 'International', travel: 'Travel & stay', rides: 'Local rides', recharge: 'Recharge', bills: 'Bills', business: 'Business payments' };
export const SECTION_ICON = { vehicle: 'bike', courier: 'parcel', logistics: 'truck', international: 'globe', travel: 'plane', rides: 'ride', recharge: 'phone', bills: 'bill', business: 'briefcase' };
export const whenText = (iso) => date(iso);
export function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
