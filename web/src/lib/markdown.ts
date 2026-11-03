export {renderMarkdown,renderNoteEmbed,type RenderOpts} from '../../../server/src/services/markdownTransclusion';

/** Build an outline (headings) for the outline panel. */
export function outline(src: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  for (const line of src.split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) out.push({ level: m[1].length, text: m[2] });
  }
  return out;
}
