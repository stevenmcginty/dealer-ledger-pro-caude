import React from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from '../icons';
import { cx } from './cx';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

interface AlertProps {
  tone?: AlertTone;
  /** What happened, in a few words. */
  title?: React.ReactNode;
  /** What to do next. Links inside inherit the alert's ink. */
  children?: React.ReactNode;
  /** Buttons or links under the text. */
  actions?: React.ReactNode;
  /** Shows an X. Alerts are for things that stay until fixed, so use sparingly. */
  onDismiss?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

const TONE: Record<AlertTone, { box: string; Icon: React.ComponentType<{ className?: string }> }> = {
  info: { box: 'bg-info-soft text-info-ink border-info/60', Icon: InformationCircleIcon },
  success: { box: 'bg-success-soft text-success-ink border-success/60', Icon: CheckCircleIcon },
  warning: { box: 'bg-warning-soft text-warning-ink border-warning/60', Icon: ExclamationTriangleIcon },
  danger: { box: 'bg-danger-soft text-danger-ink border-danger/60', Icon: ExclamationCircleIcon },
};

/**
 * An inline message that stays until it's dealt with. Danger alerts are
 * announced at once (role="alert"); the rest wait politely.
 */
const Alert: React.FC<AlertProps> = ({ tone = 'info', title, children, actions, onDismiss, icon, className }) => {
  const { box, Icon } = TONE[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('flex gap-3 rounded-control border px-3.5 py-3 text-sm leading-5', box, className)}
    >
      <span className="mt-px flex-none [&_svg]:h-5 [&_svg]:w-5" aria-hidden="true">{icon || <Icon />}</span>
      <div className="min-w-0 flex-1 [&_a]:font-semibold [&_a]:text-inherit [&_a]:underline [&_a]:underline-offset-[3px]">
        {title && <p className="text-base font-bold leading-6">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        {actions && <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-my-3 -me-2.5 grid h-12 w-12 flex-none place-items-center rounded-control opacity-80 transition-[background-color,opacity] duration-quick ease-out hover:bg-surface/40 hover:opacity-100"
        >
          <XMarkIcon className="h-[18px] w-[18px]" />
        </button>
      )}
    </div>
  );
};

export default Alert;
