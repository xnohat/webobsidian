import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';

interface Heading {
  level: number;
  text: string;
  pos: number;
}

// Extract ATX headings (# … ######), skipping frontmatter and fenced code blocks.
export function extractHeadings(src: string): Heading[] {
  const out: Heading[] = [];
  const fm = src.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/);
  let pos = 0;
  let fence: string | null = null;
  const lines = src.split('\n');
  const fmEnd = fm ? fm[0].length : 0;
  for (const raw of lines) {
    const lineStart = pos;
    pos += raw.length + 1;
    if (lineStart < fmEnd) continue;
    const line = raw.replace(/\r$/, '');
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = line.match(/^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/);
    if (!m) continue;
    const text = m[2]
      .replace(/[ \t]+#+$/, '')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/[*_`~=]/g, '')
      .trim();
    if (text) out.push({ level: m[1].length, text, pos: lineStart });
  }
  return out;
}

const SCROLL_OFFSET = 12;

// Ease-in-out (cubic): starts slowly, speeds up through the middle, slows into the target.
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Longer jumps take longer, within sane bounds, so short hops feel snappy and long ones readable.
const scrollDuration = (distancePx: number) => Math.min(900, Math.max(300, 250 + distancePx * 0.15));

export default function DocOutline({ view, content }: { view: EditorView | null; content: string }) {
  const languageRevision = useLanguage().revision;

  const headings = useMemo(() => extractHeadings(content), [content, languageRevision]);
  const [active, setActive] = useState(-1);
  const stopScroll = useRef<(() => void) | null>(null);
  const minLevel = useMemo(() => headings.reduce((m, h) => Math.min(m, h.level), 6), [headings, languageRevision]);

  // Track the section at the top of the viewport.
  useEffect(() => {
    if (!view || headings.length === 0) return;
    const scroller = view.scrollDOM;
    const update = () => {
      const y = scroller.getBoundingClientRect().top + SCROLL_OFFSET + 8 - view.documentTop;
      const top = view.lineBlockAtHeight(y).from;
      let idx = -1;
      for (let i = 0; i < headings.length; i++) {
        if (headings[i].pos <= top) idx = i;
        else break;
      }
      setActive(idx);
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, [view, headings]);

  // Never leave an animation running after the outline unmounts (note switch, Source mode…).
  useEffect(() => () => stopScroll.current?.(), []);

  if (!view || headings.length === 0) return null;

  const go = (h: Heading) => {
    const pos = Math.min(h.pos, view.state.doc.length);
    const scroller = view.scrollDOM;
    stopScroll.current?.(); // a new click replaces any animation still in flight

    // CodeMirror's own scroll effect: it re-measures as it scrolls, so it is accurate where a
    // one-shot scrollTo(lineBlockAt().top) is not (lines far from the viewport only have
    // ESTIMATED heights until they are rendered). Used for the final landing, and for users who
    // prefer reduced motion.
    const settle = () => view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: SCROLL_OFFSET }) });
    // Absolute scrollTop that puts the heading at the top *right now* — recomputed every frame
    // because the estimate changes as CodeMirror renders and measures lines on the way. Once the
    // heading is actually rendered we aim at its real on-screen position (exact, whatever its
    // level/margins); until then we use CodeMirror's height estimate for its line.
    const targetTop = () => {
      const scrollerTop = scroller.getBoundingClientRect().top;
      const c = view.coordsAtPos(pos);
      if (c) return Math.max(0, scroller.scrollTop + (c.top - scrollerTop) - SCROLL_OFFSET);
      const block = view.lineBlockAt(pos);
      return Math.max(0, scroller.scrollTop + view.documentTop + block.top - scrollerTop - SCROLL_OFFSET);
    };

    const start = scroller.scrollTop;
    const distance = Math.abs(targetTop() - start);
    if (distance < 4 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      settle();
      window.setTimeout(settle, 150);
      return;
    }

    const duration = scrollDuration(distance);
    const t0 = performance.now();
    let raf = 0;
    let prevP = 0; // eased progress already "spent"
    // Land exactly via CodeMirror only when the heading isn't already close to where we want
    // it (our target differs from CodeMirror's own alignment by a constant style-dependent
    // amount; snapping for that would twitch right after the animation ends).
    const landed = () => {
      const c = view.coordsAtPos(pos);
      return !!c && Math.abs(c.top - (scroller.getBoundingClientRect().top + SCROLL_OFFSET)) <= 40;
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) scroller.removeEventListener(ev, stop);
      stopScroll.current = null;
    };
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const p = easeInOutCubic(t);
      // Cover this frame's share of the REMAINING distance, measured from where we are now.
      // With a fixed target this reproduces the ease-in-out curve exactly; when CodeMirror
      // re-measures lines and the target (or scrollTop itself) shifts, we glide on from the new
      // position instead of overwriting it with a stale absolute value, which showed as jitter.
      const frac = prevP >= 1 ? 1 : (p - prevP) / (1 - prevP);
      prevP = p;
      const cur = scroller.scrollTop;
      scroller.scrollTop = cur + (targetTop() - cur) * frac;
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        stop();
        if (!landed()) settle(); // exact landing if still off, then one settling pass
        window.setTimeout(() => { if (!landed()) settle(); }, 150);
      }
    };
    // The user taking over (wheel / touch / click / key) cancels the animation immediately.
    for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) scroller.addEventListener(ev, stop, { passive: true });
    stopScroll.current = stop;
    raf = requestAnimationFrame(step);
  };

  return (
    <nav className="doc-outline" aria-label={uiText("webobsidian.document-outline-12ebeb")}>
      <ul className="doc-outline-markers">
        {headings.map((h, i) => (
          <li key={`${i}-${h.pos}`}>
            <button
              type="button"
              className={'doc-outline-marker' + (i === active ? ' active' : '')}
              style={{ width: Math.max(8, 22 - (h.level - minLevel) * 4) }}
              onClick={() => go(h)}
              aria-label={h.text}
            />
          </li>
        ))}
      </ul>
      <ul className="doc-outline-panel">
        {headings.map((h, i) => (
          <li key={`${i}-${h.pos}`}>
            <button
              type="button"
              className={'doc-outline-item' + (i === active ? ' active' : '')}
              style={{ paddingLeft: 10 + (h.level - minLevel) * 12 }}
              onClick={() => go(h)}
              title={h.text}
            >
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
