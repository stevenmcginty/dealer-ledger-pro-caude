"use strict";
/**
 * What a caller is allowed to hand us as an attachment.
 *
 * Both send callables take a URL from the browser and then fetch it from inside
 * the function — Gmail reads the bytes to build the MIME part, WhatsApp reads
 * them to upload to Meta. An unchecked URL there is a server-side request the
 * caller chose: an internal metadata endpoint, another company's file, anything
 * reachable from the VPC. The bytes then leave in an email.
 *
 * So the only URLs accepted are Firebase Storage download URLs, on our own
 * bucket, under the calling company's own folder. Nothing else is fetched.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertOwnAttachmentUrl = exports.ownBucketName = exports.isOwnCompanyDownloadUrl = exports.objectPathFromDownloadUrl = void 0;
const admin = __importStar(require("firebase-admin"));
const STORAGE_HOST = 'firebasestorage.googleapis.com';
/** Object path inside the bucket, from a Firebase download URL. Null if it is not one. */
const objectPathFromDownloadUrl = (url, bucket) => {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return null;
    }
    if (parsed.protocol !== 'https:')
        return null;
    if (parsed.hostname.toLowerCase() !== STORAGE_HOST)
        return null;
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match)
        return null;
    if (decodeURIComponent(match[1]) !== bucket)
        return null;
    try {
        return decodeURIComponent(match[2]);
    }
    catch {
        return null;
    }
};
exports.objectPathFromDownloadUrl = objectPathFromDownloadUrl;
/**
 * True when this URL points at a file the calling company owns.
 *
 * Every path we write starts with the company id — invoices live at
 * {companyId}/{userId}/invoices/, WhatsApp media at {companyId}/whatsapp/.
 * Anything that does not start there belongs to somebody else.
 */
const isOwnCompanyDownloadUrl = (url, companyId, bucket) => {
    const path = (0, exports.objectPathFromDownloadUrl)(url, bucket);
    if (!path)
        return false;
    if (path.includes('..'))
        return false;
    const parts = path.split('/').filter(Boolean);
    return parts.length >= 2 && parts[0] === companyId;
};
exports.isOwnCompanyDownloadUrl = isOwnCompanyDownloadUrl;
/** The bucket this project actually writes to. Split out so the check above can be tested. */
const ownBucketName = () => admin.storage().bucket().name;
exports.ownBucketName = ownBucketName;
/**
 * Refuse an attachment URL that is not ours, with wording Steve can act on.
 * Returns the URL unchanged when it is fine.
 */
const assertOwnAttachmentUrl = (url, companyId) => {
    if (!(0, exports.isOwnCompanyDownloadUrl)(url, companyId, (0, exports.ownBucketName)())) {
        throw new Error('That attachment is not a file on this account.');
    }
    return url;
};
exports.assertOwnAttachmentUrl = assertOwnAttachmentUrl;
//# sourceMappingURL=mediaUrl.js.map