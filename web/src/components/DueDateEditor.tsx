import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useRef, useState } from 'react';

/**
 * Inline due-date editor (FR-15 / issue #41).
 *
 * A native `<input type="date">`, so the platform picker and plain keyboard entry
 * both work. Enter commits, Escape cancels, blur commits (unless Escape already
 * settled it) — the caller gets one callback either way, never both.
 */
export default function DueDateEditor({
  value,
  onCommit,
  onCancel,
}: {
  value: string | null;
  onCommit: (due: string) => void;
  onCancel: () => void;
}) {
  const languageRevision = useLanguage().revision;

  const isDate = !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const [draft, setDraft] = useState(isDate ? value : '');
  const settled = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus only. `showPicker()` was tried and removed: the native picker takes
  // the keyboard, so Enter never reaches the field — the control looked broken
  // (nothing was written and the editor stayed open). Clicking the field's own
  // calendar glyph still opens the platform picker.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    onCommit(draft || 'none');
  };

  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  return (
    <span
      className="due-editor"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      // Focus moving *within* the editor (field → Clear button) must not commit;
      // only focus leaving it does. Without this, Clear blurred the field first,
      // committed the old date and unmounted itself before the click landed.
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (!next || !e.currentTarget.contains(next)) commit();
      }}
    >
      <input
        ref={inputRef}
        className="due-editor-input"
        type="date"
        value={draft}
        aria-label={uiText("webobsidian.due-date-4c1aee")}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') cancel();
        }}
      />
      <button
        type="button"
        className="due-editor-clear"
        title={uiText("webobsidian.clear-the-due-date-due-none-252ff6")}
        onClick={() => {
          settled.current = true;
          onCommit('none');
        }}
      >
        {uiText("plugins.file-recovery.button-clear-history")} </button>
    </span>
  );
}
