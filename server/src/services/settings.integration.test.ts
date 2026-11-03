import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let root: string;
let settingsFile: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'webobsidian-integration-settings-'));
  settingsFile = path.join(root, 'data', 'settings.json');
  vi.resetModules();
  vi.doMock('../config.js', () => ({
    config: {
      dataDir: path.dirname(settingsFile),
      defaultVaultPath: path.join(root, 'vault'),
      allowedRoots: [path.join(root, 'vault')],
    },
    SETTINGS_FILE: settingsFile,
  }));
});

afterEach(async () => {
  vi.doUnmock('../config.js');
  vi.resetModules();
  await fs.rm(root, { recursive: true, force: true });
});

describe('community integration: preserve existing trash by default', () => {
  it('persists a shared language pack, reloads it and supports clearing it', async () => {
    const settings = await import('./settings.js');
    const pack = {version:1 as const,name:'custom.txt',text:'[interface.settings]\ntranslation=Preferences'};
    await settings.updateSettings(d => {d.ui.languagePack = pack;});
    expect((await settings.getSettings()).ui.languagePack).toEqual(pack);
    vi.resetModules();
    const reloaded = await import('./settings.js');
    expect((await reloaded.getSettings()).ui.languagePack).toEqual(pack);
    await reloaded.updateSettings(d => {d.ui.languagePack = null;});
    expect(JSON.parse(await fs.readFile(settingsFile,'utf8')).ui.languagePack).toBeNull();
    expect(reloaded.LanguagePackSchema.safeParse({...pack,text:'x'.repeat(5_000_001)}).success).toBe(false);
    expect(reloaded.LanguagePackSchema.safeParse({...pack,version:2}).success).toBe(false);
  });
  it('keeps disk and cache unchanged when persistence fails',async()=>{
    const {getSettings,updateSettings}=await import('./settings.js');const before=await getSettings();
    const rename=vi.spyOn(fs,'rename').mockRejectedValueOnce(new Error('fixture disk failure'));
    await expect(updateSettings(d=>{d.vault.deleteMode='permanent';})).rejects.toThrow('fixture disk failure');rename.mockRestore();
    expect((await getSettings()).vault.deleteMode).toBe(before.vault.deleteMode);
    expect(JSON.parse(await fs.readFile(settingsFile,'utf8')).vault.deleteMode).toBe(before.vault.deleteMode);
  });
  it('serializes overlapping updates without losing independent fields',async()=>{
    const {getSettings,updateSettings}=await import('./settings.js');await getSettings();
    await Promise.all([updateSettings(async d=>{await new Promise(r=>setTimeout(r,20));d.vault.trashRetentionDays=7;}),updateSettings(d=>{d.ui.showInlineTitle=false;})]);
    expect(await getSettings()).toMatchObject({vault:{trashRetentionDays:7},ui:{showInlineTitle:false}});
  });
  it('bounds and sanitizes toolbar schema while recovering only a damaged layout', async () => {
    const {EditingToolbarSchema}=await import('./settings.js');
    const good={enabled:true,items:[{type:'command',instanceId:'one',commandId:'editing-toolbar:toggle-bold',icon:'<svg onload="bad()">',script:'bad()'}]};
    const parsed=EditingToolbarSchema.parse({version:1,layouts:{top:good,mobile:{enabled:true,items:Array.from({length:201},(_,i)=>({type:'separator',instanceId:String(i)}))}},appearance:{iconColor:'#ABCDEF',backgroundColor:'url(javascript:bad)'},css:'bad{}'});
    expect(parsed.layouts.top?.items[0]).toMatchObject({icon:'command'});expect(parsed.layouts.top?.items[0]).not.toHaveProperty('script');
    expect(parsed.layouts.mobile).toBeUndefined();expect(parsed.appearance).toMatchObject({iconColor:'#abcdef'});
    expect(parsed.appearance?.backgroundColor).toBeUndefined();expect(parsed).not.toHaveProperty('css');
    const commands=Array.from({length:101},(_,i)=>({id:`custom:${i}`,label:'Template',icon:'command',prefix:'${x}',suffix:''}));
    expect(EditingToolbarSchema.safeParse({version:1,layouts:{},customCommands:commands}).success).toBe(false);
  });
  it('persists toolbar data without changing secrets and recovers a malformed toolbar section', async () => {
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify({
      auth: {userPasswordHash:'fixture-password-hash',jwtSecret:'fixture-existing-secret'},
      git: {token:'fixture-git-token'},vault: {path:path.join(root,'vault')},
      ui: {theme:'obsidian-dark',editingToolbar:{version:1,layouts:{top:{enabled:true,items:[{type:'command',instanceId:'one',commandId:'editing-toolbar:toggle-bold'}]}},appearance:{iconSize:20},customCommands:[],customColors:['#123456']}},
    }));
    const {loadSettings,updateSettings}=await import('./settings.js');
    const s=await loadSettings();
    expect(s.ui.editingToolbar).toMatchObject({version:1,layouts:{top:{enabled:true}}});
    const next=await updateSettings(draft=>{ draft.ui.showInlineTitle=false; });
    expect(next.auth.userPasswordHash).toBe('fixture-password-hash');expect(next.auth.jwtSecret).toBe('fixture-existing-secret');
    expect(next.git.token).toBe('fixture-git-token');
    expect(JSON.parse(await fs.readFile(settingsFile,'utf8')).ui.editingToolbar.layouts.top.items[0].commandId).toBe('editing-toolbar:toggle-bold');
    await fs.writeFile(settingsFile,JSON.stringify({...next,ui:{...next.ui,editingToolbar:{version:1,layouts:'bad'}}}));
    vi.resetModules();const reloaded=await (await import('./settings.js')).loadSettings();
    expect(reloaded.auth.userPasswordHash).toBe('fixture-password-hash');expect(reloaded.auth.jwtSecret).toBe('fixture-existing-secret');
    expect(reloaded.git.token).toBe('fixture-git-token');expect(reloaded.ui.theme).toBe('obsidian-dark');
    expect(reloaded.ui.editingToolbar).toBeUndefined();
  });
  it('fills every settings group when starting with a fresh file', async () => {
    const { loadSettings } = await import('./settings.js');
    const s = await loadSettings();
    expect(s.auth).toMatchObject({ userPasswordHash: '', passwordHash: '' });
    expect(s.auth.jwtSecret).toMatch(/^[a-f0-9]{96}$/);
    expect(s.vault).toMatchObject({ trash: '.trash', deleteMode: 'trash', trashRetentionDays: 0, attachmentDir: 'attachments' });
    expect(s.git).toMatchObject({ enabled: false, branch: 'main', autoSync: false, autoCommitOnSave: false, intervalSec: 300 });
    expect(s.git.lfsPatterns).toContain('*.pdf');
    expect(s.search).toEqual({ fuzzy: 0.2, prefix: true, indexFrontmatter: true });
    expect(s.api).toEqual({ keys: [], rateLimitPerMin: 120 });
    expect(s.ui).toEqual({ theme: 'obsidian-light', defaultView: 'live', showInlineTitle: true });
    expect(s.plugins).toEqual({ enabled: [], installed: [] });
  });

  it('preserves explicit legacy values, migrates the password and fills omitted defaults', async () => {
    const vaultPath = path.join(root, 'custom-vault');
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify({
      auth: { passwordHash: 'fixture-password-hash', jwtSecret: 'fixture-existing-secret' },
      vault: { path: vaultPath, trashRetentionDays: 17 },
      git: { remote: 'https://example.invalid/notes.git', token: 'fixture-token' },
      api: { keys: [{ id: 'fixture', name: 'test', hash: 'fixture-key-hash', prefix: 'fixture', createdAt: '2026-10-29' }] },
      ui: { showInlineTitle: false },
    }));
    const { loadSettings, updateSettings } = await import('./settings.js');
    const s = await loadSettings();
    expect(s.auth).toEqual({ userPasswordHash: 'fixture-password-hash', passwordHash: '', jwtSecret: 'fixture-existing-secret' });
    expect(s.vault).toMatchObject({ path: vaultPath, trashRetentionDays: 17, attachmentDir: 'attachments' });
    expect(s.git).toMatchObject({ remote: 'https://example.invalid/notes.git', token: 'fixture-token', branch: 'main', autoSync: false });
    expect(s.api.keys[0]).toMatchObject({ hash: 'fixture-key-hash', scopes: ['read', 'search'], lastUsed: null });
    expect(s.ui).toMatchObject({ theme: 'obsidian-light', showInlineTitle: false });
    expect(s.search.prefix).toBe(true);
    expect(s.plugins).toEqual({ enabled: [], installed: [] });
    await updateSettings(draft => { draft.ui.defaultView = 'source'; });
    const persisted = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
    expect(persisted.auth.userPasswordHash).toBe('fixture-password-hash');
    expect(persisted.vault.path).toBe(vaultPath);
    expect(persisted.vault.trashRetentionDays).toBe(17);
  });

  it('keeps a fresh vault trash indefinitely until retention is explicitly enabled', async () => {
    const { loadSettings } = await import('./settings.js');
    expect((await loadSettings()).vault).toMatchObject({ trashRetentionDays: 0 });
  });

  it('does not silently enable cleanup when loading an older settings file', async () => {
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify({
      vault: { path: path.join(root, 'vault') },
    }));
    const { loadSettings } = await import('./settings.js');
    expect((await loadSettings()).vault).toMatchObject({ trashRetentionDays: 0 });
  });
});
