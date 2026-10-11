import React, { useId, useState } from 'react';
import { ChevronDownIcon } from '../icons';
import { formatBytes } from '../../utils/helpers';

interface DrawerProps {
  title: string;
  count: number;
  children: React.ReactNode;
  totalSize?: number;
  isSizeLoading?: boolean;
}

/**
 * One drawer of the cabinet: a front with a label holder, a pull and the
 * count; it slides open to show its documents. Closed drawers are inert, so
 * the hidden rows can't be tabbed into.
 */
const Drawer: React.FC<DrawerProps> = ({ title, count, children, totalSize, isSizeLoading }) => {
    const [isOpen, setIsOpen] = useState(false);
    const bodyId = useId();

    return (
        <div className="overflow-hidden rounded-control border border-line bg-surface">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                className="group flex min-h-[64px] w-full items-center gap-3 px-3.5 py-3 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3 sm:px-4"
            >
                {/* The label holder on the drawer front. */}
                <span className="inline-flex min-w-0 items-center rounded-chip border border-line-strong bg-bg px-2.5 py-1.5">
                    <span className="truncate font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink">{title}</span>
                </span>
                {(totalSize !== undefined || isSizeLoading) && (
                    <span className="num hidden text-sm text-ink-3 sm:inline">
                        {isSizeLoading ? 'Working out size…' : formatBytes(totalSize ?? 0)}
                    </span>
                )}
                {/* The pull. Decorative; the whole front opens the drawer. */}
                <span aria-hidden="true" className="flex flex-1 justify-center">
                    <span className="h-1.5 w-12 rounded-full bg-line-strong transition-colors duration-quick ease-out group-hover:bg-ink-3" />
                </span>
                <span className="flex flex-none items-baseline gap-1.5">
                    <span className="num text-lg font-semibold leading-none text-ink">{count}</span>
                    <span className="sr-only">{count === 1 ? 'document' : 'documents'}</span>
                </span>
                <ChevronDownIcon className={`h-5 w-5 flex-none text-ink-3 transition-transform duration-base ease-out motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div
                id={bodyId}
                inert={!isOpen}
                className={`grid transition-[grid-template-rows] duration-base ease-out motion-reduce:transition-none ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
                <div className="min-h-0 overflow-hidden">
                    <ul className="m-0 list-none divide-y divide-line border-t border-line p-0">
                        {children}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default Drawer;
