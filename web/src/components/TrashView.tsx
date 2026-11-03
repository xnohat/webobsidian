import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api, type TrashItem } from '../lib/api';
import Icon from './Icon';

/** Trash browser (FR-1): list items moved to `.trash`, restore them, or delete
 *  them permanently. Items land here when delete mode is "Move to trash". */
export default function TrashView() {
  const languageRevision = useLanguage().revision;

  const open = useStore((s) => s.trashOpen);
  const close = useStore((s) => s.setTrash);
  const notify = useStore((s) => s.notify);
  const loadTree = useStore((s) => s.loadTree);

  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    api
      .listTrash()
      .then((r) => setItems(r.items))
      .catch((e) => notify(e.message || uiText("webobsidian.failed-to-load-trash-c104f6")))
      .finally(() => setLoading(false));
  }, [notify, languageRevision]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  if (!open) return null;

  const restore = async (it: TrashItem) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.restoreTrash(it.path);
      notify(uiText("webobsidian.restored-value0-ce9831", {value0: r.restored}));
      await loadTree();
      refresh();
    } catch (e: any) {
      notify(e.message || uiText("webobsidian.restore-failed-c848a6"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (it: TrashItem) => {
    if (busy) return;
    if (!confirm(uiText("webobsidian.permanently-delete-value0-this-cannot-be-undone-d82ad7", {value0: it.name}))) return;
    setBusy(true);
    try {
      await api.deleteTrashItem(it.path);
      notify(uiText("webobsidian.deleted-permanently-ca75d5"));
      refresh();
    } catch (e: any) {
      notify(e.message || uiText("webobsidian.delete-failed-64513b"));
    } finally {
      setBusy(false);
    }
  };

  const empty = async () => {
    if (busy || items.length === 0) return;
    if (!confirm(uiText("webobsidian.empty-trash-value0-item-s-will-be-permanently-de-d69a6c", {value0: items.length}))) return;
    setBusy(true);
    try {
      await api.emptyTrash();
      notify(uiText("webobsidian.trash-emptied-c4e119"));
      refresh();
    } catch (e: any) {
      notify(e.message || uiText("webobsidian.empty-trash-failed-4802b8"));
    } finally {
      setBusy(false);
    }
  };

  const fmtSize = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };
  const fmtDate = (ms: number) => {
    if (!ms) return '';
    const d = new Date(ms);
    return isNaN(d.getTime()) ? '' : d.toLocaleString();
  };

  return (
    <div className="modal-bg" onClick={() => close(false)}>
      <div className="modal trash-view" onClick={(e) => e.stopPropagation()}>
        <div className="vh-head">
          <Icon name="trash" size={16} />
          <div className="vh-title">{uiText("setting.file.option-trash")}</div>
          <div className="vh-path">{items.length} {uiText("webobsidian.item-s-c0e2ec")}</div>
          <button className="tool-btn" title={uiText("webobsidian.refresh-56e3ba")} onClick={refresh}>
            <Icon name="refresh-cw" size={16} />
          </button>
          <button className="tool-btn" title={uiText("interface.menu.close")} onClick={() => close(false)}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="trash-body">
          {loading && <div className="vh-empty">{uiText("webobsidian.loading-33ce41")}</div>}
          {!loading && items.length === 0 && (
            <div className="vh-empty">{uiText("webobsidian.trash-is-empty-cffa18")}</div>
          )}
          {!loading &&
            items.map((it) => (
              <div className="trash-item" key={it.path} title={it.original}>
                <Icon name="file-text" size={14} />
                <div className="trash-item-info">
                  <div className="trash-item-name">{it.name}</div>
                  <div className="trash-item-meta">
                    {it.original}
                    {it.mtime ? uiText("webobsidian.-value0-ce415a", {value0: fmtDate(it.mtime)}) : ''}
                    {it.size ? uiText("webobsidian.-value0-ce415a", {value0: fmtSize(it.size)}) : ''}
                  </div>
                </div>
                <button
                  className="btn secondary trash-act"
                  title={uiText("webobsidian.restore-to-original-location-90c680")}
                  disabled={busy}
                  onClick={() => restore(it)}
                >
                  {uiText("plugins.sync.label-restore-this-version")} </button>
                <button
                  className="tool-btn trash-del"
                  title={uiText("webobsidian.delete-permanently-e63b51")}
                  disabled={busy}
                  onClick={() => remove(it)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
        </div>
        <div className="vh-foot">
          <button className="btn secondary" onClick={() => close(false)}>
            {uiText("interface.menu.close")} </button>
          <button className="btn danger" onClick={empty} disabled={busy || items.length === 0}>
            {uiText("webobsidian.empty-trash-04382a")} </button>
        </div>
      </div>
    </div>
  );
}
