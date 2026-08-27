"use strict";
/**
 *   cd functions && npx tsc && node --test lib/salesAgent/channels/videoCompress.test.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const videoCompress_1 = require("./videoCompress");
(0, node_test_1.describe)('videoCompressionSteps', () => {
    (0, node_test_1.it)('aims under Meta\'s cap with headroom', () => {
        node_assert_1.strict.equal(videoCompress_1.WHATSAPP_VIDEO_LIMIT, 16 * 1024 * 1024);
        node_assert_1.strict.ok(videoCompress_1.WHATSAPP_VIDEO_TARGET < videoCompress_1.WHATSAPP_VIDEO_LIMIT);
        node_assert_1.strict.equal(videoCompress_1.WHATSAPP_VIDEO_TARGET, Math.round(15.5 * 1024 * 1024));
    });
    (0, node_test_1.it)('starts at 720p/CRF 28 and ends at 480p', () => {
        const steps = (0, videoCompress_1.videoCompressionSteps)();
        node_assert_1.strict.deepEqual(steps[0], { crf: 28, maxHeight: 720 });
        node_assert_1.strict.deepEqual(steps[steps.length - 1], { crf: 36, maxHeight: 480 });
    });
    (0, node_test_1.it)('never gets better looking as it goes', () => {
        const steps = (0, videoCompress_1.videoCompressionSteps)();
        node_assert_1.strict.ok(steps.length >= 2);
        steps.forEach((step, i) => {
            if (i === 0)
                return;
            const previous = steps[i - 1];
            node_assert_1.strict.ok(step.crf >= previous.crf, `step ${i} raised quality (CRF ${previous.crf} -> ${step.crf})`);
            node_assert_1.strict.ok(step.maxHeight <= previous.maxHeight, `step ${i} raised resolution (${previous.maxHeight}p -> ${step.maxHeight}p)`);
        });
    });
    (0, node_test_1.it)('drops resolution only after CRF has stopped paying', () => {
        const steps = (0, videoCompress_1.videoCompressionSteps)();
        const firstSmaller = steps.findIndex(step => step.maxHeight < steps[0].maxHeight);
        node_assert_1.strict.ok(firstSmaller > 0, 'expected a step that drops resolution');
        node_assert_1.strict.equal(steps[firstSmaller - 1].crf, Math.max(...steps.map(s => s.crf)));
    });
});
(0, node_test_1.describe)('ffmpegArgs', () => {
    (0, node_test_1.it)('encodes H.264 + AAC into a faststart mp4', () => {
        const args = (0, videoCompress_1.ffmpegArgs)('/tmp/in', '/tmp/out.mp4', { crf: 28, maxHeight: 720 });
        node_assert_1.strict.equal(args[args.length - 1], '/tmp/out.mp4');
        node_assert_1.strict.ok(args.includes('-y'), 'must overwrite without prompting');
        node_assert_1.strict.equal(args[args.indexOf('-i') + 1], '/tmp/in');
        node_assert_1.strict.equal(args[args.indexOf('-c:v') + 1], 'libx264');
        node_assert_1.strict.equal(args[args.indexOf('-c:a') + 1], 'aac');
        node_assert_1.strict.equal(args[args.indexOf('-preset') + 1], 'veryfast');
        node_assert_1.strict.equal(args[args.indexOf('-movflags') + 1], '+faststart');
        node_assert_1.strict.equal(args[args.indexOf('-f') + 1], 'mp4');
    });
    (0, node_test_1.it)('carries the step\'s CRF and never upscales', () => {
        const args = (0, videoCompress_1.ffmpegArgs)('/tmp/in', '/tmp/out.mp4', { crf: 36, maxHeight: 480 });
        node_assert_1.strict.equal(args[args.indexOf('-crf') + 1], '36');
        node_assert_1.strict.equal(args[args.indexOf('-vf') + 1], "scale=-2:'min(480,ih)'");
    });
});
//# sourceMappingURL=videoCompress.test.js.map