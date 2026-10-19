// -----------------------------------------------------------------------------
// Dashboard widgets: the core renders the content exactly as sent.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';
import {
  CAMERA_WIDGET,
  STATUS_WIDGET,
  WIDGETS,
  refreshWidgets,
} from '../src/capabilities/widgets.js';
import { createFakeScrypted } from './helpers/fakeScrypted.js';
import { deviceId, featureId, startRuntime } from './helpers/setup.js';

const content = async (gladys, key, settings = {}, language = 'en') => {
  const ack = await gladys.fake.widgetGet(key, { settings, language });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
};

test('the status widget is valid before and after events', async () => {
  const { gladys, scrypted } = await startRuntime();
  const empty = await content(gladys, STATUS_WIDGET);
  assert.deepEqual(validateWidgetContent(empty), []);
  assert.ok(
    empty.components.some((c) => c.type === 'text'),
    'says nothing was seen yet',
  );

  await scrypted.emit('10', 'BinarySensor', 'binaryState', true);
  await scrypted.emit('11', 'ObjectDetector', undefined, {
    detections: [{ className: 'person', label: 'Alice', score: 0.9 }],
  });
  const full = await content(gladys, STATUS_WIDGET);
  assert.deepEqual(validateWidgetContent(full), []);
  const list = full.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.badge.text.en]),
    [
      ['Garden', 'Person'],
      ['Front door', 'Doorbell'],
    ],
  );
});

test('the status widget shows the fallback and the unreachable server', async () => {
  const { gladys, runtime } = await startRuntime();
  runtime.link.fallbackReason = 'timeout';
  const fallback = await content(gladys, STATUS_WIDGET);
  assert.deepEqual(validateWidgetContent(fallback), []);
  const status = fallback.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].color, 'warning');

  await runtime.stop();
  const down = await content(gladys, STATUS_WIDGET);
  assert.deepEqual(validateWidgetContent(down), []);
  assert.equal(down.components.find((c) => c.type === 'status').items[0].color, 'danger');
});

test('the camera widget shows the last picture, served as a valid image', async () => {
  const { gladys } = await startRuntime();
  const camera = await content(gladys, CAMERA_WIDGET, { device: deviceId('11') });
  assert.deepEqual(validateWidgetContent(camera), []);
  const image = camera.components.find((c) => c.type === 'image');
  assert.ok(image, 'a picture is taken for the first display');
  const ack = await gladys.fake.widgetGetImage(image.key);
  assert.equal(ack.success, true);
  assert.deepEqual(validateWidgetImage(ack.data.image), []);
  const tile = camera.components.find((c) => c.type === 'value');
  assert.equal(tile.device_feature, featureId('11', 'motion'));
});

test('the camera widget asks for a camera when none is chosen', async () => {
  const { gladys } = await startRuntime();
  for (const settings of [{}, { device: deviceId('21') }]) {
    const body = await content(gladys, CAMERA_WIDGET, settings);
    assert.deepEqual(validateWidgetContent(body), []);
    assert.equal(body.components[0].type, 'text');
  }
});

test('the camera widget without picture is valid too', async () => {
  const scrypted = createFakeScrypted({ picture: () => Buffer.alloc(200_000, 1) });
  const { gladys } = await startRuntime({ scrypted });
  const body = await content(gladys, CAMERA_WIDGET, { device: deviceId('11') });
  assert.deepEqual(validateWidgetContent(body), []);
  assert.ok(!body.components.some((c) => c.type === 'image'));
});

test('every button of every widget is handled and answers a short toast', async () => {
  const { gladys } = await startRuntime();
  const widgets = [
    [STATUS_WIDGET, {}],
    [CAMERA_WIDGET, { device: deviceId('10') }],
  ];
  for (const [key, settings] of widgets) {
    const buttons = (await content(gladys, key, settings)).components.filter((c) => c.action);
    assert.ok(buttons.length > 0, key);
    for (const { action } of buttons) {
      const ack = await gladys.fake.widgetAction(key, action.key, action.params ?? {}, {
        settings,
      });
      assert.equal(ack.success, true, `${key}.${action.key}: ${ack.error}`);
      for (const language of ['en', 'fr', 'de', 'es']) {
        assert.ok(ack.data.message[language].length <= 200, `${key}.${action.key} ${language}`);
      }
    }
  }
});

test('an unknown widget action or image fails', async () => {
  const { gladys } = await startRuntime();
  const ack = await gladys.fake.widgetAction(STATUS_WIDGET, 'nope', {});
  assert.equal(ack.success, false);
  const image = await gladys.fake.widgetGetImage('snap-unknown-1');
  assert.equal(image.success, false);
});

test('refreshWidgets nudges every widget', async () => {
  const { gladys } = await startRuntime();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes.slice(-2), Object.keys(WIDGETS));
});

test('detections and pictures make the widgets stale', async () => {
  const { scrypted, widgetsStale } = await startRuntime();
  const before = widgetsStale.length;
  await scrypted.emit('11', 'MotionSensor', 'motionDetected', true);
  assert.ok(widgetsStale.length > before);
});
