const DRAFT_PREFIX = 'uscwiki-editor:draft:';
const CONTRIBUTION_PREFIX = 'uscwiki-editor:contribution:';

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
