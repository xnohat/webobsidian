/** Attachments do not add MiniSearch terms, so only indexed notes set the limit. */
export function needsMaintenance(changes:number,indexedNotes:number,builtAt:number,now:number):boolean {
  return changes>=Math.max(500,Math.ceil(indexedNotes*.2)) || (changes>0&&now-builtAt>=86400000);
}
