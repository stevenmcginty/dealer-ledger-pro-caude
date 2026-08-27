"use strict";
/**
 * Dedicated Storage folder for WhatsApp photos, videos and files.
 *
 * New objects go to {companyId}/whatsapp/{file}. Older ones also live under
 * {companyId}/{userId}/whatsapp/ (client uploads) and
 * {companyId}/salesAgent/whatsapp/ (inbound webhook). The prune walks all three
 * so a 500 MB cap applies to the lot, not just the new prefix.
 *
 * 500 MB is a lot of chat photos and a handful of phone videos. The rest of the
 * ledger (receipts, invoices) is a different folder and is left alone.
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
exports.pruneWhatsAppStorage = exports.saveInboundWhatsAppFile = exports.pruneCompanyWhatsApp = exports.listCompanyWhatsAppObjects = exports.pickWhatsAppFilesToDelete = exports.isWhatsAppObjectPath = exports.downloadUrlFor = exports.whatsappObjectPath = exports.WHATSAPP_STORAGE_CAP_BYTES = void 0;
const crypto = __importStar(require("crypto"));
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const companyIds_1 = require("../utils/companyIds");
exports.WHATSAPP_STORAGE_CAP_BYTES = 500 * 1024 * 1024;
const whatsappObjectPath = (companyId, fileName) => `${companyId}/whatsapp/${fileName}`;
exports.whatsappObjectPath = whatsappObjectPath;
const downloadUrlFor = (bucket, path, token) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
exports.downloadUrlFor = downloadUrlFor;
const isWhatsAppObjectPath = (path, companyId) => {
    const parts = path.split('/').filter(Boolean);
    if (companyId && parts[0] !== companyId)
        return false;
    if (parts.length >= 3 && parts[1] === 'whatsapp')
        return true;
    if (parts.length >= 4 && parts[1] === 'salesAgent' && parts[2] === 'whatsapp')
        return true;
    if (parts.length >= 4 && parts[2] === 'whatsapp')
        return true;
    return false;
};
exports.isWhatsAppObjectPath = isWhatsAppObjectPath;
/** Oldest first until the remainder fits under the cap. */
const pickWhatsAppFilesToDelete = (files, cap = exports.WHATSAPP_STORAGE_CAP_BYTES) => {
    const total = files.reduce((sum, file) => sum + (file.size || 0), 0);
    if (total <= cap)
        return [];
    const oldest = [...files].sort((a, b) => a.updated - b.updated);
    const drop = [];
    let leftover = total;
    for (const file of oldest) {
        if (leftover <= cap)
            break;
        drop.push(file);
        leftover -= file.size || 0;
    }
    return drop;
};
exports.pickWhatsAppFilesToDelete = pickWhatsAppFilesToDelete;
const listCompanyWhatsAppObjects = async (companyId) => {
    const found = new Map();
    const prefixes = [
        `${companyId}/whatsapp/`,
        `${companyId}/salesAgent/whatsapp/`,
    ];
    for (const prefix of prefixes) {
        const [files] = await admin.storage().bucket().getFiles({ prefix });
        files.forEach(file => {
            if (file.name.endsWith('/') || !(0, exports.isWhatsAppObjectPath)(file.name, companyId))
                return;
            found.set(file.name, {
                name: file.name,
                size: Number(file.metadata?.size || 0),
                updated: new Date(file.metadata?.updated || file.metadata?.timeCreated || 0).getTime(),
            });
        });
    }
    // Legacy owner uploads: {companyId}/{userId}/whatsapp/{file}
    const [, , api] = await admin.storage().bucket().getFiles({
        prefix: `${companyId}/`,
        delimiter: '/',
        autoPaginate: false,
        maxResults: 500,
    });
    const children = (api?.prefixes) || [];
    for (const child of children) {
        if (child === `${companyId}/whatsapp/` || child === `${companyId}/salesAgent/`)
            continue;
        const [files] = await admin.storage().bucket().getFiles({ prefix: `${child}whatsapp/` });
        files.forEach(file => {
            if (file.name.endsWith('/') || !(0, exports.isWhatsAppObjectPath)(file.name, companyId))
                return;
            found.set(file.name, {
                name: file.name,
                size: Number(file.metadata?.size || 0),
                updated: new Date(file.metadata?.updated || file.metadata?.timeCreated || 0).getTime(),
            });
        });
    }
    return [...found.values()];
};
exports.listCompanyWhatsAppObjects = listCompanyWhatsAppObjects;
const pruneCompanyWhatsApp = async (companyId, cap = exports.WHATSAPP_STORAGE_CAP_BYTES) => {
    const files = await (0, exports.listCompanyWhatsAppObjects)(companyId);
    const drop = (0, exports.pickWhatsAppFilesToDelete)(files, cap);
    const bucket = admin.storage().bucket();
    for (const file of drop) {
        try {
            await bucket.file(file.name).delete({ ignoreNotFound: true });
        }
        catch (error) {
            console.warn(`WhatsApp storage: could not delete ${file.name}`, error);
        }
    }
    const bytes = files.reduce((sum, file) => sum + file.size, 0) - drop.reduce((sum, file) => sum + file.size, 0);
    return { kept: files.length - drop.length, deleted: drop.length, bytes };
};
exports.pruneCompanyWhatsApp = pruneCompanyWhatsApp;
/** Save inbound customer media into the dedicated folder. */
const saveInboundWhatsAppFile = async (companyId, fileName, bytes, contentType) => {
    const tokenId = crypto.randomUUID();
    const path = (0, exports.whatsappObjectPath)(companyId, fileName);
    const file = admin.storage().bucket().file(path);
    await file.save(bytes, {
        resumable: false,
        metadata: {
            contentType,
            metadata: { firebaseStorageDownloadTokens: tokenId },
        },
    });
    const url = (0, exports.downloadUrlFor)(admin.storage().bucket().name, path, tokenId);
    return { path, url };
};
exports.saveInboundWhatsAppFile = saveInboundWhatsAppFile;
/**
 * Nightly cap. 03:15 UK, after the day's chat has gone quiet. One company's
 * over-cap folder must not stop the rest.
 */
exports.pruneWhatsAppStorage = functions
    .runWith({ timeoutSeconds: 300, memory: '256MB' })
    .pubsub.schedule('15 3 * * *')
    .timeZone('Europe/London')
    .onRun(async () => {
    const companyIds = await (0, companyIds_1.getCompanyIds)();
    for (const companyId of companyIds) {
        try {
            const result = await (0, exports.pruneCompanyWhatsApp)(companyId);
            if (result.deleted) {
                console.log(`WhatsApp storage ${companyId}: deleted ${result.deleted}, kept ${result.kept} (${result.bytes} bytes)`);
            }
        }
        catch (error) {
            console.error(`WhatsApp storage prune failed for ${companyId}`, error);
        }
    }
    return null;
});
//# sourceMappingURL=whatsappStorage.js.map