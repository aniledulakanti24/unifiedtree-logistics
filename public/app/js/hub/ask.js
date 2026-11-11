// Ask: plain questions about your account, answered from your own records with fixed rules,
// or turned into the right page ("5 kg from 560034 to 400053").
import { api, esc, money, modal, store } from '../core.js';
import { icon } from './icons.js';
import { smartAction } from '../palette.js';

const EXAMPLES = ['How much did I spend this month?', 'What is my wallet balance?', 'Which orders are on the way?', 'What bills are due?', 'Any returns waiting?', '5 kg from 560034 to 400053'];

async function answer(q) {
  const t = q.toLowerCase();
  const go = smartAction(q);
  if (/spen[dt]|expense|cost/.test(t)) {
    const days = /week/.test(t) ? 7 : /quarter|90/.test(t) ? 90 : 30;
    const d = await api('/hub/overview', { query: { days } });
    const k = d.kpis.find((x) => x.key === 'spend');
    const top = d.by_service[0];
    return { text: `You spent ${money(k.value)} in the last ${days} days${k.delta ? `, ${Math.abs(k.delta)}% ${k.delta > 0 ? 'more' : 'less'} than the ${days} days before` : ''}.${top ? ` Most of it went on ${top.name} (${money(top.amount)}).` : ''}`, link: ['#/insights', 'Open Insights'] };
  }
  if (/wallet|balance/.test(t)) {
    const w = await api('/hub/wallet').catch(() => null);
    if (!w) return { text: 'Your role does not include the wallet.' };
    return { text: `Your wallet balance is ${money(w.balance)}.${w.balance < 1000 ? ' That is low for prepaid bookings.' : ''}`, link: ['#/wallet', 'Open Wallet'] };
  }
  if (/on the way|in transit|active|where|track|delivery|deliveries/.test(t) && !go) {
    const r = await api('/hub/orders', { query: { scope: '', per_page: 5, days: '', group: 'transit' } });
    return { text: r.data.length ? `${r.meta.pagination.total} ${r.meta.pagination.total === 1 ? 'order is' : 'orders are'} on the way: ${r.data.slice(0, 3).map((x) => `${x.id} with ${x.provider}`).join(', ')}.` : 'Nothing is on the way right now.', link: ['#/my/orders?scope=all&group=transit&days=', 'Open orders on the way'] };
  }
  if (/\bdue\b|upcoming/.test(t) || (/bill/.test(t) && /\?|what|which|any|when/.test(t))) {
    const d = await api('/hub/overview', { query: { days: 30 } });
    return { text: d.upcoming.length ? `Coming up: ${d.upcoming.map((u) => `${u.provider} ${money(u.amount)} ${u.days ? `in ${u.days} day${u.days > 1 ? 's' : ''}` : 'today'}`).join('; ')}.` : 'No bills are due. Connect accounts in Auto-pay to track them.', link: ['#/autopay', 'Open Auto-pay'] };
  }
  if (/return/.test(t)) {
    const r = await api('/hub/returns', { query: { per_page: 1 } });
    return { text: r.counts.requested ? `${r.counts.requested} ${r.counts.requested === 1 ? 'return is' : 'returns are'} waiting for your approval, and ${r.counts.progress} in progress.` : `No returns are waiting. ${r.counts.progress} in progress.`, link: ['#/my/returns', 'Open Returns'] };
  }
  if (/cancel/.test(t)) {
    const d = await api('/hub/overview', { query: { days: 30 } });
    const k = d.kpis.find((x) => x.key === 'cancel');
    return { text: `${k.value} cancellations in the last 30 days (${k.note}).`, link: ['#/my/orders?scope=all&group=cancelled&days=30', 'Open cancelled orders'] };
  }
  if (go) return { text: `Opening ${go.label || 'that page'}…`, go: go.path };
  const pages = (store.state.hubPages || []).filter((p) => t.split(/\s+/).some((w) => w.length > 2 && p.label.toLowerCase().includes(w))).slice(0, 4);
  if (pages.length) return { text: 'These pages match:', pages };
  return { text: 'I can answer questions about your spend, wallet, orders on the way, bills and returns, or take you to a booking. Try one of the examples below.' };
}

export function openAsk() {
  modal({
    title: 'Ask UT Log',
    body: `<form id="askF" class="ask-f"><span class="ask-ico">${icon('sparkle', 18)}</span><input class="input" id="askQ" autocomplete="off" placeholder="Ask about your spend, orders, bills, or book something"><button class="btn btn-primary" type="submit">Ask</button></form>
      <div id="askA" class="ask-a" aria-live="polite"></div>
      <div class="ask-ex">${EXAMPLES.map((e) => `<button type="button" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      <p class="muted small notop">Answers come from your own records using fixed rules. Nothing is sent outside UT Log.</p>`,
    onMount(el, close) {
      const input = el.querySelector('#askQ'); const out = el.querySelector('#askA');
      const run = async (q) => {
        if (!q.trim()) return;
        out.innerHTML = '<div class="skeleton" style="height:48px"></div>';
        try {
          const a = await answer(q);
          if (a.go) { close(); location.hash = a.go; return; }
          out.innerHTML = `<div class="ask-bubble"><p>${esc(a.text)}</p>${a.link ? `<a class="link" href="${esc(a.link[0])}" data-close>${esc(a.link[1])} →</a>` : ''}${a.pages ? `<div class="ask-pages">${a.pages.map((p) => `<a class="btn btn-outline btn-sm" href="${esc(p.path)}" data-close>${esc(p.label)}</a>`).join('')}</div>` : ''}</div>`;
        } catch (e) { out.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
      };
      el.querySelector('#askF').addEventListener('submit', (e) => { e.preventDefault(); run(input.value); });
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-ex]'); if (b) { input.value = b.dataset.ex; run(b.dataset.ex); } if (e.target.closest('a[data-close]')) close(); });
      setTimeout(() => input.focus(), 30);
    },
  });
}
