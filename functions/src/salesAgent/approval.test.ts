/**
 *   cd functions && npx tsc && node --test lib/salesAgent/approval.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { agentTurnLimitReached, needsApproval } from './approval';

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
