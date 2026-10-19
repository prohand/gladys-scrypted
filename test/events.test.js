// -----------------------------------------------------------------------------
// Scrypted events -> Gladys states and scene events.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RESYNC_DELAY_MS } from '../src/runtime.js';
import { OBJECT_CLASSES, SCENE_TRIGGERS, normalizeClass } from '../src/scrypted/events.js';
import { createFakeScrypted } from './helpers/fakeScrypted.js';
import { deviceId, featureId, startRuntime } from './helpers/setup.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

test('a property change is published as the feature state', async () => {
  const { gladys, scrypted } = await startRuntime();
  await scrypted.emit('21', 'OnOff', 'on', true);
  assert.equal(gladys.fake.lastState(featureId('21', 'on')), 1);
  await scrypted.emit('23', 'Lock', 'lockState', 'Unlocked');
  assert.equal(gladys.fake.lastState(featureId('23', 'lock')), 0);
  await scrypted.emit('10', 'Battery', 'batteryLevel', 54);
  assert.equal(gladys.fake.lastState(featureId('10', 'battery')), 54);
});

test('a value that did not change is not published again', async () => {
  const { gladys, scrypted } = await startRuntime();
  const before = gladys.fake.states.length;
  await scrypted.emit('20', 'Brightness', 'brightness', 40);
  assert.equal(gladys.fake.states.length, before);
});

test('motion fires one scene event per transition, none while it lasts or on the clear', async () => {
  const { gladys, scrypted } = await startRuntime();
  await scrypted.emit('11', 'MotionSensor', 'motionDetected', true);
  await scrypted.emit('11', 'MotionSensor', 'motionDetected', true);
  await scrypted.emit('11', 'MotionSensor', 'motionDetected', false);
  assert.equal(gladys.fake.lastState(featureId('11', 'motion')), 0);
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.MOTION_DETECTED,
      data: { device: deviceId('11'), device_name: 'Garden' },
    },
  ]);
  await scrypted.emit('11', 'MotionSensor', 'motionDetected', true);
  assert.equal(gladys.fake.sceneEvents.length, 2, 'a new motion is a new event');
});

test('a motion already going on when the session opens is not a new one', async () => {
  const { gladys, scrypted } = await startRuntime({
    scrypted: createFakeScrypted({
      devices: [
        {
          id: '11',
          name: 'Garden',
          type: 'Camera',
          interfaces: ['MotionSensor'],
          properties: { motionDetected: true },
        },
      ],
    }),
  });
  await scrypted.emit('11', 'MotionSensor', 'motionDetected', true);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a doorbell press fires doorbell_pressed', async () => {
  const { gladys, scrypted } = await startRuntime();
  await scrypted.emit('10', 'BinarySensor', 'binaryState', true);
  assert.equal(gladys.fake.lastState(featureId('10', 'ring')), 1);
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.DOORBELL_PRESSED,
      data: { device: deviceId('10'), device_name: 'Front door' },
    },
  ]);
});

test('detections fire object_detected once per kind, then wait for the cooldown', async () => {
  const { gladys, scrypted, timers } = await startRuntime({ config: { detection_cooldown: 30 } });
  const frame = {
    detections: [
      { className: 'person', score: 0.62 },
      { className: 'person', score: 0.91, label: 'Alice' },
      { className: 'car', score: 0.7 },
      { className: 'motion', score: 1 },
    ],
  };
  await scrypted.emit('11', 'ObjectDetector', undefined, frame);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.data),
    [
      { device: deviceId('11'), device_name: 'Garden', class: 'person', label: 'Alice', score: 91 },
      { device: deviceId('11'), device_name: 'Garden', class: 'vehicle', label: '', score: 70 },
    ],
  );
  await timers.advance(10_000);
  await scrypted.emit('11', 'ObjectDetector', undefined, frame);
  assert.equal(gladys.fake.sceneEvents.length, 2, 'still in the cooldown');
  await scrypted.emit('10', 'ObjectDetector', undefined, frame);
  assert.equal(gladys.fake.sceneEvents.length, 4, 'another camera has its own cooldown');
  await timers.advance(20_000);
  await scrypted.emit('11', 'ObjectDetector', undefined, { detections: [{ className: 'person' }] });
  assert.equal(gladys.fake.sceneEvents.length, 5);
  assert.equal(gladys.fake.sceneEvents.at(-1).data.score, 0, 'no score reads 0');
});

test('scene event data only carries keys the trigger declares', async () => {
  const { gladys, scrypted } = await startRuntime();
  await scrypted.emit('10', 'MotionSensor', 'motionDetected', true);
  await scrypted.emit('10', 'BinarySensor', 'binaryState', true);
  await scrypted.emit('10', 'ObjectDetector', undefined, {
    detections: [{ className: 'face', label: 'Bob', score: 0.8 }],
  });
  assert.equal(gladys.fake.sceneEvents.length, 3);
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
    assert.ok(trigger, `${key} is declared`);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.notEqual(typeof value, 'object', `${key}: data.${name} must be a primitive`);
    }
  }
});

test('every class a detection can get is a filter option of object_detected', () => {
  const trigger = manifest.scene_triggers.find((t) => t.key === SCENE_TRIGGERS.OBJECT_DETECTED);
  const options = trigger.fields.find((f) => f.key === 'class').options.map((o) => o.value);
  assert.deepEqual([...options].sort(), [...OBJECT_CLASSES].sort());
  for (const name of ['Person', 'truck', 'dog', 'license plate', 'umbrella', 'package']) {
    assert.ok(options.includes(normalizeClass(name)), name);
  }
  assert.equal(normalizeClass('motion'), null);
  assert.equal(normalizeClass(''), null);
});

test('an event pushes a fresh picture of the camera, unless turned off', async () => {
  const on = await startRuntime();
  await on.scrypted.emit('11', 'MotionSensor', 'motionDetected', true);
  await on.timers.advance(0);
  assert.deepEqual(
    on.gladys.fake.cameraImages.map((image) => image.device_external_id),
    [deviceId('11')],
  );

  const off = await startRuntime({ config: { snapshot_on_event: false } });
  await off.scrypted.emit('11', 'MotionSensor', 'motionDetected', true);
  await off.timers.advance(0);
  assert.deepEqual(off.gladys.fake.cameraImages, []);
});

test('a device added in Scrypted is published after the burst of changes', async () => {
  const { gladys, scrypted, timers } = await startRuntime();
  scrypted.addDevice({ id: '30', name: 'Shed', type: 'Camera', interfaces: ['Camera'] });
  await scrypted.emit('30', 'ScryptedDevice', 'interfaces', ['Camera']);
  await scrypted.emit('30', 'ScryptedDevice', 'name', 'Shed');
  assert.ok(!gladys.fake.discoveredDevices.some((d) => d.name === 'Shed'), 'not yet');
  await timers.advance(RESYNC_DELAY_MS);
  assert.ok(gladys.fake.discoveredDevices.some((d) => d.name === 'Shed'));
});

test('events of unknown devices are ignored', async () => {
  const { gladys, scrypted } = await startRuntime();
  const before = gladys.fake.requests.length;
  await scrypted.emit('2', 'Settings', 'settings', {});
  await scrypted.emit('999', 'OnOff', 'on', true);
  assert.equal(gladys.fake.requests.length, before);
});
