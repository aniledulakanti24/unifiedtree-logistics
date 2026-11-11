// One map layer with two engines: Google Maps when a key is configured, otherwise
// OpenStreetMap through Leaflet so the feature works during development.
import { api, esc, modal, toast } from '../core.js';
import { duo } from './art.js';

const INDIA = [20.6, 78.9];
let config = null;
let loading = null;

export async function mapProvider() { if (!config) config = await api('/hub/config'); return config.maps.provider; }

function addScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('The map could not be loaded.')); document.head.appendChild(s); }); }
function load() {
  if (loading) return loading;
  loading = (async () => {
    const provider = await mapProvider();
    if (provider === 'google') {
      await new Promise((ok, no) => {
        window.__utMaps = ok;
        addScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.maps.key)}&v=weekly&loading=async&libraries=places,geocoding&callback=__utMaps`).catch(no);
      });
      return;
    }
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    await addScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

const COLOR = { pickup: '#0E7C66', drop: '#EDA100', moving: '#2A78D6', late: '#B8322F' };

function googleMap(el, center, zoom) {
  const g = window.google.maps;
  const map = new g.Map(el, { center: { lat: center[0], lng: center[1] }, zoom, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false });
  return {
    center: () => { const c = map.getCenter(); return [c.lat(), c.lng()]; },
    setView: (p, z) => { map.setCenter({ lat: p[0], lng: p[1] }); if (z) map.setZoom(z); },
    onIdle: (cb) => map.addListener('idle', cb),
    marker(p, kind = 'moving', onClick) {
      const m = new g.Marker({ map, position: { lat: p[0], lng: p[1] }, icon: { path: g.SymbolPath.CIRCLE, scale: kind === 'moving' || kind === 'late' ? 8 : 6, fillColor: COLOR[kind], fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } });
      if (onClick) m.addListener('click', onClick);
      return { move: (q, k) => { m.setPosition({ lat: q[0], lng: q[1] }); if (k) m.setIcon({ ...m.getIcon(), fillColor: COLOR[k] }); }, remove: () => m.setMap(null) };
    },
    line(a, b) { const l = new g.Polyline({ map, path: [{ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }], strokeColor: COLOR.pickup, strokeOpacity: 0.55, strokeWeight: 3, geodesic: true }); return { remove: () => l.setMap(null) }; },
    fit(points) { if (!points.length) return; const b = new g.LatLngBounds(); points.forEach((p) => b.extend({ lat: p[0], lng: p[1] })); map.fitBounds(b, 48); },
    resize() {}, destroy() {},
  };
}
function leafletMap(el, center, zoom) {
  const L = window.L;
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  return {
    center: () => { const c = map.getCenter(); return [c.lat, c.lng]; },
    setView: (p, z) => map.setView(p, z || map.getZoom()),
    onIdle: (cb) => map.on('moveend', cb),
    marker(p, kind = 'moving', onClick) {
      const big = kind === 'moving' || kind === 'late';
      const m = L.circleMarker(p, { radius: big ? 8 : 6, color: '#fff', weight: 2, fillColor: COLOR[kind], fillOpacity: 1 }).addTo(map);
      if (onClick) m.on('click', onClick);
      return { move: (q, k) => { m.setLatLng(q); if (k) m.setStyle({ fillColor: COLOR[k] }); }, remove: () => m.remove() };
    },
    line(a, b) { const l = L.polyline([a, b], { color: COLOR.pickup, opacity: 0.55, weight: 3 }).addTo(map); return { remove: () => l.remove() }; },
    fit(points) { if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 14 }); },
    resize: () => map.invalidateSize(),
    destroy: () => map.remove(),
  };
}
export async function createMap(el, { center = INDIA, zoom = 5 } = {}) {
  await load();
  return config.maps.provider === 'google' ? googleMap(el, center, zoom) : leafletMap(el, center, zoom);
}

// Address details for a point: Google's geocoder when available, plus our serviceable area.
async function describe(p) {
  const near = await api('/hub/geo/reverse', { method: 'POST', body: { lat: p[0], lng: p[1] } });
  let address = near.area ? `Near ${near.area}, ${near.city}` : `Near pin code ${near.pincode}`;
  let { pincode } = near;
  if (config.maps.provider === 'google') {
    try {
      const { results } = await new window.google.maps.Geocoder().geocode({ location: { lat: p[0], lng: p[1] } });
      if (results[0]) {
        address = results[0].formatted_address;
        const pc = results[0].address_components.find((c) => c.types.includes('postal_code'));
        if (pc && /^\d{6}$/.test(pc.long_name)) pincode = pc.long_name;
      }
    } catch (e) { /* keep the approximate address */ }
  }
  return { ...near, pincode, address };
}

// Search box: Google Places when available, otherwise the serviceable areas we know.
async function attachSearch(host, map) {
  if (config.maps.provider === 'google') {
    const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places');
    const box = new PlaceAutocompleteElement({ includedRegionCodes: ['in'] });
    box.addEventListener('gmp-select', async ({ placePrediction }) => {
      const place = placePrediction.toPlace();
      await place.fetchFields({ fields: ['location'] });
      map.setView([place.location.lat(), place.location.lng()], 16);
    });
    host.appendChild(box);
    return;
  }
  const meta = await api('/public/booking/meta');
  host.innerHTML = '<input class="input" list="mpAreas" placeholder="Search an area" aria-label="Search an area" autocomplete="off"><datalist id="mpAreas"></datalist>';
  host.querySelector('datalist').innerHTML = meta.areas.map((a) => `<option value="${esc(a)}">`).join('');
  host.querySelector('input').addEventListener('change', (e) => { const p = meta.area_points[e.target.value]; if (p) map.setView(p, 15); });
}

// Lets the user drag the map under a fixed pin. Resolves with the place, or null.
export function openMapPicker({ title, start }) {
  let map = null;
  const result = modal({
    title, wide: true,
    body: `<div class="mp-search" id="mpSearch"></div><div class="mp-wrap map-host"><div id="mpMap" class="mp-map"></div><span class="mp-pin" aria-hidden="true">${duo('pin').value}</span></div>
      <div class="mp-addr" aria-live="polite"><b id="mpTitle">Move the map to place the pin</b><small id="mpSub" class="muted"></small></div><p class="form-error" id="mpErr"></p>`,
    footer: '<button class="btn btn-outline" id="mpGps" type="button">Use my location</button><span class="spacer"></span><button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="mpGo" disabled>Confirm location</button>',
    async onMount(el, close) {
      const go = el.querySelector('#mpGo'); const err = el.querySelector('#mpErr');
      let place = null; let seq = 0;
      try {
        map = await createMap(el.querySelector('#mpMap'), { center: start ? [start.lat, start.lng] : [12.9716, 77.5946], zoom: start ? 16 : 12 });
        await attachSearch(el.querySelector('#mpSearch'), map);
      } catch (e) { err.textContent = e.message; return; }
      const update = async () => {
        const my = ++seq; const p = map.center();
        go.disabled = true;
        try {
          const d = await describe(p);
          if (my !== seq) return;
          place = { ...d, lat: p[0], lng: p[1] };
          el.querySelector('#mpTitle').textContent = d.address;
          el.querySelector('#mpSub').textContent = `${d.area ? `${d.area}, ${d.city} · ` : ''}Pin code ${d.pincode}${d.km > 8 ? ' · Outside local vehicle areas, courier and logistics still work' : ''}`;
          go.disabled = false;
        } catch (e) { err.textContent = e.message; }
      };
      map.onIdle(update);
      setTimeout(() => { map.resize(); update(); }, 60);
      el.querySelector('#mpGps').addEventListener('click', () => {
        if (!navigator.geolocation) { toast('Location is not available in this browser.', true); return; }
        navigator.geolocation.getCurrentPosition((pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 16), () => toast('Allow location access to use this.', true), { timeout: 8000 });
      });
      go.addEventListener('click', () => close(place));
    },
  });
  return result.finally(() => { if (map) map.destroy(); });
}
