import React from 'react';
import { IconButton } from '../ui';
import { cx } from '../ui/cx';
import { XMarkIcon } from '../icons';

/*
 * Header, body and footer for content that draws its own chrome inside
 * common/Modal (the ModalManager passes no title or footer). They copy the
 * Modal's own title and footer so every sheet in Sell reads the same:
 * 22px bold title, one grey line, close on the end; actions pinned under a
 * hairline, full width on phones.
 */

export const SheetHeader: React.FC<{
    title: React.ReactNode;
    description?: React.ReactNode;
    onClose?: () => void;
    /** Something before the title: a back button, a plate. */
    leading?: React.ReactNode;
    closeLabel?: string;
}> = ({ title, description, onClose, leading, closeLabel = 'Close' }) => (
    <div className="flex flex-none items-start gap-3 px-5 pb-3 pt-2 sm:pt-5">
        {leading && <div className="-ms-2 -mt-1 flex-none">{leading}</div>}
        <div className="min-w-0 flex-1 pt-1.5">
            <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">{title}</h2>
            {description && <div className="mt-1 text-sm leading-5 text-ink-2">{description}</div>}
        </div>
        {onClose && <IconButton label={closeLabel} icon={<XMarkIcon />} onClick={onClose} className="-me-2 -mt-1" />}
    </div>
);

export const SheetBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1', className)}>{children}</div>
);

export const SheetFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={cx('flex flex-none flex-wrap justify-end gap-2 border-t border-line bg-surface px-4 py-3 sm:px-5 [&>*]:flex-1 sm:[&>*]:flex-none', className)}>
        {children}
    </div>
);

/** The flex column that lets the body scroll while header and footer stay put. */
export const SheetFrame: React.FC<{ children: React.ReactNode; className?: string; as?: 'div' | 'form'; onSubmit?: React.FormEventHandler; id?: string }> = ({
    children, className, as: Tag = 'div', onSubmit, id,
}) => (
    <Tag id={id} onSubmit={onSubmit as any} className={cx('flex min-h-0 w-full flex-1 flex-col', className)}>
        {children}
    </Tag>
);
