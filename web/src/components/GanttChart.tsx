import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TaskRecord } from '../lib/api';
import {
  axisWidth,
  barGeometry,
  barsFor,
  computeRange,
  dayGridlines,
  daysAheadVisible,
  dayToISO,
  dayToShort,
  monthSpans,
  parseDay,
  sortBars,
  ticksFor,
  todayX,
  WEEK_CONTEXT_FRACTION,
  weekendSpans,
  weekZoomPxPerDay,
  ZOOMS,
  zoomLevel,
  type GanttBar,
  type Zoom,
} from '../lib/gantt';
import { CANONICAL_STATUSES, todayISO } from '../lib/tasks';
import DueDateEditor from './DueDateEditor';
import Icon from './Icon';

/** Width of the sticky title column — shared with the CSS via --gantt-label-w.
 *  Narrow viewports get a much thinner column: at 200px it ate half a phone
 *  screen and every bar started underneath it. */
const LABEL_W_WIDE = 200;
const LABEL_W_COMPACT = 132;
/** Below this viewport width the label column (and its metadata) go compact. */
const COMPACT_QUERY = '(max-width: 640px)';
/** Below this PANE width they go compact regardless of the viewport — the column
 *  must never eat half the chart just because the window is wide but the sidebars
 *  are open (measured: 1000px window → 404px pane → a 200px column). */
const COMPACT_PANE_PX = 640;
/** Height of the two-tier axis (month band + tick row). Shared via --gantt-axis-h. */
const AXIS_H = 46;
/** Below this bar width there is no room for a title inside the bar. */
const TITLE_IN_BAR_MIN_PX = 120;

const STATUS_LABELS = new Map(CANONICAL_STATUSES.map((c) => [c.id, c.label]));

/** Colour families come from CSS: status-<canonical>, or status-unknown. */
function statusClass(status: string): string {
  return STATUS_LABELS.has(status) ? status : 'unknown';
}

function statusLabel(status: string): string {
  return STATUS_LABELS.get(status) ?? status;
}

function barTitle(b: GanttBar): string {
  const days = b.endDay - b.startDay + 1;
  const span = b.openEnded
    ? `${dayToShort(b.startDay)} → open (no due date)`
    : `${dayToShort(b.startDay)} → ${dayToShort(b.endDay)} · ${days} day${days === 1 ? '' : 's'}`;
  const parts = [b.title, statusLabel(b.status), b.owner ?? 'no owner', span];
  if (b.overdue) parts.push('overdue');
  return parts.join(' · ');
}

/**
 * Timeline (Gantt) mode of the Tasks view (FR-16, restyled in #35). Bars run
 * from a task's `raised` (fallback `created`) to its `due`; a task without a
 * usable due date is drawn as a fading, open-ended bar running to today.
 * Deliberately *no* dependencies, auto-scheduling, critical path or
 * drag-to-reschedule — those are the issue's non-goals.
 */
export default function GanttChart({
  tasks,
  onOpen,
  dueEditPath = null,
  onEditDue,
  onSetDue,
}: {
  tasks: TaskRecord[];
  onOpen: (path: string) => void;
  /** Path whose due date is being edited inline (#41). */
  dueEditPath?: string | null;
  onEditDue: (path: string | null) => void;
  onSetDue: (path: string, due: string) => void;
}) {
  const languageRevision = useLanguage().revision;

  const [zoom, setZoom] = useState<Zoom>('week');
  const [narrowViewport, setNarrowViewport] = useState(() => window.matchMedia(COMPACT_QUERY).matches);
  /** Width of the chart pane itself (the scroll container). */
  const [paneW, setPaneW] = useState(0);
  const compact = narrowViewport || (paneW > 0 && paneW < COMPACT_PANE_PX);
  const LABEL_W = compact ? LABEL_W_COMPACT : LABEL_W_WIDE;
  /** Width of the axis that is on screen, i.e. the pane minus the sticky column. */
  const usableW = Math.max(0, paneW - LABEL_W);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  /** Set once the user scrolls/drags/taps the timeline, or changes the zoom. */
  const tookOverRef = useRef(false);

  const todayDay = useMemo(() => parseDay(todayISO()) ?? 0, [languageRevision]);
  const bars = useMemo(() => sortBars(barsFor(tasks, todayDay)), [tasks, todayDay, languageRevision]);
  const range = useMemo(() => computeRange(bars, todayDay), [bars, todayDay, languageRevision]);
  // Week zoom is width-aware (issue #37): it fits eight weeks ahead of today into
  // whatever space the axis has, so a laptop or a phone is not limited to the two
  // to four weeks a fixed 16px/day would show. Day and Month keep fixed scales.
  const pxPerDay = zoom === 'week' ? weekZoomPxPerDay(usableW) : zoomLevel(zoom).pxPerDay;
  const axisPx = axisWidth(range, pxPerDay);
  const ticks = useMemo(() => ticksFor(range, zoom, pxPerDay), [range, zoom, pxPerDay, languageRevision]);
  const months = useMemo(() => monthSpans(range, pxPerDay), [range, pxPerDay, languageRevision]);
  const weekends = useMemo(
    () => (pxPerDay >= 8 ? weekendSpans(range, pxPerDay) : []),
    [range, pxPerDay, languageRevision],
  );
  const lineX = todayX(range, pxPerDay, todayDay);

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setNarrowViewport(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Today lands near the left edge: the weeks ahead are the point of the view,
    // so only a sliver of past context is kept behind the line.
    const usable = Math.max(0, el.clientWidth - LABEL_W);
    el.scrollLeft = Math.max(0, lineX - Math.round(usable * WEEK_CONTEXT_FRACTION));
  };

  // Land on today on mount — the axis can be long at day zoom, and a timeline
  // whose first paint hides "now" is useless.
  //
  // Two things have to be true for that to work, both learned by measuring:
  //   1. the container must already overflow. On mount the workspace panes are
  //      still sizing, so `scrollLeft` clamps to 0 and today stays off-screen
  //      (it looked correct to a test asserting offsets, and wrong to anyone
  //      looking at the screen). A ResizeObserver re-lands when layout settles.
  //   2. the user wins. Once they scroll, drag or tap the timeline themselves,
  //      landing must stop — including when a pane resize happens later.
  // Re-runs whenever the range or the zoom changes, so `scrollToToday` below
  // always closes over the *current* today offset. (The first version ran only
  // on mount and kept the offset from the zero-task render — 240px into a
  // 31-day placeholder range — so "land on today" scrolled nowhere and today
  // stayed off-screen.)
  useEffect(() => {
    const el = scrollRef.current;
    const grid = gridRef.current;
    if (!el || !grid) return;
    const measure = () => {
      const w = el.clientWidth;
      setPaneW((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    };
    const land = () => {
      if (!tookOverRef.current) scrollToToday();
    };
    const takeOver = () => {
      tookOverRef.current = true;
    };
    // Observe BOTH: the container resizes when a pane changes, and the grid
    // resizes when the tasks arrive or a zoom level changes.
    const ro = new ResizeObserver(() =>
      requestAnimationFrame(() => {
        measure();
        land();
      }),
    );
    ro.observe(el);
    ro.observe(grid);
    const raf = requestAnimationFrame(() => {
      measure();
      land();
    });
    const onWindowResize = () => requestAnimationFrame(() => {
      measure();
      land();
    });
    window.addEventListener('resize', onWindowResize);
    el.addEventListener('wheel', takeOver, { passive: true });
    el.addEventListener('pointerdown', takeOver);
    el.addEventListener('touchstart', takeOver, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onWindowResize);
      ro.disconnect();
      el.removeEventListener('wheel', takeOver);
      el.removeEventListener('pointerdown', takeOver);
      el.removeEventListener('touchstart', takeOver);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineX, pxPerDay]);

  return (
    <div className="gantt">
      <div className="gantt-toolbar">
        <div className="gantt-zoom">
          {ZOOMS.map((z) => (
            <button
              key={z.id}
              className={`gantt-zoom-btn ${zoom === z.id ? 'active' : ''}`}
              title={uiText("webobsidian.-value0-zoom-483765", {value0: z.label})}
              aria-pressed={zoom === z.id}
              onClick={() => {
                tookOverRef.current = true;
                setZoom(z.id);
              }}
            >
              {z.label}
            </button>
          ))}
        </div>
        <span className="grow" />
        {zoom === "week" && usableW > 0 && (
          <span
            className="gantt-horizon"
            title={uiText("webobsidian.days-ahead-of-today-that-are-on-screen-at-this-w-bc886f")}
          >
            {(daysAheadVisible(usableW, pxPerDay) / 7).toFixed(1)} {uiText("webobsidian.weeks-ahead-b56ae0")} </span>
        )}
        <span className="gantt-count">
          {uiText('webobsidian.task-count',{count:bars.length})}
        </span>
        <button className="gantt-today-btn" title={uiText("webobsidian.scroll-to-today-a05eee")} onClick={scrollToToday}>
          <Icon name="calendar" size={14} />
          <span>{uiText("webobsidian.today-24345a")}</span>
        </button>
      </div>

      <div className="gantt-scroll" ref={scrollRef}>
        <div
          className={`gantt-grid ${compact ? 'gantt-compact' : ''}`}
          ref={gridRef}
          style={
            {
              width: LABEL_W + axisPx,
              '--gantt-label-w': `${LABEL_W}px`,
              '--gantt-axis-h': `${AXIS_H}px`,
              '--gantt-day-w': `${pxPerDay}px`,
            } as React.CSSProperties
          }
        >
          <div className="gantt-axis">
            <div className="gantt-axis-spacer">
              <span className="gantt-axis-corner">{uiText("webobsidian.task-7bb0dd")}</span>
            </div>
            <div className="gantt-axis-track" style={{ width: axisPx }}>
              <div className="gantt-months">
                {months.map((m) => (
                  <div key={m.from} className="gantt-month" style={{ left: m.x, width: m.width }}>
                    {m.width >= 60 && <span className="gantt-month-label">{m.label}</span>}
                  </div>
                ))}
                <div className="gantt-today-flag" style={{ left: lineX }} title={uiText("webobsidian.today-value0-b429f3", {value0: dayToISO(todayDay)})}>
                  {uiText("webobsidian.today-24345a")} </div>
              </div>
              <div className="gantt-ticks">
                {ticks.map((t) => (
                  <div key={t.day} className={`gantt-tick ${t.major ? 'major' : ''}`} data-day={t.day} style={{ left: t.x }}>
                    {t.label !== null && <span className="gantt-tick-label">{t.label}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Weekend shading + the today band sit under the rows, offset past the
              sticky title column. The today *line* stays a direct child of the
              grid so its offset is label width + today offset. */}
          <div className="gantt-shading" style={{ left: LABEL_W, width: axisPx }}>
            {weekends.map((s) => (
              <div key={s.from} className="gantt-weekend" style={{ left: s.x, width: s.width }} />
            ))}
            {dayGridlines(range, pxPerDay).map((g) => (
              <div key={`dayline-${g.day}`} className="gantt-gridline day" style={{ left: g.x }} />
            ))}
            {ticks
              .filter((t) => t.major)
              .map((t) => (
                <div key={`line-${t.day}`} className="gantt-gridline" style={{ left: t.x }} />
              ))}
            {months.slice(1).map((m) => (
              <div key={`month-${m.from}`} className="gantt-gridline month" style={{ left: m.x }} />
            ))}
            <div className="gantt-today-band" style={{ left: lineX, width: pxPerDay }} />
          </div>

          <div className="gantt-rows">
            {bars.map((b, i) => {
              const g = barGeometry(b, range, pxPerDay);
              const cls = statusClass(b.status);
              return (
                <div className={`gantt-row ${i % 2 ? 'odd' : ''}`} key={b.path}>
                  <div className="gantt-label-cell">
                    <button type="button" className="gantt-label" title={b.path} onClick={() => onOpen(b.path)}>
                      <span className="gantt-label-top">
                        <span className={`gantt-status-dot status-${cls}`} />
                        <span className="gantt-label-title">{b.title}</span>
                      </span>
                      <span className="gantt-label-meta">
                        <span className="gantt-meta-status">{statusLabel(b.status)}</span>
                        {!compact && b.priority && <span>{b.priority}</span>}
                        {!compact && b.owner && <span>{b.owner}</span>}
                      </span>
                    </button>
                    {dueEditPath === b.path ? (
                      <DueDateEditor
                        value={b.openEnded ? null : dayToISO(b.endDay)}
                        onCommit={(due) => onSetDue(b.path, due)}
                        onCancel={() => onEditDue(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        className={`gantt-due ${b.overdue ? 'overdue' : ''} ${b.openEnded ? 'undated' : ''}`}
                        title={b.openEnded ? uiText("webobsidian.no-due-date-click-to-set-one-fb5f0e") : uiText("webobsidian.due-value0-click-to-change-96a896", {value0: dayToISO(b.endDay)})}
                        onClick={() => onEditDue(b.path)}
                      >
                        {b.openEnded ? uiText("webobsidian.no-due-63bded") : dayToShort(b.endDay)}
                      </button>
                    )}
                  </div>
                  <div className="gantt-track" style={{ width: axisPx }}>
                    <button
                      type="button"
                      className={`gantt-bar status-${cls}${b.overdue ? ' overdue' : ''}${b.openEnded ? ' open-ended' : ''}`}
                      style={{ left: g.x, width: g.width }}
                      title={barTitle(b)}
                      onClick={() => onOpen(b.path)}
                    >
                      {b.priority && <span className="gantt-bar-prio">{b.priority}</span>}
                      {!compact && g.width >= TITLE_IN_BAR_MIN_PX && <span className="gantt-bar-text">{b.title}</span>}
                      {b.openEnded && <span className="gantt-bar-nodue">{uiText("webobsidian.no-due-63bded")}</span>}
                    </button>
                  </div>
                </div>
              );
            })}
            {bars.length === 0 && <div className="gantt-empty">{uiText("webobsidian.no-tasks-to-place-on-the-timeline-bad6f5")}</div>}
          </div>

          <div className="gantt-today" style={{ left: LABEL_W + lineX }} title={uiText("webobsidian.today-value0-b429f3", {value0: dayToISO(todayDay)})} />
        </div>
      </div>
    </div>
  );
}
