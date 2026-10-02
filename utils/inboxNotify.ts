/**
 * Sound and home-screen badge for Agent Inbox alerts.
 *
 * The shade notification is raised by the service worker / pushService. This
 * is the in-app half: a chime when something arrives while the PWA is open,
 * a flashing window title while it is in the background, and
 * `navigator.setAppBadge` so the installed icon shows a count.
 */

let lastChimeAt = 0;
const CHIME_GAP_MS = 1200;

const canBadge = (): boolean =>
    typeof navigator !== 'undefined' && typeof (navigator as any).setAppBadge === 'function';

/** Put a count on the installed PWA icon. Zero clears it. */
export const setInboxBadge = (count: number): void => {
    if (!canBadge()) return;
    try {
        if (count > 0) void (navigator as any).setAppBadge(count);
        else void (navigator as any).clearAppBadge();
    } catch {
        // Unsupported, private window, or the browser refused. Not worth a toast.
    }
};

/** [start offset s, frequency Hz, duration s] */
type Note = [number, number, number];

/**
 * Play a few sine pings through Web Audio, so there is no asset to cache.
 * Shares one cooldown across every chime so a push and an RTDB unread bump do
 * not double-fire, whichever chime each of them asks for.
 */
const playNotes = (volume: number, notes: Note[], closeAfterMs: number): void => {
    const now = Date.now();
    if (now - lastChimeAt < CHIME_GAP_MS) return;
    lastChimeAt = now;

    try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx: AudioContext = new Ctx();
        const master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);

        const ping = (at: number, freq: number, dur: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(1, at + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
            osc.connect(gain);
            gain.connect(master);
            osc.start(at);
            osc.stop(at + dur + 0.02);
        };

        notes.forEach(([offset, freq, dur]) => ping(ctx.currentTime + offset, freq, dur));

        window.setTimeout(() => {
            void ctx.close();
        }, closeAfterMs);
    } catch {
        // Autoplay lock or no Web Audio. The OS notification still sounds.
    }
};

/** Short two-note ping, close to a message chime. */
export const playInboxChime = (): void => {
    playNotes(0.18, [[0, 880, 0.09], [0.11, 1174, 0.14]], 500);
};

/**
 * A customer WhatsApp: three rising notes, a little louder, so it is never
 * mistaken for a draft or an email landing in the inbox.
 */
export const playWhatsAppChime = (): void => {
    playNotes(0.28, [[0, 784, 0.1], [0.12, 988, 0.1], [0.24, 1319, 0.24]], 800);
};

// Window-title flash. While the app is behind another window or minimised, the
// tab / taskbar title alternates so a WhatsApp is visible from across the room.
let flashTimer: ReturnType<typeof setInterval> | null = null;
let flashOriginal = '';
let flashText = '';
let flashShowing = false;

const onFlashFocus = (): void => stopWindowTitleFlash();
const onFlashVisibility = (): void => {
    if (!document.hidden) stopWindowTitleFlash();
};

/** Stop the title flash and put the original title back. */
export const stopWindowTitleFlash = (): void => {
    if (flashTimer === null) return;
    clearInterval(flashTimer);
    flashTimer = null;
    document.title = flashOriginal;
    flashShowing = false;
    window.removeEventListener('focus', onFlashFocus);
    document.removeEventListener('visibilitychange', onFlashVisibility);
};

/**
 * Alternate the window title with `💬 <text>` every second until Steve comes
 * back to the app. Does nothing while the app is focused and on screen; a call
 * while already flashing just swaps the text.
 */
export const flashWindowTitle = (text: string): void => {
    if (typeof document === 'undefined') return;
    if (!document.hidden && document.hasFocus()) return;
    flashText = `💬 ${text}`;
    if (flashTimer !== null) {
        if (flashShowing) document.title = flashText;
        return;
    }
    flashOriginal = document.title;
    flashShowing = true;
    document.title = flashText;
    flashTimer = setInterval(() => {
        flashShowing = !flashShowing;
        document.title = flashShowing ? flashText : flashOriginal;
    }, 1000);
    window.addEventListener('focus', onFlashFocus);
    document.addEventListener('visibilitychange', onFlashVisibility);
};

/** Close any shade notifications tagged with this conversation. */
export const dismissConversationNotifications = async (convId: string): Promise<void> => {
    if (!convId || !('serviceWorker' in navigator)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const notes = await registration.getNotifications({ tag: convId });
        notes.forEach(note => note.close());
    } catch {
        // Nothing to close.
    }
};
