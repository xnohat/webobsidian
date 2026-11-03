import { it, expect } from 'vitest';
import matter from 'gray-matter';
import { parseNote } from './markdown.js';

it('does not retain note bodies in the process-wide gray-matter cache', () => {
  const cache = (matter as unknown as {cache: Record<string, unknown>}).cache;
  const before = Object.keys(cache).length;
  for (let i = 0; i < 20; i++) {
    const note = parseNote(`note-${i}.md`, `---\ntitle: Note ${i}\ntags: [work]\n---\nbody ${i}`);
    expect(note.title).toBe(`Note ${i}`);
    expect(note.tags).toEqual(['work']);
  }
  expect(Object.keys(cache)).toHaveLength(before);
});
