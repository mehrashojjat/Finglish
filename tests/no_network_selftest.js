'use strict';
// Positive control: with the preload active, every way of reaching the network must throw. node tests/no_network_selftest.js
const pre = require('./no_network_preload');
const tries = {
  'fetch': () => fetch('https://example.com/request?text=a'),
  'https.get': () => require('https').get('https://example.com/'),
  'http.request': () => require('http').request('http://example.com/'),
  'net.connect': () => require('net').connect(80, 'example.com'),
  'tls.connect': () => require('tls').connect(443, 'example.com'),
  'dns.lookup': () => require('dns').lookup('example.com', () => {}),
  'child_process (curl)': () => require('child_process').execSync('curl -s https://example.com'),
};
let bad = 0;
for (const [name, fn] of Object.entries(tries)) {
  let blocked = false;
  try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch (e) { blocked = /NETWORK ACCESS ATTEMPTED/.test(e.message); }
  console.log((blocked ? 'PASS ' : 'FAIL ') + name + ' is blocked');
  if (!blocked) bad++;
}
pre.attempts.length = 0;            // the attempts above were the point; don't let the preload flag them
process.exitCode = bad ? 1 : 0;
