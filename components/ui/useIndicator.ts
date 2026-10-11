import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface IndicatorBox { left: number; width: number; top: number; height: number; ready: boolean }

/**
 * Measures the selected item inside a row so a single indicator (tab
 * underline, segmented thumb) can glide between items instead of jumping.
 * Items mark themselves with data-ind-key.
 */
export const useIndicator = <T extends HTMLElement>(activeKey: string) => {
  const containerRef = useRef<T>(null);
  const [box, setBox] = useState<IndicatorBox>({ left: 0, width: 0, top: 0, height: 0, ready: false });

  const measure = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const el = c.querySelector<HTMLElement>(`[data-ind-key="${CSS.escape(activeKey)}"]`);
    if (!el) { setBox(b => (b.ready ? { ...b, ready: false } : b)); return; }
    const next = { left: el.offsetLeft, width: el.offsetWidth, top: el.offsetTop, height: el.offsetHeight, ready: true };
    setBox(b => (b.left === next.left && b.width === next.width && b.top === next.top && b.height === next.height && b.ready ? b : next));
  }, [activeKey]);

  useLayoutEffect(() => {
    measure();
    const c = containerRef.current;
    if (!c || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(c);
    Array.from(c.children).forEach(ch => ro.observe(ch));
    return () => ro.disconnect();
  }, [measure]);

  return { containerRef, box };
};
