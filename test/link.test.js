// -----------------------------------------------------------------------------
// The Scrypted link: preferred address, fallback, reconnection, promotion.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import {
  OPEN_TIMEOUT_MS,
  PROMOTE_INTERVAL_MS,
  RECONNECT_DELAYS_MS,
  ScryptedLink,
  describeError,
} from '../src/scrypted/link.js';
import { createFakeScrypted } from './helpers/fakeScrypted.js';
import { createFakeTimers, flush } from './helpers/fakeTimers.js';

const BOTH = normalizeConfig({
  local_url: '192.168.1.20:10443',
  cloud_url: 'scrypted.example.com',
  username: 'gladys',
  password: 'secret',
});

/**
 * A link whose sessions answer from `answers[transport]`: a session, an
 * error to throw, or 'hang' for a login that never answers.
 */
function setup(answers, config = BOTH) {
  const timers = createFakeTimers();
  const events = [];
  const opened = [];
  const link = new ScryptedLink({
    timers,
    openSession: async ({ url, username, password }) => {
      const transport = url === config.local_url ? 'local' : 'cloud';
      opened.push({ transport, username, password });
      const answer = answers[transport];
      if (answer === 'hang') {
        return new Promise(() => {});
      }
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
    onUp: (session) => events.push(['up', session.serverVersion]),
    onDown: () => events.push(['down']),
    onStatus: () => events.push(['status', link.transport]),
  });
  return { link, timers, events, opened };
}

test('the preferred local address is used when it answers', async () => {
  const local = createFakeScrypted({ serverVersion: 'lan' });
  const { link, events, opened } = setup({ local, cloud: createFakeScrypted() });
  assert.equal(await link.start(BOTH), true);
  assert.equal(link.transport, 'local');
  assert.equal(link.degraded, false);
  assert.deepEqual(link.transportEntry(), { transport: 'local' });
  assert.deepEqual(opened, [{ transport: 'local', username: 'gladys', password: 'secret' }]);
  assert.deepEqual(events, [
    ['up', 'lan'],
    ['status', 'local'],
  ]);
});

test('the cloud takes over when the local address fails, and says why', async () => {
  const { link } = setup({ local: new Error('ECONNREFUSED'), cloud: createFakeScrypted() });
  assert.equal(await link.start(BOTH), true);
  assert.equal(link.transport, 'cloud');
  assert.equal(link.degraded, true);
  const entry = link.transportEntry();
  assert.equal(entry.degraded, true);
  assert.match(entry.message.en, /local address did not answer \(ECONNREFUSED\)/);
  for (const language of ['fr', 'de', 'es']) {
    assert.ok(entry.message[language].includes('ECONNREFUSED'), language);
    assert.ok(entry.message[language].length <= 200, language);
  }
});

test('preferring the cloud tries it first', async () => {
  const { link, opened } = setup({ local: createFakeScrypted(), cloud: createFakeScrypted() });
  await link.start({ ...BOTH, GLADYS_PREFER_LOCAL: false });
  assert.equal(link.transport, 'cloud');
  assert.deepEqual(
    opened.map((o) => o.transport),
    ['cloud'],
  );
});

test('a login that hangs counts as a failure', async () => {
  const { link, timers } = setup({ local: 'hang', cloud: createFakeScrypted() });
  const started = link.start(BOTH);
  await flush();
  await timers.advance(OPEN_TIMEOUT_MS);
  assert.equal(await started, true);
  assert.equal(link.transport, 'cloud');
  assert.match(link.fallbackReason, /no answer after 20 s/);
});

test('nothing answers: unreachable, and a new attempt is scheduled, slower each time', async () => {
  const { link, timers, opened } = setup({ local: new Error('down'), cloud: new Error('down') });
  assert.equal(await link.start(BOTH), false);
  assert.equal(link.transport, 'unreachable');
  assert.equal(link.lastError, 'local: down / cloud: down');
  assert.deepEqual(timers.pending(), [RECONNECT_DELAYS_MS[0]]);
  await timers.advance(RECONNECT_DELAYS_MS[0]);
  assert.equal(opened.length, 4);
  assert.deepEqual(timers.pending(), [RECONNECT_DELAYS_MS[1]]);
});

test('a dropped session is reopened', async () => {
  const first = createFakeScrypted({ serverVersion: 'first' });
  const answers = { local: first, cloud: new Error('no cloud') };
  const { link, timers, events } = setup(answers);
  await link.start(BOTH);
  answers.local = createFakeScrypted({ serverVersion: 'second' });
  first.drop();
  await timers.advance(0);
  assert.equal(link.connected, false);
  assert.equal(link.transport, 'unreachable');
  await timers.advance(RECONNECT_DELAYS_MS[0]);
  assert.equal(link.connected, true);
  assert.equal(link.session.serverVersion, 'second');
  assert.deepEqual(
    events.map((e) => e.join(':')),
    ['up:first', 'status:local', 'down', 'status:unreachable', 'up:second', 'status:local'],
  );
});

test('on the fallback, the preferred address is tried again and taken back', async () => {
  const answers = {
    local: new Error('down'),
    cloud: createFakeScrypted({ serverVersion: 'cloud' }),
  };
  const { link, timers } = setup(answers);
  await link.start(BOTH);
  assert.equal(link.transport, 'cloud');
  await timers.advance(PROMOTE_INTERVAL_MS);
  assert.equal(link.transport, 'cloud', 'still down');
  answers.local = createFakeScrypted({ serverVersion: 'lan' });
  await timers.advance(PROMOTE_INTERVAL_MS);
  assert.equal(link.transport, 'local');
  assert.equal(link.degraded, false);
  assert.equal(answers.cloud.disconnected, true, 'the cloud session is closed');
  assert.deepEqual(timers.pending(), [], 'no promotion timer once on the preferred address');
});

test('stop closes the session and cancels every timer', async () => {
  const session = createFakeScrypted();
  const { link, timers } = setup({ local: new Error('down'), cloud: session });
  await link.start(BOTH);
  await link.stop();
  assert.equal(session.disconnected, true);
  assert.equal(link.connected, false);
  assert.deepEqual(timers.pending(), []);
  session.drop();
  await timers.advance(RECONNECT_DELAYS_MS.at(-1));
  assert.equal(link.connected, false, 'a closed session does not come back by itself');
});

test('without address or account, nothing is tried', async () => {
  const { link, opened } = setup({});
  assert.equal(await link.start(normalizeConfig({ local_url: 'lan' })), false);
  assert.deepEqual(opened, []);
  assert.equal(link.lastError, 'not configured');
});

test('error reasons never carry a secret', () => {
  assert.equal(describeError(new Error('bad password=hunter2')), 'bad password=***');
  assert.equal(describeError('token abc'), 'token=*** abc');
  assert.ok(describeError(new Error('x'.repeat(500))).length <= 120);
});

test('error reasons say what failed, not how the client raced', () => {
  const transport = Object.assign(new Error('xhr poll error'), { description: 404 });
  const raced = new AggregateError([transport], 'All promises were rejected');
  assert.equal(describeError(raced), 'xhr poll error (HTTP 404)');
});
