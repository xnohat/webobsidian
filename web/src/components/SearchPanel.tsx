import {translateLabel as uiLabel} from "../lib/i18n/runtime";
import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type SearchHit, type MatchContext, type NoteMatches } from '../lib/api';
import { useStore } from '../lib/store';
import Icon from './Icon';
import { cleanSnippet } from '../lib/snippet';
import {useIndexStatus,indexStatusMessage,applyIndexStatus} from '../lib/indexStatus';

type SortMode = 'relevance' | 'name-asc' | 'name-desc' | 'path-asc';

const SORT_LABELS: Record<SortMode, string> = {
  relevance: 'Relevance',
  'name-asc': uiText("plugins.file-explorer.label-sort-a-to-z"),
  'name-desc': uiText("plugins.file-explorer.label-sort-z-to-a"),
  'path-asc': 'Path (A to Z)',
};

/** Render a match context with its highlighted ranges as React nodes. */
function highlight(raw: MatchContext): ReactNode[] {
  const out: ReactNode[] = [];
  const c = { ...raw, ...cleanSnippet(raw.text, raw.ranges) };
  const ranges = [...c.ranges].sort((a, b) => a[0] - b[0]);
  let pos = 0;
  if (c.pre) out.push('…');
  ranges.forEach(([s, l], i) => {
    const start = Math.max(pos, s);
    if (start > pos) out.push(c.text.slice(pos, start));
    const end = Math.min(c.text.length, s + l);
    if (end > start) out.push(<mark key={i}>{c.text.slice(start, end)}</mark>);
    pos = Math.max(pos, end);
  });
  out.push(c.text.slice(pos));
  if (c.post) out.push('…');
  return out;
}

export default function SearchPanel() {
  const languageRevision = useLanguage().revision;

  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const indexState=useIndexStatus();
  const indexKey=`${indexState.status?.generation ?? ''}:${indexState.status?.revision ?? ''}:${indexState.status?.initialScanComplete ?? ''}:${indexState.refresh}`;
  const contextEpoch=useRef(0);
  const previousGeneration=useRef(indexState.status?.generation);
  const [matches, setMatches] = useState<Map<string, NoteMatches>>(new Map());
  const [matchCase, setMatchCase] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [moreContext, setMoreContext] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [sort, setSort] = useState<SortMode>('relevance');
  const [sortOpen, setSortOpen] = useState(false);
  const [visible, setVisible] = useState(50); // render incrementally to stay smooth
  const [noteOverride, setNoteOverride] = useState<Map<string, boolean>>(new Map());
  const openFile = useStore((s) => s.openFile);
  const searchQuery = useStore((s) => s.searchQuery);
  const timer = useRef<number>();
  const sentinel = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inflight = useRef<Set<string>>(new Set());
  const queryRef = useRef(q);
  const caseRef = useRef(matchCase);
  queryRef.current = q;
  caseRef.current = matchCase;

  // adopt a query pushed from elsewhere (e.g. clicking a tag node in the graph)
  useEffect(() => {
    if (searchQuery) setQ(searchQuery);
  }, [searchQuery]);

  useEffect(()=>{
    if(previousGeneration.current!==indexState.status?.generation){
      previousGeneration.current=indexState.status?.generation;
      setHits([]);
      setMatches(new Map());
    }
  },[indexState.status?.generation]);

  useEffect(() => {
    let current=true;
    window.clearTimeout(timer.current);
    if (!q.trim()) {
      setHits([]);
      setError('');setLoading(false);
      return;
    }
    setLoading(true);setError('');
    timer.current = window.setTimeout(async () => {
      try {
        const r = await api.search(q); // no limit — server returns every match
        if(!current)return;
        setHits(r.hits);
        if(r.index)applyIndexStatus(r.index);
      } catch(e) {
        if(!current)return;
        setError(e instanceof ApiError && e.status===503 ? uiText("webobsidian.indexing-notes-search-will-update-when-ready-7dbe35") : uiText("webobsidian.search-could-not-be-refreshed-check-the-connecti-5905f0"));
      } finally {
        if(current)setLoading(false);
      }
    }, 180);
    return () => {current=false;window.clearTimeout(timer.current)};
  }, [q,indexKey]);

  // Reset the render window when the result set or its ordering changes.
  useEffect(() => setVisible(50), [hits, sort, matchCase]);
  // Drop cached per-note matches + collapse overrides when the query changes.
  useEffect(() => {
    setMatches(new Map());
    setNoteOverride(new Map());
    inflight.current.clear();
    contextEpoch.current++;
  }, [q, matchCase,indexKey]);
  // Toggling the global collapse switch clears individual overrides.
  useEffect(() => setNoteOverride(new Map()), [collapsed]);

  // Apply client-side sort (match-case filtering is now done server-side via
  // the per-note scan, so it no longer drops notes from the list here).
  const shown = useMemo(() => {
    const sorted = [...hits];
    switch (sort) {
      case 'name-asc':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'path-asc':
        sorted.sort((a, b) => a.path.localeCompare(b.path));
        break;
      default:
        break; // relevance = server order
    }
    return sorted;
  }, [hits, sort, languageRevision]);

  // Lazily fetch highlighted match contexts for the notes currently rendered.
  useEffect(() => {
    if (!q.trim()) return;
    const need = shown
      .slice(0, visible)
      .map((h) => h.path)
      .filter((p) => !matches.has(p) && !inflight.current.has(p));
    if (!need.length) return;
    const batch = need.slice(0, 60);
    batch.forEach((p) => inflight.current.add(p));
    const qAt = q;
    const caseAt = matchCase;
    const epochAt=contextEpoch.current;
    api
      .searchMatches(qAt, batch, caseAt)
      .then((r) => {
        if (epochAt!==contextEpoch.current || qAt !== queryRef.current || caseAt !== caseRef.current) return; // stale
        setMatches((prev) => {
          const next = new Map(prev);
          for (const m of r.matches) next.set(m.path, m);
          return next;
        });
      })
      .catch(() => {})
      .finally(() => {if(epochAt===contextEpoch.current)batch.forEach((p) => inflight.current.delete(p))});
  }, [shown, visible, q, matchCase, matches,indexKey]);

  // Load the next chunk when the sentinel at the bottom scrolls into view.
  useEffect(() => {
    if (visible >= shown.length) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible((v) => Math.min(v + 50, shown.length));
      },
      { root: resultsRef.current, rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, shown.length]);

  const isCollapsed = (p: string) => (noteOverride.has(p) ? !!noteOverride.get(p) : collapsed);
  const toggleNote = (p: string) =>
    setNoteOverride((prev) => {
      const n = new Map(prev);
      n.set(p, !isCollapsed(p));
      return n;
    });

  const totalMatches = useMemo(() => {
    let t = 0;
    for (const m of matches.values()) t += m.count;
    return t;
  }, [matches, languageRevision]);

  return (
    <div className="search-panel">
      <div className="search-head">
        <div className="search-input-wrap">
          <Icon name="search" size={15} className="search-lead" />
          <input
            className="search-input has-lead"
            placeholder={uiText("webobsidian.search-try-tag-idea-path-notes-c9baba")}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className={`search-icon-btn ${matchCase ? 'active' : ''}`}
            title={uiText("plugins.search.label-match-case")}
            onClick={() => setMatchCase((v) => !v)}
          >
            {uiText("webobsidian.aa-2c419e")} </button>
          {q && (
            <button className="search-icon-btn" title={uiText("plugins.file-recovery.button-clear-history")} onClick={() => setQ('')}>
              <Icon name="x" size={15} />
            </button>
          )}
          <button
            className={`search-icon-btn ${showOptions ? 'active' : ''}`}
            title={uiText("plugins.search.label-search-options")}
            onClick={() => setShowOptions((v) => !v)}
          >
            <Icon name="sliders" size={15} />
          </button>
        </div>

        {showOptions && (
          <div className="search-options">
            <label className="search-opt">
              <span>{uiText("plugins.search.label-collapse-results")}</span>
              <input type="checkbox" checked={collapsed} onChange={(e) => setCollapsed(e.target.checked)} />
            </label>
            <label className="search-opt">
              <span>{uiText("plugins.search.label-more-context")}</span>
              <input type="checkbox" checked={moreContext} onChange={(e) => setMoreContext(e.target.checked)} />
            </label>
          </div>
        )}

        {indexStatusMessage(indexState.status) && <div role="status" className="search-index-status">{indexStatusMessage(indexState.status)}</div>}
        {error && <div role="alert" className="search-index-status">{error}</div>}
        {q && !error && (
          <div className="search-meta">
            <span>
              {loading ? uiText("webobsidian.searching-1a6a5b") : uiText('webobsidian.note-count',{count:shown.length})}
              {totalMatches > 0 && uiText("webobsidian.-value0-value1-matches-0a2408", {value0: totalMatches, value1: visible < shown.length ? '+' : ''})}
            </span>
            <span className="grow" />
            <div className="search-sort">
              <button className="search-sort-btn" onClick={() => setSortOpen((v) => !v)}>
                {uiLabel(SORT_LABELS[sort])}
                <Icon name="chevron-down" size={13} />
              </button>
              {sortOpen && (
                <>
                  <div className="search-sort-backdrop" onClick={() => setSortOpen(false)} />
                  <div className="search-sort-menu">
                    {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
                      <button
                        key={m}
                        className={sort === m ? 'active' : ''}
                        onClick={() => {
                          setSort(m);
                          setSortOpen(false);
                        }}
                      >
                        <Icon name="check" size={14} style={{ opacity: sort === m ? 1 : 0 }} />
                        {uiLabel(SORT_LABELS[m])}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="search-results" ref={resultsRef}>
        {shown.slice(0, visible).map((h) => {
          const m = matches.get(h.path);
          const noteCollapsed = isCollapsed(h.path);
          const contexts = m?.contexts ?? [];
          return (
            <div key={h.path} className="result-group">
              <div className="rg-head" title={h.path}>
                <button
                  className="rg-twisty"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNote(h.path);
                  }}
                >
                  <Icon name={noteCollapsed ? 'chevron-right' : 'chevron-down'} size={14} />
                </button>
                <span className="rg-title" onClick={() => openFile(h.path)}>
                  {h.title}
                </span>
                {m && m.count > 0 && <span className="rg-badge">{m.count}</span>}
              </div>
              {!noteCollapsed && (
                <div className="rg-body">
                  {contexts.length > 0 ? (
                    contexts.map((c, i) => (
                      <div
                        key={i}
                        className={`rg-match ${moreContext ? 'expanded' : ''}`}
                        onClick={() => openFile(h.path)}
                      >
                        {highlight(c)}
                      </div>
                    ))
                  ) : (
                    h.snippet && (
                      <div
                        className={`rg-match ${moreContext ? 'expanded' : ''}`}
                        onClick={() => openFile(h.path)}
                      >
                        {cleanSnippet(h.snippet, []).text}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={sentinel} />
        {visible < shown.length && (
          <div className="search-more">{uiText("webobsidian.showing-163d81")} {visible} {uiText("webobsidian.of-de04fa")} {shown.length}…</div>
        )}
      </div>
    </div>
  );
}
