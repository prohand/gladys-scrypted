// -----------------------------------------------------------------------------
// Scrypted devices -> Gladys devices: which features, which states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { Catalog, readDevices } from '../src/scrypted/catalog.js';
import { FEATURE_SPECS, featureSpecsOf, specByKey } from '../src/scrypted/features.js';
import { createFakeScrypted } from './helpers/fakeScrypted.js';

const featuresOf = (devices, name) =>
  devices.find((device) => device.name === name).features.map((f) => `${f.category}/${f.type}`);

test('plugins and devices without a known interface are not offered', () => {
  const names = readDevices(createFakeScrypted()).map((device) => device.name);
  assert.ok(!names.includes('Scrypted NVR'), 'a Builtin device is part of Scrypted itself');
  assert.ok(!names.includes('Rebroadcast'), 'a plugin has no feature');
  assert.equal(names.length, 7);
});

test('Gladys accepts the discovery list, and every feature declares its range', async () => {
  const gladys = createFakeGladys();
  const catalog = new Catalog(gladys);
  catalog.refresh(createFakeScrypted());
  const devices = catalog.buildDiscoveredDevices();
  await gladys.publishDiscoveredDevices(devices);
  assert.ok(gladys.fake.requests.every((request) => request.status === 200));
  for (const feature of devices.flatMap((device) => device.features)) {
    assert.equal(typeof feature.min, 'number', `${feature.external_id}: min`);
    assert.equal(typeof feature.max, 'number', `${feature.external_id}: max`);
  }
});

test('the category follows the Scrypted device type', () => {
  const catalog = new Catalog(createFakeGladys());
  catalog.refresh(createFakeScrypted());
  const devices = catalog.buildDiscoveredDevices();
  assert.deepEqual(featuresOf(devices, 'Porch light'), ['light/binary', 'light/brightness']);
  assert.deepEqual(featuresOf(devices, 'Plug'), ['switch/binary']);
  assert.deepEqual(featuresOf(devices, 'Siren'), ['siren/binary']);
  assert.deepEqual(featuresOf(devices, 'Front door'), [
    'camera/image',
    'motion-sensor/binary',
    'doorbell/ring',
    'battery/integer',
  ]);
  // A BinarySensor is a doorbell button on a Doorbell only.
  assert.deepEqual(featuresOf(devices, 'Garage sensor'), [
    'temperature-sensor/decimal',
    'humidity-sensor/decimal',
    'opening-sensor/binary',
  ]);
});

test('external ids are built from the Scrypted id, not the name', () => {
  const gladys = createFakeGladys();
  const catalog = new Catalog(gladys);
  const scrypted = createFakeScrypted();
  catalog.refresh(scrypted);
  const before = catalog.buildDiscoveredDevices().find((d) => d.name === 'Garden');
  scrypted.state['11'].name.value = 'Back garden';
  catalog.refresh(scrypted);
  const after = catalog.buildDiscoveredDevices().find((d) => d.name === 'Back garden');
  assert.equal(after.external_id, before.external_id);
  assert.equal(after.external_id, 'ext:test-integration:device:11');
  assert.equal(catalog.byExternalId(after.external_id).id, '11');
});

test('the current states are read from the system state', () => {
  const gladys = createFakeGladys();
  const catalog = new Catalog(gladys);
  const scrypted = createFakeScrypted();
  catalog.refresh(scrypted);
  const states = Object.fromEntries(
    catalog.currentStates(scrypted).map((s) => [s.device_feature_external_id, s.state]),
  );
  const id = (device, key) => `ext:test-integration:device:${device}:${key}`;
  assert.equal(states[id('20', 'on')], 1);
  assert.equal(states[id('20', 'brightness')], 40);
  assert.equal(states[id('23', 'lock')], 1, 'Locked reads 1');
  assert.equal(states[id('24', 'temperature')], 18.3, 'one decimal');
  assert.equal(states[id('24', 'opening')], 0);
  assert.equal(states[id('10', 'battery')], 87);
  assert.equal(states[id('10', 'image')], undefined, 'pictures are not states');
});

test('the value conversions', () => {
  assert.equal(specByKey('lock').toState('Unlocked'), 0);
  assert.equal(specByKey('lock').toState('Jammed'), undefined, 'neither locked nor unlocked');
  assert.equal(specByKey('opening').toState('jammed'), 1, 'a jammed door is not closed');
  assert.equal(specByKey('opening').toState(undefined), undefined);
  assert.equal(specByKey('battery').toState(null), undefined);
  assert.equal(specByKey('motion').toState(true), 1);
  assert.equal(specByKey('motion').toState(undefined), 0);
});

test('feature keys are unique: they are part of the external ids', () => {
  const keys = FEATURE_SPECS.map((spec) => spec.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('a device without interfaces gets no feature', () => {
  assert.deepEqual(featureSpecsOf({ id: '1', name: 'x', type: 'Camera' }), []);
});
