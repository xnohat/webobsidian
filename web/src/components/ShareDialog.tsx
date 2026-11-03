import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import Icon from './Icon';

/**
 * Per-note share settings popup (FR-10) — opened from the file-tree context
 * menu ("Share…"). Create/copy the public URL, toggle it on/off, manage the
 * password, or delete the link. The centralized list lives in Settings → Sharing.
 */
export default function ShareDialog() {
  const languageRevision = useLanguage().revision;

  const path = useStore((s) => s.shareDialogPath);
  const setShareDialog = useStore((s) => s.setShareDialog);
  const shares = useStore((s) => s.shares);
  const loadShares = useStore((s) => s.loadShares);
  const notify = useStore((s) => s.notify);

  useEffect(() => {
    if (path) loadShares();
  }, [path, loadShares]);

  if (!path) return null;
  const close = () => setShareDialog(null);
  const share = shares.find((s) => s.path === path) ?? null;
  const url = share ? `${location.origin}/share/${share.id}` : '';

  const create = async () => {
    await api.createShare(path);
    await loadShares();
    notify(uiText("webobsidian.public-link-created-d4717a"));
  };
  const toggle = async () => {
    if (!share) return;
    await api.setShareEnabled(share.id, !share.enabled);
    await loadShares();
  };
  const copy = () => {
    navigator.clipboard?.writeText(url).catch(() => {});
    notify(uiText("webobsidian.public-link-copied-147450"));
  };
  const password = async () => {
    if (!share) return;
    const pw = prompt(
      share.hasPassword
        ? uiText("webobsidian.new-password-for-this-link-leave-empty-to-remove-c299e3")
        : uiText("webobsidian.password-for-this-link-2ab0e0"),
    );
    if (pw === null) return;
    await api.setSharePassword(share.id, pw || null);
    await loadShares();
    notify(pw ? uiText("webobsidian.password-set-676101") : uiText("webobsidian.password-removed-114bea"));
  };
  const remove = async () => {
    if (!share) return;
    if (!confirm(uiText("webobsidian.delete-this-public-link-the-url-stops-working-pe-9594a0"))) return;
    await api.deleteShare(share.id);
    await loadShares();
    notify(uiText("webobsidian.public-link-deleted-8b12fc"));
  };

  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="share-dialog-head">
          <Icon name="globe" size={18} />
          <div>
            <div className="share-dialog-title">{/\.canvas$/i.test(path) ? uiText("webobsidian.share-canvas-c02682") : uiText("webobsidian.share-note-81fd73")}</div>
            <div className="share-dialog-path">{path}</div>
          </div>
        </div>

        {!share && (
          <>
            <p className="share-dialog-hint">
              {uiText("webobsidian.create-a-public-link-so-9a5987")} <b>{uiText("webobsidian.anyone-with-the-url-8c7152")}</b> {uiText("webobsidian.can-read-this-note-without-login-19ec52")} </p>
            <button className="btn" onClick={create}>
              <Icon name="globe" size={14} /> {uiText("webobsidian.create-public-link-2b4d90")} </button>
          </>
        )}

        {share && (
          <>
            <div className="setting-row">
              <div className="info">
                <div className="name">{uiText("webobsidian.public-link-dd39ae")}</div>
                <div className="desc">{share.enabled ? uiText("webobsidian.anyone-with-the-url-can-view-this-note-aa7107") : uiText("webobsidian.sharing-is-paused-the-url-returns-404-11c45e")}</div>
              </div>
              <button className={`graph-switch ${share.enabled ? 'on' : ''}`} onClick={toggle} aria-label={uiText("webobsidian.toggle-public-link-70590f")}>
                <span className="graph-knob" />
              </button>
            </div>

            {share.enabled && (
              <div className="share-url">
                <input className="text-input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn" onClick={copy}><Icon name="link" size={14} /> {uiText("interface.menu.copy")}</button>
              </div>
            )}

            <div className="setting-row">
              <div className="info">
                <div className="name">{uiText("webobsidian.password-protection-5828c6")}</div>
                <div className="desc">{share.hasPassword ? uiText("webobsidian.visitors-must-enter-a-password-715c79") : uiText("webobsidian.anyone-with-the-link-can-open-it-a4f493")}</div>
              </div>
              <button className="btn secondary" onClick={password}>
                {share.hasPassword ? uiText("webobsidian.change-49b1cd") : uiText("webobsidian.set-password-bf0373")}
              </button>
            </div>

            <div className="setting-row">
              <div className="info">
                <div className="name">{uiText("webobsidian.delete-link-943845")}</div>
                <div className="desc">{uiText("webobsidian.revokes-the-url-permanently-595bc4")}</div>
              </div>
              <button className="btn danger" onClick={remove}>{uiText("dialogue.button-delete")}</button>
            </div>
          </>
        )}

        <div className="share-dialog-foot">
          <button className="btn secondary" onClick={close}>{uiText("webobsidian.done-e9b450")}</button>
        </div>
      </div>
    </div>
  );
}
