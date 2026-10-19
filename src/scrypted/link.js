// -----------------------------------------------------------------------------
// The link to Scrypted: which address, and what to do when it drops.
//
// Scrypted can be reached two ways, and the manifest declares both
// (`"transports": ["local", "cloud"]`):
//   - local: the server on the LAN (https://<ip>:10443/);
//   - cloud: the same server through the Scrypted Cloud plugin.
// Gladys shows a "Prefer the local connection" toggle for that; its value is
// the reserved GLADYS_PREFER_LOCAL config key.
//
// The link tries the preferred address first and falls back on the other one.
// Running on the fallback is "degraded" (orange dot on the transport badge,
// with the reason), and the preferred address is tried again every few
// minutes so a LAN hiccup does not leave the link on the cloud for good. A
// session that drops is reopened with a growing delay.
//
// The link only knows sessions: what a session is used for (devices, events,
// snapshots) is the runtime's business, through `onUp` / `onDown`.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { connectionCandidates, isConfigured } from '../config.js';
import { localize, pick } from '../i18n.js';

const logger = createLogger({ name: 'link' });

// Delays before reopening a dropped or refused session: quick at first (a
// Scrypted restart takes a few seconds), then once a minute at most.
export const RECONNECT_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

// How often the preferred address is tried again while on the fallback.
export const PROMOTE_INTERVAL_MS = 10 * 60_000;

// A login or channel that hangs counts as a failure after this long.
export const OPEN_TIMEOUT_MS = 20_000;

// Why the badge is orange: the preferred address did not answer.
const PREFERRED_FAILED = {
  local: {
    en: 'The local address did not answer',
    fr: "L'adresse locale n'a pas répondu",
    de: 'Die lokale Adresse hat nicht geantwortet',
    es: 'La dirección local no respondió',
  },
  cloud: {
    en: 'Scrypted Cloud did not answer',
    fr: "Scrypted Cloud n'a pas répondu",
    de: 'Scrypted Cloud hat nicht geantwortet',
    es: 'Scrypted Cloud no respondió',
  },
};

/** Short, secret-free reason of a failed session, for logs and messages. */
export function describeError(err) {
  // The client races its transports with Promise.any: the AggregateError it
  // rejects with only says "All promises were rejected", the first one says why.
  const root = err instanceof AggregateError && err.errors?.length ? err.errors[0] : err;
  // Engine.IO transport errors carry the HTTP status apart ("xhr poll error", 404).
  const status = typeof root?.description === 'number' ? ` (HTTP ${root.description})` : '';
  const text = `${root?.message ?? root ?? 'unknown error'}${status}`;
  // A login answer can echo what was sent: never let it reach a message.
  return text.replace(/(password|token|authorization)\S*/gi, '$1=***').slice(0, 120);
}

function withTimeout(promise, ms, timers) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = timers.setTimeout(() => reject(new Error(`no answer after ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => timers.clearTimeout(timer));
}

export class ScryptedLink {
  /**
   * @param {object} options
   * @param {(target: { url: string, username: string, password: string }) => Promise<any>} options.openSession
   * @param {(session: any) => void | Promise<void>} [options.onUp] a session is ready
   * @param {() => void | Promise<void>} [options.onDown] the session is gone
   * @param {() => void | Promise<void>} [options.onStatus] transport or error changed
   * @param {{ setTimeout: Function, clearTimeout: Function, setInterval: Function, clearInterval: Function }} [options.timers]
   */
  constructor({ openSession, onUp, onDown, onStatus, timers = globalThis }) {
    this.openSession = openSession;
    this.onUp = onUp ?? (() => {});
    this.onDown = onDown ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
    this.timers = timers;
    this.config = null;
    this.session = null;
    this.transport = DEVICE_TRANSPORTS.UNREACHABLE;
    this.address = '';
    this.lastError = '';
    this.fallbackReason = '';
    this.attempt = 0;
    this.reconnectTimer = null;
    this.promoteTimer = null;
    // Bumped by every start/stop: a session opened for an older generation is
    // closed instead of being used.
    this.generation = 0;
  }

  get connected() {
    return this.session !== null;
  }

  /** Whether the link runs on the address the user did NOT prefer. */
  get degraded() {
    return this.connected && this.fallbackReason !== '';
  }

  /**
   * The transport badge entry of every device: the effective transport, and
   * the reason when it is the fallback (`{ degraded, message }`).
   */
  transportEntry() {
    if (!this.degraded) {
      return { transport: this.transport };
    }
    const reason = this.fallbackReason;
    const preferred = this.config?.GLADYS_PREFER_LOCAL ? 'local' : 'cloud';
    return {
      transport: this.transport,
      degraded: true,
      // The badge tooltip takes 200 characters per language.
      message: localize((language) =>
        `${pick(language, PREFERRED_FAILED[preferred])} (${reason}).`.slice(0, 200),
      ),
    };
  }

  /** (Re)start with a new config: closes the current session first. */
  async start(config) {
    await this.stop();
    this.config = config;
    this.attempt = 0;
    if (!isConfigured(config)) {
      this.lastError = 'not configured';
      await this.onStatus();
      return false;
    }
    return this.connect();
  }

  /** Close everything; no reconnection until the next start(). */
  async stop() {
    this.generation += 1;
    this.clearTimers();
    const hadSession = this.dropSession();
    this.transport = DEVICE_TRANSPORTS.UNREACHABLE;
    this.fallbackReason = '';
    if (hadSession) {
      await this.onDown();
    }
  }

  clearTimers() {
    if (this.reconnectTimer) {
      this.timers.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.promoteTimer) {
      this.timers.clearInterval(this.promoteTimer);
      this.promoteTimer = null;
    }
  }

  // Forget the current session without triggering the reconnection.
  dropSession() {
    const session = this.session;
    if (!session) {
      return false;
    }
    this.session = null;
    session.onClose = undefined;
    try {
      session.disconnect();
    } catch (err) {
      logger.debug('Closing the Scrypted session failed', describeError(err));
    }
    return true;
  }

  async tryOpen(candidate) {
    const { username, password } = this.config;
    return withTimeout(
      this.openSession({ url: candidate.url, username, password }),
      OPEN_TIMEOUT_MS,
      this.timers,
    );
  }

  /**
   * Try the addresses, preferred first. Resolves true once a session is up;
   * false when every address failed (a reconnection is then scheduled).
   */
  async connect() {
    const generation = this.generation;
    const candidates = connectionCandidates(this.config);
    const failures = [];
    for (const candidate of candidates) {
      let session;
      try {
        logger.info(`Connecting to Scrypted (${candidate.transport})...`);
        session = await this.tryOpen(candidate);
      } catch (err) {
        const reason = describeError(err);
        logger.warn(`Scrypted ${candidate.transport} connection failed: ${reason}`);
        failures.push({ candidate, reason });
        continue;
      }
      if (generation !== this.generation) {
        // A restart happened while this one was logging in.
        session.disconnect?.();
        return false;
      }
      await this.adopt(session, candidate, failures[0]?.reason ?? '');
      return true;
    }
    if (generation !== this.generation) {
      return false;
    }
    this.transport = DEVICE_TRANSPORTS.UNREACHABLE;
    this.lastError = failures.map((f) => `${f.candidate.transport}: ${f.reason}`).join(' / ');
    await this.onStatus();
    this.scheduleReconnect();
    return false;
  }

  async adopt(session, candidate, fallbackReason) {
    this.session = session;
    this.transport = candidate.transport;
    this.address = candidate.url;
    this.lastError = '';
    this.attempt = 0;
    this.fallbackReason = fallbackReason;
    const generation = this.generation;
    session.onClose = () => {
      if (generation === this.generation && this.session === session) {
        this.handleClose().catch((err) => logger.error('Reconnection failed', err));
      }
    };
    const version = session.serverVersion ? ` ${session.serverVersion}` : '';
    const fallback = fallbackReason ? ', fallback' : '';
    logger.info(`Connected to Scrypted${version} (${candidate.transport}${fallback})`);
    if (fallbackReason) {
      this.promoteTimer = this.timers.setInterval(() => {
        this.promote().catch((err) => logger.debug('Promotion failed', describeError(err)));
      }, PROMOTE_INTERVAL_MS);
    }
    await this.onUp(session);
    await this.onStatus();
  }

  async handleClose() {
    logger.warn('The Scrypted session closed');
    this.session = null;
    this.clearTimers();
    this.transport = DEVICE_TRANSPORTS.UNREACHABLE;
    this.fallbackReason = '';
    this.lastError = 'session closed';
    await this.onDown();
    await this.onStatus();
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)];
    this.attempt += 1;
    logger.info(`Next Scrypted connection attempt in ${delay / 1000} s`);
    const generation = this.generation;
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null;
      if (generation === this.generation) {
        this.connect().catch((err) => logger.error('Reconnection failed', err));
      }
    }, delay);
  }

  /**
   * On the fallback: try the preferred address again, and move to it when it
   * answers. The running session stays until the new one is up.
   */
  async promote() {
    if (!this.degraded) {
      return false;
    }
    const [preferred] = connectionCandidates(this.config);
    const generation = this.generation;
    let session;
    try {
      session = await this.tryOpen(preferred);
    } catch (err) {
      this.fallbackReason = describeError(err);
      await this.onStatus();
      return false;
    }
    if (generation !== this.generation || !this.degraded) {
      session.disconnect?.();
      return false;
    }
    logger.info(`Back on the preferred Scrypted address (${preferred.transport})`);
    this.clearTimers();
    this.dropSession();
    await this.onDown();
    await this.adopt(session, preferred, '');
    return true;
  }
}
