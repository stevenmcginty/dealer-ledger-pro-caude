"use strict";
/**
 *   cd functions && npx tsc && node --test lib/salesAgent/approval.test.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const approval_1 = require("./approval");
const router_1 = require("./router");
(0, node_test_1.describe)('needsApproval', () => {
    (0, node_test_1.it)('holds every channel when the original flag is on or missing', () => {
        node_assert_1.strict.equal((0, approval_1.needsApproval)({ channel: 'email' }, {}), true);
        node_assert_1.strict.equal((0, approval_1.needsApproval)({ channel: 'whatsapp' }, {}), true);
        node_assert_1.strict.equal((0, approval_1.needsApproval)({ channel: 'email' }, { emailApprovalMode: true }), true);
        node_assert_1.strict.equal((0, approval_1.needsApproval)({ channel: 'whatsapp' }, { emailApprovalMode: true }), true);
    });
    (0, node_test_1.it)('sends both channels automatically when only the original flag is off', () => {
        node_assert_1.strict.equal((0, approval_1.needsApproval)({ channel: 'email' }, { emailApprovalMode: false }), false);
        node_assert_1.strict.equal((0, approval_1.needsApproval)({ channel: 'whatsapp' }, { emailApprovalMode: false }), false);
    });
    (0, node_test_1.it)('lets WhatsApp and email be chosen separately', () => {
        const split = { emailApprovalMode: true, whatsappApprovalMode: false };
        node_assert_1.strict.equal((0, approval_1.needsApproval)({ channel: 'email' }, split), true);
        node_assert_1.strict.equal((0, approval_1.needsApproval)({ channel: 'whatsapp' }, split), false);
        const otherWay = { emailApprovalMode: false, whatsappApprovalMode: true };
        node_assert_1.strict.equal((0, approval_1.needsApproval)({ channel: 'email' }, otherWay), false);
        node_assert_1.strict.equal((0, approval_1.needsApproval)({ channel: 'whatsapp' }, otherWay), true);
    });
});
(0, node_test_1.describe)('agentTurnLimitReached', () => {
    (0, node_test_1.it)('never hands over when the cap is off', () => {
        node_assert_1.strict.equal((0, approval_1.agentTurnLimitReached)(50, 0), false);
        node_assert_1.strict.equal((0, approval_1.agentTurnLimitReached)(50, undefined), false);
    });
    (0, node_test_1.it)('hands over once Dave has used his allowance', () => {
        node_assert_1.strict.equal((0, approval_1.agentTurnLimitReached)(5, 6), false);
        node_assert_1.strict.equal((0, approval_1.agentTurnLimitReached)(6, 6), true);
        node_assert_1.strict.equal((0, approval_1.agentTurnLimitReached)(7, 6), true);
    });
});
/**
 * Draft-only: Ask Dave / draftNow must still hold the reply even when the
 * channel is set to send automatically. Human-mode inbound no longer auto-drafts.
 */
(0, node_test_1.describe)('draftOnly holds regardless of the channel setting', () => {
    /** Mirrors the gate in runAgentTurn. */
    const holds = (draftOnly, conv, settings) => draftOnly || (0, approval_1.needsApproval)(conv, settings);
    (0, node_test_1.it)('holds even where the channel is set to send automatically', () => {
        const auto = { emailApprovalMode: false, whatsappApprovalMode: false };
        node_assert_1.strict.equal(holds(false, { channel: 'whatsapp' }, auto), false);
        node_assert_1.strict.equal(holds(true, { channel: 'whatsapp' }, auto), true);
        node_assert_1.strict.equal(holds(true, { channel: 'email' }, auto), true);
    });
    (0, node_test_1.it)('leaves normal approval behaviour alone when not set', () => {
        node_assert_1.strict.equal(holds(false, { channel: 'whatsapp' }, { emailApprovalMode: true }), true);
    });
});
/** A message sitting unanswered is what a draft is for. */
(0, node_test_1.describe)('awaitingReply', () => {
    const cust = { direction: 'in', from: 'customer' };
    const out = { direction: 'out', from: 'agent' };
    const ownerNote = { direction: 'in', from: 'owner' };
    (0, node_test_1.it)('is true when the customer spoke last', () => {
        node_assert_1.strict.equal((0, router_1.awaitingReply)([out, cust]), true);
    });
    (0, node_test_1.it)('is false once we have replied', () => {
        node_assert_1.strict.equal((0, router_1.awaitingReply)([cust, out]), false);
    });
    (0, node_test_1.it)('is false on an empty thread', () => {
        node_assert_1.strict.equal((0, router_1.awaitingReply)([]), false);
    });
    (0, node_test_1.it)("ignores the owner's own notes when deciding", () => {
        node_assert_1.strict.equal((0, router_1.awaitingReply)([cust, out, ownerNote]), false);
        node_assert_1.strict.equal((0, router_1.awaitingReply)([out, cust, ownerNote]), true);
    });
});
/**
 * Binning a draft has to stick. Steve hit discard, left the thread, came back and
 * found the same unwanted draft waiting for him.
 */
(0, node_test_1.describe)('a discarded draft does not come back', () => {
    /** Mirrors the veto in draftNow. */
    const wouldDraft = (declinedFor, lastCustomerId, force = false) => force || declinedFor !== lastCustomerId;
    (0, node_test_1.it)('does not re-draft the message he just turned down', () => {
        node_assert_1.strict.equal(wouldDraft('m7', 'm7'), false);
    });
    (0, node_test_1.it)('drafts again once the customer says something new', () => {
        node_assert_1.strict.equal(wouldDraft('m7', 'm8'), true);
    });
    (0, node_test_1.it)('drafts when nothing has been declined', () => {
        node_assert_1.strict.equal(wouldDraft(undefined, 'm7'), true);
    });
    (0, node_test_1.it)('still obeys an explicit "have another go"', () => {
        node_assert_1.strict.equal(wouldDraft('m7', 'm7', true), true);
    });
});
//# sourceMappingURL=approval.test.js.map