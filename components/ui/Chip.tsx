import React from 'react';
import { cx } from './cx';

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: React.ReactNode;
  /** On / off. A chip is a toggle button (aria-pressed). */
  selected?: boolean;
  /** Small mono number after the label ("For sale 11"). */
  count?: number;
  /** Leading icon, e.g. a funnel on the "Filters" chip. */
  icon?: React.ReactNode;
}

/**
 * A filter chip: a pill toggle for a quick cut of a list. Pressed = ink
 * fill (shape and contrast change, not colour alone). 48px tall on phones,
 * 40px on a wide screen with a mouse.
 */
const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ children, selected = false, count, icon, className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-[48px] min-w-[48px] flex-none select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold leading-none',
        'md:[@media(pointer:fine)]:min-h-[40px]',
        'transition-[background-color,border-color,color,transform] duration-quick ease-out active:scale-[.97] active:duration-press',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        '[&_svg]:h-4 [&_svg]:w-4',
        selected
          ? 'border-ink bg-ink text-surface hover:bg-ink-2 hover:border-ink-2'
          : 'border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-3',
        className,
      )}
      {...props}
    >
      {icon && <span className="inline-flex flex-none" aria-hidden="true">{icon}</span>}
      {children}
      {count !== undefined && <span className="num text-xs opacity-[.85]">{count}</span>}
    </button>
  ),
);
Chip.displayName = 'Chip';

export interface FilterChipOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  count?: number;
}

interface FilterChipsProps<V extends string = string> {
  options: FilterChipOption<V>[];
  /** The one cut that's on. */
  value: V;
  onChange: (value: V) => void;
  /** Names the row for screen readers, e.g. "Filter stock". */
  ariaLabel: string;
  /** After the quick chips: usually a "Filters" chip that opens a sheet. */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * 3 to 5 quick cuts of a list in one row that scrolls sideways on a phone.
 * Anything more goes in a filter sheet behind the trailing "Filters" chip.
 */
function FilterChips<V extends string = string>({ options, value, onChange, ariaLabel, trailing, className }: FilterChipsProps<V>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        '-m-1.5 flex max-w-[calc(100%+12px)] gap-2 overflow-x-auto overscroll-x-contain p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {options.map(o => (
        <Chip key={o.value} selected={o.value === value} count={o.count} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
      {trailing}
    </div>
  );
}

export { FilterChips };
export default Chip;
