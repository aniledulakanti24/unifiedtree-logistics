// Wallet funding, on the Payment methods page: the default method for adding money, the auto
// top-up rule (which saved method it charges, when, how much, and a monthly limit), and every
// top-up with a downloadable receipt and a monthly statement.
import { api, esc, money, toast, withBusy, dateTime } from '../core.js';
import { icon } from './icons.js';
import { tile } from './art.js';
import { TYPES } from './instruments.js';
import { addMoney, downloadCsv } from './ui.js';

const METHOD = { upi: 'UPI', qr: 'UPI QR', card: 'Card', netbanking: 'Netbanking' };
const monthName = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export async function mountFunding(root, onChange) {
  root.innerHTML = '<div class="skeleton" style="height:180px"></div>';
  const d = await api('/hub/wallet/funding');
  const again = () => mountFunding(root, onChange);
  const fund = d.instruments.filter((i) => i.can_fund);
  const def = d.instruments.find((i) => i.id === d.default_id);
  const r = d.rule;
  const pct = r.monthly_cap ? Math.min(100, Math.round((r.used_this_month / r.monthly_cap) * 100)) : 0;
  const instTile = (i) => tile(TYPES[i.type][1], TYPES[i.type][2]).value;
  root.innerHTML = `
    <div class="wf-def">${def ? `${instTile(def)}<div class="grow"><small>Default for adding money</small><b>${esc(def.label)}</b>${def.can_fund ? '' : '<em class="wf-warn">Pay Later, wallets and gift cards can\'t add money. Pick a UPI ID, card or bank as default.</em>'}</div>` : `<span class="wf-none">${icon('card', 20)}</span><div class="grow"><small>Default for adding money</small><b>None yet</b><em>Save a UPI ID, card or bank account below and make it the default.</em></div>`}
      <button class="btn btn-primary btn-sm" type="button" id="wfAdd">${icon('plus', 15)}Add money</button></div>
    <div class="wf-auto ${r.enabled ? 'on' : ''}">
      <div class="wf-auto__h"><span class="wf-bolt">${icon('rocket', 18)}</span><div class="grow"><b>Auto top-up</b><small>${r.enabled ? `On · adds ${esc(money(r.amount))} when your balance drops below ${esc(money(r.threshold))}` : 'Off · top up automatically so a booking never fails for low balance'}</small></div>
        <label class="switch"><input type="checkbox" id="wfOn" ${r.enabled ? 'checked' : ''} aria-label="Auto top-up"><i></i></label></div>
      <form class="form-grid wf-form" id="wfF" novalidate>
        <label class="field">When balance is below (₹)<input class="input" name="threshold" inputmode="numeric" value="${r.threshold}"></label>
        <label class="field">Add this much (₹)<input class="input" name="amount" inputmode="numeric" value="${r.amount}"></label>
        <label class="field">Charge<select class="select" name="instrument_id" ${fund.length ? '' : 'disabled'}>${fund.length ? fund.map((i) => `<option value="${esc(i.id)}" ${i.id === r.instrument_id ? 'selected' : ''}>${esc(i.label)}${i.is_default ? ' (default)' : ''}</option>`).join('') : '<option>Save a UPI ID, card or bank first</option>'}</select></label>
        <label class="field">Monthly limit (₹, 0 = no limit)<input class="input" name="monthly_cap" inputmode="numeric" value="${r.monthly_cap || 0}"></label>
        ${r.monthly_cap ? `<div class="full wf-cap"><div class="row"><small>${esc(money(r.used_this_month))} of ${esc(money(r.monthly_cap))} auto-added this month</small><span class="spacer"></span><small>${pct}%</small></div><span class="wf-bar"><i style="width:${pct}%"></i></span></div>` : ''}
        <p class="form-error full" id="wfE"></p>
        <div class="full row"><button class="btn btn-outline btn-sm" type="submit">Save auto top-up</button><small class="muted">Sandbox: nothing is charged. In the live app your bank asks you to approve a mandate once.</small></div>
      </form>
    </div>`;
  const f = root.querySelector('#wfF');
  const save = async (extra = {}) => {
    const v = Object.fromEntries(new FormData(f));
    const body = { threshold: v.threshold, amount: v.amount, monthly_cap: v.monthly_cap, ...(v.instrument_id && fund.length ? { instrument_id: v.instrument_id } : {}), ...extra };
    await api('/hub/wallet/funding/rule', { method: 'POST', body });
  };
  root.querySelector('#wfOn').addEventListener('change', async (e) => {
    try { await save({ enabled: e.target.checked }); toast(e.target.checked ? 'Auto top-up is on' : 'Auto top-up is off'); again(); if (onChange) onChange(); }
    catch (x) { e.target.checked = !e.target.checked; root.querySelector('#wfE').textContent = x.message; }
  });
  f.addEventListener('submit', (e) => { e.preventDefault(); withBusy(f.querySelector('[type=submit]'), async () => { try { await save(); toast('Auto top-up saved'); again(); } catch (x) { root.querySelector('#wfE').textContent = x.message; } }); });
  root.querySelector('#wfAdd').addEventListener('click', async () => { if (await addMoney()) { again(); if (onChange) onChange(); } });
}

// Every top-up, with a receipt for each and a statement per month.
export async function mountTopups(root) {
  root.innerHTML = '<div class="skeleton" style="height:160px"></div>';
  const d = await api('/hub/wallet/funding');
  const list = d.topups;
  root.innerHTML = `${d.months.length ? `<div class="wf-months">${d.months.map((m) => `<div class="wf-month"><div class="grow"><b>${esc(monthName(m.month))}</b><small>${m.count} top-up${m.count === 1 ? '' : 's'} · ${esc(money(m.amount))}${m.auto ? ` · ${esc(money(m.auto))} automatic` : ''}</small></div><button class="btn btn-outline btn-sm" type="button" data-stmt="${esc(m.month)}">${icon('download', 14)}Statement</button></div>`).join('')}</div>` : ''}
    ${list.length ? `<ul class="wf-list">${list.map((t) => `<li class="wf-row ${t.status === 'SUCCESS' ? '' : 'is-fail'}"><span class="wf-kind wf-kind--${t.kind}">${icon(t.kind === 'auto' ? 'rocket' : 'plus', 15)}</span>
        <div class="grow"><b translate="no">${esc(money(t.amount))}</b><small>${t.kind === 'auto' ? 'Auto top-up' : 'Added'} · ${esc(t.source || METHOD[t.method] || t.method)} · ${esc(dateTime(t.at))}</small></div>
        ${t.status === 'SUCCESS' ? `<button class="btn btn-ghost btn-sm" type="button" data-rcpt="${esc(t.id)}">${icon('receipt', 14)}Receipt</button>` : '<span class="badge badge-red">Failed</span>'}</li>`).join('')}</ul>`
    : `<div class="wf-empty">${icon('receipt', 24)}<p>No top-ups yet. Receipts for every top-up appear here.</p></div>`}`;
  root.onclick = (e) => {
    const rc = e.target.closest('[data-rcpt]');
    if (rc) { receipt(list.find((t) => t.id === rc.dataset.rcpt)); return; }
    const st = e.target.closest('[data-stmt]');
    if (st) {
      const rows = list.filter((t) => String(t.at).slice(0, 7) === st.dataset.stmt);
      downloadCsv(`ut-log-wallet-topups-${st.dataset.stmt}.csv`, [['Date', 'Reference', 'Type', 'Paid with', 'Amount INR', 'Status', 'Balance after INR'], ...rows.map((t) => [t.at, t.id, t.kind === 'auto' ? 'Auto top-up' : 'Manual', t.source || METHOD[t.method] || t.method, t.amount, t.status, t.balance_after ?? ''])]);
      toast('Statement downloading');
    }
  };
}

function receipt(t) {
  const w = window.open('', '_blank', 'width=480,height=720');
  if (!w) { toast('Allow pop-ups to download the receipt.', true); return; }
  const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = [['Receipt no.', `UT-TU-${t.id}`], ['Date & time', new Date(t.at).toLocaleString('en-IN')], ['Type', t.kind === 'auto' ? 'Auto top-up' : 'Wallet top-up'], ['Paid with', t.source || METHOD[t.method] || t.method], ['Reference', t.id], ['Status', 'Successful'], ...(t.balance_after != null ? [['Wallet balance after', `₹${Number(t.balance_after).toLocaleString('en-IN')}`]] : [])];
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Wallet top-up receipt</title><style>body{font:14px Inter,system-ui,sans-serif;color:#11201c;margin:0;padding:28px;background:#f4f6f5}.r{max-width:400px;margin:auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.08)}h1{font-size:15px;margin:0 0 2px;color:#0e7c66}small{color:#66756f}.a{font-size:30px;font-weight:700;margin:16px 0 2px}.ok{display:inline-block;margin:6px 0 14px;padding:3px 10px;border-radius:99px;background:#e3f5ee;color:#0b7a62;font-weight:600;font-size:12px}dl{margin:0;border-top:1px dashed #d6dfdc}dl div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed #e4eae8}dt{color:#66756f}dd{margin:0;text-align:right;font-weight:600}p{color:#66756f;font-size:12px;margin-top:16px;line-height:1.5}</style>
    <div class="r"><h1>UT Log · Wallet top-up receipt</h1><small>Money added to your UT Log wallet</small><div class="a">₹${Number(t.amount).toLocaleString('en-IN')}</div><span class="ok">Successful</span><dl>${rows.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>
    <p>Adding money to a wallet is not a sale, so no GST is charged on a top-up. GST invoices are issued for each booking or payment you make from the wallet. Demo receipt (sandbox).</p></div><script>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}
