import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { config, SETTINGS_FILE } from '../config.js';
import { isDefaultPasswordActive } from './password-policy.js';

/** ---- Schema (PRD §6) ---------------------------------------------------- */

export const LanguagePackSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(255),
  text: z.string().max(5_000_000),
});

const ApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  hash: z.string(),
  prefix: z.string(), // first chars, for display
  scopes: z.array(z.enum(['read', 'write', 'search'])).default(['read', 'search']),
  createdAt: z.string(),
  lastUsed: z.string().nullable().default(null),
});

// Keep toolbar validation local to this field: a damaged toolbar must never reset
// authentication, vault paths or other settings when loading an existing file.
const ToolbarIconSchema = z.enum(['command','undo','redo','bold','italic','heading','palette','code','link','list','quote','paperclip','check-square','brackets','pencil','menu','more-horizontal','align-left','align-center','align-right','indent-increase','indent-decrease','hash','minus','columns','rows','crosshair','file-text','settings','paintbrush','eraser','type','strikethrough','underline','highlighter','maximize','table','copy','scissors','clipboard','arrow-up','arrow-down','list-ordered','message-square','superscript','subscript','align-justify']).catch('command');
const ToolbarColorSchema = z.string().regex(/^#[\da-f]{6}(?:[\da-f]{2})?$/i).transform(v=>v.toLowerCase());
type EditingToolbarNode =
  | {type:'separator';instanceId:string}
  | {type:'command';instanceId:string;commandId:string;label?:string;icon?:string;disabled?:boolean;disabledReason?:string}
  | {type:'group';instanceId:string;label:string;icon?:string;style?:'menu'|'compact';children:EditingToolbarNode[]};
function toolbarNodeSchema(depth:number):z.ZodType<EditingToolbarNode> {
  const instanceId=z.string().min(1).max(160);
  const command=z.object({type:z.literal('command'),instanceId,commandId:z.string().min(1).max(240),label:z.string().max(120).optional(),icon:ToolbarIconSchema.optional(),disabled:z.boolean().optional(),disabledReason:z.string().max(240).optional()});
  const separator=z.object({type:z.literal('separator'),instanceId});
  if(depth>=3)return z.union([command,separator]);
  return z.union([command,separator,z.object({type:z.literal('group'),instanceId,label:z.string().max(120),icon:ToolbarIconSchema.optional(),style:z.enum(['menu','compact']).optional(),children:z.array(toolbarNodeSchema(depth+1)).max(200)})]);
}
const ToolbarLayoutSchema=z.object({
  enabled:z.boolean(),
  items:z.array(toolbarNodeSchema(0)).max(200).refine(items=>{
    const count=(nodes:EditingToolbarNode[]):number=>nodes.reduce((sum,n)=>sum+1+(n.type==='group'?count(n.children):0),0);
    return count(items)<=200;
  },'At most 200 items per layout'),
  position:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).optional(),
});
export const EditingToolbarSchema=z.object({
  version:z.literal(1),
  layouts:z.object({top:ToolbarLayoutSchema.optional().catch(undefined),following:ToolbarLayoutSchema.optional().catch(undefined),fixed:ToolbarLayoutSchema.optional().catch(undefined),mobile:ToolbarLayoutSchema.optional().catch(undefined)}),
  appearance:z.object({iconSize:z.number().min(12).max(32).optional(),density:z.enum(['comfortable','compact']).optional(),showLabels:z.boolean().optional(),tooltips:z.boolean().optional(),overflow:z.enum(['menu','scroll','wrap']).optional(),style:z.enum(['standard','compact']).optional(),backgroundColor:ToolbarColorSchema.optional().catch(undefined),iconColor:ToolbarColorSchema.optional().catch(undefined)}).optional(),
  customCommands:z.array(z.object({id:z.string().max(120).regex(/^custom:[\w:-]+$/),label:z.string().min(1).max(120),icon:ToolbarIconSchema,prefix:z.string().max(4096),suffix:z.string().max(4096)})).max(100).refine(items=>new Set(items.map(i=>i.id)).size===items.length,'Custom command IDs must be unique').optional(),
  customColors:z.array(ToolbarColorSchema).max(100).optional(),
});

export const CodeFileViewerSchema=z.object({enabled:z.boolean(),lineNumbers:z.boolean(),extensionMap:z.record(z.string().max(64).regex(/^[a-z0-9_+-]+$/).refine(v=>!/^(md|markdown|canvas|pdf|png|jpe?g|gif|svg|webp|bmp|ico|avif|mp4|webm|ogv|mov|mkv|mp3|wav|m4a|3gp|flac|ogg|oga|opus|docx?|xlsx?|pptx?|odt|ods|odp|rtf|zip|7z|tar|gz|tgz|bz2|xz|__proto__|constructor|prototype)$/.test(v)),z.string().min(1).max(64).regex(/^[a-z0-9_+-]+$/)).refine(m=>Object.keys(m).length<=256)});
const SettingsSchema = z.object({
  version: z.number().default(1),
  auth: z
    .object({
      // The user's chosen password. Empty = still on the default password (123456).
      userPasswordHash: z.string().default(''),
      // Recovery/override password for a forgotten password (set by hand in the file). Empty = none.
      passwordHash: z.string().default(''),
      jwtSecret: z.string().default(''),
    })
    .prefault({}),
  vault: z
    .object({
      path: z.string().default(''),
      allowedRoots: z.array(z.string()).default([]),
      trash: z.string().default('.trash'),
      // Delete behavior: 'trash' = move into the .trash folder (recoverable);
      // 'permanent' = delete immediately and permanently.
      deleteMode: z.enum(['trash', 'permanent']).default('trash'),
      followObsidianDeletion: z.boolean().default(false),
      // Số ngày giữ item trong .trash (tính từ lúc item được chuyển vào trash) trước khi
      // tự xoá vĩnh viễn. 0 = giữ mãi, không tự dọn.
      trashRetentionDays: z.number().int().min(0).max(3650).default(0),
      attachmentDir: z.string().default('attachments'),
    })
    .prefault({}),
  git: z
    .object({
      enabled: z.boolean().default(false),
      remote: z.string().default(''),
      branch: z.string().default('main'),
      token: z.string().default(''),
      authorName: z.string().default('WebObsidian'),
      authorEmail: z.string().default('webobsidian@localhost'),
      autoSync: z.boolean().default(false),
      autoCommitOnSave: z.boolean().default(false),
      intervalSec: z.number().default(300),
      lfsPatterns: z
        .array(z.string())
        .default(['*.png', '*.jpg', '*.jpeg', '*.gif', '*.pdf', '*.mp4', '*.mov', '*.zip']),
    })
    .prefault({}),
  search: z
    .object({
      fuzzy: z.number().default(0.2),
      prefix: z.boolean().default(true),
      indexFrontmatter: z.boolean().default(true),
    })
    .prefault({}),
  api: z
    .object({
      keys: z.array(ApiKeySchema).default([]),
      rateLimitPerMin: z.number().default(120),
    })
    .prefault({}),
  ui: z
    .object({
      theme: z
        .enum([
          'obsidian-dark',
          'obsidian-light',
          'catppuccin-mocha',
          'catppuccin-macchiato',
          'catppuccin-frappe',
          'catppuccin-latte',
        ])
        .default('obsidian-light'),
      defaultView: z.enum(['live', 'source', 'reading']).default('live'),
      // Obsidian's "Show inline title": the filename rendered above the note body.
      showInlineTitle: z.boolean().default(true),
      codeFileViewer: CodeFileViewerSchema.optional().catch(undefined),
      editingToolbar: EditingToolbarSchema.optional().catch(undefined),
      languagePack: LanguagePackSchema.nullable().optional().catch(undefined),
    })
    .prefault({}),
  plugins: z
    .object({
      enabled: z.array(z.string()).default([]),
      installed: z.array(z.string()).default([]),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type ApiKeyRecord = z.infer<typeof ApiKeySchema>;

/** ---- Store --------------------------------------------------------------- */

let cache: Settings | null = null;
let loading: Promise<Settings> | null = null;
let updates: Promise<unknown> = Promise.resolve();

function defaults(): Settings {
  const base = SettingsSchema.parse({});
  base.auth.jwtSecret = randomBytes(48).toString('hex');
  base.vault.path = config.defaultVaultPath;
  base.vault.allowedRoots = config.allowedRoots.length
    ? config.allowedRoots
    : [path.dirname(config.defaultVaultPath), config.defaultVaultPath];
  return base;
}

/**
 * Guarantee the folder browser can reach the configured vault. The default
 * allowedRoots are derived from the sample vault, so pointing the vault at a
 * path outside them (e.g. ~/ObsidianVault) made Browse… return 403 with
 * "Path outside allowed roots". Add the vault's parent directory as a root
 * whenever it isn't already covered. Returns true if it mutated the draft.
 */
export function ensureVaultBrowsable(d: Settings): boolean {
  const vaultPath = path.resolve(d.vault.path);
  const roots = d.vault.allowedRoots ?? [];
  const covered = roots.some((r) => {
    const rr = path.resolve(r);
    return vaultPath === rr || vaultPath.startsWith(rr + path.sep);
  });
  if (covered) return false;
  d.vault.allowedRoots = [...roots, path.dirname(vaultPath)];
  return true;
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
}

/** Atomic write: write to tmp then rename; keep a .bak of the previous file. */
async function persist(s: Settings): Promise<void> {
  await ensureDataDir();
  const json = JSON.stringify(s, null, 2);
  const tmp = `${SETTINGS_FILE}.tmp-${randomBytes(4).toString('hex')}`;
  await fs.writeFile(tmp, json, { mode: 0o600 });
  try {
    await fs.copyFile(SETTINGS_FILE, `${SETTINGS_FILE}.bak`);
  } catch {
    /* no previous file */
  }
  try { await fs.rename(tmp, SETTINGS_FILE); }
  finally { await fs.rm(tmp, { force: true }).catch(() => undefined); }
}

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;
  if (loading) return loading;
  loading = initializeSettings();
  try { return await loading; } finally { loading = null; }
}

async function initializeSettings(): Promise<Settings> {
  await ensureDataDir();
  let parsed: Settings;
  let dirty = false;
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    parsed = SettingsSchema.parse(JSON.parse(raw));
    // Backfill secrets that may be empty in older files.
    if (!parsed.auth.jwtSecret) {
      parsed.auth.jwtSecret = randomBytes(48).toString('hex');
      dirty = true;
    }
    // Migration: `passwordHash` used to be the login password. The new model treats
    // `passwordHash` as the override and `userPasswordHash` as the login password
    // (empty = default 123456). So an old file can't be backdoored via 123456, move
    // the old password into `userPasswordHash` and clear the override field.
    if (parsed.auth.passwordHash && !parsed.auth.userPasswordHash) {
      parsed.auth.userPasswordHash = parsed.auth.passwordHash;
      parsed.auth.passwordHash = '';
      dirty = true;
    }
    // Heal older files whose allowedRoots predate the current vault path.
    if (ensureVaultBrowsable(parsed)) dirty = true;
  } catch {
    parsed = defaults();
    dirty = true;
  }
  if (dirty) await persist(parsed);
  cache = parsed;
  return cache;
}

export async function getSettings(): Promise<Settings> {
  return cache ?? (await loadSettings());
}

/** Mutate settings via an updater fn, validate, persist, and refresh cache. */
export async function updateSettings(
  mutator: (draft: Settings) => void | Promise<void>,
): Promise<Settings> {
  const next = updates.then(async () => {
    const current = await getSettings();
    const draft: Settings = JSON.parse(JSON.stringify(current));
    await mutator(draft);
    const validated = SettingsSchema.parse(draft);
    await persist(validated);
    cache = validated;
    return validated;
  });
  updates = next.catch(() => undefined);
  return next;
}

/** Redact secrets for sending to the client. */
export function redactSettings(s: Settings) {
  return {
    ...s,
    auth: {
      // hasCustomPassword=false means the instance is still on the default
      // password (123456). Shares one condition with checkPassword: once an
      // override is configured (auth.passwordHash / WEBOBSIDIAN_PASSWORD) the
      // default no longer works, so the UI must stop warning that it does.
      hasCustomPassword: !isDefaultPasswordActive(s.auth),
      hasOverridePassword: Boolean(s.auth.passwordHash),
    },
    git: { ...s.git, token: s.git.token ? '••••••••' : '' },
    api: {
      ...s.api,
      keys: s.api.keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scopes: k.scopes,
        createdAt: k.createdAt,
        lastUsed: k.lastUsed,
      })),
    },
  };
}
