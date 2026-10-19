// -----------------------------------------------------------------------------
// The Scrypted client prints its login answer: secrets never reach the logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactConsole, redactSecrets } from '../src/scrypted/session.js';

test('secret keys are masked at any depth, the rest is kept', () => {
  const login = {
    username: 'gladys',
    authorization: 'Bearer abc',
    queryToken: { scryptedToken: 'xyz' },
    nested: [{ token: 't', addresses: ['https://10.0.0.2:10443'] }],
    error: null,
  };
  assert.deepEqual(redactSecrets(login), {
    username: 'gladys',
    authorization: '***',
    queryToken: '***',
    nested: [{ token: '***', addresses: ['https://10.0.0.2:10443'] }],
    error: null,
  });
  assert.equal(login.authorization, 'Bearer abc', 'the original is not touched');
});

test('strings, errors and cycles go through as they are', () => {
  const error = new Error('boom');
  assert.equal(redactSecrets('token abc'), 'token abc');
  assert.equal(redactSecrets(error), error);
  const cycle = { name: 'a' };
  cycle.self = cycle;
  assert.doesNotThrow(() => redactSecrets(cycle));
});

test('the console filter masks what the client logs', () => {
  const lines = [];
  const target = {};
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    target[method] = (...args) => lines.push(args);
  }
  redactConsole(target);
  target.log('login result', 42, { authorization: 'Bearer abc', hostname: 'nas' });
  assert.deepEqual(lines, [['login result', 42, { authorization: '***', hostname: 'nas' }]]);
});
