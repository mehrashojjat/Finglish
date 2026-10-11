'use strict';
/**
 * Preload (node -r tests/no_network_preload.js …): makes ANY attempt to touch the network throw, and records it.
 * Used to prove the engine is pure computation: run the whole test-suite / evaluation / parity generation with this and nothing may trip.
 * Blocks: TCP/TLS sockets (net.Socket.connect, tls.connect), UDP, DNS, http(s).request/get, fetch, WebSocket, child processes that could
 * shell out to curl/ssh.
 */
const attempts = [];
const boom = what => { attempts.push(what); throw new Error('NETWORK ACCESS ATTEMPTED: ' + what); };

const net = require('net');
net.Socket.prototype.connect = function () { boom('net.Socket.connect'); };
net.connect = net.createConnection = function () { boom('net.connect'); };
const tls = require('tls'); tls.connect = function () { boom('tls.connect'); };
const dgram = require('dgram'); dgram.createSocket = function () { boom('dgram.createSocket'); };
const dns = require('dns');
for (const f of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny']) dns[f] = function () { boom('dns.' + f); };
if (dns.promises) for (const f of ['lookup', 'resolve', 'resolve4', 'resolve6']) dns.promises[f] = function () { boom('dns.promises.' + f); };
for (const m of ['http', 'https']) { const mod = require(m); mod.request = mod.get = function () { boom(m + '.request'); }; }
if (typeof globalThis.fetch === 'function') globalThis.fetch = function () { boom('fetch'); };
if (typeof globalThis.WebSocket === 'function') globalThis.WebSocket = function () { boom('WebSocket'); };
const cp = require('child_process');
for (const f of ['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) {
  const orig = cp[f];
  // node's own test runner spawns node child processes; allow exactly those (they inherit this preload through NODE_OPTIONS)
  cp[f] = function (cmd, ...rest) { if (typeof cmd === 'string' && /(^|\/)node$/.test(cmd.split(' ')[0])) return orig.call(this, cmd, ...rest); if (cmd === process.execPath) return orig.call(this, cmd, ...rest); boom('child_process.' + f + '(' + cmd + ')'); };
}
process.on('exit', code => { if (attempts.length && code === 0) { console.error('no_network_preload: network attempts recorded:', attempts); process.exitCode = 99; } });
module.exports = { attempts };
