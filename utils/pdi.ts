import type { PDI, PdiCheckStatus, PdiSection, PdiTyre, PdiTyrePosition } from '../types';

/**
 * The default Pre-Delivery Inspection template.
 *
 * Everything starts at 'pass' on purpose. A PDI is a formality on most cars, so
 * the inspector should be able to open the form, glance down it, knock two or
 * three items off and save — not tick fifty boxes by hand. The sections are a
 * snapshot copied on to each record (see the PDI type), so changing this list
 * never rewrites history on a PDI that has already been signed off.
 */
const TEMPLATE: { id: string; title: string; items: { id: string; label: string }[] }[] = [
    {
        id: 'road',
        title: 'Road Test & Roadworthiness',
        items: [
            { id: 'road-start', label: 'Engine starts and idles correctly' },
            { id: 'road-clutch', label: 'Clutch / transmission operation' },
            { id: 'road-gears', label: 'Gear selection through all gears' },
            { id: 'road-brakes', label: 'Brakes even and effective' },
            { id: 'road-handbrake', label: 'Handbrake / parking brake holds' },
            { id: 'road-steering', label: 'Steering — no pull, wander or vibration' },
            { id: 'road-suspension', label: 'Suspension — no knocks or excessive noise' },
            { id: 'road-test', label: 'Road test completed' },
        ],
    },
    {
        id: 'lights',
        title: 'Dashboard Warning Lights',
        items: [
            { id: 'warn-mil', label: 'Engine management (MIL) light off' },
            { id: 'warn-abs', label: 'ABS light off' },
            { id: 'warn-srs', label: 'Airbag / SRS light off' },
            { id: 'warn-oil', label: 'Oil pressure light off' },
            { id: 'warn-battery', label: 'Battery / charging light off' },
            { id: 'warn-tpms', label: 'Tyre pressure monitoring light off' },
            { id: 'warn-other', label: 'No other warning lights displayed' },
        ],
    },
    {
        id: 'exterior',
        title: 'Lights, Glass & Wipers',
        items: [
            { id: 'ext-headlights', label: 'Headlights — dipped and main beam' },
            { id: 'ext-sidelights', label: 'Sidelights and tail lights' },
            { id: 'ext-brakelights', label: 'Brake lights including high level' },
            { id: 'ext-indicators', label: 'Indicators and hazard lights' },
            { id: 'ext-reverse', label: 'Reverse and fog lights' },
            { id: 'ext-plate', label: 'Number plate lights' },
            { id: 'ext-screen', label: 'Windscreen free from chips and cracks' },
            { id: 'ext-wipers', label: 'Wipers and washers' },
            { id: 'ext-mirrors', label: 'Mirrors and glass condition' },
            { id: 'ext-horn', label: 'Horn' },
        ],
    },
    {
        id: 'bonnet',
        title: 'Under Bonnet',
        items: [
            { id: 'bon-oil', label: 'Engine oil level and condition' },
            { id: 'bon-coolant', label: 'Coolant level and antifreeze strength' },
            { id: 'bon-brakefluid', label: 'Brake fluid level' },
            { id: 'bon-psf', label: 'Power steering fluid where fitted' },
            { id: 'bon-screenwash', label: 'Screenwash topped up' },
            { id: 'bon-battery', label: 'Battery condition and terminals' },
            { id: 'bon-belt', label: 'Auxiliary belt condition' },
            { id: 'bon-leaks', label: 'No visible fluid leaks' },
        ],
    },
    {
        id: 'wheels',
        title: 'Wheels, Tyres & Brakes',
        items: [
            { id: 'whl-pads', label: 'Brake pads and discs within limits' },
            { id: 'whl-torque', label: 'Wheel nuts torqued to specification' },
            { id: 'whl-lockingnut', label: 'Locking wheel nut key present' },
            { id: 'whl-pressures', label: 'Tyre pressures set' },
            { id: 'whl-spare', label: 'Spare wheel or repair kit present' },
            { id: 'whl-damage', label: 'Wheels free from significant damage' },
        ],
    },
    {
        id: 'interior',
        title: 'Interior & Electrics',
        items: [
            { id: 'int-belts', label: 'Seat belts — condition and operation' },
            { id: 'int-seats', label: 'Seat adjustment and operation' },
            { id: 'int-climate', label: 'Heating, ventilation and air conditioning' },
            { id: 'int-stereo', label: 'Stereo / radio and speakers operate' },
            { id: 'int-satnav', label: 'Satellite navigation operates' },
            { id: 'int-windows', label: 'Electric windows and mirrors' },
            { id: 'int-locking', label: 'Central locking and both keys operate' },
            { id: 'int-lighting', label: 'Interior lighting' },
        ],
    },
    {
        id: 'docs',
        title: 'Documentation & Handover',
        items: [
            { id: 'doc-v5c', label: 'V5C registration document present' },
            { id: 'doc-mot', label: 'MOT certificate valid' },
            { id: 'doc-handbook', label: 'Handbook and manuals present' },
            { id: 'doc-recall', label: 'Outstanding recalls checked' },
            { id: 'doc-valet', label: 'Vehicle valeted inside and out' },
        ],
    },
];

export const TYRE_POSITIONS: { position: PdiTyrePosition; label: string }[] = [
    { position: 'NSF', label: 'Nearside Front' },
    { position: 'OSF', label: 'Offside Front' },
    { position: 'NSR', label: 'Nearside Rear' },
    { position: 'OSR', label: 'Offside Rear' },
    { position: 'Spare', label: 'Spare' },
];

/** UK legal minimum tread across the centre three quarters of the tyre. */
export const LEGAL_TREAD_MM = 1.6;
/** Below this a tyre is worth flagging to a customer even though it is legal. */
export const ADVISORY_TREAD_MM = 3;

export const createDefaultPdiSections = (): PdiSection[] =>
    TEMPLATE.map(section => ({
        id: section.id,
        title: section.title,
        items: section.items.map(item => ({ id: item.id, label: item.label, status: 'pass' as PdiCheckStatus, note: null })),
    }));

export const createDefaultPdiTyres = (): PdiTyre[] =>
    TYRE_POSITIONS.map(({ position }) => ({
        position,
        make: null,
        size: null,
        treadDepth: null,
        status: 'pass' as PdiCheckStatus,
        // A spare is off the certificate unless the inspector says there is one;
        // most modern cars carry a sealant kit instead.
        fitted: position !== 'Spare',
    }));

export const PDI_STATUS_LABEL: Record<PdiCheckStatus, string> = {
    pass: 'Pass',
    advisory: 'Advisory',
    fail: 'Fail',
    na: 'N/A',
};

/** Clicking a check cycles through the four states in this order. */
const STATUS_CYCLE: PdiCheckStatus[] = ['pass', 'advisory', 'fail', 'na'];

export const nextPdiStatus = (status: PdiCheckStatus): PdiCheckStatus =>
    STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length];

/**
 * Where a measured tread depth sits against the legal limit. Returns null when
 * nothing has been measured, so an un-filled row stays neutral rather than
 * printing as a failure.
 */
export const treadVerdict = (depth?: number | null): PdiCheckStatus | null => {
    if (depth === null || depth === undefined || isNaN(depth)) return null;
    if (depth < LEGAL_TREAD_MM) return 'fail';
    if (depth < ADVISORY_TREAD_MM) return 'advisory';
    return 'pass';
};

/** Every item and fitted tyre that is not a plain pass, flattened for the summary band. */
export const pdiExceptions = (pdi: Pick<PDI, 'sections' | 'tyres'>) => {
    const fromChecks = (pdi.sections || []).flatMap(section =>
        section.items
            .filter(item => item.status === 'advisory' || item.status === 'fail')
            .map(item => ({ status: item.status, label: item.label, detail: item.note || '', group: section.title }))
    );
    const fromTyres = (pdi.tyres || [])
        .filter(tyre => tyre.fitted !== false)
        .flatMap(tyre => {
            const measured = treadVerdict(tyre.treadDepth);
            const status = tyre.status === 'pass' && measured && measured !== 'pass' ? measured : tyre.status;
            if (status !== 'advisory' && status !== 'fail') return [];
            const label = TYRE_POSITIONS.find(p => p.position === tyre.position)?.label || tyre.position;
            const detail = tyre.treadDepth != null ? `${tyre.treadDepth}mm tread` : '';
            return [{ status, label: `${label} tyre`, detail, group: 'Wheels, Tyres & Brakes' }];
        });
    return [...fromChecks, ...fromTyres];
};

/** Max-plus-one over the PDIs already in memory, matching the job sheet convention. */
export const nextPdiNumber = (pdis: Pick<PDI, 'pdiNumber'>[]): string => {
    const highest = (pdis || []).reduce((max, pdi) => {
        const parsed = parseInt(String(pdi.pdiNumber || '').replace(/\D/g, ''), 10);
        return !isNaN(parsed) && parsed > max ? parsed : max;
    }, 1000);
    return String(highest + 1);
};

/**
 * Older records, or records written by a future template, may be missing the
 * arrays entirely. Read through this so the editor and the certificate never
 * have to guard for it.
 */
export const withPdiDefaults = (pdi: Partial<PDI> | null | undefined): Pick<PDI, 'sections' | 'tyres'> => ({
    sections: pdi?.sections?.length ? pdi.sections : createDefaultPdiSections(),
    tyres: pdi?.tyres?.length ? pdi.tyres : createDefaultPdiTyres(),
});
