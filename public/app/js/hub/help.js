// Help centre and feedback.
import { api, esc, toast, withBusy, dateTime, formData } from '../core.js';
import { tile, scene } from './art.js';
import { filterBtn, openFilters } from './ui.js';
import { startTour, installApp } from './experience.js';

const TOPICS = [
  ['orders', 'Orders and booking', 'list', 'green'], ['returns', 'Returns', 'repeat', 'coral'], ['weight', 'Weight and charges', 'scale', 'amber'], ['wallet', 'Wallet and payments', 'wallet', 'blue'],
  ['travel', 'Travel and rides', 'plane', 'violet'], ['recharge', 'Recharge and bills', 'phone', 'green'], ['business', 'Business tools', 'briefcase', 'blue'], ['account', 'Account and security', 'shield', 'rose'],
];
const FAQ = [
  ['orders', 'Does UT Log deliver my parcel?', 'No. UT Log compares providers and books the one you choose. That provider carries out the delivery, and we keep your records in one place.'],
  ['orders', 'How do I book a delivery?', 'Open Vehicle, Courier or Logistics, enter your location or pin code, add the weight, and choose a service from the recommendations.'],
  ['orders', 'Can I cancel an order?', 'Yes, until the parcel is picked up. Open Orders, use the menu on the order, and choose Cancel. Prepaid amounts go back to your wallet right away.'],
  ['orders', 'How do I track an order?', 'Open Orders and press Track. You will see the status, timeline and the OTP to share with the rider.'],
  ['returns', 'How do I return a delivered order?', 'Open Returns and press Create return, or use the menu on a delivered order. Choose a reason and whether it is a return or an exchange.'],
  ['returns', 'Who pays for the return?', 'Reverse shipping is charged to your wallet when the return is approved. If you cancel before pickup, it is refunded.'],
  ['returns', 'How long do I have to return?', 'The window is set under Return policy on the Returns page. The default is 30 days from booking.'],
  ['weight', 'How much can each vehicle carry?', 'Open Weight Management. It lists every vehicle with its limit, and the load checker tells you the smallest one that fits.'],
  ['weight', 'What is volumetric weight?', 'Large, light parcels are charged by size. For courier it is length × width × height in cm, divided by 5,000. You pay on the higher of actual and volumetric weight.'],
  ['weight', 'Why was I charged for more weight?', 'If a provider’s scale shows more than you declared, it appears under Weight checks. You can accept it, or dispute it within 7 days.'],
  ['wallet', 'How does the wallet work?', 'Add money once and use it for transport, travel, recharges and bills. Prepaid bookings are paid from it right away.'],
  ['wallet', 'What is Pay on delivery?', 'You pay the provider directly when the service is done, with a small fee. Nothing is taken from your wallet.'],
  ['wallet', 'How do reward points work?', 'You earn points on prepaid payments. 1 point is worth ₹1. Use them at checkout or move them to your wallet from Rewards.'],
  ['travel', 'Can I get an alert when fares drop?', 'Yes. Search a route under Flights, Trains or Buses and choose Set a price alert.'],
  ['recharge', 'How does FASTag auto-recharge work?', 'Connect your FASTag under Auto-pay and set a limit. When the balance falls below it, your wallet tops it up.'],
  ['business', 'What is Single GST?', 'One monthly statement under your GSTIN covering every provider. Find it in the Business section of the sidebar.'],
  ['business', 'How do WhatsApp updates work?', 'Choose which events send messages, and to whom, under WhatsApp in the Business section. Receivers must have agreed to get updates.'],
  ['account', 'How do I switch between Personal and Business?', 'Use the Personal / Business control at the top of any page.'],
  ['account', 'How do I change language or currency?', 'Use the language and currency buttons at the top, or open your profile and choose Language & currency.'],
];

export async function renderHelp(view, { query }) {
  const topic = query.get('topic') || '';
  const [tickets, cfg] = await Promise.all([api('/tickets', { query: { per_page: 4 } }), api('/hub/config')]);
  const s = cfg.support || {};
  view.innerHTML = `
    <section class="help-hero"><div class="help-hero__t"><h1>How can we help?</h1><div class="help-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/></svg><input id="q" placeholder="Search for answers" aria-label="Search help" autocomplete="off"></div></div><div class="help-hero__img">${scene('support').value}</div></section>
    <section class="topics">${TOPICS.map(([k, l, i, t]) => `<a class="topic ${k === topic ? 'on' : ''}" href="#/help${k === topic ? '' : `?topic=${k}`}">${tile(i, t).value}<span>${esc(l)}</span></a>`).join('')}</section>
    <div class="dash dash--even">
      <section class="card"><div class="card__head"><h2 id="fTitle">Popular questions</h2>${filterBtn(topic ? 1 : 0)}</div><div id="faq" class="faq"></div></section>
      <aside class="dash__side">
        <section class="card"><h2>Still need help?</h2><p class="muted notop">Raise a ticket and follow the reply here.</p><a class="btn btn-primary btn-block" href="#/support?new=1">Raise a ticket</a>${s.phone ? `<a class="btn btn-outline btn-block mt-s" href="tel:${esc(s.phone)}">Call ${esc(s.phone)}</a>` : ''}${s.email ? `<a class="btn btn-outline btn-block mt-s" href="mailto:${esc(s.email)}">Email ${esc(s.email)}</a>` : ''}</section>
        <section class="card"><div class="card__head"><h2>Your tickets</h2><a class="link" href="#/support">View all</a></div>${tickets.data.length ? `<ul class="feed">${tickets.data.map((t) => `<li><div class="feed__t"><a class="link" href="#/support?id=${t.id}">${esc(t.subject)}</a><small>${esc(dateTime(t.last.at))}</small></div><span class="badge ${t.status === 'RESOLVED' ? 'badge-green' : t.status === 'AWAITING_YOU' ? 'badge-amber' : 'badge-blue'}">${t.status === 'RESOLVED' ? 'Resolved' : t.status === 'AWAITING_YOU' ? 'Waiting for you' : 'Open'}</span></li>`).join('')}</ul>` : '<p class="muted notop">No tickets yet.</p>'}</section>
        <section class="card"><h2>Get started</h2><p class="muted notop">Take the quick tour, or put UT Log on your phone.</p><div class="row"><button class="btn btn-outline" id="tour" type="button">Take the tour</button><button class="btn btn-outline" id="install" type="button">Install app</button></div></section>
      </aside>
    </div>`;
  const faq = view.querySelector('#faq'); const q = view.querySelector('#q'); const title = view.querySelector('#fTitle');
  function draw() {
    const term = q.value.trim().toLowerCase();
    const list = FAQ.filter(([t, a, b]) => (term ? `${a} ${b}`.toLowerCase().includes(term) : !topic || t === topic));
    const shown = term || topic ? list : list.filter((_, n) => n % 2 === 0).slice(0, 8);
    title.textContent = term ? `${list.length} ${list.length === 1 ? 'result' : 'results'}` : topic ? TOPICS.find((t) => t[0] === topic)[1] : 'Popular questions';
    faq.innerHTML = shown.length ? shown.map(([, a, b]) => `<details><summary>${esc(a)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><p>${esc(b)}</p></details>`).join('') : '<p class="muted notop">No matches. Try different words, or raise a ticket.</p>';
  }
  view.querySelector('#tour').addEventListener('click', () => { location.hash = '#/home'; setTimeout(startTour, 1200); });
  view.querySelector('#install').addEventListener('click', installApp);
  q.addEventListener('input', draw);
  const tf = [{ key: 'topic', label: 'Topic', options: [['', 'All topics'], ...TOPICS.map(([k, l]) => [k, l])] }];
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, tf, { topic }, (v) => { location.hash = v.topic ? `#/help?topic=${v.topic}` : '#/help'; }));
  draw();
}

const AREAS = ['Booking', 'Orders', 'Returns', 'Weight', 'Wallet', 'Travel', 'Recharge', 'Business tools', 'Something else'];
export async function renderFeedback(view) {
  const d = await api('/hub/feedback');
  let nps = null; let type = 'idea';
  view.innerHTML = `
    <div class="page-head"><div class="row head-t">${tile('gift', 'violet').value}<div><h1>Feedback</h1><p>Tell us what works, what doesn't, and what to build next.</p></div></div></div>
    <div class="dash dash--even">
      <section class="card"><form id="ff" novalidate class="fb-form">
        <div class="field"><span>How likely are you to recommend UT Log?</span><div class="nps" role="radiogroup" aria-label="Score from 0 to 10">${Array.from({ length: 11 }, (_, n) => `<button type="button" data-n="${n}" aria-pressed="false">${n}</button>`).join('')}</div><div class="nps__l"><small>Not likely</small><small>Very likely</small></div></div>
        <div class="field"><span>What kind of feedback?</span><div class="chips" id="types">${[['idea', 'Idea'], ['bug', 'Problem'], ['praise', 'Praise'], ['other', 'Other']].map(([k, l]) => `<button type="button" class="chip" data-t="${k}" aria-pressed="${k === type}">${l}</button>`).join('')}</div></div>
        <label class="field">About<select class="select" name="area">${AREAS.map((a) => `<option>${a}</option>`).join('')}</select></label>
        <label class="field">Your feedback<textarea class="input" name="message" rows="5" placeholder="What happened, or what would you like to see?"></textarea></label>
        <label class="row"><input type="checkbox" class="check" name="want_reply"> I would like a reply (opens a support ticket)</label>
        <p class="form-error" id="e"></p><div><button class="btn btn-primary" type="submit">Send feedback</button></div></form></section>
      <aside class="dash__side">
        <section class="card"><h2>What should we build next?</h2><p class="muted notop">Vote for what matters to you.</p><ul class="votes">${d.roadmap.map((r) => `<li><button type="button" class="vote" data-v="${r.id}" aria-pressed="${r.voted}" aria-label="Vote for ${esc(r.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg><b>${r.votes}</b></button><span>${esc(r.title)}</span></li>`).join('')}</ul></section>
        <section class="card"><h2>Your feedback</h2>${d.mine.length ? `<ul class="feed">${d.mine.slice(0, 6).map((f) => `<li><div class="feed__t"><b>${esc(f.type)} · ${esc(f.area)}</b><small>${esc(f.message)}</small></div><div class="feed__r">${f.ticket_id ? `<a class="link" href="#/support?id=${f.ticket_id}">Ticket</a>` : '<span class="badge">Received</span>'}<small>${esc(dateTime(f.at))}</small></div></li>`).join('')}</ul>` : '<p class="muted notop">Nothing sent yet.</p>'}</section>
      </aside>
    </div>`;
  view.onclick = async (e) => {
    const n = e.target.closest('[data-n]'); const t = e.target.closest('[data-t]'); const v = e.target.closest('[data-v]');
    if (n) { nps = Number(n.dataset.n); view.querySelectorAll('[data-n]').forEach((b) => b.setAttribute('aria-pressed', String(b === n))); }
    if (t) { type = t.dataset.t; view.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); }
    if (v) { try { const r = await api('/hub/feedback/vote', { method: 'POST', body: { id: v.dataset.v } }); v.setAttribute('aria-pressed', String(r.voted)); v.querySelector('b').textContent = r.votes; } catch (x) { toast(x.message, true); } }
  };
  view.querySelector('#ff').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const d2 = formData(f); const btn = f.querySelector('[type=submit]');
    await withBusy(btn, async () => { try { await api('/hub/feedback', { method: 'POST', body: { ...d2, type, nps, want_reply: !!d2.want_reply } }); toast('Thank you for your feedback'); renderFeedback(view); } catch (x) { view.querySelector('#e').textContent = x.message; } });
  });
}
