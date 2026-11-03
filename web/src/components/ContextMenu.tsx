import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useState } from 'react';
import { useStore, type ContextMenuItem } from '../lib/store';
import Icon from './Icon';

function MenuList({ items, onClose }: { items: ContextMenuItem[]; onClose: () => void }) {
  const languageRevision = useLanguage().revision;

  const [openSub, setOpenSub] = useState<number | null>(null);
  return (
    <>
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="context-sep" />
        ) : (
          <div
            key={i}
            className={`context-item ${it.danger ? 'danger' : ''} ${it.submenu ? 'has-sub' : ''}`}
            onMouseEnter={() => setOpenSub(it.submenu ? i : null)}
            onClick={(e) => {
              if (it.submenu) {
                e.stopPropagation();
                return;
              }
              void Promise.resolve().then(() => it.onClick?.()).catch((error: unknown) => {
                useStore.getState().notify(error instanceof Error ? error.message : uiText("webobsidian.action-failed-57af94"));
              });
              onClose();
            }}
          >
            {it.icon && <Icon name={it.icon} size={15} />}
            <span className="ctx-label">{it.label}</span>
            {it.submenu && <Icon name="chevron-right" size={14} className="ctx-arrow" />}
            {it.submenu && openSub === i && (
              <div className="context-menu submenu">
                <MenuList items={it.submenu} onClose={onClose} />
              </div>
            )}
          </div>
        ),
      )}
    </>
  );
}

export default function ContextMenu() {
  const languageRevision = useLanguage().revision;

  const menu = useStore((s) => s.contextMenu);
  const close = useStore((s) => s.closeContextMenu);

  useEffect(() => {
    if (!menu) return;
    const onClick = () => close();
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    // Attach the outside-click listener on the NEXT tick. A menu opened by a
    // left-click (e.g. the Files header sort button) is otherwise closed instantly
    // by the very click that opened it — that click keeps bubbling to window after
    // React commits this effect, so the listener would fire on it. (Right-click
    // menus were unaffected: a `contextmenu` event never fires a `click`.)
    const t = window.setTimeout(() => window.addEventListener('click', onClick), 0);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [menu, close]);

  if (!menu) return null;
  const margin = 8;
  // Rough height estimate, but capped to the viewport so the menu can never be
  // pushed off-screen; a too-tall menu is then made scrollable via CSS max-height.
  const estHeight = Math.min(menu.items.length * 30 + 12, window.innerHeight - margin * 2);
  const x = Math.max(margin, Math.min(menu.x, window.innerWidth - 240));
  const y = Math.max(margin, Math.min(menu.y, window.innerHeight - estHeight - margin));

  return (
    <div className="context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <MenuList items={menu.items} onClose={close} />
    </div>
  );
}
