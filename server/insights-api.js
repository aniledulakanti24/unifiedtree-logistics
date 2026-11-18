// Wallet insights: spend for a chosen period against the one before, money in and out by month,
// when you spend, who you pay, what is coming up, and plain-language observations. Read-only.
'use strict';

const SECTION_KEYS = ['vehicle', 'courier', 'logistics', 'international', 'travel', 'rides', 'recharge', 'bills', 'business'];
const LABEL = { vehicle: 'Vehicle', courier: 'Courier', logistics: 'Logistics', international: 'International', travel: 'Travel & stay', rides: 'Local rides', recharge: 'Recharge', bills: 'Bills', business: 'Business payments' };

module.exports = function register(routes, { send }, ctx, hubCtx) {
  const { day } = ctx;
  const { hub, live, upcomingOf } = hubCtx;
  const sum = (a, f = (r) => r.amount) => a.reduce((s, r) => s + (f(r) || 0), 0);

  routes['GET /v1/hub/insights/more'] = hub(({ res, url, db, h }) => {
    const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
    const now = Date.now();
    const paid = h.records.map(live).filter((r) => r.status !== 'CANCELLED');
    const within = (from, to) => paid.filter((r) => { const t = Date.parse(r.at); return t >= from && t < to; });
    const cur = within(now - days * day, now + 1);
    const prev = within(now - 2 * days * day, now - days * day);
    const spent = sum(cur); const before = sum(prev);

    // Spend mix for the period.
    const mix = SECTION_KEYS.map((k) => ({ section: k, label: LABEL[k], amount: sum(cur.filter((r) => r.section === k)) })).filter((x) => x.amount).sort((a, b) => b.amount - a.amount);

    // Money in and out of the wallet, by month, for 6 months.
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - i);
      const end = new Date(d); end.setMonth(end.getMonth() + 1);
      const rows = (db.wallet || []).filter((t) => { const x = Date.parse(t.at); return x >= d.getTime() && x < end.getTime(); });
      months.push({ month: d.toLocaleString('en-IN', { month: 'short' }), in: sum(rows.filter((t) => t.type === 'credit')), out: sum(rows.filter((t) => t.type === 'debit')) });
    }

    // When you spend: weekday and time of day (period).
    const weekday = Array(7).fill(0); const parts = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
    cur.forEach((r) => { const d = new Date(r.at); weekday[d.getDay()] += r.amount; const hr = d.getHours(); parts[hr < 5 ? 'Night' : hr < 12 ? 'Morning' : hr < 17 ? 'Afternoon' : hr < 22 ? 'Evening' : 'Night'] += r.amount; });

    // Who you pay most (period).
    const byP = {};
    cur.forEach((r) => { const p = byP[r.provider] || (byP[r.provider] = { name: r.provider, section: r.section, amount: 0, count: 0 }); p.amount += r.amount; p.count++; });
    const providers = Object.values(byP).sort((a, b) => b.amount - a.amount).slice(0, 5).map((p) => ({ ...p, avg: Math.round(p.amount / p.count), share: spent ? Math.round((p.amount / spent) * 100) : 0 }));

    // Coming up in the next 30 days.
    const upcoming = upcomingOf(h).filter((u) => u.days <= 30).slice(0, 6);

    // Observations, each with its meaning (caution, save, info, good).
    const notes = [];
    if (before) { const pct = Math.round(((spent - before) / before) * 100); if (Math.abs(pct) >= 5) notes.push(pct > 0 ? { tone: 'caution', icon: 'trend', title: `Spending is up ${pct}%`, text: `${days} days: ₹${spent.toLocaleString('en-IN')} against ₹${before.toLocaleString('en-IN')} before.` } : { tone: 'save', icon: 'trend', title: `Spending is down ${-pct}%`, text: `You spent ₹${(before - spent).toLocaleString('en-IN')} less than the ${days} days before.` }); }
    const big = [...cur].sort((a, b) => b.amount - a.amount)[0];
    if (big && spent && big.amount / spent >= 0.3) notes.push({ tone: 'info', icon: 'alert', title: `One payment was ${Math.round((big.amount / spent) * 100)}% of the total`, text: `${big.title} with ${big.provider}, ₹${big.amount.toLocaleString('en-IN')}.` });
    const weekend = weekday[0] + weekday[6];
    if (spent && weekend / spent >= 0.4) notes.push({ tone: 'info', icon: 'calendar', title: 'Weekends cost more', text: `${Math.round((weekend / spent) * 100)}% of your spending falls on Saturday and Sunday.` });
    // A cheaper provider you have already used for the same service.
    for (const k of ['courier', 'vehicle', 'logistics', 'rides']) {
      const rows = cur.filter((r) => r.section === k);
      const per = {}; rows.forEach((r) => { (per[r.provider] = per[r.provider] || []).push(r.amount); });
      const avgs = Object.entries(per).filter(([, a]) => a.length).map(([p, a]) => [p, a.reduce((s, x) => s + x, 0) / a.length, a.length]);
      if (avgs.length >= 2) {
        avgs.sort((a, b) => a[1] - b[1]);
        const [cheap, lo] = avgs[0]; const [dear, hi, n] = avgs[avgs.length - 1];
        if (hi > lo * 1.2) { notes.push({ tone: 'save', icon: 'tag', title: `${cheap} costs less for ${LABEL[k].toLowerCase()}`, text: `About ₹${Math.round(hi - lo).toLocaleString('en-IN')} less per booking than ${dear}, which you used ${n} times.`, href: k === 'rides' ? '#/rides' : `#/new-order?type=${k}` }); break; }
      }
    }
    const spendDays = new Set(within(now - 30 * day, now + 1).map((r) => new Date(r.at).toDateString())).size;
    notes.push({ tone: 'good', icon: 'check', title: `${30 - spendDays} no-spend days this month`, text: `You paid for something on ${spendDays} of the last 30 days.` });
    const earned = sum(h.rewards.history.filter((x) => x.points > 0 && Date.parse(x.at) >= now - days * day), (x) => x.points);
    if (earned) notes.push({ tone: 'save', icon: 'star', title: `${earned.toLocaleString('en-IN')} reward points earned`, text: `Worth ₹${earned.toLocaleString('en-IN')} in your wallet once you move them.`, href: '#/rewards' });

    // Suggested budgets: the average of the last three full months, plus 10%, rounded.
    const suggest = {};
    SECTION_KEYS.forEach((k) => {
      let total = 0;
      for (let i = 1; i <= 3; i++) { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - i); const end = new Date(d); end.setMonth(end.getMonth() + 1); total += sum(paid.filter((r) => r.section === k && Date.parse(r.at) >= d.getTime() && Date.parse(r.at) < end.getTime())); }
      const avg = total / 3; if (avg >= 100) suggest[k] = Math.ceil((avg * 1.1) / 100) * 100;
    });

    send(res, 200, { days, spent, before, change: before ? Math.round(((spent - before) / before) * 100) : null, count: cur.length, avg: cur.length ? Math.round(spent / cur.length) : 0,
      biggest: big ? { title: big.title, provider: big.provider, amount: big.amount, at: big.at } : null, saved: h.rewards.saved, earned, mix, months, weekday, parts, providers, upcoming, upcoming_total: sum(upcoming), notes, suggest });
  });
};
