import { api } from './api';
import {useStore,draftScopeEpoch,loadDraftScope} from './store';
import { confirmDialog } from './confirm';
import type { ImageDeleteRequest } from './livePreview';

export async function deleteEmbeddedImage({ target, kind,view: v, remove }: ImageDeleteRequest): Promise<void> {
  const initial = useStore.getState();
  const note = initial.activePath ?? '';
  const originalDoc = v.state.doc;const initialScopeEpoch=draftScopeEpoch();
  // Async resolution and confirmation can outlive navigation or a lock-mode change.
  const mayEdit = () => {
    const current = useStore.getState();
    return draftScopeEpoch()===initialScopeEpoch&&!!note && current.activePath === note && !current.locked && current.viewMode !== 'reading'
      && !v.state.readOnly && v.state.doc.eq(originalDoc);
  };
  if (!mayEdit()) return;
  const scope=await loadDraftScope();if(!mayEdit())return;
  const { notify, loadTree } = useStore.getState();
  const file = target ? await (kind==='markdown'?api.resolve(target,note,'markdown'):api.resolveAttachment(target, note)).then((r) => r.path).catch(() => null) : null;
  if (!mayEdit()) return;
  if (!file) {
    remove(); // web URL / missing file → only the reference can go
    return;
  }
  let referenceCheck:Awaited<ReturnType<typeof api.references>>;
  try{referenceCheck=await api.references(file,note,v.state.doc.toString());}catch{notify('Could not check image references. The image and file were kept. Try again.');return;}
  const refs=referenceCheck.references;
  if (!mayEdit()) return;
  const inThisNote=(referenceCheck.sourceReferences??0)>1;
  // Native confirm() is blocked or silently auto-cancelled in embedded browsers (the click
  // then does nothing), so use the in-app dialog.
  if (refs.length || inThisNote) {
    const where = refs.length
      ? `${refs.length} other note${refs.length > 1 ? 's' : ''} (${refs.slice(0, 3).join(', ')}${refs.length > 3 ? ', …' : ''})`
      : 'elsewhere in this note';
    const ok = await confirmDialog(`"${file}" is also used in ${where}.`, {
      detail: 'Remove the image from this note only? The file will be kept.',
      confirmLabel: 'Remove from this note',
    });
    if (ok && mayEdit()) remove();
    return;
  }
  const permanent=referenceCheck.deleteMode==='permanent';
  const ok = await confirmDialog(permanent?`Remove this image and permanently delete "${file}"?`:`Remove this image and move "${file}" to trash?`, {
    detail: permanent?'This permanently deletes the unused file.':'The unused file will be moved to the vault trash and can be restored.',
    confirmLabel: 'Delete',
    danger: permanent,
  });
  if (!ok || !mayEdit()) return;
  remove();
  try {
    const removedDoc=v.state.doc;
    await useStore.getState().save();
    if(useStore.getState().activePath!==note||!v.state.doc.eq(removedDoc))return;
    const saved=await api.read(note);
    if(saved.content!==removedDoc.toString()||!saved.version)throw Error('The note changed. Attachment kept.');
    const result=await api.deleteAttachment(note,file,saved.version,scope,referenceCheck.deleteMode??'trash');
    notify(result.outcome==='kept'?'Image removed; the shared file was kept.':result.outcome==='trashed'?'Image moved to trash.':'Unused image permanently deleted.');
    await loadTree();

  } catch (e: any) {
    notify('The file was kept: '+e.message);
  }
}
