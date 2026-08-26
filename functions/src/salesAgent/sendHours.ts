/**
 * When Dave is allowed to actually send.
 *
 * Drafting and notifying Steve happen around the clock. Sending to the customer
 * does not: a reply approved at 11pm waits until the next 8am rather than landing
 * in someone's inbox in the middle of the night. The window is a setting, default
 * 08:00–17:00 Europe/London, Monday to Saturday.
 */

export interface SendHours {
    enabled: boolean;
    start: string;
    end: string;
    /** 0 = Sunday … 6 = Saturday. */
    days: number[];
    timeZone: string;
}

export const DEFAULT_SEND_HOURS: SendHours = {
    enabled: true,
    start: '08:00',
    end: '17:00',
    days: [1, 2, 3, 4, 5, 6],
    timeZone: 'Europe/London',
};

const WEEKDAY: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export interface SendHoursSource {
    sendHours?: Partial<SendHours> | null;
}

type Wall = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    weekday: number;
};

export const parseHm = (value: string, fallback: { hour: number; minute: number }): { hour: number; minute: number } => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return fallback;
    return {
        hour: Math.min(23, Math.max(0, Number(match[1]))),
        minute: Math.min(59, Math.max(0, Number(match[2]))),
    };
};

export const resolveSendHours = (settings?: SendHoursSource | null): SendHours => {
    const raw = settings?.sendHours || {};
    const days = Array.isArray(raw.days)
        ? raw.days.map(n => Number(n)).filter(n => n >= 0 && n <= 6)
        : [];

    return {
        enabled: raw.enabled !== false,
        start: raw.start || DEFAULT_SEND_HOURS.start,
        end: raw.end || DEFAULT_SEND_HOURS.end,
        days: days.length ? [...new Set(days)].sort((a, b) => a - b) : [...DEFAULT_SEND_HOURS.days],
        timeZone: raw.timeZone || DEFAULT_SEND_HOURS.timeZone,
    };
};

const readWall = (ms: number, timeZone: string): Wall => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(ms));

    const get = (type: string): string => parts.find(part => part.type === type)?.value || '';
    const weekday = WEEKDAY[get('weekday')];

    return {
        year: Number(get('year')),
        month: Number(get('month')),
        day: Number(get('day')),
        hour: Number(get('hour')),
        minute: Number(get('minute')),
        second: Number(get('second')),
        weekday: weekday === undefined ? new Date(ms).getUTCDay() : weekday,
    };
};

/** Instant that shows as this wall clock in `timeZone`. 8am in London is unique year-round (DST moves 1am). */
export const zonedUtcMs = (
    timeZone: string,
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number
): number => {
    const target = Date.UTC(year, month - 1, day, hour, minute, 0);
    let instant = target;
    for (let i = 0; i < 3; i++) {
        const wall = readWall(instant, timeZone);
        const shown = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
        instant -= shown - target;
    }
    return instant;
};

const minutesOf = (hour: number, minute: number): number => hour * 60 + minute;

export const isWithinSendHours = (hours: SendHours, atMs: number): boolean => {
    if (!hours.enabled) return true;

    const wall = readWall(atMs, hours.timeZone);
    if (!hours.days.includes(wall.weekday)) return false;

    const start = parseHm(hours.start, { hour: 8, minute: 0 });
    const end = parseHm(hours.end, { hour: 17, minute: 0 });
    const now = minutesOf(wall.hour, wall.minute);
    const from = minutesOf(start.hour, start.minute);
    const to = minutesOf(end.hour, end.minute);

    if (from === to) return true;
    if (from < to) return now >= from && now < to;
    return now >= from || now < to;
};

export const startOfNextWindow = (hours: SendHours, fromMs: number): number => {
    const start = parseHm(hours.start, { hour: 8, minute: 0 });
    let cursor = fromMs;

    for (let n = 0; n < 14; n++) {
        const wall = readWall(cursor, hours.timeZone);
        const candidate = zonedUtcMs(hours.timeZone, wall.year, wall.month, wall.day, start.hour, start.minute);
        if (hours.days.includes(readWall(candidate, hours.timeZone).weekday) && candidate > fromMs) {
            return candidate;
        }
        // Jump ~25h so DST days still land on the next calendar date in-zone.
        cursor = candidate + 25 * 3600_000;
    }

    return fromMs + 24 * 3600_000;
};

/**
 * When the outbox should fire this reply.
 *
 * `extraDelayMs` is the human-feel wait, applied first. If that instant is still
 * inside hours it is used as-is; if not, the next window start is used, plus
 * `jitterMs` so a pile of overnight approvals do not all go at 08:00:00.
 */
export const scheduleSendAfter = (
    settings: SendHoursSource | null | undefined,
    nowMs: number,
    extraDelayMs = 0,
    jitterMs = 0
): number => {
    const hours = resolveSendHours(settings);
    const proposed = nowMs + Math.max(0, extraDelayMs);
    if (isWithinSendHours(hours, proposed)) return proposed;
    return startOfNextWindow(hours, proposed) + Math.max(0, jitterMs);
};

/** A few tens of seconds, so 8am is not a stampede. */
export const morningJitterMs = (): number => 20_000 + Math.floor(Math.random() * 70_000);

export const formatSendAt = (atMs: number, timeZone = DEFAULT_SEND_HOURS.timeZone): string =>
    new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hourCycle: 'h12',
    }).format(new Date(atMs));
