// Payment methods a person saves: UPI IDs, cards, banks, Pay Later, wallets and gift cards.
// A card keeps only its network, last 4 digits and expiry. Full numbers and CVVs are never collected.
import { api, esc, modal, toast, withBusy, formData } from '../core.js';
import { tile } from './art.js';
import { filterBtn, openFilters, countActive } from './ui.js';

let cached = null;
export const payCatalog = async () => { if (!cached) cached = await api('/hub/catalog'); return cached; };

export const TYPES = { upi: ['UPI ID', 'phone', 'green'], card: ['Card', 'card', 'blue'], netbanking: ['Bank account', 'bank', 'violet'], paylater: ['Pay Later', 'calendar', 'amber'], ewallet: ['Wallet', 'wallet', 'coral'], giftcard: ['Gift card', 'gift', 'rose'] };
const select = (name, label, list) => `<label class="field">${esc(label)}<select class="select" name="${name}">${list.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>`;
const input = (name, label, attrs = '') => `<label class="field">${esc(label)}<input class="input" name="${name}" autocomplete="off" ${attrs}></label>`;

function fields(type, c) {
  if (type === 'upi') return input('vpa', 'UPI ID', 'placeholder="name@bank"') + select('kind', 'Type', c.upi_kinds);
  if (type === 'card') return `${select('kind', 'Card type', ['Credit', 'Debit'])}${select('network', 'Network', c.card_networks)}${select('bank', 'Issuing bank', c.banks)}${input('name', 'Name on card')}${input('last4', 'Last 4 digits', 'inputmode="numeric" maxlength="4" placeholder="1234"')}${input('expiry', 'Expiry', 'maxlength="5" placeholder="MM/YY"')}<p class="muted small full notop">Only the last 4 digits are saved. Never enter your full card number or CVV here.</p>`;
  if (type === 'netbanking') return select('bank', 'Bank', c.banks) + input('last4', 'Last 4 digits of account (optional)', 'inputmode="numeric" maxlength="4"');
  if (type === 'paylater') return select('provider', 'Provider', c.pay_later) + input('mobile', 'Registered mobile', 'inputmode="numeric" maxlength="10"');
  if (type === 'ewallet') return select('provider', 'Wallet', c.ewallets) + input('mobile', 'Registered mobile', 'inputmode="numeric" maxlength="10"');
  return select('provider', 'Gift card', c.gift_cards) + input('code', 'Gift card code', 'maxlength="24"');
}

// Resolves to the saved method, or null if cancelled.
export async function addInstrument(type) {
  const c = await payCatalog();
  return modal({
    title: `Add ${TYPES[type][0].toLowerCase()}`,
    body: `<form class="form-grid" id="insF" novalidate>${fields(type, c)}<label class="row full"><input type="checkbox" class="check" name="is_default"> Make this my default</label></form><p class="muted small">Sandbox: nothing is verified or charged.</p><p class="form-error" id="insE"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="insGo">Save</button>',
    onMount(el, close) {
      const go = el.querySelector('#insGo');
      go.addEventListener('click', () => withBusy(go, async () => {
        const d = formData(el.querySelector('#insF'));
        try { const r = await api('/hub/checkout/instruments', { method: 'POST', body: { type, ...d, is_default: !!d.is_default } }); toast(`${TYPES[type][0]} saved`); close(r); }
        catch (x) { el.querySelector('#insE').textContent = x.message; }
      }));
    },
  });
}

// The list and Add buttons on the profile's Payment methods tab.
const shown = { type: '' };
export async function mountInstruments(root) {
  root.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  const { instruments: all } = await api('/hub/checkout/methods');
  const fieldsF = [{ key: 'type', label: 'Type', options: [['', 'All methods'], ...Object.entries(TYPES).map(([k, v]) => [k, v[0]])] }];
  const list = all.filter((i) => !shown.type || i.type === shown.type);
  const again = () => mountInstruments(root);
  root.innerHTML = `<div class="section-head"><span class="muted small">${all.length} saved</span>${filterBtn(countActive(fieldsF, shown), 'insFlt')}</div>
    ${list.length ? `<ul class="addr">${list.map((i) => `<li>${tile(TYPES[i.type][1], TYPES[i.type][2]).value}<div class="grow"><b>${esc(i.label)}</b><small class="muted block">${esc(TYPES[i.type][0])}${i.expiry ? ` · Expires ${esc(i.expiry)}` : ''}</small></div>${i.is_default ? '<span class="badge badge-green">Default</span>' : `<button class="btn btn-outline btn-sm" data-def="${esc(i.id)}" type="button">Make default</button>`}<button class="btn btn-danger btn-sm" data-del="${esc(i.id)}" type="button">Remove</button></li>`).join('')}</ul>` : `<p class="muted notop">${all.length ? 'No methods of this type.' : 'No saved methods yet. Add one to pay faster.'}</p>`}
    <div class="ins-add">${Object.entries(TYPES).map(([k, v]) => `<button class="btn btn-soft" data-add="${k}" type="button">+ ${esc(v[0])}</button>`).join('')}</div>`;
  root.querySelector('#insFlt').addEventListener('click', (e) => openFilters(e.currentTarget, fieldsF, shown, (v) => { shown.type = v.type; again(); }));
  root.onclick = async (e) => {
    const add = e.target.closest('[data-add]'); const def = e.target.closest('[data-def]'); const del = e.target.closest('[data-del]');
    try {
      if (add && await addInstrument(add.dataset.add)) again();
      if (def) { await api('/hub/checkout/instruments/default', { method: 'POST', body: { id: def.dataset.def } }); toast('Default updated'); again(); }
      if (del) { await api('/hub/checkout/instruments/remove', { method: 'POST', body: { id: del.dataset.del } }); toast('Removed'); again(); }
    } catch (x) { toast(x.message, true); }
  };
}
