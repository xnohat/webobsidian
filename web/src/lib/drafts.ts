const DRAFT_PREFIX = 'uscwiki-editor:draft:';

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
