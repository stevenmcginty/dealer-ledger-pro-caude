import React from 'react';
import { CheckIcon } from '../icons';
import { cx } from './cx';

export interface StepperStep {
  label: string;
  /** Marks a step that needs fixing; say what in the label ("Purchase · 1 error"). */
  error?: boolean;
}

interface StepperProps {
  steps: StepperStep[];
  /** Index of the current step (0-based). Earlier steps count as done. */
  current: number;
  /** bar = phone segment bar; dots = numbered desktop stepper. */
  variant?: 'bar' | 'dots';
  ariaLabel?: string;
  /** Lets people tap a finished step to go back. */
  onStepClick?: (index: number) => void;
  className?: string;
}

type State = 'done' | 'current' | 'todo' | 'error';
const stateOf = (i: number, current: number, step: StepperStep): State =>
  step.error ? 'error' : i < current ? 'done' : i === current ? 'current' : 'todo';

/** Progress through a short flow (5 steps at most). */
const Stepper: React.FC<StepperProps> = ({ steps, current, variant = 'bar', ariaLabel = 'Progress', onStepClick, className }) => {
  const clickable = (i: number, s: State) => !!onStepClick && s === 'done' && i !== current;

  if (variant === 'bar') {
    return (
      <ol aria-label={ariaLabel} className={cx('relative m-0 flex list-none gap-1.5 p-0', className)}>
        {steps.map((step, i) => {
          const s = stateOf(i, current, step);
          const content = (
            <>
              <span aria-hidden="true" className="relative block h-1 overflow-hidden rounded-sm bg-surface-3">
                <span
                  className={cx(
                    'absolute inset-y-0 start-0 rounded-sm transition-[width] duration-base ease-sheet',
                    s === 'error' ? 'w-full bg-danger' : s === 'done' ? 'w-full bg-accent' : s === 'current' ? 'w-1/2 bg-accent' : 'w-0 bg-accent',
                  )}
                />
              </span>
              <span className="block truncate">{step.label}</span>
              <span className="sr-only">{s === 'done' ? ' (done)' : s === 'error' ? ' (needs fixing)' : ''}</span>
            </>
          );
          return (
            <li
              key={i}
              aria-current={s === 'current' ? 'step' : undefined}
              className={cx(
                'flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-semibold',
                s === 'error' ? 'text-danger' : s === 'current' ? 'text-ink' : s === 'done' ? 'text-ink-2' : 'text-ink-3',
              )}
            >
              {clickable(i, s) ? (
                <button type="button" onClick={() => onStepClick!(i)} className="flex min-h-[48px] flex-col gap-1.5 rounded-chip text-start hover:text-ink">
                  {content}
                </button>
              ) : content}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol aria-label={ariaLabel} className={cx('relative m-0 flex list-none items-center p-0', className)}>
      {steps.map((step, i) => {
        const s = stateOf(i, current, step);
        const last = i === steps.length - 1;
        const dot = (
          <span
            className={cx(
              'num grid h-7 w-7 flex-none place-items-center rounded-full border-2 text-sm font-semibold transition-[background-color,border-color,box-shadow] duration-base ease-out',
              s === 'done' && 'border-accent bg-accent text-on-accent',
              s === 'current' && 'border-accent bg-surface text-accent-text shadow-[0_0_0_3px_rgb(var(--c-accent-soft))]',
              s === 'todo' && 'border-line-strong bg-surface text-ink-2',
              s === 'error' && 'border-danger bg-surface text-danger',
            )}
            aria-hidden="true"
          >
            {s === 'done' ? <CheckIcon className="h-4 w-4 [stroke-width:2.5]" /> : s === 'error' ? '!' : i + 1}
          </span>
        );
        const label = (
          <span className="truncate">{step.label}</span>
        );
        return (
          <li
            key={i}
            aria-current={s === 'current' ? 'step' : undefined}
            className={cx(
              'flex min-w-0 items-center gap-2.5 text-sm font-semibold',
              !last && 'flex-1',
              s === 'error' ? 'text-danger' : s === 'current' ? 'text-ink' : s === 'done' ? 'text-ink-2' : 'text-ink-3',
            )}
          >
            {clickable(i, s) ? (
              <button type="button" onClick={() => onStepClick!(i)} className="flex min-h-[48px] min-w-0 items-center gap-2.5 rounded-control hover:text-ink">
                {dot}{label}
              </button>
            ) : (<>{dot}{label}</>)}
            <span className="sr-only">{s === 'done' ? ' (done)' : s === 'error' ? ' (needs fixing)' : ''}</span>
            {!last && <span aria-hidden="true" className={cx('mx-2.5 h-0.5 min-w-[16px] flex-1 rounded-full transition-colors duration-base', s === 'done' ? 'bg-accent' : 'bg-line')} />}
          </li>
        );
      })}
    </ol>
  );
};

export default Stepper;
