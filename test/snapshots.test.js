// -----------------------------------------------------------------------------
// Camera pictures: size, rate limit, periodic loop, widget keys.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_PREFIX,
  MAX_CAMERA_IMAGE_SIZE,
  MIN_PUBLISH_GAP_MS,
  PICTURE_WIDTHS,
} from '../src/scrypted/snapshots.js';
import { TINY_JPEG, createFakeScrypted } from './helpers/fakeScrypted.js';
import { deviceId, startRuntime } from './helpers/setup.js';

const pictureCalls = (scrypted) =>
  scrypted.calls.filter((call) => call.method === 'takePicture').map((call) => call.args[0]);

test('a picture too large for Gladys is asked again, smaller', async () => {
  // 120 KB of JPEG at 1280 and 960 px is 160 KB of base64: too large.
  const scrypted = createFakeScrypted({
    picture: (width) => Buffer.alloc(width > 640 ? 120_000 : 60_000, 1),
  });
  const { runtime } = await startRuntime({ scrypted });
  const image = await runtime.snapshots.capture('11');
  assert.ok(image.startsWith(IMAGE_PREFIX));
  assert.ok(image.length <= MAX_CAMERA_IMAGE_SIZE);
  assert.deepEqual(
    pictureCalls(scrypted).map((options) => options.picture.width),
    [1280, 960, 640],
  );
});

test('a camera whose picture never fits fails with the reason', async () => {
  const scrypted = createFakeScrypted({ picture: () => Buffer.alloc(200_000, 1) });
  const { runtime } = await startRuntime({ scrypted });
  await assert.rejects(runtime.snapshots.capture('11'), /Garden stays over 150 KB/);
  assert.equal(pictureCalls(scrypted).length, PICTURE_WIDTHS.length);
});

test('only cameras give pictures', async () => {
  const { runtime } = await startRuntime();
  await assert.rejects(runtime.snapshots.capture('21'), /not a camera/);
});

test('two requests at once share one capture', async () => {
  const { runtime, scrypted } = await startRuntime();
  const [a, b] = await Promise.all([
    runtime.snapshots.capture('11'),
    runtime.snapshots.capture('11'),
  ]);
  assert.equal(a, b);
  assert.equal(pictureCalls(scrypted).length, 1);
});

test('a camera is never pushed twice within the Gladys rate limit', async () => {
  const { runtime, gladys, timers } = await startRuntime();
  assert.equal(await runtime.snapshots.publish('11'), true);
  assert.equal(await runtime.snapshots.publish('11'), false);
  await timers.advance(MIN_PUBLISH_GAP_MS);
  assert.equal(await runtime.snapshots.publish('11'), true);
  assert.equal(gladys.fake.cameraImages.length, 2);
  assert.equal(gladys.fake.cameraImages[0].device_external_id, deviceId('11'));
});

test('the periodic loop pushes every camera at the configured interval', async () => {
  const { gladys, timers } = await startRuntime({ config: { snapshot_interval: 60 } });
  assert.equal(gladys.fake.cameraImages.length, 0);
  await timers.advance(60_000);
  assert.deepEqual(gladys.fake.cameraImages.map((image) => image.device_external_id).sort(), [
    deviceId('10'),
    deviceId('11'),
  ]);
  await timers.advance(60_000);
  assert.equal(gladys.fake.cameraImages.length, 4);
});

test('Gladys can ask a fresh picture of a camera device', async () => {
  const { gladys } = await startRuntime();
  const ack = await gladys.fake.getImage({ external_id: deviceId('10') });
  assert.equal(ack.success, true);
  assert.equal(ack.data.image, IMAGE_PREFIX + TINY_JPEG.toString('base64'));
});

test('every picture gets a new widget image key', async () => {
  const { runtime } = await startRuntime();
  await runtime.snapshots.capture('11');
  const first = runtime.snapshots.latest('11');
  await runtime.snapshots.capture('11');
  const second = runtime.snapshots.latest('11');
  assert.notEqual(first.key, second.key);
  for (const { key } of [first, second]) {
    assert.match(key, /^[a-z0-9][a-z0-9-]{0,63}$/);
  }
  assert.equal(runtime.snapshots.imageByKey(second.key), TINY_JPEG.toString('base64'));
  assert.equal(runtime.snapshots.imageByKey(first.key), undefined, 'only the last one is kept');
});
