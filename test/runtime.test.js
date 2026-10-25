// -----------------------------------------------------------------------------
// The runtime through the handlers Gladys calls: start, status, commands,
// buttons, configuration changes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { registerHandlers } from '../src/handlers.js';
import { MESSAGES, RESYNC_DELAY_MS, Runtime, displayUrl } from '../src/runtime.js';
import { RECONNECT_DELAYS_MS } from '../src/scrypted/link.js';
import { createFakeScrypted } from './helpers/fakeScrypted.js';
import { createFakeTimers } from './helpers/fakeTimers.js';
import { CONFIGURED, deviceId, featureId, startRuntime, tempDataDir } from './helpers/setup.js';

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

// A motorized camera of a Scrypted plugin (ONVIF, Reolink, Amcrest...).
const PTZ_CAMERA = {
  id: '30',
  name: 'Driveway',
  type: 'Camera',
  interfaces: ['Camera', 'VideoCamera', 'PanTiltZoom'],
  properties: {
    ptzCapabilities: { pan: true, tilt: true, zoom: false, presets: { 1: 'Gate', 3: 'Drive' } },
  },
};

test('a PTZ camera moves by bounded steps and goes to its presets', async () => {
  const scrypted = createFakeScrypted();
  scrypted.addDevice(PTZ_CAMERA);
  const { gladys } = await startRuntime({ scrypted });
  const camera = deviceOf(gladys, '30');
  const move = featureOf(camera, 'ptz-move');
  assert.deepEqual(
    move.supported_options.map((option) => option.value),
    [1, 2, 3, 4],
    'no zoom on this camera',
  );
  const preset = featureOf(camera, 'ptz-preset');
  assert.deepEqual(
    preset.supported_options.map((option) => [option.value, option.label]),
    [
      [1, 'Gate'],
      [3, 'Drive'],
    ],
  );
  assert.deepEqual([preset.min, preset.max], [1, 3]);

  for (const [feature, value] of [
    [move, 1],
    [move, 3],
    [move, 0],
    [preset, 3],
  ]) {
    const ack = await gladys.fake.setValue(camera, feature, value);
    assert.equal(ack.success, true, ack.error);
  }
  assert.deepEqual(
    scrypted.calls.filter((call) => call.id === '30').map((call) => call.args[0]),
    [
      { movement: 'Relative', pan: -0.1, timeout: 1000 },
      { movement: 'Relative', tilt: 0.1, timeout: 1000 },
      { movement: 'Preset', preset: '3' },
    ],
  );
  const refused = await gladys.fake.setValue(camera, preset, 2);
  assert.equal(refused.success, false);
});

test('renamed presets are published again', async () => {
  const scrypted = createFakeScrypted();
  scrypted.addDevice(PTZ_CAMERA);
  const { gladys, timers } = await startRuntime({ scrypted });
  await scrypted.emit('30', 'PanTiltZoom', 'ptzCapabilities', {
    pan: true,
    tilt: true,
    presets: { 1: 'Front gate', 3: 'Drive' },
  });
  await timers.advance(RESYNC_DELAY_MS);
  const preset = featureOf(deviceOf(gladys, '30'), 'ptz-preset');
  assert.equal(preset.supported_options[0].label, 'Front gate');
});

test('a camera disabled in Gladys gives no picture and no detection, until enabled again', async () => {
  const dataDir = tempDataDir();
  const { gladys, scrypted, runtime } = await startRuntime({ dataDir });
  const garden = deviceOf(gladys, '11');
  assert.equal(gladys.fake.lastState(featureId('11', 'enabled')), 1);

  let ack = await gladys.fake.setValue(garden, featureOf(garden, 'enabled'), 0);
  assert.equal(ack.success, true, ack.error);
  assert.equal(gladys.fake.lastState(featureId('11', 'enabled')), 0);
  assert.equal((await gladys.fake.getImage(garden)).success, false);
  assert.equal(await runtime.snapshots.publishAll(), 1, 'only the doorbell');
  const scene = await gladys.fake.sceneAction('take_snapshot', { device: deviceId('11') });
  assert.deepEqual(scene.data.outputs, { captured: false });

  await scrypted.emit('11', 'MotionSensor', 'motionDetected', true);
  await scrypted.emit('11', 'ObjectDetector', undefined, {
    detections: [{ className: 'person', score: 0.9 }],
  });
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.notEqual(gladys.fake.lastState(featureId('11', 'motion')), 1);

  const widget = await gladys.fake.widgetGet('scrypted_camera', {
    settings: { device: deviceId('11') },
    language: 'en',
  });
  assert.deepEqual(validateWidgetContent(widget.data.content), []);
  assert.match(widget.data.content.components[0].text.en, /disabled in Gladys/);

  // The choice survives a restart.
  const again = await startRuntime({ dataDir });
  assert.equal(again.gladys.fake.lastState(featureId('11', 'enabled')), 0);
  const camera = deviceOf(again.gladys, '11');
  ack = await again.gladys.fake.setValue(camera, featureOf(camera, 'enabled'), 1);
  assert.equal(ack.success, true, ack.error);
  assert.equal((await again.gladys.fake.getImage(camera)).success, true);
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
