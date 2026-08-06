/**
 * DVLA Vehicle Enquiry Service (VES) client.
 *
 * Optional second source. It fills in what the MOT API has no concept of — tax
 * status and due date, CO2, euro status, V5C issue date — and it also covers
 * vehicles too new to have an MOT record. When no key is configured every call
 * returns null and the lookup proceeds on MOT data alone.
 */

import { getVesApiKey, getVesEndpoint } from './credentials';

export interface RawVesVehicle {
    registrationNumber?: string;
    taxStatus?: string;
    taxDueDate?: string;
    motStatus?: string;
    motExpiryDate?: string;
    make?: string;
    yearOfManufacture?: number;
    monthOfFirstRegistration?: string;
    engineCapacity?: number;
    co2Emissions?: number;
    fuelType?: string;
    colour?: string;
    typeApproval?: string;
    wheelplan?: string;
    revenueWeight?: number;
    euroStatus?: string;
    dateOfLastV5CIssued?: string;
    markedForExport?: boolean;
}

export const isVesConfigured = (): boolean => !!getVesApiKey();

/** Returns null when VES has no record, or when no API key is configured. */
export const fetchVesVehicle = async (reg: string): Promise<RawVesVehicle | null> => {
    const apiKey = getVesApiKey();
    if (!apiKey) return null;

    const res = await fetch(getVesEndpoint(), {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ registrationNumber: reg }),
    });

    if (res.status === 404) return null;

    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`DVLA VES lookup failed (${res.status}): ${detail.slice(0, 300)}`);
    }

    return (await res.json()) as RawVesVehicle;
};
