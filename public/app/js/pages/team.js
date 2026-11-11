// Team & roles: invite people by mobile or email; they join on next login.
import { api, html, raw, esc, date, toast, formData, modal } from '../core.js';

export async function renderTeam(view) {
  const d = await api('/team');
  const roleOpts = (sel) => d.roles.filter((r) => r.key !== 'owner').map((r) => `<option value="${r.key}" ${r.key === sel ? 'selected' : ''}>${esc(r.name || r.key)}</option>`).join('');
  view.innerHTML = html`
    <div class="page-head"><div><h1>Team & roles</h1><p>Give your team their own logins with just the access they need.</p></div>
      <button class="btn btn-primary" id="invite">+ Invite member</button></div>
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <div class="table-wrap"><table><thead><tr><th>Member</th><th>Contact</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody id="rows">
        ${raw(d.data.map((m) => `<tr data-key="${esc(m.key)}"><td><b>${esc(m.name || '—')}</b></td><td class="mono">${esc(m.contact || '')}</td>
          <td>${m.role === 'owner' ? '<span class="role-pill">Owner</span>' : `<select class="select" data-role style="width:auto">${roleOpts(m.role)}</select>`}</td>
          <td>${m.status === 'ACTIVE' ? '<span class="badge badge-green">Active</span>' : `<span class="badge badge-amber">Invited ${m.at ? date(m.at) : ''}</span>`}</td>
          <td>${m.role === 'owner' ? '' : '<button class="btn btn-danger btn-sm" data-remove>Remove</button>'}</td></tr>`).join(''))}
      </tbody></table></div>
      <section class="card"><h2>What each role can do</h2>${raw(d.roles.map((r) => `<div class="action-item" style="margin-bottom:8px"><span class="role-pill">${r.key}</span><span class="small">${esc(r.description)}</span></div>`).join(''))}
        <p class="muted small">The server enforces these: a blocked action returns an error even if someone calls the API directly.</p></section>
    </div>`;
  const again = () => renderTeam(view);
  const rows = view.querySelector('#rows');
  rows.addEventListener('change', async (e) => {
    if (!e.target.hasAttribute('data-role')) return;
    try { await api('/team/role', { method: 'POST', body: { key: e.target.closest('tr').dataset.key, role: e.target.value } }); toast('Role updated'); } catch (err) { toast(err.message, true); again(); }
  });
  rows.addEventListener('click', async (e) => {
    if (!e.target.hasAttribute('data-remove')) return;
    try { await api('/team/remove', { method: 'POST', body: { key: e.target.closest('tr').dataset.key } }); toast('Removed from team'); again(); } catch (err) { toast(err.message, true); }
  });
  view.querySelector('#invite').addEventListener('click', async () => {
    const r = await modal({
      title: 'Invite a team member',
      body: `<form class="form-grid" id="tf"><label class="field">Name<input class="input" name="name"></label><label class="field">Role<select class="select" name="role">${roleOpts('ops')}</select></label>
        <label class="field full">Mobile number or email<input class="input" name="contact" placeholder="9876543210 or name@company.com"></label></form>
        <p class="muted small" style="margin:0">They join your account automatically the next time they log in with this mobile or email.</p><p class="form-error" id="tErr"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="tGo">Send invite</button>',
      onMount: (el, close) => el.querySelector('#tGo').addEventListener('click', async () => {
        try { close(await api('/team/invite', { method: 'POST', body: formData(el.querySelector('#tf')) })); } catch (err) { el.querySelector('#tErr').textContent = err.message; }
      }),
    });
    if (r) { toast('Invite saved'); again(); }
  });
}
