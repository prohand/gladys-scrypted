import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MIN_SNAPSHOT_INTERVAL,
  connectionCandidates,
  isConfigured,
  normalizeConfig,
  normalizeUrl,
} from '../src/config.js';

test('an address gets https and a trailing slash', () => {
  assert.equal(normalizeUrl('192.168.1.20:10443'), 'https://192.168.1.20:10443/');
  assert.equal(normalizeUrl(' http://nas.lan:11080 '), 'http://nas.lan:11080/');
  assert.equal(
    normalizeUrl('https://scrypted.example.com/base'),
    'https://scrypted.example.com/base/',
  );
});

test('an address that cannot be used is empty', () => {
  for (const raw of ['', '   ', undefined, null, 42, 'ftp://nas.lan', 'https://']) {
    assert.equal(normalizeUrl(raw), '', `${raw}`);
  }
});

test('the defaults apply to an empty config', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('numbers typed as strings are read, and kept in their bounds', () => {
  const config = normalizeConfig({ snapshot_interval: '120', detection_cooldown: '-5' });
  assert.equal(config.snapshot_interval, 120);
  assert.equal(config.detection_cooldown, 0);
  assert.equal(normalizeConfig({ detection_cooldown: 'abc' }).detection_cooldown, 30);
});

test('the picture interval is 0 (off) or at least the minimum', () => {
  assert.equal(normalizeConfig({ snapshot_interval: 0 }).snapshot_interval, 0);
  assert.equal(normalizeConfig({ snapshot_interval: 3 }).snapshot_interval, MIN_SNAPSHOT_INTERVAL);
  assert.equal(normalizeConfig({ snapshot_interval: 99999 }).snapshot_interval, 3600);
});

test('only an explicit false turns the event pictures and the local preference off', () => {
  assert.equal(normalizeConfig({ snapshot_on_event: undefined }).snapshot_on_event, true);
  assert.equal(normalizeConfig({ snapshot_on_event: false }).snapshot_on_event, false);
  assert.equal(normalizeConfig({ GLADYS_PREFER_LOCAL: undefined }).GLADYS_PREFER_LOCAL, true);
  assert.equal(normalizeConfig({ GLADYS_PREFER_LOCAL: false }).GLADYS_PREFER_LOCAL, false);
});

test('the preferred address comes first, and only configured ones are tried', () => {
  const both = { local_url: 'lan:10443', cloud_url: 'scrypted.example.com' };
  assert.deepEqual(
    connectionCandidates(normalizeConfig(both)).map((c) => c.transport),
    ['local', 'cloud'],
  );
  assert.deepEqual(
    connectionCandidates(normalizeConfig({ ...both, GLADYS_PREFER_LOCAL: false })).map(
      (c) => c.transport,
    ),
    ['cloud', 'local'],
  );
  assert.deepEqual(
    connectionCandidates(normalizeConfig({ cloud_url: 'scrypted.example.com' })).map(
      (c) => c.transport,
    ),
    ['cloud'],
  );
});

test('a connection needs an address, a user and a password', () => {
  assert.equal(isConfigured(normalizeConfig()), false);
  assert.equal(isConfigured(normalizeConfig({ local_url: 'lan', username: 'gladys' })), false);
  assert.equal(
    isConfigured(normalizeConfig({ local_url: 'lan', username: 'gladys', password: 'x' })),
    true,
  );
  assert.equal(isConfigured(normalizeConfig({ username: 'gladys', password: 'x' })), false);
});
