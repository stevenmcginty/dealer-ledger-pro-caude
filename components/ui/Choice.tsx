import React from 'react';
import { cx } from './cx';

/*
 * Checkbox, radio and switch share one shape: a real <input> (appearance
 * none, so keyboard and screen readers behave natively) that is the hit
 * area, with the mark drawn by its siblings. Inside a label row the whole
 * 48px row is the hit area; a bare control (a table row) still gets a
 * 48 x 48 input centred on its mark.
 */

export interface ChoiceBaseProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Words beside the control. Leave out and pass aria-label for a bare control (table rows). */
  label?: React.ReactNode;
  /** Smaller grey line under the label. */
  description?: React.ReactNode;
  error?: boolean;
  /** Classes for the outer row. */
  className?: string;
}

const Row: React.FC<{ label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean; className?: string; mark: React.ReactNode }> = ({
  label, description, disabled, className, mark,
}) =>
  label ? (
    <label className={cx('flex min-h-[48px] items-center gap-3 text-base leading-snug text-ink', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', className)}>
      {mark}
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description && <span className="mt-0.5 block text-sm leading-5 text-ink-3">{description}</span>}
      </span>
    </label>
  ) : (
    <span className={cx('inline-grid', disabled && 'opacity-60', className)}>{mark}</span>
  );

/** The invisible input. Labelled: covers the mark. Bare: a 48 x 48 square centred on it. */
const hitArea = (bare: boolean) =>
  cx(
    'peer absolute z-[1] m-0 cursor-pointer appearance-none rounded-none border-0 bg-transparent opacity-0 disabled:cursor-not-allowed focus-visible:outline-none',
    bare ? 'start-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2' : 'inset-0 h-full w-full',
  );

/** Focus ring on the drawn mark, since the input itself is invisible. */
const ring = 'peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus';

/** Unchecked border: 3:1 against the surface; danger when in error. */
const edge = (error?: boolean) => (error ? 'border-danger' : 'border-line-strong peer-hover:border-ink-2');

export const Checkbox = React.forwardRef<HTMLInputElement, ChoiceBaseProps & { indeterminate?: boolean }>(
  ({ label, description, error, className, indeterminate, disabled, ...props }, ref) => {
    const inner = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inner.current as HTMLInputElement);
    React.useEffect(() => { if (inner.current) inner.current.indeterminate = !!indeterminate; }, [indeterminate]);
    return (
      <Row label={label} description={description} disabled={disabled} className={className} mark={
        <span className="relative grid h-[22px] w-[22px] flex-none place-items-center">
          <input
            ref={inner}
            type="checkbox"
            disabled={disabled}
            aria-invalid={error || undefined}
            className={hitArea(!label)}
            {...props}
          />
          <span
            aria-hidden="true"
            className={cx(
              'pointer-events-none absolute inset-0 rounded-chip border-2 bg-surface transition-[background-color,border-color] duration-quick ease-out',
              'peer-checked:border-accent peer-checked:bg-accent peer-indeterminate:border-accent peer-indeterminate:bg-accent',
              edge(error),
              ring,
            )}
          />
          <svg viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none relative h-3.5 w-3.5 scale-50 text-on-accent opacity-0 transition-[transform,opacity] duration-quick ease-out peer-checked:scale-100 peer-checked:opacity-100 peer-indeterminate:hidden">
            <path d="m3 8.5 3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span aria-hidden="true" className="pointer-events-none absolute hidden h-[2.5px] w-2.5 rounded-full bg-on-accent peer-indeterminate:block" />
        </span>
      } />
    );
  },
);
Checkbox.displayName = 'Checkbox';

export const Radio = React.forwardRef<HTMLInputElement, ChoiceBaseProps>(
  ({ label, description, error, className, disabled, ...props }, ref) => (
    <Row label={label} description={description} disabled={disabled} className={className} mark={
      <span className="relative grid h-[22px] w-[22px] flex-none place-items-center">
        <input
          ref={ref}
          type="radio"
          disabled={disabled}
          aria-invalid={error || undefined}
          className={hitArea(!label)}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute inset-0 rounded-full border-2 bg-surface transition-[border-color] duration-quick ease-out peer-checked:border-accent',
            edge(error),
            ring,
          )}
        />
        <span aria-hidden="true" className="pointer-events-none relative h-2.5 w-2.5 scale-0 rounded-full bg-accent transition-transform duration-quick ease-out peer-checked:scale-100" />
      </span>
    } />
  ),
);
Radio.displayName = 'Radio';

/** Takes effect now (settings). For "part of a form you save", use Checkbox. */
export const Switch = React.forwardRef<HTMLInputElement, ChoiceBaseProps>(
  ({ label, description, error, className, disabled, ...props }, ref) => (
    <Row label={label} description={description} disabled={disabled} className={className} mark={
      <span className="relative inline-block h-7 w-12 flex-none">
        {/* 48 x 48: the 28px track plus 10px above and below. */}
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          disabled={disabled}
          aria-invalid={error || undefined}
          className="peer absolute inset-x-0 -top-2.5 z-[1] m-0 h-12 w-12 cursor-pointer appearance-none border-0 bg-transparent opacity-0 disabled:cursor-not-allowed focus-visible:outline-none"
          {...props}
        />
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute inset-0 rounded-full border-2 bg-surface-3 transition-[background-color,border-color] duration-quick ease-out',
            'peer-checked:border-accent peer-checked:bg-accent',
            error ? 'border-danger' : 'border-line-strong',
            ring,
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute start-1 top-1 h-5 w-5 rounded-full bg-ink-2 shadow-e1 transition-[transform,background-color] duration-base ease-sheet peer-checked:bg-on-accent peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5 peer-active:scale-95"
        />
      </span>
    } />
  ),
);
Switch.displayName = 'Switch';
