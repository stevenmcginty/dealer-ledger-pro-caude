/**
 *   cd functions && npx tsc && node --test lib/salesAgent/whatsappStorage.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
    isWhatsAppObjectPath,
    pickWhatsAppFilesToDelete,
    whatsappObjectPath,
} from './whatsappStorage';

describe('whatsappObjectPath', () => {
    it('puts new files in the dedicated company folder', () => {
        assert.equal(whatsappObjectPath('co-a', 'clip.mp4'), 'co-a/whatsapp/clip.mp4');
    });
});

describe('isWhatsAppObjectPath', () => {
    it('matches the dedicated folder, inbound legacy, and per-user uploads', () => {
        assert.equal(isWhatsAppObjectPath('co-a/whatsapp/a.jpg', 'co-a'), true);
        assert.equal(isWhatsAppObjectPath('co-a/salesAgent/whatsapp/in.mp4', 'co-a'), true);
        assert.equal(isWhatsAppObjectPath('co-a/uid123/whatsapp/out.mp4', 'co-a'), true);
        assert.equal(isWhatsAppObjectPath('co-a/uid123/receipts/scan.jpg', 'co-a'), false);
        assert.equal(isWhatsAppObjectPath('co-b/whatsapp/a.jpg', 'co-a'), false);
    });
});

describe('pickWhatsAppFilesToDelete', () => {
    it('does nothing under the cap', () => {
        const files = [
            { name: 'a', size: 100, updated: 1 },
            { name: 'b', size: 100, updated: 2 },
        ];
        assert.deepEqual(pickWhatsAppFilesToDelete(files, 500), []);
    });

    it('drops the oldest until the rest fits', () => {
        const files = [
            { name: 'old', size: 300, updated: 1 },
            { name: 'mid', size: 200, updated: 2 },
            { name: 'new', size: 150, updated: 3 },
        ];
        const drop = pickWhatsAppFilesToDelete(files, 300);
        assert.deepEqual(drop.map(f => f.name), ['old', 'mid']);
    });
});
