import {translateLabel as uiLabel} from "../lib/i18n/runtime";
import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import LanguageSettings from './LanguageSettings';
import {loadPlugins,usePluginStates} from '../lib/plugins';
import { useEffect, useRef, useState } from 'react';
import { useStore,resetDraftScope } from '../lib/store';
import { api } from '../lib/api';
import { themeClass } from '../lib/theme';
import Icon from './Icon';
import CodeFileViewerSettings from './CodeFileViewerSettings';
import {defaultCodeFileViewer} from '../lib/codeFiles';
import ToolbarSettings from './toolbar/ToolbarSettings';
import {useIndexStatus,indexStatusMessage,refreshIndexStatus,resetIndexStatus} from '../lib/indexStatus';
import {useVaultPreferences,getVaultPreferences,resetVaultPreferences,importMobileToolbarCommands,mobileToolbarCommandMappings} from '../lib/vaultPreferences';

type Section = 'vault' | 'git' | 'api' | 'sharing' | 'plugins' | 'appearance' | 'language' | 'toolbar' | 'codeFiles' | 'account' | 'about';

export default function Settings() {
  const languageRevision = useLanguage().revision;

  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettings);
  const [section, setSection] = useState<Section>('vault');
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (open) api.getSettings().then(setSettings).catch(() => {});
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-bg" onClick={() => setOpen(false)}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-layout">
          <div className="settings-nav">
            {(['vault', 'git', 'api', 'sharing', 'plugins', 'appearance', 'language', 'toolbar', 'codeFiles', 'account', 'about'] as Section[]).map((s) => (
              <button key={s} className={section === s ? 'active' : ''} onClick={() => setSection(s)}>
                {uiLabel(labels[s])}
              </button>
            ))}
          </div>
          <div className="settings-content">
            {section === 'language' && <LanguageSettings />}
            {settings && section === "vault" && <VaultSettings s={settings} reload={() => api.getSettings().then(setSettings)} />}
            {settings && section === "git" && <GitSettings s={settings} reload={() => api.getSettings().then(setSettings)} />}
            {section === "api" && <ApiKeys />}
            {section === "sharing" && <Shares />}
            {section === "plugins" && <Plugins />}
            {settings && section === "appearance" && <Appearance s={settings} />}
            {settings && section === "toolbar" && <ToolbarSettings value={settings.ui.editingToolbar} onSaved={(editingToolbar) => setSettings((current: any) => ({...current, ui:{...current.ui, editingToolbar}}))} />}
            {section === "account" && <AccountSettings s={settings} reload={() => api.getSettings().then(setSettings)} />}
            {settings && section === "codeFiles" && <CodeFileViewerSettings value={settings.ui.codeFileViewer??defaultCodeFileViewer} onSave={async next=>{await useStore.getState().applyCodeFileViewerSettings(next);setSettings(await api.getSettings());}}/>}
            {section === "about" && <About />}
          </div>
        </div>
      </div>
    </div>
  );
}

const labels: Record<Section, string> = {
  get language() {return uiText('setting.about.option-language');},
  get vault() {return uiText("webobsidian.vault-files-8abe8d");},
  get git() {return uiText("webobsidian.github-sync-3bd85c");},
  get api() {return uiText("webobsidian.api-keys-e18ffc");},
  get sharing() {return uiText("webobsidian.sharing-78779b");},
  get plugins() {return uiText("webobsidian.community-plugins-3d3966");},
  get appearance() {return uiText("setting.appearance.name");},
  get toolbar() {return uiText("webobsidian.editing-toolbar-98490d");},
  get codeFiles() {return uiText("webobsidian.code-files-4b0d81");},
  get account() {return uiText("setting.account.name");},
  get about() {return uiText("webobsidian.about-6b21fb");},
};

function Row({ name, desc, children }: { name: string; desc?: string; children: React.ReactNode }) {
  const languageRevision = useLanguage().revision;

  return (
    <div className="setting-row">
      <div className="info">
        <div className="name">{name}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <div className="control">{children}</div>
    </div>
  );
}

function IndexSettings(){
  const languageRevision = useLanguage().revision;

  const {status}=useIndexStatus();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{refreshIndexStatus().catch(()=>setError(uiText("webobsidian.could-not-load-index-status-9525e1")));},[]);
  const run=async(mode:'reconcile'|'rebuild')=>{
    setBusy(true);setError('');
    try{await api.indexJob(mode);await refreshIndexStatus();}
    catch{setError(uiText("webobsidian.could-not-start-index-update-check-the-connectio-9bfc58"));}
    finally{setBusy(false);}
  };
  return <section aria-label={uiText("webobsidian.search-index-3bc3d2")} style={{marginBottom:20}}>
    <Row name={uiText("webobsidian.search-index-3bc3d2")} desc={status?uiText("webobsidian.-value0-notes-value1-value2-pending-75e7bb", {value0: status.indexedNotes, value1: status.watcherMode, value2: status.pendingPaths}):uiText("webobsidian.loading-index-status-0a609d")}>
      <span role="status">{status?.phase==='ready'&&!status.persistenceError?uiText("webobsidian.up-to-date-82fb1d"):indexStatusMessage(status)}</span>
    </Row>
    {status?.lastReconcileAt&&<div className="desc">{uiText("webobsidian.last-check-4b5c0b")} {new Date(status.lastReconcileAt).toLocaleString()}</div>}
    {error&&<div role="alert">{error}</div>}
    <div style={{display:'flex',gap:8,marginTop:8}}>
      <button className="btn secondary" disabled={busy} onClick={()=>run('reconcile')}>{uiText("webobsidian.check-for-changes-67828b")}</button>
      <button className="btn secondary" disabled={busy} onClick={()=>run('rebuild')}>{uiText("webobsidian.rebuild-index-848ded")}</button>
    </div>
  </section>;
}

function VaultSettings({ s, reload }: { s: any; reload: () => Promise<unknown> }) {
  const languageRevision = useLanguage().revision;

  const preferences=useVaultPreferences();
  const autoReveal = useStore((st) => st.autoReveal);
  const setAutoReveal = useStore((st) => st.setAutoReveal);
  const showAttachmentFolders = useStore((st) => st.showAttachmentFolders);
  const setShowAttachmentFolders = useStore((st) => st.setShowAttachmentFolders);
  const [path, setPath] = useState(s.vault.path);
  const [deleteMode, setDeleteMode] = useState(s.vault.deleteMode ?? 'trash');
  const [retention, setRetention] = useState(String(s.vault.trashRetentionDays ?? 0));
  const confirmedDeleteMode=useRef(s.vault.deleteMode??'trash');
  const confirmedRetention=useRef(s.vault.trashRetentionDays??0);
  const [following,setFollowing]=useState(!!s.vault.followObsidianDeletion);
  const [browser, setBrowser] = useState<any>(null);
  const [saving,setSaving]=useState<string|null>(null);
  const [errors,setErrors]=useState<Record<string,string>>({});
  useEffect(()=>{confirmedDeleteMode.current=s.vault.deleteMode??'trash';setDeleteMode(confirmedDeleteMode.current);},[s.vault.deleteMode]);
  useEffect(()=>{confirmedRetention.current=s.vault.trashRetentionDays??0;setRetention(String(confirmedRetention.current));},[s.vault.trashRetentionDays]);
  useEffect(()=>{setPath(s.vault.path);},[s.vault.path]);
  useEffect(()=>{setFollowing(!!s.vault.followObsidianDeletion);},[s.vault.followObsidianDeletion]);
  const errorFor=(field:string,error:unknown)=>setErrors(e=>({...e,[field]:error instanceof Error?error.message:String(error)}));
  const clearError=(field:string)=>setErrors(e=>({...e,[field]:''}));
  // Whole days, 0 (keep forever) … 3650. Invalid input snaps back to the saved value.
  const saveRetention = async () => {
    const n = Number(retention);
    const saved = confirmedRetention.current;
    if (!Number.isInteger(n) || n < 0 || n > 3650) {
      setRetention(String(saved));
      errorFor('retention',uiText("webobsidian.enter-whole-days-from-0-to-3650-6d33d4"));
      return;
    }
    if (n === saved) return;
    setSaving('retention');clearError(uiText("webobsidian.retention-31e69a"));
    let committed=false;
    try{await api.putSettings({ vault: { trashRetentionDays: n } });committed=true;confirmedRetention.current=n;await reload();}
    catch(error){setRetention(String(confirmedRetention.current));errorFor('retention',committed?`Saved, but could not refresh: ${String(error)}`:error);}
    finally{setSaving(null);}
  };
  const save = async () => {
    if(!path.trim()){errorFor('path',uiText("webobsidian.vault-path-must-not-be-blank-cdca47"));return;}
    setSaving('path');clearError(uiText("webobsidian.path-3150ec"));
    try {
      await useStore.getState().save();
      await api.putSettings({ vault: { path } });
      resetIndexStatus();
      refreshIndexStatus().catch(()=>{});
      resetDraftScope();
      resetVaultPreferences(path);
      void getVaultPreferences().catch(()=>{});
      useStore.setState({tabs:[],activePath:null,content:'',dirty:false,splitPath:null,splitContent:''});
      await useStore.getState().loadTree();
      await reload();
      useStore.getState().notify(uiText("webobsidian.vault-changed-local-drafts-remain-scoped-to-the-256e2e"));
    }catch(error){errorFor('path',error);}
    finally{setSaving(null);}
  };
  const saveDeleteMode = async (mode: string) => {
    setDeleteMode(mode);
    setSaving('deleteMode');clearError(uiText("webobsidian.deletemode-639989"));
    let committed=false;
    try{await api.putSettings({ vault: { deleteMode: mode } });committed=true;confirmedDeleteMode.current=mode;await Promise.all([reload(),getVaultPreferences()]);}
    catch(error){setDeleteMode(confirmedDeleteMode.current);errorFor('deleteMode',committed?`Saved, but could not refresh: ${String(error)}`:error);}
    finally{setSaving(null);}
  };
  const followObsidianDeletion=async(follow:boolean)=>{
    setSaving('deletionSource');clearError(uiText("webobsidian.deletionsource-86fb92"));
    try{await api.putSettings({vault:{followObsidianDeletion:follow}});setFollowing(follow);await Promise.all([reload(),getVaultPreferences()]);}
    catch(error){errorFor('deletionSource',error);}
    finally{setSaving(null);}
  };
  const importToolbar=async()=>{
    setSaving('toolbar');clearError(uiText("webobsidian.toolbar-e5bd72"));
    try{const imported=importMobileToolbarCommands(s.ui.editingToolbar,preferences.values.mobileToolbarCommands);await api.putSettings({ui:{editingToolbar:imported.config}});window.dispatchEvent(new CustomEvent('editing-toolbar-config',{detail:imported.config}));await reload();}
    catch(error){errorFor('toolbar',error);}
    finally{setSaving(null);}
  };
  const browse = async (dir?: string) => setBrowser(await api.browse(dir).catch((e) => ({ error: e.message })));
  return (
    <div>
      <h2>{uiText("webobsidian.vault-files-8abe8d")}</h2>
      <IndexSettings />
      <Row name={uiText("webobsidian.vault-path-3b447b")} desc={uiText("webobsidian.absolute-path-on-the-server-to-your-notes-folder-9f667c")}>
        <input className="text-input" style={{ width: 260 }} value={path} onChange={(e) => setPath(e.target.value)} />
      </Row>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <button className="btn secondary" onClick={() => browse()}>{uiText("webobsidian.browse-c1b20f")}</button>
        <button className="btn" disabled={!!saving} onClick={save}>{uiText("webobsidian.save-vault-path-146393")}</button>
      </div>
      {errors.path&&<p role="alert">{errors.path}</p>}
      {browser && !browser.error && (
        <div style={{ border: '1px solid var(--bg-modifier-border)', borderRadius: 6, padding: 8, marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{browser.dir}</div>
          <div className="result" onClick={() => browse(browser.parent)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="folder" size={15} /> ..
          </div>
          {browser.folders.map((f: any) => (
            <div className="result" key={f.path} onClick={() => browse(f.path)} onDoubleClick={() => setPath(f.path)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="folder" size={15} /> {f.name}
              <button className="btn secondary" style={{ float: 'right', padding: '2px 8px' }} onClick={(e) => { e.stopPropagation(); setPath(f.path); }}>
                {uiText("webobsidian.select-859822")} </button>
            </div>
          ))}
        </div>
      )}
      {browser?.error && <div style={{ color: '#e5534b' }}>{browser.error}</div>}
      <Row
        name={uiText("webobsidian.when-deleting-a-file-35fa56")}
        desc={uiText("webobsidian.move-to-trash-keeps-a-recoverable-copy-open-tras-6342cb")}
      >
        <select
          className="text-input"
          style={{ width: 220 }}
          value={deleteMode}
          disabled={!!saving||following}
          onChange={(e) => saveDeleteMode(e.target.value)}
        >
          <option value="trash">{uiText("webobsidian.move-to-trash-recoverable-cf9903")}</option>
          <option value="permanent">{uiText("setting.file.option-choice-permanent-delete")}</option>
        </select>
      </Row>
      {errors.deleteMode&&<p role="alert">{errors.deleteMode}</p>}
      <Row name={uiText("webobsidian.follow-obsidian-deletion-c418a0")} desc={uiText("webobsidian.explicit-opt-in-obsidian-requests-value0-your-sa-337d67", {value0: preferences.values.trashOption==='none'?'permanent deletion':preferences.values.trashOption==='system'?'system trash; this server uses recoverable .trash':'recoverable .trash'})}>
        <input aria-label={uiText("webobsidian.follow-obsidian-deletion-c418a0")} type="checkbox" checked={following} disabled={!!saving||preferences.loading||!!preferences.error} onChange={e=>void followObsidianDeletion(e.target.checked)}/>
      </Row>
      {errors.deletionSource&&<p role="alert">{errors.deletionSource}</p>}
      <p>{uiText("webobsidian.effective-deletion-18d044")} {preferences.values.deleteMode==='trash'?"move to .trash (recoverable)":uiText("webobsidian.permanently-delete-abbcb4")} {uiText("webobsidian.-source-684ce4")} {preferences.sources.deleteMode}</p>
      <Row
        name={uiText("webobsidian.show-attachment-folders-c10406")}
        desc={uiText("webobsidian.show-existing-folders-named-attachments-and-the-1c3488")}
      >
        <input
          type="checkbox"
          checked={showAttachmentFolders}
          onChange={(e) => setShowAttachmentFolders(e.target.checked)}
        />
      </Row>
      <Row
        name={uiText("webobsidian.reveal-active-file-in-explorer-d789fe")}
        desc={showAttachmentFolders?uiText("webobsidian.opening-or-switching-documents-expands-parent-fo-f259f6"):uiText("webobsidian.opening-or-switching-documents-reveals-visible-f-4024ea")}
      >
        <input
          type="checkbox"
          checked={autoReveal}
          onChange={(e) => setAutoReveal(e.target.checked)}
        />
      </Row>
      <Row
        name={uiText("webobsidian.trash-retention-days-06522e")}
        desc={uiText("webobsidian.items-in-trash-are-permanently-deleted-this-many-04caed")}
      >
        <input
          className="text-input"
          type="number"
          min={0}
          max={3650}
          step={1}
          style={{ width: 90 }}
          value={retention}
          disabled={!!saving}
          onChange={(e) => setRetention(e.target.value)}
          onBlur={saveRetention}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </Row>
      {errors.retention&&<p role="alert">{errors.retention}</p>}
      {saving&&<p role="status">{uiText("webobsidian.saving-56a228")}</p>}
      <details open><summary>{uiText("webobsidian.effective-vault-preferences-f1dc2d")}</summary>
        <p>{uiText("webobsidian.portable-rules-are-read-from-this-vault-s-obsidi-533d9b")}</p>
        {preferences.loading&&<p role="status">{uiText("webobsidian.loading-vault-preferences-86d4b2")}</p>}
        {preferences.error&&<p role="alert">{preferences.error}</p>}
        {preferences.warnings.map((warning,i)=><p role="alert" key={i}>{warning}</p>)}
        <table className="vault-preferences-table"><thead><tr><th>{uiText("webobsidian.preference-97d9b2")}</th><th>{uiText("webobsidian.value-8dce17")}</th><th>{uiText("webobsidian.source-behavior-8eaffb")}</th></tr></thead><tbody>
          {Object.entries(preferences.values).map(([key,value])=><tr key={key}><td>{key}</td><td>{key==="attachmentFolderPath"&&preferences.blocked?.attachmentUpload?"Unavailable — uploads blocked":Array.isArray(value)?value.join(', ')||"(empty)":String(value)}</td><td>{key==="attachmentFolderPath"&&preferences.blocked?.attachmentUpload?uiText("webobsidian.configuration-error-336957"):preferences.sources[key as keyof typeof preferences.sources]}{key==="deleteUnlinkedAttachments"?" · unused attachments when deleting a note":key==="mobileToolbarCommands"?" · explicit import below":''}</td></tr>)}
        </tbody></table>
      </details>
      <details><summary>{uiText("webobsidian.import-obsidian-mobile-toolbar-commands-2034fc")}</summary>
        <p>{uiText("webobsidian.explicitly-add-supported-commands-to-the-existin-d2f215")}</p>
        <table className="vault-preferences-table"><thead><tr><th>{uiText("webobsidian.obsidian-command-091bf6")}</th><th>{uiText("webobsidian.webobsidian-command-e97f31")}</th></tr></thead><tbody>{preferences.values.mobileToolbarCommands.map((id,i)=><tr key={i}><td>{id}</td><td>{mobileToolbarCommandMappings[id]?uiText("webobsidian.editing-toolbar-value0-a3deb5", {value0: mobileToolbarCommandMappings[id]}):uiText("webobsidian.unsupported-fb52c1")}</td></tr>)}</tbody></table>
        <button className="btn secondary" disabled={!!saving||!preferences.values.mobileToolbarCommands.some(id=>mobileToolbarCommandMappings[id])} onClick={()=>void importToolbar()}>{uiText("webobsidian.add-supported-obsidian-mobile-commands-339cf3")}</button>
        {errors.toolbar&&<p role="alert">{errors.toolbar}</p>}
      </details>
    </div>
  );
}

function GitSettings({ s, reload }: { s: any; reload: () => void }) {
  const languageRevision = useLanguage().revision;

  const [g, setG] = useState({ ...s.git });
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLTextAreaElement>(null);
  const set = (k: string, v: any) => setG((p: any) => ({ ...p, [k]: v }));
  // Append timestamped lines to the running log instead of replacing it, so the
  // textarea keeps a history of every git action across clicks.
  const append = (lines: string[]) => {
    const ts = new Date().toLocaleTimeString();
    setLog((prev) => [...prev, ...lines.map((l, i) => (i === 0 ? `[${ts}] ${l}` : `         ${l}`))]);
  };
  // Auto-scroll to the newest line whenever the log grows.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);
  const save = async () => { await api.putSettings({ git: g }); await reload(); append([uiText("webobsidian.saved-git-settings-f07866")]); };
  const run = async (fn: () => Promise<any>, label: string) => {
    append([`${label}…`]);
    try {
      const r = await fn();
      // sync returns { ok, log: string[] }; others return { message }. Split any
      // embedded newlines so multi-line git output renders one line per row.
      const lines: string[] = Array.isArray(r?.log)
        ? [`${label} ${r.ok ? 'ok' : 'NOT ok'}`, ...r.log]
        : [String(r?.message ?? JSON.stringify(r))];
      append(lines.flatMap((l) => String(l).split('\n')));
    } catch (e: any) { append([`Error: ${e.message}`]); }
  };
  return (
    <div>
      <h2>{uiText("webobsidian.github-sync-3bd85c")}</h2>
      <Row name={uiText("webobsidian.enable-git-sync-d96bbc")}><input type="checkbox" checked={g.enabled} onChange={(e) => set('enabled', e.target.checked)} /></Row>
      <Row name={uiText("webobsidian.remote-url-861ea4")} desc={uiText("webobsidian.https-github-com-owner-repo-git-240879")}>
        <input className="text-input" style={{ width: 260 }} value={g.remote} onChange={(e) => set('remote', e.target.value)} />
      </Row>
      <Row name={uiText("webobsidian.branch-162751")}><input className="text-input" style={{ width: 120 }} value={g.branch} onChange={(e) => set('branch', e.target.value)} /></Row>
      <Row name={uiText("webobsidian.access-token-pat-7e5d5c")} desc={uiText("webobsidian.stored-server-side-leave-masked-to-keep-current-9f8f57")}>
        <input className="text-input" type="password" style={{ width: 260 }} value={g.token} onChange={(e) => set('token', e.target.value)} />
      </Row>
      <Row name={uiText("webobsidian.author-name-ae05c6")}><input className="text-input" value={g.authorName} onChange={(e) => set('authorName', e.target.value)} /></Row>
      <Row name={uiText("webobsidian.author-email-50bc7d")}><input className="text-input" value={g.authorEmail} onChange={(e) => set('authorEmail', e.target.value)} /></Row>
      <Row name={uiText("webobsidian.auto-sync-6321ef")} desc={uiText("webobsidian.periodic-pull-commit-push-on-the-interval-below-6b4cff")}><input type="checkbox" checked={g.autoSync} onChange={(e) => set('autoSync', e.target.checked)} /></Row>
      <Row name={uiText("webobsidian.auto-commit-on-save-c6d609")} desc={uiText("webobsidian.commit-push-5s-after-each-edit-a5d5de")}><input type="checkbox" checked={g.autoCommitOnSave} onChange={(e) => set('autoCommitOnSave', e.target.checked)} /></Row>
      <Row name={uiText("webobsidian.interval-sec-10359a")}><input className="text-input" type="number" style={{ width: 90 }} value={g.intervalSec} onChange={(e) => set('intervalSec', Number(e.target.value))} /></Row>
      <Row name={uiText("webobsidian.git-lfs-patterns-138324")} desc={uiText("webobsidian.space-separated-globs-tracked-via-lfs-70f162")}>
        <input className="text-input" style={{ width: 260 }} value={(g.lfsPatterns || []).join(' ')} onChange={(e) => set('lfsPatterns', e.target.value.split(/\s+/).filter(Boolean))} />
      </Row>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="btn" onClick={save}>{uiText("dialogue.button-save")}</button>
        <button className="btn secondary" onClick={() => run(api.gitInit, 'Init')}>{uiText("webobsidian.init-repo-e9f858")}</button>
        <button className="btn secondary" onClick={() => run(api.gitClone, 'Clone')}>{uiText("webobsidian.clone-d8cdb5")}</button>
        <button className="btn secondary" onClick={() => run(api.gitPull, 'Pull')}>{uiText("webobsidian.pull-5219eb")}</button>
        <button className="btn secondary" onClick={() => run(() => api.gitCommit(), 'Commit')}>{uiText("webobsidian.commit-1a1873")}</button>
        <button className="btn secondary" onClick={() => run(api.gitPush, 'Push')}>{uiText("webobsidian.push-8f7f57")}</button>
        <button className="btn" onClick={() => run(() => api.gitSync(), 'Sync')}>{uiText("webobsidian.sync-now-2b7d93")}</button>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{uiText("plugins.sync.label-sync-log")}</span>
          {log.length > 0 && (
            <button className="btn secondary" style={{ padding: '2px 8px' }} onClick={() => setLog([])}>{uiText("plugins.file-recovery.button-clear-history")}</button>
          )}
        </div>
        <textarea
          ref={logRef}
          readOnly
          value={log.length ? log.join('\n') : uiText("webobsidian.no-git-activity-yet-click-an-action-above-sync-n-5c31f0")}
          style={{
            width: '100%', height: 200, boxSizing: 'border-box', resize: 'vertical',
            background: 'var(--bg-primary)', color: 'var(--text-normal)',
            border: '1px solid var(--bg-modifier-border, #444)', borderRadius: 6, padding: 10,
            fontFamily: 'var(--font-monospace, monospace)', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre',
          }}
        />
      </div>
    </div>
  );
}

function ApiKeys() {
  const languageRevision = useLanguage().revision;

  const [keys, setKeys] = useState<any[]>([]);
  const [name, setName] = useState('my-agent');
  const [scopes, setScopes] = useState<string[]>(['read', 'search']);
  const [created, setCreated] = useState('');
  const load = () => api.listKeys().then((r) => setKeys(r.keys)).catch(() => {});
  useEffect(() => { load(); }, []);
  const toggle = (sc: string) => setScopes((p) => (p.includes(sc) ? p.filter((x) => x !== sc) : [...p, sc]));
  const create = async () => {
    const r = await api.createKey(name, scopes);
    setCreated(r.key);
    await load();
  };
  return (
    <div>
      <h2>{uiText("webobsidian.api-keys-e18ffc")}</h2>
      <p style={{ color: 'var(--text-muted)' }}>{uiText("webobsidian.keys-let-ai-agents-call-b173ff")} <code>{uiText("webobsidian.-api-v1-cd775f")}</code>{uiText("webobsidian.-the-raw-key-is-shown-once-7ed2ba")}</p>
      <Row name={uiText("webobsidian.name-709a23")}><input className="text-input" value={name} onChange={(e) => setName(e.target.value)} /></Row>
      <Row name={uiText("webobsidian.scopes-c23540")}>
        <span>
          {['read', 'write', 'search'].map((sc) => (
            <label key={sc} style={{ marginRight: 10 }}>
              <input type="checkbox" checked={scopes.includes(sc)} onChange={() => toggle(sc)} /> {sc}
            </label>
          ))}
        </span>
      </Row>
      <button className="btn" onClick={create}>{uiText("webobsidian.create-key-e028cb")}</button>
      {created && (
        <pre style={{ background: 'var(--bg-primary)', padding: 10, borderRadius: 6, marginTop: 10, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
          {created}
          {'\n'}{uiText("webobsidian.-copy-now-it-will-not-be-shown-again-b6a98c")} </pre>
      )}
      <div style={{ marginTop: 16 }}>
        {keys.map((k) => (
          <div className="setting-row" key={k.id}>
            <div className="info">
              <div className="name">{k.name} <span style={{ color: 'var(--text-faint)' }}>{k.prefix}…</span></div>
              <div className="desc">{uiText("webobsidian.scopes-c37449")} {k.scopes.join(', ')} {uiText("webobsidian.-used-cd76e3")} {k.lastUsed ?? 'never'}</div>
            </div>
            <button className="btn danger" onClick={async () => { await api.revokeKey(k.id); load(); }}>{uiText("webobsidian.revoke-0be720")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Shares() {
  const languageRevision = useLanguage().revision;

  const notify = useStore((s) => s.notify);
  const openFile = useStore((s) => s.openFile);
  const setOpen = useStore((s) => s.setSettings);
  // Shared with the store so the file tree's globe badges refresh on changes.
  const shares = useStore((s) => s.shares);
  const load = useStore((s) => s.loadShares);
  const [query, setQuery] = useState('');
  useEffect(() => { load(); }, [load]);

  const url = (id: string) => `${location.origin}/share/${id}`;
  const copy = (id: string) => {
    navigator.clipboard?.writeText(url(id)).catch(() => {});
    notify(uiText("webobsidian.public-link-copied-147450"));
  };
  const toggle = async (s: any) => {
    await api.setShareEnabled(s.id, !s.enabled);
    load();
  };
  const remove = async (s: any) => {
    if (!confirm(uiText("webobsidian.delete-the-public-link-for-value0-the-url-stops-7a7ed6", {value0: s.path}))) return;
    await api.deleteShare(s.id);
    load();
  };
  const setPassword = async (s: any) => {
    const pw = prompt(
      s.hasPassword
        ? uiText("webobsidian.new-password-for-this-link-leave-empty-to-remove-c299e3")
        : uiText("webobsidian.password-for-this-link-2ab0e0"),
    );
    if (pw === null) return;
    await api.setSharePassword(s.id, pw || null);
    notify(pw ? uiText("webobsidian.password-set-676101") : uiText("webobsidian.password-removed-114bea"));
    load();
  };

  const q = query.trim().toLowerCase();
  const filtered = q ? shares.filter((s) => s.path.toLowerCase().includes(q)) : shares;

  return (
    <div>
      <h2>{uiText("webobsidian.sharing-78779b")}</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        {uiText("webobsidian.notes-shared-via-a-public-link-are-readable-by-3307a4")} <b>{uiText("webobsidian.anyone-with-the-url-8c7152")}</b>{uiText("webobsidian.-without-login-create-a-link-from-a-note-s-conte-89d87e")} </p>
      <input
        className="text-input"
        style={{ width: '100%', margin: '6px 0 12px' }}
        placeholder={uiText("webobsidian.search-shared-notes-3ec547")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 && (
        <div style={{ color: 'var(--text-faint)' }}>
          {shares.length === 0 ? uiText("webobsidian.no-notes-are-shared-publicly-977057") : uiText("webobsidian.no-shared-note-matches-the-search-c106ae")}
        </div>
      )}
      {filtered.map((s) => (
        <div className="setting-row" key={s.id}>
          <div className="info" style={{ minWidth: 0 }}>
            <div
              className="name"
              style={{ cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: s.enabled ? 1 : 0.55 }}
              title={uiText("webobsidian.open-value0-4c1e7f", {value0: s.path})}
              onClick={() => { openFile(s.path); setOpen(false); }}
            >
              {s.path}
            </div>
            <div className="desc">
              {s.enabled ? uiText("webobsidian.active-2bb6b9") : uiText("webobsidian.disabled-07596f")}
              {s.hasPassword ? uiText("webobsidian.-password-protected-e0a870") : ''} {uiText("webobsidian.-created-bcdf32")} {new Date(s.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button className="btn secondary" disabled={!s.enabled} onClick={() => copy(s.id)} title={url(s.id)}>
              <Icon name="link" size={14} /> {uiText("webobsidian.copy-link-2f84ee")} </button>
            <button className="btn secondary" onClick={() => setPassword(s)} title={s.hasPassword ? uiText("webobsidian.change-or-remove-password-5421c4") : uiText("webobsidian.require-a-password-to-open-the-link-6f1bba")}>
              {s.hasPassword ? uiText("webobsidian.password-9ba3b9") : uiText("webobsidian.password-dce691")}
            </button>
            <button className={`btn ${s.enabled ? 'secondary' : ''}`} onClick={() => toggle(s)}>
              {s.enabled ? uiText("setting.third-party-plugin.button-disable") : uiText("setting.third-party-plugin.button-enable")}
            </button>
            <button className="btn danger" onClick={() => remove(s)}>{uiText("dialogue.button-delete")}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Plugins() {
  const languageRevision = useLanguage().revision;

  const runtimeStates=usePluginStates();
  const [plugins, setPlugins] = useState<any[]>([]);
  const [repo, setRepo] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api.listPlugins().then((r) => setPlugins(r.plugins)).catch(() => setMsg(uiText("webobsidian.could-not-load-plugin-catalog-e0f267")));
  useEffect(() => { load(); }, []);
  const install = async () => {
    setMsg('Installing…');
    try { await api.installPlugin(repo); setMsg('Installed ✓'); setRepo(''); await load(); }
    catch (e: any) { setMsg(`Error: ${e.message}`); }
  };
  return (
    <div>
      <h2>{uiText("webobsidian.community-plugins-3d3966")}</h2>
      <Row name={uiText("webobsidian.install-from-github-9393a6")} desc={uiText("webobsidian.owner-repo-pulls-manifest-json-main-js-from-late-b975d8")}>
        <span style={{ display: 'flex', gap: 8 }}>
          <input className="text-input" placeholder={uiText("webobsidian.blacksmithgu-obsidian-dataview-73e763")} value={repo} onChange={(e) => setRepo(e.target.value)} />
          <button className="btn" onClick={install}>{uiText("setting.third-party-plugin.button-install")}</button>
        </span>
      </Row>
      {msg && <div style={{ color: 'var(--text-muted)', margin: '6px 0' }}>{msg}</div>}
      <div style={{ marginTop: 12 }}>
        {plugins.length === 0 && <div style={{ color: 'var(--text-faint)' }}>{uiText("webobsidian.no-plugins-installed-969f6c")}</div>}
        {plugins.map((p) => (
          <div className="setting-row" key={p.id}>
            <div className="info">
              <div className="name">{p.name} <span style={{ color: 'var(--text-faint)' }}>v{p.version}</span></div>
              <div className="desc">{p.description}</div><div className="desc">{uiText("webobsidian.source-922acd")} {p.source??'desktop'} · {runtimeStates.find(x=>x.id===p.id)?.state??(p.enabled?'loading':'disabled')}</div>{runtimeStates.find(x=>x.id===p.id)?.failure&&<div role="alert">{runtimeStates.find(x=>x.id===p.id)?.failure?.message}</div>}
            </div>
            <label>
              <input type="checkbox" checked={p.enabled} onChange={async (e) => { try { await api.setPluginEnabled(p.id, e.target.checked); await load(); await loadPlugins(); } catch { setMsg(uiText("webobsidian.could-not-change-plugin-state-ff696c")); } }} /> {uiText("webobsidian.enabled-3ea3f9")} </label>
          </div>
        ))}
      </div>
      <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 14 }}>
        {uiText("webobsidian.note-webobsidian-supports-a-subset-of-the-obsidi-7cf3b1")} </p>
    </div>
  );
}

function Appearance({ s }: { s: any }) {
  const languageRevision = useLanguage().revision;

  const [theme, setTheme] = useState(s.ui.theme);
  const [inlineTitle, setInlineTitle] = useState(s.ui.showInlineTitle !== false);
  const saveInlineTitle = async (v: boolean) => {
    setInlineTitle(v);
    useStore.getState().setShowInlineTitle(v);
    await api.putSettings({ ui: { showInlineTitle: v } });
  };
  // Apply the theme live (no reload — keeps the Settings dialog open), then persist.
  const save = async (t: string) => {
    setTheme(t);
    useStore.getState().setTheme(themeClass(t));
    await api.putSettings({ ui: { theme: t } });
  };
  return (
    <div>
      <h2>{uiText("setting.appearance.name")}</h2>
      <Row name={uiText("plugins.publish.option-theme")}>
        <select className="text-input" value={theme} onChange={(e) => save(e.target.value)}>
          <optgroup label={uiText("webobsidian.obsidian-24c869")}>
            <option value="obsidian-dark">{uiText("webobsidian.obsidian-dark-f52498")}</option>
            <option value="obsidian-light">{uiText("webobsidian.obsidian-light-3ccf1b")}</option>
          </optgroup>
          <optgroup label={uiText("webobsidian.catppuccin-0a67e4")}>
            <option value="catppuccin-mocha">{uiText("webobsidian.catppuccin-mocha-aed8c1")}</option>
            <option value="catppuccin-macchiato">{uiText("webobsidian.catppuccin-macchiato-d14a9c")}</option>
            <option value="catppuccin-frappe">{uiText("webobsidian.catppuccin-frapp-d934db")}</option>
            <option value="catppuccin-latte">{uiText("webobsidian.catppuccin-latte-2a75d8")}</option>
          </optgroup>
        </select>
      </Row>
      <Row name={uiText("webobsidian.show-inline-title-3930e8")} desc={uiText("webobsidian.display-the-file-name-as-a-title-above-the-note-cbc72e")}>
        <input type="checkbox" checked={inlineTitle} onChange={(e) => saveInlineTitle(e.target.checked)} />
      </Row>
    </div>
  );
}

function AccountSettings({ s, reload }: { s: any; reload: () => void }) {
  const languageRevision = useLanguage().revision;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const usingDefault = !s?.auth?.hasCustomPassword;

  const save = async () => {
    setErr('');
    setMsg('');
    if (next.length < 6) {
      setErr(uiText("webobsidian.new-password-must-be-at-least-6-characters-7aeee4"));
      return;
    }
    if (next !== confirm) {
      setErr(uiText("webobsidian.passwords-do-not-match-d69c3b"));
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setMsg(uiText("webobsidian.password-changed-0e6883"));
      setCurrent('');
      setNext('');
      setConfirm('');
      await reload();
    } catch (e: any) {
      setErr(e?.message ?? uiText("webobsidian.failed-to-change-password-2398d6"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2>{uiText("setting.account.name")}</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        {uiText("webobsidian.your-webobsidian-login-password-5aa6d5")} {usingDefault && (
          <>
            {' '}{uiText("webobsidian.you-re-using-the-883cda")} <b>{uiText("webobsidian.default-password-1ec195")} <code>123456</code></b> {uiText("webobsidian.-change-it-to-secure-your-vault-691d15")} </>
        )}
      </p>
      <Row name={uiText("webobsidian.current-password-19dff4")} desc={usingDefault ? uiText("webobsidian.defaults-to-123456-df0f81") : undefined}>
        <input className="text-input" type="password" style={{ width: 240 }} value={current}
          onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Row>
      <Row name={uiText("plugins.publish.action-new-password")} desc={uiText("webobsidian.at-least-6-characters-d5af56")}>
        <input className="text-input" type="password" style={{ width: 240 }} value={next}
          onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Row>
      <Row name={uiText("webobsidian.confirm-new-password-f85039")}>
        <input className="text-input" type="password" style={{ width: 240 }} value={confirm}
          onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </Row>
      {err && <div style={{ color: '#e5534b', margin: '6px 0' }}>{err}</div>}
      {msg && <div style={{ color: 'var(--text-accent, #4caf50)', margin: '6px 0' }}>{msg}</div>}
      <button className="btn" onClick={save} disabled={busy || !current || !next}>
        {busy ? uiText("webobsidian.saving-56a228") : uiText("webobsidian.change-password-8c6842")}
      </button>
      <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 16 }}>
        {uiText("webobsidian.forgot-your-password-set-3130af")} <code>{uiText("webobsidian.auth-passwordhash-fed5a6")}</code> {uiText("webobsidian.in-af10ef")} <code>{uiText("webobsidian.data-settings-json-976e4b")}</code>{uiText("webobsidian.-or-the-345ba6")} <code>{uiText("webobsidian.webobsidian-password-d6fc29")}</code> {uiText("webobsidian.environment-variable-as-a-recovery-override-pass-2f0929")} </p>
    </div>
  );
}

function About() {
  const languageRevision = useLanguage().revision;

  const logout = async () => { await api.logout(); location.reload(); };
  return (
    <div>
      <h2>{uiText("webobsidian.about-webobsidian-ad29b2")}</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        {uiText("webobsidian.a-self-hosted-obsidian-compatible-web-app-vault-065725")} </p>
      <button className="btn danger" onClick={logout}>{uiText("webobsidian.log-out-6e78c9")}</button>
    </div>
  );
}
