import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalog} from '../src/lib/i18n/catalog';
import {parseLanguagePack, exportLanguageTemplate} from '../src/lib/i18n/pack';
import {t, prepareLanguagePack, applyServerLanguage, initializeLanguage} from '../src/lib/i18n/runtime';

test('supplied Russian import file covers the UI catalogue and preserves placeholders', () => {
  const text = readFileSync(new URL('../../translations/ru.txt', import.meta.url), 'utf8');
  const russian = parseLanguagePack(text);
  assert.deepEqual(Object.keys(russian.translations).sort(), Object.keys(catalog).sort());
  assert.deepEqual(russian.warnings, []);
  assert.equal(russian.unknown, 0);
  assert.equal(russian.translations['setting.about.option-language'], 'Язык');
});

test('language packs preserve values, ignore foreign keys and validate placeholders', () => {
  const result = parseLanguagePack('\ufeff[plugins.file-explorer.action-new-folder]\r\noriginal=New folder\r\ntranslation=Folder = custom\r\n[foreign.key]\r\ntranslation=ignored');
  assert.equal(result.translations['plugins.file-explorer.action-new-folder'], 'Folder = custom');
  assert.equal(result.unknown, 1);
  assert.throws(() => parseLanguagePack('[plugins.file-explorer.action-new-folder]\ntranslation=One\n[plugins.file-explorer.action-new-folder]\ntranslation=Two'), /Duplicate/);
  assert.throws(() => parseLanguagePack('broken'), /line 1/);
  const invalid = parseLanguagePack('[webobsidian.missing-file]\ntranslation=Missing {{wrong}}');
  assert.equal(Object.keys(invalid.translations).length, 0);
  assert.equal(invalid.warnings.length, 1);
});

test('template can be partially filled and imported', () => {
  const template = exportLanguageTemplate();
  assert.match(template, /\[plugins.file-explorer.action-new-folder\]/);
  assert.equal(Object.keys(parseLanguagePack(template).translations).length, 0);
});

test('runtime caches server packs, restores, replaces and falls back to English', () => {
  let saved: string | null = null;
  let fail = false;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {if (fail) throw Error('quota'); saved = value;},
    removeItem: () => {saved = null;},
  };
  initializeLanguage(storage);
  const pack = '[plugins.file-explorer.action-new-folder]\ntranslation=Custom folder';
  applyServerLanguage(prepareLanguagePack(pack, 'custom.txt').pack);
  assert.equal(t('plugins.file-explorer.action-new-folder'), 'Custom folder');
  fail = true;
  assert.doesNotThrow(() => applyServerLanguage(prepareLanguagePack(pack, 'custom.txt').pack));
  assert.equal(t('plugins.file-explorer.action-new-folder'), 'Custom folder');
  fail = false;
  initializeLanguage(storage);
  assert.equal(t('plugins.file-explorer.action-new-folder'), 'Custom folder');
  applyServerLanguage(prepareLanguagePack('[webobsidian.missing-file]\ntranslation=Missing {{name}}', 'other.txt').pack);
  assert.equal(t('plugins.file-explorer.action-new-folder'), 'New folder');
  assert.equal(t('webobsidian.missing-file', {name: '<b>note</b>'}), 'Missing <b>note</b>');
  assert.equal(t('webobsidian.deleted-items', {count: 1}), 'Deleted 1 item');
  assert.equal(t('webobsidian.deleted-items', {count: 0}), 'Deleted 0 items');
  assert.equal(t('webobsidian.deleted-items', {count: 2}), 'Deleted 2 items');
  applyServerLanguage(null);
  assert.equal(saved, null);
  saved = '{broken';
  assert.doesNotThrow(() => initializeLanguage(storage));
});
