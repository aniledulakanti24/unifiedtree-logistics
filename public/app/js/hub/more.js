// Moving house, route outlook (price forecast + disruptions), merge trips, trip folders, bulk gifting
// and the family wallet.
import { api, esc, money, store, toast, modal, withBusy, dateTime, date } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';
import { downloadCsv, refresh } from './ui.js';
import { walletCheckout, payWithApproval } from './wallet-checkout.js';

const head = (ic, tone, title, intro, right = '') => `<div class="page-head ph-hero"><div class="row head-t">${tile(ic, tone).value}<div><h1>${esc(title)}</h1><p>${esc(intro)}</p></div></div><div class="row">${right}</div></div>`;
const KIND = { electricity: ['Electricity', 'electric'], gas: ['Piped gas', 'flame'], broadband: ['Broadband', 'wifi'], water: ['Water', 'drop'], landline: ['Landline', 'phone'], lpg: ['Cooking gas', 'flame'], dth: ['DTH', 'tv'] };

// ---- B + H. route outlook: price forecast and disruptions ------------------------------------------
export async function outlookCard(el, { section, from, to, date: when }) {
  if (!el || !from || !to) return;
  let d; try { d = await api('/hub/outlook', { query: { section, from, to, date: when } }); } catch (e) { el.remove(); return; }
  const v = d.price.advice.verdict; const mx = Math.max(...d.price.days.map((x) => x.index)); const mn = Math.min(...d.price.days.map((x) => x.index));
  // Nothing to act on: one quiet line instead of a chart.
  if (v === 'steady' && !d.disruptions.length) { el.innerHTML = `<p class="ol-line">${icon('check', 14)}Prices on this route are steady for 2 weeks, and nothing is disrupting it.</p>`; return; }
  el.innerHTML = `<div class="ol ${d.disruptions.length ? 'ol--warn' : 'ol--solo'}">
    <div class="ol-price"><div class="ol-h"><span class="ol-tag ol-tag--${v}">${v === 'now' ? `${icon('alert', 13)}Book now` : v === 'wait' ? `${icon('clock', 13)}Can wait` : `${icon('check', 13)}Steady`}</span><b>Price outlook · next 14 days</b>${d.disruptions.length ? '' : `<span class="ol-ok">${icon('shield', 12)}No disruptions</span>`}</div>
      <div class="ol-bars" role="img" aria-label="Price trend for 14 days">${d.price.days.map((x, i) => `<i class="${i === 0 ? 'today' : ''} ${x.festival ? 'fest' : ''}" style="--h:${Math.round(18 + ((x.index - mn) / Math.max(1, mx - mn)) * 82)}%" title="${esc(new Date(x.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))} · ${x.index}${x.festival ? ` · ${esc(x.festival)} rush` : ''}"></i>`).join('')}</div>
      <p>${esc(d.price.advice.text)}</p><small>${esc(d.price.based_on)}</small></div>
    ${d.disruptions.length ? `<div class="ol-dis">${d.disruptions.map((x) => `<div class="ol-ev">${icon(x.kind === 'rain' || x.kind === 'fog' ? 'drop' : x.kind === 'strike' ? 'alert' : x.kind === 'festival' ? 'sparkle' : 'map', 16)}<div><b>${esc(x.title)} · up to ${x.delay_hours} h late</b><small>${esc(x.detail)}</small><small class="ol-better">${icon('check', 12)}${esc(x.better)}</small></div></div>`).join('')}</div>` : ''}
  </div>`;
}

// ---- C. merge trips banner (All orders) ------------------------------------------------------------
export async function mergeBanner(el, again) {
  if (!el) return;
  let d; try { d = await api('/hub/merge'); } catch (e) { return; }
  if (!d.data.length) { el.innerHTML = ''; return; }
  el.innerHTML = d.data.map((g, i) => `<section class="card mg"><span class="mg-ico">${icon('route', 20)}</span><div class="grow"><b>Merge ${g.trips.length} trips from ${esc(g.from)} into one and save <span translate="no">${esc(money(g.saving))}</span></b><small>${esc(g.drops.join(' → '))} · one ${esc(g.vehicle)} by ${esc(g.partner)} for <span translate="no">${esc(money(g.merged))}</span> instead of <span translate="no">${esc(money(g.was))}</span>. Nothing has been picked up yet.</small></div><button class="btn btn-primary btn-sm" type="button" data-merge="${i}">Merge and save</button></section>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('[data-merge]'); if (!b) return;
    withBusy(b, async () => { try { const r = await api('/hub/merge', { method: 'POST', body: { ids: d.data[Number(b.dataset.merge)].ids } }); toast(`Merged · ${money(r.saving)} back in your wallet`); refresh(); again(); } catch (x) { toast(x.message, true); } });
  };
}

// ---- A. moving house -----------------------------------------------------------------------------
export async function renderMoving(view) {
  const cities = ['Bengaluru', 'Chennai', 'Hyderabad', 'Mumbai', 'Pune', 'Delhi', 'Jaipur', 'Goa', 'Kochi', 'Mysuru', 'Vijayawada', 'Ahmedabad'];
  const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  view.innerHTML = `${head('home', 'violet', 'Moving house', 'One plan for the whole move: packers, a truck, your bills and deliveries, and your new address.')}
    <section class="card mv-form"><form class="form-grid" id="mvF" novalidate>
      <label class="field">Moving from<select class="select" name="from_city">${cities.map((c) => `<option>${c}</option>`).join('')}</select></label>
      <label class="field">Moving to<select class="select" name="to_city">${cities.map((c, i) => `<option ${i === 2 ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field">Moving date<input class="input" type="date" name="date" value="${soon}" min="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="field">Home size<select class="select" name="size"><option value="1rk">1 RK</option><option value="1bhk">1 BHK</option><option value="2bhk" selected>2 BHK</option><option value="3bhk">3 BHK</option><option value="office">Small office</option></select></label>
      <label class="field full"><span class="req">New address</span><input class="input" name="new_address" placeholder="Flat, building, street, area"></label>
      <label class="field"><span class="req">New pin code</span><input class="input" name="new_pincode" inputmode="numeric" maxlength="6"></label>
    </form><p class="form-error" id="mvE"></p><button class="btn btn-primary" id="mvGo" type="button">${icon('sparkle', 16)}Make my moving plan</button></section><div id="mvOut"></div>`;
  const f = view.querySelector('#mvF'); const out = view.querySelector('#mvOut');
  view.querySelector('#mvGo').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    view.querySelector('#mvE').textContent = '';
    const d = Object.fromEntries(new FormData(f).entries());
    let plan; let movers;
    try { [plan, movers] = await Promise.all([api('/hub/moving/plan', { method: 'POST', body: { ...d, date: new Date(d.date + 'T09:00:00').toISOString() } }), api('/hub/search', { method: 'POST', body: { kind: 'movers', from: d.from_city, to: d.to_city, date: d.date, size: d.size } })]); }
    catch (x) { view.querySelector('#mvE').textContent = x.message; return; }
    const step = (n, title, sub, body) => `<section class="card mv-step"><div class="mv-step__h"><b class="mv-n">${n}</b><div><h2>${title}</h2><small>${sub}</small></div></div>${body}</section>`;
    out.innerHTML = `${step(1, 'Packers and truck', `${esc(d.from_city)} → ${esc(d.to_city)} on ${esc(date(plan.date))}`, `<ul class="mv-movers">${movers.options.slice(0, 4).map((o, i) => `<li>${tile('truck', 'blue').value}<div class="grow"><b>${esc(o.provider)}</b><small>${esc(o.meta.join(' · '))}</small></div><b translate="no">${esc(money(o.price))}</b><button class="btn ${i ? 'btn-outline' : 'btn-primary'} btn-sm" type="button" data-mover="${o.id}">Book</button></li>`).join('')}</ul>`)}
      ${step(2, 'Shift your bills', plan.bills.length ? 'We send each provider a transfer request for the moving date.' : 'No utility bills paid through UT Log yet.', plan.bills.length ? `<ul class="mv-list">${plan.bills.map((b) => `<li><label><input type="checkbox" class="check" data-bill="${b.id}" checked>${tile((KIND[b.kind] || [, 'bill'])[1], 'amber').value}<span><b>${esc((KIND[b.kind] || [b.kind])[0])} · ${esc(b.provider)}</b><small>Account ${esc(b.account)} · ${esc(b.from)}</small></span></label></li>`).join('')}</ul>` : '')}
      ${step(3, 'Deliveries on the way', plan.deliveries.length ? 'Not picked up yet, so they can come to your new home for free.' : 'Nothing on the way right now.', plan.deliveries.length ? `<ul class="mv-list">${plan.deliveries.map((x) => `<li><label><input type="checkbox" class="check" data-dl="${x.id}">${tile('parcel', 'green').value}<span><b>${esc(x.title)}</b><small>${esc(x.provider)} · now to ${esc(x.drop || '')}</small></span></label></li>`).join('')}</ul>` : '')}
      ${step(4, 'Your new address', 'Saved as your default pickup and drop address.', `<label class="mv-addr"><input type="checkbox" class="check" id="mvAddr" checked><span><b>${esc(plan.new_address)}</b><small>${esc(plan.new_city)} ${esc(plan.new_pincode)}</small></span></label>`)}
      <div class="mv-go"><button class="btn btn-primary" id="mvApply" type="button">${icon('check', 16)}Do steps 2 to 4 now</button><small class="muted">Free. Movers are booked and paid separately above.</small></div>`;
    out.scrollIntoView({ block: 'start', behavior: 'smooth' });
    out.onclick = async (ev) => {
      const mb = ev.target.closest('[data-mover]');
      if (mb) {
        const o = movers.options.find((x) => x.id === mb.dataset.mover); const p = store.state.profile || {};
        const run = (x) => api('/hub/search/book', { method: 'POST', body: { ...x, offer_id: o.id, name: p.name || 'Customer', phone: p.mobile, pay_mode: 'prepaid' } });
        const r = await walletCheckout({ amount: o.price, run, info: { title: o.record_title, payee: o.provider, sub: o.record_sub, icon: 'truck', tone: 'blue', baseLabel: 'Move', refLabel: 'Booking reference' } });
        if (r) { mb.textContent = 'Booked'; mb.disabled = true; refresh(); }
        return;
      }
      const ap = ev.target.closest('#mvApply'); if (!ap) return;
      withBusy(ap, async () => {
        try {
          const r = await api('/hub/moving/apply', { method: 'POST', body: { plan_id: plan.id, bills: [...out.querySelectorAll('[data-bill]:checked')].map((x) => x.dataset.bill), deliveries: [...out.querySelectorAll('[data-dl]:checked')].map((x) => x.dataset.dl), address: out.querySelector('#mvAddr').checked } });
          ap.closest('.mv-go').innerHTML = `<div class="mv-done">${icon('check', 18)}<div><b>Your move is set</b><small>${r.applied.bills.length} bill transfer${r.applied.bills.length === 1 ? '' : 's'} requested · ${r.applied.deliveries.length} deliver${r.applied.deliveries.length === 1 ? 'y' : 'ies'} redirected${r.applied.address ? ' · new address saved' : ''}.</small></div></div>`;
        } catch (x) { toast(x.message, true); }
      });
    };
  }));
}

// ---- D. trip folders -----------------------------------------------------------------------------
export async function renderTrips(view) {
  view.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const d = await api('/hub/trips');
  view.innerHTML = `${head('plane', 'blue', 'Trip expenses', 'Each trip in one folder: tickets, stays, cabs and parcels, with GST, ready for finance.')}
    ${d.data.length ? d.data.map((t) => `<section class="card tf" data-trip="${esc(t.id)}"><div class="tf-h"><div><h2>${esc(t.name)}</h2><small>${esc(date(t.start))}${t.end !== t.start ? ` – ${esc(date(t.end))}` : ''} · ${t.items.length} item${t.items.length === 1 ? '' : 's'}</small></div><div class="tf-tot"><b translate="no">${esc(money(t.total))}</b><small>GST ${esc(money(t.gst))}</small></div><span class="badge ${t.status === 'submitted' ? 'badge-green' : ''}">${t.status === 'submitted' ? 'Submitted' : 'Draft'}</span></div>
      <ul class="tf-items">${t.items.map((x) => `<li>${tile({ flight: 'plane', train: 'train', bus: 'bus', hotel: 'hotel', stay: 'bed', ride: 'ride', courier: 'parcel' }[x.kind] || 'receipt', 'blue').value}<div class="grow"><a class="link" href="#/my/orders/${esc(x.id)}"><b>${esc(x.title)}</b></a><small>${esc(x.provider)} · ${esc(x.sub || '')}</small></div><span class="tf-gst">GST ${x.gst_rate}%</span><b translate="no">${esc(money(x.amount))}</b></li>`).join('')}</ul>
      <div class="row tf-act"><button class="btn btn-outline btn-sm" type="button" data-csv>${icon('download', 15)}CSV</button><button class="btn btn-outline btn-sm" type="button" data-print>${icon('file', 15)}Expense report</button>${t.status === 'submitted' ? '' : '<button class="btn btn-primary btn-sm" type="button" data-submit>Submit to finance</button>'}</div></section>`).join('')
      : `<section class="card ph-empty">${tile('plane', 'blue').value}<h2>No trips yet</h2><p class="muted">Book a flight, train or hotel. Its cabs, parcels and GST invoices collect here as one trip, ready for finance.</p><ol class="ph-steps"><li><b>1</b>Book travel</li><li><b>2</b>Add cabs and parcels</li><li><b>3</b>Submit the trip</li></ol><a class="btn btn-primary" href="#/book-pay">Book travel</a></section>`}`;
  view.onclick = async (e) => {
    const card = e.target.closest('[data-trip]'); if (!card) return; const t = d.data.find((x) => x.id === card.dataset.trip);
    if (e.target.closest('[data-csv]')) return downloadCsv(`${t.name.replace(/\W+/g, '-')}.csv`, [['Date', 'Order', 'Item', 'Provider', 'Taxable', 'GST %', 'GST', 'Total'], ...t.items.map((x) => [String(x.at).slice(0, 10), x.id, x.title, x.provider, x.taxable, x.gst_rate, x.gst, x.amount])]);
    if (e.target.closest('[data-print]')) {
      const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to open the report.', true); return; }
      const p = store.state.profile || {};
      w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(t.name)}</title><style>body{font:13px/1.5 Inter,Segoe UI,sans-serif;max-width:780px;margin:24px auto;padding:24px;color:#15211E}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #CDD5D2;padding:6px 8px;text-align:left}th{background:#F1F4F3}h1{margin:0;font-size:20px}small{color:#5b6b66}</style><h1>Expense report · ${esc(t.name)}</h1><small>${esc(p.name || '')}${p.company ? ` · ${esc(p.company)}` : ''} · ${esc(date(t.start))} – ${esc(date(t.end))}</small><table><tr><th>Date</th><th>Item</th><th>Provider</th><th>Taxable</th><th>GST</th><th>Total</th></tr>${t.items.map((x) => `<tr><td>${esc(String(x.at).slice(0, 10))}</td><td>${esc(x.title)}</td><td>${esc(x.provider)}</td><td>${x.taxable}</td><td>${x.gst} (${x.gst_rate}%)</td><td>${x.amount}</td></tr>`).join('')}<tr><th colspan="4">Total</th><th>${t.gst}</th><th>${t.total}</th></tr></table><p><small>Demo report. Each line's GST invoice is on its order page.</small></p><script>print()<\/script>`);
      w.document.close(); return;
    }
    if (e.target.closest('[data-submit]')) { await api('/hub/trips/submit', { method: 'POST', body: { id: t.id } }); toast('Sent to finance'); renderTrips(view); }
  };
}

// ---- E. bulk gifting -------------------------------------------------------------------------------
const SAMPLE = 'name,phone,pincode,address\nRavi Kumar,9876543210,400053,Flat 4 Sea Breeze Andheri West\nMeera Iyer,9876500001,500032,Plot 9 Gachibowli\nArjun Rao,9845012345,600040,12 2nd Avenue Anna Nagar';
export async function renderGifting(view) {
  view.innerHTML = `${head('gift', 'rose', 'Bulk gifting', 'Send a gift to hundreds of people. Each receiver picks a slot or a locker; you track them all here.')}
    <div class="dash dash--even"><div class="dash__main"><section class="card"><form class="form-grid" id="gfF" novalidate>
      <label class="field">Gift name<input class="input" name="title" value="Diwali gift"></label><label class="field">Send from pin code<input class="input" name="from_pin" inputmode="numeric" maxlength="6" value="${esc(((store.state.profile || {}).business_address || {}).pincode || '560034')}"></label>
      <label class="field">Weight of each gift (kg)<input class="input" name="weight" inputmode="decimal" value="1"></label>
      <label class="field full">Receivers (CSV: name, phone, pincode, address)<textarea class="input mono" name="csv" rows="7">${SAMPLE}</textarea></label></form>
      <div class="row"><label class="btn btn-outline btn-sm">Upload CSV<input type="file" id="gfFile" accept=".csv,text/csv" hidden></label><button class="btn btn-primary" id="gfGo" type="button">${icon('search', 16)}Check prices</button></div><p class="form-error" id="gfE"></p></section><div id="gfOut"></div></div>
    <aside class="dash__side"><section class="card"><b>How it works</b><ol class="rl-how"><li>We price every parcel with the best courier for its pin code.</li><li>You pay once for all of them.</li><li>Each receiver gets a link to pick a delivery slot, a locker or a neighbour, and to report damage.</li></ol></section></aside></div>`;
  const f = view.querySelector('#gfF'); const out = view.querySelector('#gfOut');
  view.querySelector('#gfFile').addEventListener('change', async (e) => { if (e.target.files[0]) f.csv.value = await e.target.files[0].text(); });
  const rows = () => { const lines = f.csv.value.trim().split(/\r?\n/).filter(Boolean); const keys = lines[0].split(',').map((k) => k.trim().toLowerCase()); return lines.slice(1).map((l) => { const c = l.split(','); return Object.fromEntries(keys.map((k, i) => [k, (c[i] || '').trim()])); }); };
  view.querySelector('#gfGo').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    view.querySelector('#gfE').textContent = '';
    let q; try { q = await api('/hub/gifting/quote', { method: 'POST', body: { title: f.title.value, from_pin: f.from_pin.value, weight: f.weight.value, rows: rows() } }); } catch (x) { view.querySelector('#gfE').textContent = x.message; return; }
    out.innerHTML = `<section class="card"><div class="card__head"><h2>${q.ok} gift${q.ok === 1 ? '' : 's'} ready · <span translate="no">${esc(money(q.total))}</span></h2>${q.failed.length ? `<span class="badge badge-amber">${q.failed.length} need fixing</span>` : ''}</div>
      <div class="table-wrap"><table class="cb-t"><thead><tr><th>#</th><th>Receiver</th><th>Pin code</th><th>Courier</th><th>Price</th></tr></thead><tbody>${q.lines.map((l) => `<tr class="${l.ok ? '' : 'gf-bad'}"><td>${l.n}</td><td>${esc(l.name || '—')}</td><td>${esc(l.pin || '')}</td><td>${l.ok ? esc(l.provider) : `<span class="neg">${esc(l.error)}</span>`}</td><td>${l.ok ? esc(money(l.total)) : ''}</td></tr>`).join('')}</tbody></table></div>
      ${q.ok ? `<button class="btn btn-primary mt" id="gfBook" type="button">Send ${q.ok} gift${q.ok === 1 ? '' : 's'} · <span translate="no">${esc(money(q.total))}</span></button>` : ''}</section>`;
    const bk = out.querySelector('#gfBook');
    if (bk) bk.addEventListener('click', () => withBusy(bk, async () => {
      try {
        const r = await payWithApproval({ path: '/hub/gifting/book', body: { plan_id: q.plan_id }, total: q.total, info: { title: `${f.title.value} · ${q.ok} parcels`, payee: 'Couriers', icon: 'gift', tone: 'rose', baseLabel: 'Shipping' } });
        if (!r) return; refresh();
        out.innerHTML = `<section class="card"><div class="card__head"><h2>${r.sent.length} gifts on their way</h2><button class="btn btn-outline btn-sm" type="button" id="gfCsv">${icon('download', 15)}Links CSV</button></div><ul class="gf-sent">${r.sent.map((s) => `<li>${tile('gift', 'rose').value}<div class="grow"><b>${esc(s.name)}</b><small>${esc(s.provider)} · <a class="link" href="#/my/orders/${esc(s.id)}">${esc(s.id)}</a></small></div><button class="btn btn-outline btn-sm" type="button" data-copy="${esc(location.origin + s.link)}">${icon('share', 14)}Copy receiver link</button></li>`).join('')}</ul><p class="muted small">Live: each receiver gets the link by SMS or WhatsApp automatically.</p></section>`;
        out.querySelectorAll('[data-copy]').forEach((c) => c.addEventListener('click', async () => { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Link copied'); } catch (er) { toast(c.dataset.copy); } }));
        out.querySelector('#gfCsv').addEventListener('click', () => downloadCsv('gift-links.csv', [['Name', 'Phone', 'Order', 'Courier', 'Receiver link'], ...r.sent.map((s) => [s.name, s.phone, s.id, s.provider, location.origin + s.link])]));
      } catch (x) { if (!x.quiet) toast(x.message, true); }
    }));
  }));
}

// ---- F. family wallet --------------------------------------------------------------------------------
export async function renderFamily(view) {
  const draw = async () => {
    const f = await api('/hub/family');
    const pend = f.requests.filter((r) => r.status === 'pending');
    view.innerHTML = `${head('user', 'green', 'Family wallet', 'Your family pays from your wallet with limits you set. Bigger spends wait for your approval.', '<button class="btn btn-primary" type="button" id="fmAdd">+ Add family member</button>')}
      ${pend.length ? `<section class="card fm-pend"><h2 class="notop">Waiting for you</h2>${pend.map((r) => `<div class="fm-req">${tile({ rides: 'ride', recharge: 'phone', travel: 'bus', bills: 'bill', parcels: 'parcel' }[r.service] || 'wallet', 'amber').value}<div class="grow"><b>${esc(r.name)} · ${esc(r.what)}</b><small>${esc(r.note)} · ${esc(dateTime(r.at))}</small></div><b translate="no">${esc(money(r.amount))}</b><button class="btn btn-outline btn-sm" type="button" data-no="${r.id}">Decline</button><button class="btn btn-primary btn-sm" type="button" data-yes="${r.id}" data-amt="${r.amount}">Approve</button></div>`).join('')}</section>` : ''}
      <div class="fm-grid">${f.members.length ? f.members.map((m) => `<section class="card fm"><div class="fm-h"><span class="fm-av">${esc(m.name[0])}</span><div class="grow"><b>${esc(m.name)}</b><small>${esc(m.relation)} · ${esc(m.phone)}</small></div><button class="link" type="button" data-edit="${m.id}">Edit</button></div>
        <div class="fm-bar"><i style="width:${m.monthly_limit ? Math.min(100, Math.round((m.spent / m.monthly_limit) * 100)) : 0}%"></i></div><small class="muted"><span translate="no">${esc(money(m.spent))}</span> of <span translate="no">${m.monthly_limit ? esc(money(m.monthly_limit)) : 'no limit'}</span> this month · approval over <span translate="no">${m.approve_over ? esc(money(m.approve_over)) : 'never'}</span></small>
        <div class="fm-svc">${(m.services || []).map((s) => `<span>${esc(s)}</span>`).join('')}</div>
        <button class="btn btn-outline btn-sm" type="button" data-sim="${m.id}">${icon('phone', 14)}Demo: ${esc(m.name.split(' ')[0])} books something</button></section>`).join('') : '<section class="card"><p class="muted notop">Add your family: they book rides, recharges and tickets from their own phones, paid from your wallet, within your limits.</p></section>'}</div>
      ${f.requests.length ? `<section class="card"><h2 class="notop">Family spending</h2><ul class="feed">${f.requests.slice(0, 12).map((r) => `<li><div class="feed__t"><b>${esc(r.name)} · ${esc(r.what)}</b><small>${esc(dateTime(r.at))} · ${esc(r.note || '')}</small></div><div class="feed__r"><b translate="no">${esc(money(r.amount))}</b></div><span class="badge ${r.status === 'paid' || r.status === 'approved' ? 'badge-green' : r.status === 'pending' ? 'badge-amber' : 'badge-red'}">${esc(r.status)}</span></li>`).join('')}</ul></section>` : ''}`;
    const edit = (m = {}) => modal({
      title: m.id ? `Edit ${m.name}` : 'Add a family member',
      body: `<form class="form-grid" id="fmF" novalidate><label class="field">Name<input class="input" name="name" value="${esc(m.name || '')}"></label><label class="field">Mobile<input class="input" name="phone" inputmode="numeric" maxlength="10" value="${esc(m.phone || '')}"></label><label class="field">Relation<input class="input" name="relation" value="${esc(m.relation || '')}" placeholder="Daughter, Father…"></label><label class="field">Monthly limit (₹)<input class="input" name="monthly_limit" inputmode="numeric" value="${m.monthly_limit ?? 3000}"></label><label class="field">Ask me for anything over (₹)<input class="input" name="approve_over" inputmode="numeric" value="${m.approve_over ?? 500}"></label>
        <div class="field full"><span>Allowed</span><div class="row">${['rides', 'recharge', 'bills', 'travel', 'parcels'].map((s) => `<label class="row"><input type="checkbox" class="check" name="svc" value="${s}" ${!m.services || m.services.includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}</div></div></form><p class="form-error" id="fmE"></p>`,
      footer: `${m.id ? '<button class="btn btn-danger" id="fmRm">Remove</button>' : ''}<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="fmGo">Save</button>`,
      onMount(el, close) {
        el.querySelector('#fmGo').addEventListener('click', async () => { const fm = el.querySelector('#fmF'); try { await api('/hub/family/member', { method: 'POST', body: { id: m.id, name: fm.name.value, phone: fm.phone.value, relation: fm.relation.value, monthly_limit: fm.monthly_limit.value, approve_over: fm.approve_over.value, services: [...fm.querySelectorAll('[name=svc]:checked')].map((x) => x.value) } }); close(true); draw(); } catch (x) { el.querySelector('#fmE').textContent = x.message; } });
        const rm = el.querySelector('#fmRm'); if (rm) rm.addEventListener('click', async () => { await api('/hub/family/member', { method: 'POST', body: { id: m.id, remove: true } }); close(true); draw(); });
      },
    });
    view.querySelector('#fmAdd').onclick = () => edit();
    view.onclick = async (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) return edit(f.members.find((m) => m.id === ed.dataset.edit));
      const sim = e.target.closest('[data-sim]');
      if (sim) return withBusy(sim, async () => { try { const r = await api('/hub/family/simulate', { method: 'POST', body: { id: sim.dataset.sim } }); toast(`${r.request.name}: ${r.request.what} · ${money(r.request.amount)} · ${r.request.status}`, r.request.status === 'blocked'); refresh(); draw(); } catch (x) { toast(x.message, true); } });
      const no = e.target.closest('[data-no]'); if (no) { await api('/hub/family/decide', { method: 'POST', body: { id: no.dataset.no, approve: false } }); toast('Declined'); return draw(); }
      const yes = e.target.closest('[data-yes]');
      if (yes) { const r = await payWithApproval({ path: '/hub/family/decide', body: { id: yes.dataset.yes, approve: true }, total: Number(yes.dataset.amt), info: { title: 'Family request', payee: 'Family member', icon: 'user', tone: 'green', baseLabel: 'Amount' } }); if (r) { toast('Approved and paid'); refresh(); draw(); } }
    };
  };
  view.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  await draw();
}
