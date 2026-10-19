// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module only provides the defaults
// and normalizes the received object, so the rest of the code never deals with
// `undefined`, a number typed as a string or an address without its scheme.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Address of the Scrypted server on the LAN, e.g. https://192.168.1.20:10443/
  local_url: '',
  // Address of the same server through Scrypted Cloud (the Cloud plugin).
  cloud_url: '',
  username: '',
  // Password, or better a login token (`npx scrypted login`). A secret field.
  password: '',
  // Seconds between two snapshots pushed to Gladys for each camera; 0 = off.
  snapshot_interval: 60,
  // Push a fresh snapshot when a camera sees motion, an object or a ring.
  snapshot_on_event: true,
  // Seconds during which a camera does not fire "object detected" again for
  // the same kind of object: a person walking by is one event, not thirty.
  detection_cooldown: 30,
  // Reserved key (NOT in config_schema): the manifest declares both 'local'
  // and 'cloud' in `transports`, so Gladys shows a standard "Prefer the local
  // connection" toggle and sends the user's choice here. Read-only.
  GLADYS_PREFER_LOCAL: true,
};

// Gladys accepts at most 12 camera images a minute per device: one every 5 s.
// The periodic snapshot never goes below 10 s, so the event snapshots still
// fit in between.
export const MIN_SNAPSHOT_INTERVAL = 10;

/**
 * A Scrypted address the client can resolve paths against: a scheme (https by
 * default, Scrypted serves its self-signed certificate on 10443) and a
 * trailing slash. Empty when nothing usable was typed.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeUrl(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    return '';
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    if (!url.pathname.endsWith('/')) {
      url.pathname = `${url.pathname}/`;
    }
    return url.toString();
  } catch {
    return '';
  }
}

function boundedNumber(raw, fallback, min, max) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const interval = boundedNumber(raw.snapshot_interval, DEFAULT_CONFIG.snapshot_interval, 0, 3600);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    local_url: normalizeUrl(raw.local_url),
    cloud_url: normalizeUrl(raw.cloud_url),
    username: typeof raw.username === 'string' ? raw.username.trim() : '',
    password: typeof raw.password === 'string' ? raw.password : '',
    snapshot_interval: interval === 0 ? 0 : Math.max(MIN_SNAPSHOT_INTERVAL, interval),
    snapshot_on_event: raw.snapshot_on_event !== false,
    detection_cooldown: boundedNumber(
      raw.detection_cooldown,
      DEFAULT_CONFIG.detection_cooldown,
      0,
      3600,
    ),
    // The preference is a boolean; anything but an explicit false means true.
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
  };
}

/**
 * The addresses to try, preferred first, each tagged with the transport it
 * stands for. Only the configured ones.
 * @param {ReturnType<typeof normalizeConfig>} config
 * @returns {{ transport: 'local' | 'cloud', url: string }[]}
 */
export function connectionCandidates(config) {
  const local = { transport: 'local', url: config.local_url };
  const cloud = { transport: 'cloud', url: config.cloud_url };
  const ordered = config.GLADYS_PREFER_LOCAL ? [local, cloud] : [cloud, local];
  return ordered.filter((candidate) => candidate.url);
}

/** Whether the config holds enough to try a connection. */
export function isConfigured(config) {
  return connectionCandidates(config).length > 0 && Boolean(config.username && config.password);
}
