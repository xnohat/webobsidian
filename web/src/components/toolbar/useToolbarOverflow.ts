import { useLayoutEffect, useRef, useState } from 'react';
import type { ToolbarNode } from '../../lib/toolbar/config';
import { partitionToolbar } from '../../lib/toolbar/overflow';
/** Measures inert presentation copies; the hidden row never mounts editor services. */
export function useToolbarOverflow(items: ToolbarNode[], enabled: boolean, gap: number) {
    const containerRef = useRef<HTMLSpanElement>(null), measureRef = useRef<HTMLSpanElement>(null);
    const [layout, setLayout] = useState<{
        visible: ToolbarNode[];
        overflow: ToolbarNode[];
    }>({ visible: [], overflow: items });
    useLayoutEffect(() => {
        if (!enabled)
            return;
        const container = containerRef.current, measure = measureRef.current;
        if (!container || !measure)
            return;
        const update = () => {
            const widths = new Map<string, number>();
            for (const child of Array.from(measure.children))
                if (child instanceof HTMLElement && child.dataset.measureId)
                    widths.set(child.dataset.measureId, child.getBoundingClientRect().width);
            const more = measure.querySelector<HTMLElement>('[data-measure-more]');
            const handle=measure.querySelector<HTMLElement>('[data-measure-fixed]');
            const available=container.clientWidth-(handle?handle.getBoundingClientRect().width+gap:0);
            const next = partitionToolbar(items, widths, available, more?.getBoundingClientRect().width ?? 30, gap);
            setLayout(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
        };
        const observer = new ResizeObserver(update);
        observer.observe(container);
        if (container.parentElement)
            observer.observe(container.parentElement);
        observer.observe(measure);
        for (const child of Array.from(measure.children))
            observer.observe(child);
        document.fonts?.addEventListener('loadingdone', update);
        update();
        return () => { observer.disconnect(); document.fonts?.removeEventListener('loadingdone', update); };
    }, [items, enabled, gap]);
    return { containerRef, measureRef, ...(enabled ? layout : { visible: items, overflow: [] }) };
}
