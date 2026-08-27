/**
 *   cd functions && npx tsc && node --test lib/salesAgent/approval.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { agentTurnLimitReached, needsApproval } from './approval';
import { awaitingReply } from './router';

describe('needsApproval', () => {
    it('holds every channel when the original flag is on or missing', () => {
        assert.equal(needsApproval({ channel: 'email' }, {}), true);
        assert.equal(needsApproval({ channel: 'whatsapp' }, {}), true);
        assert.equal(needsApproval({ channel: 'email' }, { emailApprovalMode: true }), true);
        assert.equal(needsApproval({ channel: 'whatsapp' }, { emailApprovalMode: true }), true);
    });

    it('sends both channels automatically when only the original flag is off', () => {
        assert.equal(needsApproval({ channel: 'email' }, { emailApprovalMode: false }), false);
        assert.equal(needsApproval({ channel: 'whatsapp' }, { emailApprovalMode: false }), false);
    });

    it('lets WhatsApp and email be chosen separately', () => {
        const split = { emailApprovalMode: true, whatsappApprovalMode: false };
        assert.equal(needsApproval({ channel: 'email' }, split), true);
        assert.equal(needsApproval({ channel: 'whatsapp' }, split), false);

        const otherWay = { emailApprovalMode: false, whatsappApprovalMode: true };
        assert.equal(needsApproval({ channel: 'email' }, otherWay), false);
        assert.equal(needsApproval({ channel: 'whatsapp' }, otherWay), true);
    });
});

describe('agentTurnLimitReached', () => {
    it('never hands over when the cap is off', () => {
        assert.equal(agentTurnLimitReached(50, 0), false);
        assert.equal(agentTurnLimitReached(50, undefined), false);
    });

    it('hands over once Dave has used his allowance', () => {
        assert.equal(agentTurnLimitReached(5, 6), false);
        assert.equal(agentTurnLimitReached(6, 6), true);
        assert.equal(agentTurnLimitReached(7, 6), true);
    });
});

/**
 * Draft-only: Steve has taken the thread over, so nothing may send on its own —
 * but he still wants Dave's words waiting for him rather than an empty box.
 */
describe('draftOnly holds regardless of the channel setting', () => {
    /** Mirrors the gate in runAgentTurn. */
    const holds = (draftOnly: boolean, conv: { channel?: string }, settings: Record<string, boolean>): boolean =>
        draftOnly || needsApproval(conv, settings);

    it('holds even where the channel is set to send automatically', () => {
        const auto = { emailApprovalMode: false, whatsappApprovalMode: false };
        assert.equal(holds(false, { channel: 'whatsapp' }, auto), false);
        assert.equal(holds(true, { channel: 'whatsapp' }, auto), true);
        assert.equal(holds(true, { channel: 'email' }, auto), true);
    });

    it('leaves normal approval behaviour alone when not set', () => {
        assert.equal(holds(false, { channel: 'whatsapp' }, { emailApprovalMode: true }), true);
    });
});

/** A message sitting unanswered is what a draft is for. */
describe('awaitingReply', () => {
    const cust = { direction: 'in' as const, from: 'customer' as const };
    const out = { direction: 'out' as const, from: 'agent' as const };
    const ownerNote = { direction: 'in' as const, from: 'owner' as const };

    it('is true when the customer spoke last', () => {
        assert.equal(awaitingReply([out, cust]), true);
    });

    it('is false once we have replied', () => {
        assert.equal(awaitingReply([cust, out]), false);
    });

    it('is false on an empty thread', () => {
        assert.equal(awaitingReply([]), false);
    });

    it("ignores the owner's own notes when deciding", () => {
        assert.equal(awaitingReply([cust, out, ownerNote]), false);
        assert.equal(awaitingReply([out, cust, ownerNote]), true);
    });
});
