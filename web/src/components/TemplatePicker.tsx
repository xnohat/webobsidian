import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { findNode } from '../lib/tree';
import {
  dateStamp,
  findTemplatesFolder,
  listTemplates,
  resolveTargetFolder,
  slugify,
  uniqueNotePath,
} from '../lib/templates';

/**
 * New note from template (FR-17).
 *
 * Pick a template from the vault's `templates` folder, title the note, and it is
 * created as `<folder>/<YYYY-MM-DD>-<slug>.md` with the template's placeholders
 * filled in and opened for editing — the copy / rename / re-date step is gone.
 *
 * Choosing is explicit: **hovering does not pick a template, clicking does**
 * (the rows are buttons, so keyboard selection works too). Nothing is written
 * until the template, the title and the folder are all present, and the path the
 * note will land on is shown before that.
 */
export default function TemplatePicker() {
  const languageRevision = useLanguage().revision;

  const open = useStore((s) => s.templatePicker);
  // Mounted only while open, so every opening starts from a clean form without
  // a reset effect that could also fire on an unrelated tree refresh.
  if (!open) return null;
  return <Picker />;
}

function Picker() {
  const languageRevision = useLanguage().revision;

  const setOpen = useStore((s) => s.setTemplatePicker);
  const tree = useStore((s) => s.tree);
  const newFromTemplate = useStore((s) => s.newFromTemplate);

  const [q, setQ] = useState('');
  /** The template the human picked; '' until they do — an implicit default made
   *  a hover look like a choice and a click look like it did nothing. */
  const [chosen, setChosen] = useState('');
  /** Folder typed by hand; null = derive it from the chosen template. */
  const [typedFolder, setTypedFolder] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const templatesFolder = useMemo(() => findTemplatesFolder(tree), [tree, languageRevision]);
  const templates = useMemo(() => listTemplates(tree, templatesFolder), [tree, templatesFolder, languageRevision]);

  const sel = chosen;
  const folder = typedFolder ?? (sel ? resolveTargetFolder(tree, sel) : '');

  if (templatesFolder === null) {
    return (
      <div className="modal-bg" onClick={() => setOpen(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="palette-item" data-testid="templates-missing">
            {uiText("webobsidian.no-templates-folder-in-this-vault-expected-a-fol-50c0ea")} <b>Templates</b>.
          </div>
        </div>
      </div>
    );
  }

  const lc = q.trim().toLowerCase();
  const shown = templates.filter((t) => !lc || t.title.toLowerCase().includes(lc));
  const slug = slugify(title.trim());
  const dir = folder.trim();
  const date = dateStamp(new Date());
  const targetPath =
    sel && slug && dir ? uniqueNotePath(dir, `${date}-${slug}`, (p) => !!findNode(tree, p)) : '';
  const canCreate = !!sel && !!slug && !!dir && !busy;

  /** Why the note cannot be created yet — shown instead of a dead button. */
  const blocked = !sel
    ? uiText("webobsidian.pick-a-template-above-6f2f3f")
    : !slug
      ? uiText("webobsidian.type-a-title-to-name-the-note-da32c9")
      : !dir
        ? 'No folder for this template — type one, e.g. Wiki/meetings'
        : '';

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError('');
    try {
      await newFromTemplate(sel, title, dir);
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || uiText("webobsidian.could-not-create-the-note-2bf964"));
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    // A focused template row is a button: Enter/Space picks it, it must not
    // also create the note.
    else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault();
      create();
    }
  };

  return (
    <div className="modal-bg" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <input
          className="palette-input"
          placeholder={uiText("webobsidian.choose-a-template-25c120")}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="palette-list" data-testid="template-list">
          {shown.map((t) => (
            <button
              type="button"
              key={t.path}
              className={`palette-item tpl-item ${t.path === sel ? 'sel' : ''}`}
              data-testid="template-item"
              data-path={t.path}
              data-chosen={t.path === sel ? 'true' : 'false'}
              aria-pressed={t.path === sel}
              onClick={() => {
                setChosen(t.path);
                setTypedFolder(null);
                setError('');
              }}
            >
              <span>{t.title}</span>
              <span className="kbd">{t.path}</span>
            </button>
          ))}
          {shown.length === 0 && <div className="palette-item">{uiText("webobsidian.no-matching-template-2670da")}</div>}
        </div>
        <div className="tpl-form">
          <div className="tpl-row">
            <span className="tpl-label">{uiText("webobsidian.template-3ec1ae")}</span>
            <span className="tpl-chosen" data-testid="template-chosen">
              {sel || uiText("webobsidian.none-chosen-917493")}
            </span>
          </div>
          <label className="tpl-row">
            <span className="tpl-label">{uiText("plugins.bookmarks.option-title")}</span>
            <input
              className="text-input"
              data-testid="template-title"
              placeholder={uiText("webobsidian.what-this-note-is-about-5a5561")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="tpl-row">
            <span className="tpl-label">{uiText("properties.types.option-folder")}</span>
            <input
              className="text-input"
              data-testid="template-folder"
              placeholder={uiText("webobsidian.e-g-wiki-meetings-a0cb52")}
              value={folder}
              onChange={(e) => setTypedFolder(e.target.value)}
            />
          </label>
          <div className="tpl-path" data-testid="template-path">
            {targetPath ? (
              <>
                {uiText("webobsidian.creates-4e852e")} <code>{targetPath}</code>
              </>
            ) : (
              blocked
            )}
          </div>
          {error && (
            <div className="tpl-error" data-testid="template-error">
              {error}
            </div>
          )}
          <div className="tpl-actions">
            <button className="btn" data-testid="template-create" disabled={!canCreate} onClick={create}>
              {busy ? uiText("webobsidian.creating-94d7d8") : uiText("webobsidian.create-note-4fd52d")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
