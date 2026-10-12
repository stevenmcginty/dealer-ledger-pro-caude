import React from 'react';
import { cx } from './cx';
import { useIndicator } from './useIndicator';

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedProps<V extends string = string> {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Names the group for screen readers. */
  ariaLabel: string;
  /** Stretch to the container, segments share the width. */
  full?: boolean;
  className?: string;
}

/**
 * Sets a mode (Comfortable / Compact, Month / Quarter). A radiogroup: one
 * tab stop, arrows move and select. The raised thumb slides on --ease-sheet.
 */
function Segmented<V extends string = string>({ options, value, onChange, ariaLabel, full = false, className }: SegmentedProps<V>) {
  const { containerRef, box } = useIndicator<HTMLDivElement>(value);
  const enabled = options.filter(o => !o.disabled);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = enabled.findIndex(o => o.value === value);
    let next = -1;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd || e.key === 'ArrowDown') next = (i + 1) % enabled.length;
    else if (e.key === back || e.key === 'ArrowUp') next = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const v = enabled[next].value;
    onChange(v);
    containerRef.current?.querySelector<HTMLElement>(`[data-ind-key="${CSS.escape(v)}"]`)?.focus();
  };

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cx(
        'relative gap-[3px] rounded-control border border-line bg-surface-2 p-[3px]',
        full ? 'flex w-full' : 'inline-flex max-w-full',
        className,
      )}
    >
      {box.ready && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[6px] bg-accent-soft shadow-e1 ring-1 ring-accent/60 transition-[left,width] duration-base ease-sheet"
          style={{ left: box.left, width: box.width, top: box.top, height: box.height }}
        />
      )}
      {options.map(o => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            data-ind-key={o.value}
            aria-checked={checked}
            disabled={o.disabled}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative z-[1] min-h-[48px] min-w-[48px] md:[@media(pointer:fine)]:min-h-[40px] whitespace-nowrap rounded-[6px] px-3.5 text-sm font-semibold leading-none transition-colors duration-quick ease-out',
              'disabled:cursor-not-allowed disabled:text-ink-3 disabled:opacity-60',
              full && 'flex-1',
              checked ? 'text-accent-soft-ink' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
