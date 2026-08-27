/**
 *   cd functions && npx tsc && node --test lib/salesAgent/channels/videoCompress.test.js
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
    WHATSAPP_VIDEO_LIMIT,
    WHATSAPP_VIDEO_TARGET,
    ffmpegArgs,
    videoCompressionSteps,
} from './videoCompress';

describe('videoCompressionSteps', () => {
    it('aims under Meta\'s cap with headroom', () => {
        assert.equal(WHATSAPP_VIDEO_LIMIT, 16 * 1024 * 1024);
        assert.ok(WHATSAPP_VIDEO_TARGET < WHATSAPP_VIDEO_LIMIT);
        assert.equal(WHATSAPP_VIDEO_TARGET, Math.round(15.5 * 1024 * 1024));
    });

    it('starts at 720p/CRF 28 and ends at 480p', () => {
        const steps = videoCompressionSteps();

        assert.deepEqual(steps[0], { crf: 28, maxHeight: 720 });
        assert.deepEqual(steps[steps.length - 1], { crf: 36, maxHeight: 480 });
    });

    it('never gets better looking as it goes', () => {
        const steps = videoCompressionSteps();

        assert.ok(steps.length >= 2);
        steps.forEach((step, i) => {
            if (i === 0) return;
            const previous = steps[i - 1];
            assert.ok(step.crf >= previous.crf, `step ${i} raised quality (CRF ${previous.crf} -> ${step.crf})`);
            assert.ok(
                step.maxHeight <= previous.maxHeight,
                `step ${i} raised resolution (${previous.maxHeight}p -> ${step.maxHeight}p)`
            );
        });
    });

    it('drops resolution only after CRF has stopped paying', () => {
        const steps = videoCompressionSteps();
        const firstSmaller = steps.findIndex(step => step.maxHeight < steps[0].maxHeight);

        assert.ok(firstSmaller > 0, 'expected a step that drops resolution');
        assert.equal(steps[firstSmaller - 1].crf, Math.max(...steps.map(s => s.crf)));
    });
});

describe('ffmpegArgs', () => {
    it('encodes H.264 + AAC into a faststart mp4', () => {
        const args = ffmpegArgs('/tmp/in', '/tmp/out.mp4', { crf: 28, maxHeight: 720 });

        assert.equal(args[args.length - 1], '/tmp/out.mp4');
        assert.ok(args.includes('-y'), 'must overwrite without prompting');
        assert.equal(args[args.indexOf('-i') + 1], '/tmp/in');
        assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
        assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
        assert.equal(args[args.indexOf('-preset') + 1], 'veryfast');
        assert.equal(args[args.indexOf('-movflags') + 1], '+faststart');
        assert.equal(args[args.indexOf('-f') + 1], 'mp4');
    });

    it('carries the step\'s CRF and never upscales', () => {
        const args = ffmpegArgs('/tmp/in', '/tmp/out.mp4', { crf: 36, maxHeight: 480 });

        assert.equal(args[args.indexOf('-crf') + 1], '36');
        assert.equal(args[args.indexOf('-vf') + 1], "scale=-2:'min(480,ih)'");
    });
});
