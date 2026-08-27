"use strict";
/**
 * Getting a phone video under WhatsApp's 16 MB.
 *
 * A 30-second clip off a modern handset is routinely 60–120 MB, and Meta's media
 * upload simply refuses it. Rather than making Steve find a video editor, the
 * browser uploads the original to Storage and the outbox re-encodes it here on
 * the way to Graph: H.264 + AAC, 720p, faststart, mp4.
 *
 * One pass is not always enough, so the encode walks a ladder — quality down
 * first, then resolution — and stops at the first result that fits. If the
 * bottom of the ladder still will not fit, the send fails loudly: a silently
 * dropped attachment is worse than a toast.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compressVideoForWhatsApp = exports.ffmpegArgs = exports.videoCompressionSteps = exports.VIDEO_TOO_BIG_MESSAGE = exports.WHATSAPP_VIDEO_TARGET = exports.WHATSAPP_VIDEO_LIMIT = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
/** Meta's hard cap for a video. */
exports.WHATSAPP_VIDEO_LIMIT = 16 * 1024 * 1024;
/** What we actually aim for. The half-megabyte is headroom for the multipart upload. */
exports.WHATSAPP_VIDEO_TARGET = Math.round(15.5 * 1024 * 1024);
/** The message the inbox toast shows when even 480p at CRF 36 will not fit. */
exports.VIDEO_TOO_BIG_MESSAGE = "Video could not be compressed under WhatsApp's 16 MB limit";
/**
 * The ladder, in the order it is walked.
 *
 * Quality comes off first because 720p at CRF 32 still looks like a car; dropping
 * to 480p is the last resort, and only once extra CRF has stopped paying.
 */
const videoCompressionSteps = () => [
    { crf: 28, maxHeight: 720 },
    { crf: 32, maxHeight: 720 },
    { crf: 36, maxHeight: 720 },
    { crf: 36, maxHeight: 480 },
];
exports.videoCompressionSteps = videoCompressionSteps;
/** Kept pure so the argument list can be read in a test rather than in a log. */
const ffmpegArgs = (inputPath, outputPath, step) => [
    '-y',
    // Without this the build banner is most of stderr, and the tail we log is
    // ffmpeg's ./configure line rather than what actually went wrong.
    '-hide_banner',
    '-i', inputPath,
    '-vf', `scale=-2:'min(${step.maxHeight},ih)'`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', String(step.crf),
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    '-f', 'mp4',
    outputPath,
];
exports.ffmpegArgs = ffmpegArgs;
const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const runFfmpeg = (binary, args) => new Promise(resolve => {
    const child = (0, child_process_1.spawn)(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
        stderr += String(chunk);
        // ffmpeg is chatty and only the tail ever says why it stopped.
        if (stderr.length > 4000)
            stderr = stderr.slice(-4000);
    });
    child.on('error', error => resolve({ ok: false, stderr: String(error) }));
    child.on('close', code => resolve({ ok: code === 0, stderr }));
});
/**
 * Re-encode until it fits, or give up with a message the owner can act on.
 *
 * Everything happens in os.tmpdir() — the only writable place in a function — and
 * the whole working directory goes away in the finally, fit or no fit.
 */
const compressVideoForWhatsApp = async (input) => {
    if (!ffmpeg_static_1.default) {
        console.error('WhatsApp video: no ffmpeg binary for this platform');
        throw new Error(exports.VIDEO_TOO_BIG_MESSAGE);
    }
    const startedAt = Date.now();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-video-'));
    try {
        const inputPath = path.join(dir, 'input');
        await fs.writeFile(inputPath, input);
        let lastError = '';
        for (const step of (0, exports.videoCompressionSteps)()) {
            const outputPath = path.join(dir, `out-${step.crf}-${step.maxHeight}.mp4`);
            const { ok, stderr } = await runFfmpeg(ffmpeg_static_1.default, (0, exports.ffmpegArgs)(inputPath, outputPath, step));
            if (!ok) {
                lastError = stderr.slice(-600);
                console.warn(`WhatsApp video: ffmpeg failed at CRF ${step.crf}/${step.maxHeight}p — ${lastError}`);
                continue;
            }
            const output = await fs.readFile(outputPath);
            console.log(`WhatsApp video: CRF ${step.crf} at ${step.maxHeight}p gave ${mb(output.length)}`
                + ` from ${mb(input.length)} in ${Date.now() - startedAt}ms`);
            if (output.length <= exports.WHATSAPP_VIDEO_TARGET)
                return output;
            await fs.rm(outputPath, { force: true });
        }
        console.error(`WhatsApp video: ${mb(input.length)} would not fit after ${(0, exports.videoCompressionSteps)().length} passes`
            + ` in ${Date.now() - startedAt}ms${lastError ? ` — last ffmpeg error: ${lastError}` : ''}`);
        throw new Error(exports.VIDEO_TOO_BIG_MESSAGE);
    }
    finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(error => {
            console.warn(`WhatsApp video: could not clear ${dir}`, error);
        });
    }
};
exports.compressVideoForWhatsApp = compressVideoForWhatsApp;
//# sourceMappingURL=videoCompress.js.map