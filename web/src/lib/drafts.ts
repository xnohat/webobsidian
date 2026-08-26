const DRAFT_PREFIX = 'uscwiki-editor:draft:';
const CONTRIBUTION_PREFIX = 'uscwiki-editor:contribution:';
const CREATED_NOTES_KEY = 'uscwiki-editor:created-notes';

export interface ContributionDraft {
  branch: string;
  pullNumber: number;
  pullUrl: string;
  title: string;
  /** Exact content included in the latest submission from this browser. */
  submittedContent?: string;
}

function key(path: string): string {
  return `${DRAFT_PREFIX}${path}`;
}

export function loadDraft(path: string): string | null {
  try {
    return localStorage.getItem(key(path));
  } catch {
    return null;
  }
}

export function saveDraft(path: string, content: string): void {
  localStorage.setItem(key(path), content);
}

export function clearDraft(path: string): void {
  localStorage.removeItem(key(path));
}

export function loadCreatedNotes(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(CREATED_NOTES_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((path): path is string => typeof path === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveCreatedNotes(paths: string[]): void {
  localStorage.setItem(CREATED_NOTES_KEY, JSON.stringify([...new Set(paths)]));
}

export function rememberCreatedNote(path: string): void {
  saveCreatedNotes([...loadCreatedNotes(), path]);
}

export function forgetCreatedNote(path: string): void {
  saveCreatedNotes(loadCreatedNotes().filter((candidate) => candidate !== path));
}

export function isCreatedNote(path: string): boolean {
  return loadCreatedNotes().includes(path);
}

export function moveCreatedNote(from: string, to: string): boolean {
  const created = loadCreatedNotes();
  const content = loadDraft(from);
  if (!created.includes(from) || content === null) return false;
  saveDraft(to, content);
  clearDraft(from);
  saveCreatedNotes(created.map((path) => (path === from ? to : path)));
  return true;
}

export function loadContribution(path: string): ContributionDraft | null {
  try {
    const value = localStorage.getItem(`${CONTRIBUTION_PREFIX}${path}`);
    return value ? JSON.parse(value) as ContributionDraft : null;
  } catch {
    return null;
  }
}

export function saveContribution(path: string, contribution: ContributionDraft): void {
  localStorage.setItem(`${CONTRIBUTION_PREFIX}${path}`, JSON.stringify(contribution));
}

export function clearContribution(path: string): void {
  localStorage.removeItem(`${CONTRIBUTION_PREFIX}${path}`);
}
