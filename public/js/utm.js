// First-touch attribution: keeps a UTM cookie (30 days), a first_utm snapshot,
// a 10-page browse_history cookie, and fills any hidden utm_* inputs on forms.
(function () {
  'use strict';
  var KEYS = ['utm_source', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_term'];
  var DAYS = 30;

  function setCookie(name, value, days) {
    var exp = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + exp + '; path=/; SameSite=Lax';
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function parse(json) { try { return JSON.parse(json) || {}; } catch (e) { return {}; } }

  var params = new URLSearchParams(location.search);
  var saved = parse(getCookie('UTM'));
  var utm = getCookie('UTM')
    ? { pathname: saved.pathname, referrer: saved.referrer }
    : { pathname: location.pathname, referrer: document.referrer };
  KEYS.forEach(function (k) {
    if (params.get(k)) utm[k] = params.get(k).slice(0, 200);
    else if (saved[k]) utm[k] = saved[k];
  });
  setCookie('UTM', JSON.stringify(utm), DAYS);
  if (!getCookie('first_utm')) setCookie('first_utm', JSON.stringify(utm), DAYS);

  var history = (getCookie('browse_history') || '').split(',').filter(Boolean);
  if (history[history.length - 1] !== location.pathname) history.push(location.pathname);
  setCookie('browse_history', history.slice(-10).join(','), DAYS);

  var device = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ? 'mweb' : 'web';
  document.addEventListener('DOMContentLoaded', function () {
    var fill = { utm_link: location.href, utm_referrer: document.referrer, first_referrer: utm.referrer || '', pathname: utm.pathname || '', device: device };
    KEYS.forEach(function (k) { fill[k] = utm[k] || ''; });
    Object.keys(fill).forEach(function (name) {
      document.querySelectorAll('input[name="' + name + '"]').forEach(function (el) { el.value = fill[name]; });
    });
  });

  window.UTAttribution = {
    current: function () {
      var fromUrl = KEYS.some(function (k) { return params.get(k); });
      var out = {};
      KEYS.forEach(function (k) { out[k] = String((fromUrl ? params.get(k) : utm[k]) || '').slice(0, 200); });
      return out;
    },
    landingPage: function () { return utm.pathname || location.pathname; },
  };
})();
