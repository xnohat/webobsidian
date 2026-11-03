import {translateLabel as uiLabel} from "../lib/i18n/runtime";
import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EditorView } from '@codemirror/view';
import { applyColor, type ColorProperty } from '../lib/colorFormatting';
import { getActiveEditor } from '../lib/activeEditor';
import { themedPopupHost } from '../lib/theme';
import { toolbarColor } from '../lib/toolbar/config';

const COLORS = [
  ['Red', '#e03131'], ['Orange', '#e8590c'], ['Yellow', '#ffd43b'], ['Green', '#2f9e44'],
  ['Teal', '#0c8599'], ['Blue', '#1971c2'], ['Purple', '#9c36b5'], ['Pink', '#f06595'],
  ['White', '#ffffff'], ['Gray', '#868e96'], ['Black', '#212529'], [uiText("webobsidian.pale-yellow-3405f9"), '#fff3bf'],
] as const;
const PROPERTIES = ['color', 'background-color'] as const;
type RecentColors = Record<ColorProperty, string[]>;
const recentKey = 'webobsidian.toolbar.recent-colors';
function readRecent(): RecentColors {
  const result: RecentColors = {color: [], 'background-color': []};
  try {
    const value = JSON.parse(localStorage.getItem(recentKey) || '{}');
    for (const property of PROPERTIES) if (Array.isArray(value[property])) {
      result[property] = [...new Set(value[property].map(toolbarColor).filter((c: unknown): c is string => typeof c === 'string'))].slice(0, 8) as string[];
    }
  } catch { /* Color history is optional when browser storage is unavailable. */ }
  return result;
}

export default function ColorControls({view, inMenu = false, disabled = false, customColors = [], properties = PROPERTIES}: {
  view?: EditorView; inMenu?: boolean; disabled?: boolean; customColors?: string[]; properties?: readonly ColorProperty[];
}) {
  const languageRevision = useLanguage().revision;

  const [popup, setPopup] = useState<{
    property: ColorProperty; left: number; top: number; anchor: DOMRect; view: EditorView;
    doc: EditorView['state']['doc']; selection: EditorView['state']['selection'];
  } | null>(null);
  const [recent, setRecent] = useState<RecentColors>(readRecent);
  const [custom, setCustom] = useState('#1971c2');
  const controls = useRef<HTMLSpanElement>(null);
  const palette = useRef<HTMLDivElement>(null);
  const savedColors = [...new Set(customColors.map(toolbarColor).filter((c): c is string => !!c))];
  const lastColor = (property: ColorProperty) => recent[property][0] || (property === 'color' ? '#1971c2' : '#ffd43b');
  const remember = (property: ColorProperty, color: string) => {
    const normalized = toolbarColor(color); if (!normalized) return;
    setRecent(previous => {
      const stored = readRecent();
      const next = {...stored, [property]: [normalized, ...previous[property], ...stored[property]].filter((value, index, all) => all.indexOf(value) === index).slice(0, 8)};
      try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* Keep in-memory history. */ }
      return next;
    });
  };
  useEffect(() => {
    const close = () => setPopup(null);
    window.addEventListener('toolbar-close-colors', close);
    return () => window.removeEventListener('toolbar-close-colors', close);
  }, []);
  useEffect(() => {
    if (!popup) return;
    const outside = (e: PointerEvent) => {
      if (!palette.current?.contains(e.target as Node) && !controls.current?.contains(e.target as Node)) setPopup(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setPopup(null); popup.view.focus(); }
    };
    const stale = () => !popup.view.dom.isConnected || popup.view.state.readOnly || popup.view.state.doc !== popup.doc || !popup.view.state.selection.eq(popup.selection) || (!!view && view !== popup.view);
    const timer = setInterval(() => { if (stale()) setPopup(null); }, 100);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    palette.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll: true});
    return () => {
      clearInterval(timer);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [popup?.property, popup?.view, view]);
  useLayoutEffect(() => {
    if (!popup) return;
    const reposition = () => {
      const viewport = window.visualViewport;
      const minX = viewport?.offsetLeft ?? 0, minY = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      if(palette.current){palette.current.style.maxHeight=Math.max(0,height-16)+'px';palette.current.style.maxWidth=Math.max(0,width-16)+'px';}
      const rect=palette.current?.getBoundingClientRect();
      const left = Math.max(minX + 8, Math.min(popup.anchor.left, minX + width - (rect?.width ?? 240) - 8));
      const actualHeight = Math.min(rect?.height ?? 240, Math.max(0,height - 16));
      const preferred=popup.anchor.bottom+actualHeight+6<minY+height?popup.anchor.bottom+6:popup.anchor.top-actualHeight-6;
      const top=Math.max(minY+8,Math.min(preferred,minY+height-actualHeight-8));
      setPopup(current => current && (current.left !== left || current.top !== top) ? {...current, left, top} : current);
    };
    reposition();
    const scroll = (e: Event) => { if (!palette.current?.contains(e.target as Node)) reposition(); };
    window.addEventListener('resize', reposition); document.addEventListener('scroll', scroll, true);
    window.visualViewport?.addEventListener('resize', reposition); window.visualViewport?.addEventListener('scroll', reposition);
    return () => {
      window.removeEventListener('resize', reposition); document.removeEventListener('scroll', scroll, true);
      window.visualViewport?.removeEventListener('resize', reposition); window.visualViewport?.removeEventListener('scroll', reposition);
    };
  }, [popup?.property, popup?.view, savedColors.length, popup ? recent[popup.property].length : 0]);
  useEffect(() => { if (disabled) setPopup(null); }, [disabled]);
  const apply = (color: string | null) => {
    if (!popup) return;
    if (!disabled && popup.view.dom.isConnected && popup.view.state.doc === popup.doc && popup.view.state.selection.eq(popup.selection)) {
      if (applyColor(popup.view, popup.property, color) && color) remember(popup.property, color);
    }
    setPopup(null);
  };
  const open = (property: ColorProperty, button: HTMLButtonElement) => {
    if (popup?.property === property) { setPopup(null); return; }
    const target = view ?? getActiveEditor(); if (!target || target.state.readOnly || !target.dom.isConnected) return;
    window.dispatchEvent(new Event('toolbar-close-colors'));
    window.dispatchEvent(new CustomEvent('toolbar-open-color', {detail:{inMenu}}));
    const stored = readRecent();
    setRecent(previous => ({color: stored.color.length ? stored.color : previous.color, 'background-color': stored['background-color'].length ? stored['background-color'] : previous['background-color']}));
    setCustom(stored[property][0] || lastColor(property));
    const anchor = button.getBoundingClientRect();
    setPopup({property, view: target, doc: target.state.doc, selection: target.state.selection, anchor, left: anchor.left, top: anchor.bottom + 6});
  };
  const swatches = (colors: string[], kind: string) => <div className="color-swatches">
    {colors.map(color => <button type="button" key={color} title={uiText("webobsidian.-value0-value1-843a2d", {value0: kind, value1: color})} aria-label={uiText("webobsidian.-value0-value1-843a2d", {value0: kind, value1: color})}
      style={{backgroundColor: color}} onPointerDown={e => e.preventDefault()} onClick={() => apply(color)} />)}
  </div>;
  return <>
    <span className="color-controls" ref={controls}>
      {properties.filter((property,index,all)=>PROPERTIES.includes(property)&&all.indexOf(property)===index).map(property => {
        const title = property === 'color' ? uiText("webobsidian.text-color-1c7a30") : uiText("webobsidian.highlight-color-844a35");
        const directLabel = property === 'color' ? uiText("webobsidian.apply-last-text-color-bd57be") : uiText("webobsidian.apply-last-highlight-color-7dd1ba");
        return <span key={property} style={{display: 'inline-flex'}}>
          <button type="button" title={uiText("webobsidian.-value0-value1-52917d", {value0: directLabel, value1: lastColor(property)})} aria-label={directLabel} disabled={disabled}
            onPointerDown={e => e.preventDefault()} onClick={() => {
              const target = view ?? getActiveEditor(), color = readRecent()[property][0] || lastColor(property);
              if (target && target.dom.isConnected && !disabled && applyColor(target, property, color)) remember(property, color);
            }}>
            <span aria-hidden="true" style={{borderBottom: `3px solid ${lastColor(property)}`}} className={property === 'color' ? 'text-color-symbol' : 'highlight-color-symbol'}>A</span>
          </button>
          <button type="button" title={uiLabel(title)} aria-label={uiLabel(title)} aria-haspopup="dialog" aria-expanded={popup?.property === property} disabled={disabled}
            onPointerDown={e => e.preventDefault()} onClick={e => open(property, e.currentTarget)}><span aria-hidden="true">⌄</span></button>
        </span>;
      })}
    </span>
    {popup && createPortal(<div className="color-palette" ref={palette} role="dialog"
      aria-label={popup.property === 'color' ? uiText("webobsidian.text-color-palette-6ba93d") : uiText("webobsidian.highlight-color-palette-055d0e")}
      style={{left: popup.left, top: popup.top, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto'}}
      onKeyDown={e => {
        if (!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(e.key) || (e.target as HTMLElement).tagName === 'INPUT') return;
        const all = Array.from(palette.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = all.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (index + (e.key === 'ArrowUp' ? -6 : e.key === 'ArrowDown' ? 6 : e.key === 'ArrowLeft' ? -1 : 1) + all.length) % all.length;
        e.preventDefault(); all[next]?.focus();
      }}>
      <div className="color-palette-title">{popup.property === 'color' ? uiText("webobsidian.text-color-1c7a30") : uiText("webobsidian.highlight-color-844a35")}</div>
      <div className="color-swatches">
        {COLORS.map(([name, color]) => <button type="button" key={color} title={name} aria-label={name}
          style={{backgroundColor: color}} onPointerDown={e => e.preventDefault()} onClick={() => apply(color)} />)}
      </div>
      {!!recent[popup.property].length && <><p style={{margin: '8px 0 4px'}}>{uiText("webobsidian.recent-colors-025112")}</p>{swatches(recent[popup.property], uiText("webobsidian.recent-color-6ad686"))}</>}
      {!!savedColors.length && <><p style={{margin: '8px 0 4px'}}>{uiText("webobsidian.saved-colors-84663e")}</p>{swatches(savedColors, uiText("webobsidian.saved-color-f419ef"))}</>}
      <div className="color-custom" style={{flexWrap: 'wrap'}}>
        <label>{uiText("webobsidian.custom-081ae3")} <input type="color" aria-label={uiText("webobsidian.custom-color-34cfc6")} value={toolbarColor(custom)?.slice(0, 7) || '#1971c2'} onChange={e => setCustom(e.target.value)} /></label>
        <label style={{fontSize: 12}}>{uiText("webobsidian.hex-887bb1")} <input aria-label={uiText("webobsidian.custom-color-hex-8cd624")} value={custom} maxLength={9} placeholder={uiText("webobsidian.-rrggbbaa-3641b8")} style={{width: 105, cursor: 'text'}} onChange={e => setCustom(e.target.value)} /></label>
        <button type="button" disabled={!toolbarColor(custom)} onClick={() => apply(toolbarColor(custom)!)}>{uiText("webobsidian.apply-cfea41")}</button>
      </div>
      <button type="button" className="color-reset" onPointerDown={e => e.preventDefault()} onClick={() => apply(null)}>{uiText("webobsidian.reset-color-24525a")}</button>
    </div>, document.fullscreenElement ?? themedPopupHost())}
  </>;
}
