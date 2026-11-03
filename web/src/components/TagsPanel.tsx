import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

export default function TagsPanel() {
  const languageRevision = useLanguage().revision;

  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const searchFor = useStore((s) => s.searchFor);

  useEffect(() => {
    api.tags().then((r) => setTags(r.tags)).catch(() => {});
  }, []);

  return (
    <div style={{ padding: 8 }}>
      {tags.length === 0 && <div style={{ color: 'var(--text-faint)', padding: 8 }}>{uiText("webobsidian.no-tags-found-ed4525")}</div>}
      {tags.map((t) => (
        <span
          key={t.tag}
          className="tag-pill"
          title={uiText("webobsidian.search-value0-250d06", {value0: t.tag})}
          onClick={() => searchFor(`tag:${t.tag}`)}
        >
          #{t.tag} <span className="count">{t.count}</span>
        </span>
      ))}
    </div>
  );
}
