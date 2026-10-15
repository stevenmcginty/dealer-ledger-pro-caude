/**
 * The maths behind swipe-to-delete on the Agent Inbox list, kept apart from
 * the component so the thresholds can be tested.
 *
 * A finger has to travel a little before we decide what it is doing: mostly
 * sideways is a swipe, anything else is a scroll and the row leaves it alone.
 * On release the row goes if it was dragged far enough, or flicked hard enough
 * in the same direction it was dragged.
 *
 * Only email ever goes this way. Steve has no WhatsApp app (Cloud API only), so
 * the ledger is the only copy of a WhatsApp chat and a swipe must never touch one.
 */

import type { Conversation } from '../services/salesAgentService';
import { conversationsForFilter, type CustomerGroup, type InboxFilter } from './agentInboxGroups';

/** Pixels a finger must move before the gesture picks an axis. */
export const LOCK_DISTANCE = 10;
/** Sideways must beat vertical by this much to count as a swipe. */
export const LOCK_RATIO = 1.2;
/** Share of the row's width that deletes on release. */
export const DELETE_FRACTION = 0.4;
/** A flick must travel at least this far... */
export const FLICK_DISTANCE = 64;
/** ...at this speed or faster (px per ms). */
export const FLICK_SPEED = 0.5;
/** Only the last stretch of the drag counts towards release speed. */
export const VELOCITY_WINDOW_MS = 100;

export type SwipeAxis = 'x' | 'y' | null;
export type SwipeOutcome = 'delete-left' | 'delete-right' | 'cancel';

/** 'x' = a swipe, 'y' = a scroll, null = not moved far enough to tell yet. */
export const lockAxis = (dx: number, dy: number): SwipeAxis => {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax >= LOCK_DISTANCE && ax > ay * LOCK_RATIO) return 'x';
    if (ay >= LOCK_DISTANCE) return 'y';
    return null;
};

/** True once letting go would delete the row on distance alone. */
export const pastThreshold = (dx: number, width: number): boolean =>
    width > 0 && Math.abs(dx) >= width * DELETE_FRACTION;

/** Signed speed (px per ms, + = rightwards) over the last stretch of samples. */
export const releaseVelocity = (samples: Array<{ x: number; t: number }>): number => {
    if (samples.length < 2) return 0;
    const last = samples[samples.length - 1];
    const first = samples.find(s => last.t - s.t <= VELOCITY_WINDOW_MS) || last;
    const dt = last.t - first.t;
    return dt > 0 ? (last.x - first.x) / dt : 0;
};

export const releaseOutcome = ({ dx, width, velocity }: { dx: number; width: number; velocity: number }): SwipeOutcome => {
    if (dx === 0) return 'cancel';
    const flick = Math.abs(dx) >= FLICK_DISTANCE
        && Math.abs(velocity) >= FLICK_SPEED
        && Math.sign(velocity) === Math.sign(dx);
    if (!pastThreshold(dx, width) && !flick) return 'cancel';
    return dx > 0 ? 'delete-right' : 'delete-left';
};

/**
 * An email thread that has never carried WhatsApp. An email thread can hold
 * WhatsApp messages (the opener goes out on it), so the channel alone is not enough.
 */
const emailOnly = (conv: Conversation): boolean =>
    conv.channel === 'email' && conv.originChannel !== 'whatsapp' && !conv.whatsappOpenerAt;

/** What a swipe on this row would delete under the current tab. Empty = the row does not swipe. */
export const swipeDeletableConversations = (group: CustomerGroup, filter: InboxFilter): Conversation[] =>
    conversationsForFilter(group, filter).filter(emailOnly);
