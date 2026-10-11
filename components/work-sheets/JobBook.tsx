import React, { useId, useState } from 'react';
import { EditIcon, TrashIcon, EllipsisVerticalIcon } from '../icons';
import { Button, IconButton, Plate } from '../ui';
import { cx, eyebrow } from '../ui/cx';
import { formatDate } from '../../utils/helpers';

/** "10 Oct" this year, "29 Sep 25" before: the phone meta line has no room for a full date. */
const shortDate = (ymd: string): string => {
    if (!ymd) return '';
    const sameYear = ymd.slice(0, 4) === String(new Date().getFullYear());
    return formatDate(ymd, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: '2-digit' });
};

/*
 * The workshop job book: one ruled list shared by work sheets, internal jobs
 * and job invoices. Phone: two-line rows, actions behind a "More" toggle that
 * opens in place. Desktop (lg): the same rows line up as ledger columns
 * (No. · Date · Vehicle/Customer · Detail · Status · Amount) under a header,
 * and Edit / Delete sit visibly on the end.
 */

// Column grid used by the header and every row at lg. Two shapes: with and
// without a status column. Static strings so Tailwind can see them.
const COLS = {
    status: 'lg:grid-cols-[5rem_7.5rem_minmax(0,1.6fr)_minmax(0,1fr)_7.5rem_7rem]',
    plain: 'lg:grid-cols-[5rem_7.5rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem]',
};

type Shape = keyof typeof COLS;

interface JobBookProps {
    /** Names the list for screen readers. */
    label: string;
    /** Column headings shown on desktop. */
    head: { primary: string; secondary: string; status?: string; amount: string };
    children: React.ReactNode;
}

const JobBookShape = React.createContext<Shape>('plain');

export const JobBook: React.FC<JobBookProps> = ({ label, head, children }) => {
    const shape: Shape = head.status !== undefined ? 'status' : 'plain';
    return (
        <JobBookShape.Provider value={shape}>
            <div className="overflow-hidden rounded-card border border-line bg-surface">
                <div aria-hidden="true" className="hidden items-center border-b border-line-strong bg-surface-2 lg:flex">
                    <div className={cx('grid min-w-0 flex-1 items-center gap-x-4 py-2.5 ps-4 pe-4', COLS[shape], eyebrow)}>
                        <span>No.</span>
                        <span>Date</span>
                        <span>{head.primary}</span>
                        <span>{head.secondary}</span>
                        {shape === 'status' && <span>{head.status}</span>}
                        <span className="text-end">{head.amount}</span>
                    </div>
                    <span className="w-[92px] flex-none" />
                </div>
                <ul aria-label={label} className="m-0 list-none p-0">{children}</ul>
            </div>
        </JobBookShape.Provider>
    );
};

interface JobBookRowProps {
    /** Sheet / job / invoice number, without the "#". */
    number: string;
    /** YYYY-MM-DD. Full date on desktop, short on phones. */
    date: string;
    /** Registration: shown as a plate before the title. */
    reg?: string;
    /** Car (make model) or customer name. */
    title: React.ReactNode;
    /** Customer, first line of work, etc. */
    detail?: React.ReactNode;
    status?: React.ReactNode;
    /** Money, already formatted. Set in mono. */
    amount?: React.ReactNode;
    /** What tapping the row does, said in words for screen readers. */
    openLabel: string;
    onOpen: () => void;
    onEdit: () => void;
    onDelete: () => void;
    /** "work sheet", "job sheet", "invoice"… used in button labels. */
    noun: string;
}

export const JobBookRow: React.FC<JobBookRowProps> = ({
    number, date, reg, title, detail, status, amount, openLabel, onOpen, onEdit, onDelete, noun,
}) => {
    const shape = React.useContext(JobBookShape);
    const [actionsOpen, setActionsOpen] = useState(false);
    const actionsId = useId();

    return (
        <li className="border-b border-line last:border-b-0">
            <div className="flex items-center">
                <button
                    type="button"
                    onClick={onOpen}
                    aria-label={openLabel}
                    className={cx(
                        'min-w-0 flex-1 py-3 ps-3.5 pe-2 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3 lg:ps-4 lg:pe-4',
                        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 lg:gap-x-4 lg:gap-y-0',
                        COLS[shape],
                    )}
                >
                    {/* Desktop-only columns */}
                    <span className="num hidden text-sm font-semibold text-ink-2 lg:block">#{number}</span>
                    <span className="num hidden text-sm text-ink-2 lg:block">{formatDate(date)}</span>

                    {/* Title: plate + car, or customer */}
                    <span className="flex min-w-0 items-center gap-2">
                        {reg && <Plate reg={reg} size="sm" />}
                        <span className="min-w-0 truncate text-base font-semibold leading-[1.3] text-ink">{title}</span>
                    </span>

                    {/* Phone: amount sits beside the title */}
                    <span className="num text-end text-base font-semibold text-ink lg:hidden">{amount}</span>

                    {/* Phone meta line; on desktop only the detail shows, in its own column */}
                    <span className="min-w-0 truncate text-sm leading-[1.3] text-ink-3 lg:text-ink-2">
                        <span className="lg:hidden"><span className="num">#{number}</span> · {shortDate(date)}{detail ? ' · ' : ''}</span>
                        {detail}
                    </span>
                    {shape === 'status' ? (
                        <span className="flex justify-end lg:justify-start">{status}</span>
                    ) : (
                        <span className="lg:hidden" />
                    )}

                    <span className="num hidden text-end text-base font-semibold text-ink lg:block">{amount}</span>
                </button>

                {/* Desktop: actions always visible */}
                <span className="hidden flex-none items-center gap-1 pe-2 lg:flex">
                    <IconButton size="sm" label={`Edit ${noun} ${number}`} icon={<EditIcon />} onClick={onEdit} />
                    <IconButton size="sm" label={`Delete ${noun} ${number}`} icon={<TrashIcon />} onClick={onDelete} className="hover:bg-danger-soft hover:text-danger-ink" />
                </span>

                {/* Phone: one toggle, actions open in place */}
                <span className="flex flex-none pe-1 lg:hidden">
                    <IconButton
                        label={`More for ${noun} ${number}`}
                        icon={<EllipsisVerticalIcon />}
                        aria-expanded={actionsOpen}
                        aria-controls={actionsId}
                        onClick={() => setActionsOpen(o => !o)}
                        className={actionsOpen ? 'bg-surface-2 text-ink' : undefined}
                    />
                </span>
            </div>
            {actionsOpen && (
                <div id={actionsId} className="flex gap-2 bg-surface-2 px-3.5 py-2.5 lg:hidden">
                    <Button variant="secondary" size="sm" icon={<EditIcon />} onClick={() => { setActionsOpen(false); onEdit(); }} className="flex-1">
                        Edit {noun}
                    </Button>
                    <Button variant="secondary" size="sm" icon={<TrashIcon />} onClick={() => { setActionsOpen(false); onDelete(); }} className="flex-1 text-danger">
                        Delete
                    </Button>
                </div>
            )}
        </li>
    );
};

/** Count + total on the left, search on the right. */
export const JobBookBar: React.FC<{ summary?: React.ReactNode; children?: React.ReactNode }> = ({ summary, children }) => (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-h-[1.25rem] text-sm text-ink-2">{summary}</p>
        {children && <div className="w-full sm:max-w-xs">{children}</div>}
    </div>
);

export default JobBook;
