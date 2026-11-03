export interface DraftKey {
    scopeId: string;
    path: string;
    writerId: string;
}
export interface DraftRecord extends DraftKey {
    schemaVersion: 1;
    revision: number;
    updatedAt: number;
    baseVersion: string;
    baseContent: string;
    content: string;
    kind: 'text' | 'canvas';
    state: 'dirty' | 'conflict' | 'recovery';
}
