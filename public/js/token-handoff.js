/*
 * token-handoff — pass a session token from the marketing site to the app
 * without putting it in the URL (analytics tools record page URLs).
 *
 * Sender:   UTTokenHandoff.send(token, '/dashboard.html')
 *   Writes cookie ut_handoff=<target host>|<token> (Max-Age 60, SameSite=Lax)
 *   on PARENT_DOMAIN when both hosts share it, else on the current host, then
 *   navigates. Falls back to ?token= only when the target is on another site.
 * Receiver: load this file first in <head> with the data-receive attribute.
 *   A cookie addressed to this host is deleted at once and the token moves to
 *   localStorage[data-storage-key || 'ut_token'].
 */
(function (w, d) {
  'use strict';
  var COOKIE = 'ut_handoff';
  // Set to your apex domain (e.g. 'utlog.in') to share across subdomains.
  var PARENT_DOMAIN = '';
  var received = null;

  function onParent(hostname) {
    return !!PARENT_DOMAIN && (hostname === PARENT_DOMAIN || hostname.slice(-(PARENT_DOMAIN.length + 1)) === '.' + PARENT_DOMAIN);
  }
  function writeCookie(value, maxAge) {
    var domain = onParent(w.location.hostname) ? '; Domain=.' + PARENT_DOMAIN : '';
    var secure = w.location.protocol === 'https:' ? '; Secure' : '';
    d.cookie = COOKIE + '=' + value + domain + '; Path=/; Max-Age=' + maxAge + secure + '; SameSite=Lax';
  }

  function send(token, url, opts) {
    opts = opts || {};
    var open = opts.open || function (u) { w.location.assign(u); };
    var target = new URL(url, w.location.href);
    if (token) {
      var sameSite = target.host === w.location.host || (onParent(w.location.hostname) && onParent(target.hostname));
      if (sameSite) writeCookie(encodeURIComponent(target.host + '|' + token), opts.maxAge || 60);
      else target.searchParams.set(opts.param || 'token', token);
    }
    open(target.toString());
    return true;
  }

  function receive(opts) {
    opts = opts || {};
    var m = d.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
    if (!m) return null;
    var value = decodeURIComponent(m[1]);
    var sep = value.indexOf('|');
    if (sep < 1 || value.slice(0, sep) !== w.location.host) return null;
    writeCookie('', 0);
    var token = value.slice(sep + 1);
    if (!token) return null;
    var key = opts.storageKey == null ? 'ut_token' : opts.storageKey;
    if (key) { try { w.localStorage.setItem(key, token); } catch (e) {} }
    received = token;
    return token;
  }

  w.UTTokenHandoff = { send: send, receive: receive, peek: function () { return received; }, clear: function () { received = null; } };
  w.utHandoffRedirect = function (token, url) { return send(token, url); };

  var script = d.currentScript;
  if (script && script.hasAttribute('data-receive')) {
    try { receive({ storageKey: script.getAttribute('data-storage-key') }); } catch (e) {}
  }
})(window, document);
