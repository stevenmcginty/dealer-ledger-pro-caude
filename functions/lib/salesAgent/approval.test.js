"use strict";
/**
 *   cd functions && npx tsc && node --test lib/salesAgent/approval.test.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const approval_1 = require("./approval");
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
//# sourceMappingURL=approval.test.js.map