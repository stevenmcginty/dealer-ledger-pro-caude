/**
 * What the desk has put Dave right on.
 *
 * Dave gets a lot right and occasionally gets something badly wrong — pinning an
 * enquiry to a car that sold months ago, and then talking to the customer about
 * that car. Correcting the thread fixes today. A lesson is what stops it
 * happening again: a line in Steve's own words, kept on the company, and read
 * back into the system prompt on every turn from then on.
 *
 * Deliberately small and blunt. There is no clever retrieval and no scoring:
 * the last handful of corrections are simply always in front of the model,
 * because a dealer who has said "these are Chris's Porsches, not mine" once
 * should not have to say it twice.
 */

import { agentPath, db } from './conversations';
import { stripUndefined } from './types';

/** One correction, in the words it was given in. */
export interface Lesson {
    id: string;
    /** What Steve typed. This is the lesson; everything else is provenance. */
    note: string;
    at: number;
    /** Which thread it came off, so a lesson can be traced back to the mistake. */
    convId?: string;
    /** The uid that wrote it. */
    by?: string;
    /** The car Dave had picked, and the car it should have been. */
    was?: string;
    corrected?: string;
    /** Set when the correction also moved the thread to another ledger. */
    movedTo?: string;
}

/** How many corrections ride along in the prompt. Enough to matter, small enough to stay cheap. */
export const LESSONS_IN_PROMPT = 8;

/** How many are kept at all. Older ones are pruned on write. */
const LESSONS_KEPT = 40;

const lessonsRef = (companyId: string) => db().ref(agentPath(companyId, 'lessons'));

/**
 * Newest last, so the prompt reads in the order the desk said them.
 *
 * Read whole and sorted here rather than with orderByChild: the node is capped at
 * {@link LESSONS_KEPT}, so this is a handful of short strings, and it saves adding
 * an index rule for a query that would never pay for itself.
 */
export const readLessons = async (companyId: string, limit = LESSONS_IN_PROMPT): Promise<Lesson[]> => {
    const snap = await lessonsRef(companyId).once('value');
    const all = (snap.val() || {}) as Record<string, Lesson>;
    return Object.entries(all)
        .map(([id, lesson]) => ({ ...lesson, id }))
        .filter(lesson => !!(lesson?.note || '').trim())
        .sort((a, b) => (a.at || 0) - (b.at || 0))
        .slice(-limit);
};

/** Record a correction against a company and drop anything older than the last {@link LESSONS_KEPT}. */
export const recordLesson = async (
    companyId: string,
    lesson: Omit<Lesson, 'id' | 'at'> & { at?: number }
): Promise<Lesson> => {
    const ref = lessonsRef(companyId).push();
    const stored: Lesson = { ...lesson, id: ref.key as string, at: lesson.at || Date.now() };
    await ref.set(stripUndefined({ ...stored, id: undefined }));

    const all = (await lessonsRef(companyId).once('value')).val() as Record<string, Lesson> | null;
    const ids = Object.entries(all || {})
        .sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0))
        .slice(LESSONS_KEPT)
        .map(([id]) => id);
    if (ids.length) {
        await lessonsRef(companyId).update(Object.fromEntries(ids.map(id => [id, null])));
    }

    return stored;
};

/** One line per lesson, dated, for the prompt. */
export const formatLessons = (lessons: Lesson[]): string[] =>
    lessons.map(lesson => {
        const when = lesson.at
            ? new Date(lesson.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
            : '';
        const car = lesson.was && lesson.corrected
            ? ` (you had said ${lesson.was}; it was ${lesson.corrected})`
            : lesson.corrected
                ? ` (it was ${lesson.corrected})`
                : '';
        return `- ${when ? `${when}: ` : ''}${lesson.note.trim()}${car}`;
    });
