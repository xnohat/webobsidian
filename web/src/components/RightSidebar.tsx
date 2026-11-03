import {translateLabel as uiLabel} from "../lib/i18n/runtime";
import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api, type NoteMatches } from '../lib/api';
import { outline } from '../lib/markdown';
import TagsPanel from './TagsPanel';
import Icon from './Icon';

const MD_RE = /\.(md|markdown)$/i;
const name = (p: string) => p.split('/').pop()?.replace(MD_RE, '') ?? p;

const TABS = [
  { id: 'backlinks', icon: 'link', get title() {return uiText("plugins.backlinks.name");} },
  { id: 'outgoing', icon: 'arrow-up-right', get title() {return uiText("webobsidian.outgoing-links-f4ba79");} },
  { id: 'tags', icon: 'hash', get title() {return uiText("webobsidian.tags-848eed");} },
  { id: 'outline', icon: 'list', get title() {return uiText("plugins.outline.name");} },
] as const;

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const languageRevision = useLanguage().revision;

  return (
    <>
      <div className="section-head" onClick={onToggle}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        <span>{uiLabel(title)}</span>
        <span className="count">{count}</span>
      </div>
      {open && children}
    </>
  );
}

/** Linked mentions (backlinks index) + Unlinked mentions (plain-text title hits). */
function BacklinksPanel() {
  const languageRevision = useLanguage().revision;

  const activePath = useStore((s) => s.activePath);
  const content = useStore((s) => s.content);
  const openFile = useStore((s) => s.openFile);
  const [linked, setLinked] = useState<string[]>([]);
  const [unlinked, setUnlinked] = useState<NoteMatches[]>([]);
  const [openLinked, setOpenLinked] = useState(true);
  const [openUnlinked, setOpenUnlinked] = useState(true);

  useEffect(() => {
    if (!activePath || !MD_RE.test(activePath)) {
      setLinked([]);
      return;
    }
    api.backlinks(activePath).then((r) => setLinked(r.backlinks)).catch(() => setLinked([]));
  }, [activePath, content]);

  useEffect(() => {
    if (!activePath || !MD_RE.test(activePath)) {
      setUnlinked([]);
      return;
    }
    let stale = false;
    const title = name(activePath);
    (async () => {
      try {
        const { hits } = await api.search(title, 100);
        const linkedSet = new Set(linked);
        const candidates = hits
          .filter((h) => h.path !== activePath && !linkedSet.has(h.path) && MD_RE.test(h.path))
          .slice(0, 30)
          .map((h) => h.path);
        if (!candidates.length) {
          if (!stale) setUnlinked([]);
          return;
        }
        const { matches } = await api.searchMatches(title, candidates, false, true);
        if (!stale) setUnlinked(matches.filter((m) => m.count > 0));
      } catch {
        if (!stale) setUnlinked([]);
      }
    })();
    return () => {
      stale = true;
    };
  }, [activePath, linked]);

  return (
    <>
      <div className="nav-header">
        <span className="nav-title">
          {activePath && MD_RE.test(activePath) ? uiText("webobsidian.backlinks-for-value0-35ec2b", {value0: name(activePath)}) : uiText("plugins.backlinks.name")}
        </span>
      </div>
      <div className="sidebar-body">
        <Section title={uiText("plugins.backlinks.label-linked-mentions")} count={linked.length} open={openLinked} onToggle={() => setOpenLinked(!openLinked)}>
          {linked.length === 0 && <div className="panel-item">{uiText("plugins.backlinks.label-no-backlinks")}</div>}
          {linked.map((b) => (
            <div key={b} className="mention-box">
              <div className="mention-src" onClick={() => openFile(b)}>
                {name(b)}
              </div>
              <div style={{ color: 'var(--text-faint)' }}>{uiText("webobsidian.links-to-d5c72a")} {name(activePath ?? '')}</div>
            </div>
          ))}
        </Section>
        <Section
          title={uiText("webobsidian.unlinked-mentions-89b3dd")}
          count={unlinked.length}
          open={openUnlinked}
          onToggle={() => setOpenUnlinked(!openUnlinked)}
        >
          {unlinked.length === 0 && <div className="panel-item">{uiText("plugins.backlinks.label-no-unlinked-mentions")}</div>}
          {unlinked.map((m) => (
            <div key={m.path} className="mention-box">
              <div className="mention-src" onClick={() => openFile(m.path)}>
                {name(m.path)}
              </div>
              {m.contexts[0] && (
                <div style={{ color: 'var(--text-muted)' }}>
                  {m.contexts[0].pre && '…'}
                  {m.contexts[0].text}
                  {m.contexts[0].post && '…'}
                </div>
              )}
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}

/** Every wikilink in the active note, resolved (exists) or not (click creates). */
function OutgoingPanel() {
  const languageRevision = useLanguage().revision;

  const activePath = useStore((s) => s.activePath);
  const content = useStore((s) => s.content);
  const openWikilink = useStore((s) => s.openWikilink);
  const [resolved, setResolved] = useState<Record<string, string | null>>({});

  const targets = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const m of content.matchAll(/!?\[\[([^\]]+?)\]\]/g)) {
      const t = m[1].split('|')[0].split('#')[0].trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    return out.slice(0, 200);
  }, [content, languageRevision]);

  useEffect(() => {
    let stale = false;
    Promise.all(
      targets.map((t) =>
        api
          .resolve(t)
          .then((r) => [t, r.path] as const)
          .catch(() => [t, null] as const),
      ),
    ).then((pairs) => {
      if (!stale) setResolved(Object.fromEntries(pairs));
    });
    return () => {
      stale = true;
    };
  }, [targets]);

  const links = targets.filter((t) => resolved[t] !== undefined && resolved[t] !== null);
  // /api/resolve only knows notes — an unresolved attachment embed (image/pdf/…)
  // is NOT a "create this note" candidate, so keep those out of the list.
  const unresolved = targets.filter(
    (t) => resolved[t] === null && !/\.(png|jpe?g|gif|svg|webp|bmp|ico|pdf|mp3|mp4|mov|zip)$/i.test(t),
  );

  return (
    <>
      <div className="nav-header">
        <span className="nav-title">
          {activePath && MD_RE.test(activePath) ? uiText("webobsidian.outgoing-links-from-value0-118524", {value0: name(activePath)}) : uiText("webobsidian.outgoing-links-f4ba79")}
        </span>
      </div>
      <div className="sidebar-body">
        <div className="section-head" style={{ cursor: 'default' }}>
          <span>{uiText("webobsidian.links-014bcd")}</span>
          <span className="count">{links.length}</span>
        </div>
        {links.length === 0 && <div className="panel-item">{uiText("webobsidian.no-outgoing-links-ecad85")}</div>}
        {links.map((t) => (
          <div key={t} className="outgoing-item" onClick={() => openWikilink(t)} title={resolved[t] ?? t}>
            <Icon name="file-text" size={14} />
            <span>{t}</span>
          </div>
        ))}
        {unresolved.length > 0 && (
          <div className="section-head" style={{ cursor: 'default' }}>
            <span>{uiText("webobsidian.unresolved-eeccd8")}</span>
            <span className="count">{unresolved.length}</span>
          </div>
        )}
        {unresolved.map((t) => (
          <div key={t} className="outgoing-item unresolved" onClick={() => openWikilink(t)} title={uiText("webobsidian.not-created-yet-click-to-create-d86f92")}>
            <Icon name="file-plus" size={14} />
            <span>{t}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function OutlinePanel() {
  const languageRevision = useLanguage().revision;

  const content = useStore((s) => s.content);
  const heads = outline(content);
  return (
    <>
      <div className="nav-header">
        <span className="nav-title">{uiText("plugins.outline.name")}</span>
      </div>
      <div className="sidebar-body">
        {heads.length === 0 && <div className="panel-item">{uiText("webobsidian.no-headings-3c425f")}</div>}
        {heads.map((h, i) => (
          <div key={i} className="outline-item" style={{ paddingLeft: 10 + (h.level - 1) * 12 }}>
            {h.text}
          </div>
        ))}
      </div>
    </>
  );
}

export default function RightSidebar() {
  const languageRevision = useLanguage().revision;

  const rightPanel = useStore((s) => s.rightPanel);
  const setRightPanel = useStore((s) => s.setRightPanel);

  return (
    <div className="right-sidebar">
      <div className="right-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`right-tab ${rightPanel === t.id ? 'active' : ''}`}
            title={t.title}
            onClick={() => setRightPanel(t.id)}
          >
            <Icon name={t.icon} size={16} />
          </button>
        ))}
      </div>
      {rightPanel === "backlinks" && <BacklinksPanel />}
      {rightPanel === "outgoing" && <OutgoingPanel />}
      {rightPanel === "tags" && (
        <>
          <div className="nav-header">
            <span className="nav-title">{uiText("webobsidian.tags-848eed")}</span>
          </div>
          <div className="sidebar-body">
            <TagsPanel />
          </div>
        </>
      )}
      {rightPanel === "outline" && <OutlinePanel />}
    </div>
  );
}
