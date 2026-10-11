/** Join class names, skipping falsy parts. */
export const cx = (...parts: Array<string | false | null | undefined>): string =>
    parts.filter(Boolean).join(' ');

/*
 * Shared looks for the primitives, so a field, a select and a date input are
 * the same object on screen.
 */

/** The bordered box every text-like control sits in (48px, 8px radius). */
export const controlFrame = (state: { error?: boolean; disabled?: boolean } = {}): string =>
    cx(
        'relative flex min-h-[48px] min-w-0 items-center rounded-control border bg-surface',
        'transition-[border-color,box-shadow] duration-quick ease-out',
        state.disabled
            ? 'border-line bg-surface-2'
            : state.error
                ? 'border-danger shadow-[0_0_0_1px_rgb(var(--c-danger))]'
                : 'border-line-strong hover:border-ink-2 focus-within:border-focus focus-within:shadow-[0_0_0_1px_rgb(var(--c-focus))]',
    );

/** The bare input inside a frame. 16px so iOS never zooms. */
export const controlInput =
    'block w-full min-w-0 flex-1 appearance-none rounded-[inherit] border-0 bg-transparent px-3.5 py-3 text-base leading-snug text-ink ' +
    'placeholder:text-ink-3 placeholder:opacity-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-ink-3';

/** Small caps-style label used above tables, sheets and groups. */
export const eyebrow = 'font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3';
