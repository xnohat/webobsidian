import type { ToolbarNode } from './config';
function clean(items: ToolbarNode[]): ToolbarNode[] {
    return items.filter((n, i) => n.type !== 'separator' || (i > 0 && i < items.length - 1 && items[i - 1].type !== 'separator'));
}
export function partitionToolbar(items: ToolbarNode[], widths: ReadonlyMap<string, number>, availableWidth: number, moreWidth: number, gap: number): {
    visible: ToolbarNode[];
    overflow: ToolbarNode[];
} {
    const size = (nodes: ToolbarNode[]) => nodes.reduce((sum, n) => sum + (widths.get(n.instanceId) ?? Infinity), 0) + Math.max(0, nodes.length - 1) * gap;
    if (size(items) <= availableWidth)
        return { visible: clean(items), overflow: [] };
    let count = 0;
    while (count < items.length && size(clean(items.slice(0, count + 1))) + gap + moreWidth <= availableWidth)
        count++;
    return { visible: clean(items.slice(0, count)), overflow: clean(items.slice(count)) };
}
