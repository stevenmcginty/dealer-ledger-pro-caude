import React from 'react';
import { ExclamationCircleIcon } from '../icons';
import { cx } from './cx';

export interface FieldProps {
  /** Visible label, always above the control. */
  label?: React.ReactNode;
  /** id of the control; the label points at it. Made up if left out. */
  htmlFor?: string;
  /** Under the control, in grey. Hidden while there is an error. */
  hint?: React.ReactNode;
  /** What's wrong and how to fix it. Shown with an icon, not colour alone. */
  error?: React.ReactNode;
  /** Adds "(optional)" after the label. */
  optional?: boolean;
  className?: string;
  /**
   * The control. A single element gets id, aria-invalid and aria-describedby
   * wired in unless it already has them. A function gets the ids instead.
   */
  children: React.ReactNode | ((ids: FieldIds) => React.ReactNode);
}

export interface FieldIds {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

/** Label + control + hint/error, stacked with the package's 6px rhythm. */
const Field: React.FC<FieldProps> = ({ label, htmlFor, hint, error, optional, className, children }) => {
  const autoId = React.useId();
  const id = htmlFor || `f${autoId.replace(/:/g, '')}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const invalid = Boolean(error);
  const describedBy = invalid ? errorId : hint ? hintId : undefined;
  const ids: FieldIds = { id, describedBy, invalid };

  let control: React.ReactNode;
  if (typeof children === 'function') {
    control = children(ids);
  } else if (React.isValidElement(children)) {
    const el = children as React.ReactElement<Record<string, unknown>>;
    control = React.cloneElement(el, {
      id: el.props.id ?? id,
      'aria-invalid': el.props['aria-invalid'] ?? (invalid || undefined),
      'aria-describedby': el.props['aria-describedby'] ?? describedBy,
    });
  } else {
    control = children;
  }

  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-semibold leading-5 text-ink">
          {label}
          {optional && <span className="font-normal text-ink-3"> (optional)</span>}
        </label>
      )}
      {control}
      {invalid ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-semibold leading-5 text-danger">
          <ExclamationCircleIcon className="mt-px h-[18px] w-[18px] flex-none" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm leading-5 text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
};

export default Field;
