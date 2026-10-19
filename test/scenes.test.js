// -----------------------------------------------------------------------------
// Scene actions: declared outputs, and no failure for what is an outcome.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deviceId, startRuntime } from './helpers/setup.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declaredOutputs = (key) =>
  manifest.scene_actions.find((action) => action.key === key).outputs.map((o) => o.key);

test('take_snapshot pushes a picture and says so', async () => {
  const { gladys } = await startRuntime();
  const ack = await gladys.fake.sceneAction('take_snapshot', { device: deviceId('11') });
  assert.deepEqual(ack.data.outputs, { captured: true });
  assert.deepEqual(Object.keys(ack.data.outputs), declaredOutputs('take_snapshot'));
  assert.equal(gladys.fake.cameraImages.at(-1).device_external_id, deviceId('11'));
});

test('take_snapshot on a device that is not a camera is an output, not a failure', async () => {
  const { gladys, runtime } = await startRuntime();
  const notCamera = await gladys.fake.sceneAction('take_snapshot', { device: deviceId('21') });
  assert.deepEqual(notCamera.data.outputs, { captured: false });
  await runtime.stop();
  const offline = await gladys.fake.sceneAction('take_snapshot', { device: deviceId('11') });
  assert.deepEqual(offline.data.outputs, { captured: false });
});

test('sync_devices returns the device count', async () => {
  const { gladys, runtime } = await startRuntime();
  const ack = await gladys.fake.sceneAction('sync_devices');
  assert.deepEqual(ack.data.outputs, { devices: 7 });
  assert.deepEqual(Object.keys(ack.data.outputs), declaredOutputs('sync_devices'));
  await runtime.stop();
  const offline = await gladys.fake.sceneAction('sync_devices');
  assert.deepEqual(offline.data.outputs, { devices: 0 });
});
