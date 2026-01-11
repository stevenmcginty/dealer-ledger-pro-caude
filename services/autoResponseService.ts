// services/autoResponseService.ts
// Auto-response evaluation and scheduling logic

import { CRMSettings, Lead, InboxEmail, Vehicle } from '../types';

// UK Timezone for business hours
const UK_TIMEZONE = 'Europe/London';

// Default configuration values
export const DEFAULT_AUTO_RESPONSE_CONFIG = {
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    businessDays: [1, 2, 3, 4, 5], // Mon-Fri
    minDelayMinutes: 5,
    maxAutoRepliesPerLead: 1,
    simpleIntents: ['availability', 'pricing', 'test_drive', 'opening_hours', 'general_enquiry'],
    complexKeywords: [
        'finance', 'monthly payment', 'hp', 'pcp', 'loan',
        'trade-in', 'part exchange', 'px',
        'warranty', 'guarantee',
        'complaint', 'issue', 'problem', 'unhappy',
        'accident', 'damage', 'history', 'hpi',
        'negotiate', 'best price', 'discount'
    ]
};

// Whitelist presets for UK car portals
export const WHITELIST_PRESETS = {
    autotrader: ['@autotrader.co.uk', '@atmail.autotrader.co.uk'],
    motors: ['@motors.co.uk'],
    cargurus: ['@cargurus.co.uk', '@cargurus.com'],
    ebay: ['@ebay.co.uk', '@ebay.com'],
    facebook: ['@facebookmail.com', '@fb.com'],
    gumtree: ['@gumtree.com']
};

export interface AutoResponseEvaluation {
    shouldAutoRespond: boolean;
    reason: string;
    isWithinBusinessHours: boolean;
    isWhitelistedSender: boolean;
    hasAlreadyReceivedAutoReply: boolean;
    isSimpleEnquiry: boolean;
    isComplexQuestion: boolean;
    suggestedDelayMinutes: number;
    scheduledTime?: Date;
}

// Get current time in UK timezone
export const getUKTime = (): Date => {
    const now = new Date();
    const ukString = now.toLocaleString('en-GB', { timeZone: UK_TIMEZONE });
    // Parse "DD/MM/YYYY, HH:mm:ss" format
    const [datePart, timePart] = ukString.split(', ');
    const [day, month, year] = datePart.split('/');
    const [hours, minutes, seconds] = timePart.split(':');
    return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hours),
        parseInt(minutes),
        parseInt(seconds)
    );
};

// Check if current UK time is within business hours
export const isWithinBusinessHours = (settings: CRMSettings): boolean => {
    if (!settings.businessHoursEnabled) {
        return true; // If business hours are disabled, always allow
    }

    const ukTime = getUKTime();
    const currentDay = ukTime.getDay(); // 0 = Sunday, 6 = Saturday
    const currentHour = ukTime.getHours();
    const currentMinute = ukTime.getMinutes();

    // Check if today is a business day
    const businessDays = settings.businessDays || DEFAULT_AUTO_RESPONSE_CONFIG.businessDays;
    if (!businessDays.includes(currentDay)) {
        return false;
    }

    // Parse business hours
    const startTime = settings.businessHoursStart || DEFAULT_AUTO_RESPONSE_CONFIG.businessHoursStart;
    const endTime = settings.businessHoursEnd || DEFAULT_AUTO_RESPONSE_CONFIG.businessHoursEnd;

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
};

// Get next business hour opening time
export const getNextBusinessHourStart = (settings: CRMSettings): Date => {
    const ukTime = getUKTime();
    const businessDays = settings.businessDays || DEFAULT_AUTO_RESPONSE_CONFIG.businessDays;
    const startTime = settings.businessHoursStart || DEFAULT_AUTO_RESPONSE_CONFIG.businessHoursStart;
    const [startHour, startMinute] = startTime.split(':').map(Number);

    // Start checking from now
    let checkDate = new Date(ukTime);

    // Check up to 7 days ahead
    for (let i = 0; i < 7; i++) {
        const dayOfWeek = checkDate.getDay();

        if (businessDays.includes(dayOfWeek)) {
            // Set to business hours start time
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

    // Fallback: return tomorrow at start time
    const tomorrow = new Date(ukTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(startHour, startMinute, 0, 0);
    return tomorrow;
};

// Check if sender email matches whitelist
export const isSenderWhitelisted = (
    senderEmail: string,
    settings: CRMSettings
): boolean => {
    const mode = settings.whitelistMode || 'whitelist_only';

    // If allow_all mode, accept everything
    if (mode === 'allow_all') {
        return true;
    }

    const whitelist = settings.whitelistedSenders || [];
    if (whitelist.length === 0) {
        // No whitelist configured - reject all for safety
        return false;
    }

    const normalizedEmail = senderEmail.toLowerCase().trim();

    for (const pattern of whitelist) {
        const normalizedPattern = pattern.toLowerCase().trim();

        // Exact match
        if (normalizedPattern === normalizedEmail) {
            return true;
        }

        // Wildcard domain match (e.g., *@autotrader.co.uk)
        if (normalizedPattern.startsWith('*@')) {
            const domain = normalizedPattern.slice(2);
            if (normalizedEmail.endsWith(`@${domain}`)) {
                return true;
            }
        }

        // Domain-only match (e.g., @autotrader.co.uk)
        if (normalizedPattern.startsWith('@')) {
            if (normalizedEmail.endsWith(normalizedPattern)) {
                return true;
            }
        }
    }

    return false;
};

// Check if email content contains complex question keywords
export const containsComplexKeywords = (
    subject: string,
    body: string,
    settings: CRMSettings
): { isComplex: boolean; keywords: string[] } => {
    const complexKeywords = settings.complexQuestionKeywords ||
        DEFAULT_AUTO_RESPONSE_CONFIG.complexKeywords;

    const text = `${subject} ${body}`.toLowerCase();
    const foundKeywords: string[] = [];

    for (const keyword of complexKeywords) {
        if (text.includes(keyword.toLowerCase())) {
            foundKeywords.push(keyword);
        }
    }

    return {
        isComplex: foundKeywords.length > 0,
        keywords: foundKeywords
    };
};

// Check if email content suggests a simple enquiry
export const isSimpleEnquiry = (
    subject: string,
    body: string
): { isSimple: boolean; intent: string | null } => {
    const text = `${subject} ${body}`.toLowerCase();

    // Very short messages are often simple enquiries
    if (body.trim().length < 50) {
        return { isSimple: true, intent: 'short_message' };
    }

    // Check for simple enquiry patterns
    const simplePatterns = [
        { pattern: /\b(is\s+(this|the|it)\s+)?(still\s+)?available\b/i, intent: 'availability' },
        { pattern: /\bwhat('s|\s+is)\s+(the\s+)?price\b/i, intent: 'pricing' },
        { pattern: /\bhow\s+much\b/i, intent: 'pricing' },
        { pattern: /\btest\s+drive\b/i, intent: 'test_drive' },
        { pattern: /\bbook\s+(a\s+)?viewing\b/i, intent: 'test_drive' },
        { pattern: /\b(opening|business)\s+hours\b/i, intent: 'opening_hours' },
        { pattern: /\bwhen\s+are\s+you\s+open\b/i, intent: 'opening_hours' },
        { pattern: /\bmore\s+(info|information|details)\b/i, intent: 'general_enquiry' },
        { pattern: /\binterested\s+in\b/i, intent: 'general_enquiry' },
        { pattern: /\benquir(y|ing)\b/i, intent: 'general_enquiry' }
    ];

    for (const { pattern, intent } of simplePatterns) {
        if (pattern.test(text)) {
            return { isSimple: true, intent };
        }
    }

    return { isSimple: false, intent: null };
};

// Calculate response delay in minutes
export const calculateResponseDelay = (
    settings: CRMSettings,
    isWithinHours: boolean
): number => {
    const baseDelay = Math.max(
        settings.autoResponseDelay || DEFAULT_AUTO_RESPONSE_CONFIG.minDelayMinutes,
        DEFAULT_AUTO_RESPONSE_CONFIG.minDelayMinutes // Minimum 5 minutes
    );

    // If outside business hours, delay will be until next business hour
    // The actual scheduling handles this, so just return base delay
    return baseDelay;
};

// Main evaluation function
export const evaluateAutoResponse = async (
    email: InboxEmail,
    lead: Lead | null,
    settings: CRMSettings,
    hasReceivedAutoReply: boolean // From autoRepliedEmails lookup
): Promise<AutoResponseEvaluation> => {
    // 1. Check if auto-response is enabled
    if (!settings.autoResponseEnabled) {
        return {
            shouldAutoRespond: false,
            reason: 'Auto-response is disabled',
            isWithinBusinessHours: false,
            isWhitelistedSender: false,
            hasAlreadyReceivedAutoReply: false,
            isSimpleEnquiry: false,
            isComplexQuestion: false,
            suggestedDelayMinutes: 0
        };
    }

    // 2. Check whitelist
    const whitelisted = isSenderWhitelisted(email.senderEmail, settings);
    if (!whitelisted) {
        return {
            shouldAutoRespond: false,
            reason: 'Sender not in whitelist',
            isWithinBusinessHours: isWithinBusinessHours(settings),
            isWhitelistedSender: false,
            hasAlreadyReceivedAutoReply: false,
            isSimpleEnquiry: false,
            isComplexQuestion: false,
            suggestedDelayMinutes: 0
        };
    }

    // 3. HARD RULE: Check if this email address has EVER received an auto-reply
    if (hasReceivedAutoReply) {
        return {
            shouldAutoRespond: false,
            reason: 'Email address has already received an auto-reply (one per email address limit)',
            isWithinBusinessHours: isWithinBusinessHours(settings),
            isWhitelistedSender: true,
            hasAlreadyReceivedAutoReply: true,
            isSimpleEnquiry: false,
            isComplexQuestion: false,
            suggestedDelayMinutes: 0
        };
    }

    // 4. Check for complex questions
    const complexCheck = containsComplexKeywords(email.subject, email.body, settings);
    if (complexCheck.isComplex) {
        return {
            shouldAutoRespond: false,
            reason: `Complex question detected: ${complexCheck.keywords.join(', ')}`,
            isWithinBusinessHours: isWithinBusinessHours(settings),
            isWhitelistedSender: true,
            hasAlreadyReceivedAutoReply: false,
            isSimpleEnquiry: false,
            isComplexQuestion: true,
            suggestedDelayMinutes: 0
        };
    }

    // 5. Check for simple enquiry
    const simpleCheck = isSimpleEnquiry(email.subject, email.body);

    // 6. Check business hours
    const withinHours = isWithinBusinessHours(settings);
    const delayMinutes = calculateResponseDelay(settings, withinHours);

    // Calculate scheduled time
    let scheduledTime: Date;
    if (withinHours) {
        scheduledTime = new Date(Date.now() + delayMinutes * 60 * 1000);
    } else {
        // Schedule for next business hour + delay
        const nextBusiness = getNextBusinessHourStart(settings);
        scheduledTime = new Date(nextBusiness.getTime() + delayMinutes * 60 * 1000);
    }

    return {
        shouldAutoRespond: true,
        reason: simpleCheck.isSimple
            ? `Simple enquiry detected: ${simpleCheck.intent}`
            : 'Email passed all checks',
        isWithinBusinessHours: withinHours,
        isWhitelistedSender: true,
        hasAlreadyReceivedAutoReply: false,
        isSimpleEnquiry: simpleCheck.isSimple,
        isComplexQuestion: false,
        suggestedDelayMinutes: delayMinutes,
        scheduledTime
    };
};

// Match email to vehicle in stock
export const matchEmailToVehicle = (
    email: InboxEmail,
    vehicles: Vehicle[]
): Vehicle | null => {
    const text = `${email.subject} ${email.body}`.toUpperCase();

    // First, try to match by registration
    for (const vehicle of vehicles) {
        if (vehicle.status !== 'Available') continue;

        const reg = vehicle.reg.toUpperCase().replace(/\s+/g, '');
        // Check for reg with or without spaces
        if (text.includes(reg) || text.includes(reg.replace(/(.{4})/, '$1 '))) {
            return vehicle;
        }
    }

    // Then try to match by make/model
    for (const vehicle of vehicles) {
        if (vehicle.status !== 'Available') continue;

        const make = vehicle.make.toUpperCase();
        const model = vehicle.model.toUpperCase();

        // Both make and model must be present
        if (text.includes(make) && text.includes(model)) {
            return vehicle;
        }
    }

    return null;
};

// Format business hours for display
export const formatBusinessHours = (settings: CRMSettings): string => {
    const start = settings.businessHoursStart || DEFAULT_AUTO_RESPONSE_CONFIG.businessHoursStart;
    const end = settings.businessHoursEnd || DEFAULT_AUTO_RESPONSE_CONFIG.businessHoursEnd;
    const days = settings.businessDays || DEFAULT_AUTO_RESPONSE_CONFIG.businessDays;

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activeDays = days.sort().map(d => dayNames[d]);

    // Simplify display (e.g., "Mon-Fri" instead of "Mon, Tue, Wed, Thu, Fri")
    if (days.length === 5 && days.includes(1) && days.includes(5) && !days.includes(0) && !days.includes(6)) {
        return `Mon-Fri, ${start}-${end}`;
    }

    return `${activeDays.join(', ')}, ${start}-${end}`;
};
