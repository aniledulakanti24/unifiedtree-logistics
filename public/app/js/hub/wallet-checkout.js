// One checkout for every service, paid from the UT Log wallet.
// Review the amount (with fees, offers and the balance after) → top up if short → enter the
// 4-digit wallet PIN → paying → receipt. The service's own request runs only after the PIN.
import { api, esc, money, store, refreshCounts, toast } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';
import { addMoney, withFunds } from './ui.js';

const balance = () => { const c = store.state.counts; return c && c.wallet_balance != null ? Number(c.wallet_balance) : null; };

// Shown on each service page where a list of payment methods used to be.
export const walletStrip = () => {
  const b = balance();
  return `<div class="wstrip">${icon('wallet', 18)}<span class="grow"><b>Pay from UT Log wallet</b><small>${b != null ? `Balance <span translate="no">${esc(money(b))}</span> · ` : ''}confirmed with your wallet PIN</small></span><span class="wstrip__lock">${icon('shield', 15)}Secure</span></div>`;
};

const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const ref = (p) => `${p}${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 900 + 100)}`;

/**
 * info: { title, payee, sub, icon, tone, rows: [[label, value]], fee, feeLabel, coupon: bool,
 *         cashback: 'text', pending: bool, refLabel }
 * run(extra): performs the request; called with { dry_run: true, coupon } to price, and { coupon } to pay.
 * Resolves to the service's response, or null if the person backs out.
 */
export function walletCheckout({ amount, info = {}, run }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modalRoot');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop wco-wrap';
    wrap.innerHTML = '<div class="modal wco" role="dialog" aria-modal="true" aria-label="Checkout"><div class="wco__in"></div></div>';
    root.appendChild(wrap);
    const box = wrap.querySelector('.wco__in');
    let busy = false; let done = false;
    const state = { total: Number(amount), base: Number(amount), coupon: '', discount: 0 };
    let last = null; // the service's response once paid, so leaving the page still reports it
    const close = (v = null) => { if (busy || done) return; done = true; wrap.remove(); document.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', onNav); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(last); };
    const onNav = () => close(last);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onNav);
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-x]')) close(last); });

    const headHtml = (step) => `<div class="wco__top"><div class="wco__steps" aria-hidden="true">${['Review', 'PIN', 'Done'].map((s, i) => `<i class="${i < step ? 'done' : i === step ? 'on' : ''}">${s}</i>`).join('')}</div>${step < 2 ? '<button class="icon-btn" data-x aria-label="Close">' + icon('x', 18) + '</button>' : ''}</div>`;
    const payee = `<div class="wco__payee">${info.img ? `<span class="wco__img"><img src="${esc(info.img)}" alt="" width="64" height="42"></span>` : tile(info.icon || 'wallet', info.tone || 'green').value}<div class="grow"><b>${esc(info.payee || info.title || 'Payment')}</b><small>${esc(info.sub || '')}</small>${(info.facts || []).length ? `<span class="wco__facts">${info.facts.map((x) => `<em>${esc(x)}</em>`).join('')}</span>` : ''}</div></div>`;
    // A route card for bookings: pickup and drop with who to meet, and when it arrives.
    const eta = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
    const routeHtml = () => (info.route ? `<div class="wco__route"><div class="wco__pt"><i class="wco__dot wco__dot--a"></i><div><small>Pickup</small><b>${esc(info.route.from)}</b>${info.route.fromWho ? `<em>${icon('user', 12)}${esc(info.route.fromWho)}</em>` : ''}</div></div><span class="wco__line" aria-hidden="true"></span><div class="wco__pt"><i class="wco__dot wco__dot--b"></i><div><small>Drop</small><b>${esc(info.route.to)}</b>${info.route.toWho ? `<em>${icon('user', 12)}${esc(info.route.toWho)}</em>` : ''}</div></div>${info.route.eta && eta(info.route.eta) ? `<p class="wco__eta">${icon('clock', 13)}Arrives by ${esc(eta(info.route.eta))}</p>` : ''}</div>` : '');
    let offers = null; // coupon codes you can still use, shown as one-tap chips
    const loadOffers = async () => { if (offers || !info.coupon) return; try { const r = await api('/hub/rewards'); offers = (r.coupons || []).filter((c) => !c.used && (!c.sections || !info.section || c.sections.includes(info.section))).slice(0, 4); } catch (e) { offers = []; } };

    // ---- 1. review ---------------------------------------------------------------------------
    async function review(note) {
      await Promise.all([refreshCounts().catch(() => {}), loadOffers()]);
      const bal = balance();
      const fee = Number(info.fee || 0);
      const short = bal != null && bal < state.total ? Math.ceil(state.total - bal) : 0;
      const lines = [[info.baseLabel || 'Amount', state.base - fee], ...(fee ? [[info.feeLabel || 'Convenience fee', fee]] : [['Convenience fee', 0]]), ...(state.discount ? [[`Coupon ${state.coupon}`, -state.discount]] : [])];
      box.innerHTML = `${headHtml(0)}
        <div class="wco__body">${payee}
          <div class="wco__amt"><small>You pay</small><b translate="no">${esc(money(state.total))}</b>${info.cashback ? `<span class="wco__cb">${icon('sparkle', 14)}${esc(info.cashback)}</span>` : ''}</div>
          ${info.route ? routeHtml() : (info.rows || []).length ? `<dl class="wco__rows">${info.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
          <div class="wco__bill">${lines.map(([k, v]) => `<div><span>${esc(k)}</span><b translate="no" class="${v < 0 ? 'neg' : ''}">${v === 0 && k === 'Convenience fee' ? 'Free' : `${v < 0 ? '− ' : ''}${esc(money(Math.abs(v)))}`}</b></div>`).join('')}<div class="wco__total"><span>Total</span><b translate="no">${esc(money(state.total))}</b></div></div>
          ${info.coupon ? `<form class="wco__coupon" id="cpF"><span>${icon('tag', 16)}</span><input id="cp" placeholder="Coupon code" value="${esc(state.coupon)}" autocomplete="off" aria-label="Coupon code"><button class="btn btn-outline btn-sm" type="submit">${state.coupon ? 'Change' : 'Apply'}</button></form>${offers && offers.length && !state.coupon ? `<div class="wco__offers">${offers.map((c) => `<button type="button" class="wco__offer" data-cp="${esc(c.code)}" title="${esc(c.label || '')}">${icon('tag', 12)}<b translate="no">${esc(c.code)}</b>${c.label ? `<small>${esc(c.label)}</small>` : ''}</button>`).join('')}</div>` : ''}<p class="form-error" id="cpE"></p>` : ''}
          <div class="wco__wallet ${short ? 'is-short' : ''}" style="--fill:${bal != null && state.total ? Math.min(100, Math.round((Math.max(0, bal) / state.total) * 100)) : 100}%">${icon('wallet', 20)}<div class="grow"><b>UT Log wallet</b><small>Balance <span translate="no">${bal != null ? esc(money(bal)) : '—'}</span>${!short && bal != null ? ` · after payment <span translate="no">${esc(money(bal - state.total))}</span>` : ''}</small></div>${short ? `<span class="wco__need">Short by <b translate="no">${esc(money(short))}</b></span>` : `<span class="wco__ok">${icon('check', 15)}</span>`}${short ? '<i class="wco__bar" aria-hidden="true"></i>' : ''}</div>
          ${note ? `<p class="form-error">${esc(note)}</p>` : ''}
        </div>
        <div class="wco__foot">${short ? `<button class="btn btn-primary btn-block wco__go" id="topup" type="button">${icon('plus', 16)}Add <span translate="no">${esc(money(short))}</span> &amp; pay</button>` : `<button class="btn btn-primary btn-block wco__go" id="next" type="button">${icon('shield', 16)}Pay <span translate="no">${esc(money(state.total))}</span> securely</button>`}<p class="wco__fine">${icon('shield', 13)}Paid from your UT Log wallet. Nothing leaves it until you enter your PIN.</p></div>`;
      const cp = box.querySelector('#cpF');
      if (cp) cp.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = box.querySelector('#cp').value.trim().toUpperCase();
        try {
          const r = await run({ dry_run: true, coupon: code || undefined });
          state.discount = Math.max(0, state.base - r.amount); state.total = r.amount; state.coupon = code;
          if (code) toast(state.discount ? `Coupon applied · you save ${money(state.discount)}` : 'Coupon applied');
          review();
        } catch (x) { box.querySelector('#cpE').textContent = x.message; }
      });
      box.querySelectorAll('[data-cp]').forEach((b) => b.addEventListener('click', () => { box.querySelector('#cp').value = b.dataset.cp; box.querySelector('#cpF').requestSubmit(); }));
      const t = box.querySelector('#topup');
      // The top-up opens as its own window; the checkout steps aside until it is done.
      if (t) t.addEventListener('click', async () => {
        wrap.hidden = true; document.removeEventListener('keydown', onKey);
        const ok = await addMoney(short, `Add ${money(short)} to finish this payment.`);
        wrap.hidden = false; document.addEventListener('keydown', onKey);
        if (ok) { await refreshCounts().catch(() => {}); review(); }
      });
      const n = box.querySelector('#next');
      if (n) n.addEventListener('click', () => pinStep());
    }

    // ---- 2. PIN ------------------------------------------------------------------------------
    async function pinStep() {
      let st;
      try { st = await api('/hub/wallet/pin'); } catch (x) { return review(x.message); }
      if (st.locked_until) return review(`Your wallet PIN is locked until ${new Date(st.locked_until).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`);
      let mode = st.set ? 'enter' : 'create'; let first = ''; let pin = '';
      const title = () => ({ enter: 'Enter wallet PIN', create: 'Create a wallet PIN', confirm: 'Confirm your new PIN' }[mode]);
      const subtitle = () => ({ enter: `To pay ${money(state.total)} to ${info.payee || 'this service'}`, create: 'You will use these 4 digits to approve every wallet payment.', confirm: 'Enter the same 4 digits again.' }[mode]);
      box.innerHTML = `${headHtml(1)}<div class="wco__body wco__pin"><span class="wco__lockico">${icon('shield', 26)}</span><h3 id="pT"></h3><p class="muted" id="pS"></p>
        <div class="pin-dots" id="dots" aria-live="polite">${'<i></i>'.repeat(4)}</div><p class="form-error" id="pE"></p>
        <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('')}<button type="button" class="pin-pad__alt" id="back">${icon('chevron', 16).replace('class="li"', 'class="li flip"')}Back</button><button type="button" data-k="0">0</button><button type="button" class="pin-pad__alt" data-del aria-label="Delete">⌫</button></div>
        ${st.set ? '<button class="link wco__forgot" type="button" id="forgot">Forgot PIN?</button>' : ''}</div>`;
      const dots = box.querySelector('#dots'); const err = box.querySelector('#pE');
      const paint = () => { box.querySelector('#pT').textContent = title(); box.querySelector('#pS').textContent = subtitle(); dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < pin.length)); };
      const shake = (msg) => { err.textContent = msg; dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); pin = ''; paint(); };
      const submit = async () => {
        if (mode === 'create') { first = pin; pin = ''; mode = 'confirm'; err.textContent = ''; return paint(); }
        if (mode === 'confirm') {
          if (pin !== first) { mode = 'create'; first = ''; return shake('The PINs did not match. Start again.'); }
          try { await api('/hub/wallet/pin', { method: 'POST', body: { pin, reset: !!st.set } }); toast('Wallet PIN set'); return paying(); } catch (x) { mode = 'create'; return shake(x.message); }
        }
        try { await api('/hub/wallet/pin/verify', { method: 'POST', body: { pin } }); paying(); } catch (x) { shake(x.message); if (x.data && x.data.locked) box.querySelectorAll('.pin-pad button').forEach((b) => { b.disabled = true; }); }
      };
      const press = (k) => { if (busy) return; if (k === 'del') { pin = pin.slice(0, -1); return paint(); } if (pin.length >= 4) return; pin += k; paint(); if (pin.length === 4) setTimeout(submit, 140); };
      box.querySelector('.pin-pad').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.id === 'back') return review(); press(b.dataset.del != null ? 'del' : b.dataset.k); });
      const f = box.querySelector('#forgot');
      if (f) f.addEventListener('click', () => { mode = 'create'; first = ''; pin = ''; err.textContent = ''; f.remove(); toast('Demo: in the live app a one-time code is sent to your mobile before you reset the PIN.'); paint(); });
      const keys = (e) => { if (!document.body.contains(dots)) return document.removeEventListener('keydown', keys); if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
      document.addEventListener('keydown', keys);
      paint();
    }

    // ---- 3. paying ---------------------------------------------------------------------------
    async function paying() {
      busy = true;
      box.innerHTML = `${headHtml(1)}<div class="wco__body wco__wait"><div class="wco__ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/></svg>${tile(info.icon || 'wallet', info.tone || 'green').value}</div><b>Paying <span translate="no">${esc(money(state.total))}</span></b><p class="muted">to ${esc(info.payee || 'the service')}</p>
        <ol class="wco__track"><li class="on">Debiting your wallet</li><li>Confirming with ${esc(info.payee || 'the provider')}</li><li>Generating receipt</li></ol></div>`;
      const steps = box.querySelectorAll('.wco__track li');
      const tick = (i) => steps.forEach((s, n) => { s.classList.toggle('done', n < i); s.classList.toggle('on', n === i); });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      try {
        const [r] = await Promise.all([withFunds(() => run(state.coupon ? { coupon: state.coupon } : {})), wait(900)]);
        tick(1); await wait(700); tick(2); await wait(500);
        busy = false;
        refreshCounts().catch(() => {});
        receipt(r);
      } catch (x) {
        busy = false;
        if (x.quiet) return review();
        failed(x.message);
      }
    }

    // ---- 4. receipt --------------------------------------------------------------------------
    function receipt(r) {
      last = r;
      const txn = r.id || ref('UT');
      const opRef = r.operator_ref || r.bbps_ref || r.pnr || ref(info.refPrefix || 'REF');
      const when = now();
      const rows = [['Transaction ID', txn], [info.refLabel || (r.bbps_ref ? 'BBPS reference' : 'Operator reference'), opRef], ['Date & time', when], ['Paid from', 'UT Log wallet'], ...(r.wallet_balance != null ? [['Wallet balance', money(r.wallet_balance)]] : []), ...(info.rows || [])];
      box.innerHTML = `${headHtml(2)}<div class="wco__body wco__done">
          <div class="wco__tick ${info.pending ? 'is-pending' : ''}"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="m15 27 7 7 15-16"/></svg></div>
          <b class="wco__dt" id="stT">${info.pending ? 'Payment received' : 'Payment successful'}</b>
          <div class="wco__amt wco__amt--sm"><b translate="no">${esc(money(r.amount != null ? r.amount : state.total))}</b><small>paid to ${esc(info.payee || 'the service')}</small></div>
          <span class="wco__status ${info.pending ? 'pending' : 'ok'}" id="stP">${info.pending ? `${icon('clock', 13)}Pending confirmation from ${esc(info.payee || 'the provider')}` : `${icon('check', 13)}Successful`}</span>
          ${r.cashback ? `<p class="wco__cbdone">${icon('sparkle', 16)}<span><b translate="no">${esc(money(r.cashback))}</b> cashback added to your wallet</span></p>` : ''}
          ${r.code ? `<p class="wco__code">Your code <b class="mono">${esc(r.code)}</b></p>` : ''}
          <dl class="wco__rows">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="${/^Transaction ID$|reference|PNR|UTR/.test(k) ? 'mono' : ''}">${esc(v)}</dd></div>`).join('')}</dl></div>
        <div class="wco__foot wco__foot--row"><button class="btn btn-outline" id="rcpt" type="button">${icon('download', 16)}Receipt</button>${r.id ? `<a class="btn btn-outline" href="#/my/orders/${esc(r.id)}" id="view">View order</a>` : ''}<button class="btn btn-primary" id="ok" type="button">Done</button></div>`;
      if (info.pending) setTimeout(() => { if (done) return; const p = box.querySelector('#stP'); if (!p) return; p.className = 'wco__status ok'; p.innerHTML = `${icon('check', 13)}Successful`; box.querySelector('#stT').textContent = 'Payment successful'; box.querySelector('.wco__tick').classList.remove('is-pending'); }, 2600);
      box.querySelector('#ok').addEventListener('click', () => close(r));
      const v = box.querySelector('#view'); if (v) v.addEventListener('click', () => close(r));
      box.querySelector('#rcpt').addEventListener('click', () => printReceipt({ amount: r.amount != null ? r.amount : state.total, rows, info }));
    }

    function failed(message) {
      box.innerHTML = `${headHtml(1)}<div class="wco__body wco__done"><div class="wco__tick is-fail"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="m18 18 16 16M34 18 18 34"/></svg></div><b class="wco__dt">Payment failed</b><p class="muted">${esc(message)}</p><p class="wco__fine">No money left your wallet. If anything was held, it returns within a minute.</p></div>
        <div class="wco__foot wco__foot--row"><button class="btn btn-outline" id="cl" type="button">Close</button><button class="btn btn-primary" id="re" type="button">Try again</button></div>`;
      box.querySelector('#cl').addEventListener('click', () => close(null));
      box.querySelector('#re').addEventListener('click', () => review());
    }

    review();
  });
}

function printReceipt({ amount, rows, info }) {
  const w = window.open('', '_blank', 'width=480,height=720');
  if (!w) { toast('Allow pop-ups to download the receipt.', true); return; }
  const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  w.document.write(`<!doctype html><meta charset="utf-8"><title>UT Log receipt</title><style>body{font:14px Inter,system-ui,sans-serif;color:#11201c;margin:0;padding:28px;background:#f4f6f5}.r{max-width:380px;margin:auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.08)}h1{font-size:15px;margin:0 0 2px;color:#0e7c66}small{color:#66756f}.a{font-size:30px;font-weight:700;margin:16px 0 2px}.ok{display:inline-block;margin:6px 0 14px;padding:3px 10px;border-radius:99px;background:#e3f5ee;color:#0b7a62;font-weight:600;font-size:12px}dl{margin:0;border-top:1px dashed #d6dfdc}dl div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed #e4eae8}dt{color:#66756f}dd{margin:0;text-align:right;font-weight:600}p{color:#66756f;font-size:12px;margin-top:16px}</style>
    <div class="r"><h1>UT Log · Payment receipt</h1><small>${e(info.payee || info.title || '')}${info.sub ? ` · ${e(info.sub)}` : ''}</small><div class="a">₹${Number(amount).toLocaleString('en-IN')}</div><span class="ok">Successful</span><dl>${rows.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl><p>Demo receipt. Paid from the UT Log wallet; keep the transaction ID for any query.</p></div><script>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}
