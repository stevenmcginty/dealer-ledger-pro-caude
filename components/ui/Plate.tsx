import React from 'react';
import { cx } from './cx';

/** "LK68TVN" / "lk68 tvn" -> "LK68 TVN" (current-style plates get their space back). */
export const formatReg = (reg: string): string => {
  const clean = reg.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(clean)) return `${clean.slice(0, 4)} ${clean.slice(4)}`;
  return reg.toUpperCase().trim().replace(/\s+/g, ' ');
};

/** Spoken form: letters one by one, digit runs as numbers. "L K 68 T V N". */
export const spokenReg = (reg: string): string =>
  (formatReg(reg).match(/[0-9]+|[A-Z]/g) || []).join(' ');

interface PlateProps {
  reg: string;
  /** White front plate. Default is the yellow rear plate, which is how cars are spotted. */
  front?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = {
  sm: 'h-6 px-1.5 text-xs border',
  md: 'h-7 px-2 text-sm border',
  lg: 'h-10 px-3 text-[1.375rem] border-2 rounded-[6px]',
};

/**
 * A UK number plate chip: mono, wide-tracked, plate yellow (or white), the
 * same in both themes because it's a physical object. Never mirrors in RTL.
 */
const Plate: React.FC<PlateProps> = ({ reg, front = false, size = 'md', className }) => (
  <span
    dir="ltr"
    role="img"
    aria-label={`Registration ${spokenReg(reg)}`}
    className={cx(
      'inline-grid flex-none place-items-center whitespace-nowrap rounded-chip border-plate-ink font-mono font-semibold uppercase leading-none tracking-[0.08em] text-plate-ink [unicode-bidi:isolate]',
      front ? 'bg-plate-white' : 'bg-plate-yellow',
      SIZE[size],
      className,
    )}
  >
    <span aria-hidden="true">{formatReg(reg)}</span>
  </span>
);

interface PlateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** A button inside the plate, e.g. "Look up". */
  action?: React.ReactNode;
  invalid?: boolean;
  className?: string;
}

/**
 * Registration entry drawn as the plate itself: big mono capitals on yellow.
 * Upper-cases as you type; the value you get back is upper-case.
 */
export const PlateInput = React.forwardRef<HTMLInputElement, PlateInputProps>(
  ({ action, invalid, className, onChange, ...props }, ref) => (
    <div
      dir="ltr"
      className={cx(
        'flex min-h-[56px] items-center rounded-control border-2 border-plate-ink bg-plate-yellow transition-shadow duration-quick ease-out',
        invalid ? 'shadow-[0_0_0_3px_rgb(var(--c-danger))]' : 'focus-within:shadow-[0_0_0_3px_rgb(var(--c-focus))]',
        className,
      )}
    >
      <input
        ref={ref}
        type="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={8}
        aria-invalid={invalid || undefined}
        onChange={e => {
          const caret = e.target.selectionStart;
          e.target.value = e.target.value.toUpperCase();
          if (caret !== null) e.target.setSelectionRange(caret, caret);
          onChange?.(e);
        }}
        className="min-w-0 flex-1 appearance-none border-0 bg-transparent px-3.5 py-2 text-center font-mono text-2xl font-semibold uppercase leading-none tracking-[0.12em] text-plate-ink placeholder:text-plate-ink/60 focus-visible:outline-none"
        {...props}
      />
      {action && <div className="m-1 flex-none [&>button]:min-h-[44px]">{action}</div>}
    </div>
  ),
);
PlateInput.displayName = 'PlateInput';

export default Plate;
