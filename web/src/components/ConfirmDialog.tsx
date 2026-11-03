import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useRef } from 'react';
import { useConfirm } from '../lib/confirm';

/** Modal host for confirmDialog(): Esc / backdrop / Cancel resolve false, the action button true. */
export default function ConfirmDialog() {
  const languageRevision = useLanguage().revision;

  const req = useConfirm((s) => s.req);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel by default so a stray Enter never confirms a destructive action.
  useEffect(() => {
    if (req) cancelRef.current?.focus();
  }, [req]);

  // Escape must close the dialog even if focus ended up elsewhere (e.g. an editor that
  // grabbed focus back right after the dialog opened), so listen at the window level.
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      req.resolve(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req]);

  if (!req) return null;
  const cancel = () => req.resolve(false);
  return (
    <div className="modal-bg" onClick={cancel}>
      <div
        className="modal confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={req.detail ? uiText("webobsidian.-value0-value1-843a2d", {value0: req.message, value1: req.detail}) : req.message}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            cancel();
          } else if (e.key === 'Tab') {
            // Keep focus inside the dialog: cycle Cancel <-> action button.
            const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
            const i = btns.indexOf(document.activeElement as HTMLButtonElement);
            const next = e.shiftKey ? (i <= 0 ? btns.length - 1 : i - 1) : i === btns.length - 1 ? 0 : i + 1;
            e.preventDefault();
            btns[next]?.focus();
          }
        }}
      >
        <p className="confirm-dialog-msg">{req.message}</p>
        {req.detail && <p className="confirm-dialog-detail">{req.detail}</p>}
        {req.items&&<div style={{maxHeight:240,overflowY:'auto'}}>{req.items.map(item=><label key={item} style={{display:'block'}}><input type="checkbox" checked={req.selected?.includes(item)??false} onChange={e=>useConfirm.setState({req:{...req,selected:e.target.checked?[...(req.selected??[]),item]:(req.selected??[]).filter(p=>p!==item)}})}/>{item}</label>)}</div>}
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} className="btn secondary" onClick={cancel}>
            {uiText("dialogue.button-cancel")} </button>
          <button className={req.danger ? 'btn danger' : 'btn'} onClick={() => req.resolve(true)}>
            {req.confirmLabel}
          </button>
          {req.alternative&&<button className="btn secondary" onClick={req.alternative}>{req.alternativeLabel}</button>}
        </div>
      </div>
    </div>
  );
}
