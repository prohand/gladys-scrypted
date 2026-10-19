// -----------------------------------------------------------------------------
// The Scrypted devices offered to Gladys.
//
// Built from the system state of the session (`systemManager.getSystemState()`:
// one entry per device id, each property as `{ value }`). Every device that
// gets at least one feature (see features.js) is published in the Gladys
// discovery list; the user then picks the ones to create.
//
// External ids are built from the Scrypted device id, the one thing that does
// not change when a device is renamed or moved to another room in Scrypted:
// `ext:<selector>:device:<scrypted id>`, plus `:<feature key>` per feature.
// -----------------------------------------------------------------------------

import { featureSpecsOf, isCamera } from './features.js';

export const DEVICE_TYPE = 'device';

/** The value of one property in a system state entry. */
const valueOf = (entry, property) => entry?.[property]?.value;

/**
 * Read the devices of a session.
 * @param {any} session a Scrypted client session
 * @returns {import('./features.js').ScryptedDeviceInfo[]}
 */
export function readDevices(session) {
  const state = session?.systemManager?.getSystemState?.() ?? {};
  return Object.entries(state)
    .map(([id, entry]) => ({
      id,
      name: String(valueOf(entry, 'name') ?? id),
      type: valueOf(entry, 'type') ?? '',
      interfaces: valueOf(entry, 'interfaces') ?? [],
    }))
    .filter((device) => featureSpecsOf(device).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export class Catalog {
  constructor(gladys) {
    this.gladys = gladys;
    /** @type {Map<string, import('./features.js').ScryptedDeviceInfo>} by Scrypted id */
    this.devices = new Map();
  }

  /** Replace the known devices with the ones of a session. */
  refresh(session) {
    this.devices = new Map(readDevices(session).map((device) => [device.id, device]));
    return this.list();
  }

  clear() {
    this.devices = new Map();
  }

  list() {
    return [...this.devices.values()];
  }

  cameras() {
    return this.list().filter(isCamera);
  }

  get(id) {
    return this.devices.get(String(id));
  }

  ids(device) {
    return this.gladys.externalIds(DEVICE_TYPE, device.id);
  }

  externalId(device) {
    return this.ids(device).device;
  }

  /** The Scrypted device behind a Gladys device external id, if known. */
  byExternalId(externalId) {
    return this.list().find((device) => this.externalId(device) === externalId);
  }

  /** The Gladys discovery payload of one device. */
  buildDevice(device) {
    const ids = this.ids(device);
    return {
      name: device.name,
      external_id: ids.device,
      // Scrypted pushes every change: nothing to poll.
      should_poll: false,
      features: featureSpecsOf(device).map((spec) => ({
        ...spec.describe(device),
        external_id: ids.feature(spec.key),
      })),
      params: [{ name: 'SCRYPTED_TYPE', value: device.type || 'Unknown' }],
    };
  }

  /** The Gladys discovery payload of every known device. */
  buildDiscoveredDevices() {
    return this.list().map((device) => this.buildDevice(device));
  }

  /**
   * The current state of every feature fed by a property, read from the
   * session: what Gladys shows before the first event arrives.
   */
  currentStates(session) {
    const state = session?.systemManager?.getSystemState?.() ?? {};
    const states = [];
    for (const device of this.list()) {
      const ids = this.ids(device);
      for (const spec of featureSpecsOf(device)) {
        if (!spec.property) {
          continue;
        }
        const value = spec.toState(valueOf(state[device.id], spec.property));
        if (value !== undefined) {
          states.push({ device_feature_external_id: ids.feature(spec.key), state: value });
        }
      }
    }
    return states;
  }
}
