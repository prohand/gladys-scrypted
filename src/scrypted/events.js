// -----------------------------------------------------------------------------
// Scrypted events -> Gladys states and scene triggers.
//
// The session listens to every event of the server (`systemManager.listen`).
// An event says which device, which interface and property changed, and the
// new value. Three outcomes:
//   - a property behind a Gladys feature (motionDetected, on, batteryLevel…):
//     its state is published, unchanged values skipped;
//   - a transition worth a scene (no motion -> motion, doorbell pressed) or an
//     object detection: a scene event is fired (manifest `scene_triggers`),
//     with a fresh picture of the camera when the user asked for it;
//   - the device list changed (a camera added, renamed, an interface gained):
//     the runtime is told, and re-publishes the discovery list.
//
// One scene event per TRANSITION, never one per frame: the core admits 300
// events a minute, and an object detector reports several times a second.
// Detections of the same kind on the same camera are therefore merged for
// `detection_cooldown` seconds.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS, INTERFACES, featureSpecsOf, isCamera } from './features.js';
import { describeError } from './link.js';

const logger = createLogger({ name: 'events' });

// Scene trigger keys, as declared in the manifest `scene_triggers` field.
// Scenes store them: a published key is never renamed.
export const SCENE_TRIGGERS = {
  MOTION_DETECTED: 'motion_detected',
  DOORBELL_PRESSED: 'doorbell_pressed',
  OBJECT_DETECTED: 'object_detected',
};
export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGERS);

// The kinds of objects a scene can filter on (the `class` options of the
// `object_detected` trigger in the manifest). Whatever the detector calls it.
export const OBJECT_CLASSES = ['person', 'vehicle', 'animal', 'package', 'face', 'plate', 'other'];

// Names the usual detectors (Scrypted NVR, CoreML, OpenVINO, ONNX, TensorFlow
// Lite with COCO labels, camera-side detection) give to those kinds.
const CLASS_ALIASES = {
  people: 'person',
  car: 'vehicle',
  truck: 'vehicle',
  bus: 'vehicle',
  motorcycle: 'vehicle',
  motorbike: 'vehicle',
  bicycle: 'vehicle',
  boat: 'vehicle',
  dog: 'animal',
  cat: 'animal',
  bird: 'animal',
  horse: 'animal',
  sheep: 'animal',
  cow: 'animal',
  bear: 'animal',
  pet: 'animal',
  'license plate': 'plate',
  license_plate: 'plate',
  licenseplate: 'plate',
};

// Classes that are not objects: plain motion has its own trigger.
const IGNORED_CLASSES = new Set(['motion', 'audio', 'ring', 'doorbell']);

// Detections remembered for the status widget.
export const RECENT_DETECTIONS = 8;

// Device-level changes that alter what is offered to Gladys (the PTZ
// capabilities carry the presets list).
const DEVICE_LIST_PROPERTIES = new Set([
  'interfaces',
  'name',
  'type',
  'providedInterfaces',
  'ptzCapabilities',
]);

/**
 * The trigger class of a detector class name, or null when it is not an
 * object (plain motion).
 */
export function normalizeClass(className) {
  const name = String(className ?? '')
    .trim()
    .toLowerCase();
  if (!name || IGNORED_CLASSES.has(name)) {
    return null;
  }
  if (OBJECT_CLASSES.includes(name)) {
    return name;
  }
  return CLASS_ALIASES[name] ?? 'other';
}

export class EventRouter {
  /**
   * @param {object} options
   * @param {any} options.gladys
   * @param {import('./catalog.js').Catalog} options.catalog
   * @param {import('./snapshots.js').Snapshots} options.snapshots
   * @param {() => ReturnType<import('../config.js').normalizeConfig>} options.getConfig
   * @param {() => void} [options.onDevicesChanged]
   * @param {() => void} [options.onDetection] a scene event was fired
   * @param {(id: string) => boolean} [options.isEnabled] the camera is enabled in Gladys
   * @param {() => number} [options.now]
   */
  constructor({
    gladys,
    catalog,
    snapshots,
    getConfig,
    onDevicesChanged,
    onDetection,
    isEnabled,
    now,
  }) {
    this.gladys = gladys;
    this.isEnabled = isEnabled ?? (() => true);
    this.catalog = catalog;
    this.snapshots = snapshots;
    this.getConfig = getConfig;
    this.onDevicesChanged = onDevicesChanged ?? (() => {});
    this.onDetection = onDetection ?? (() => {});
    this.now = now ?? Date.now;
    // Last binary value per feature external id: what makes a transition.
    this.previous = new Map();
    // Last object event per device id and class: the cooldown.
    this.lastObjectEvent = new Map();
    /** @type {{ id: string, name: string, trigger: string, class?: string, label?: string, score?: number, at: number }[]} */
    this.recent = [];
  }

  /**
   * Remember the current values, so a motion already going on when the
   * session opens is not taken for a new one.
   */
  prime(states) {
    this.previous = new Map(states.map((s) => [s.device_feature_external_id, s.state]));
  }

  /** The handler given to `systemManager.listen`. */
  async handle(source, details, data) {
    const id = source?.id;
    if (id === undefined || !details) {
      return;
    }
    if (DEVICE_LIST_PROPERTIES.has(details.property)) {
      this.onDevicesChanged();
      return;
    }
    const device = this.catalog.get(id);
    if (!device) {
      return;
    }
    // A camera disabled in Gladys: what it sees stays in Scrypted.
    const hidden = isCamera(device) && !this.isEnabled(device.id);
    if (details.eventInterface === INTERFACES.OBJECT_DETECTOR) {
      if (!hidden) {
        await this.handleDetections(device, data);
      }
      return;
    }
    const spec = featureSpecsOf(device).find(
      (candidate) =>
        candidate.property === details.property &&
        (!details.eventInterface || details.eventInterface === candidate.interface),
    );
    if (spec && !(hidden && spec.key === FEATURE_KEYS.MOTION)) {
      await this.handleState(device, spec, data);
    }
  }

  async handleState(device, spec, value) {
    const state = spec.toState(value);
    if (state === undefined) {
      return;
    }
    const featureId = this.catalog.ids(device).feature(spec.key);
    const before = this.previous.get(featureId);
    this.previous.set(featureId, state);
    await this.gladys.publishChangedStates([{ device_feature_external_id: featureId, state }]);

    const rising = state === 1 && before !== 1;
    if (rising && spec.key === FEATURE_KEYS.MOTION) {
      await this.fire(device, SCENE_TRIGGERS.MOTION_DETECTED, {});
    } else if (rising && spec.key === FEATURE_KEYS.RING) {
      await this.fire(device, SCENE_TRIGGERS.DOORBELL_PRESSED, {});
    }
  }

  async handleDetections(device, detected) {
    const cooldownMs = this.getConfig().detection_cooldown * 1000;
    // The best detection of each kind in this frame.
    const best = new Map();
    for (const detection of detected?.detections ?? []) {
      const kind = normalizeClass(detection?.className);
      const score = Number(detection?.score);
      if (!kind) {
        continue;
      }
      const current = best.get(kind);
      if (!current || (Number.isFinite(score) && score > current.score)) {
        best.set(kind, {
          kind,
          label: typeof detection.label === 'string' ? detection.label.slice(0, 100) : '',
          score: Number.isFinite(score) ? score : 0,
        });
      }
    }
    for (const { kind, label, score } of best.values()) {
      const cooldownKey = `${device.id}:${kind}`;
      const last = this.lastObjectEvent.get(cooldownKey);
      if (last !== undefined && this.now() - last < cooldownMs) {
        continue;
      }
      this.lastObjectEvent.set(cooldownKey, this.now());
      await this.fire(device, SCENE_TRIGGERS.OBJECT_DETECTED, {
        class: kind,
        label,
        score: Math.round(Math.min(1, Math.max(0, score)) * 100),
      });
    }
  }

  /**
   * Fire one scene event. `data` holds only the keys the trigger declares
   * (`fields` and `variables`): the core drops the others.
   */
  async fire(device, trigger, extra) {
    const data = { device: this.catalog.externalId(device), device_name: device.name, ...extra };
    this.remember(device, trigger, extra);
    try {
      await this.gladys.publishSceneEvent(trigger, data);
    } catch (err) {
      // 429 when 300 events a minute are exceeded: the state is published
      // anyway, the scene is what is lost.
      logger.warn(`Scene event ${trigger} refused: ${describeError(err)}`);
    }
    this.onDetection();
    if (this.getConfig().snapshot_on_event && isCamera(device)) {
      this.snapshots
        .publish(device.id, 'event')
        .catch((err) => logger.debug(`No picture of ${device.name}: ${describeError(err)}`));
    }
  }

  remember(device, trigger, extra) {
    this.recent.unshift({ id: device.id, name: device.name, trigger, ...extra, at: this.now() });
    this.recent.length = Math.min(this.recent.length, RECENT_DETECTIONS);
  }
}
