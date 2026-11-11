// Orders detail, returns, weight management and feedback for the unified dashboard.
'use strict';
const crypto = require('crypto');
const access = require('./access');
const holidays = require('./holidays');
const { DESKS } = require('./desks');

const newId = (p) => p + Date.now().toString(36).toUpperCase().slice(-5) + crypto.randomBytes(2).toString('hex').toUpperCase();
const hash = (s) => crypto.createHash('md5').update(String(s)).digest().readUInt32BE(0);
const TRANSPORT = ['vehicle', 'courier', 'logistics', 'international'];
const REASONS = ['Receiver refused', 'Damaged in transit', 'Wrong item sent', 'Item not as described', 'Address not found', 'No longer needed', 'Other'];
// Demo clock, in seconds after approval.
const STAGES = [['APPROVED', 'Return approved', 0], ['PICKUP_SCHEDULED', 'Reverse pickup scheduled', 20], ['PICKED_UP', 'Picked up from receiver', 60], ['IN_TRANSIT', 'On the way back', 120], ['RECEIVED', 'Received back at origin', 200]];
const GROUP = { REQUESTED: 'requested', APPROVED: 'progress', PICKUP_SCHEDULED: 'progress', PICKED_UP: 'progress', IN_TRANSIT: 'progress', RECEIVED: 'completed', REJECTED: 'closed', CANCELLED: 'closed' };
const ROADMAP = [['app', 'Native Android and iOS apps'], ['voice', 'Voice search'], ['movers', 'Packers and movers'], ['pricelock', 'Price lock for flights'], ['approvals', 'Approval rules for team spending'], ['bulkbook', 'Bulk booking from a spreadsheet']];
const votes = require('./store').track('votes', new Map(ROADMAP.map(([id]) => [id, new Set()])));

module.exports = function register(routes, { send, users }, ctx, engine, hubCtx, bizCtx) {
  const { iso, day, credit, paginate, createTicket, memberships, invites } = ctx;
  const { hub, live, oops, text, takePayment } = hubCtx;
  const state = (h) => { if (!h.ops2) h.ops2 = { returns: [], policy: { window_days: 30, auto_approve: false }, weights: {}, profiles: [], feedback: [] }; return h.ops2; };

  // ---- returns --------------------------------------------------------------------------
  function view(rt) {
    if (['REQUESTED', 'REJECTED', 'CANCELLED'].includes(rt.status)) return { ...rt, group: GROUP[rt.status], timeline: rt.log };
    const elapsed = (Date.now() - rt.approved_at) / 1000;
    const reached = STAGES.filter((s) => elapsed >= s[2]);
    const cur = reached[reached.length - 1];
    return { ...rt, status: cur[0], label: cur[1], group: GROUP[cur[0]], progress: Math.min(1, elapsed / STAGES[STAGES.length - 1][2]), timeline: [...reached.map((s) => ({ label: s[1], at: iso(rt.approved_at + s[2] * 1000) })).reverse(), ...rt.log] };
  }
  const feeOf = (r) => Math.max(49, Math.round(r.amount * 0.85));
  const notify = (h, data) => bizCtx.notify(h, 'return.updated', data, '#/my/returns');
  function approve(db, h, rt) {
    takePayment(db, h, rt.fee, `Reverse shipment · ${rt.order_id}`);
    rt.status = 'APPROVED'; rt.label = 'Return approved'; rt.approved_at = Date.now();
    notify(h, { id: rt.id, title: 'Return approved', body: `${rt.order_id} · pickup is being arranged` });
  }
  const eligible = (h, s) => {
    const since = Date.now() - s.policy.window_days * day;
    const open = new Set(s.returns.filter((x) => !['REJECTED', 'CANCELLED'].includes(x.status)).map((x) => x.order_id));
    return h.records.map(live).filter((r) => TRANSPORT.includes(r.section) && r.group === 'delivered' && Date.parse(r.at) >= since && !open.has(r.id));
  };
  routes['GET /v1/hub/returns'] = hub(({ res, url, h }) => {
    const s = state(h);
    const group = url.searchParams.get('group');
    const q = (url.searchParams.get('search') || '').trim().toLowerCase();
    const deskF = DESKS[url.searchParams.get('desk')];
    const inDesk = (rt) => { if (!deskF) return true; const rec = h.records.find((x) => x.id === rt.order_id); return !!rec && deskF(rec); };
    let list = s.returns.filter(inDesk).map(view);
    const total = list.length;
    const counts = { all: list.length, requested: 0, progress: 0, completed: 0, closed: 0 };
    list.forEach((r) => { counts[r.group]++; });
    const reasons = {};
    list.forEach((r) => { reasons[r.reason] = (reasons[r.reason] || 0) + 1; });
    const delivered = h.records.map(live).filter((r) => TRANSPORT.includes(r.section) && r.group === 'delivered' && (!deskF || deskF(r))).length;
    if (group && group !== 'all') list = list.filter((r) => r.group === group);
    if (q) list = list.filter((r) => `${r.id} ${r.order_id} ${r.provider} ${r.reason}`.toLowerCase().includes(q));
    send(res, 200, { ...paginate(list, url), counts, reasons: Object.entries(reasons).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount), return_rate: delivered ? Math.round((total / delivered) * 100) : 0, reason_list: REASONS, policy: s.policy, eligible: eligible(h, s).filter((r) => !deskF || deskF(r)).map((r) => ({ id: r.id, title: r.title, provider: r.provider, sub: r.sub, amount: r.amount, fee: feeOf(r) })) });
  });
  routes['POST /v1/hub/returns'] = hub(({ res, body, db, h }) => {
    const s = state(h);
    const r = eligible(h, s).find((x) => x.id === body.order_id);
    if (!r) throw oops(400, 'That order cannot be returned. It must be delivered, within the return window, and not already returned.');
    if (!REASONS.includes(body.reason)) throw oops(400, 'Pick a reason for the return.');
    const type = body.type === 'exchange' ? 'exchange' : 'return';
    const rt = { id: newId('RT'), order_id: r.id, section: r.section, title: r.title, provider: r.provider, sub: r.sub, type, reason: body.reason, note: text(body.note, 400), fee: feeOf(r), status: 'REQUESTED', label: 'Waiting for approval', at: iso(Date.now()), log: [{ label: 'Return requested', at: iso(Date.now()) }] };
    if (s.policy.auto_approve) approve(db, h, rt);
    s.returns.unshift(rt);
    if (!s.policy.auto_approve) notify(h, { id: rt.id, title: 'New return request', body: `${rt.order_id} · ${rt.reason}` });
    send(res, 200, view(rt));
  });
  const findReturn = (h, id) => { const rt = state(h).returns.find((x) => x.id === id); if (!rt) throw oops(404, 'We could not find that return.'); return rt; };
  routes['POST /v1/hub/returns/approve'] = hub(({ res, body, db, h }) => {
    const rt = findReturn(h, body.id);
    if (rt.status !== 'REQUESTED') throw oops(400, 'This return has already been handled.');
    approve(db, h, rt);
    send(res, 200, { ...view(rt), wallet_balance: db.balance });
  });
  routes['POST /v1/hub/returns/reject'] = hub(({ res, body, h }) => {
    const rt = findReturn(h, body.id);
    if (rt.status !== 'REQUESTED') throw oops(400, 'This return has already been handled.');
    const note = text(body.note, 300);
    if (note.length < 5) throw oops(400, 'Add a short reason so the customer knows why.');
    rt.status = 'REJECTED'; rt.label = 'Rejected'; rt.reject_note = note; rt.log.unshift({ label: `Rejected: ${note}`, at: iso(Date.now()) });
    send(res, 200, view(rt));
  });
  routes['POST /v1/hub/returns/cancel'] = hub(({ res, body, db, h }) => {
    const rt = findReturn(h, body.id);
    const v = view(rt);
    if (!['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED'].includes(v.status)) throw oops(400, 'The parcel is already on its way back, so this return cannot be cancelled.');
    if (rt.approved_at) credit(db, rt.fee, `Refund · cancelled return ${rt.id}`);
    rt.status = 'CANCELLED'; rt.label = 'Cancelled'; rt.log = [{ label: 'Return cancelled', at: iso(Date.now()) }, ...v.timeline];
    send(res, 200, view(rt));
  });
  routes['POST /v1/hub/returns/policy'] = hub(({ res, body, h }) => {
    const s = state(h);
    const days = Math.round(Number(body.window_days));
    if (!(days >= 1 && days <= 90)) throw oops(400, 'Set a return window from 1 to 90 days.');
    s.policy = { window_days: days, auto_approve: !!body.auto_approve };
    send(res, 200, s.policy);
  });

  // ---- order detail -------------------------------------------------------------------------
  routes['GET /v1/hub/orders/show'] = hub(({ res, url, h }) => {
    const r = h.records.find((x) => x.id === url.searchParams.get('id'));
    if (!r) throw oops(404, 'We could not find that order.');
    const s = state(h);
    const rt = s.returns.find((x) => x.order_id === r.id && !['REJECTED', 'CANCELLED'].includes(x.status));
    syncWeights(h);
    send(res, 200, { ...live(r), tracking: r.booking_id ? engine.trackById(r.booking_id) : null, return: rt ? view(rt) : null, weight_case: s.weights[r.id] || null, can_return: eligible(h, s).some((x) => x.id === r.id) });
  });

  // ---- weight management ---------------------------------------------------------------------
  // Provider scale readings are simulated: some delivered parcels come back heavier than declared.
  function syncWeights(h) {
    const s = state(h);
    h.records.map(live).forEach((r) => {
      if (s.weights[r.id] !== undefined || !['courier', 'logistics', 'international'].includes(r.section) || r.group !== 'delivered' || !(r.weight > 0)) return;
      if (!(r.sample && r.section === 'courier') && hash(r.id) % 3 !== 0) { s.weights[r.id] = null; return; }
      const charged = Math.ceil(r.weight * (1.2 + (hash(r.id + 'w') % 40) / 100) * 2) / 2;
      s.weights[r.id] = { id: r.id, title: r.title, provider: r.provider, sub: r.sub, declared: r.weight, charged, extra: Math.max(15, Math.round(r.amount * (charged / r.weight - 1) * 0.5)), status: 'ACTION', at: iso(Date.now()), due: iso(Date.now() + 7 * day) };
    });
  }
  routes['GET /v1/hub/weight'] = hub(({ res, h }) => {
    syncWeights(h);
    const s = state(h);
    const list = Object.values(s.weights).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at));
    send(res, 200, { cases: list, counts: { action: list.filter((c) => c.status === 'ACTION').length, accepted: list.filter((c) => c.status === 'ACCEPTED').length, disputed: list.filter((c) => c.status === 'DISPUTED').length }, profiles: s.profiles });
  });
  const findCase = (h, id) => { syncWeights(h); const c = state(h).weights[id]; if (!c) throw oops(404, 'We could not find that weight check.'); if (c.status !== 'ACTION') throw oops(400, 'This weight check has already been handled.'); return c; };
  routes['POST /v1/hub/weight/accept'] = hub(({ res, body, db, h }) => {
    const c = findCase(h, body.id);
    takePayment(db, h, c.extra, `Weight difference · ${c.id}`);
    c.status = 'ACCEPTED';
    send(res, 200, { ...c, wallet_balance: db.balance });
  });
  routes['POST /v1/hub/weight/dispute'] = hub(({ res, body, db, h, user }) => {
    const c = findCase(h, body.id);
    const actual = Number(body.actual);
    if (!(actual > 0)) throw oops(400, 'Enter the actual weight you measured.');
    const note = text(body.note, 400);
    if (note.length < 10) throw oops(400, 'Explain why the weight is wrong, in at least 10 characters.');
    const t = createTicket(db, { category: 'Weight dispute', subject: `Weight dispute for ${c.id}`, ref: c.id, message: `Declared ${c.declared} kg, charged ${c.charged} kg, actual ${actual} kg. ${note}`, by: user.name || 'You' });
    Object.assign(c, { status: 'DISPUTED', actual, note, ticket_id: t.id });
    send(res, 200, c);
  });
  routes['POST /v1/hub/weight/profiles'] = hub(({ res, body, h }) => {
    const s = state(h);
    const name = text(body.name, 40); const weight = Number(body.weight);
    if (!name) throw oops(400, 'Give this package a name.');
    if (!(weight > 0 && weight <= 40000)) throw oops(400, 'Enter a weight up to 40,000 kg.');
    if (s.profiles.length >= 30) throw oops(400, 'You can save up to 30 packages. Remove one first.');
    const dim = (k) => Math.max(0, Number(body[k]) || 0);
    const p = { id: newId('PK'), name, weight, length: dim('length'), breadth: dim('breadth'), height: dim('height') };
    s.profiles.push(p);
    send(res, 200, p);
  });
  routes['POST /v1/hub/weight/profiles/remove'] = hub(({ res, body, h }) => { const s = state(h); s.profiles = s.profiles.filter((p) => p.id !== body.id); send(res, 200, { ok: true }); });

  // ---- feedback --------------------------------------------------------------------------------
  routes['GET /v1/hub/feedback'] = hub(({ res, h, owner }) => send(res, 200, { mine: state(h).feedback, roadmap: ROADMAP.map(([id, title]) => ({ id, title, votes: votes.get(id).size, voted: votes.get(id).has(owner) })).sort((a, b) => b.votes - a.votes) }));
  routes['POST /v1/hub/feedback'] = hub(({ res, body, db, h, user }) => {
    const s = state(h);
    const types = { idea: 'Idea', bug: 'Problem', praise: 'Praise', other: 'Other' };
    if (!types[body.type]) throw oops(400, 'Pick the type of feedback.');
    const nps = body.nps === '' || body.nps == null ? null : Math.round(Number(body.nps));
    if (nps != null && !(nps >= 0 && nps <= 10)) throw oops(400, 'Pick a score from 0 to 10.');
    const message = text(body.message, 1500);
    if (message.length < 5) throw oops(400, 'Tell us a little more, at least 5 characters.');
    const f = { id: newId('FB'), at: iso(Date.now()), type: types[body.type], area: text(body.area, 40), nps, message, status: 'Received', ticket_id: null };
    if (body.want_reply) f.ticket_id = createTicket(db, { category: 'Other', subject: `Feedback: ${message.slice(0, 60)}`, ref: f.id, message, by: user.name || 'You' }).id;
    s.feedback.unshift(f);
    send(res, 200, f);
  });
  routes['POST /v1/hub/feedback/vote'] = hub(({ res, body, owner }) => {
    const set = votes.get(body.id);
    if (!set) throw oops(404, 'We could not find that idea.');
    if (set.has(owner)) set.delete(owner); else set.add(owner);
    send(res, 200, { votes: set.size, voted: set.has(owner) });
  });

  // ---- access control (account owner only; enforced in seller-api) ------------------------
  const levels = ['none', 'view', 'manage'];
  const cleanPerms = (p) => Object.fromEntries(Object.entries(p || {}).filter(([k, v]) => access.KEYS.includes(k) && levels.includes(v)));
  routes['GET /v1/hub/access'] = hub(({ res, db, owner }) => {
    const a = access.ensure(db);
    const active = [...memberships].filter(([, m]) => m.owner === owner);
    const pending = [...invites].filter(([, i]) => i.owner === owner);
    const u = users.get(owner) || {};
    send(res, 200, { modules: access.MODULES,
      roles: Object.entries(a.roles).map(([key, r]) => ({ key, ...r, members: active.filter(([, m]) => m.role === key).length + pending.filter(([, i]) => i.role === key).length })),
      members: [{ key: owner, name: u.name, contact: u.mobile || u.email, role: 'owner', status: 'ACTIVE', overrides: {}, override_count: 0 },
        ...active.map(([key, m]) => { const x = users.get(key) || {}; const overrides = a.overrides[key] || {}; return { key, name: x.name, contact: x.mobile || x.email, role: m.role, status: 'ACTIVE', overrides, override_count: Object.keys(overrides).length }; }),
        ...pending.map(([contact, i]) => ({ key: contact, name: i.name, contact, role: i.role, status: 'INVITED', overrides: {}, override_count: 0 }))] });
  });
  routes['POST /v1/hub/access/role'] = hub(({ res, body, db }) => {
    const a = access.ensure(db);
    if (body.key) {
      const r = a.roles[body.key];
      if (!r) throw oops(404, 'We could not find that role.');
      Object.assign(r.perms, cleanPerms(body.perms));
      return send(res, 200, { key: body.key });
    }
    const name = text(body.name, 40);
    if (!name) throw oops(400, 'Give the role a name.');
    if (Object.values(a.roles).some((r) => r.name.toLowerCase() === name.toLowerCase())) throw oops(409, 'A role with that name already exists.');
    if (Object.keys(a.roles).length >= 25) throw oops(400, 'You can have up to 25 roles.');
    const from = a.roles[body.copy_from];
    const key = newId('r_').toLowerCase();
    a.roles[key] = { name, description: text(body.description, 120), builtin: false, perms: from ? { ...from.perms } : Object.fromEntries(access.KEYS.map((k) => [k, 'none'])) };
    return send(res, 200, { key });
  });
  routes['POST /v1/hub/access/role/delete'] = hub(({ res, body, db, owner }) => {
    const a = access.ensure(db);
    const r = a.roles[body.key];
    if (!r) throw oops(404, 'We could not find that role.');
    if (r.builtin) throw oops(400, 'Built-in roles cannot be deleted.');
    if ([...memberships.values()].some((m) => m.owner === owner && m.role === body.key) || [...invites.values()].some((i) => i.owner === owner && i.role === body.key)) throw oops(400, 'Move everyone off this role first.');
    delete a.roles[body.key];
    send(res, 200, { ok: true });
  });
  routes['POST /v1/hub/access/member'] = hub(({ res, body, db, owner }) => {
    const a = access.ensure(db);
    const m = memberships.get(body.key);
    if (!m || m.owner !== owner) throw oops(404, 'We could not find that person.');
    const o = cleanPerms(body.overrides);
    if (Object.keys(o).length) a.overrides[body.key] = o; else delete a.overrides[body.key];
    send(res, 200, { ok: true });
  });

  // ---- partner holidays ---------------------------------------------------------------------
  const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  routes['GET /v1/hub/holidays'] = hub(({ res, url, h }) => {
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '') ? url.searchParams.get('month') : ymd(Date.now()).slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const count = new Date(y, m, 0).getDate();
    const days = Array.from({ length: count }, (_, n) => holidays.dayView(h.holidays, `${month}-${String(n + 1).padStart(2, '0')}`));
    const upcoming = [];
    for (let n = 0; n < 420 && upcoming.length < 6; n++) { const v = holidays.dayView(h.holidays, ymd(Date.now() + n * day)); const name = v.custom[0] ? v.custom[0].name : v.national; if (name) upcoming.push({ date: v.date, name, closed: v.closed.length, limited: v.limited.length }); }
    send(res, 200, { month, days, upcoming, partners: holidays.PARTNERS.map(([name, group]) => ({ name, group })) });
  });
  routes['POST /v1/hub/holidays'] = hub(({ res, body, h }) => {
    const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(v));
    if (!isDay(body.date)) throw oops(400, 'Pick a date.');
    const end = body.end_date ? body.end_date : body.date;
    if (!isDay(end) || end < body.date) throw oops(400, 'The end date must be on or after the start date.');
    const provider = text(body.provider, 60);
    if (provider !== holidays.ALL && !holidays.PARTNERS.some((p) => p[0] === provider)) throw oops(400, 'Pick a partner.');
    const name = text(body.name, 60);
    if (name.length < 3) throw oops(400, 'Add a reason.');
    const status = body.status === 'limited' ? 'limited' : 'closed';
    const span = Math.round((Date.parse(end) - Date.parse(body.date)) / 86400000) + 1;
    if (span > 31) throw oops(400, 'Add up to 31 days at a time.');
    for (let n = 0; n < span; n++) { const d = new Date(Date.parse(body.date) + n * 86400000).toISOString().slice(0, 10); h.holidays.push({ id: newId('HD'), date: d, provider, name, status }); }
    send(res, 200, { added: span });
  });
  routes['POST /v1/hub/holidays/remove'] = hub(({ res, body, h }) => { h.holidays = h.holidays.filter((x) => x.id !== body.id); send(res, 200, { ok: true }); });
};
