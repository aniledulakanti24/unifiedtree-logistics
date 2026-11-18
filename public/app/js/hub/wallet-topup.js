// Add money to the UT Log wallet through the sandbox gateway: pick an amount (with a live
// "balance after"), pick how to pay, approve, then see the new balance. No card or bank details
// are ever asked for; gift cards are redeemed by code. Resolves true when money was added.
import { api, esc, money, store, toast, refreshCounts, inrHint } from '../core.js';
import { icon } from './icons.js';
import { isPhone, intentPanel } from './upi.js';

const MIN = 100; const MAX = 100000;
const PRESETS = [500, 1000, 2000, 5000];
const METHODS = [
  ['upi', 'UPI', 'GPay, PhonePe, Paytm', 'phone'],
  ['qr', 'Scan QR', 'Any UPI app', 'qr'],
  ['card', 'Card', 'Debit or credit', 'card'],
  ['netbanking', 'Netbanking', 'All major banks', 'bank'],
  ['giftcard', 'Gift card', 'Redeem a code', 'tag'],
];
const QR_ICON = '<svg class="li" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></svg>';
const ico = (n, s = 20) => (n === 'qr' ? QR_ICON : icon(n, s));
const fakeQr = (seed) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; let out = ''; for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) { const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); h = (h * 1664525 + 1013904223) >>> 0; const on = corner ? (x % 6 === 0 || y % 6 === 0 || ((x % 14) > 1 && (x % 14) < 5 && (y % 14) > 1 && (y % 14) < 5)) : (h >> 16) & 1; if (on) out += `<rect x="${x}" y="${y}" width="1" height="1"/>`; } return `<svg class="qr" viewBox="0 0 21 21" aria-label="Sandbox payment code">${out}</svg>`; };
const balance = () => { const c = store.state.counts; return c && c.wallet_balance != null ? Number(c.wallet_balance) : null; };
const refresh = () => { refreshCounts().catch(() => {}); window.dispatchEvent(new CustomEvent('ut:refresh')); };

export function addMoney(prefill = 1000, why, start = 'upi') {
  return new Promise((resolve) => {
    const root = document.getElementById('modalRoot');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop wco-wrap';
    wrap.innerHTML = '<div class="modal wco wtu" role="dialog" aria-modal="true" aria-label="Add money to wallet"><div class="wco__in"></div></div>';
    root.appendChild(wrap);
    const box = wrap.querySelector('.wco__in');
    const need = why ? Math.max(MIN, Math.ceil(prefill)) : 0;
    const st = { amount: Math.min(MAX, Math.max(MIN, Math.ceil(prefill) || 1000)), method: METHODS.some(([k]) => k === start) ? start : 'upi', busy: false, done: false };
    const prevFocus = document.activeElement;
    const close = (v) => { if (st.busy || st.done) return; st.done = true; wrap.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) prevFocus.focus(); resolve(st.added ? true : v); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-x]')) close(false); });
    const head = (title, back) => `<div class="wtu__top">${back ? `<button class="icon-btn" type="button" data-back aria-label="Back">${icon('chevron', 18).replace('class="li"', 'class="li wtu__back"')}</button>` : `<span class="wtu__logo">${icon('wallet', 18)}</span>`}<b>${esc(title)}</b><button class="icon-btn" type="button" data-x aria-label="Close">${icon('x', 18)}</button></div>`;

    // ---- 1. amount and method -----------------------------------------------------------------
    function form() {
      const bal = balance();
      const gc = st.method === 'giftcard';
      box.innerHTML = `${head('Add money')}
        <div class="wco__body wtu__body">
          <div class="wtu__bal"><div><small>Wallet balance</small><b translate="no">${bal != null ? esc(money(bal)) : '—'}</b></div>${gc ? '' : `<span class="wtu__arrow">${icon('chevron', 16)}</span><div class="wtu__after"><small>After adding</small><b translate="no" id="after">${bal != null ? esc(money(bal + st.amount)) : '—'}</b></div>`}</div>
          ${need ? `<div class="wtu__need">${icon('alert', 16)}<span>${esc(why)}</span><button type="button" class="wtu__exact" data-amt="${need}">Add exactly <b translate="no">${esc(money(need))}</b></button></div>` : ''}
          ${gc ? `<label class="wtu__gc"><span>Gift card code</span><input class="input mono" id="gcCode" placeholder="UTGC-2026-DEMO-0500" autocomplete="off" spellcheck="false"><small>The card's full value goes into your wallet, for any booking, recharge or bill.</small></label>` : `
          <div class="wtu__amt"><label for="amt">Enter amount</label><div class="wtu__field"><span>₹</span><input id="amt" inputmode="numeric" autocomplete="off" value="${st.amount.toLocaleString('en-IN')}" aria-describedby="amtHint"></div><small id="amtHint">${esc(inrHint(String(st.amount)) || `Between ${money(MIN)} and ${money(MAX)}`)}</small></div>
          <div class="wtu__chips">${PRESETS.map((a) => `<button type="button" class="wtu__chip ${a === st.amount ? 'on' : ''}" data-amt="${a}">${a === 2000 ? '<i>Popular</i>' : ''}₹${a.toLocaleString('en-IN')}</button>`).join('')}</div>`}
          <div class="wtu__ml">Pay using</div>
          <div class="wtu__methods" role="radiogroup" aria-label="Payment method">${METHODS.map(([k, l, sub, ic]) => `<label class="wtu__m ${k === st.method ? 'on' : ''}"><input type="radio" name="m" value="${k}" ${k === st.method ? 'checked' : ''}>${def && def.type === k ? '<i class="wtu__def">Default</i>' : ''}<span class="wtu__mi wtu__mi--${k}">${ico(ic)}</span><span class="wtu__mt"><b>${l}</b><small>${esc(def && def.type === k ? def.label : sub)}</small></span><span class="wtu__tick">${icon('check', 15)}</span></label>`).join('')}</div>
          <p class="form-error" id="err" role="alert"></p>
        </div>
        <div class="wco__foot"><button class="btn btn-primary btn-block wco__go" id="go" type="button">${gc ? `${icon('tag', 16)}Redeem gift card` : `${icon('plus', 16)}Add <span translate="no" id="goAmt">${esc(money(st.amount))}</span>`}</button><p class="wco__fine">${icon('shield', 13)}Sandbox payment · no real money is taken · 100% secure</p></div>`;
      const input = box.querySelector('#amt');
      const sync = () => {
        const v = Number(String(input.value).replace(/\D/g, '')) || 0;
        st.amount = v;
        const bal2 = balance();
        const a = box.querySelector('#after'); if (a && bal2 != null) a.textContent = money(bal2 + v);
        box.querySelector('#goAmt').textContent = money(v);
        box.querySelector('#amtHint').textContent = v < MIN ? `Minimum ${money(MIN)}` : v > MAX ? `Maximum ${money(MAX)} at a time` : inrHint(String(v)) || ' ';
        box.querySelector('#amtHint').classList.toggle('bad', v < MIN || v > MAX);
        box.querySelectorAll('.wtu__chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.amt) === v));
      };
      if (input) {
        input.addEventListener('input', () => { const n = String(input.value).replace(/\D/g, '').slice(0, 6); input.value = n ? Number(n).toLocaleString('en-IN') : ''; sync(); });
        setTimeout(() => { input.focus(); input.select(); }, 60);
      } else setTimeout(() => box.querySelector('#gcCode').focus(), 60);
      box.querySelectorAll('[data-amt]').forEach((b) => b.addEventListener('click', () => { if (!input) { st.amount = Number(b.dataset.amt); st.method = 'upi'; return form(); } input.value = Number(b.dataset.amt).toLocaleString('en-IN'); sync(); }));
      box.querySelector('.wtu__methods').addEventListener('change', (e) => { st.method = e.target.value; form(); });
      box.querySelector('#go').addEventListener('click', () => (st.method === 'giftcard' ? redeem() : pay()));
      (input || box.querySelector('#gcCode')).addEventListener('keydown', (e) => { if (e.key === 'Enter') box.querySelector('#go').click(); });
    }

    async function redeem() {
      const code = box.querySelector('#gcCode').value.trim();
      if (!code) { box.querySelector('#err').textContent = 'Enter the gift card code.'; return; }
      try { const r = await api('/hub/wallet/redeem', { method: 'POST', body: { code } }); success(r.amount, 'Gift card'); }
      catch (x) { box.querySelector('#err').textContent = x.message; }
    }

    // ---- 2. sandbox gateway ---------------------------------------------------------------------
    async function pay() {
      const v = st.amount;
      if (!(v >= MIN && v <= MAX)) { box.querySelector('#err').textContent = `Add between ${money(MIN)} and ${money(MAX)}.`; return; }
      let p;
      try { p = await api('/hub/payments/intent', { method: 'POST', body: { amount: v, method: st.method, instrument_id: def && def.type === st.method ? def.id : undefined } }); } catch (x) { box.querySelector('#err').textContent = x.message; return; }
      const m = METHODS.find(([k]) => k === st.method);
      const label = { upi: 'Approve the request in your UPI app', qr: 'Scan with any UPI app to pay', card: 'Confirm the payment on your card', netbanking: 'Finish the payment on your bank page' }[st.method];
      const visual = st.method === 'qr' ? `<div class="wtu__qr">${fakeQr(p.id)}<span>${icon('wallet', 18)}</span></div>`
        : st.method === 'upi' && isPhone() ? intentPanel({ amount: p.amount, ref: p.id })
          : `<div class="wtu__wait"><div class="wco__ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/></svg><span class="wtu__mi wtu__mi--${st.method}">${ico(m[3], 24)}</span></div></div>`;
      box.innerHTML = `${head(m[1], true)}
        <div class="wco__body wtu__body wtu__gw">
          ${visual}
          <div class="wtu__gwamt"><b translate="no">${esc(money(p.amount))}</b><span>${esc(label)}</span></div>
          ${st.method === 'qr' ? `<p class="wtu__timer">${icon('clock', 13)}Code valid for <b id="tmr">5:00</b></p>` : ''}
          <dl class="wco__rows"><div><dt>Paying to</dt><dd>UT Log wallet</dd></div><div><dt>Method</dt><dd>${esc(m[1])}</dd></div><div><dt>Reference</dt><dd class="mono">${esc(p.id)}</dd></div></dl>
          <div class="wtu__sand"><b>${icon('info', 14)}Sandbox</b><span>Choose how this test payment ends. Nothing is charged.</span></div>
          <p class="form-error" id="err" role="alert"></p>
        </div>
        <div class="wco__foot wco__foot--row"><button class="btn btn-outline" id="fail" type="button">Simulate failure</button><button class="btn btn-primary" id="ok" type="button">${icon('check', 16)}Simulate success</button></div>`;
      let left = 300; const t = box.querySelector('#tmr');
      const timer = t ? setInterval(() => { if (!document.body.contains(t)) return clearInterval(timer); left = Math.max(0, left - 1); t.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; }, 1000) : null;
      box.querySelector('[data-back]').addEventListener('click', () => { if (timer) clearInterval(timer); form(); });
      const finish = async (result, btn) => {
        btn.disabled = true; st.busy = true;
        try {
          await api('/hub/payments/confirm', { method: 'POST', body: { id: p.id, result } });
          st.busy = false; if (timer) clearInterval(timer);
          if (result === 'success') success(p.amount, m[1], p.id); else failed();
        } catch (x) { st.busy = false; btn.disabled = false; box.querySelector('#err').textContent = x.message; }
      };
      box.querySelector('#ok').addEventListener('click', (e) => finish('success', e.currentTarget));
      box.querySelector('#fail').addEventListener('click', (e) => finish('failed', e.currentTarget));
    }

    // ---- 3. result ------------------------------------------------------------------------------
    async function success(amount, via, ref) {
      st.added = true;
      await refreshCounts().catch(() => {});
      refresh();
      const bal = balance();
      box.innerHTML = `${head('Money added')}
        <div class="wco__body wco__done wtu__ok">
          <div class="wco__tick"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="m15 27 7 7 15-16"/></svg></div>
          <b class="wco__dt"><span translate="no">${esc(money(amount))}</span> added</b>
          <p class="muted">via ${esc(via)}${ref ? ` · <span class="mono">${esc(ref)}</span>` : ''}</p>
          <div class="wtu__newbal"><small>New wallet balance</small><b translate="no">${bal != null ? esc(money(bal)) : '—'}</b></div>
        </div>
        <div class="wco__foot"><button class="btn btn-primary btn-block wco__go" id="done" type="button">${need ? 'Continue to payment' : 'Done'}</button></div>`;
      toast('Money added to your wallet');
      box.querySelector('#done').addEventListener('click', () => close(true));
      box.querySelector('#done').focus();
    }
    function failed() {
      box.innerHTML = `${head('Payment failed')}
        <div class="wco__body wco__done"><div class="wco__tick is-fail"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="m18 18 16 16M34 18 18 34"/></svg></div><b class="wco__dt">Payment failed</b><p class="muted">Nothing was charged. Try again, or pick another way to pay.</p></div>
        <div class="wco__foot wco__foot--row"><button class="btn btn-outline" data-x type="button">Close</button><button class="btn btn-primary" id="re" type="button">Try again</button></div>`;
      box.querySelector('#re').addEventListener('click', form);
    }

    // Start on the default saved method (UPI ID, card or bank), unless a caller asked for one.
    let def = null;
    api('/hub/checkout/methods').then((r) => { def = (r.instruments || []).find((i) => i.is_default && ['upi', 'card', 'netbanking'].includes(i.type)) || null; if (def && start === 'upi') st.method = def.type; }).catch(() => {}).finally(() => { if (!st.done) form(); });
  });
}
