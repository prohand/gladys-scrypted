// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/capabilities/actions.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import { WIDGETS } from '../src/capabilities/widgets.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { SCENE_TRIGGER_KEYS } from '../src/scrypted/events.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const sorted = (list) => [...list].sort();

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...manifest.config_schema,
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The types the store schema accepts: anything else rejects the manifest.
const FIELD_TYPES = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'section'];

// The vocabulary the store indexes. An unknown category is dropped, and the
// integration quietly stops appearing on that shelf.
const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  // Added with Gladys 5.3.
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('every manifest action has a handler, and every handler is declared', () => {
  assert.deepEqual(sorted(keysOf(manifest.actions)), sorted(Object.keys(ACTIONS)));
});

test('every scene action has a handler, and every handler is declared', () => {
  assert.deepEqual(sorted(keysOf(manifest.scene_actions)), sorted(Object.keys(SCENE_ACTIONS)));
});

test('every widget has a content handler, and every handler is declared', () => {
  assert.deepEqual(sorted(keysOf(manifest.widgets)), sorted(Object.keys(WIDGETS)));
  for (const widget of Object.values(WIDGETS)) {
    assert.equal(typeof widget.get, 'function');
    assert.equal(typeof widget.action, 'function');
  }
});

test('the scene triggers the code fires are the ones the manifest declares', () => {
  // An undeclared key is a 404 on publishSceneEvent; a declared key nobody
  // fires is a dead card in the scene editor.
  assert.deepEqual(sorted(keysOf(manifest.scene_triggers)), sorted(SCENE_TRIGGER_KEYS));
});

test('every field uses a type the store accepts', () => {
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `field "${field.key}": type "${field.type}"`);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('every stored config key is known by the code', () => {
  for (const field of manifest.config_schema.filter((f) => f.type !== 'section')) {
    assert.ok(
      field.key in DEFAULT_CONFIG,
      `config key "${field.key}" is missing in DEFAULT_CONFIG`,
    );
  }
});

test('the password is a secret field', () => {
  // A secret field is never sent back to the browser once saved.
  assert.equal(manifest.config_schema.find((f) => f.key === 'password').type, 'secret');
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined, `section "${section.key}": placeholder`);
    assert.ok(!(section.key in DEFAULT_CONFIG), `section "${section.key}" stores no value`);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
  }
});

test('the categories stay inside the vocabulary the store indexes', () => {
  const { categories } = manifest;
  assert.ok(categories.length >= 1 && categories.length <= 3);
  assert.equal(new Set(categories).size, categories.length, 'categories must be unique');
  for (const category of categories) {
    assert.ok(CATEGORIES.includes(category), `unknown category "${category}"`);
  }
});

test('the Gladys floor covers every field the manifest declares', () => {
  // Older cores reject a manifest field they do not know: `categories` needs
  // 4.86, the widgets and scene declarations 5.1, `keywords` / `countries` /
  // `music` 5.3.
  const match = manifest.gladys_version.match(/^>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  const [major, minor] = match.slice(1).map(Number);
  const floorAtLeast = (wantMajor, wantMinor) =>
    major > wantMajor || (major === wantMajor && minor >= wantMinor);
  assert.ok(floorAtLeast(5, 1), `got ${manifest.gladys_version}`);
  if (manifest.keywords || manifest.countries || manifest.music) {
    assert.ok(floorAtLeast(5, 3), 'keywords / countries / music need >=5.3.0');
  }
});

test('the search keywords follow the store rules', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}": 2-30 characters`);
  }
});

test('the integration is not limited to some countries', () => {
  // Scrypted runs anywhere: `countries` would hide the integration from the
  // catalog shelves of every other country.
  assert.equal(manifest.countries, undefined);
});

test('the manifest declares both the local and the cloud transport', () => {
  // Both: Gladys shows the "Prefer the local connection" switch, whose value
  // arrives as GLADYS_PREFER_LOCAL.
  assert.deepEqual(sorted(manifest.transports), ['cloud', 'local']);
  assert.equal(DEFAULT_CONFIG.GLADYS_PREFER_LOCAL, true);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-scrypted:${manifest.version}`);
});

/** Every multi-language object of the manifest, with where it sits. */
function multiLanguageTexts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => multiLanguageTexts(child, `${path}[${index}]`));
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const keys = Object.keys(node);
  if (keys.includes('en') && keys.every((key) => /^[a-z]{2}$/.test(key))) {
    return [{ path, text: node }];
  }
  return keys.flatMap((key) => multiLanguageTexts(node[key], `${path}.${key}`));
}

test('every multi-language text of the manifest carries en, fr, de and es', () => {
  // Gladys shows the reader's language and falls back to English: a missing
  // one shows up in English in the middle of a translated screen.
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 50, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    assert.deepEqual(sorted(Object.keys(text)), sorted(LANGUAGES), `${path}: languages`);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('the per-language length limits of the store hold in every language', () => {
  const within = (text, min, max, where) => {
    for (const language of LANGUAGES) {
      const { length } = text[language];
      assert.ok(length >= min && length <= max, `${where}.${language}: ${length} characters`);
    }
  };
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  within(manifest.description, 10, 100, 'description');
  for (const widget of manifest.widgets) {
    within(widget.label, 3, 30, `widget ${widget.key} label`);
    within(widget.description, 1, 100, `widget ${widget.key} description`);
  }
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    within(section.description, 1, 1000, `section ${section.key} description`);
  }
});
