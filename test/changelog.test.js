// -----------------------------------------------------------------------------
// The Release workflow rolls the Unreleased section of CHANGELOG.md.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-scrypted';

test('the Unreleased content moves under the version, and the links follow', () => {
  const before = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- Cameras.',
    '',
    `[Unreleased]: ${REPO}/commits/main`,
    '',
  ].join('\n');
  const after = rollChangelog(before, '1.0.0', '2026-10-19');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-10-19\n\n### Added\n\n- Cameras\./,
  );
  assert.ok(after.includes(`[Unreleased]: ${REPO}/compare/v1.0.0...HEAD`));
  assert.ok(after.includes(`[1.0.0]: ${REPO}/releases/tag/v1.0.0`));

  const next = rollChangelog(after.replace('## [1.0.0]', '- Fix.\n\n## [1.0.0]'), '1.0.1', 'd');
  assert.ok(next.includes(`[1.0.1]: ${REPO}/compare/v1.0.0...v1.0.1`));
});

test('an empty Unreleased section still names the release', () => {
  const after = rollChangelog('## [Unreleased]\n', '2.0.0', '2026-01-01');
  assert.match(after, /## \[2\.0\.0\] - 2026-01-01\n\n- Maintenance release/);
});

test('a version already in the file is not rolled twice', () => {
  const text = '## [Unreleased]\n\n## [1.0.0] - 2026-10-19\n';
  assert.equal(rollChangelog(text, '1.0.0', '2026-10-20'), text);
});

test('the repository changelog has an Unreleased section with the comparison link', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.ok(text.includes('## [Unreleased]'));
  assert.match(text, new RegExp(`^\\[Unreleased\\]: ${REPO}/`, 'm'));
});
