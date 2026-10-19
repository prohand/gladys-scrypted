// -----------------------------------------------------------------------------
// Opening one Scrypted session.
//
// The official client (`@scrypted/client`) logs in over HTTPS (`/login`), then
// opens an Engine.IO RPC channel to the `@scrypted/core` plugin: the same
// channel the Scrypted web console uses. Through it, `systemManager` gives the
// device list and its live events, and `mediaManager` turns a camera picture
// into JPEG bytes.
//
// Two things the client does on its own that an integration must not:
//   - it races every address the server advertises (LAN, public, Scrypted
//     Cloud) and keeps the first that answers. The integration chooses the
//     transport itself (the "Prefer the local connection" toggle), so `local`
//     and `direct` are forced off: the session goes to the address given,
//     and nowhere else;
//   - it prints its login answer — bearer token included — with console.log.
//     `redactConsole` filters every console line of the process once.
// -----------------------------------------------------------------------------

import { connectScryptedClient } from '@scrypted/client';

// Keys whose value never reaches a log line, whatever object carries them.
const SECRET_KEYS = new Set([
  'authorization',
  'Authorization',
  'token',
  'queryToken',
  'password',
  'scryptedToken',
]);

/**
 * A copy of `value` where every secret key, at any depth, reads `***`.
 * Anything that is not a plain object or an array is returned as is.
 */
export function redactSecrets(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  const isPlain = Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype;
  if (!isPlain) {
    return value;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, seen));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEYS.has(key) && item != null ? '***' : redactSecrets(item, seen),
    ]),
  );
}

let consoleRedacted = false;

/**
 * Filter the secrets out of every console.log / console.error argument of
 * the process. Idempotent. The SDK logger writes through the console too,
 * which is why this filters arguments instead of muting a module.
 */
export function redactConsole(target = console) {
  if (consoleRedacted && target === console) {
    return;
  }
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = target[method].bind(target);
    target[method] = (...args) => original(...args.map((arg) => redactSecrets(arg)));
  }
  if (target === console) {
    consoleRedacted = true;
  }
}

/**
 * Log in and open the RPC channel to one Scrypted address.
 * @param {{ url: string, username: string, password: string }} options
 * @returns {Promise<import('@scrypted/client').ScryptedClientStatic>}
 */
export async function openScryptedSession({ url, username, password }) {
  redactConsole();
  return connectScryptedClient({
    baseUrl: url,
    pluginId: '@scrypted/core',
    clientName: 'gladys',
    username,
    password,
    // Stay on the address given: the transport is Gladys' choice (see above).
    local: false,
    direct: false,
  });
}
