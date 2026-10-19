// -----------------------------------------------------------------------------
// The running integration: one Scrypted link and what hangs on it.
//
// index.js only wires the SDK handlers to this object. Everything that
// depends on the session lives here, so the tests drive it with a fake
// Gladys (the SDK's) and a fake Scrypted (test/helpers/fakeScrypted.js):
//   - session up   -> device list published, current states, live events,
//                     periodic pictures, transport badge, connection status;
//   - session down -> events and pictures stopped, badge "unreachable";
//   - config saved -> everything restarted with the new values.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { localize, pick } from './i18n.js';
import { Catalog } from './scrypted/catalog.js';
import { EventRouter } from './scrypted/events.js';
import { specByKey, isCamera } from './scrypted/features.js';
import { ScryptedLink, describeError } from './scrypted/link.js';
import { openScryptedSession } from './scrypted/session.js';
import { Snapshots } from './scrypted/snapshots.js';

const logger = createLogger({ name: 'runtime' });

// Scrypted announces a device change property by property: wait for the
// burst to end before re-publishing the device list.
export const RESYNC_DELAY_MS = 3_000;

// publishTransports takes 100 entries per request.
const TRANSPORT_BATCH = 100;

const TRANSPORT_LABELS = {
  local: {
    en: 'the local network',
    fr: 'le réseau local',
    de: 'das lokale Netzwerk',
    es: 'la red local',
  },
  cloud: { en: 'Scrypted Cloud', fr: 'Scrypted Cloud', de: 'Scrypted Cloud', es: 'Scrypted Cloud' },
};

/** An address fit for a message: no user or password in it. */
export function displayUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export const MESSAGES = {
  notConfigured: {
    en: 'Fill in the Scrypted address, the user name and the password (or login token).',
    fr: "Renseignez l'adresse de Scrypted, le nom d'utilisateur et le mot de passe (ou le jeton de connexion).",
    de: 'Gib die Scrypted-Adresse, den Benutzernamen und das Passwort (oder Login-Token) ein.',
    es: 'Indique la dirección de Scrypted, el nombre de usuario y la contraseña (o el token de acceso).',
  },
  unreachable: (reason) =>
    localize((language) =>
      pick(language, {
        en: `Scrypted does not answer (${reason}). Check the address and the account.`,
        fr: `Scrypted ne répond pas (${reason}). Vérifiez l'adresse et le compte.`,
        de: `Scrypted antwortet nicht (${reason}). Prüfe die Adresse und das Konto.`,
        es: `Scrypted no responde (${reason}). Compruebe la dirección y la cuenta.`,
      }).slice(0, 300),
    ),
};

export class Runtime {
  /**
   * @param {object} options
   * @param {any} options.gladys
   * @param {(target: object) => Promise<any>} [options.openSession]
   * @param {() => void} [options.onWidgetsStale] the widgets show old data
   * @param {object} [options.timers]
   * @param {() => number} [options.now]
   */
  constructor({
    gladys,
    openSession = openScryptedSession,
    onWidgetsStale,
    timers = globalThis,
    now = Date.now,
  }) {
    this.gladys = gladys;
    this.timers = timers;
    this.onWidgetsStale = onWidgetsStale ?? (() => {});
    this.config = null;
    this.listener = null;
    this.resyncTimer = null;
    this.catalog = new Catalog(gladys);
    this.snapshots = new Snapshots({
      gladys,
      catalog: this.catalog,
      getSession: () => this.link.session,
      onPicture: () => this.onWidgetsStale(),
      now,
      timers,
    });
    this.router = new EventRouter({
      gladys,
      catalog: this.catalog,
      snapshots: this.snapshots,
      getConfig: () => this.config,
      onDevicesChanged: () => this.scheduleResync(),
      onDetection: () => this.onWidgetsStale(),
      now,
    });
    this.link = new ScryptedLink({
      openSession,
      timers,
      onUp: (session) => this.handleUp(session),
      onDown: () => this.handleDown(),
      onStatus: () => this.handleStatus(),
    });
  }

  get session() {
    return this.link.session;
  }

  /** Start, or restart with a new config. Resolves whether Scrypted answered. */
  async start(config) {
    this.config = config;
    return this.link.start(config);
  }

  async stop() {
    this.cancelResync();
    await this.link.stop();
  }

  async handleUp(session) {
    this.catalog.refresh(session);
    await this.publishDevices();
    const states = this.catalog.currentStates(session);
    this.router.prime(states);
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states);
    }
    this.listener = session.systemManager.listen((source, details, data) =>
      this.router
        .handle(source, details, data)
        .catch((err) => logger.warn(`Scrypted event not handled: ${describeError(err)}`)),
    );
    this.snapshots.start(this.config.snapshot_interval);
    logger.info(
      `${this.catalog.list().length} Scrypted devices, ${this.catalog.cameras().length} cameras`,
    );
  }

  async handleDown() {
    this.cancelResync();
    this.snapshots.stop();
    try {
      this.listener?.removeListener();
    } catch (err) {
      logger.debug('Removing the Scrypted listener failed', describeError(err));
    }
    this.listener = null;
  }

  async handleStatus() {
    await this.publishTransports();
    await this.reportConnection();
    this.onWidgetsStale();
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(this.catalog.buildDiscoveredDevices());
  }

  /** The transport badge of every device: they all share the one link. */
  async publishTransports() {
    const entry = this.link.transportEntry();
    const entries = this.catalog
      .list()
      .map((device) => ({ external_id: this.catalog.externalId(device), ...entry }));
    for (let i = 0; i < entries.length; i += TRANSPORT_BATCH) {
      await this.gladys.publishTransports(entries.slice(i, i + TRANSPORT_BATCH));
    }
  }

  async reportConnection() {
    if (this.link.connected) {
      await this.gladys.setConnectionStatus(true);
    } else if (!this.config || !isConfigured(this.config)) {
      await this.gladys.setConnectionStatus(false, MESSAGES.notConfigured);
    } else {
      await this.gladys.setConnectionStatus(false, MESSAGES.unreachable(this.link.lastError));
    }
  }

  scheduleResync() {
    if (this.resyncTimer) {
      return;
    }
    this.resyncTimer = this.timers.setTimeout(() => {
      this.resyncTimer = null;
      this.sync().catch((err) => logger.warn(`Device list not refreshed: ${describeError(err)}`));
    }, RESYNC_DELAY_MS);
  }

  cancelResync() {
    if (this.resyncTimer) {
      this.timers.clearTimeout(this.resyncTimer);
      this.resyncTimer = null;
    }
  }

  /** Read the device list again and publish it. Resolves the device count. */
  async sync() {
    const session = this.link.session;
    if (!session) {
      throw new Error('Scrypted is not connected');
    }
    this.catalog.refresh(session);
    this.snapshots.prune();
    await this.publishDevices();
    await this.publishTransports();
    this.onWidgetsStale();
    return this.catalog.list().length;
  }

  /** The Scrypted device behind a Gladys device, or an error that says why not. */
  scryptedDevice(externalId) {
    const device = this.catalog.byExternalId(externalId);
    if (!device) {
      throw new Error(`Unknown Scrypted device ${externalId}`);
    }
    return device;
  }

  /** onSetValue: apply a Gladys command through the Scrypted interface. */
  async setValue(gladysDevice, feature, value) {
    const session = this.link.session;
    if (!session) {
      throw new Error('Scrypted is not connected');
    }
    const device = this.scryptedDevice(gladysDevice.external_id);
    const key = feature.external_id.slice(gladysDevice.external_id.length + 1);
    const spec = specByKey(key);
    if (!spec?.apply) {
      throw new Error(`The feature ${feature.external_id} cannot be controlled`);
    }
    await spec.apply(session.systemManager.getDeviceById(device.id), Number(value));
    // has_feedback: the state comes back as a Scrypted event, confirmed by
    // the device. Nothing published here.
  }

  /** onGetImage: a fresh picture of a camera. */
  async getImage(gladysDevice) {
    const device = this.scryptedDevice(gladysDevice.external_id);
    return this.snapshots.capture(device.id, 'event');
  }

  /**
   * Take a picture of a camera chosen by its Gladys external id, and push it
   * to Gladys. Resolves whether a picture was taken.
   */
  async snapshot(externalId) {
    const device = this.catalog.byExternalId(externalId);
    if (!device || !isCamera(device) || !this.link.session) {
      return false;
    }
    const image = await this.snapshots.capture(device.id, 'event');
    await this.gladys.publishCameraImage(externalId, image);
    return true;
  }

  /** The answer of the "Test the connection" button. */
  async testConnection() {
    if (!this.config || !isConfigured(this.config)) {
      return MESSAGES.notConfigured;
    }
    if (!this.link.connected) {
      // Do not wait for the next scheduled attempt.
      this.link.clearTimers();
      await this.link.connect();
    }
    if (!this.link.connected) {
      return MESSAGES.unreachable(this.link.lastError);
    }
    const devices = this.catalog.list().length;
    const cameras = this.catalog.cameras().length;
    const version = this.link.session.serverVersion ?? '?';
    const address = displayUrl(this.link.address);
    const via = TRANSPORT_LABELS[this.link.transport];
    const degraded = this.link.degraded;
    return localize((language) =>
      pick(language, {
        en: `Connected to Scrypted ${version} through ${via.en} (${address}): ${devices} devices, ${cameras} cameras.${
          degraded ? ' The preferred address did not answer.' : ''
        }`,
        fr: `Connecté à Scrypted ${version} par ${via.fr} (${address}) : ${devices} appareils, ${cameras} caméras.${
          degraded ? " L'adresse préférée n'a pas répondu." : ''
        }`,
        de: `Mit Scrypted ${version} über ${via.de} verbunden (${address}): ${devices} Geräte, ${cameras} Kameras.${
          degraded ? ' Die bevorzugte Adresse hat nicht geantwortet.' : ''
        }`,
        es: `Conectado a Scrypted ${version} a través de ${via.es} (${address}): ${devices} dispositivos, ${cameras} cámaras.${
          degraded ? ' La dirección preferida no respondió.' : ''
        }`,
      }),
    );
  }

  /** The answer of the "Synchronize the devices" button. */
  async syncMessage() {
    if (!this.link.session) {
      return this.config && isConfigured(this.config)
        ? MESSAGES.unreachable(this.link.lastError)
        : MESSAGES.notConfigured;
    }
    const count = await this.sync();
    return localize((language) =>
      pick(language, {
        en: `${count} Scrypted devices sent to Gladys: add the ones you want from the Discover tab.`,
        fr: `${count} appareils Scrypted envoyés à Gladys : ajoutez ceux que vous voulez depuis l'onglet Découverte.`,
        de: `${count} Scrypted-Geräte an Gladys gesendet: Füge die gewünschten im Tab Entdecken hinzu.`,
        es: `${count} dispositivos de Scrypted enviados a Gladys: añada los que quiera desde la pestaña Descubrir.`,
      }),
    );
  }
}
