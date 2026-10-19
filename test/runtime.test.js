// -----------------------------------------------------------------------------
// The runtime through the handlers Gladys calls: start, status, commands,
// buttons, configuration changes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { registerHandlers } from '../src/handlers.js';
import { MESSAGES, Runtime, displayUrl } from '../src/runtime.js';
import { RECONNECT_DELAYS_MS } from '../src/scrypted/link.js';
import { createFakeScrypted } from './helpers/fakeScrypted.js';
import { createFakeTimers } from './helpers/fakeTimers.js';
import { CONFIGURED, deviceId, featureId, startRuntime } from './helpers/setup.js';

const deviceOf = (gladys, id) =>
  gladys.fake.discoveredDevices.find((device) => device.external_id === deviceId(id));
const featureOf = (device, key) =>
  device.features.find((feature) => feature.external_id === `${device.external_id}:${key}`);

test('once connected: devices, current states, transports and status are published', async () => {
  const { gladys } = await startRuntime();
  assert.equal(gladys.fake.discoveredDevices.length, 7);
  assert.equal(gladys.fake.lastState(featureId('20', 'brightness')), 40);
  assert.equal(gladys.fake.transports.length, 7);
  assert.ok(gladys.fake.transports.every((entry) => entry.transport === 'local'));
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('without configuration, the status says what to fill in', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  const runtime = new Runtime({ gladys, timers: createFakeTimers(), openSession: async () => {} });
  registerHandlers(gladys, runtime);
  await runtime.start(normalizeConfig());
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.notConfigured,
  });
  const ack = await gladys.fake.action('test_connection');
  assert.deepEqual(ack.data.message, MESSAGES.notConfigured);
});

test('an unreachable server is reported, and the devices show unreachable', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  const timers = createFakeTimers();
  const scrypted = createFakeScrypted();
  let up = true;
  const runtime = new Runtime({
    gladys,
    timers,
    openSession: async () => {
      if (!up) {
        throw new Error('ECONNREFUSED');
      }
      return scrypted;
    },
  });
  await runtime.start(normalizeConfig(CONFIGURED));
  up = false;
  scrypted.drop();
  await timers.advance(0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.ok(gladys.fake.transports.slice(-7).every((entry) => entry.transport === 'unreachable'));
  await timers.advance(RECONNECT_DELAYS_MS[0]);
  assert.match(gladys.fake.connectionStatus.message.en, /ECONNREFUSED/);
  assert.equal(scrypted.listeners.size, 0, 'the old session is no longer listened to');
});

test('Gladys commands go through the Scrypted interfaces', async () => {
  const { gladys, scrypted } = await startRuntime();
  const light = deviceOf(gladys, '20');
  const lock = deviceOf(gladys, '23');
  for (const [device, key, value] of [
    [light, 'on', 0],
    [light, 'brightness', 75],
    [lock, 'lock', 0],
    [lock, 'lock', 1],
  ]) {
    const ack = await gladys.fake.setValue(device, featureOf(device, key), value);
    assert.equal(ack.success, true, `${key}=${value}`);
  }
  assert.deepEqual(
    scrypted.calls.filter((call) => call.id).map((call) => [call.id, call.method, ...call.args]),
    [
      ['20', 'turnOff'],
      ['20', 'setBrightness', 75],
      ['23', 'unlock'],
      ['23', 'lock'],
    ],
  );
});

test('a read-only feature cannot be commanded', async () => {
  const { gladys } = await startRuntime();
  const camera = deviceOf(gladys, '11');
  const ack = await gladys.fake.setValue(camera, featureOf(camera, 'motion'), 1);
  assert.equal(ack.success, false);
  assert.match(ack.error, /cannot be controlled/);
});

test('"Test the connection" says how and what was found', async () => {
  const { gladys } = await startRuntime();
  const { data } = await gladys.fake.action('test_connection');
  assert.match(data.message.en, /Scrypted 0\.139\.0 through the local network/);
  assert.match(data.message.en, /7 devices, 2 cameras/);
  for (const language of ['fr', 'de', 'es']) {
    assert.ok(data.message[language].includes('7'), language);
  }
});

test('"Synchronize the devices" publishes the list again', async () => {
  const { gladys, scrypted } = await startRuntime();
  scrypted.addDevice({ id: '40', name: 'Hall', type: 'Light', interfaces: ['OnOff'] });
  const { data } = await gladys.fake.action('sync_devices');
  assert.match(data.message.en, /^8 Scrypted devices/);
  assert.ok(deviceOf(gladys, '40'));
});

test('the discovery list is published on request', async () => {
  const { gladys, scrypted } = await startRuntime();
  scrypted.addDevice({ id: '41', name: 'Attic', type: 'Sensor', interfaces: ['Thermometer'] });
  await gladys.fake.scanRequest();
  assert.ok(deviceOf(gladys, '41'));
});

test('saving the configuration reconnects with it', async () => {
  const { gladys, scrypted } = await startRuntime();
  await gladys.fake.configUpdated({ ...CONFIGURED, GLADYS_PREFER_LOCAL: false });
  assert.equal(scrypted.disconnected, true, 'the old session was closed');
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('a message never shows the credentials typed in an address', () => {
  assert.equal(displayUrl('https://user:pass@nas.lan:10443/'), 'https://nas.lan:10443/');
  assert.equal(displayUrl('not a url'), '');
});
