// Help: video tutorials, keyboard shortcut reference and the global handler.
import { api, html, raw, esc, emptyState } from '../core.js';
import { openPalette } from '../palette.js';

// Two-key "g then x" navigation plus single keys, like most admin panels.
const SHORTCUTS = [
  ['/', 'Find a page or search (or Ctrl + K)', openPalette],
  ['n', 'Start something new', () => { const b = document.getElementById('newBtn'); if (b) b.click(); }],
  ['a', 'Ask a question', () => { const b = document.getElementById('askBtn'); if (b) b.click(); }],
  ['?', 'Show keyboard shortcuts', () => { location.hash = '#/shortcuts'; }],
  ['g h', 'Go to Overview', () => { location.hash = '#/home'; }],
  ['g o', 'Go to All Orders', () => { location.hash = '#/my/orders'; }],
  ['g r', 'Go to All Returns', () => { location.hash = '#/my/returns'; }],
  ['g v', 'Go to Vehicle Transport', () => { location.hash = '#/vehicle'; }],
  ['g c', 'Go to Courier Transport', () => { location.hash = '#/courier'; }],
  ['g l', 'Go to Logistics Transport', () => { location.hash = '#/logistics'; }],
  ['g t', 'Go to Travel & Stay', () => { location.hash = '#/travel/dashboard'; }],
  ['g p', 'Go to Recharge & Bills', () => { location.hash = '#/pay/dashboard'; }],
  ['g w', 'Go to Wallet', () => { location.hash = '#/wallet'; }],
];

export function installShortcuts() {
  let pending = '';
  let timer;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.modal-backdrop')) return;
    const combo = pending ? `${pending} ${e.key}` : e.key;
    const hit = SHORTCUTS.find(([k]) => k === combo);
    clearTimeout(timer);
    if (hit) { e.preventDefault(); pending = ''; hit[2](); return; }
    pending = e.key === 'g' && !pending ? 'g' : '';
    if (pending) timer = setTimeout(() => { pending = ''; }, 1000);
  });
}

export function renderShortcuts(view) {
  view.innerHTML = html`<div class="page-head"><div><h1>Keyboard shortcuts</h1><p>Work faster without the mouse. Shortcuts are off while typing in a field.</p></div></div>
    <div class="card" style="max-width:560px">${raw(SHORTCUTS.map(([k, label]) => `<div class="action-item" style="border:0;border-bottom:1px solid var(--line);border-radius:0"><span>${esc(label)}</span><span class="spacer"></span>${k.split(' ').map((x) => `<kbd class="mono badge">${esc(x)}</kbd>`).join(' then ')}</div>`).join(''))}</div>`;
}

export async function renderTutorials(view) {
  const d = await api('/help/tutorials');
  view.innerHTML = html`<div class="page-head"><div><h1>Video tutorials</h1><p>Short walkthroughs of every module.</p></div></div>
    ${d.data.length ? raw(`<div class="grid grid-4">${d.data.map((t) => `<article class="card" style="display:grid;gap:8px"><div style="aspect-ratio:16/9;border-radius:10px;background:linear-gradient(135deg,#0F5B45,#0B3A2C);display:grid;place-items:center;color:#FFB81C;font-size:28px">▶</div>
      <span class="badge badge-purple" style="width:max-content">${esc(t.topic)}</span><b>${esc(t.title)}</b><small class="muted">${esc(t.length)} · add your video URL in server/account-api.js</small></article>`).join('')}</div>`) : emptyState('No tutorials yet.')}`;
}
