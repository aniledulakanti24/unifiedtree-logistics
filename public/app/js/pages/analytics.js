// Analytics dashboard: KPI cards vs. the previous period, orders/revenue
// trend, status split, courier performance and top states.
import { api, html, raw, money, esc, daysAgo, isoDay } from '../core.js';

const RANGES = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']];
const STATUS_COLORS = { ON_HOLD: '#F59E0B', NEW: '#F5B27A', READY_TO_SHIP: '#F0803C', PICKUP_SCHEDULED: '#0F5B45', IN_TRANSIT: '#12817A', DELIVERED: '#2F8F5B', RTO: '#DC2626', CANCELLED: '#D9CDB3' };

export async function render(view, { query }) {
  const days = RANGES.some(([d]) => d === query.get('range')) ? query.get('range') : '30';
  const international = query.get('scope') === 'intl';
  const link = (patch) => '#/dashboard?' + new URLSearchParams({ range: days, ...(international && { scope: 'intl' }), ...patch });
  view.innerHTML = html`
    <div class="page-head"><div><h1>Numbers</h1><p>${international ? 'Export orders, couriers and destination countries.' : 'Domestic performance across all channels and couriers.'}</p></div>
      <div class="row"><div class="seg" id="scope"><button aria-pressed="${!international}" data-s="">Domestic</button><button aria-pressed="${international}" data-s="intl">International</button></div>
      <div class="seg" id="range">${raw(RANGES.map(([d, l]) => `<button aria-pressed="${d === days}" data-d="${d}">${l}</button>`).join(''))}</div></div></div>
    <div class="grid grid-4" id="cards">${raw('<div class="card"><div class="skeleton" style="height:56px"></div></div>'.repeat(4))}</div>
    <div class="grid grid-3" style="margin-top:16px">
      <section class="card span-2"><div class="row"><h2 style="margin:0">Orders & revenue</h2><span class="spacer"></span><div class="legend"><span><i style="background:#0F5B45"></i>Orders</span><span><i style="background:#E8A200"></i>Revenue</span></div></div><div id="trend"></div></section>
      <section class="card"><h2>Shipment status</h2><div id="donut"></div></section>
      <section class="card span-2"><h2>Courier performance</h2><div id="couriers"></div></section>
      <section class="card"><h2>${international ? 'Top countries' : 'Top states'}</h2><div id="states"></div></section>
    </div>`;
  view.querySelector('#range').addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) location.hash = link({ range: b.dataset.d }); });
  view.querySelector('#scope').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (b) location.hash = '#/dashboard?' + new URLSearchParams({ range: days, ...(b.dataset.s && { scope: 'intl' }) });
  });

  const d = await api('/dashboard/performance-overview', { query: { from_date: daysAgo(Number(days) - 1), to_date: isoDay(Date.now()), is_international: international ? 1 : '' } });
  const c = d.cards;
  const delta = (cur, prev) => {
    if (!prev) return '';
    const pct = Math.round(((cur - prev) / prev) * 100);
    return `<span class="delta ${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs previous</span>`;
  };
  const card = (label, value, extra = '') => `<div class="card stat"><span class="stat__label">${label}</span><span class="stat__value">${value}</span>${extra}</div>`;
  view.querySelector('#cards').innerHTML =
    card('Orders', c.orders.value.toLocaleString('en-IN'), delta(c.orders.value, c.orders.previous)) +
    card('Revenue', money(c.revenue.value), delta(c.revenue.value, c.revenue.previous)) +
    card('Delivery success', c.delivery_rate.value + '%', `<span class="muted small">NDR rate ${c.ndr_rate.value}%</span>`) +
    card('Avg. shipping cost', money(c.avg_shipping_cost.value), `<span class="muted small">COD share ${c.cod_share.value}%</span>`);

  view.querySelector('#trend').innerHTML = trendChart(d.series);
  view.querySelector('#donut').innerHTML = donut(d.status_split);
  view.querySelector('#couriers').innerHTML = d.couriers.length ? `<div class="table-wrap"><table><thead><tr><th>Courier</th><th>Shipments</th><th>Delivered</th><th>RTO</th><th>Delivery %</th><th>Freight</th></tr></thead><tbody>${
    d.couriers.map((x) => `<tr><td><b>${esc(x.courier)}</b></td><td>${x.shipments}</td><td>${x.delivered}</td><td>${x.rto}</td><td>${x.delivered + x.rto ? Math.round((x.delivered / (x.delivered + x.rto)) * 100) + '%' : '—'}</td><td>${money(x.freight)}</td></tr>`).join('')
  }</tbody></table></div>` : '<p class="muted">No shipments in this period.</p>';
  const maxState = Math.max(1, ...d.states.map((s) => s.orders));
  view.querySelector('#states').innerHTML = d.states.map((s) => `<div class="bar-row"><span>${esc(s.state)}</span><span class="bar"><i style="width:${(s.orders / maxState) * 100}%"></i></span><b>${s.orders}</b></div>`).join('') || '<p class="muted">No orders.</p>';
}

// Bars for orders, a line for revenue, each on its own scale.
function trendChart(series) {
  const W = 640, H = 220, P = { l: 30, r: 44, t: 10, b: 24 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const maxO = Math.max(1, ...series.map((s) => s.orders));
  const maxR = Math.max(1, ...series.map((s) => s.revenue));
  const bw = iw / series.length;
  const x = (i) => P.l + i * bw;
  const bars = series.map((s, i) => `<rect x="${x(i) + bw * 0.18}" y="${P.t + ih - (s.orders / maxO) * ih}" width="${bw * 0.64}" height="${(s.orders / maxO) * ih}" rx="2" fill="#0F5B45" opacity=".85"><title>${s.date}: ${s.orders} orders, ₹${s.revenue.toLocaleString('en-IN')}</title></rect>`).join('');
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(i) + bw / 2},${P.t + ih - (s.revenue / maxR) * ih}`).join(' ');
  const step = Math.ceil(series.length / 6);
  const labels = series.map((s, i) => (i % step === 0 ? `<text x="${x(i) + bw / 2}" y="${H - 6}" text-anchor="middle">${new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</text>` : '')).join('');
  const grid = [0, 0.5, 1].map((f) => `<line x1="${P.l}" x2="${W - P.r}" y1="${P.t + ih * (1 - f)}" y2="${P.t + ih * (1 - f)}" stroke="#E9EBF4"/><text x="${P.l - 6}" y="${P.t + ih * (1 - f) + 3}" text-anchor="end">${Math.round(maxO * f)}</text><text x="${W - P.r + 6}" y="${P.t + ih * (1 - f) + 3}">${f ? '₹' + compact(maxR * f) : ''}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Orders and revenue per day">${grid}${bars}<path d="${line}" fill="none" stroke="#E8A200" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${labels}</svg>`;
}
const compact = (n) => (n >= 1e5 ? (n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : Math.round(n));

function donut(split) {
  const total = split.reduce((s, x) => s + x.count, 0);
  if (!total) return '<p class="muted">No orders.</p>';
  const R = 60, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = split.filter((s) => s.count).map((s) => {
    const len = (s.count / total) * C;
    const a = `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${STATUS_COLORS[s.status]}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"><title>${s.status}: ${s.count}</title></circle>`;
    off += len;
    return a;
  }).join('');
  const legend = split.filter((s) => s.count).map((s) => `<span><i style="background:${STATUS_COLORS[s.status]}"></i>${s.status.replace(/_/g, ' ').toLowerCase()} · ${s.count}</span>`).join('');
  return `<svg viewBox="0 0 160 160" style="width:170px;height:170px;display:block;margin:0 auto 12px">${arcs}<text x="80" y="78" text-anchor="middle" style="font-size:22px;font-weight:800;fill:#17130D">${total}</text><text x="80" y="96" text-anchor="middle" style="font-size:11px;fill:#766C5C">orders</text></svg><div class="legend" style="justify-content:center">${legend}</div>`;
}
