// Spending insights with budgets, and the rewards page.
import { api, esc, money, toast, modal, withBusy, dateTime } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';
import { ART } from './wallet-art.js';
import './svc-hero.js';
import { bars, refresh, SECTION_LABEL, SECTION_ICON, filterBtn, openFilters, countActive, moneyTabs } from './ui.js';

const bf = { show: '' };
const BF = [{ key: 'show', label: 'Show', options: [['', 'All services'], ['set', 'With a budget'], ['near', 'At 80% or more'], ['spent', 'With spending this month']] }];
const hf = { kind: '' };
const HF = [{ key: 'kind', label: 'Show', options: [['', 'All'], ['in', 'Points earned'], ['out', 'Points used']] }];

// Colours by meaning, the same as the New order page.
const MIX = ['#0e7c66', '#1f6fd1', '#d99a00', '#6250d6', '#e8590c', '#cc3f77', '#18874a', '#8a9a95', '#0b3f86'];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PART_ICON = { Morning: 'sun', Afternoon: 'sun', Evening: 'moon', Night: 'moon' };
const TONE_ICON = { caution: 'alert', save: 'tag', info: 'info', good: 'check' };
let period = 30;
const short = (n) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `₹${Math.round(n)}`);

// Money in and out, grouped bars for six months.
function flowChart(months) {
  const max = Math.max(1, ...months.flatMap((m) => [m.in, m.out]));
  const W = 560; const H = 180; const pad = 26; const gw = (W - pad) / months.length; const bw = Math.min(22, gw / 3);
  const y = (v) => H - 22 - (v / max) * (H - 40);
  const grid = [0.25, 0.5, 0.75, 1].map((f) => `<line x1="${pad}" x2="${W}" y1="${y(max * f)}" y2="${y(max * f)}" class="ins-gl"/><text x="0" y="${y(max * f) + 4}" class="ins-ax">${short(max * f)}</text>`).join('');
  const bars = months.map((m, i) => { const x = pad + i * gw + gw / 2; return `<g class="ins-bar" style="--i:${i}"><rect x="${x - bw - 2}" y="${y(m.in)}" width="${bw}" height="${H - 22 - y(m.in)}" rx="4" class="ins-in"><title>${m.month}: in ₹${m.in.toLocaleString('en-IN')}</title></rect><rect x="${x + 2}" y="${y(m.out)}" width="${bw}" height="${H - 22 - y(m.out)}" rx="4" class="ins-out"><title>${m.month}: out ₹${m.out.toLocaleString('en-IN')}</title></rect><text x="${x}" y="${H - 4}" text-anchor="middle" class="ins-ax">${m.month}</text></g>`; }).join('');
  return `<svg class="ins-flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="Money in and out by month">${grid}${bars}</svg>`;
}
function mixDonut(rows, total) {
  if (!total) return '<p class="muted notop">Nothing spent in this period.</p>';
  const R = 52; const C = 2 * Math.PI * R; let off = 0;
  const arcs = rows.map((r, i) => { const len = (r.amount / total) * C; const a = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${MIX[i % MIX.length]}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" style="--d:${i * 90}ms"/>`; off += len; return a; }).join('');
  return `<div class="ins-mix"><div class="wl-donut"><svg viewBox="0 0 140 140" aria-hidden="true"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--surface-2, #eef2f1)" stroke-width="18"/><g transform="rotate(-90 70 70)">${arcs}</g></svg><div class="wl-donut__c"><small>Spent</small><b translate="no">${esc(money(total))}</b></div></div>
    <ul class="wl-legend">${rows.map((r, i) => `<li style="--i:${i}"><i style="background:${MIX[i % MIX.length]}"></i><span>${esc(r.label)}</span><b translate="no">${esc(money(r.amount))}</b><small>${Math.round((r.amount / total) * 100)}%</small></li>`).join('')}</ul></div>`;
}
const ring = (pct, tone) => { const R = 22; const C = 2 * Math.PI * R; return `<svg class="ins-ring ins-ring--${tone}" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="${R}" class="ins-ring__bg"/><circle cx="27" cy="27" r="${R}" class="ins-ring__fg" stroke-dasharray="${(Math.min(100, pct) / 100) * C} ${C}" transform="rotate(-90 27 27)"/><text x="27" y="31" text-anchor="middle">${pct}%</text></svg>`; };

export async function renderInsights(view) {
  view.innerHTML = '<div class="skeleton" style="height:260px"></div>';
  const [d, m] = await Promise.all([api('/hub/insights'), api('/hub/insights/more', { query: { days: period } })]);
  const budgetTotal = d.rows.reduce((s, r) => s + (r.budget || 0), 0);
  const up = m.change != null && m.change > 0;
  const peak = Math.max(...m.weekday); const peakDay = m.weekday.indexOf(peak);
  const partsTotal = Object.values(m.parts).reduce((s, v) => s + v, 0);
  view.innerHTML = `${moneyTabs('insights')}
    <div class="page-head wl2-head"><div class="row head-t">${tile('dashboard', 'blue').value}<div><h1>Insights</h1><p>Where your money goes, when, and to whom, with budgets to keep it on track.</p></div></div>
      <nav class="wl-seg ins-period" aria-label="Period">${[[7, '7 days'], [30, '30 days'], [90, '90 days']].map(([k, l]) => `<a href="#/insights" data-days="${k}" class="${k === period ? 'on' : ''}">${l}</a>`).join('')}</nav></div>

    <div class="wl2-kpis">
      <section class="card wl2-k" style="--i:0"><span class="wl2-art">${ART.out}</span><div class="wl2-k__top"><span class="wl2-k__ico wl2-k__ico--out">${icon('trend', 17)}</span><span>Spent · ${m.days} days</span></div>
        <b class="wl2-k__v" translate="no" data-count="${m.spent}" data-fmt="money">${esc(money(m.spent))}</b>
        ${m.change != null ? `<span class="ins-delta ins-delta--${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(m.change)}% vs previous ${m.days} days</span>` : '<small class="wl2-k__n">No earlier period to compare</small>'}</section>
      <section class="card wl2-k" style="--i:1"><div class="wl2-k__top"><span class="wl2-k__ico">${icon('calendar', 17)}</span><span>Month-end forecast</span></div>
        <b class="wl2-k__v" translate="no" data-count="${d.projected}" data-fmt="money">${esc(money(d.projected))}</b>
        <small class="wl2-k__n">${esc(money(d.mtd))} spent so far this month</small>
        ${budgetTotal ? `<span class="ins-delta ins-delta--${d.projected > budgetTotal ? 'up' : 'down'}">${d.projected > budgetTotal ? `${esc(money(d.projected - budgetTotal))} over` : `${esc(money(budgetTotal - d.projected))} under`} your budgets</span>` : '<small class="wl2-k__n">Set budgets below to track this</small>'}</section>
      <section class="card wl2-k" style="--i:2"><div class="wl2-k__top"><span class="wl2-k__ico wl2-k__ico--pts">${icon('receipt', 17)}</span><span>Average payment</span></div>
        <b class="wl2-k__v" translate="no" data-count="${m.avg}" data-fmt="money">${esc(money(m.avg))}</b><small class="wl2-k__n">${m.count} ${m.count === 1 ? 'payment' : 'payments'} in ${m.days} days</small>
        ${m.biggest ? `<small class="wl2-k__n">Largest: ${esc(money(m.biggest.amount))} · ${esc(m.biggest.provider)}</small>` : ''}</section>
      <section class="card wl2-k ins-k--save" style="--i:3"><span class="wl2-art">${ART.in}</span><div class="wl2-k__top"><span class="wl2-k__ico wl2-k__ico--in">${icon('sparkle', 17)}</span><span>Saved so far</span></div>
        <b class="wl2-k__v" translate="no" data-count="${m.saved}" data-fmt="money">${esc(money(m.saved))}</b><small class="wl2-k__n">With coupons and points</small>
        ${m.earned ? `<small class="wl2-k__n">+${m.earned.toLocaleString('en-IN')} points in ${m.days} days</small>` : ''}</section>
    </div>

    <div class="ins-grid">
      <section class="card ins-card"><div class="ins-h"><div><h2 class="notop">Money in and out</h2><small>Your wallet, last 6 months</small></div><div class="ins-leg"><span><i class="ins-in"></i>In</span><span><i class="ins-out"></i>Out</span></div></div>${flowChart(m.months)}
        <p class="ins-foot">${(() => { const l = m.months[m.months.length - 1]; const net = l.in - l.out; return `This month: <b class="${net >= 0 ? 'ins-pos' : 'ins-neg'}">${net >= 0 ? '+' : '−'}${esc(money(Math.abs(net)))}</b> net (${esc(money(l.in))} in, ${esc(money(l.out))} out)`; })()}</p></section>
      <section class="card ins-card"><div class="ins-h"><div><h2 class="notop">Where it went</h2><small>By service · ${m.days} days</small></div></div>${mixDonut(m.mix, m.spent)}</section>

      <section class="card ins-card"><div class="ins-h"><div><h2 class="notop">Daily spend</h2><small>Last 30 days</small></div></div><div id="b30"></div></section>
      <section class="card ins-card"><div class="ins-h"><div><h2 class="notop">When you spend</h2><small>${peak ? `Most on ${WEEK[peakDay]}s` : 'No spending in this period'}</small></div></div>
        <div class="ins-week">${m.weekday.map((v, i) => `<div class="ins-wd ${i === peakDay && peak ? 'peak' : ''}" style="--i:${i}"><span class="ins-wd__bar"><i style="height:${peak ? Math.max(4, Math.round((v / peak) * 100)) : 4}%"></i></span><small>${WEEK[i][0]}</small></div>`).join('')}</div>
        <div class="ins-parts">${Object.entries(m.parts).map(([k, v]) => `<div class="ins-part">${icon(PART_ICON[k], 16)}<span><b>${partsTotal ? Math.round((v / partsTotal) * 100) : 0}%</b><small>${k}</small></span></div>`).join('')}</div></section>

      <section class="card ins-card"><div class="ins-h"><div><h2 class="notop">What we noticed</h2><small>From your own payments</small></div></div>
        <ul class="ins-notes">${m.notes.map((n, i) => `<li class="ins-note ins-note--${n.tone}" style="--i:${i}"><span class="ins-note__ico">${icon(TONE_ICON[n.tone] === 'tag' ? 'tag' : n.icon || TONE_ICON[n.tone], 16)}</span><div class="grow"><b>${esc(n.title)}</b><small>${esc(n.text)}</small></div>${n.href ? `<a class="link small" href="${esc(n.href)}">Open</a>` : ''}</li>`).join('')}</ul></section>
      <section class="card ins-card"><div class="ins-h"><div><h2 class="notop">Who you pay most</h2><small>Top providers · ${m.days} days</small></div></div>
        ${m.providers.length ? `<ol class="ins-prov">${m.providers.map((p, i) => `<li style="--i:${i}"><span class="ins-prov__n">${i + 1}</span>${tile(SECTION_ICON[p.section] || 'parcel', 'plain').value}<div class="grow"><div class="ins-prov__t"><b>${esc(p.name)}</b><span translate="no">${esc(money(p.amount))}</span></div><span class="ins-prov__bar"><i style="width:${Math.max(3, p.share)}%"></i></span><small>${p.count} ${p.count === 1 ? 'payment' : 'payments'} · avg ${esc(money(p.avg))} · ${p.share}%</small></div></li>`).join('')}</ol>` : '<p class="muted notop">No payments in this period.</p>'}</section>
    </div>

    <section class="card ins-card ins-upc"><div class="ins-h"><div><h2 class="notop">Coming up</h2><small>Next 30 days${m.upcoming.length ? ` · ${esc(money(m.upcoming_total))} in total` : ''}</small></div><a class="link small" href="#/autopay">Manage auto-pay</a></div>
      ${m.upcoming.length ? `<ul class="ins-due">${m.upcoming.map((u, i) => `<li style="--i:${i}" class="${u.days <= 3 ? 'soon' : ''}">${tile(u.type === 'mobile' ? 'phone' : u.type === 'transfer' ? 'rupee' : 'bill', u.days <= 3 ? 'amber' : 'blue').value}<div class="grow"><b>${esc(u.provider)}</b><small>${esc(u.label)} · ${u.auto ? 'Auto-pay' : 'Reminder'}</small></div><span class="ins-due__d">${u.days ? `In ${u.days} day${u.days === 1 ? '' : 's'}` : 'Today'}</span><b translate="no">${esc(money(u.amount))}</b></li>`).join('')}</ul>` : '<p class="muted notop">Nothing due. Connect a bill or number in Auto-pay to see due dates here.</p>'}</section>

    <section class="card ins-card"><div class="ins-h"><div><h2 class="notop">Monthly budgets</h2><small>Get an alert at 80%. Suggestions use your last 3 months.</small></div>${filterBtn(countActive(BF, bf))}</div>
      <div class="ins-budgets">${d.rows.filter((r) => (bf.show === 'set' ? r.budget : bf.show === 'near' ? r.budget && r.mtd >= r.budget * 0.8 : bf.show === 'spent' ? r.mtd : true)).map((r, i) => {
        const pct = r.budget ? Math.round((r.mtd / r.budget) * 100) : 0; const tone = !r.budget ? 'none' : pct >= 100 ? 'stop' : pct >= 80 ? 'caution' : 'go';
        const sug = m.suggest[r.section];
        return `<div class="ins-bud ins-bud--${tone}" style="--i:${i}">${r.budget ? ring(pct, tone) : `<span class="ins-bud__ico">${tile(SECTION_ICON[r.section], 'plain').value}</span>`}<div class="grow"><b>${esc(SECTION_LABEL[r.section])}</b><small translate="no">${esc(money(r.mtd))} spent${r.budget ? ` of ${esc(money(r.budget))}` : ' · no budget'}</small>${tone === 'stop' ? '<em class="ins-bud__s">Over budget</em>' : tone === 'caution' ? '<em class="ins-bud__s">Close to the limit</em>' : ''}</div>
          <div class="ins-bud__set"><label class="ins-bud__in"><span>₹</span><input inputmode="numeric" data-b="${r.section}" value="${r.budget || ''}" placeholder="Budget" aria-label="${esc(SECTION_LABEL[r.section])} monthly budget"></label>${sug && sug !== r.budget ? `<button class="link small" type="button" data-sug="${r.section}" data-v="${sug}">Use ${esc(money(sug))}</button>` : ''}</div></div>`;
      }).join('')}</div></section>`;
  bars(view.querySelector('#b30'), d.series, 'Daily spend');
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, BF, bf, (v) => { bf.show = v.show; renderInsights(view); }));
  const save = async (section, amount) => { try { await api('/hub/budgets', { method: 'POST', body: { section, amount } }); toast('Budget saved'); refresh(); renderInsights(view); } catch (e) { toast(e.message, true); } };
  view.querySelectorAll('[data-b]').forEach((i) => i.addEventListener('change', () => save(i.dataset.b, i.value.replace(/\D/g, ''))));
  view.querySelectorAll('[data-sug]').forEach((b) => b.addEventListener('click', () => save(b.dataset.sug, b.dataset.v)));
  view.querySelectorAll('[data-days]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); period = Number(a.dataset.days); renderInsights(view); }));
}

// Tier medals: ribbon and face colours.
const TIER_LOOK = { Silver: ['#9aa7a2', '#e4ebe8'], Gold: ['#e6a23c', '#fff1c7'], Platinum: ['#6b7591', '#e3e8f5'] };
const EARN = [['bike', 'green', 'Book a delivery', 'Vehicle, courier and truck bookings', '#/new-order'], ['plane', 'blue', 'Travel', 'Flights, trains, buses and stays', '#/book-pay'], ['bill', 'amber', 'Pay bills and recharges', 'Every bill paid from your wallet', '#/pay/bills'], ['cart', 'violet', 'Ship website orders', 'Orders from your online store', '#/my/orders?section=website']];
export async function renderRewards(view) {
  view.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const r = await api('/hub/rewards');
  const next = r.tier.next;
  const pct = next ? Math.min(100, Math.round((r.tier.spend / next.at) * 100)) : 100;
  const rate = (r.tiers.find((t) => t.name === r.tier.name) || {}).rate || 1;
  const cur = r.tiers.findIndex((t) => t.name === r.tier.name);
  const list = r.history.filter((h) => (hf.kind === 'in' ? h.points > 0 : hf.kind === 'out' ? h.points < 0 : true));
  view.innerHTML = `${moneyTabs('rewards')}
    <div class="page-head wl2-head"><div class="row head-t">${tile('gift', 'amber').value}<div><h1>Rewards</h1><p>Earn points on every prepaid payment. 1 point is worth ₹1 in your wallet.</p></div></div></div>

    <div class="rw-top">
      <section class="card wl2-k rw-pts" style="--i:0"><span class="wl2-art rw-art">${ART.points}</span>
        <div class="wl2-k__top"><span class="wl2-k__ico wl2-k__ico--pts">${icon('star', 17)}</span><span>Your points</span></div>
        <b class="wl2-k__v rw-pts__v" data-count="${r.points}">${r.points.toLocaleString('en-IN')}</b>
        <small class="wl2-k__n">Worth <b translate="no">${esc(money(r.points))}</b> · you earn ${rate} ${rate === 1 ? 'point' : 'points'} per ₹100</small>
        <button class="btn btn-primary wl2-add" id="redeem" type="button" ${r.points < 100 ? 'disabled' : ''}>${icon('wallet', 16)}Move to wallet</button>
        ${r.points < 100 ? '<small class="wl2-k__n">You can move points once you have 100.</small>' : ''}
      </section>

      <section class="card rw-tiers" style="--i:1">
        <div class="rw-tiers__h"><div><h2 class="notop">Membership</h2><small>Based on what you spend in 90 days</small></div><span class="wl2-tier">${esc(r.tier.name)}</span></div>
        <ol class="rw-steps">${r.tiers.map((t, i) => { const [tone, face] = TIER_LOOK[t.name] || TIER_LOOK.Silver; return `<li class="${i < cur ? 'done' : i === cur ? 'on' : ''}" style="--i:${i}"><span class="rw-medal">${ART.medal(tone, face)}</span><b>${esc(t.name)}</b><small>${t.at ? `${esc(money(t.at))} spend` : 'Start here'}</small><em>${t.rate} pts / ₹100</em></li>`; }).join('')}</ol>
        <div class="rw-track"><span class="rw-track__bar"><i style="width:${pct}%"></i></span><small>${next ? `<b translate="no">${esc(money(r.tier.spend))}</b> spent · <b translate="no">${esc(money(next.need))}</b> more to reach ${esc(next.name)}` : 'You are at the top tier. Enjoy the best earn rate.'}</small></div>
      </section>

      <section class="card wl2-k rw-saved" style="--i:2"><span class="wl2-art">${ART.in}</span>
        <div class="wl2-k__top"><span class="wl2-k__ico wl2-k__ico--in">${icon('sparkle', 17)}</span><span>You have saved</span></div>
        <b class="wl2-k__v" translate="no" data-count="${r.saved}" data-fmt="money">${esc(money(r.saved))}</b>
        <small class="wl2-k__n">With coupons and points so far</small>
      </section>
    </div>

    <div class="dash dash--even wl2-main">
      <div class="rw-left">
        <section class="card"><div class="rw-sec-h"><span class="rw-sec-art">${ART.gift}</span><div><h2 class="notop">Coupons</h2><small>Copy a code and use it at checkout</small></div></div>
          <ul class="rw-coupons">${r.coupons.map((c, i) => `<li class="rw-cp ${c.used ? 'used' : ''}" style="--i:${i}"><div class="rw-cp__l"><code translate="no">${esc(c.code)}</code><small>${c.used ? 'Used' : c.sections ? c.sections.map((s) => SECTION_LABEL[s] || s).join(', ') : 'All services'}</small></div><div class="rw-cp__r"><span>${esc(c.label)}</span>${c.used ? '<em class="rw-cp__used">Used</em>' : `<button class="btn btn-outline btn-sm" type="button" data-copy-code="${esc(c.code)}">${icon('tag', 14)}Copy</button>`}</div></li>`).join('')}</ul></section>
        <section class="card"><h2 class="notop">Ways to earn</h2><ul class="rw-earn">${EARN.map(([ic, tone, t, sub, h], i) => `<li style="--i:${i}"><a href="${h}">${tile(ic, tone).value}<span class="grow"><b>${esc(t)}</b><small>${esc(sub)}</small></span><em>+${rate} / ₹100</em>${icon('chevron', 15)}</a></li>`).join('')}</ul></section>
      </div>
      <section class="card rw-hist"><div class="card__head"><h2 class="notop">Points history</h2>${filterBtn(countActive(HF, hf))}</div>
        ${list.length ? `<ul class="rw-feed">${list.map((h, i) => `<li style="--i:${i}"><span class="rw-feed__ico ${h.points > 0 ? 'in' : 'out'}">${icon(h.points > 0 ? 'plus' : 'wallet', 15)}</span><div class="grow"><b>${esc(h.note)}</b><small>${esc(dateTime(h.at))}</small></div><em class="${h.points > 0 ? 'in' : 'out'}">${h.points > 0 ? '+' : ''}${h.points.toLocaleString('en-IN')}</em></li>`).join('')}</ul>` : `<div class="wl-empty"><span class="wl2-emptyart">${ART.empty}</span><b>No points activity here</b><small>Book or pay from your wallet to start earning.</small></div>`}
      </section>
    </div>`;
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, HF, hf, (v) => { hf.kind = v.kind; renderRewards(view); }));
  view.querySelector('#redeem').addEventListener('click', () => modal({
    title: 'Move points to wallet',
    body: `<label class="field">Points to move (minimum 100)<input class="input" id="pts" inputmode="numeric" value="${r.points}"></label><p class="muted small notop">1 point = ₹1. Demo mode: no real money is added.</p><p class="form-error" id="err"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Move points</button>',
    onMount(el, close) {
      const go = el.querySelector('#go');
      go.addEventListener('click', () => withBusy(go, async () => { try { await api('/hub/rewards/redeem', { method: 'POST', body: { points: el.querySelector('#pts').value } }); close(true); toast('Points moved to your wallet'); refresh(); renderRewards(view); } catch (e) { el.querySelector('#err').textContent = e.message; } }));
    },
  }));
}
