import { Lead, LeadStage } from '../../types';
import type { ChipStatus } from '../ui';

/** Board order, left to right. Lost sits last and starts hidden. */
export const STAGE_ORDER: LeadStage[] = [
    LeadStage.NEW,
    LeadStage.QUALIFIED,
    LeadStage.TEST_DRIVE,
    LeadStage.NEGOTIATION,
    LeadStage.WON,
    LeadStage.LOST,
];

/** The stages a lead can still move through (not won, not lost). */
export const OPEN_STAGES: LeadStage[] = STAGE_ORDER.slice(0, 4);

/**
 * Each stage borrows a chip from the fixed status vocabulary (shape + word +
 * colour), so the pipeline invents no colours of its own:
 * new = accent dot, qualified = ring, test drive = square (booked),
 * negotiation = amber diamond (needs work), sold = green dot, lost = grey dot.
 */
export const STAGE_CHIP: Record<LeadStage, ChipStatus> = {
    [LeadStage.NEW]: 'dave',
    [LeadStage.QUALIFIED]: 'stock',
    [LeadStage.TEST_DRIVE]: 'reserved',
    [LeadStage.NEGOTIATION]: 'prep',
    [LeadStage.WON]: 'sold',
    [LeadStage.LOST]: 'neutral',
};

/** Sentence-case words for the screen. The stored stage value never changes. */
export const STAGE_LABEL: Record<LeadStage, string> = {
    [LeadStage.NEW]: 'New',
    [LeadStage.QUALIFIED]: 'Qualified',
    [LeadStage.TEST_DRIVE]: 'Test drive',
    [LeadStage.NEGOTIATION]: 'Negotiation',
    [LeadStage.WON]: 'Sold',
    [LeadStage.LOST]: 'Lost',
};

export const isOpenLead = (lead: Lead): boolean =>
    lead.stage !== LeadStage.WON && lead.stage !== LeadStage.LOST;

/** Whole days since the lead last changed stage (or was created). */
export const daysInStage = (lead: Lead): number => {
    const lastStageChange = lead.history?.find(h => h.type === 'SYSTEM' && h.content.includes('stage'));
    const referenceDate = lastStageChange ? new Date(lastStageChange.timestamp) : new Date(lead.createdAt);
    return Math.max(0, Math.floor((Date.now() - referenceDate.getTime()) / 86400000));
};

/** A lead that has sat in one open stage for over a week wants a nudge. */
export const STALE_DAYS = 7;

export const fullName = (lead: Pick<Lead, 'firstName' | 'lastName'>): string =>
    `${lead.firstName} ${lead.lastName}`.trim();
