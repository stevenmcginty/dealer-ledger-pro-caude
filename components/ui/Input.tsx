import React from 'react';
import Field from './Field';
import { controlFrame, controlInput, cx } from './cx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Leading icon inside the box. */
  icon?: React.ReactNode;
  /** Text before the value, e.g. "£". Set in mono. */
  affix?: React.ReactNode;
  /** Something at the end of the box: a unit, an icon, a small button. */
  trailing?: React.ReactNode;
  /** Classes for the outer wrapper (width, margins). */
  wrapperClassName?: string;
  /** Adds "(optional)" after the label. */
  optional?: boolean;
}

/** A labelled text field on the shared control frame. */
const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  icon,
  affix,
  trailing,
  wrapperClassName,
  optional,
  className = '',
  id,
  disabled,
  ...props
}, ref) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <Field label={label} htmlFor={inputId} hint={hint} error={error} optional={optional} className={cx('w-full', wrapperClassName)}>
      {ids => (
        <div className={controlFrame({ error: !!error, disabled })}>
          {icon && <span className="flex flex-none ps-3.5 text-ink-3 [&_svg]:h-5 [&_svg]:w-5" aria-hidden="true">{icon}</span>}
          {affix && <span className="num flex-none ps-3.5 text-base font-semibold text-ink-2" aria-hidden="true">{affix}</span>}
          <input
            ref={ref}
            id={ids.id}
            disabled={disabled}
            aria-invalid={ids.invalid || undefined}
            aria-describedby={ids.describedBy}
            className={cx(controlInput, (icon || affix) ? 'ps-2' : null, className)}
            {...props}
          />
          {trailing && <span className="flex flex-none items-center pe-3 text-ink-3">{trailing}</span>}
        </div>
      )}
    </Field>
  );
});
Input.displayName = 'Input';

export default Input;
