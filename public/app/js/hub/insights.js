// Spending insights with budgets, and the rewards page.
import { api, esc, money, toast, modal, withBusy, dateTime } from '../core.js';
import { tile } from './art.js';
import { bars, refresh, SECTION_LABEL, SECTION_ICON, filterBtn, openFilters, countActive, moneyTabs } from './ui.js';

const bf = { show: '' };
const BF = [{ key: 'show', label: 'Show', options: [['', 'All services'], ['set', 'With a budget'], ['near', 'At 80% or more'], ['spent', 'With spending this month']] }];
const hf = { kind: '' };
const HF = [{ key: 'kind', label: 'Show', options: [['', 'All'], ['in', 'Points earned'], ['out', 'Points used']] }];

export async function renderInsights(view) {
  view.innerHTML = '<div class="skeleton" style="height:260px"></div>';
  const d = await api('/hub/insights');
  const change = d.prev30 ? Math.round(((d.last30 - d.prev30) / d.prev30) * 100) : null;
  const biggest = [...d.rows].sort((a, b) => b.last30 - a.last30)[0];
  const share = d.last30 && biggest ? Math.round((biggest.last30 / d.last30) * 100) : 0;
  const notes = [
    change != null && { icon: 'dashboard', tone: change > 0 ? 'coral' : 'green', title: `Spending is ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}%`, text: `${money(d.last30)} in the last 30 days, against ${money(d.prev30)} before that.` },
    share > 0 && { icon: SECTION_ICON[biggest.section], tone: 'blue', title: `${SECTION_LABEL[biggest.section]} is your biggest cost`, text: `${share}% of the last 30 days. Compare providers there first to save the most.` },
    d.top_provider && { icon: 'shield', tone: 'violet', title: `You use ${d.top_provider.name} the most`, text: `${money(d.top_provider.amount)} so far.` },
    { icon: 'gift', tone: 'amber', title: `Saved ${money(d.saved)} with coupons and points`, text: 'Apply them at checkout on any booking.' },
  ].filter(Boolean);
  view.innerHTML = `
    <div class="page-head"><div class="row head-t">${tile('dashboard', 'blue').value}<div><h1>Insights</h1><p>Where your money goes, and budgets to keep it on track.</p></div></div></div>${moneyTabs('insights')}
    <div class="grid grid-4">
      <div class="card stat"><span class="stat__label">This month</span><span class="stat__value" translate="no" data-count="${d.mtd}" data-fmt="money">${esc(money(d.mtd))}</span></div>
      <div class="card stat"><span class="stat__label">Projected month end</span><span class="stat__value" translate="no" data-count="${d.projected}" data-fmt="money">${esc(money(d.projected))}</span><span class="muted small">At your current pace</span></div>
      <div class="card stat"><span class="stat__label">Average booking</span><span class="stat__value" translate="no" data-count="${d.avg}" data-fmt="money">${esc(money(d.avg))}</span><span class="muted small">${d.count} bookings</span></div>
      <div class="card stat"><span class="stat__label">Pay on delivery share</span><span class="stat__value">${d.cod_share}%</span></div>
    </div>
    <div class="dash dash--even">
      <section class="card"><div class="card__head"><h2>Daily spend, last 30 days</h2></div><div id="b30"></div></section>
      <section class="card"><h2>What we noticed</h2><div class="attn">${notes.map((n) => `<div class="attn__card">${tile(n.icon, n.tone).value}<div><b>${esc(n.title)}</b><small>${esc(n.text)}</small></div></div>`).join('')}</div></section>
    </div>
    <section class="card mt"><div class="card__head"><div><h2 class="notop">Monthly budgets</h2><span class="muted small">Amounts in ₹. You get an alert at 80%.</span></div>${filterBtn(countActive(BF, bf))}</div>
      <div class="budgets">${d.rows.filter((r) => (bf.show === 'set' ? r.budget : bf.show === 'near' ? r.budget && r.mtd >= r.budget * 0.8 : bf.show === 'spent' ? r.mtd : true)).map((r) => { const pct = r.budget ? Math.min(100, Math.round((r.mtd / r.budget) * 100)) : 0; const tone = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : ''; return `<div class="budget">${tile(SECTION_ICON[r.section], 'plain').value}<div class="budget__m"><div class="budget__t"><b>${esc(SECTION_LABEL[r.section])}</b><span translate="no">${esc(money(r.mtd))}${r.budget ? ` of ${esc(money(r.budget))}` : ''}</span></div><span class="hbar__t ${tone}"><i style="width:${pct}%"></i></span>${tone ? `<small class="budget__s">${pct >= 100 ? 'Over budget' : `${pct}% used`}</small>` : ''}</div><input class="input" data-b="${r.section}" inputmode="numeric" value="${r.budget || ''}" placeholder="Set budget" aria-label="Budget for ${esc(SECTION_LABEL[r.section])}"></div>`; }).join('')}</div></section>`;
  bars(view.querySelector('#b30'), d.series, 'Daily spend');
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, BF, bf, (v) => { bf.show = v.show; renderInsights(view); }));
  view.querySelectorAll('[data-b]').forEach((i) => i.addEventListener('change', async () => {
    try { await api('/hub/budgets', { method: 'POST', body: { section: i.dataset.b, amount: i.value.replace(/\D/g, '') } }); toast('Budget saved'); refresh(); renderInsights(view); } catch (e) { toast(e.message, true); }
  }));
}

export async function renderRewards(view) {
  view.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const r = await api('/hub/rewards');
  const next = r.tier.next;
  const pct = next ? Math.min(100, Math.round((r.tier.spend / next.at) * 100)) : 100;
  view.innerHTML = `
    <div class="page-head"><div class="row head-t">${tile('gift', 'amber').value}<div><h1>Rewards</h1><p>Earn points on every prepaid payment. 1 point is worth ₹1.</p></div></div><button class="btn btn-primary" id="redeem" ${r.points < 100 ? 'disabled' : ''}>Move points to wallet</button></div>${moneyTabs('rewards')}
    <section class="reward-hero"><div><small>Available points</small><b data-count="${r.points}">${r.points.toLocaleString()}</b><p>${esc(r.tier.name)} member · ${r.tiers.find((t) => t.name === r.tier.name).rate} points per ₹100</p></div>
      <div class="reward-hero__t"><small>${next ? `Spend ${esc(money(next.need))} more in 90 days to reach ${esc(next.name)}` : 'You are at the top tier'}</small><span class="hbar__t"><i style="width:${pct}%"></i></span></div></section>
    <div class="dash dash--even mt">
      <section class="card"><h2>Coupons</h2><ul class="coupons">${r.coupons.map((c) => `<li class="${c.used ? 'used' : ''}"><code translate="no">${esc(c.code)}</code><span>${esc(c.label)}</span><small class="muted">${c.used ? 'Used' : c.sections ? c.sections.map((s) => SECTION_LABEL[s]).join(', ') : 'All services'}</small></li>`).join('')}</ul></section>
      <section class="card"><div class="card__head"><h2>Points history</h2>${filterBtn(countActive(HF, hf))}</div><ul class="feed">${r.history.filter((h) => (hf.kind === 'in' ? h.points > 0 : hf.kind === 'out' ? h.points < 0 : true)).map((h) => `<li><div class="feed__t"><b>${esc(h.note)}</b><small>${esc(dateTime(h.at))}</small></div><b class="${h.points > 0 ? 'pos' : ''}">${h.points > 0 ? '+' : ''}${h.points}</b></li>`).join('')}</ul></section>
    </div>`;
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, HF, hf, (v) => { hf.kind = v.kind; renderRewards(view); }));
  view.querySelector('#redeem').addEventListener('click', () => modal({
    title: 'Move points to wallet',
    body: `<label class="field">Points to move (minimum 100)<input class="input" id="pts" inputmode="numeric" value="${r.points}"></label><p class="muted small notop">Demo mode: no real money is added.</p><p class="form-error" id="err"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Move points</button>',
    onMount(el, close) {
      const go = el.querySelector('#go');
      go.addEventListener('click', () => withBusy(go, async () => { try { await api('/hub/rewards/redeem', { method: 'POST', body: { points: el.querySelector('#pts').value } }); close(true); toast('Points moved to your wallet'); refresh(); renderRewards(view); } catch (e) { el.querySelector('#err').textContent = e.message; } }));
    },
  }));
}
