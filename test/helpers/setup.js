// -----------------------------------------------------------------------------
// A runtime connected to a fake Gladys (the SDK's) and a fake Scrypted, with
// the handlers index.js registers.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../../src/config.js';
import { registerHandlers } from '../../src/handlers.js';
import { Runtime } from '../../src/runtime.js';
import { createFakeScrypted } from './fakeScrypted.js';
import { createFakeTimers } from './fakeTimers.js';

export const CONFIGURED = {
  local_url: '192.168.1.20:10443',
  username: 'gladys',
  password: 'secret',
  // No periodic picture unless a test asks for it: fewer timers to follow.
  snapshot_interval: 0,
};

/** External id of a Scrypted device in the fake Gladys. */
export const deviceId = (id) => `ext:test-integration:device:${id}`;
export const featureId = (id, key) => `${deviceId(id)}:${key}`;

/** A fresh directory standing for /data: tests never write the real one. */
export const tempDataDir = () => mkdtempSync(join(tmpdir(), 'gladys-scrypted-'));

export async function startRuntime({
  config = {},
  scrypted = createFakeScrypted(),
  dataDir = tempDataDir(),
} = {}) {
  const gladys = createFakeGladys();
  await gladys.connect();
  const timers = createFakeTimers();
  const widgetsStale = [];
  const runtime = new Runtime({
    gladys,
    timers,
    now: timers.now,
    openSession: async () => scrypted,
    dataDir,
    onWidgetsStale: () => widgetsStale.push(timers.now()),
  });
  registerHandlers(gladys, runtime);
  await runtime.start(normalizeConfig({ ...CONFIGURED, ...config }));
  return { gladys, scrypted, runtime, timers, widgetsStale, dataDir };
}
