// -----------------------------------------------------------------------------
// What a Scrypted device becomes in Gladys.
//
// Scrypted describes a device by its `type` (Camera, Doorbell, Light,
// Switch, Lock…) and by the INTERFACES it implements (Camera, MotionSensor,
// OnOff, Battery…). Each interface carries properties (`motionDetected`,
// `on`, `batteryLevel`…) and Scrypted sends an event every time one changes.
//
// One entry below per Gladys feature: which interface brings it, which
// property feeds its state, how the value reads in Gladys and, for the
// features the user controls, which Scrypted method applies a value. A
// Scrypted device gets every feature whose interface it implements; a device
// with none (a plugin, an automation, a notifier) is not offered to Gladys.
//
// Feature keys end up in the external ids: they are forever.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

// Scrypted interface names (`ScryptedInterface` of @scrypted/types).
export const INTERFACES = {
  CAMERA: 'Camera',
  MOTION_SENSOR: 'MotionSensor',
  BINARY_SENSOR: 'BinarySensor',
  OBJECT_DETECTOR: 'ObjectDetector',
  ON_OFF: 'OnOff',
  BRIGHTNESS: 'Brightness',
  BATTERY: 'Battery',
  THERMOMETER: 'Thermometer',
  HUMIDITY_SENSOR: 'HumiditySensor',
  ENTRY_SENSOR: 'EntrySensor',
  LOCK: 'Lock',
  PAN_TILT_ZOOM: 'PanTiltZoom',
};

// `PanTiltZoomMovement` of @scrypted/types.
export const PTZ_MOVEMENTS = { RELATIVE: 'Relative', PRESET: 'Preset' };

// One step of a Gladys move: a tenth of the range (pan / tilt -1..1, zoom
// 0..1), relative to where the camera stands. The step also carries a
// duration, so a plugin that runs it as a continuous move stops by itself: a
// lost stop must never leave a camera turning against its end stop.
export const PTZ_STEP = 0.1;
export const PTZ_STEP_TIMEOUT_MS = 1_000;

/**
 * The values of the Gladys `move` feature (SDK camera / move): 0 is stop,
 * always accepted and never listed. `axis` is the capability that brings it.
 */
export const PTZ_MOVES = {
  1: { axis: 'pan', delta: -PTZ_STEP, label: 'Pan left' },
  2: { axis: 'pan', delta: PTZ_STEP, label: 'Pan right' },
  3: { axis: 'tilt', delta: PTZ_STEP, label: 'Tilt up' },
  4: { axis: 'tilt', delta: -PTZ_STEP, label: 'Tilt down' },
  5: { axis: 'zoom', delta: PTZ_STEP, label: 'Zoom in' },
  6: { axis: 'zoom', delta: -PTZ_STEP, label: 'Zoom out' },
};

// Scrypted device types (`ScryptedDeviceType` of @scrypted/types) the mapping
// looks at.
export const DEVICE_TYPES = {
  CAMERA: 'Camera',
  DOORBELL: 'Doorbell',
  LIGHT: 'Light',
  SIREN: 'Siren',
  BUILTIN: 'Builtin',
  INTERNAL: 'Internal',
};

// Feature keys (the last part of the feature external ids).
export const FEATURE_KEYS = {
  IMAGE: 'image',
  ENABLED: 'enabled',
  MOTION: 'motion',
  RING: 'ring',
  ON: 'on',
  BRIGHTNESS: 'brightness',
  BATTERY: 'battery',
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  OPENING: 'opening',
  LOCK: 'lock',
  PTZ_MOVE: 'ptz-move',
  PTZ_PRESET: 'ptz-preset',
};

const binary = (value) => (value === true || value === 1 ? 1 : 0);

// A number Gladys can store, or undefined (nothing published).
const finite = (value, digits = 0) => {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) {
    return undefined;
  }
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const hasType = (type) => (device) => device.type === type;

// A light is a light and a siren a siren in Gladys too: the dashboard and the
// voice commands depend on the category. Each has its own `binary` type.
const ON_OFF_FEATURES = {
  [DEVICE_TYPES.LIGHT]: { category: CATEGORIES.LIGHT, type: TYPES.LIGHT.BINARY },
  [DEVICE_TYPES.SIREN]: { category: CATEGORIES.SIREN, type: TYPES.SIREN.BINARY },
};
const SWITCH_FEATURE = { category: CATEGORIES.SWITCH, type: TYPES.SWITCH.BINARY };

/** The Gladys move values a PTZ camera supports, from its `ptzCapabilities`. */
export function ptzMovesOf(device) {
  const capabilities = device.ptz ?? {};
  return Object.keys(PTZ_MOVES)
    .map(Number)
    .filter((value) => capabilities[PTZ_MOVES[value].axis] === true);
}

/**
 * The presets of a PTZ camera as Gladys options: `{ value, id, label }`.
 * Scrypted keys them by id (a string): numeric ids keep their number as the
 * Gladys value, so a scene keeps its preset when another one is added; other
 * ids take their position in the list, from 1.
 */
export function ptzPresetsOf(device) {
  const entries = Object.entries(device.ptz?.presets ?? {});
  const numeric = entries.every(([id]) => /^[1-9]\d{0,8}$/.test(id));
  return entries.map(([id, name], index) => ({
    value: numeric ? Number(id) : index + 1,
    id,
    label: String(name || id).slice(0, 100),
  }));
}

async function ptzMove(proxy, value) {
  if (value === 0) {
    // Steps end by themselves (see PTZ_STEP_TIMEOUT_MS): nothing to stop.
    return undefined;
  }
  const move = PTZ_MOVES[value];
  if (!move) {
    throw new Error(`Unknown PTZ move ${value}`);
  }
  return proxy.ptzCommand({
    movement: PTZ_MOVEMENTS.RELATIVE,
    [move.axis]: move.delta,
    timeout: PTZ_STEP_TIMEOUT_MS,
  });
}

/**
 * @typedef {object} FeatureSpec
 * @property {string} key feature key, part of the external id (forever)
 * @property {string} interface Scrypted interface that brings it
 * @property {(device: ScryptedDeviceInfo) => boolean} [when] extra condition
 * @property {string} [property] Scrypted property holding the state
 * @property {(value: unknown) => number | undefined} [toState] property -> Gladys state
 * @property {(device: any, value: number, info: ScryptedDeviceInfo) => Promise<unknown>} [apply]
 *   Gladys value -> Scrypted call, on the device proxy
 * @property {(device: ScryptedDeviceInfo) => object} describe the Gladys feature, minus its external id
 *
 * @typedef {object} ScryptedDeviceInfo
 * @property {string} id Scrypted device id
 * @property {string} name
 * @property {string} type Scrypted device type
 * @property {string[]} interfaces
 * @property {{ pan?: boolean, tilt?: boolean, zoom?: boolean,
 *   presets?: Record<string, string> } | null} [ptz] `ptzCapabilities`
 */

/** @type {FeatureSpec[]} */
export const FEATURE_SPECS = [
  {
    key: FEATURE_KEYS.IMAGE,
    interface: INTERFACES.CAMERA,
    // Images take their own channel (publishCameraImage / onGetImage), never
    // the states history.
    describe: () => ({
      name: 'Image',
      category: CATEGORIES.CAMERA,
      type: TYPES.CAMERA.IMAGE,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      min: 0,
      max: 0,
    }),
  },
  {
    // The Gladys-side privacy gate (see privacy.js): no Scrypted property,
    // the runtime keeps and applies it.
    key: FEATURE_KEYS.ENABLED,
    interface: INTERFACES.CAMERA,
    describe: () => ({
      name: 'Enabled in Gladys',
      category: CATEGORIES.CAMERA,
      type: TYPES.CAMERA.ENABLED,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    }),
  },
  {
    key: FEATURE_KEYS.MOTION,
    interface: INTERFACES.MOTION_SENSOR,
    property: 'motionDetected',
    toState: binary,
    describe: () => ({
      name: 'Motion',
      category: CATEGORIES.MOTION_SENSOR,
      type: TYPES.SENSOR.BINARY,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 1,
    }),
  },
  {
    // A doorbell button is a BinarySensor on a device typed Doorbell. Other
    // binary sensors mean too many different things to guess one.
    key: FEATURE_KEYS.RING,
    interface: INTERFACES.BINARY_SENSOR,
    when: hasType(DEVICE_TYPES.DOORBELL),
    property: 'binaryState',
    toState: binary,
    describe: () => ({
      name: 'Ring',
      category: CATEGORIES.DOORBELL,
      type: TYPES.DOORBELL.RING,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 1,
    }),
  },
  {
    key: FEATURE_KEYS.ON,
    interface: INTERFACES.ON_OFF,
    property: 'on',
    toState: binary,
    apply: (device, value) => (value === 1 ? device.turnOn() : device.turnOff()),
    describe: (device) => ({
      name: 'On/Off',
      ...(ON_OFF_FEATURES[device.type] ?? SWITCH_FEATURE),
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    }),
  },
  {
    key: FEATURE_KEYS.BRIGHTNESS,
    interface: INTERFACES.BRIGHTNESS,
    property: 'brightness',
    toState: (value) => finite(value),
    apply: (device, value) => device.setBrightness(Math.min(100, Math.max(0, value))),
    describe: () => ({
      name: 'Brightness',
      category: CATEGORIES.LIGHT,
      type: TYPES.LIGHT.BRIGHTNESS,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      unit: UNITS.PERCENT,
      min: 0,
      max: 100,
    }),
  },
  {
    key: FEATURE_KEYS.BATTERY,
    interface: INTERFACES.BATTERY,
    property: 'batteryLevel',
    toState: (value) => finite(value),
    describe: () => ({
      name: 'Battery',
      category: CATEGORIES.BATTERY,
      type: TYPES.BATTERY.INTEGER,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      unit: UNITS.PERCENT,
      min: 0,
      max: 100,
    }),
  },
  {
    // Scrypted always stores Celsius; `temperatureUnit` is a display choice.
    key: FEATURE_KEYS.TEMPERATURE,
    interface: INTERFACES.THERMOMETER,
    property: 'temperature',
    toState: (value) => finite(value, 1),
    describe: () => ({
      name: 'Temperature',
      category: CATEGORIES.TEMPERATURE_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      unit: UNITS.CELSIUS,
      min: -50,
      max: 100,
    }),
  },
  {
    key: FEATURE_KEYS.HUMIDITY,
    interface: INTERFACES.HUMIDITY_SENSOR,
    property: 'humidity',
    toState: (value) => finite(value, 1),
    describe: () => ({
      name: 'Humidity',
      category: CATEGORIES.HUMIDITY_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      unit: UNITS.PERCENT,
      min: 0,
      max: 100,
    }),
  },
  {
    // `entryOpen` is true, false or 'jammed': a jammed door is not closed.
    key: FEATURE_KEYS.OPENING,
    interface: INTERFACES.ENTRY_SENSOR,
    property: 'entryOpen',
    toState: (value) => (value === false ? 0 : value == null ? undefined : 1),
    describe: () => ({
      name: 'Opening',
      category: CATEGORIES.OPENING_SENSOR,
      type: TYPES.SENSOR.BINARY,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 1,
    }),
  },
  {
    // Gladys reads 1 as locked. A jammed lock publishes nothing: neither
    // value would be true.
    key: FEATURE_KEYS.LOCK,
    interface: INTERFACES.LOCK,
    property: 'lockState',
    toState: (value) => (value === 'Locked' ? 1 : value === 'Unlocked' ? 0 : undefined),
    apply: (device, value) => (value === 1 ? device.lock() : device.unlock()),
    describe: () => ({
      name: 'Lock',
      category: CATEGORIES.LOCK,
      type: TYPES.LOCK.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    }),
  },
  {
    // Motorized cameras: one step per command, in the directions the camera
    // declares. No state: a step is an order, not a position.
    key: FEATURE_KEYS.PTZ_MOVE,
    interface: INTERFACES.PAN_TILT_ZOOM,
    when: (device) => ptzMovesOf(device).length > 0,
    apply: (device, value) => ptzMove(device, value),
    describe: (device) => ({
      name: 'PTZ',
      category: CATEGORIES.CAMERA,
      type: TYPES.CAMERA.MOVE,
      read_only: false,
      has_feedback: false,
      keep_history: false,
      min: 0,
      max: 6,
      supported_options: ptzMovesOf(device).map((value, index) => ({
        value,
        label: PTZ_MOVES[value].label,
        sort_order: index,
      })),
    }),
  },
  {
    // The positions saved in the camera. Re-published with the device list
    // when they change, so a renamed preset shows its new name.
    key: FEATURE_KEYS.PTZ_PRESET,
    interface: INTERFACES.PAN_TILT_ZOOM,
    when: (device) => ptzPresetsOf(device).length > 0,
    apply: (device, value, info) => {
      const preset = ptzPresetsOf(info).find((option) => option.value === value);
      if (!preset) {
        throw new Error(`Unknown PTZ preset ${value}`);
      }
      return device.ptzCommand({ movement: PTZ_MOVEMENTS.PRESET, preset: preset.id });
    },
    describe: (device) => {
      const presets = ptzPresetsOf(device);
      const values = presets.map((preset) => preset.value);
      return {
        name: 'Preset',
        category: CATEGORIES.CAMERA,
        type: TYPES.CAMERA.PRESET,
        read_only: false,
        has_feedback: false,
        keep_history: false,
        min: Math.min(...values),
        max: Math.max(...values),
        supported_options: presets.map((preset, index) => ({
          value: preset.value,
          label: preset.label,
          sort_order: index,
        })),
      };
    },
  },
];

/** The feature specs a Scrypted device gets, in the order above. */
export function featureSpecsOf(device) {
  if (device.type === DEVICE_TYPES.BUILTIN || device.type === DEVICE_TYPES.INTERNAL) {
    return [];
  }
  const interfaces = new Set(device.interfaces ?? []);
  return FEATURE_SPECS.filter(
    (spec) => interfaces.has(spec.interface) && (spec.when?.(device) ?? true),
  );
}

/** Whether a Scrypted device can give Gladys a picture. */
export function isCamera(device) {
  return (device.interfaces ?? []).includes(INTERFACES.CAMERA);
}

/** The spec of one feature key. */
export function specByKey(key) {
  return FEATURE_SPECS.find((spec) => spec.key === key);
}
