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
  MOTION: 'motion',
  RING: 'ring',
  ON: 'on',
  BRIGHTNESS: 'brightness',
  BATTERY: 'battery',
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  OPENING: 'opening',
  LOCK: 'lock',
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

const ON_OFF_CATEGORIES = {
  [DEVICE_TYPES.LIGHT]: CATEGORIES.LIGHT,
  [DEVICE_TYPES.SIREN]: CATEGORIES.SIREN,
};

/**
 * @typedef {object} FeatureSpec
 * @property {string} key feature key, part of the external id (forever)
 * @property {string} interface Scrypted interface that brings it
 * @property {(device: ScryptedDeviceInfo) => boolean} [when] extra condition
 * @property {string} [property] Scrypted property holding the state
 * @property {(value: unknown) => number | undefined} [toState] property -> Gladys state
 * @property {(device: any, value: number) => Promise<unknown>} [apply] Gladys value -> Scrypted call
 * @property {(device: ScryptedDeviceInfo) => object} describe the Gladys feature, minus its external id
 *
 * @typedef {object} ScryptedDeviceInfo
 * @property {string} id Scrypted device id
 * @property {string} name
 * @property {string} type Scrypted device type
 * @property {string[]} interfaces
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
      // A light is a light and a siren a siren in Gladys too: the dashboard
      // and the voice commands depend on the category.
      category: ON_OFF_CATEGORIES[device.type] ?? CATEGORIES.SWITCH,
      // `binary` in each of the three categories.
      type: TYPES.SWITCH.BINARY,
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
