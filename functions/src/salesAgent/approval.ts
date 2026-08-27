/**
 * Whether Dave holds a reply for the owner, and when he must stop and hand over.
 *
 * Kept pure so the settings page, the router, and the tests all share one answer.
 */

export const needsApproval = (
    conversation: { channel?: string },
    settings: { emailApprovalMode?: boolean; whatsappApprovalMode?: boolean }
): boolean => {
    if (conversation.channel === 'whatsapp') {
        if (settings.whatsappApprovalMode !== undefined) {
            return settings.whatsappApprovalMode !== false;
        }
    }
    // Email, SMS, and WhatsApp before the per-channel flag existed: the original
    // "Automatic reply" tick, default on (hold). Undefined counts as hold.
    return settings.emailApprovalMode !== false;
};

/**
 * `maxAgentTurns` is the number of customer-facing Dave replies after which
 * the next inbound is yours. 0 / missing = no cap (he keeps going until a
 * handoff rule fires).
 */
export const agentTurnLimitReached = (agentReplyCount: number, maxAgentTurns?: number): boolean => {
    const limit = Number(maxAgentTurns) || 0;
    return limit > 0 && agentReplyCount >= limit;
};

export const TURN_LIMIT_HANDOFF =
    "I'll get someone from the sales team to pick this up with you.";
