"use strict";
/**
 *   cd functions && npx tsc && node --test lib/salesAgent/whatsappStorage.test.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const whatsappStorage_1 = require("./whatsappStorage");
(0, node_test_1.describe)('whatsappObjectPath', () => {
    (0, node_test_1.it)('puts new files in the dedicated company folder', () => {
        node_assert_1.strict.equal((0, whatsappStorage_1.whatsappObjectPath)('co-a', 'clip.mp4'), 'co-a/whatsapp/clip.mp4');
    });
});
(0, node_test_1.describe)('isWhatsAppObjectPath', () => {
    (0, node_test_1.it)('matches the dedicated folder, inbound legacy, and per-user uploads', () => {
        node_assert_1.strict.equal((0, whatsappStorage_1.isWhatsAppObjectPath)('co-a/whatsapp/a.jpg', 'co-a'), true);
        node_assert_1.strict.equal((0, whatsappStorage_1.isWhatsAppObjectPath)('co-a/salesAgent/whatsapp/in.mp4', 'co-a'), true);
        node_assert_1.strict.equal((0, whatsappStorage_1.isWhatsAppObjectPath)('co-a/uid123/whatsapp/out.mp4', 'co-a'), true);
        node_assert_1.strict.equal((0, whatsappStorage_1.isWhatsAppObjectPath)('co-a/uid123/receipts/scan.jpg', 'co-a'), false);
        node_assert_1.strict.equal((0, whatsappStorage_1.isWhatsAppObjectPath)('co-b/whatsapp/a.jpg', 'co-a'), false);
    });
});
(0, node_test_1.describe)('pickWhatsAppFilesToDelete', () => {
    (0, node_test_1.it)('does nothing under the cap', () => {
        const files = [
            { name: 'a', size: 100, updated: 1 },
            { name: 'b', size: 100, updated: 2 },
        ];
        node_assert_1.strict.deepEqual((0, whatsappStorage_1.pickWhatsAppFilesToDelete)(files, 500), []);
    });
    (0, node_test_1.it)('drops the oldest until the rest fits', () => {
        const files = [
            { name: 'old', size: 300, updated: 1 },
            { name: 'mid', size: 200, updated: 2 },
            { name: 'new', size: 150, updated: 3 },
        ];
        const drop = (0, whatsappStorage_1.pickWhatsAppFilesToDelete)(files, 300);
        node_assert_1.strict.deepEqual(drop.map(f => f.name), ['old', 'mid']);
    });
});
//# sourceMappingURL=whatsappStorage.test.js.map