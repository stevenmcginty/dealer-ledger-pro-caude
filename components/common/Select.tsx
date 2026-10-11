import React from 'react';
import { ChevronDownIcon } from '../icons';
import { controlFrame, cx } from '../ui/cx';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
  /** Red frame; pair with a Field error message. */
  error?: boolean;
}

/**
 * Native <select> on the shared control frame: best on phones, keyboard and
 * screen readers work as the platform intends. For long or growing lists use
 * a combobox instead.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, children, error, disabled, ...props }, ref) => (
    <div className={cx(controlFrame({ error: error || props['aria-invalid'] === true || props['aria-invalid'] === 'true', disabled }), wrapperClassName)}>
      <select
        ref={ref}
        disabled={disabled}
        {...props}
        className={cx(
          'block w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-[inherit] border-0 bg-transparent py-3 ps-3.5 pe-11 text-base leading-snug text-ink',
          'focus-visible:outline-none disabled:cursor-not-allowed disabled:text-ink-3',
          '[&>option]:bg-surface [&>option]:text-ink',
          className,
        )}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute end-3 h-5 w-5 text-ink-2" />
    </div>
  ),
);
Select.displayName = 'Select';

export default Select;
