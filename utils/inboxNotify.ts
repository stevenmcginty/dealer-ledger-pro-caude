/**
 * Sound and home-screen badge for Agent Inbox alerts.
 *
 * The shade notification is raised by the service worker / pushService. This
 * is the in-app half: a chime when something arrives while the PWA is open,
 * and `navigator.setAppBadge` so the installed icon shows a count.
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

/**
 * Short two-note ping, close to a message chime. Web Audio so there is no
 * asset to cache. Cooled so a push and an RTDB unread bump do not double-fire.
 */
export const playInboxChime = (): void => {
    const now = Date.now();
    if (now - lastChimeAt < CHIME_GAP_MS) return;
    lastChimeAt = now;

    try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx: AudioContext = new Ctx();
        const master = ctx.createGain();
        master.gain.value = 0.18;
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

        ping(ctx.currentTime, 880, 0.09);
        ping(ctx.currentTime + 0.11, 1174, 0.14);

        window.setTimeout(() => {
            void ctx.close();
        }, 500);
    } catch {
        // Autoplay lock or no Web Audio. The OS notification still sounds.
    }
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
