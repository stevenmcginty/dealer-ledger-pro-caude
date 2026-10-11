import React from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '../icons';
import { cx } from './cx';

interface SearchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  /** Names the field for screen readers (there is no visible label). */
  label: string;
  /** Desktop hint key shown at the end, e.g. "/". Pressing it focuses the field. */
  shortcut?: string;
  className?: string;
}

/**
 * Sunken search well: grey at rest, lifts to the surface with a focus ring
 * when active. Clear button appears once there's text; Esc clears too.
 */
const Search = React.forwardRef<HTMLInputElement, SearchProps>(
  ({ value, onChange, label, shortcut, className, placeholder = 'Search', onKeyDown, ...props }, ref) => {
    const inner = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inner.current as HTMLInputElement);

    React.useEffect(() => {
      if (!shortcut) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== shortcut || e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target as HTMLElement | null;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        e.preventDefault();
        inner.current?.focus();
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [shortcut]);

    return (
      <label
        className={cx(
          'flex min-h-[48px] items-center gap-2 rounded-control border border-transparent bg-surface-2 ps-3 text-ink-3',
          'transition-[background-color,border-color,box-shadow] duration-quick ease-out',
          'focus-within:border-focus focus-within:bg-surface focus-within:shadow-[0_0_0_1px_rgb(var(--c-focus))]',
          className,
        )}
      >
        <MagnifyingGlassIcon className="h-5 w-5 flex-none" />
        <input
          ref={inner}
          type="search"
          aria-label={label}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape' && value) { e.preventDefault(); e.stopPropagation(); onChange(''); }
            onKeyDown?.(e);
          }}
          className="h-11 min-w-0 flex-1 appearance-none border-0 bg-transparent text-base last:pe-3 text-ink placeholder:text-ink-3 placeholder:opacity-100 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
          {...props}
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => { onChange(''); inner.current?.focus(); }}
            className="group/clear -my-px grid h-12 w-12 flex-none place-items-center rounded-control text-ink-2 hover:text-ink focus-visible:outline-offset-[-3px]"
          >
            {/* 48px to tap; the drawn well is 40px so it sits inside the field. */}
            <span className="grid h-10 w-10 place-items-center rounded-control transition-colors duration-quick ease-out group-hover/clear:bg-surface-3">
              <XMarkIcon className="h-5 w-5" />
            </span>
          </button>
        ) : shortcut ? (
          <kbd className="me-3 hidden rounded-chip border border-line-strong px-1.5 py-0.5 font-mono text-xs text-ink-2 md:inline-block" aria-hidden="true">
            {shortcut}
          </kbd>
        ) : null}
      </label>
    );
  },
);
Search.displayName = 'Search';

export default Search;
