// Durable storage: tracked in-memory maps are saved to a JSON file and restored at start,
// so accounts and bookings survive restarts. Swap for a database before real traffic.
'use strict';
const fs = require('fs');
const path = require('path');

const file = process.env.STATE_FILE || path.join(__dirname, '..', 'data', 'state.json');
const tracked = new Map();
let last = '';

const replacer = (k, v) => (v instanceof Map ? { __map: [...v] } : v instanceof Set ? { __set: [...v] } : v);
const reviver = (k, v) => (v && v.__map ? new Map(v.__map) : v && v.__set ? new Set(v.__set) : v);

function track(name, container) { tracked.set(name, container); return container; }
function load() {
  let saved;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8'), reviver); } catch (e) { if (e.code !== 'ENOENT') console.error('[store] could not read saved data:', e.message); return false; }
  for (const [name, c] of tracked) {
    const v = saved[name];
    if (v === undefined) continue;
    if (c instanceof Map) { c.clear(); v.forEach((val, key) => c.set(key, val)); } else if (Array.isArray(c)) c.splice(0, c.length, ...v);
  }
  return true;
}
function save() {
  const json = JSON.stringify(Object.fromEntries(tracked), replacer);
  if (json === last) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, json);
  fs.renameSync(`${file}.tmp`, file); // atomic, so a crash never leaves a half-written file
  last = json;
}
function start() {
  setInterval(() => { try { save(); } catch (e) { console.error('[store] save failed:', e.message); } }, 3000).unref();
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { save(); } catch (e) { /* exiting */ } process.exit(0); });
}
module.exports = { track, load, save, start, file };
