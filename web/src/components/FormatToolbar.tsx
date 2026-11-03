import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import ToolbarSurface from './toolbar/ToolbarSurface';
import {useVisualViewport} from '../lib/useVisualViewport';
import type { EditorView } from '@codemirror/view';

export function FormattingButtons({size,view,compact=false,disabled=false}:{size:number;view?:EditorView;compact?:boolean;disabled?:boolean}) {
  const languageRevision = useLanguage().revision;

  return <ToolbarSurface view={view} layout={compact?'following':'top'} disabled={disabled}/>;
}
/**
 * Markdown formatting toolbar (Obsidian Mobile-style). Two layouts:
 * - mobile: fixed above the on-screen keyboard (anchored via the visual viewport,
 *   since iOS Safari doesn't reflow fixed elements for the keyboard).
 * - desktop: an in-flow strip rendered right under the view header.
 */
export default function FormatToolbar({ mobile = false, disabled = false }: { mobile?: boolean; disabled?: boolean }) {
  const languageRevision = useLanguage().revision;

  const viewport=useVisualViewport();
  if (mobile) {
    return (
      <div className="mobile-toolbar" role="toolbar" aria-label={uiText("webobsidian.formatting-841f83")} style={{ bottom:viewport.bottom,left:viewport.left,right:viewport.right }}>
        <ToolbarSurface layout="mobile" disabled={disabled} />
      </div>
    );
  }
  return (
    <div className="format-toolbar" role="toolbar" aria-label={uiText("webobsidian.formatting-841f83")}>
      <ToolbarSurface disabled={disabled} /><div className="fixed-format-toolbar"><ToolbarSurface layout="fixed" disabled={disabled}/></div>
    </div>
  );
}
