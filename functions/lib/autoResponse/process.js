"use strict";
/**
 * Email Processing for Auto-Response
 * Handles incoming email analysis and auto-response scheduling
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processIncomingEmail = void 0;
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
const businessHours_1 = require("../utils/businessHours");
/**
 * Check if sender is in whitelist
 */
const isSenderWhitelisted = (senderEmail, settings) => {
    const mode = settings.whitelistMode || 'whitelist_only';
    if (mode === 'allow_all') {
        return true;
    }
    const whitelist = settings.whitelistedSenders || [];
    if (whitelist.length === 0) {
        return false;
    }
    const normalized = senderEmail.toLowerCase().trim();
    for (const pattern of whitelist) {
        const normalizedPattern = pattern.toLowerCase().trim();
        if (normalizedPattern === normalized)
            return true;
        if (normalizedPattern.startsWith('*@')) {
            const domain = normalizedPattern.slice(2);
            if (normalized.endsWith(`@${domain}`))
                return true;
        }
        if (normalizedPattern.startsWith('@')) {
            if (normalized.endsWith(normalizedPattern))
                return true;
        }
    }
    return false;
};
/**
 * Check if email has already received an auto-reply (HARD RULE)
 */
const hasReceivedAutoReply = async (companyId, email, db) => {
    const normalized = email.toLowerCase().trim();
    const snapshot = await db.ref(`companies/${companyId}/autoRepliedEmails`)
        .orderByChild('email')
        .equalTo(normalized)
        .limitToFirst(1)
        .once('value');
    return snapshot.exists();
};
/**
 * Check for complex question keywords
 */
const containsComplexKeywords = (text, settings) => {
    const defaultKeywords = [
        'finance', 'monthly payment', 'hp', 'pcp', 'loan',
        'trade-in', 'part exchange', 'px',
        'warranty', 'guarantee',
        'complaint', 'issue', 'problem', 'unhappy',
        'accident', 'damage', 'history', 'hpi',
        'negotiate', 'best price', 'discount'
    ];
    const keywords = settings.complexQuestionKeywords || defaultKeywords;
    const lowerText = text.toLowerCase();
    const found = [];
    for (const keyword of keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
            found.push(keyword);
        }
    }
    return { isComplex: found.length > 0, keywords: found };
};
/**
 * Use Gemini to analyze email complexity
 */
const analyzeEmailWithAI = async (email) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('Gemini API key not configured, using keyword-based analysis');
        return { isComplex: false, intent: 'general' };
    }
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `Analyze this car dealership enquiry email:

Subject: ${email.subject}
Body: ${email.body}

Determine:
1. isComplex: Is this a complex question requiring human attention? (finance questions, trade-in valuations, complaints, warranty issues = complex)
2. intent: What is the customer asking? (availability, pricing, test_drive, general, finance, trade_in, complaint)
3. vehicleExtracted: Any vehicle registration or make/model mentioned?
4. suggestedResponse: If simple, suggest a brief, friendly response (2-3 sentences max)

Return JSON only: { "isComplex": boolean, "intent": string, "vehicleExtracted": string|null, "suggestedResponse": string|null }`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    }
    catch (error) {
        console.error('AI analysis error:', error);
    }
    return { isComplex: false, intent: 'general' };
};
/**
 * Find or create a lead for the sender
 */
const findOrCreateLead = async (companyId, email, db) => {
    // Search for existing lead by email
    const leadsSnap = await db.ref(`companies/${companyId}/leads`)
        .orderByChild('email')
        .equalTo(email.senderEmail.toLowerCase())
        .limitToFirst(1)
        .once('value');
    if (leadsSnap.exists()) {
        let leadId = '';
        leadsSnap.forEach((child) => {
            leadId = child.key;
        });
        return { leadId, isNew: false };
    }
    // Create new lead
    const newKey = db.ref(`companies/${companyId}/leads`).push().key;
    const nameParts = email.senderName.split(' ');
    await db.ref(`companies/${companyId}/leads/${newKey}`).set({
        firstName: nameParts[0] || 'Unknown',
        lastName: nameParts.slice(1).join(' ') || '',
        email: email.senderEmail.toLowerCase(),
        source: email.source === 'Gmail' ? 'Other' : email.source,
        stage: 'New Lead',
        hasReceivedAutoReply: false,
        history: [{
                id: Date.now().toString(),
                type: 'SYSTEM',
                content: `Lead created from incoming email`,
                timestamp: new Date().toISOString()
            }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
    return { leadId: newKey, isNew: true };
};
/**
 * Main function to process an incoming email
 */
const processIncomingEmail = async (companyId, email, settings, db) => {
    console.log(`Processing email from ${email.senderEmail} for company ${companyId}`);
    // 1. Check whitelist
    const whitelisted = isSenderWhitelisted(email.senderEmail, settings);
    const status = whitelisted ? 'UNREAD' : 'ARCHIVED';
    // 2. Check if already received auto-reply (HARD RULE)
    const alreadyReplied = await hasReceivedAutoReply(companyId, email.senderEmail, db);
    // 3. Check for complex keywords
    const complexCheck = containsComplexKeywords(`${email.subject} ${email.body}`, settings);
    // 4. AI Analysis (if enabled and whitelisted)
    let aiAnalysis = {
        isComplex: complexCheck.isComplex,
        intent: 'general'
    };
    if (settings.aiEnabled && whitelisted) {
        const analysis = await analyzeEmailWithAI(email);
        aiAnalysis = {
            isComplex: analysis.isComplex,
            intent: analysis.intent,
            vehicleExtracted: analysis.vehicleExtracted,
            suggestedResponse: analysis.suggestedResponse
        };
    }
    // 5. Create inbox email record
    const emailKey = db.ref(`companies/${companyId}/inboxEmails`).push().key;
    const inboxEmail = {
        gmailMessageId: email.gmailMessageId,
        gmailThreadId: email.gmailThreadId,
        source: email.source,
        senderName: email.senderName,
        senderEmail: email.senderEmail,
        subject: email.subject,
        body: email.body,
        bodyHtml: email.bodyHtml || null,
        receivedAt: email.receivedAt,
        status,
        analysis: {
            vehicleExtracted: aiAnalysis.vehicleExtracted || null,
            intent: aiAnalysis.intent,
            isComplexQuestion: aiAnalysis.isComplex || complexCheck.isComplex,
            complexityReason: complexCheck.isComplex ? `Keywords: ${complexCheck.keywords.join(', ')}` : null,
            suggestedResponse: aiAnalysis.suggestedResponse || null
        },
        requiresHumanReview: aiAnalysis.isComplex || complexCheck.isComplex,
        createdAt: admin.database.ServerValue.TIMESTAMP
    };
    await db.ref(`companies/${companyId}/inboxEmails/${emailKey}`).set(inboxEmail);
    // 6. Find or create lead (if whitelisted)
    let leadId = null;
    if (whitelisted) {
        const leadResult = await findOrCreateLead(companyId, email, db);
        leadId = leadResult.leadId;
        // Link email to lead
        await db.ref(`companies/${companyId}/inboxEmails/${emailKey}/leadId`).set(leadId);
        // Add activity to lead
        const activityId = Date.now().toString();
        await db.ref(`companies/${companyId}/leads/${leadId}/history`).push({
            id: activityId,
            type: 'EMAIL_IN',
            content: `Email received: ${email.subject}`,
            timestamp: new Date().toISOString()
        });
    }
    // 7. Determine if we should auto-respond
    const shouldAutoRespond = whitelisted &&
        !alreadyReplied &&
        settings.autoResponseEnabled &&
        !aiAnalysis.isComplex &&
        !complexCheck.isComplex;
    if (!shouldAutoRespond) {
        console.log(`Not auto-responding: whitelisted=${whitelisted}, alreadyReplied=${alreadyReplied}, enabled=${settings.autoResponseEnabled}, complex=${aiAnalysis.isComplex || complexCheck.isComplex}`);
        return;
    }
    // 8. Schedule auto-response
    const businessHoursConfig = {
        enabled: settings.businessHoursEnabled ?? true,
        start: settings.businessHoursStart || '09:00',
        end: settings.businessHoursEnd || '18:00',
        days: settings.businessDays || [1, 2, 3, 4, 5]
    };
    const delayMinutes = Math.max(settings.autoResponseDelay || 5, 5);
    const scheduledTime = (0, businessHours_1.calculateScheduledTime)(delayMinutes, businessHoursConfig);
    // Generate response (use AI suggestion or default)
    const responseBody = aiAnalysis.suggestedResponse || generateDefaultResponse(email);
    // Create scheduled response
    const responseKey = db.ref(`companies/${companyId}/scheduledResponses`).push().key;
    await db.ref(`companies/${companyId}/scheduledResponses/${responseKey}`).set({
        inboxEmailId: emailKey,
        leadId: leadId || null,
        recipientEmail: email.senderEmail,
        scheduledFor: scheduledTime.toISOString(),
        responseSubject: `Re: ${email.subject}`,
        responseBody,
        status: 'pending',
        createdAt: admin.database.ServerValue.TIMESTAMP
    });
    // Update email status
    await db.ref(`companies/${companyId}/inboxEmails/${emailKey}`).update({
        status: 'SCHEDULED',
        autoResponseScheduledAt: scheduledTime.toISOString()
    });
    console.log(`Scheduled auto-response for ${email.senderEmail} at ${scheduledTime.toISOString()}`);
};
exports.processIncomingEmail = processIncomingEmail;
/**
 * Generate a default response when AI is not available
 */
const generateDefaultResponse = (email) => {
    const firstName = email.senderName.split(' ')[0] || 'there';
    return `Hi ${firstName},

Thank you for your enquiry. We've received your message and one of our team members will be in touch shortly to assist you.

If you need immediate assistance, please don't hesitate to give us a call.

Kind regards,
The Team`;
};
//# sourceMappingURL=process.js.map