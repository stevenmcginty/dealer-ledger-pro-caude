"use strict";
/**
 * UK Business Hours Utilities
 * All times are handled in Europe/London timezone (GMT/BST)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateScheduledTime = exports.getNextBusinessHourStart = exports.isWithinBusinessHours = exports.getUKTime = void 0;
const UK_TIMEZONE = 'Europe/London';
/**
 * Get current time in UK timezone
 */
const getUKTime = () => {
    const now = new Date();
    const ukString = now.toLocaleString('en-GB', { timeZone: UK_TIMEZONE });
    // Parse "DD/MM/YYYY, HH:mm:ss" format
    const [datePart, timePart] = ukString.split(', ');
    const [day, month, year] = datePart.split('/');
    const [hours, minutes, seconds] = timePart.split(':');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes), parseInt(seconds));
};
exports.getUKTime = getUKTime;
/**
 * Check if current UK time is within business hours
 */
const isWithinBusinessHours = (config) => {
    if (!config.enabled) {
        return true; // Always allow if disabled
    }
    const ukTime = (0, exports.getUKTime)();
    const currentDay = ukTime.getDay();
    const currentHour = ukTime.getHours();
    const currentMinute = ukTime.getMinutes();
    // Check if today is a business day
    if (!config.days.includes(currentDay)) {
        return false;
    }
    // Parse times
    const [startHour, startMinute] = config.start.split(':').map(Number);
    const [endHour, endMinute] = config.end.split(':').map(Number);
    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
};
exports.isWithinBusinessHours = isWithinBusinessHours;
/**
 * Get next business hour opening time
 */
const getNextBusinessHourStart = (config) => {
    const ukTime = (0, exports.getUKTime)();
    const [startHour, startMinute] = config.start.split(':').map(Number);
    // Start checking from now
    const checkDate = new Date(ukTime);
    // Check up to 7 days ahead
    for (let i = 0; i < 7; i++) {
        const dayOfWeek = checkDate.getDay();
        if (config.days.includes(dayOfWeek)) {
            const businessStart = new Date(checkDate);
            businessStart.setHours(startHour, startMinute, 0, 0);
            // If it's today and already past start time, move to tomorrow
            if (i === 0 && ukTime.getTime() >= businessStart.getTime()) {
                checkDate.setDate(checkDate.getDate() + 1);
                continue;
            }
            return businessStart;
        }
        checkDate.setDate(checkDate.getDate() + 1);
    }
    // Fallback
    const tomorrow = new Date(ukTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(startHour, startMinute, 0, 0);
    return tomorrow;
};
exports.getNextBusinessHourStart = getNextBusinessHourStart;
/**
 * Calculate scheduled send time based on delay and business hours
 */
const calculateScheduledTime = (delayMinutes, config) => {
    const now = new Date();
    if (!config.enabled) {
        // No business hours restriction, just add delay
        return new Date(now.getTime() + delayMinutes * 60 * 1000);
    }
    if ((0, exports.isWithinBusinessHours)(config)) {
        // Within hours, send after delay
        const scheduledTime = new Date(now.getTime() + delayMinutes * 60 * 1000);
        // Check if scheduled time is still within business hours
        const [endHour, endMinute] = config.end.split(':').map(Number);
        const ukScheduled = (0, exports.getUKTime)();
        ukScheduled.setTime(scheduledTime.getTime());
        const scheduledMinutes = ukScheduled.getHours() * 60 + ukScheduled.getMinutes();
        const endMinutes = endHour * 60 + endMinute;
        if (scheduledMinutes < endMinutes) {
            return scheduledTime;
        }
    }
    // Outside hours or would exceed end time - schedule for next business hour + delay
    const nextOpen = (0, exports.getNextBusinessHourStart)(config);
    return new Date(nextOpen.getTime() + delayMinutes * 60 * 1000);
};
exports.calculateScheduledTime = calculateScheduledTime;
//# sourceMappingURL=businessHours.js.map