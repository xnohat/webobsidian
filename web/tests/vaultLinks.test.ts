import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatInternalLink, resolveNewNoteDirectory, isUserIgnored } from '../src/lib/vaultLinks';
import { isSupportedVaultFile } from '../src/lib/media';

const preferences = { newFileLocation: 'current' as const, newFileFolderPath: 'Notes', useMarkdownLinks: false, newLinkFormat: 'shortest' as const };
test('new note directory respects explicit root, current note, and configured folder', () => {
  assert.equal(resolveNewNoteDirectory({ sourcePath: 'A/B.md', preferences }), 'A');
  assert.equal(resolveNewNoteDirectory({ sourcePath: null, preferences }), '');
  assert.equal(resolveNewNoteDirectory({ sourcePath: 'A/B.md', explicitDirectory: '', preferences }), '');
  assert.equal(resolveNewNoteDirectory({ sourcePath: 'A/B.md', preferences: { ...preferences, newFileLocation: 'folder' } }), 'Notes');
  assert.throws(() => resolveNewNoteDirectory({ explicitDirectory: '../escape', preferences }));
  assert.throws(() => resolveNewNoteDirectory({ preferences: { ...preferences, newFileLocation: 'folder', newFileFolderPath: 'C:\\bad' } }));
});
test('shortest links remain unique with duplicate basenames and relative shadowing', () => {
  const knownPaths = ['A/Target.md', 'B/Target.md', 'C/Source.md'];
  assert.equal(formatInternalLink({ sourcePath: 'C/Source.md', targetPath: 'A/Target.md', knownPaths, preferences }), '[[A/Target]]');
  assert.equal(formatInternalLink({ sourcePath: 'A/Source.md', targetPath: 'A/Target.md', knownPaths, preferences }), '[[Target]]');
  assert.equal(formatInternalLink({ sourcePath: 'C/Source.md', targetPath: 'A/Unique.md', knownPaths, preferences }), '[[Unique]]');
  assert.equal(formatInternalLink({ sourcePath: 'C/Source.md', targetPath: 'A/Target.md', knownPaths: [...knownPaths, 'C/A/Target.md'], preferences }), '[[../A/Target]]');
});
test('shortest wiki links account for case and both markdown extensions before omitting the suffix',()=>{
  assert.equal(formatInternalLink({sourcePath:'Notes/Source.md',targetPath:'B/Target.md',knownPaths:['A/target.md','B/Target.md'],preferences}),'[[B/Target]]');
  assert.equal(formatInternalLink({sourcePath:'Notes/Source.md',targetPath:'B/Target.markdown',knownPaths:['A/Target.md','B/Target.markdown'],preferences}),'[[B/Target]]');
});
test('relative and absolute markdown links encode filenames exactly once including embeds', () => {
  assert.equal(formatInternalLink({ sourcePath: 'Notes/Note.md', targetPath: 'Media/фото #1 (100%).png', embed: true, preferences: { ...preferences, useMarkdownLinks: true, newLinkFormat: 'relative' } }), '![](../Media/%D1%84%D0%BE%D1%82%D0%BE%20%231%20%28100%25%29.png)');
  assert.equal(formatInternalLink({ sourcePath: 'Notes/Note.md', targetPath: 'A/B.md', label: 'B ]', preferences: { ...preferences, useMarkdownLinks: true, newLinkFormat: 'absolute' } }), '[B \\]](/A/B.md)');
  assert.equal(formatInternalLink({ sourcePath: 'Notes/Note.md', targetPath: 'A/B.md', preferences: { ...preferences, newLinkFormat: 'absolute' } }), '[[/A/B]]');
  assert.throws(() => formatInternalLink({ targetPath: '../escape.md', preferences }));
});
test('wiki percent sequences remain literal and wiki delimiters use an exact Markdown URL',()=>{
  const knownPaths=['Media/shot%20one.png','Media/shot one.png','Media/shot #1.png','Media/shot %231.png'];
  assert.equal(formatInternalLink({sourcePath:'Notes/Source.md',targetPath:knownPaths[0],embed:true,knownPaths,preferences}),'![[shot%20one.png]]');
  assert.equal(formatInternalLink({sourcePath:'Notes/Source.md',targetPath:knownPaths[2],embed:true,knownPaths,preferences}),'![](shot%20%231.png)');
  assert.equal(formatInternalLink({sourcePath:'Notes/Source.md',targetPath:knownPaths[3],embed:true,knownPaths,preferences}),'![[shot %231.png]]');
  assert.equal(formatInternalLink({targetPath:'Media/a|b[1].png',embed:true,preferences}),'![](a%7Cb%5B1%5D.png)');
});
test('Obsidian exclusions are case insensitive literal prefixes or slash delimited regex', () => {
  assert.equal(isUserIgnored('Archive/note.md', [' archive ']), true);
  assert.equal(isUserIgnored('Archives.md', ['Archive']), true);
  assert.equal(isUserIgnored('Other/Archive/note.md', ['Archive']), false);
  assert.equal(isUserIgnored('Notes/Draft.md', ['/draft\\.md$/']), true);
  assert.equal(isUserIgnored('Notes/a.md', ['*.md', '/[/']), false);
});
test('supported registry retains web text formats, canvas, media and downloadable documents', () => {
  for (const path of ['n.md', 'n.markdown', 'n.canvas', 'n.pdf', 'n.docx', 'n.xlsx', 'n.pptx', 'n.zip', 'n.png', 'n.webm', 'n.flac', 'n.json', 'n.csv', 'n.yaml', 'n.txt', 'n.js', 'n.css']) assert.equal(isSupportedVaultFile(path), true, path);
  assert.equal(isSupportedVaultFile('n.ts'), true);
  assert.equal(isSupportedVaultFile('n.unknown'), false);
});
