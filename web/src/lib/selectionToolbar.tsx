import { StateEffect, StateField, Prec } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { createRoot } from 'react-dom/client';
import { FormattingButtons } from '../components/FormatToolbar';

export const dismissSelectionToolbar = StateEffect.define<boolean>();

const selectionToolbarState = StateField.define<{ dismissed: boolean; tooltips: Tooltip[] }>({
  create: state => toolbarState(state, false),
  update(value, tr) {
    let dismissed = tr.selection || tr.docChanged ? false : value.dismissed;
    for (const effect of tr.effects) if (effect.is(dismissSelectionToolbar)) dismissed = effect.value;
    return toolbarState(tr.state, dismissed);
  },
  provide: field => showTooltip.computeN([field], state => state.field(field).tooltips),
});

function toolbarState(state: EditorView['state'], dismissed: boolean) {
  const range = state.selection.main;
  const tooltips: Tooltip[] = dismissed || state.readOnly || range.empty ? [] : [{
    pos: range.from, end: range.to, above: true, create: createToolbar,
  }];
  return { dismissed, tooltips };
}

function createToolbar(view: EditorView) {
  const dom = document.createElement('div');
  dom.className = 'floating-format-toolbar';
  dom.setAttribute('role', 'toolbar');
  dom.setAttribute('aria-label', 'Selection formatting');
  const root = createRoot(dom);
  root.render(<FormattingButtons size={16} view={view} compact />);
  return { dom, offset: { x: 0, y: 8 }, destroy: () => root.unmount() };
}

export const selectionToolbar = [
  selectionToolbarState,
  Prec.highest(keymap.of([{ key: 'Escape', run(view) {
    if (!view.state.field(selectionToolbarState).tooltips.length) return false;
    view.dispatch({ effects: dismissSelectionToolbar.of(true) });
    return true;
  } }])),
  EditorView.domEventHandlers({
    focusout(event, view) {
      const target = event.relatedTarget as HTMLElement | null;
      if (target?.closest('.floating-format-toolbar, .color-palette, .format-toolbar, .mobile-toolbar, .toolbar-overlay-host')) return;
      // Defer until after CodeMirror has completed its current update.
      queueMicrotask(() => {
        if (view.dom.isConnected && !view.dom.contains(document.activeElement)) view.dispatch({ effects: dismissSelectionToolbar.of(true) });
      });
    },
  }),
];
