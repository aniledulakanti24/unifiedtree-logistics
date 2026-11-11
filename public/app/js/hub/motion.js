// Gentle motion: inertial wheel scrolling, reveal on scroll, number count-up and a
// route progress bar. Everything switches off under prefers-reduced-motion.
import { money } from '../core.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- smooth scrolling ------------------------------------------------------------
let target = 0; let current = 0; let running = false;
const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
const jump = (y) => window.scrollTo({ top: y, behavior: 'instant' });

function tick() {
  current += (target - current) * 0.13;
  if (Math.abs(target - current) < 0.6) { current = target; jump(current); running = false; return; }
  jump(current);
  requestAnimationFrame(tick);
}
function glide() { if (!running) { running = true; requestAnimationFrame(tick); } }

// True when a nested panel should take this wheel event instead of the page.
function nestedTakes(node, dy) {
  for (let el = node; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
      const atEdge = dy > 0 ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1 : el.scrollTop <= 0;
      if (!atEdge) return true;
    }
  }
  return false;
}

export function installSmoothScroll() {
  const top = document.querySelector('.top');
  addEventListener('scroll', () => {
    if (!running) { target = scrollY; current = scrollY; }
    if (top) top.classList.toggle('scrolled', scrollY > 4);
  }, { passive: true });
  if (calm() || matchMedia('(pointer: coarse)').matches) return;
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (document.querySelector('.modal-backdrop, .drawer-wrap') || e.target.closest('.side, .pop, .map-host')) return;
    const unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? innerHeight : 1;
    const dy = e.deltaY * unit;
    if (Math.abs(dy) < 40 || nestedTakes(e.target, dy)) return; // trackpads already scroll smoothly
    e.preventDefault();
    if (!running) { target = scrollY; current = scrollY; }
    target = Math.max(0, Math.min(maxScroll(), target + dy));
    glide();
  }, { passive: false });
}
// Glide to a position or an element (used after a search on small screens).
export function smoothTo(where, offset = 80) {
  const y = typeof where === 'number' ? where : where.getBoundingClientRect().top + scrollY - offset;
  if (calm()) { jump(y); return; }
  if (!running) { target = scrollY; current = scrollY; }
  target = Math.max(0, Math.min(maxScroll(), y));
  glide();
}
export function resetScroll() { running = false; target = 0; current = 0; jump(0); }

// ---- reveal on scroll and count-up ---------------------------------------------------
const seen = new WeakSet();
let io = null;
function reveal(root) {
  if (calm() || !('IntersectionObserver' in window)) return;
  if (!io) {
    io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      en.target.classList.add('is-in');
      setTimeout(() => en.target.classList.remove('reveal', 'is-in'), 700);
    }), { rootMargin: '0px 0px -6% 0px' });
  }
  root.querySelectorAll('.card, .offer, .table-wrap, .acct').forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    if (el.getBoundingClientRect().top > innerHeight * 0.96) { el.classList.add('reveal'); io.observe(el); }
  });
}
function countUp(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    const value = Number(el.dataset.count);
    if (calm() || !(value > 0)) return;
    const final = el.textContent;
    const asMoney = el.dataset.fmt === 'money';
    const start = performance.now();
    const step = (now) => {
      if (!el.isConnected) return;
      const t = Math.min(1, (now - start) / 750);
      const eased = 1 - (1 - t) ** 3;
      if (t >= 1) { el.textContent = final; return; }
      el.textContent = asMoney ? money(value * eased) : Math.round(value * eased).toLocaleString();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
export function watchView(view) {
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; reveal(view); countUp(view); });
  }).observe(view, { childList: true, subtree: true });
}

// ---- route progress bar -------------------------------------------------------------------
let bar;
export function progressStart() {
  if (!bar) { bar = document.createElement('i'); bar.className = 'route-bar'; document.body.appendChild(bar); }
  bar.className = 'route-bar go';
}
export function progressDone() { if (bar) { bar.className = 'route-bar done'; } }
