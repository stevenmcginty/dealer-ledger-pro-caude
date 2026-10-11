import React from 'react';
import { cx } from './cx';
import { useIndicator } from './useIndicator';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  /** default = underline tabs; pills = a compact segmented strip. */
  variant?: 'default' | 'pills';
  className?: string;
  /** Names the tab list for screen readers. */
  ariaLabel?: string;
  /** Prefix for tab ids, so a panel can use aria-labelledby={`${idPrefix}-${tabId}`}. */
  idPrefix?: string;
}

/**
 * Switches between views of the same thing. Roving tabindex: one tab stop,
 * arrow keys move and select, Home/End jump. The underline glides between
 * tabs (a fade under reduced motion).
 */
const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  className = '',
  ariaLabel = 'Views',
  idPrefix,
}) => {
  const { containerRef, box } = useIndicator<HTMLDivElement>(activeTab);
  const autoPrefix = React.useId().replace(/:/g, '');
  const prefix = idPrefix || `tabs${autoPrefix}`;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex(t => t.id === activeTab);
    let next = -1;
    // Arrows follow reading direction, so RTL flips them.
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd) next = (i + 1) % tabs.length;
    else if (e.key === back) next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = tabs[next].id;
    onChange(id);
    containerRef.current?.querySelector<HTMLElement>(`[data-ind-key="${CSS.escape(id)}"]`)?.focus();
  };

  const pills = variant === 'pills';

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cx(
        'relative flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        pills
          ? 'inline-flex max-w-full gap-[3px] overflow-x-auto rounded-control border border-line bg-surface-2 p-[3px]'
          : 'gap-1 overflow-x-auto border-b border-line',
        className,
      )}
    >
      {box.ready && (
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute transition-[left,width] duration-base ease-sheet',
            pills
              ? 'rounded-[6px] bg-surface shadow-e1 ring-1 ring-line'
              : 'bottom-0 h-[3px] rounded-t-[3px] bg-accent',
          )}
          style={pills
            ? { left: box.left, width: box.width, top: box.top, height: box.height }
            : { left: box.left + 8, width: Math.max(0, box.width - 16) }}
        />
      )}
      {tabs.map(tab => {
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            id={`${prefix}-${tab.id}`}
            data-ind-key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cx(
              'relative z-[1] inline-flex flex-none items-center gap-1.5 whitespace-nowrap text-sm font-semibold leading-none transition-colors duration-quick ease-out [&_svg]:h-5 [&_svg]:w-5',
              pills
                ? cx('min-h-[48px] min-w-[48px] md:[@media(pointer:fine)]:min-h-[40px] rounded-[6px] px-3.5', selected ? 'text-ink' : 'text-ink-2 hover:text-ink')
                : cx('min-h-[48px] min-w-[48px] justify-center px-3', selected ? 'text-accent-text' : 'text-ink-3 hover:text-ink'),
            )}
          >
            {tab.icon && <span className="flex flex-none" aria-hidden="true">{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cx(
                  'num min-w-[20px] rounded-full px-[5px] text-center text-xs font-semibold leading-[18px]',
                  !selected ? 'bg-surface-2 text-ink-2' : pills ? 'bg-surface-3 text-ink' : 'bg-accent-soft text-accent-soft-ink',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;
