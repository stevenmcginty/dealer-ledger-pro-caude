"use strict";
/**
 * Normalised shape returned by the vehicle lookup callable.
 *
 * Two government sources feed this:
 *  - DVSA MOT History API (make, model, colour, engine, MOT expiry, odometer history)
 *  - DVLA Vehicle Enquiry Service (tax status, CO2, V5C dates) — only when a VES key
 *    is configured; the fields stay undefined otherwise.
 *
 * On top of the two records sits a third layer that is derived rather than
 * fetched: what the road tax actually costs, what the fuel costs, the company
 * car band, clean air zone compliance, age and use. Neither API publishes any
 * of it — see vehicle/ved.ts for the tables and the workings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map