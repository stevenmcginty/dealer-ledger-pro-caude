"use strict";
/**
 * Utility to get company IDs without downloading all company data.
 * Uses Firebase REST API with shallow=true to only retrieve keys.
 * This avoids downloading the entire /companies tree (1.1MB+) on every function invocation.
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
exports.getCompanyIds = void 0;
const admin = __importStar(require("firebase-admin"));
const getCompanyIds = async () => {
    const dbUrl = admin.app().options.databaseURL;
    if (!dbUrl)
        return [];
    const credential = admin.app().options.credential;
    if (!credential)
        return [];
    try {
        const token = await credential.getAccessToken();
        const url = `${dbUrl}/companies.json?shallow=true`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token.access_token}` }
        });
        if (!response.ok) {
            console.error(`Shallow read failed: ${response.status}`);
            return [];
        }
        const data = await response.json();
        return data ? Object.keys(data) : [];
    }
    catch (error) {
        console.error('Failed to get company IDs:', error);
        return [];
    }
};
exports.getCompanyIds = getCompanyIds;
//# sourceMappingURL=companyIds.js.map