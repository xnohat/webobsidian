import { describe, it, expect, vi } from 'vitest';
vi.mock('../settings.js', () => ({ getSettings: async () => ({ search: { prefix: true, fuzzy: 0 } }) }));
import { IndexProjection } from './projection.js';
import { parseNote } from '../markdown.js';
import { backlinksFor, resolveLink } from '../links.js';
import { resolveFile } from '../fileindex.js';

describe('IndexProjection', () => {
  it('keeps published links/files consistent with incremental search updates',()=>{
    const p=new IndexProjection();p.publish();
    p.applyNote('New.md',parseNote('New.md','[[Target]]'));
    expect(resolveLink('New')).toBe('New.md');expect(backlinksFor('Target.md')).toEqual(['New.md']);
    p.applyFile('image.png');expect(resolveFile('image.png')).toBe('image.png');
    p.remove('New.md');expect(resolveLink('New')).toBeUndefined();
  });
  it('restores search/tasks/tags/links/files without reading a vault and publishes together', async () => {
    const p = new IndexProjection();
    p.applyNote('Работа/ЕЦП.md', parseNote('Работа/ЕЦП.md', '---\ntype: task\nstatus: done\n---\n# quartz\n[[Target]] #work'));
    p.applyNote('Target.md', parseNote('Target.md', 'Target'));
    p.applyFile('img/picture.png');
    const restored = IndexProjection.fromState(JSON.parse(JSON.stringify(p.exportState())));
    expect((await restored.search.search('quartz'))[0].path).toBe('Работа/ЕЦП.md');
    expect((await restored.search.allTasks())[0].status).toBe('done');
    restored.publish();
    expect(backlinksFor('Target.md')).toEqual(['Работа/ЕЦП.md']);
    expect(resolveLink('ЕЦП')).toBe('Работа/ЕЦП.md');
    expect(resolveFile('picture.png')).toBe('img/picture.png');
  });
  it('restores a colliding basename after deleting its preferred path', () => {
    const p = new IndexProjection();
    for (const rel of ['a/Target.md', 'Target.md']) p.applyNote(rel, parseNote(rel, rel));
    p.applyFile('a/image.png'); p.applyFile('image.png');
    p.remove('Target.md'); p.remove('image.png'); p.publish();
    expect(resolveLink('Target')).toBe('a/Target.md');
    expect(resolveFile('image.png')).toBe('a/image.png');
  });
});
