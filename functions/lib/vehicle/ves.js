"use strict";
/**
 * DVLA Vehicle Enquiry Service (VES) client.
 *
 * Optional second source. It fills in what the MOT API has no concept of — tax
 * status and due date, CO2, euro status, V5C issue date — and it also covers
 * vehicles too new to have an MOT record. When no key is configured every call
 * returns null and the lookup proceeds on MOT data alone.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchVesVehicle = exports.isVesConfigured = void 0;
const credentials_1 = require("./credentials");
const isVesConfigured = () => !!(0, credentials_1.getVesApiKey)();
exports.isVesConfigured = isVesConfigured;
/** Returns null when VES has no record, or when no API key is configured. */
const fetchVesVehicle = async (reg) => {
    const apiKey = (0, credentials_1.getVesApiKey)();
    if (!apiKey)
        return null;
    const res = await fetch((0, credentials_1.getVesEndpoint)(), {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ registrationNumber: reg }),
    });
    if (res.status === 404)
        return null;
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`DVLA VES lookup failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    return (await res.json());
};
exports.fetchVesVehicle = fetchVesVehicle;
//# sourceMappingURL=ves.js.map