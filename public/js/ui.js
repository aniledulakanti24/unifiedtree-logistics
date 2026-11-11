// Page interactions: header, mobile menu, route progress, footer accordion and
// reveal on scroll. No dependencies.
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const $ = (s, scope = document) => scope.querySelector(s);
  const $$ = (s, scope = document) => Array.from(scope.querySelectorAll(s));
  const isMobile = () => window.matchMedia('(max-width: 992px)').matches;

  $('#year').textContent = new Date().getFullYear();

  // ---- header: hide while scrolling down, reveal on scroll up -------------
  const header = $('#siteHeader');
  const routeFill = $('.pageRoute__fill');
  const routeParcel = $('.pageRoute__parcel');
  let lastY = window.scrollY;
  function onScroll() {
    const y = window.scrollY;
    header.classList.toggle('is-hidden', y > lastY && y > 200 && !document.body.classList.contains('menuOpen'));
    lastY = y;
    // The page itself is a route: a small parcel moves along the header as you read.
    const span = document.documentElement.scrollHeight - window.innerHeight;
    const k = span > 0 ? Math.min(1, y / span) : 0;
    routeFill.style.transform = `scaleX(${k})`;
    routeParcel.style.left = k * 100 + '%';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  // ---- mobile menu ----------------------------------------------------------
  const toggle = $('.MobileNavController');
  const menu = $('#main_menu');
  const cta = document.createElement('li');
  cta.className = 'mobile-cta';
  $$('.appLogins a').forEach((a) => cta.appendChild(a.cloneNode(true)));
  menu.appendChild(cta);
  cta.hidden = !isMobile();
  window.addEventListener('resize', () => { cta.hidden = !isMobile(); });

  function closeMenu() {
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    header.classList.remove('activeMobileMenu');
    document.body.classList.remove('menuOpen');
    $$('.menuLinkOpen').forEach((li) => li.classList.remove('menuLinkOpen'));
  }
  toggle.addEventListener('click', () => {
    if (toggle.classList.contains('open')) return closeMenu();
    toggle.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    header.classList.add('activeMobileMenu');
    document.body.classList.add('menuOpen');
  });
  $$('.menu-item-has-children > .menu-link').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (!isMobile()) return;
      e.preventDefault();
      const li = btn.parentElement;
      const open = !li.classList.contains('menuLinkOpen');
      $$('.menuLinkOpen').forEach((x) => x.classList.remove('menuLinkOpen'));
      li.classList.toggle('menuLinkOpen', open);
    });
  });
  menu.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && !(isMobile() && link.matches('.menu-item-has-children > .menu-link'))) closeMenu();
  });

  // ---- footer accordion on mobile ------------------------------------------
  $$('.widget_nav_menu .widget-title').forEach((title) => {
    title.addEventListener('click', () => {
      if (!window.matchMedia('(max-width: 767px)').matches) return;
      const open = !title.classList.contains('active');
      $$('.widget_nav_menu .widget-title').forEach((t) => t.classList.remove('active'));
      title.classList.toggle('active', open);
    });
  });

  // ---- reveal on scroll -----------------------------------------------------
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); obs.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px' });
  $$('[data-reveal]').forEach((el) => revealObserver.observe(el));
});
