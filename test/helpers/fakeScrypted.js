// -----------------------------------------------------------------------------
// A Scrypted server in memory: the parts of a `@scrypted/client` session the
// integration uses (system state, device proxies, events, pictures), plus
// helpers to drive it from the tests. No network.
// -----------------------------------------------------------------------------

// A real 1×1 JPEG: the widget image checks read its header.
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
    'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
    'CAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA' +
    'AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkK' +
    'FhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWG' +
    'h4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl' +
    '5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCwooor8/P3E//Z',
  'base64',
);

// A typical install: a doorbell, two cameras, a light, a plug, a siren, a
// lock, a sensor, and the plugins Scrypted lists as devices too.
export const SAMPLE_DEVICES = [
  {
    id: '10',
    name: 'Front door',
    type: 'Doorbell',
    interfaces: [
      'Camera',
      'VideoCamera',
      'MotionSensor',
      'BinarySensor',
      'ObjectDetector',
      'Battery',
    ],
    properties: { motionDetected: false, binaryState: false, batteryLevel: 87 },
  },
  {
    id: '11',
    name: 'Garden',
    type: 'Camera',
    interfaces: ['Camera', 'VideoCamera', 'MotionSensor', 'ObjectDetector'],
    properties: { motionDetected: false },
  },
  {
    id: '20',
    name: 'Porch light',
    type: 'Light',
    interfaces: ['OnOff', 'Brightness'],
    properties: { on: true, brightness: 40 },
  },
  { id: '21', name: 'Plug', type: 'Outlet', interfaces: ['OnOff'], properties: { on: false } },
  { id: '22', name: 'Siren', type: 'Siren', interfaces: ['OnOff'], properties: { on: false } },
  {
    id: '23',
    name: 'Gate lock',
    type: 'Lock',
    interfaces: ['Lock'],
    properties: { lockState: 'Locked' },
  },
  {
    id: '24',
    name: 'Garage sensor',
    type: 'Sensor',
    interfaces: ['EntrySensor', 'Thermometer', 'HumiditySensor', 'BinarySensor'],
    properties: { entryOpen: false, temperature: 18.26, humidity: 55.04, binaryState: true },
  },
  { id: '1', name: 'Scrypted NVR', type: 'Builtin', interfaces: ['ScryptedPlugin', 'OnOff'] },
  { id: '2', name: 'Rebroadcast', type: 'API', interfaces: ['ScryptedPlugin', 'Settings'] },
];

/**
 * @param {object} [options]
 * @param {typeof SAMPLE_DEVICES} [options.devices]
 * @param {string} [options.serverVersion]
 * @param {(width: number) => Buffer} [options.picture] bytes returned for a width
 */
export function createFakeScrypted({
  devices = SAMPLE_DEVICES,
  serverVersion = '0.139.0',
  picture = () => TINY_JPEG,
} = {}) {
  const state = {};
  const proxies = {};
  const listeners = new Set();
  const calls = [];
  let eventId = 0;

  const addDevice = ({ id, name, type, interfaces, properties = {} }) => {
    state[id] = {
      id: { value: id },
      name: { value: name },
      type: { value: type },
      interfaces: { value: interfaces },
      ...Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, { value }])),
    };
    const record =
      (method) =>
      async (...args) => {
        calls.push({ id, method, args });
      };
    proxies[id] = {
      id,
      turnOn: record('turnOn'),
      turnOff: record('turnOff'),
      setBrightness: record('setBrightness'),
      lock: record('lock'),
      unlock: record('unlock'),
      async takePicture(options) {
        calls.push({ id, method: 'takePicture', args: [options] });
        return { mimeType: 'image/jpeg', bytes: picture(options?.picture?.width ?? 0) };
      },
    };
  };
  devices.forEach(addDevice);

  const session = {
    serverVersion,
    disconnected: false,
    onClose: undefined,
    systemManager: {
      getSystemState: () => state,
      getDeviceById: (id) => proxies[id],
      listen(callback) {
        listeners.add(callback);
        return { removeListener: () => listeners.delete(callback) };
      },
    },
    mediaManager: {
      async convertMediaObjectToBuffer(media, mimeType) {
        calls.push({ method: 'convertMediaObjectToBuffer', args: [mimeType] });
        return media.bytes;
      },
    },
    disconnect() {
      session.disconnected = true;
    },

    // --- test helpers --------------------------------------------------------
    calls,
    listeners,
    state,
    addDevice,
    /** Change a property and send the event Scrypted sends for it. */
    async emit(id, eventInterface, property, value) {
      if (property && state[id]) {
        state[id][property] = { value };
      }
      eventId += 1;
      const details = { eventId: String(eventId), eventInterface, property, eventTime: Date.now() };
      await Promise.all([...listeners].map((listener) => listener(proxies[id], details, value)));
    },
    /** The server goes away. */
    drop() {
      session.onClose?.();
    },
  };
  return session;
}
