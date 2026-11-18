// One checkout for every service, paid from the UT Log wallet.
// Review the amount (with fees, offers and the balance after) → top up if short → enter the
// 4-digit wallet PIN → paying → receipt. The service's own request runs only after the PIN.
import { api, esc, money, store, refreshCounts, toast } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';
import { addMoney, withFunds } from './ui.js';
import { METHOD, deviceOk, checkDevice } from './payauth.js';

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
    const state = { total: Number(amount), base: Number(amount), coupon: '', discount: 0, from: 'wallet' };
    let credit; // business credit line, for business bookings
    let last = null; // the service's response once paid, so leaving the page still reports it
    const close = (v = null) => { if (busy || done) return; done = true; wrap.remove(); document.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', onNav); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(last); };
    const onNav = () => close(last);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onNav);
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-x]')) close(last); });

    const headHtml = (step) => `<div class="wco__top"><div class="wco__steps" aria-hidden="true">${['Review', 'Approve', 'Done'].map((s, i) => `<i class="${i < step ? 'done' : i === step ? 'on' : ''}">${s}</i>`).join('')}</div>${step < 2 ? '<button class="icon-btn" data-x aria-label="Close">' + icon('x', 18) + '</button>' : ''}</div>`;
    const payee = `<div class="wco__payee">${info.img ? `<span class="wco__img"><img src="${esc(info.img)}" alt="" width="64" height="42"></span>` : tile(info.icon || 'wallet', info.tone || 'green').value}<div class="grow"><b>${esc(info.payee || info.title || 'Payment')}</b><small>${esc(info.sub || '')}</small>${(info.facts || []).length ? `<span class="wco__facts">${info.facts.map((x) => `<em>${esc(x)}</em>`).join('')}</span>` : ''}</div></div>`;
    // A route card for bookings: pickup and drop with who to meet, and when it arrives.
    const eta = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
    const routeHtml = () => (info.route ? `<div class="wco__route"><div class="wco__pt"><i class="wco__dot wco__dot--a"></i><div><small>Pickup</small><b>${esc(info.route.from)}</b>${info.route.fromWho ? `<em>${icon('user', 12)}${esc(info.route.fromWho)}</em>` : ''}</div></div><span class="wco__line" aria-hidden="true"></span><div class="wco__pt"><i class="wco__dot wco__dot--b"></i><div><small>Drop</small><b>${esc(info.route.to)}</b>${info.route.toWho ? `<em>${icon('user', 12)}${esc(info.route.toWho)}</em>` : ''}</div></div>${info.route.eta && eta(info.route.eta) ? `<p class="wco__eta">${icon('clock', 13)}Arrives by ${esc(eta(info.route.eta))}</p>` : ''}</div>` : '');
    let offers = null; // coupon codes you can still use, shown as one-tap chips
    const loadOffers = async () => { if (offers || !info.coupon) return; try { const r = await api('/hub/rewards'); offers = (r.coupons || []).filter((c) => !c.used && (!c.sections || !info.section || c.sections.includes(info.section))).slice(0, 4); } catch (e) { offers = []; } };

    // ---- 1. review ---------------------------------------------------------------------------
    async function review(note) {
      await Promise.all([refreshCounts().catch(() => {}), loadOffers(), info.credit && credit === undefined ? api('/hub/credit').then((c) => { credit = c; }).catch(() => { credit = null; }) : null]);
      const onCredit = state.from === 'credit' && credit && credit.active;
      const bal = balance();
      const fee = Number(info.fee || 0);
      const short = !onCredit && bal != null && bal < state.total ? Math.ceil(state.total - bal) : 0;
      const creditShort = onCredit && credit.available < state.total;
      const lines = [[info.baseLabel || 'Amount', state.base - fee], ...(fee ? [[info.feeLabel || 'Convenience fee', fee]] : [['Convenience fee', 0]]), ...(state.discount ? [[`Coupon ${state.coupon}`, -state.discount]] : [])];
      box.innerHTML = `${headHtml(0)}
        <div class="wco__body">${payee}
          <div class="wco__amt"><small>You pay</small><b translate="no">${esc(money(state.total))}</b>${info.cashback ? `<span class="wco__cb">${icon('sparkle', 14)}${esc(info.cashback)}</span>` : ''}</div>
          ${info.route ? routeHtml() : (info.rows || []).length ? `<dl class="wco__rows">${info.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
          <div class="wco__bill">${lines.map(([k, v]) => `<div><span>${esc(k)}</span><b translate="no" class="${v < 0 ? 'neg' : ''}">${v === 0 && k === 'Convenience fee' ? 'Free' : `${v < 0 ? '− ' : ''}${esc(money(Math.abs(v)))}`}</b></div>`).join('')}<div class="wco__total"><span>Total</span><b translate="no">${esc(money(state.total))}</b></div></div>
          ${info.coupon ? `<form class="wco__coupon" id="cpF"><span>${icon('tag', 16)}</span><input id="cp" placeholder="Coupon code" value="${esc(state.coupon)}" autocomplete="off" aria-label="Coupon code"><button class="btn btn-outline btn-sm" type="submit">${state.coupon ? 'Change' : 'Apply'}</button></form>${offers && offers.length && !state.coupon ? `<div class="wco__offers">${offers.map((c) => `<button type="button" class="wco__offer" data-cp="${esc(c.code)}" title="${esc(c.label || '')}">${icon('tag', 12)}<b translate="no">${esc(c.code)}</b>${c.label ? `<small>${esc(c.label)}</small>` : ''}</button>`).join('')}</div>` : ''}<p class="form-error" id="cpE"></p>` : ''}
          ${info.credit && credit && credit.business ? `<div class="wco__from" role="radiogroup" aria-label="Pay from"><button type="button" role="radio" data-from="wallet" aria-checked="${!onCredit}">${icon('wallet', 16)}<span><b>Wallet</b><small translate="no">${bal != null ? esc(money(bal)) : '—'}</small></span></button><button type="button" role="radio" data-from="credit" aria-checked="${onCredit}">${icon('card', 16)}<span><b>Business credit</b><small>${credit.active ? `<span translate="no">${esc(money(credit.available))}</span> available` : 'Not turned on'}</small></span></button></div>` : ''}
          ${onCredit ? `<div class="wco__wallet wco__credit ${creditShort ? 'is-short' : ''}">${icon('card', 20)}<div class="grow"><b>Business credit</b><small>Available <span translate="no">${esc(money(credit.available))}</span> · pay by ${esc(new Date(credit.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))}, no interest</small></div>${creditShort ? '<span class="wco__need">Not enough credit</span>' : `<span class="wco__ok">${icon('check', 15)}</span>`}</div>` : ''}
          <div class="wco__wallet ${short ? 'is-short' : ''}" ${onCredit ? 'hidden' : ''} style="--fill:${bal != null && state.total ? Math.min(100, Math.round((Math.max(0, bal) / state.total) * 100)) : 100}%">${icon('wallet', 20)}<div class="grow"><b>UT Log wallet</b><small>Balance <span translate="no">${bal != null ? esc(money(bal)) : '—'}</span>${!short && bal != null ? ` · after payment <span translate="no">${esc(money(bal - state.total))}</span>` : ''}</small></div>${short ? `<span class="wco__need">Short by <b translate="no">${esc(money(short))}</b></span>` : `<span class="wco__ok">${icon('check', 15)}</span>`}${short ? '<i class="wco__bar" aria-hidden="true"></i>' : ''}</div>
          ${note ? `<p class="form-error">${esc(note)}</p>` : ''}
        </div>
        <div class="wco__foot">${onCredit ? `<button class="btn btn-primary btn-block wco__go" id="next" type="button" ${creditShort ? 'disabled' : ''}>${icon('shield', 16)}Charge <span translate="no">${esc(money(state.total))}</span> to credit</button><p class="wco__fine">${icon('shield', 13)}Added to this month's statement. Nothing leaves your wallet.</p></div>` : `${short ? `<button class="btn btn-primary btn-block wco__go" id="topup" type="button">${icon('plus', 16)}Add <span translate="no">${esc(money(short))}</span> &amp; pay</button>` : `<button class="btn btn-primary btn-block wco__go" id="next" type="button">${icon('shield', 16)}Pay <span translate="no">${esc(money(state.total))}</span> securely</button>`}<p class="wco__fine">${icon('shield', 13)}Paid from your UT Log wallet. Nothing leaves it until you enter your PIN.</p></div>`}`;
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
      box.querySelectorAll('[data-from]').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.from === 'credit' && credit && !credit.active) { close(null); location.hash = '#/business/credit'; toast('Turn on business credit, then book again.'); return; }
        state.from = b.dataset.from; review();
      }));
    }

    // ---- 2. approve -------------------------------------------------------------------------
    // PIN, payment password, one-time code or this device's fingerprint / face, as chosen in
    // My profile → Security. Small payments under the person's limit go straight through.
    async function pinStep(force) {
      let auth;
      try { auth = await api('/hub/wallet/auth'); } catch (x) { return review(x.message); }
      if (auth.locked_until) return review(`Payment approval is locked until ${new Date(auth.locked_until).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`);
      if (!force && state.from !== 'credit' && auth.skip_under && state.total <= auth.skip_under) {
        try { const r = await api('/hub/wallet/approve', { method: 'POST', body: { method: 'skip', amount: state.total } }); state.approval = r.approval; toast(`Under your ₹${auth.skip_under} limit, so no approval needed`); return paying(); } catch (x) { /* falls through to a normal check */ }
      }
      const ready = { pin: true, password: auth.password_set, otp: !!auth.mobile, device: !!auth.device && deviceOk() };
      approve(force && ready[force] ? force : ready[auth.method] ? auth.method : 'pin', auth, ready);
    }
    // Resetting a forgotten PIN: prove it is you with a code to your registered mobile.
    function resetPin(auth, ready) {
      box.innerHTML = `${headHtml(1)}<div class="wco__body wco__pin"><span class="wco__lockico">${icon('chat', 26)}</span><h3>Reset your wallet PIN</h3><p class="muted">First, enter the code we send to ${esc(auth.mobile || 'your mobile')}.</p><p class="wco__sent" id="rsS">Sending…</p><form id="rsF" class="wco__pw"><input class="input wco__otp" id="rs" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" aria-label="6-digit code"><button class="btn btn-primary btn-block" type="submit">Continue</button></form><p class="form-error" id="pE"></p><button class="link wco__resend" type="button" id="rsBack">Back to PIN</button></div>`;
      const i = box.querySelector('#rs');
      api('/hub/wallet/otp', { method: 'POST' }).then((o) => { box.querySelector('#rsS').innerHTML = `Code sent to <b>${esc(o.sent_to)}</b>.${o.dev_otp ? ` <span class="wco__dev">Demo code ${esc(o.dev_otp)}</span>` : ''}`; i.focus(); }).catch((x) => { box.querySelector('#pE').textContent = x.message; });
      box.querySelector('#rsBack').addEventListener('click', () => approve('pin', auth, ready));
      box.querySelector('#rsF').addEventListener('submit', async (e) => { e.preventDefault(); try { const r = await api('/hub/wallet/reset/verify', { method: 'POST', body: { otp: i.value } }); approve('pin', { ...auth, pin_set: false, reset_token: r.reset_token }, ready); } catch (x) { box.querySelector('#pE').textContent = x.message; i.value = ''; } });
    }
    function approve(method, auth, ready) {
      const others = Object.keys(METHOD).filter((k) => k !== method && ready[k]);
      const verify = (body) => api('/hub/wallet/approve', { method: 'POST', body: { method, amount: state.total, credit: state.from === 'credit', ...body } }).then((r) => { state.approval = r.approval; return r; });
      const sub = `To pay <b translate="no">${esc(money(state.total))}</b> to ${esc(info.payee || 'this service')}`;
      const switcher = others.length ? `<div class="wco__alt"><span>Use another way</span>${others.map((k) => `<button type="button" class="wco__altb" data-alt="${k}">${icon(METHOD[k].ico, 14)}${METHOD[k].label}</button>`).join('')}</div>` : '';
      const shell = (body, title, ico) => { box.innerHTML = `${headHtml(1)}<div class="wco__body wco__pin"><span class="wco__lockico">${icon(ico, 26)}</span><h3>${title}</h3><p class="muted">${sub}</p>${body}<p class="form-error" id="pE"></p>${switcher}</div>`; box.querySelectorAll('[data-alt]').forEach((x) => x.addEventListener('click', () => approve(x.dataset.alt, auth, ready))); };
      const fail = (x) => { const e = box.querySelector('#pE'); if (e) e.textContent = x.message; return x; };

      if (method === 'password') {
        shell(`<form class="wco__pw" id="pwF"><div class="wco__pwin"><input class="input" type="password" id="pw" placeholder="Payment password" autocomplete="current-password" aria-label="Payment password"><button type="button" class="link" id="pwShow">Show</button></div><button class="btn btn-primary btn-block" type="submit">${icon('shield', 16)}Approve</button></form>`, 'Enter payment password', 'key');
        const f = box.querySelector('#pwF'); const i = box.querySelector('#pw'); setTimeout(() => i.focus(), 60);
        box.querySelector('#pwShow').addEventListener('click', (e) => { i.type = i.type === 'password' ? 'text' : 'password'; e.target.textContent = i.type === 'password' ? 'Show' : 'Hide'; });
        f.addEventListener('submit', async (e) => { e.preventDefault(); try { await verify({ password: i.value }); paying(); } catch (x) { fail(x); i.select(); } });
        return;
      }
      if (method === 'otp') {
        shell(`<p class="wco__sent" id="otS">Sending a code to ${esc(auth.mobile || 'your mobile')}…</p><form id="otF" class="wco__pw"><input class="input wco__otp" id="ot" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" aria-label="6-digit code"><button class="btn btn-primary btn-block" type="submit">${icon('shield', 16)}Approve</button></form><button class="link wco__resend" type="button" id="otR" disabled>Resend code</button>`, 'Enter the code', 'chat');
        const i = box.querySelector('#ot'); const r = box.querySelector('#otR'); let t;
        const send = async () => {
          r.disabled = true;
          try {
            const o = await api('/hub/wallet/otp', { method: 'POST' });
            box.querySelector('#otS').innerHTML = `Code sent to <b>${esc(o.sent_to)}</b>. It works for 5 minutes.${o.dev_otp ? ` <span class="wco__dev">Demo code ${esc(o.dev_otp)}</span>` : ''}`;
            let left = 30; clearInterval(t); t = setInterval(() => { if (!document.body.contains(r)) return clearInterval(t); left -= 1; r.textContent = left > 0 ? `Resend code in ${left}s` : 'Resend code'; if (left <= 0) { clearInterval(t); r.disabled = false; } }, 1000);
          } catch (x) { fail(x); r.disabled = false; }
          i.focus();
        };
        r.addEventListener('click', send); send();
        i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, ''); if (i.value.length === 6) box.querySelector('#otF').requestSubmit(); });
        box.querySelector('#otF').addEventListener('submit', async (e) => { e.preventDefault(); try { await verify({ otp: i.value }); clearInterval(t); paying(); } catch (x) { fail(x); i.value = ''; i.focus(); } });
        return;
      }
      if (method === 'device') {
        shell(`<button class="wco__bio" type="button" id="bio">${icon('fingerprint', 40)}<span>Touch to approve</span></button><small class="muted">Use your fingerprint, face or device screen lock.</small>`, 'Approve on this device', 'shield');
        const run = async () => {
          try { const ch = await api('/hub/wallet/device/challenge', { method: 'POST' }); const proof = await checkDevice(ch.challenge, ch.credential_id); await verify(proof); paying(); }
          catch (x) { fail(x.name === 'NotAllowedError' ? new Error('The check was cancelled. Try again, or use another way.') : x); }
        };
        box.querySelector('#bio').addEventListener('click', run);
        setTimeout(run, 250);
        return;
      }
      // PIN (also the first-time PIN setup).
      let mode = auth.pin_set ? 'enter' : 'create'; let first = ''; let pin = '';
      const title = () => ({ enter: 'Enter wallet PIN', create: 'Create a wallet PIN', confirm: 'Confirm your new PIN' }[mode]);
      shell(`<div class="pin-dots" id="dots" aria-live="polite">${'<i></i>'.repeat(4)}</div>
        <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('')}<button type="button" class="pin-pad__alt" id="back">${icon('chevron', 16).replace('class="li"', 'class="li flip"')}Back</button><button type="button" data-k="0">0</button><button type="button" class="pin-pad__alt" data-del aria-label="Delete">⌫</button></div>
        ${auth.pin_set ? '<button class="link wco__forgot" type="button" id="forgot">Forgot PIN?</button>' : ''}`, title(), 'grid');
      const h3 = box.querySelector('.wco__pin h3'); const dots = box.querySelector('#dots'); const err = box.querySelector('#pE');
      const paint = () => { h3.textContent = title(); dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < pin.length)); };
      const shake = (msg) => { err.textContent = msg; dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); pin = ''; paint(); };
      const submit = async () => {
        if (mode === 'create') { first = pin; pin = ''; mode = 'confirm'; err.textContent = ''; return paint(); }
        if (mode === 'confirm') {
          if (pin !== first) { mode = 'create'; first = ''; return shake('The PINs did not match. Start again.'); }
          try { await api('/hub/wallet/pin', { method: 'POST', body: { pin, reset: !!auth.reset_token, reset_token: auth.reset_token } }); toast('Wallet PIN set'); await verify({ pin }); return paying(); } catch (x) { mode = 'create'; return shake(x.message); }
        }
        try { await verify({ pin }); paying(); } catch (x) { shake(x.message); if (x.data && x.data.locked) box.querySelectorAll('.pin-pad button').forEach((b2) => { b2.disabled = true; }); }
      };
      const press = (k) => { if (busy) return; if (k === 'del') { pin = pin.slice(0, -1); return paint(); } if (pin.length >= 4) return; pin += k; paint(); if (pin.length === 4) setTimeout(submit, 140); };
      box.querySelector('.pin-pad').addEventListener('click', (e) => { const b2 = e.target.closest('button'); if (!b2) return; if (b2.id === 'back') return review(); press(b2.dataset.del != null ? 'del' : b2.dataset.k); });
      const fg = box.querySelector('#forgot');
      if (fg) fg.addEventListener('click', () => resetPin(auth, ready));
      const keys = (e) => { if (!document.body.contains(dots)) return document.removeEventListener('keydown', keys); if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
      document.addEventListener('keydown', keys);
      paint();
    }

    // ---- 3. paying ---
    // Approve-only: hand the approval back to the caller, which makes the payment itself.------------------------------------------------------------------------
    async function paying() {
      if (info.approveOnly) { last = { approval: state.approval, amount: state.total, pay_from: state.from }; return close(last); }
      busy = true;
      box.innerHTML = `${headHtml(1)}<div class="wco__body wco__wait"><div class="wco__ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/></svg>${tile(info.icon || 'wallet', info.tone || 'green').value}</div><b>Paying <span translate="no">${esc(money(state.total))}</span></b><p class="muted">to ${esc(info.payee || 'the service')}</p>
        <ol class="wco__track"><li class="on">Debiting your wallet</li><li>Confirming with ${esc(info.payee || 'the provider')}</li><li>Generating receipt</li></ol></div>`;
      const steps = box.querySelectorAll('.wco__track li');
      const tick = (i) => steps.forEach((s, n) => { s.classList.toggle('done', n < i); s.classList.toggle('on', n === i); });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      try {
        const [r] = await Promise.all([withFunds(() => run({ ...(state.coupon ? { coupon: state.coupon } : {}), ...(state.from === 'credit' ? { pay_from: 'credit' } : {}), approval: state.approval })), wait(900)]);
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
      const opRef = r.operator_ref || r.bbps_ref || r.pnr || null;
      const when = now();
      const paidFrom = state.from === 'credit' ? 'Business credit' : 'UT Log wallet';
      const facts = [[r.id && info.refLabel === 'Booking reference' ? 'Order ID' : 'Transaction ID', txn, true], ...(opRef ? [[info.refLabel || (r.bbps_ref ? 'BBPS reference' : 'Operator reference'), opRef, true]] : []), ['Paid on', when], ['Paid from', paidFrom]];
      const more = [...(r.wallet_balance != null && state.from !== 'credit' ? [['Wallet balance', money(r.wallet_balance)]] : []), ...(info.rows || []).filter(([k]) => !(info.route && ['Pickup', 'Drop'].includes(k)))];
      const rows = [...facts.map(([k, v]) => [k, v]), ...more];
      const amt = r.amount != null ? r.amount : state.total;
      box.innerHTML = `<div class="wco__body wco__success">
          <div class="wco__okhead"><div class="wco__tick ${info.pending ? 'is-pending' : ''}"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="m15 27 7 7 15-16"/></svg></div>
            <b class="wco__okamt" translate="no">${esc(money(amt))}</b>
            <span class="wco__okto">${info.pending ? 'Payment received for' : 'Paid to'} <b>${esc(info.payee || 'the service')}</b></span>
            <span class="wco__status ${info.pending ? 'pending' : 'ok'}" id="stP">${info.pending ? `${icon('clock', 13)}Pending confirmation` : `${icon('check', 13)}Successful`}</span>
            <button class="icon-btn wco__okx" type="button" data-x aria-label="Close">${icon('x', 18)}</button></div>
          ${r.cashback ? `<p class="wco__cbdone">${icon('sparkle', 16)}<span><b translate="no">${esc(money(r.cashback))}</b> cashback added to your wallet</span></p>` : ''}
          ${r.code ? `<p class="wco__code">Your code <b class="mono">${esc(r.code)}</b></p>` : ''}
          ${info.route ? `<div class="wco__okroute"><span><i class="wco__dot wco__dot--a"></i>${esc(info.route.from)}</span><span><i class="wco__dot wco__dot--b"></i>${esc(info.route.to)}</span></div>` : ''}
          <dl class="wco__facts">${facts.map(([k, v, copy]) => `<div><dt>${esc(k)}</dt><dd class="${copy ? 'mono' : ''}">${esc(v)}${copy ? `<button type="button" class="wco__copy" data-copy="${esc(v)}" aria-label="Copy ${esc(k)}">${icon('copy', 13)}</button>` : ''}</dd></div>`).join('')}</dl>
          ${more.length ? `<details class="wco__more"><summary>More details${icon('chevron', 14)}</summary><dl class="wco__rows">${more.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></details>` : ''}
        </div>
        <div class="wco__foot wco__okfoot"><div class="wco__okbtns"><button class="btn btn-outline" id="rcpt" type="button">${icon('download', 16)}Receipt</button>${r.id ? `<a class="btn btn-outline" href="#/my/orders/${esc(r.id)}" id="wcoView">${icon('box2', 16)}View order</a>` : ''}</div><button class="btn btn-primary btn-block" id="ok" type="button">Done</button></div>`;
      if (info.pending) setTimeout(() => { if (done) return; const p = box.querySelector('#stP'); if (!p) return; p.className = 'wco__status ok'; p.innerHTML = `${icon('check', 13)}Successful`; }, 2400);
      box.querySelectorAll('[data-copy]').forEach((c) => c.addEventListener('click', async () => { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Copied'); } catch (e) { toast(c.dataset.copy); } }));
      box.querySelector('#ok').addEventListener('click', () => close(r));
      const v = box.querySelector('#wcoView'); if (v) v.addEventListener('click', () => close(r));
      box.querySelector('#rcpt').addEventListener('click', () => printReceipt({ amount: amt, rows: [['Paid to', info.payee || ''], ...rows], info }));
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

// Approve a payment that another page makes itself (withdrawals, price locks, bulk bookings,
// paying everything due, shipping website orders). Resolves to the API's answer, or null.
export async function payWithApproval({ path, body = {}, total, info = {} }) {
  const ok = await walletCheckout({ amount: total, info: { ...info, approveOnly: true }, run: async () => ({ amount: total }) });
  if (!ok || !ok.approval) return null;
  return withFunds(() => api(path, { method: 'POST', body: { ...body, approval: ok.approval, ...(ok.pay_from === 'credit' ? { pay_from: 'credit' } : {}) } }));
}
