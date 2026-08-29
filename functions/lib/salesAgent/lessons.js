"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatLessons = exports.recordLesson = exports.readLessons = exports.LESSONS_IN_PROMPT = void 0;
const conversations_1 = require("./conversations");
const types_1 = require("./types");
/** How many corrections ride along in the prompt. Enough to matter, small enough to stay cheap. */
exports.LESSONS_IN_PROMPT = 8;
/** How many are kept at all. Older ones are pruned on write. */
const LESSONS_KEPT = 40;
const lessonsRef = (companyId) => (0, conversations_1.db)().ref((0, conversations_1.agentPath)(companyId, 'lessons'));
/**
 * Newest last, so the prompt reads in the order the desk said them.
 *
 * Read whole and sorted here rather than with orderByChild: the node is capped at
 * {@link LESSONS_KEPT}, so this is a handful of short strings, and it saves adding
 * an index rule for a query that would never pay for itself.
 */
const readLessons = async (companyId, limit = exports.LESSONS_IN_PROMPT) => {
    const snap = await lessonsRef(companyId).once('value');
    const all = (snap.val() || {});
    return Object.entries(all)
        .map(([id, lesson]) => ({ ...lesson, id }))
        .filter(lesson => !!(lesson?.note || '').trim())
        .sort((a, b) => (a.at || 0) - (b.at || 0))
        .slice(-limit);
};
exports.readLessons = readLessons;
/** Record a correction against a company and drop anything older than the last {@link LESSONS_KEPT}. */
const recordLesson = async (companyId, lesson) => {
    const ref = lessonsRef(companyId).push();
    const stored = { ...lesson, id: ref.key, at: lesson.at || Date.now() };
    await ref.set((0, types_1.stripUndefined)({ ...stored, id: undefined }));
    const all = (await lessonsRef(companyId).once('value')).val();
    const ids = Object.entries(all || {})
        .sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0))
        .slice(LESSONS_KEPT)
        .map(([id]) => id);
    if (ids.length) {
        await lessonsRef(companyId).update(Object.fromEntries(ids.map(id => [id, null])));
    }
    return stored;
};
exports.recordLesson = recordLesson;
/** One line per lesson, dated, for the prompt. */
const formatLessons = (lessons) => lessons.map(lesson => {
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
exports.formatLessons = formatLessons;
//# sourceMappingURL=lessons.js.map