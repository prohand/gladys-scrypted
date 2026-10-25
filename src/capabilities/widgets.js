// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+, manifest `widgets`).
//
// The content is declarative (`status`, `card-list`, `image`, `value`,
// `button`…): the core renders it with its own theme and translations.
//
//   - `scrypted_status`: the link (transport, server version, devices), the
//     last events seen (motion, doorbell, objects) and two buttons;
//   - `scrypted_camera`: the last picture of ONE camera (chosen in the widget
//     settings), its live motion tile and a "Take a picture" button.
//
// Both follow the runtime: index.js calls `refreshWidgets` when the link, the
// detections or the pictures change, so the TTL is only a safety net.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { SCENE_TRIGGERS } from '../scrypted/events.js';
import { FEATURE_KEYS, featureSpecsOf, isCamera } from '../scrypted/features.js';
import { describeError } from '../scrypted/link.js';

const logger = createLogger({ name: 'widgets' });

// Widget keys, as declared in the manifest. Dashboards store them.
export const STATUS_WIDGET = 'scrypted_status';
export const CAMERA_WIDGET = 'scrypted_camera';

const ACTIONS = { SYNC: 'sync', SNAPSHOT_ALL: 'snapshot_all', SNAPSHOT: 'snapshot' };

const CONNECTION = {
  local: {
    value: { en: 'Local', fr: 'Locale', de: 'Lokal', es: 'Local' },
    color: WIDGET_COLORS.SUCCESS,
  },
  cloud: {
    value: {
      en: 'Scrypted Cloud',
      fr: 'Scrypted Cloud',
      de: 'Scrypted Cloud',
      es: 'Scrypted Cloud',
    },
    color: WIDGET_COLORS.INFO,
  },
  unreachable: {
    value: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
    color: WIDGET_COLORS.DANGER,
  },
};

const EVENT_LABELS = {
  [SCENE_TRIGGERS.MOTION_DETECTED]: {
    en: 'Motion',
    fr: 'Mouvement',
    de: 'Bewegung',
    es: 'Movimiento',
  },
  [SCENE_TRIGGERS.DOORBELL_PRESSED]: {
    en: 'Doorbell',
    fr: 'Sonnette',
    de: 'Türklingel',
    es: 'Timbre',
  },
};

const CLASS_LABELS = {
  person: { en: 'Person', fr: 'Personne', de: 'Person', es: 'Persona' },
  vehicle: { en: 'Vehicle', fr: 'Véhicule', de: 'Fahrzeug', es: 'Vehículo' },
  animal: { en: 'Animal', fr: 'Animal', de: 'Tier', es: 'Animal' },
  package: { en: 'Package', fr: 'Colis', de: 'Paket', es: 'Paquete' },
  face: { en: 'Face', fr: 'Visage', de: 'Gesicht', es: 'Cara' },
  plate: { en: 'Plate', fr: 'Plaque', de: 'Kennzeichen', es: 'Matrícula' },
  other: { en: 'Object', fr: 'Objet', de: 'Objekt', es: 'Objeto' },
};

const EVENT_COLORS = {
  [SCENE_TRIGGERS.MOTION_DETECTED]: WIDGET_COLORS.INFO,
  [SCENE_TRIGGERS.DOORBELL_PRESSED]: WIDGET_COLORS.WARNING,
  [SCENE_TRIGGERS.OBJECT_DETECTED]: WIDGET_COLORS.PRIMARY,
};

function connectionItem(runtime) {
  const { link } = runtime;
  const { value, color } = CONNECTION[link.transport] ?? CONNECTION.unreachable;
  if (link.degraded) {
    return {
      label: { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
      icon: 'wifi',
      value: {
        en: `${value.en} (fallback)`,
        fr: `${value.fr} (secours)`,
        de: `${value.de} (Ersatz)`,
        es: `${value.es} (respaldo)`,
      },
      color: WIDGET_COLORS.WARNING,
    };
  }
  return {
    label: { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
    icon: 'wifi',
    value,
    color,
  };
}

function eventItem(event) {
  const what =
    event.trigger === SCENE_TRIGGERS.OBJECT_DETECTED
      ? (CLASS_LABELS[event.class] ?? CLASS_LABELS.other)
      : EVENT_LABELS[event.trigger];
  return {
    title: event.name.slice(0, 60),
    subtitle: event.label ? event.label.slice(0, 60) : undefined,
    date: new Date(event.at).toISOString(),
    badge: { text: what, color: EVENT_COLORS[event.trigger] },
  };
}

// A card-list item may not carry an `undefined` subtitle key.
const compact = (item) =>
  Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));

async function statusContent(runtime) {
  const { link, catalog, router } = runtime;
  const components = [
    {
      type: 'status',
      items: [
        connectionItem(runtime),
        {
          label: {
            en: 'Scrypted server',
            fr: 'Serveur Scrypted',
            de: 'Scrypted-Server',
            es: 'Servidor Scrypted',
          },
          icon: 'server',
          value: String(link.session?.serverVersion ?? '—').slice(0, 40),
          color: WIDGET_COLORS.NEUTRAL,
        },
        {
          label: { en: 'Devices', fr: 'Appareils', de: 'Geräte', es: 'Dispositivos' },
          icon: 'grid',
          value: catalog.list().length,
          color: WIDGET_COLORS.NEUTRAL,
        },
        {
          label: { en: 'Cameras', fr: 'Caméras', de: 'Kameras', es: 'Cámaras' },
          icon: 'video',
          value: catalog.cameras().length,
          color: WIDGET_COLORS.NEUTRAL,
        },
      ],
    },
  ];
  if (router.recent.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: router.recent.slice(0, 8).map((event) => compact(eventItem(event))),
    });
  } else {
    components.push({
      type: 'text',
      variant: 'caption',
      text: {
        en: 'No motion, ring or object seen yet.',
        fr: 'Aucun mouvement, coup de sonnette ou objet vu pour l’instant.',
        de: 'Noch keine Bewegung, kein Klingeln, kein Objekt erkannt.',
        es: 'Aún no se ha visto movimiento, timbre ni objeto.',
      },
    });
  }
  components.push(
    {
      type: 'button',
      label: { en: 'Synchronize', fr: 'Synchroniser', de: 'Synchronisieren', es: 'Sincronizar' },
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: ACTIONS.SYNC },
    },
    {
      type: 'button',
      label: {
        en: 'All pictures',
        fr: 'Toutes les images',
        de: 'Alle Bilder',
        es: 'Todas las imágenes',
      },
      icon: 'camera',
      style: 'secondary',
      action: { key: ACTIONS.SNAPSHOT_ALL },
    },
  );
  return { ttl_seconds: 300, components };
}

async function cameraContent(runtime, settings) {
  const externalId = typeof settings?.device === 'string' ? settings.device : '';
  const device = runtime.catalog.byExternalId(externalId);
  if (!device || !isCamera(device)) {
    return {
      ttl_seconds: 300,
      components: [
        {
          type: 'text',
          text: {
            en: 'Pick a Scrypted camera in the settings of this widget.',
            fr: 'Choisissez une caméra Scrypted dans les réglages de ce widget.',
            de: 'Wähle eine Scrypted-Kamera in den Einstellungen dieses Widgets.',
            es: 'Elija una cámara de Scrypted en los ajustes de este widget.',
          },
        },
      ],
    };
  }
  if (!runtime.privacy.isEnabled(device.id)) {
    return {
      ttl_seconds: 300,
      components: [
        {
          type: 'text',
          text: {
            en: `${device.name} is disabled in Gladys.`,
            fr: `${device.name} est désactivée dans Gladys.`,
            de: `${device.name} ist in Gladys deaktiviert.`,
            es: `${device.name} está desactivada en Gladys.`,
          },
        },
      ],
    };
  }
  let picture = runtime.snapshots.latest(device.id);
  if (!picture && runtime.session) {
    try {
      await runtime.snapshots.capture(device.id, 'event');
      picture = runtime.snapshots.latest(device.id);
    } catch (err) {
      logger.debug(`No picture of ${device.name} for the widget: ${describeError(err)}`);
    }
  }
  const components = [];
  if (picture) {
    components.push({ type: 'image', key: picture.key, alt: device.name, fit: 'contain' });
  } else {
    components.push({
      type: 'text',
      variant: 'caption',
      text: {
        en: 'No picture yet.',
        fr: 'Pas encore d’image.',
        de: 'Noch kein Bild.',
        es: 'Aún no hay imagen.',
      },
    });
  }
  // The motion tile is live: it follows the published states by itself.
  if (featureSpecsOf(device).some((spec) => spec.key === FEATURE_KEYS.MOTION)) {
    components.push({
      type: 'value',
      label: { en: 'Motion', fr: 'Mouvement', de: 'Bewegung', es: 'Movimiento' },
      icon: 'activity',
      device_feature: runtime.catalog.ids(device).feature(FEATURE_KEYS.MOTION),
    });
  }
  components.push({
    type: 'button',
    label: {
      en: 'Take a picture',
      fr: 'Prendre une image',
      de: 'Bild aufnehmen',
      es: 'Tomar una imagen',
    },
    icon: 'camera',
    style: 'primary',
    action: { key: ACTIONS.SNAPSHOT, params: { device: externalId } },
  });
  return { ttl_seconds: 60, components };
}

const DONE = {
  sync: (count) => ({
    en: `${count} devices synchronized.`,
    fr: `${count} appareils synchronisés.`,
    de: `${count} Geräte synchronisiert.`,
    es: `${count} dispositivos sincronizados.`,
  }),
  pictures: (count) => ({
    en: `${count} pictures taken.`,
    fr: `${count} images prises.`,
    de: `${count} Bilder aufgenommen.`,
    es: `${count} imágenes tomadas.`,
  }),
  picture: {
    en: 'Picture taken.',
    fr: 'Image prise.',
    de: 'Bild aufgenommen.',
    es: 'Imagen tomada.',
  },
  noPicture: {
    en: 'This camera gave no picture.',
    fr: 'Cette caméra n’a pas donné d’image.',
    de: 'Diese Kamera hat kein Bild geliefert.',
    es: 'Esta cámara no ha dado imagen.',
  },
};

export const WIDGETS = {
  [STATUS_WIDGET]: {
    get: (runtime) => statusContent(runtime),
    async action(runtime, { actionKey }) {
      logger.info(`Widget action ${STATUS_WIDGET}.${actionKey}`);
      if (actionKey === ACTIONS.SYNC) {
        return DONE.sync(await runtime.sync());
      }
      if (actionKey === ACTIONS.SNAPSHOT_ALL) {
        return DONE.pictures(await runtime.snapshots.publishAll('event'));
      }
      // Throwing acks the action as failed: the message reaches the user.
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
  [CAMERA_WIDGET]: {
    get: (runtime, { settings }) => cameraContent(runtime, settings),
    async action(runtime, { actionKey, params }) {
      logger.info(`Widget action ${CAMERA_WIDGET}.${actionKey}`);
      if (actionKey === ACTIONS.SNAPSHOT) {
        return (await runtime.snapshot(params.device)) ? DONE.picture : DONE.noPicture;
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};

/**
 * The bytes of a widget image (raw base64, no `data:` prefix). The key
 * changes with every picture, so an unknown key is a picture already
 * replaced: the dashboard re-pulls the content and gets the new key.
 */
export function widgetImage(runtime, key) {
  const image = runtime.snapshots.imageByKey(key);
  if (!image) {
    throw new Error(`Unknown widget image: ${key}`);
  }
  return image;
}

/**
 * Freshness nudge for every widget: rate-limited core-side (1 per 10 s per
 * widget) and dropped while disconnected, so it can be called freely.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
