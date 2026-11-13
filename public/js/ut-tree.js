/* UT tree: one root system (account, wallet, tracking) growing into every service.
   Usage: <div data-ut-tree="home|login|boot"></div>, or UTTree.mount(el, options).
   Grows when it scrolls into view; parcels then travel from the roots up to each service.
   Under prefers-reduced-motion the finished tree is shown without movement. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var uid = 0;
  var ICON = {
    bike: '<circle cx="6" cy="16.5" r="3.5"/><circle cx="18" cy="16.5" r="3.5"/><path d="M6 16.5 9.5 9h5l3.5 7.5M9 6h3M14.5 9 12 16.5"/>',
    parcel: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    truck: '<path d="M2 6h12v10H2zM14 9h4l4 4v3h-8z"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.7 5.7 3.7 9s-1.2 6.3-3.7 9c-2.5-2.7-3.7-5.7-3.7-9S9.5 5.7 12 3z"/>',
    plane: '<path d="M2 16l20-7-3-2-7 2-5-5-2 1 3 5-4 2-2-1-1 1 3 3z"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>'
  };
  var SERVICES = [
    { label: 'Vehicle', icon: 'bike', href: '/book/?service=local' },
    { label: 'Courier', icon: 'parcel', href: '/book/?service=courier' },
    { label: 'Logistics', icon: 'truck', href: '/book/?service=logistics' },
    { label: 'International', icon: 'globe', href: '/book/?service=international' },
    { label: 'Travel', icon: 'plane', href: '/app/#/travel/flights' },
    { label: 'Bills', icon: 'phone', href: '/app/#/pay/mobile' }
  ];
  var ROOTS = ['One account', 'One wallet', 'One tracking page'];

  // Small seeded random, so the tree looks the same on every visit.
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function bez(p, t) {
    var u = 1 - t;
    return [u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6], u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]];
  }
  function d(p) { return 'M' + p[0] + ' ' + p[1] + 'C' + p.slice(2).join(' '); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function build(host, o) {
    var W = 600, H = o.roots ? 560 : 470, cx = 300, ground = 430;
    var rand = rng(o.seed || 7);
    // Links inside need to stay reachable, so only a decorative tree is one image.
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ut-tree__svg', role: o.compact ? 'img' : 'group', 'aria-label': o.label || 'A tree growing from one account into every UT Log service' });
    var gid = 'uttCanopy' + (++uid);
    var defs = el('defs', {}, svg);
    var grad = el('radialGradient', { id: gid, cx: '50%', cy: '55%', r: '50%' }, defs);
    el('stop', { offset: '0%', style: 'stop-color:var(--utt-leaf-2);stop-opacity:.55' }, grad);
    el('stop', { offset: '100%', style: 'stop-color:var(--utt-leaf-2);stop-opacity:0' }, grad);
    el('ellipse', { class: 'utt-canopy', cx: cx, cy: o.compact ? 200 : 190, rx: 250, ry: 170, fill: 'url(#' + gid + ')' }, svg);
    var gRoot = el('g', { class: 'utt-roots' }, svg);
    var gTrunk = el('g', { class: 'utt-trunk' }, svg);
    var gBranch = el('g', { class: 'utt-branches' }, svg);
    var gLeaf = el('g', { class: 'utt-leaves' }, svg);
    var gPulse = el('g', { class: 'utt-pulses' }, svg);
    var gNode = el('g', { class: 'utt-nodes' }, svg);
    var delay = function (node, s) { node.style.setProperty('--d', s.toFixed(2) + 's'); return node; };

    // Ground line and roots: the shared base every service grows from.
    el('path', { class: 'utt-ground utt-draw', d: 'M70 ' + ground + 'H530', pathLength: 1 }, gRoot);
    var rootPaths = [];
    [-160, -105, -40, 40, 105, 160].forEach(function (dx, i) {
      var depth = o.roots ? 70 + (i % 3) * 22 : 34 + (i % 3) * 10;
      var p = [cx + dx * 0.08, ground, cx + dx * 0.3, ground + depth * 0.3, cx + dx * 0.75, ground + depth * 0.6, cx + dx, ground + depth];
      rootPaths.push(p);
      delay(el('path', { class: 'utt-root utt-draw', d: d(p), pathLength: 1, 'stroke-width': 4 - (i % 3) }, gRoot), 0.1 + i * 0.06);
    });
    if (o.roots) {
      ROOTS.forEach(function (t, i) {
        var x = [150, 300, 450][i];
        var g = delay(el('g', { class: 'utt-rootlabel', transform: 'translate(' + x + ' ' + (ground + 108) + ')' }, gRoot), 0.7 + i * 0.12);
        el('rect', { x: -66, y: -15, width: 132, height: 30, rx: 15 }, g);
        el('text', { 'text-anchor': 'middle', y: 5 }, g).textContent = t;
      });
    }

    // Trunk: two strokes give it some body.
    var top = 268;
    var trunk = [cx, ground, cx - 6, ground - 50, cx + 8, top + 60, cx, top];
    delay(el('path', { class: 'utt-trunk-w utt-draw', d: d(trunk), pathLength: 1 }, gTrunk), 0.35);
    delay(el('path', { class: 'utt-trunk-hi utt-draw', d: d([cx - 5, ground - 4, cx - 10, ground - 50, cx + 2, top + 64, cx - 3, top + 8]), pathLength: 1 }, gTrunk), 0.45);

    // Main branches to each service.
    var nodes = o.nodes || SERVICES;
    var n = nodes.length;
    var spots = n === 6 ? [[92, 262], [128, 140], [222, 66], [378, 66], [472, 140], [508, 262]] : nodes.map(function (_, i) { var a = Math.PI * (0.92 - (0.84 * i) / Math.max(1, n - 1)); return [cx + Math.cos(a) * 210, 300 - Math.sin(a) * 230]; });
    nodes.forEach(function (node, i) {
      var tip = spots[i];
      var left = tip[0] < cx;
      var fy = [330, 296, 272, 272, 296, 330][i] || 290;
      var fork = bez(trunk, (ground - fy) / (ground - top));
      var p = [r1(fork[0]), r1(fork[1]), r1(fork[0] + (left ? -14 : 14)), r1(fork[1] - 46), r1((tip[0] + cx) / 2 + (left ? -20 : 20)), r1(tip[1] + 50 + (i % 2) * 12), tip[0], tip[1]];
      var t0 = 1.0 + i * 0.12;
      delay(el('path', { class: 'utt-branch utt-draw', d: d(p), pathLength: 1, 'stroke-width': (7 - Math.abs(i - (n - 1) / 2)).toFixed(1) }, gBranch), t0);
      // Twigs and leaf clusters along the branch.
      [0.32, 0.55, 0.74].forEach(function (t, k) {
        var a = bez(p, t);
        var side = (k % 2 ? 1 : -1) * (left ? -1 : 1);
        var len = 26 + rand() * 18;
        var ex = a[0] + side * len * 0.55 + (left ? -len * 0.5 : len * 0.5);
        var ey = a[1] - len * (0.7 + rand() * 0.3);
        var tw = [r1(a[0]), r1(a[1]), r1(a[0] + side * 6), r1(a[1] - 10), r1(ex - side * 6), r1(ey + 8), r1(ex), r1(ey)];
        delay(el('path', { class: 'utt-twig utt-draw', d: d(tw), pathLength: 1 }, gBranch), t0 + 0.35 + k * 0.12);
        var cluster = delay(el('g', { class: 'utt-cluster', style: 'transform-origin:' + r1(a[0]) + 'px ' + r1(a[1]) + 'px' }, gLeaf), t0 + 0.6 + k * 0.1);
        var count = o.compact ? 3 : 5;
        for (var j = 0; j < count; j++) {
          var lx = ex + (rand() - 0.5) * 22, ly = ey + (rand() - 0.5) * 18;
          var rot = Math.round(rand() * 180);
          // The wrapper scales in; the ellipse keeps its own rotation.
          var leaf = delay(el('g', { class: 'utt-leaf' }, cluster), t0 + 0.65 + k * 0.1 + j * 0.05);
          leaf.style.transformOrigin = r1(lx) + 'px ' + r1(ly) + 'px';
          el('ellipse', { class: 'utt-leaf--' + (j % 3), cx: r1(lx), cy: r1(ly), rx: 9 + Math.round(rand() * 4), ry: 5 + Math.round(rand() * 2), transform: 'rotate(' + rot + ' ' + r1(lx) + ' ' + r1(ly) + ')' }, leaf);
        }
      });
      // A parcel that travels up from the roots, through the trunk, out to this service.
      if (!o.compact) {
        var full = 'M' + cx + ' ' + (ground + 40) + 'L' + trunk[0] + ' ' + trunk[1] + 'C' + trunk.slice(2, 4).join(' ') + ' ' + r1((trunk[4] + fork[0]) / 2) + ' ' + r1((trunk[5] + fork[1]) / 2) + ' ' + p[0] + ' ' + p[1] + 'C' + p.slice(2).join(' ');
        var dot = el('g', { class: 'utt-pulse' }, gPulse);
        el('circle', { r: 7, class: 'utt-pulse__halo' }, dot);
        el('rect', { x: -4.5, y: -4.5, width: 9, height: 9, rx: 2, class: 'utt-pulse__box' }, dot);
        var am = el('animateMotion', { dur: (2.6 + (i % 3) * 0.35) + 's', repeatCount: 'indefinite', begin: 'indefinite', path: full, keyPoints: '0;1', keyTimes: '0;1', calcMode: 'spline', keySplines: '.45 0 .3 1' }, dot);
        dot.__start = 3.1 + i * 0.55;
        dot.__am = am;
      }
      // Service node at the tip.
      var g = delay(el(node.href && !o.compact && !o.nolinks ? 'a' : 'g', { class: 'utt-node', transform: 'translate(' + tip[0] + ' ' + tip[1] + ')' }, gNode), t0 + 0.7);
      if (node.href && !o.compact && !o.nolinks) { g.setAttribute('href', node.href); g.setAttribute('aria-label', node.label); }
      var inner = el('g', { class: 'utt-node__in' }, g);
      if (o.compact) { el('circle', { r: 9, class: 'utt-bud' }, inner); return; }
      el('circle', { r: 27, class: 'utt-node__ring' }, inner);
      el('circle', { r: 22, class: 'utt-node__bg' }, inner);
      var ic = el('g', { class: 'utt-node__ic', transform: 'translate(-11 -11) scale(.92)' }, inner);
      ic.innerHTML = ICON[node.icon] || ICON.parcel;
      var tx = el('text', { class: 'utt-node__t', 'text-anchor': 'middle', y: 44 }, inner);
      tx.textContent = node.label;
    });

    host.innerHTML = '';
    host.appendChild(svg);
    return svg;
  }

  function start(host, svg) {
    host.classList.add('is-growing');
    if (calm()) return;
    var dots = svg.querySelectorAll('.utt-pulse');
    // Start each parcel once its branch has grown.
    Array.prototype.forEach.call(dots, function (dot) {
      setTimeout(function () { dot.classList.add('on'); try { dot.__am.beginElement(); } catch (e) { /* SMIL unsupported: no parcels */ } }, dot.__start * 1000 * speed(host));
    });
  }
  function speed(host) { var s = parseFloat(getComputedStyle(host).getPropertyValue('--utt-speed')); return s > 0 ? s : 1; }
  function calm() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function mount(host, opts) {
    if (!host || host.__utt) return host && host.__utt;
    var preset = { home: { roots: true }, login: { nolinks: true, label: 'A tree: one UT Log account growing into every service' }, boot: { compact: true, roots: false }, mini: { compact: true } }[host.getAttribute('data-ut-tree')] || {};
    var o = Object.assign({}, preset, opts || {});
    host.classList.add('ut-tree', 'ut-tree--' + (host.getAttribute('data-ut-tree') || 'custom'));
    var svg = build(host, o);
    host.__utt = { replay: function () { host.classList.remove('is-growing'); void host.offsetWidth; start(host, svg); } };
    if (o.now || !('IntersectionObserver' in window)) start(host, svg);
    else {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); start(host, svg); } }); }, { threshold: 0.25 });
      io.observe(host);
    }
    return host.__utt;
  }

  window.UTTree = { mount: mount, SERVICES: SERVICES };
  function auto() { Array.prototype.forEach.call(document.querySelectorAll('[data-ut-tree]'), function (h) { mount(h, h.hasAttribute('data-now') ? { now: true } : null); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();

// Homepage band: reveal the list beside the tree.
(function () {
  var band = document.querySelector('.treeBand');
  if (!band) return;
  if (!('IntersectionObserver' in window)) { band.classList.add('in'); return; }
  var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { band.classList.add('in'); io.disconnect(); } }, { threshold: 0.2 });
  io.observe(band);
})();
