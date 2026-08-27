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

import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

import { getCompanyIds } from '../utils/companyIds';

export const WHATSAPP_STORAGE_CAP_BYTES = 500 * 1024 * 1024;

export const whatsappObjectPath = (companyId: string, fileName: string): string =>
    `${companyId}/whatsapp/${fileName}`;

export const downloadUrlFor = (bucket: string, path: string, token: string): string =>
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

export const isWhatsAppObjectPath = (path: string, companyId?: string): boolean => {
    const parts = path.split('/').filter(Boolean);
    if (companyId && parts[0] !== companyId) return false;
    if (parts.length >= 3 && parts[1] === 'whatsapp') return true;
    if (parts.length >= 4 && parts[1] === 'salesAgent' && parts[2] === 'whatsapp') return true;
    if (parts.length >= 4 && parts[2] === 'whatsapp') return true;
    return false;
};

export interface WhatsAppObject {
    name: string;
    size: number;
    updated: number;
}

/** Oldest first until the remainder fits under the cap. */
export const pickWhatsAppFilesToDelete = (
    files: WhatsAppObject[],
    cap = WHATSAPP_STORAGE_CAP_BYTES
): WhatsAppObject[] => {
    const total = files.reduce((sum, file) => sum + (file.size || 0), 0);
    if (total <= cap) return [];

    const oldest = [...files].sort((a, b) => a.updated - b.updated);
    const drop: WhatsAppObject[] = [];
    let leftover = total;
    for (const file of oldest) {
        if (leftover <= cap) break;
        drop.push(file);
        leftover -= file.size || 0;
    }
    return drop;
};

export const listCompanyWhatsAppObjects = async (companyId: string): Promise<WhatsAppObject[]> => {
    const found = new Map<string, WhatsAppObject>();
    const prefixes = [
        `${companyId}/whatsapp/`,
        `${companyId}/salesAgent/whatsapp/`,
    ];

    for (const prefix of prefixes) {
        const [files] = await admin.storage().bucket().getFiles({ prefix });
        files.forEach(file => {
            if (file.name.endsWith('/') || !isWhatsAppObjectPath(file.name, companyId)) return;
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
    const children: string[] = ((api as { prefixes?: string[] } | undefined)?.prefixes) || [];
    for (const child of children) {
        if (child === `${companyId}/whatsapp/` || child === `${companyId}/salesAgent/`) continue;
        const [files] = await admin.storage().bucket().getFiles({ prefix: `${child}whatsapp/` });
        files.forEach(file => {
            if (file.name.endsWith('/') || !isWhatsAppObjectPath(file.name, companyId)) return;
            found.set(file.name, {
                name: file.name,
                size: Number(file.metadata?.size || 0),
                updated: new Date(file.metadata?.updated || file.metadata?.timeCreated || 0).getTime(),
            });
        });
    }

    return [...found.values()];
};

export const pruneCompanyWhatsApp = async (
    companyId: string,
    cap = WHATSAPP_STORAGE_CAP_BYTES
): Promise<{ kept: number; deleted: number; bytes: number }> => {
    const files = await listCompanyWhatsAppObjects(companyId);
    const drop = pickWhatsAppFilesToDelete(files, cap);
    const bucket = admin.storage().bucket();

    for (const file of drop) {
        try {
            await bucket.file(file.name).delete({ ignoreNotFound: true });
        } catch (error) {
            console.warn(`WhatsApp storage: could not delete ${file.name}`, error);
        }
    }

    const bytes = files.reduce((sum, file) => sum + file.size, 0) - drop.reduce((sum, file) => sum + file.size, 0);
    return { kept: files.length - drop.length, deleted: drop.length, bytes };
};

/** Save inbound customer media into the dedicated folder. */
export const saveInboundWhatsAppFile = async (
    companyId: string,
    fileName: string,
    bytes: Buffer,
    contentType: string
): Promise<{ path: string; url: string }> => {
    const tokenId = crypto.randomUUID();
    const path = whatsappObjectPath(companyId, fileName);
    const file = admin.storage().bucket().file(path);
    await file.save(bytes, {
        resumable: false,
        metadata: {
            contentType,
            metadata: { firebaseStorageDownloadTokens: tokenId },
        },
    });
    const url = downloadUrlFor(admin.storage().bucket().name, path, tokenId);
    return { path, url };
};

/**
 * Nightly cap. 03:15 UK, after the day's chat has gone quiet. One company's
 * over-cap folder must not stop the rest.
 */
export const pruneWhatsAppStorage = functions
    .runWith({ timeoutSeconds: 300, memory: '256MB' })
    .pubsub.schedule('15 3 * * *')
    .timeZone('Europe/London')
    .onRun(async () => {
        const companyIds = await getCompanyIds();
        for (const companyId of companyIds) {
            try {
                const result = await pruneCompanyWhatsApp(companyId);
                if (result.deleted) {
                    console.log(
                        `WhatsApp storage ${companyId}: deleted ${result.deleted}, kept ${result.kept} (${result.bytes} bytes)`
                    );
                }
            } catch (error) {
                console.error(`WhatsApp storage prune failed for ${companyId}`, error);
            }
        }
        return null;
    });
