// Saved views and a column chooser for order tables. Both are kept in this browser only.
import { esc, toast } from '../core.js';
import { popover } from './prefs.js';
import { icon } from './icons.js';

const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

export const tableTools = () => `<div class="tt-row"><button class="btn btn-outline" id="ttViews" type="button" title="Saved views">${icon('bookmark', 16)}<span class="bl">Views</span></button><button class="btn btn-outline" id="ttCols" type="button" title="Columns">${icon('columns', 16)}<span class="bl">Columns</span></button></div>`;

function applyColumns(root, key) {
  const hidden = read(`ut-cols-${key}`, []);
  const table = root.querySelector('table.orders');
  if (!table) return;
  [...table.querySelectorAll('tr')].forEach((tr) => [...tr.children].forEach((cell, i) => { cell.style.display = hidden.includes(i) ? 'none' : ''; }));
}

export function wireTableTools(root, key) {
  applyColumns(root, key);
  const cols = root.querySelector('#ttCols'); const views = root.querySelector('#ttViews');
  if (cols) cols.addEventListener('click', () => {
    const table = root.querySelector('table.orders');
    if (!table) { toast('No rows to show columns for.', true); return; }
    const heads = [...table.querySelectorAll('thead th')].map((th, i) => [i, th.textContent.trim()]).filter(([, t]) => t && !/^Action$/.test(t));
    const hidden = read(`ut-cols-${key}`, []);
    popover(cols, `<div class="col-pick"><p class="menu-head">Show columns</p>${heads.map(([i, t]) => `<label><input type="checkbox" class="check" data-col="${i}" ${hidden.includes(i) ? '' : 'checked'}> ${esc(t)}</label>`).join('')}</div>`, (el) => {
      el.addEventListener('change', (e) => {
        const i = Number(e.target.dataset.col);
        const now = read(`ut-cols-${key}`, []).filter((x) => x !== i);
        if (!e.target.checked) now.push(i);
        write(`ut-cols-${key}`, now); applyColumns(root, key);
      });
    });
  });
  if (views) views.addEventListener('click', () => {
    const draw = () => {
      const list = read(`ut-views-${key}`, []);
      return `<div class="menu-list"><p class="menu-head">Saved views</p>${list.length ? list.map((v, n) => `<div class="view-row"><a href="${esc(v.hash)}" data-go>${icon('bookmark', 15)}${esc(v.name)}</a><button type="button" data-del="${n}" aria-label="Delete ${esc(v.name)}">${icon('x', 15)}</button></div>`).join('') : '<p class="muted small" style="padding:4px 10px;margin:0">No saved views yet.</p>'}<div class="menu-sep"></div><form class="view-save"><input class="input" name="name" maxlength="40" placeholder="Name this view"><button class="btn btn-primary btn-sm" type="submit">Save</button></form></div>`;
    };
    popover(views, draw(), (el, close) => {
      el.addEventListener('submit', (e) => { e.preventDefault(); const name = e.target.name.value.trim(); if (!name) return; const list = read(`ut-views-${key}`, []).filter((v) => v.name !== name); list.unshift({ name, hash: location.hash }); write(`ut-views-${key}`, list.slice(0, 12)); toast(`View "${name}" saved`); el.innerHTML = draw(); });
      el.addEventListener('click', (e) => { const d = e.target.closest('[data-del]'); if (d) { const list = read(`ut-views-${key}`, []); list.splice(Number(d.dataset.del), 1); write(`ut-views-${key}`, list); el.innerHTML = draw(); } if (e.target.closest('[data-go]')) close(); });
    });
  });
}
