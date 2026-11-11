// Order tracking card: AWB or order ID + phone -> GET /v1/tracking.
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const API = (window.UT_SIGNUP_CONFIG || {}).apiBase || '/v1';
  const errorEl = document.getElementById('track-error');
  const resultEl = document.getElementById('track-result');
  const forms = { awb_track: document.getElementById('awb_track'), track_id: document.getElementById('track_id') };

  document.querySelectorAll('[data-track-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-track-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      Object.entries(forms).forEach(([id, form]) => form.classList.toggle('hidden', id !== tab.dataset.trackTab));
      errorEl.textContent = '';
      resultEl.classList.add('hidden');
    });
  });

  document.getElementById('phone_track').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 10);
  });

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const ROAD_STOPS = ['Placed', 'Picked up', 'In transit', 'At hub', 'Out for delivery', 'Delivered'];

  function render(data) {
    // Events arrive newest first, one per stage reached, so the count is the stage.
    const reached = Math.min(ROAD_STOPS.length, data.events.length);
    const progress = (reached - 1) / (ROAD_STOPS.length - 1);
    resultEl.innerHTML =
      '<div class="trackResult__head">' +
        '<span class="trackResult__status">' + esc(data.status) + '</span>' +
        '<span>' + esc(data.origin) + ' → ' + esc(data.destination) + '</span>' +
        '<span class="muted">Expected by ' + esc(data.eta) + '</span>' +
      '</div>' +
      '<div class="trackRoad" style="--p:' + progress + '" aria-hidden="true">' +
        '<div class="trackRoad__line"></div><div class="trackRoad__done"></div><div class="trackRoad__parcel"></div>' +
        '<ol class="trackRoad__stops">' + ROAD_STOPS.map((s, i) => '<li class="' + (i < reached ? 'is-done' : '') + '">' + s + '</li>').join('') + '</ol>' +
      '</div>' +
      '<ol class="timeline">' + data.events.map((e, i) =>
        '<li style="--i:' + i + '"><b>' + esc(e.label) + '</b> · ' + esc(e.location) + '<time datetime="' + esc(e.at) + '">' + esc(fmt(e.at)) + '</time></li>'
      ).join('') + '</ol>';
    resultEl.classList.remove('hidden');
  }

  async function lookup(form, params) {
    const btn = form.querySelector('button[type=submit]');
    errorEl.textContent = '';
    resultEl.classList.add('hidden');
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      const res = await fetch(API + '/tracking?' + new URLSearchParams(params));
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not find that shipment.');
      render(data);
    } catch (err) {
      errorEl.textContent = err.message || 'Could not find that shipment.';
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }

  forms.awb_track.addEventListener('submit', (e) => {
    e.preventDefault();
    lookup(forms.awb_track, { awb: document.getElementById('awb').value.trim() });
  });
  forms.track_id.addEventListener('submit', (e) => {
    e.preventDefault();
    lookup(forms.track_id, { order_id: document.getElementById('order_id').value.trim(), phone: document.getElementById('phone_track').value.trim() });
  });
});
