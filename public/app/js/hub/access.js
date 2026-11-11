// Access Control: the admin decides what each role and person can do.
import { api, esc, store, toast, modal, withBusy, formData } from '../core.js';
import { tile } from './art.js';
import { filterBtn, openFilters, countActive } from './ui.js';

const LEVELS = [['none', 'None'], ['view', 'View'], ['manage', 'Manage']];
const seg = (attr, value) => `<div class="lvl" role="radiogroup">${LEVELS.map(([k, l]) => `<button type="button" ${attr} data-l="${k}" class="lvl--${k}" aria-pressed="${k === value}">${l}</button>`).join('')}</div>`;
const state = { role: null, group: '', tab: 'roles' };

export async function render(view) {
  if (store.state.user && store.state.user.role !== 'owner') { view.innerHTML = '<div class="card empty"><p>Only the account owner can change access.</p></div>'; return; }
  if (store.state.accountType !== 'business') { view.innerHTML = '<div class="card empty"><p>Access Control is part of a Business account.</p></div>'; return; }
  view.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const d = await api('/hub/access');
  if (!state.role || !d.roles.some((r) => r.key === state.role)) state.role = d.roles[0].key;
  const again = () => render(view);
  const fields = [{ key: 'group', label: 'Module group', options: [['', 'All groups'], ...[...new Set(d.modules.map((m) => m.group))].map((g) => [g, g])] }];
  const role = d.roles.find((r) => r.key === state.role);
  const mods = d.modules.filter((m) => !state.group || m.group === state.group);
  const groups = [...new Set(mods.map((m) => m.group))];
  view.innerHTML = `
    <div class="page-head"><div class="row head-t">${tile('shield', 'violet').value}<div><h1>Access Control</h1><p>Decide what each role and each person can see and do.</p></div></div><button class="btn btn-primary" id="newRole" type="button">+ New role</button></div>
    <nav class="tabs tabs--line">${[['roles', 'Roles and permissions'], ['people', 'People']].map(([k, l]) => `<button type="button" data-tab="${k}" class="${k === state.tab ? 'active' : ''}">${l}</button>`).join('')}</nav>
    ${state.tab === 'roles' ? `<div class="access">
      <aside class="card access__roles"><ul>${d.roles.map((r) => `<li><button type="button" data-role="${esc(r.key)}" class="${r.key === state.role ? 'on' : ''}"><b>${esc(r.name)}</b><small>${r.members} ${r.members === 1 ? 'person' : 'people'}${r.builtin ? '' : ' · Custom'}</small></button></li>`).join('')}</ul></aside>
      <section class="card"><div class="card__head"><div><h2 class="notop">${esc(role.name)}</h2><small class="muted">${esc(role.description || '')}</small></div><div class="row">${filterBtn(countActive(fields, state))}<button class="btn btn-outline btn-sm" data-preset="all" type="button">All manage</button><button class="btn btn-outline btn-sm" data-preset="view" type="button">All view</button>${role.builtin ? '' : '<button class="btn btn-danger btn-sm" id="delRole" type="button">Delete role</button>'}</div></div>
        ${groups.map((g) => `<h3 class="access__g">${esc(g)}</h3><ul class="access__mods">${mods.filter((m) => m.group === g).map((m) => `<li data-m="${m.key}"><span>${esc(m.label)}</span>${seg('data-role-level', role.perms[m.key] || 'none')}</li>`).join('')}</ul>`).join('')}
        <p class="muted small">Changes apply right away and are enforced on the server. <b>Manage</b> includes View. The owner always has full access.</p></section></div>` : `
      <div class="card"><div class="card__head"><h2 class="notop">People</h2><button class="btn btn-outline btn-sm" id="invite" type="button">+ Invite</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Role</th><th>Status</th><th>Custom access</th><th></th></tr></thead><tbody>${d.members.map((m) => `<tr data-k="${esc(m.key)}"><td><b>${esc(m.name || '—')}</b></td><td class="mono">${esc(m.contact || '')}</td><td>${m.role === 'owner' ? '<span class="badge badge-green">Owner</span>' : `<select class="select" data-set-role aria-label="Role">${d.roles.map((r) => `<option value="${esc(r.key)}" ${r.key === m.role ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`}</td><td>${m.status === 'ACTIVE' ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-amber">Invited</span>'}</td><td>${m.role === 'owner' || m.status !== 'ACTIVE' ? '—' : `<button class="link" data-custom type="button">${m.override_count ? `${m.override_count} changes` : 'Customise'}</button>`}</td><td>${m.role === 'owner' ? '' : '<button class="btn btn-danger btn-sm" data-remove type="button">Remove</button>'}</td></tr>`).join('')}</tbody></table></div></div>`}`;
  view.onclick = async (e) => {
    const t = e.target.closest('[data-tab]'); const r = e.target.closest('[data-role]'); const lv = e.target.closest('[data-role-level]'); const pr = e.target.closest('[data-preset]');
    try {
      if (t) { state.tab = t.dataset.tab; again(); return; }
      if (r) { state.role = r.dataset.role; again(); return; }
      if (e.target.closest('#flt')) { openFilters(e.target.closest('#flt'), fields, state, (v) => { state.group = v.group; again(); }); return; }
      if (lv) { const m = lv.closest('[data-m]').dataset.m; await api('/hub/access/role', { method: 'POST', body: { key: role.key, perms: { [m]: lv.dataset.l } } }); lv.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === lv))); toast('Permission saved'); return; }
      if (pr) { const level = pr.dataset.preset === 'all' ? 'manage' : 'view'; await api('/hub/access/role', { method: 'POST', body: { key: role.key, perms: Object.fromEntries(d.modules.map((m) => [m.key, level])) } }); toast('Permissions saved'); again(); return; }
      if (e.target.closest('#delRole')) { await api('/hub/access/role/delete', { method: 'POST', body: { key: role.key } }); toast('Role deleted'); state.role = null; again(); return; }
      if (e.target.closest('#newRole')) { newRole(d, (key) => { state.role = key; state.tab = 'roles'; again(); }); return; }
      if (e.target.closest('#invite')) { invite(d, again); return; }
      const row = e.target.closest('[data-k]');
      if (row && e.target.closest('[data-remove]')) { await api('/team/remove', { method: 'POST', body: { key: row.dataset.k } }); toast('Removed'); again(); return; }
      if (row && e.target.closest('[data-custom]')) customise(d, d.members.find((m) => m.key === row.dataset.k), again);
    } catch (x) { toast(x.message, true); }
  };
  view.onchange = async (e) => {
    if (e.target.dataset.setRole == null) return;
    try { await api('/team/role', { method: 'POST', body: { key: e.target.closest('[data-k]').dataset.k, role: e.target.value } }); toast('Role updated'); again(); } catch (x) { toast(x.message, true); again(); }
  };
}

function newRole(d, done) {
  modal({
    title: 'New role',
    body: `<form class="form-grid" id="rf" novalidate><label class="field full">Role name<input class="input" name="name" placeholder="e.g. Warehouse manager"></label><label class="field full">What is this role for?<input class="input" name="description"></label><label class="field full">Start from<select class="select" name="copy_from"><option value="">No access</option>${d.roles.map((r) => `<option value="${esc(r.key)}">${esc(r.name)}</option>`).join('')}</select></label></form><p class="form-error" id="e"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Create role</button>',
    onMount(el, close) { const go = el.querySelector('#go'); go.addEventListener('click', () => withBusy(go, async () => { try { const r = await api('/hub/access/role', { method: 'POST', body: formData(el.querySelector('#rf')) }); close(true); toast('Role created'); done(r.key); } catch (x) { el.querySelector('#e').textContent = x.message; } })); },
  });
}
function invite(d, done) {
  modal({
    title: 'Invite a person',
    body: `<form class="form-grid" id="f" novalidate><label class="field">Name<input class="input" name="name"></label><label class="field">Role<select class="select" name="role">${d.roles.map((r) => `<option value="${esc(r.key)}">${esc(r.name)}</option>`).join('')}</select></label><label class="field full">Mobile number or email<input class="input" name="contact"></label></form><p class="muted small notop">They join your account the next time they log in with this mobile or email.</p><p class="form-error" id="e"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Send invite</button>',
    onMount(el, close) { const go = el.querySelector('#go'); go.addEventListener('click', () => withBusy(go, async () => { try { await api('/team/invite', { method: 'POST', body: formData(el.querySelector('#f')) }); close(true); toast('Invite saved'); done(); } catch (x) { el.querySelector('#e').textContent = x.message; } })); },
  });
}
function customise(d, m, done) {
  const base = d.roles.find((r) => r.key === m.role);
  const cur = { ...m.overrides };
  modal({
    title: `Custom access for ${m.name || m.contact}`, wide: true,
    body: `<p class="muted notop">Starts from the ${esc(base.name)} role. Choices here apply only to this person.</p><ul class="access__mods">${d.modules.map((x) => `<li data-m="${x.key}"><span>${esc(x.label)}</span>${seg('data-p', cur[x.key] || base.perms[x.key] || 'none')}</li>`).join('')}</ul><p class="form-error" id="e"></p>`,
    footer: '<button class="btn btn-outline" id="reset" type="button">Reset to role</button><span class="spacer"></span><button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Save</button>',
    onMount(el, close) {
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; const k = b.closest('[data-m]').dataset.m; if (b.dataset.l === (base.perms[k] || 'none')) delete cur[k]; else cur[k] = b.dataset.l; b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
      const send = async (overrides) => { try { await api('/hub/access/member', { method: 'POST', body: { key: m.key, overrides } }); close(true); toast('Access saved'); done(); } catch (x) { el.querySelector('#e').textContent = x.message; } };
      el.querySelector('#go').addEventListener('click', () => send(cur));
      el.querySelector('#reset').addEventListener('click', () => send({}));
    },
  });
}
