import React from 'react';
import { controlFrame, controlInput, cx, eyebrow } from '../ui/cx';

/*
 * Local layout pieces for the Settings pages. Settings is a stack of flat
 * panels: one hairline box per subject, its parts divided by hairlines, never
 * a card inside a card. Candidates for components/ui once D1 wants them.
 */

/** One subject: a flat surface on a hairline, its sections split by hairlines. */
export const Panel: React.FC<{ children: React.ReactNode; className?: string; ariaLabel?: string }> = ({ children, className, ariaLabel }) => (
    <section aria-label={ariaLabel} className={cx('divide-y divide-line rounded-card border border-line bg-surface', className)}>
        {children}
    </section>
);

interface PanelSectionProps {
    title?: React.ReactNode;
    description?: React.ReactNode;
    /** Buttons or a status chip at the end of the heading row. */
    action?: React.ReactNode;
    /** Leading glyph tile beside the title. */
    icon?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    /** Danger sections get a red title. */
    tone?: 'danger';
}

/** A part of a panel: heading row (title, one grey line, action), then the content. */
export const PanelSection: React.FC<PanelSectionProps> = ({ title, description, action, icon, children, className, tone }) => (
    <div className={cx('p-4 sm:p-5', className)}>
        {(title || action) && (
            <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                {icon && <IconTile>{icon}</IconTile>}
                <div className="min-w-0 flex-1 basis-48">
                    {title && <h3 className={cx('text-base font-bold leading-6', tone === 'danger' ? 'text-danger' : 'text-ink')}>{title}</h3>}
                    {description && <p className="mt-0.5 max-w-[62ch] text-sm leading-5 text-ink-3">{description}</p>}
                </div>
                {action && <div className={cx('flex flex-none flex-wrap items-center gap-2', !!icon && 'max-sm:ms-14')}>{action}</div>}
            </div>
        )}
        {React.Children.toArray(children).length > 0 && <div className={title || action ? 'mt-4' : ''}>{children}</div>}
    </div>
);

/** A grey 40px tile holding a 20px glyph. */
export const IconTile: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <span aria-hidden="true" className={cx('grid h-10 w-10 flex-none place-items-center rounded-control bg-surface-2 text-ink-2 [&_svg]:h-5 [&_svg]:w-5', className)}>
        {children}
    </span>
);

/** Small caps label over a group of fields inside a form. */
export const GroupLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <p className={cx(eyebrow, className)}>{children}</p>
);

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    /** Set the text in mono (codes, IDs). */
    mono?: boolean;
}

/** A multi-line field on the shared control frame. Pair with <Field>. */
export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(({ className, mono, disabled, ...props }, ref) => (
    <div className={controlFrame({ disabled })}>
        <textarea
            ref={ref}
            disabled={disabled}
            className={cx(controlInput, 'min-h-[96px] resize-y', mono && 'font-mono text-sm', className)}
            {...props}
        />
    </div>
));
TextArea.displayName = 'TextArea';

/** A thin determinate bar. */
export const ProgressBar: React.FC<{ value: number; label: string }> = ({ value, label }) => (
    <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
    >
        <div className="h-full rounded-full bg-accent transition-[width] duration-base ease-out" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
);

/** A quiet button that turns red on hover: for "Delete" next to other actions. */
export const dangerQuiet =
    'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-5 text-base font-semibold text-danger ' +
    'transition-[background-color,color,transform] duration-quick ease-out hover:bg-danger-soft hover:text-danger-ink active:scale-[.97] active:duration-press ' +
    'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-2 disabled:text-ink-3 disabled:active:scale-100 [&_svg]:h-5 [&_svg]:w-5';

/** Heroicons-style outline glyphs Settings needs that components/icons.tsx lacks. */
export const SwatchGlyph: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
        <path d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" />
    </svg>
);

export const GlobeGlyph: React.FC<{ className?: string }> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
        <path d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
);
