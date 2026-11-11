// Reports: generate a CSV for a date range and download past reports.
import { api, html, raw, dateTime, date, statusBadge, emptyState, getToken, toast, daysAgo, isoDay, formData, withBusy } from '../core.js';

const TYPES = [['orders', 'Orders'], ['shipments', 'Shipments'], ['ndr', 'NDR'], ['returns', 'Returns & exchanges'], ['wallet', 'Wallet ledger'], ['rto_risk', 'RTO risk (open orders)'], ['activity', 'Activity log']];

export async function render(view, { query }) {
  const preset = query.get('type') || 'orders';
  view.innerHTML = html`
    <div class="page-head"><div><h1>Reports</h1><p>Download CSV reports for any date range.</p></div></div>
    <form class="card toolbar" id="genForm" style="margin-bottom:16px">
      <select class="select" name="type" aria-label="Report type">${raw(TYPES.map(([k, l]) => `<option value="${k}" ${k === preset ? 'selected' : ''}>${l}</option>`).join(''))}</select>
      <input class="input" type="date" name="from" value="${daysAgo(29)}" aria-label="From"><span class="muted">to</span>
      <input class="input" type="date" name="to" value="${isoDay(Date.now())}" aria-label="To">
      <button class="btn btn-primary">Generate report</button>
    </form>
    <div class="table-wrap"><table><thead><tr><th>Report</th><th>Date range</th><th>Requested</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;

  async function load() {
    const res = await api('/reports/all', { query: { per_page: 50 } });
    view.querySelector('#rows').innerHTML = res.data.length ? res.data.map((r) => html`<tr>
      <td><b>${r.title}</b></td><td>${r.from ? date(r.from) : '—'} – ${r.to ? date(r.to) : '—'}</td><td>${dateTime(r.created_at)}</td><td>${statusBadge(r.status)}</td>
      <td><button class="btn btn-outline btn-sm" data-dl="${r.id}">Download CSV</button></td></tr>`).join('')
      : `<tr><td colspan="5">${emptyState('No reports yet. Generate one above.', 'file').value}</td></tr>`;
  }

  view.querySelector('#genForm').addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(e.submitter, async () => {
      try { await api('/reports/generate', { method: 'POST', body: formData(e.target) }); toast('Report ready'); load(); }
      catch (err) { toast(err.message, true); }
    });
  });

  // Downloads go through fetch so the bearer token is sent, then save as a blob.
  view.querySelector('#rows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dl]');
    if (!b) return;
    const res = await fetch('/v1/reports/download?id=' + b.dataset.dl, { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!res.ok) { toast('Download failed', true); return; }
    const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = name ? name[1] : 'report.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  load();
}
