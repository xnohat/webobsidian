import type { ContributionReview } from './api';

export type ContributionWorkspace =
  | { kind: 'new' }
  | { kind: 'existing'; review: ContributionReview };

let workspace: ContributionWorkspace | null = null;
const listeners = new Set<() => void>();

function publish(next: ContributionWorkspace | null): void {
  workspace = next;
  for (const listener of listeners) listener();
}

export function getContributionWorkspace(): ContributionWorkspace | null {
  return workspace;
}

export function getContributionWorkspaceBranch(): string | undefined {
  return workspace?.kind === 'existing' ? workspace.review.branch : undefined;
}

export function selectNewContribution(): void {
  publish({ kind: 'new' });
}

export function selectExistingContribution(review: ContributionReview): void {
  publish({ kind: 'existing', review });
}

export function clearContributionWorkspace(): void {
  publish(null);
}

export function subscribeContributionWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
