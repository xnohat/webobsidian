import {loadDraftScope,draftScopeEpoch,assertDraftScope} from './store';
import { api, ApiError } from './api';
import { putDraft, deleteDraftIfRevision } from './drafts/storage';
import type { DraftRecord } from './drafts/types';
export interface ConflictSession {
    source: DraftRecord;
    scopeEpoch:number;
    remoteContent: string | null;
    remoteVersion: string | null;
    result: string;
    resultRevision: number;
    recovery: DraftRecord;
}
export function validateConflictResult(path: string, content: string) { if (!/\.canvas$/i.test(path))
    return; const parsed = JSON.parse(content); if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges))
    throw new Error('Canvas requires nodes and edges arrays'); }
export function canDiff(content: string) { return new TextEncoder().encode(content).length <= 1024 * 1024 && content.split('\n').length <= 20000; }
export async function loadConflict(source: DraftRecord): Promise<ConflictSession> {
    const epoch=draftScopeEpoch();const scope=await loadDraftScope();assertDraftScope(source.scopeId,epoch);
    let remoteContent: string | null = null, remoteVersion: string | null = null;
    try {
        const remote = await api.read(source.path,scope);
        remoteContent = remote.content;
        remoteVersion = remote.version ?? null;
        if (!remoteVersion)
            throw new Error('Server did not return a content version');
    }
    catch (error) {
        if (!(error instanceof ApiError && error.status === 404))
            throw error;
    }
    assertDraftScope(source.scopeId,epoch);
    return { scopeEpoch:epoch, source, remoteContent, remoteVersion, result: source.content, resultRevision: 0, recovery: { ...source, writerId: source.writerId+':recovery:'+Date.now().toString(36)+Math.random().toString(36).slice(2), state: 'recovery', revision: 0 } };
}
export async function persistConflictResult(session: ConflictSession) { session.resultRevision++; session.recovery = { ...session.recovery, content: session.result, revision: session.resultRevision, updatedAt: Date.now() }; await putDraft(session.recovery); }
export async function saveConflictResult(session: ConflictSession, path = session.source.path, copy = false) {
    assertDraftScope(session.source.scopeId,session.scopeEpoch);
    const result = session.result;
    validateConflictResult(path, result);
    await persistConflictResult(session);
    const revision = session.resultRevision;
    if (session.remoteVersion === null && !copy)
        throw new Error('Original file was deleted. Save a separate copy.');
    assertDraftScope(session.source.scopeId,session.scopeEpoch);
    const response = await api.write(path, result, copy ? '' : session.remoteVersion!,session.source.scopeId);
    if (!response.version)
        throw new Error('Server did not return a content version');
    const cleanupErrors:string[]=[];
    for(const [key,rev] of [[session.source,session.source.revision],[session.recovery,revision]] as const){try{await deleteDraftIfRevision(key,rev);}catch(error){cleanupErrors.push(String(error));}}
    return {...response,content:result,cleanupWarning:cleanupErrors.length?'Server saved; local draft cleanup failed. '+cleanupErrors.join('; '):''};
}
