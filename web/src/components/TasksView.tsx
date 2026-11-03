import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useMemo, useState } from 'react';
import { useStore, type ContextMenuItem } from '../lib/store';
import { api, type TaskRecord, type TreeNode } from '../lib/api';
import DueDateEditor from './DueDateEditor';
import {
  changeTaskDue,
  columnIdFor,
  columnsFor,
  DEFAULT_HIDDEN_STATUSES,
  filterByStatus,
  hiddenByStatus,
  isMissingStatus,
  isOverdue,
  isUndated,
  moveTask,
  restoreTask,
  changeTaskStatus,
  statusFacets,
  todayISO,
} from '../lib/tasks';
import GanttChart from './GanttChart';
import Icon from './Icon';

const TASK_TEMPLATE_PATH = 'Wiki/templates/task.md';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Every folder path in the vault, in tree order (mirrors FolderPicker's collectFolders). */
function collectFolders(node: TreeNode | null): string[] {
  if (!node) return [];
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    for (const c of n.children ?? []) {
      if (c.type === 'folder') {
        out.push(c.path);
        walk(c);
      }
    }
  };
  walk(node);
  return out;
}

/**
 * Kanban board over `type: task` notes (FR-15, issue #31 part 1). Loads its own
 * data (independent of the file tree/editor), filters client-side, and moves
 * cards between columns optimistically by rewriting the note's `status:` field.
 */
export default function TasksView() {
  const languageRevision = useLanguage().revision;

  const tree = useStore((s) => s.tree);
  const openFile = useStore((s) => s.openFile);
  const notify = useStore((s) => s.notify);
  const openContextMenu = useStore((s) => s.openContextMenu);

  const folders = useMemo(() => collectFolders(tree), [tree, languageRevision]);

  const [folder, setFolder] = useState('');
  const [priority, setPriority] = useState('');
  const [owner, setOwner] = useState('');
  const [q, setQ] = useState('');
  // Status filter (issue #39). Finished work is hidden on arrival; everything
  // else — including unmapped statuses — stays visible until the user hides it.
  const [hiddenStatuses, setHiddenStatuses] = useState<string[]>([...DEFAULT_HIDDEN_STATUSES]);
  /** Path whose due date is being edited inline (null = nobody). */
  const [dueEditPath, setDueEditPath] = useState<string | null>(null);
  /** Show only tasks with no due date — scheduling in one pass (#41). */
  const [undatedOnly, setUndatedOnly] = useState(false);
  // Board | Timeline lives in the store, so `/tasks?mode=…` is a real deep link
  // (see urlsync) and the palette entry works whether or not this view is mounted.
  const mode = useStore((s) => s.tasksMode);
  const setMode = useStore((s) => s.setTasksMode);

  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const load = async (f: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const { tasks: loaded } = await api.tasks(f ? { folder: f } : undefined);
      setTasks(loaded);
    } catch (e: unknown) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(folder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  // Auto-refresh (debounced) when a watched note inside the folder scope changes.
  useEffect(() => {
    let timer: number | undefined;
    const onFs = (e: Event) => {
      const p: string | undefined = (e as CustomEvent).detail?.path;
      if (!p || !/\.(md|markdown)$/i.test(p)) return;
      if (folder && !(p === folder || p.startsWith(`${folder}/`))) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => load(folder), 500);
    };
    window.addEventListener('wo-fs', onFs);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('wo-fs', onFs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  const cardFiltered = useMemo(() => {
    const p = priority.trim().toLowerCase();
    const o = owner.trim().toLowerCase();
    const lc = q.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (!p || (t.priority ?? '').toLowerCase() === p) &&
        (!o || (t.owner ?? '').toLowerCase() === o) &&
        (!lc || t.title.toLowerCase().includes(lc)),
    );
  }, [tasks, priority, owner, q, languageRevision]);

  // Counted over what the status filter is showing, so the number always matches
  // the cards the undated filter will reveal.
  const undatedCount = useMemo(
    () => filterByStatus(cardFiltered, hiddenStatuses).filter(isUndated).length,
    [cardFiltered, hiddenStatuses, languageRevision],
  );
  const passesDue = useMemo(() => (t: TaskRecord) => !undatedOnly || isUndated(t), [undatedOnly, languageRevision]);
  const visibleTasks = useMemo(
    () => filterByStatus(cardFiltered, hiddenStatuses).filter(passesDue),
    [cardFiltered, hiddenStatuses, passesDue, languageRevision],
  );
  const hiddenCount = useMemo(() => hiddenByStatus(cardFiltered, hiddenStatuses), [cardFiltered, hiddenStatuses, languageRevision]);
  const facets = useMemo(() => statusFacets(cardFiltered), [cardFiltered, languageRevision]);

  // Every column still renders: the Done column has to remain a drop target even
  // while its cards are filtered out, or a task could never be completed. Only
  // the visible cards are listed, and the header says how many are hidden.
  const columns = useMemo(
    () =>
      columnsFor(cardFiltered).map((c) => {
        const visible = filterByStatus(c.tasks, hiddenStatuses).filter(passesDue);
        return { ...c, tasks: visible, hidden: c.tasks.length - visible.length };
      }),
    [cardFiltered, hiddenStatuses, passesDue, languageRevision],
  );
  const today = useMemo(() => todayISO(), [languageRevision]);

  const priorityOptions = useMemo(
    () => [...new Set(tasks.map((t) => t.priority).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b)),
    [tasks, languageRevision],
  );
  const ownerOptions = useMemo(
    () => [...new Set(tasks.map((t) => t.owner).filter((o): o is string => !!o))].sort((a, b) => a.localeCompare(b)),
    [tasks, languageRevision],
  );

  const move = async (path: string, statusId: string) => {
    const previous = tasks.find((t) => t.path === path);
    if (!previous || columnIdFor(previous) === statusId) return; // already there — don't touch the note
    setTasks((cur) => moveTask(cur, path, statusId));
    try {
      await changeTaskStatus(path, statusId);
    } catch (e: unknown) {
      // Restore just this card — an auto-refresh may have landed a fresher
      // board snapshot while the write was in flight; don't clobber it.
      setTasks((cur) => restoreTask(cur, previous));
      notify(uiText("webobsidian.could-not-move-value0-value1-1383a1", {value0: previous.title, value1: errorMessage(e)}));
    }
  };

  /**
   * Set (or clear) a card's due date. `due` is a YYYY-MM-DD date or 'none'.
   * Same shape as `move`: optimistic, rolled back on failure, with a notice.
   */
  const setDue = async (path: string, due: string) => {
    const previous = tasks.find((t) => t.path === path);
    setDueEditPath(null);
    if (!previous || (previous.due ?? 'none') === due) return; // nothing to write
    setTasks((cur) => cur.map((t) => (t.path === path ? { ...t, due } : t)));
    try {
      await changeTaskDue(path, due);
      notify(due === "none" ? uiText("webobsidian.cleared-the-due-date-on-value0-f3d938", {value0: previous.title}) : uiText("webobsidian.due-date-on-value0-set-to-value1-a42e65", {value0: previous.title, value1: due}));
    } catch (e: unknown) {
      setTasks((cur) => restoreTask(cur, previous));
      notify(uiText("webobsidian.could-not-set-the-due-date-on-value0-value1-102847", {value0: previous.title, value1: errorMessage(e)}));
    }
  };

  const moveMenuItems = (task: TaskRecord, currentColId: string): ContextMenuItem[] =>
    columns
      .filter((c) => c.id !== currentColId)
      .map((c) => ({ get label() {return uiText("webobsidian.move-to-value0-249e97", {value0: c.label});}, onClick: () => move(task.path, c.id) }));

  /** Card menu: scheduling first (the point of #41), then the status moves. */
  const cardMenuItems = (task: TaskRecord, currentColId: string): ContextMenuItem[] => [
    { get label() {return uiText("webobsidian.set-due-date-f91b98");}, onClick: () => setDueEditPath(task.path) },
    ...(isUndated(task) ? [] : [{ get label() {return uiText("webobsidian.clear-due-date-b96659");}, onClick: () => setDue(task.path, 'none') }]),
    ...moveMenuItems(task, currentColId),
  ];

  const onCardContextMenu = (e: React.MouseEvent, task: TaskRecord, colId: string) => {
    e.preventDefault();
    openContextMenu({ x: e.clientX, y: e.clientY, items: cardMenuItems(task, colId) });
  };

  // Touch-friendly fallback for drag & drop.
  const onCardMenuButton = (e: React.MouseEvent, task: TaskRecord, colId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openContextMenu({ x: Math.round(rect.left), y: Math.round(rect.bottom) + 4, items: cardMenuItems(task, colId) });
  };

  const toolbar = (
    <div className="tasks-toolbar">
      <select className="text-input" value={folder} onChange={(e) => setFolder(e.target.value)} title={uiText("webobsidian.folder-scope-0623bf")}>
        <option value="">{uiText("webobsidian.whole-vault-ad9800")}</option>
        {folders.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <select className="text-input" value={priority} onChange={(e) => setPriority(e.target.value)} title={uiText("webobsidian.priority-886cbf")}>
        <option value="">{uiText("webobsidian.any-priority-266ecf")}</option>
        {priorityOptions.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select className="text-input" value={owner} onChange={(e) => setOwner(e.target.value)} title={uiText("webobsidian.owner-89ff31")}>
        <option value="">{uiText("webobsidian.any-owner-96b7b5")}</option>
        {ownerOptions.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <input className="text-input" placeholder={uiText("webobsidian.search-titles-ec8135")} value={q} onChange={(e) => setQ(e.target.value)} />
      <span className="grow" />
      <div className="seg">
        <button
          className={mode === 'board' ? 'active' : ''}
          title={uiText("webobsidian.board-view-dcbb4d")}
          onClick={() => {
            setMode('board');
            window.history.replaceState(null, '', '/tasks?mode=board');
          }}
        >
          {uiText("webobsidian.board-e879b0")} </button>
        <button
          className={mode === 'timeline' ? 'active' : ''}
          title={uiText("webobsidian.timeline-view-gantt-d83347")}
          onClick={() => {
            setMode('timeline');
            window.history.replaceState(null, '', '/tasks?mode=timeline');
          }}
        >
          {uiText("webobsidian.timeline-018514")} </button>
      </div>
      <button className="tool-btn" title={uiText("webobsidian.refresh-56e3ba")} onClick={() => load(folder)} disabled={loading}>
        <Icon name="refresh-cw" size={16} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
      </button>
    </div>
  );

  // Status filter row: a chip per status with its count, so nothing is silently
  // invisible — plus a one-click escape when the filter is hiding work.
  const statusRow = (
    <div className="tasks-toolbar status-row">
      <span className="tasks-filter-label">{uiText("webobsidian.status-bae7d5")}</span>
      <div className="tasks-status-chips" role="group" aria-label={uiText("webobsidian.filter-by-status-f43653")}>
        {facets.map((f) => {
          const shown = !hiddenStatuses.includes(f.id);
          return (
            <button
              key={f.id}
              className={`status-chip ${shown ? 'on' : 'off'}`}
              data-status={f.id}
              aria-pressed={shown}
              title={shown ? uiText("webobsidian.hide-value0-value1-0d8b9f", {value0: f.label, value1: f.count}) : uiText("webobsidian.show-value0-value1-db3d46", {value0: f.label, value1: f.count})}
              onClick={() => setHiddenStatuses((cur) => (shown ? [...cur, f.id] : cur.filter((s) => s !== f.id)))}
            >
              <span className={`status-chip-dot chip-${f.canonical ? f.id : 'unknown'}`} />
              <span className="status-chip-label">{f.label}</span>
              <span className="status-chip-count">{f.count}</span>
            </button>
          );
        })}
      </div>
      {undatedCount > 0 && (
        <button
          className={`status-chip undated-chip ${undatedOnly ? 'on' : 'off'}`}
          data-undated={undatedOnly ? 'on' : 'off'}
          aria-pressed={undatedOnly}
          title={uiText("webobsidian.show-only-tasks-with-no-due-date-b6df3f")}
          onClick={() => setUndatedOnly((v) => !v)}
        >
          <span className="status-chip-dot chip-undated" />
          <span className="status-chip-label">{uiText("webobsidian.needs-a-due-date-194548")}</span>
          <span className="status-chip-count">{undatedCount}</span>
        </button>
      )}
      <span className="grow" />
      {undatedOnly && (
        <button className="tasks-show-all" onClick={() => setUndatedOnly(false)}>
          {uiText("webobsidian.showing-only-undated-show-all-46d63c")} </button>
      )}
      {hiddenCount > 0 && (
        <button className="tasks-show-all" onClick={() => setHiddenStatuses([])}>
          {hiddenCount} {uiText("webobsidian.hidden-show-all-6b4eb2")} </button>
      )}
    </div>
  );

  if (!loading && !loadError && tasks.length === 0) {
    return (
      <div className="tasks-view">
        {toolbar}
        <div className="empty-state tasks-empty">
          <div>
            <div className="big">
              <Icon name="check-square" size={48} />
            </div>
            <p>
              {uiText("webobsidian.no-tasks-found-add-e9cf6d")} <code>{uiText("webobsidian.type-task-73a19f")}</code> {uiText("webobsidian.to-a-note-s-frontmatter-to-see-it-on-this-board-a40980")} </p>
            <button className="tool-btn tasks-empty-link" onClick={() => openFile(TASK_TEMPLATE_PATH)}>
              {uiText("webobsidian.open-cf9b77")} {TASK_TEMPLATE_PATH}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tasks-view">
      {toolbar}
      {statusRow}
      {loadError && <div className="tasks-error">{loadError}</div>}
      {mode === "timeline" ? (
        <GanttChart
          tasks={visibleTasks}
          onOpen={openFile}
          dueEditPath={dueEditPath}
          onEditDue={setDueEditPath}
          onSetDue={setDue}
        />
      ) : (
        <div className="tasks-board">
        {columns.map((col) => (
          <div
            key={col.id}
            className={`task-column ${dragOverCol === col.id ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(col.id);
            }}
            onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverCol(null);
              const path = e.dataTransfer.getData('text/wo-task');
              if (path) move(path, col.id);
            }}
          >
            <div className="task-column-head">
              <span className="task-column-title">{col.label}</span>
              {col.hidden > 0 && (
                <span className="task-column-hidden" title={uiText("webobsidian.-value0-hidden-by-the-status-filter-4e20b2", {value0: col.hidden})}>
                  {col.hidden} {uiText("webobsidian.hidden-99d72c")} </span>
              )}
              <span className="task-column-count">{col.tasks.length}</span>
            </div>
            <div className="task-column-body">
              {col.tasks.map((t) => (
                <div
                  key={t.path}
                  className="task-card"
                  draggable
                  role="button"
                  tabIndex={0}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/wo-task', t.path);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => openFile(t.path)}
                  onKeyDown={(e) => {
                    // Only when the card itself is focused — Enter on the "⋯"
                    // button must open its Move-to menu, not the note.
                    if (e.key === 'Enter' && e.target === e.currentTarget) openFile(t.path);
                  }}
                  onContextMenu={(e) => onCardContextMenu(e, t, col.id)}
                  title={t.path}
                >
                  <div className="task-card-head">
                    <span className="task-card-title">{t.title}</span>
                    {isMissingStatus(t) && <span className="task-dot" title={uiText("webobsidian.no-status-field-8030af")} />}
                    <button
                      className="task-card-menu"
                      title={uiText("webobsidian.move-to-c0a3ef")}
                      onClick={(e) => onCardMenuButton(e, t, col.id)}
                    >
                      <Icon name="more-horizontal" size={14} />
                    </button>
                  </div>
                  {(t.priority || t.owner || t.due || isUndated(t)) && (
                    <div className="task-card-meta">
                      {t.priority && <span className="task-badge task-priority">{t.priority}</span>}
                      {t.owner && <span className="task-badge task-owner">{t.owner}</span>}
                      {dueEditPath === t.path ? (
                        <DueDateEditor
                          value={t.due}
                          onCommit={(due) => setDue(t.path, due)}
                          onCancel={() => setDueEditPath(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          className={`task-badge task-due ${isOverdue(t, today) ? 'overdue' : ''} ${
                            isUndated(t) ? 'undated' : ''
                          }`}
                          title={isUndated(t) ? uiText("webobsidian.no-due-date-click-to-set-one-fb5f0e") : uiText("webobsidian.due-value0-click-to-change-96a896", {value0: t.due})}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDueEditPath(t.path);
                          }}
                        >
                          {isUndated(t) ? uiText("webobsidian.no-due-63bded") : t.due}
                          <span className="task-due-caret" aria-hidden="true">
                            ▾
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                  {t.tags.length > 0 && (
                    <div className="task-card-tags">
                      {t.tags.map((tag) => (
                        <span key={tag} className="tag-pill">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="task-card-path">{t.path}</div>
                </div>
              ))}
              {col.tasks.length === 0 && (
                <div className="task-column-empty">{col.hidden > 0 ? uiText("webobsidian.all-hidden-by-the-status-filter-b38284") : uiText("webobsidian.no-tasks-e54269")}</div>
              )}
            </div>
          </div>
        ))}
        </div>
      )}
    </div>
  );
}
