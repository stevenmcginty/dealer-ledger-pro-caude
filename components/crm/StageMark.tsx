import React from 'react';
import { cx } from '../ui/cx';
import type { ChipStatus } from '../ui';
import { LeadStage } from '../../types';
import { STAGE_CHIP } from './leadStage';

// The status-chip vocabulary's shapes, drawn bare (no pill) so a stage name
// fits a narrow tile or a radio. Same shape + colour per meaning as
// ui/StatusChip: ring, diamond, square, dot.
const TONE: Record<ChipStatus, string> = {
    stock: 'text-ink-2',
    prep: 'text-warning',
    reserved: 'text-info',
    sold: 'text-success',
    due: 'text-danger',
    dave: 'text-accent-text',
    neutral: 'text-ink-3',
};

const SHAPE: Partial<Record<ChipStatus, string>> = {
    stock: 'h-[9px] w-[9px] rounded-full border-2 border-current',
    prep: 'h-2 w-2 rotate-45 rounded-[1px] bg-current',
    reserved: 'h-2 w-2 rounded-[1px] bg-current',
};

const StageMark: React.FC<{ stage: LeadStage; className?: string }> = ({ stage, className }) => {
    const status = STAGE_CHIP[stage];
    return (
        <span
            aria-hidden="true"
            className={cx('inline-block flex-none', SHAPE[status] ?? 'h-2 w-2 rounded-full bg-current', TONE[status], className)}
        />
    );
};

export default StageMark;
