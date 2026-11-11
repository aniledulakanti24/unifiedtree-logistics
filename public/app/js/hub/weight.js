// Weight Management: what each vehicle can carry, a load checker, weight checks, saved packages.
import { api, esc, money, toast, modal, withBusy, date, formData } from '../core.js';
import { tile, vehicleImg } from './art.js';
import { withFunds, refresh, filterBtn, openFilters, countActive } from './ui.js';

const BODY = { bike: 'Box about 1.5 × 1.5 × 1.5 ft', auto: 'Cargo bed 5.5 × 4.5 × 5 ft', mini: 'Open deck 7 × 4.5 × 1 ft', pickup8: 'Open deck 8 × 5 × 1.5 ft', truck14: 'Box 14 × 6 × 6.5 ft', truck19: 'Box 19 × 7 × 7 ft', container32: 'Container 32 × 8 × 8 ft', trailer40: 'Trailer 40 × 8 × 8 ft' };
const kgText = (kg) => (kg >= 1000 ? `${(kg / 1000).toLocaleString()} tonnes` : `${kg} kg`);
const sectionFor = (key) => (['bike', 'auto', 'mini'].includes(key) ? 'vehicle' : 'logistics');
const memory = { weight: '', pieces: '1', length: '', breadth: '', height: '' };
const vf = { size: '', fit: '' };
const df = { status: '' };
const VFIELDS = [{ key: 'size', label: 'Vehicle size', options: [['', 'All vehicles'], ['small', 'Up to 750 kg'], ['medium', '750 kg to 9 tonnes'], ['large', 'Above 9 tonnes']] }, { key: 'fit', label: 'Show', options: [['', 'All'], ['fits', 'Only vehicles that fit my load']] }];
const DFIELDS = [{ key: 'status', label: 'Status', options: [['', 'All'], ['ACTION', 'Action needed'], ['ACCEPTED', 'Accepted'], ['DISPUTED', 'Under review']] }];

export async function render(view, { query }) {
  const tab = ['capacity', 'disputes', 'packages'].includes(query.get('tab')) ? query.get('tab') : 'capacity';
  view.innerHTML = '<div class="skeleton" style="height:320px"></div>';
  const [meta, w] = await Promise.all([api('/public/booking/meta'), api('/hub/weight')]);
  view.innerHTML = `
    <div class="page-head"><div class="row head-t">${tile('scale', 'amber').value}<div><h1>Weight Management</h1><p>See what each vehicle can carry, and keep charged weights accurate.</p></div></div></div>
    <nav class="tabs tabs--line">${[['capacity', 'Vehicle capacity'], ['disputes', 'Weight checks'], ['packages', 'Saved packages']].map(([k, l]) => `<a href="#/my/weight?tab=${k}" class="${k === tab ? 'active' : ''}">${l}${k === 'disputes' && w.counts.action ? `<i class="badge-count">${w.counts.action}</i>` : ''}</a>`).join('')}</nav><div id="body"></div>`;
  const body = view.querySelector('#body');
  const again = () => render(view, { query });
  if (tab === 'capacity') capacity(body, meta.vehicles, w.profiles);
  if (tab === 'disputes') disputes(body, w, again);
  if (tab === 'packages') packages(body, w.profiles, again);
}

function capacity(body, vehicles, profiles) {
  body.innerHTML = `
    <section class="card load"><div class="load__f"><h2 class="h-lg">Will my load fit?</h2>
      ${profiles.length ? `<label class="field">Saved package<select class="select" id="prof"><option value="">Choose a saved package</option>${profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.weight} kg</option>`).join('')}</select></label>` : ''}
      <form class="form-grid" id="lf"><label class="field">Total weight (kg)<input class="input" name="weight" inputmode="decimal" value="${esc(memory.weight)}" placeholder="e.g. 400"></label><label class="field">Number of pieces<input class="input" name="pieces" inputmode="numeric" value="${esc(memory.pieces)}"></label>
      <div class="field full"><span>Size of one piece in cm (optional)</span><div class="dims">${[['length', 'Length'], ['breadth', 'Width'], ['height', 'Height']].map(([k, l]) => `<input class="input" name="${k}" inputmode="decimal" value="${esc(memory[k])}" placeholder="${l}" aria-label="${l} in cm">`).join('')}</div></div></form>
      <dl class="break" id="calc"></dl></div>
      <div class="load__r" id="best" aria-live="polite"></div></section>
    <div class="section-head"><h2 class="h-lg">What each vehicle can carry</h2><span id="vfHost"></span></div><div class="vehicles" id="veh"></div>
    <p class="muted small credit">Container and trailer photos: <a class="link" href="https://commons.wikimedia.org/wiki/File:XJ91404_(17.06.14,_Motorvej_501,_Viby_J)DSC_2319_Balancer_(39145867114).jpg" target="_blank" rel="noopener">Lav Ulv</a> (CC BY 2.0) and <a class="link" href="https://commons.wikimedia.org/wiki/File:DAF_CF_85.380_prime_mover,_Bangladesh._(33921489541).jpg" target="_blank" rel="noopener">Shadman Samee</a> (CC BY-SA 2.0), via Wikimedia Commons. Backgrounds removed.</p>`;
  const f = body.querySelector('#lf'); const veh = body.querySelector('#veh'); const best = body.querySelector('#best'); const calc = body.querySelector('#calc');
  function draw() {
    const d = formData(f); Object.assign(memory, d);
    const kg = Number(d.weight) || 0; const n = Math.max(1, Number(d.pieces) || 1);
    const dims = [d.length, d.breadth, d.height].map(Number);
    const m3 = dims.every((x) => x > 0) ? (dims[0] * dims[1] * dims[2] * n) / 1e6 : 0;
    const fits = (v) => v.kg >= kg && (!m3 || v.m3 >= m3);
    const pick = kg > 0 ? vehicles.find(fits) : null;
    if (kg > 0 || m3) {
      const volCourier = m3 ? (m3 * 1e6) / 5000 : 0; const volRoad = m3 * 250;
      calc.innerHTML = `<div><dt>Actual weight</dt><dd>${kg} kg</dd></div>${m3 ? `<div><dt>Volume</dt><dd>${m3.toFixed(2)} m³</dd></div><div><dt>Courier volumetric weight</dt><dd>${volCourier.toFixed(1)} kg</dd></div><div><dt>Road freight volumetric weight</dt><dd>${volRoad.toFixed(1)} kg</dd></div><div class="break__t"><dt>Courier charges on</dt><dd>${Math.max(kg, volCourier).toFixed(1)} kg</dd></div>` : ''}`;
    } else calc.innerHTML = '';
    best.innerHTML = pick ? `<img class="load__img" src="${vehicleImg(pick.key)}" alt="${esc(pick.name)}"><small>Best fit</small><b>${esc(pick.name)}</b><p>Uses ${Math.round((kg / pick.kg) * 100)}% of its ${esc(kgText(pick.kg))} limit${m3 ? ` and ${Math.round((m3 / pick.m3) * 100)}% of its space` : ''}.</p><a class="btn btn-primary" href="#/${sectionFor(pick.key)}/book?weight=${kg}">Book this vehicle</a>`
      : kg > 0 ? `<img class="load__img dim" src="${vehicleImg('trailer40')}" alt=""><b>Too much for one vehicle</b><p>Our largest vehicle carries ${esc(kgText(vehicles[vehicles.length - 1].kg))}. Split this load across more than one booking.</p>`
        : `<img class="load__img" src="${vehicleImg('bike')}" alt=""><b>Enter a weight</b><p>We will show the smallest vehicle that can safely carry it.</p>`;
    body.querySelector('#vfHost').innerHTML = filterBtn(countActive(VFIELDS, vf), 'vfB');
    body.querySelector('#vfB').onclick = (e) => openFilters(e.currentTarget, VFIELDS, vf, (x) => { Object.assign(vf, x); draw(); });
    const sized = (v) => (vf.size === 'small' ? v.kg <= 750 : vf.size === 'medium' ? v.kg > 750 && v.kg <= 9000 : vf.size === 'large' ? v.kg > 9000 : true);
    veh.innerHTML = vehicles.filter((v) => sized(v) && (vf.fit !== 'fits' || !kg || fits(v))).map((v) => {
      const pct = kg ? Math.round((kg / v.kg) * 100) : 0;
      const ok = !kg || fits(v);
      const why = !ok ? (v.kg < kg ? `${kg - v.kg} kg over the limit` : 'Too small for this volume') : kg ? `${pct}% of limit` : '';
      return `<article class="card veh ${ok ? '' : 'no'} ${pick && pick.key === v.key ? 'best' : ''}"><div class="veh__img"><img src="${vehicleImg(v.key)}" alt="${esc(v.name)}" loading="lazy"></div>${pick && pick.key === v.key ? '<span class="badge badge-green veh__b">Best fit</span>' : ''}<h2>${esc(v.name)}</h2><p class="veh__kg">Carries up to <b>${esc(kgText(v.kg))}</b></p><small class="muted">${esc(BODY[v.key] || '')} · ${v.m3} m³</small><small class="muted">${esc(v.use)}</small>
        ${kg ? `<span class="hbar__t ${ok ? (pct > 85 ? 'warn' : '') : 'over'}"><i style="width:${Math.min(100, pct)}%"></i></span><small class="${ok ? 'muted' : 'veh__over'}">${esc(why)}</small>` : ''}
        ${ok ? `<a class="btn btn-outline btn-sm" href="#/${sectionFor(v.key)}/book${kg ? `?weight=${kg}` : ''}">Book</a>` : ''}</article>`;
    }).join('');
  }
  f.addEventListener('input', draw);
  const prof = body.querySelector('#prof');
  if (prof) prof.addEventListener('change', () => { const p = profiles.find((x) => x.id === prof.value); if (!p) return; f.weight.value = p.weight; f.length.value = p.length || ''; f.breadth.value = p.breadth || ''; f.height.value = p.height || ''; draw(); });
  draw();
}

const CASE = { ACTION: ['badge-amber', 'Action needed'], ACCEPTED: ['badge-green', 'Accepted'], DISPUTED: ['badge-blue', 'Under review'] };
function disputes(body, w, again) {
  body.innerHTML = `<div class="grid grid-3"><div class="card stat"><span class="stat__label">Action needed</span><span class="stat__value">${w.counts.action}</span></div><div class="card stat"><span class="stat__label">Accepted</span><span class="stat__value">${w.counts.accepted}</span></div><div class="card stat"><span class="stat__label">Under review</span><span class="stat__value">${w.counts.disputed}</span></div></div>
    <p class="callout mb">When a provider's scale shows more than you declared, it appears here. Accept the charge, or dispute it within 7 days. Scale readings are simulated in this demo.</p>
    <div class="toolbar">${filterBtn(countActive(DFIELDS, df))}</div>
    ${w.cases.filter((c) => !df.status || c.status === df.status).length ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Service</th><th>Declared</th><th>Charged</th><th>Extra</th><th>Status</th><th>Action</th></tr></thead><tbody>${w.cases.filter((c) => !df.status || c.status === df.status).map((c) => `<tr><td class="stack"><a class="link mono" href="#/my/orders/${esc(c.id)}">${esc(c.id)}</a><small class="muted">Reply by ${esc(date(c.due))}</small></td><td class="stack"><b>${esc(c.provider)}</b><small class="muted">${esc(c.sub)}</small></td><td>${c.declared} kg</td><td><b>${c.charged} kg</b></td><td translate="no">${esc(money(c.extra))}</td><td><span class="badge ${CASE[c.status][0]}">${CASE[c.status][1]}</span></td><td>${c.status === 'ACTION' ? `<div class="row row--nw"><button class="btn btn-primary btn-sm" data-ok="${esc(c.id)}" type="button">Accept</button><button class="btn btn-outline btn-sm" data-dis="${esc(c.id)}" type="button">Dispute</button></div>` : c.ticket_id ? `<a class="link" href="#/support?id=${c.ticket_id}">Ticket #${c.ticket_id}</a>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="card"><p class="muted notop">No weight differences. Delivered courier and logistics orders are checked automatically.</p></div>'}`;
  body.onclick = async (e) => {
    const flt = e.target.closest('#flt');
    if (flt) { openFilters(flt, DFIELDS, df, (v) => { Object.assign(df, v); again(); }); return; }
    const ok = e.target.closest('[data-ok]'); const dis = e.target.closest('[data-dis]');
    if (ok) { try { await withFunds(() => api('/hub/weight/accept', { method: 'POST', body: { id: ok.dataset.ok } })); toast('Weight accepted. Charged to your wallet.'); refresh(); again(); } catch (x) { if (!x.quiet) toast(x.message, true); } }
    if (dis) dispute(w.cases.find((c) => c.id === dis.dataset.dis), again);
  };
}
function dispute(c, done) {
  modal({
    title: 'Dispute this weight',
    body: `<p class="notop muted">${esc(c.id)} · Declared ${c.declared} kg, charged ${c.charged} kg</p><form class="form-grid" id="df" novalidate><label class="field full">Actual weight you measured (kg)<input class="input" name="actual" inputmode="decimal"></label><label class="field full">Why is the charged weight wrong?<textarea class="input" name="note" rows="3"></textarea></label></form><p class="muted small notop">This opens a support ticket so the team can review it.</p><p class="form-error" id="e"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="y">Submit dispute</button>',
    onMount(el, close) { const go = el.querySelector('#y'); go.addEventListener('click', () => withBusy(go, async () => { try { await api('/hub/weight/dispute', { method: 'POST', body: { id: c.id, ...formData(el.querySelector('#df')) } }); close(true); toast('Dispute submitted'); done(); } catch (x) { el.querySelector('#e').textContent = x.message; } })); },
  });
}

function packages(body, profiles, again) {
  body.innerHTML = `<div class="dash dash--even"><section class="card"><h2>Saved packages</h2>${profiles.length ? `<ul class="feed">${profiles.map((p) => `<li>${tile('box2', 'amber').value}<div class="feed__t"><b>${esc(p.name)}</b><small>${p.weight} kg${p.length ? ` · ${p.length} × ${p.breadth} × ${p.height} cm` : ''}</small></div><button class="btn btn-danger btn-sm" data-rm="${esc(p.id)}" type="button">Remove</button></li>`).join('')}</ul>` : '<p class="muted notop">Save the packages you send often, then reuse them when booking.</p>'}</section>
    <section class="card"><h2>Add a package</h2><form class="form-grid" id="pf" novalidate><label class="field full">Name<input class="input" name="name" placeholder="e.g. Standard carton"></label><label class="field full">Weight (kg)<input class="input" name="weight" inputmode="decimal"></label><div class="field full"><span>Size in cm (optional)</span><div class="dims"><input class="input" name="length" inputmode="decimal" placeholder="Length" aria-label="Length"><input class="input" name="breadth" inputmode="decimal" placeholder="Width" aria-label="Width"><input class="input" name="height" inputmode="decimal" placeholder="Height" aria-label="Height"></div></div><p class="form-error full" id="e"></p><div class="full"><button class="btn btn-primary" type="submit">Save package</button></div></form></section></div>`;
  body.querySelector('#pf').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/hub/weight/profiles', { method: 'POST', body: formData(e.target) }); toast('Package saved'); again(); } catch (x) { body.querySelector('#e').textContent = x.message; } });
  body.onclick = async (e) => { const b = e.target.closest('[data-rm]'); if (b) { await api('/hub/weight/profiles/remove', { method: 'POST', body: { id: b.dataset.rm } }); toast('Package removed'); again(); } };
}
