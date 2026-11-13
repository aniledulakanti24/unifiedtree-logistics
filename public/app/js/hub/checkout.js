// Choose how to pay. Everything except the wallet runs on the sandbox gateway.
import { api, esc, money, modal, toast, store } from '../core.js';
import { duo } from './art.js';
import { addInstrument, payCatalog, TYPES } from './instruments.js';
import { isPhone, intentPanel } from './upi.js';

export const PAY_LABEL = { wallet: 'Wallet', upi: 'UPI', card: 'Card', emi: 'EMI', netbanking: 'Netbanking', paylater: 'Pay Later', ewallet: 'Other wallet', giftcard: 'Gift card', neft: 'Bank transfer' };
const METHODS = [['wallet', 'Wallet', 'Your UT Log balance', 'wallet'], ['upi', 'UPI', 'Any UPI app or ID', 'phone'], ['card', 'Card', 'Credit or debit', 'card'], ['emi', 'EMI', 'Pay monthly', 'calendar'], ['netbanking', 'Netbanking', 'Your bank', 'bank'], ['paylater', 'Pay Later', 'Pay next month', 'receipt'], ['ewallet', 'Other wallets', 'Paytm, Amazon Pay', 'cash'], ['giftcard', 'Gift card', 'Redeem a card', 'gift'], ['neft', 'Bank transfer', 'NEFT or RTGS', 'building']];
const NO_CARD = ['card', 'emi', 'paylater', 'giftcard'];

export const BOOKING_PAY = ['wallet', 'upi', 'card'];
export const payMethods = ({ card = true, only = null } = {}) => { const business = store.state.accountType === 'business'; return `<div class="field full"><span>Pay with</span><div class="pay2 pay4" role="radiogroup" aria-label="Payment method">${METHODS.filter(([k]) => (only ? only.includes(k) : (card || !NO_CARD.includes(k)) && (business || k !== 'neft'))).map(([k, l, s, i], n) => `<label class="pay"><input type="radio" name="pm" value="${k}" ${n ? '' : 'checked'}>${duo(i).value}<span><b>${l}</b><small>${s}</small></span></label>`).join('')}</div></div>`; };

const qr = (seed) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; let out = ''; for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) { h = (h * 1664525 + 1013904223) >>> 0; const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); if (corner ? (x % 6 === 0 || y % 6 === 0 || ((x % 14) > 1 && (x % 14) < 5 && (y % 14) > 1 && (y % 14) < 5)) : (h >> 16) & 1) out += `<rect x="${x}" y="${y}" width="1" height="1"/>`; } return `<svg class="qr" viewBox="0 0 21 21" aria-label="Sandbox payment code">${out}</svg>`; };

const TITLE = { upi: 'Pay by UPI', card: 'Pay by card', emi: 'Pay by EMI', netbanking: 'Pay by netbanking', paylater: 'Pay Later', ewallet: 'Pay by wallet', giftcard: 'Pay by gift card', neft: 'Pay by bank transfer' };
const PICK = { upi: 'Choose an app or UPI ID', card: 'Choose a card', emi: 'Choose a card', netbanking: 'Choose a bank', paylater: 'Choose a provider', ewallet: 'Choose a wallet', giftcard: 'Choose a gift card', neft: 'Pay from' };

// Resolves to {} for wallet, { payment_id } once a sandbox payment succeeds, or null if abandoned.
export async function checkout(root, amount) {
  const picked = root.querySelector('[name=pm]:checked');
  const method = picked ? picked.value : 'wallet';
  if (method === 'wallet') return {};
  const c = await payCatalog();
  const savedType = method === 'emi' ? 'card' : method === 'neft' ? null : method;
  const load = async () => {
    const { instruments } = await api('/hub/checkout/methods');
    const saved = instruments.filter((i) => i.type === savedType).sort((a, b) => Number(b.is_default) - Number(a.is_default)).map((i) => [`i:${i.id}`, i.label]);
    const base = { upi: [...c.upi_apps.map((a) => [`d:${a}`, a]), ['d:qr', 'Scan QR'], ['vpa', 'Enter UPI ID']], card: c.test_cards.map((x) => [`d:${x}`, x]), emi: c.test_cards.map((x) => [`d:${x}`, x]), netbanking: c.banks.map((b) => [`d:${b}`, b]), paylater: c.pay_later.map((b) => [`d:${b}`, b]), ewallet: c.ewallets.map((b) => [`d:${b}`, b]), giftcard: [], neft: c.banks.map((b) => [`d:${b}`, b]) }[method];
    return [...saved, ...base];
  };
  const chips = (list, sel) => (list.length ? list.map(([v, l], n) => `<label class="chip-pick"><input type="radio" name="src" value="${esc(v)}" ${(sel ? v === sel : !n) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('') : '<p class="muted notop">Nothing saved yet. Add one to continue.</p>');
  const list = await load();
  const emi = method === 'emi' ? `<div class="field mt"><span>Plan (no-cost, sandbox)</span><div class="upi-apps">${c.emi_months.map((m, n) => `<label class="chip-pick"><input type="radio" name="plan" value="${m}" ${n ? '' : 'checked'}><span>${m} months · <span translate="no">${esc(money(Math.ceil(amount / m)))}</span>/mo</span></label>`).join('')}</div></div>` : '';
  const result = await modal({
    title: TITLE[method],
    body: `<p class="pay-total"><small>Amount to pay</small><b translate="no">${esc(money(amount))}</b></p><div class="section-head"><b>${PICK[method]}</b>${savedType ? `<button class="link" id="addNew" type="button">+ Add new</button>` : ''}</div><div class="upi-apps" id="src" role="radiogroup" aria-label="${PICK[method]}">${chips(list)}</div><label class="field mt" id="vpaBox" hidden>UPI ID<input class="input" id="vpa" placeholder="name@bank" autocomplete="off"></label>${emi}<p class="muted small">Sandbox payment: no real money is taken.</p><p class="form-error" id="e"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Continue</button>',
    onMount(el, close) {
      const add = el.querySelector('#addNew');
      if (add) add.addEventListener('click', async () => { const inst = await addInstrument(savedType); if (inst) el.querySelector('#src').innerHTML = chips(await load(), `i:${inst.id}`); });
      el.addEventListener('change', (e) => { if (e.target.name === 'src') el.querySelector('#vpaBox').hidden = e.target.value !== 'vpa'; });
      el.querySelector('#go').addEventListener('click', async () => {
        try {
          const src = el.querySelector('[name=src]:checked');
          if (!src) { el.querySelector('#e').textContent = `Add a ${TYPES[savedType][0].toLowerCase()} first.`; return; }
          const body = { amount, method, plan: method === 'emi' ? el.querySelector('[name=plan]:checked').value : undefined };
          if (src.value.startsWith('i:')) body.instrument_id = src.value.slice(2);
          else body.detail = src.value === 'vpa' ? el.querySelector('#vpa').value.trim() : src.value.slice(2);
          const p = await api('/hub/checkout/intent', { method: 'POST', body });
          const isQr = body.detail === 'qr';
          const text = isQr ? 'Scan this code with any UPI app' : method === 'upi' ? `Approve the request on ${p.detail}` : `Confirm the payment with ${p.detail}`;
          const handoff = method === 'upi' && !isQr && isPhone();
          el.querySelector('.modal__body').innerHTML = handoff ? `${intentPanel({ app: p.detail, amount: p.amount, ref: p.id })}<p class="callout">Sandbox: nothing is charged. Choose how this test payment ends.</p><p class="form-error" id="g"></p>` : `<div class="gateway">${isQr ? qr(p.id) : '<span class="spinner"></span>'}<b translate="no">${esc(money(p.amount))}</b><p>${esc(text)}</p><small class="muted mono">${esc(p.id)}</small></div><p class="callout">Sandbox: choose how this test payment ends.</p><p class="form-error" id="g"></p>`;
          el.querySelector('.modal__foot').innerHTML = '<button class="btn btn-outline" id="no">Simulate failure</button><button class="btn btn-primary" id="ok">Simulate success</button>';
          const finish = async (r) => {
            try { await api('/hub/checkout/confirm', { method: 'POST', body: { id: p.id, result: r } }); if (r === 'success') close(p.id); else { toast('Payment failed. Nothing was charged.', true); close(null); } }
            catch (x) { el.querySelector('#g').textContent = x.message; }
          };
          el.querySelector('#ok').addEventListener('click', () => finish('success'));
          el.querySelector('#no').addEventListener('click', () => finish('failed'));
        } catch (x) { el.querySelector('#e').textContent = x.message; }
      });
    },
  });
  return result ? { payment_id: result } : null;
}
