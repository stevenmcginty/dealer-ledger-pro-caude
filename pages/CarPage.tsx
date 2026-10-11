import React, { useEffect, useMemo, useState } from 'react';
import { Vehicle, SalesDocument, DocumentType, PDI, ToDoItem } from '../types';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import { formatCurrency, formatDate } from '../utils/helpers';
import {
    ChevronDownIcon, ChevronRightIcon, DocumentTextIcon, EditIcon, PlusIcon, ShieldCheckIcon,
    UndoIcon, ArrowTopRightOnSquareIcon, CarIcon,
} from '../components/icons';
import { Alert, Button, DocChip, EmptyState, IconButton, Plate, StatusChip } from '../components/ui';
import type { DocKind } from '../components/ui';
import { cx } from '../components/ui/cx';
import { SectionLabel, VehicleStatusChip, carDocs, daysUntil, motWarning, pdiVerdict, wholePounds } from '../components/stock/parts';

/*
 * The Car page: one car's facts, money, prep, PDI, paperwork and the next step,
 * in one calm column. Every action opens the same editors and dialogs the old
 * vehicle-actions modal opened, with the same data, so nothing it saves changes.
 */

const DOC_KIND: Record<DocumentType, DocKind> = {
    'Sales Invoice': 'SI',
    'Proforma Invoice': 'PF',
    'Deposit Slip': 'DS',
    'Purchase Invoice': 'PI',
};

const daysBetween = (from: string, to: Date): number => {
    const start = new Date(from);
    if (isNaN(start.getTime())) return 0;
    return Math.ceil(Math.max(0, to.getTime() - start.getTime()) / 86_400_000);
};

/** A collapsible section. Native details/summary: works without JS and reads as expanded/collapsed. */
const Section: React.FC<{
    title: string;
    summary?: React.ReactNode;
    defaultOpen?: boolean;
    children: React.ReactNode;
    className?: string;
}> = ({ title, summary, defaultOpen = true, children, className }) => (
    <details open={defaultOpen} className={cx('group rounded-card border border-line bg-surface', className)}>
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 rounded-card px-4 transition-colors duration-quick ease-out hover:bg-surface-2 group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
            <h2 className="flex-1 text-base font-bold text-ink">{title}</h2>
            {summary && <span className="text-sm font-semibold text-ink-2">{summary}</span>}
            <ChevronDownIcon className="h-5 w-5 flex-none text-ink-3 transition-transform duration-quick ease-out group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-4 pb-4 pt-1">{children}</div>
    </details>
);

/** One line of the money block: words on the start, mono figure on the end. */
const MoneyLine: React.FC<{ label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: 'up' | 'down' | 'muted' }> = ({ label, value, strong, tone }) => (
    <div className={cx('flex items-baseline justify-between gap-4 py-2.5', strong && 'mt-1 border-t border-line-strong pt-3')}>
        <dt className={cx('min-w-0 text-sm', strong ? 'font-bold text-ink' : 'text-ink-2')}>{label}</dt>
        <dd className={cx(
            'num m-0 whitespace-nowrap text-end',
            strong ? 'text-lg font-bold' : 'text-base font-semibold',
            tone === 'up' ? 'text-success' : tone === 'down' ? 'text-danger' : tone === 'muted' ? 'text-ink-3' : 'text-ink',
        )}>{value}</dd>
    </div>
);

/** A fact in the strip under the title. */
const Fact: React.FC<{ label: string; value: React.ReactNode; warn?: boolean }> = ({ label, value, warn }) => (
    <div className="min-w-0 px-3 py-3 first:ps-0 last:pe-0">
        <dt className="text-xs font-semibold text-ink-3">{label}</dt>
        <dd className={cx('num m-0 mt-0.5 truncate text-base font-semibold', warn ? 'text-warning' : 'text-ink')}>{value}</dd>
    </div>
);

/** A row in a section that opens something: icon tile, two lines, chevron. */
const ActionRow: React.FC<{
    onClick?: () => void;
    href?: string;
    leading: React.ReactNode;
    title: React.ReactNode;
    meta?: React.ReactNode;
    end?: React.ReactNode;
    external?: boolean;
}> = ({ onClick, href, leading, title, meta, end, external }) => {
    const inner = (
        <>
            <span className="flex flex-none">{leading}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-base font-semibold leading-tight text-ink">{title}</span>
                {meta && <span className="truncate text-sm leading-tight text-ink-3">{meta}</span>}
            </span>
            {end}
            {external
                ? <ArrowTopRightOnSquareIcon className="h-5 w-5 flex-none text-ink-3" />
                : <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3" />}
        </>
    );
    const cls = '-mx-2 flex min-h-[56px] w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3';
    return href
        ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
        : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
};

/** Tablet/desktop: the stock list stays beside the car, so moving between cars keeps your place. */
const StockRail: React.FC<{ vehicles: Vehicle[]; currentId: string; onOpen: (id: string) => void; onAll: () => void }> = ({ vehicles, currentId, onOpen, onAll }) => {
    const list = useMemo(
        () => vehicles
            .filter(v => v.status !== 'Sold' || v.id === currentId)
            .sort((a, b) => (a.purchaseDate || '').localeCompare(b.purchaseDate || '')),
        [vehicles, currentId],
    );
    return (
        <nav aria-label="Cars in stock" className="hidden lg:sticky lg:top-0 lg:block">
            <div className="flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-card border border-line bg-surface">
                <div className="flex items-center justify-between gap-2 border-b border-line py-1 pe-1 ps-4">
                    <SectionLabel as="p">In stock · {list.filter(v => v.status !== 'Sold').length}</SectionLabel>
                    <Button variant="ghost" size="sm" onClick={onAll}>All stock</Button>
                </div>
                <ul className="m-0 list-none overflow-y-auto p-0">
                    {list.map(v => {
                        const current = v.id === currentId;
                        return (
                            <li key={v.id}>
                                <button
                                    type="button"
                                    onClick={() => onOpen(v.id)}
                                    aria-current={current ? 'page' : undefined}
                                    className={cx(
                                        'relative flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-start transition-colors duration-quick ease-out',
                                        current ? 'bg-accent-soft' : 'hover:bg-surface-2 active:bg-surface-3',
                                    )}
                                >
                                    {current && <span aria-hidden="true" className="absolute inset-y-0 start-0 w-[3px] bg-accent" />}
                                    <Plate reg={v.reg || '—'} size="sm" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{v.make} {v.model}</span>
                                    <span className="num flex-none text-sm text-ink-2">{v.advertisedPrice ? wholePounds(v.advertisedPrice) : ''}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </nav>
    );
};

const CarPage: React.FC<{ vehicleId: string }> = ({ vehicleId }) => {
    const { vehicles, salesDocs, pdis, todos, allReceipts, isVatRegistered } = useData();
    const { openModal, setView, openVehicle } = useUI();

    const vehicle = vehicles.find(v => v.id === vehicleId);
    const backToStock = () => setView('stock');

    // Soft entrance, keyed to the car so moving along the rail re-plays it.
    // Global CSS cuts transitions to 1ms under prefers-reduced-motion.
    const [shown, setShown] = useState(false);
    useEffect(() => {
        setShown(false);
        const raf = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(raf);
    }, [vehicleId]);

    const docs = useMemo(() => carDocs(salesDocs, vehicleId), [salesDocs, vehicleId]);
    const { depositDoc, salesDoc, proformaDoc } = docs;

    const latestPdi: PDI | undefined = useMemo(() => (pdis as PDI[])
        .filter(pdi => pdi.vehicleId === vehicleId)
        .sort((a, b) => (b.inspectionDate || '').localeCompare(a.inspectionDate || '') || (b.createdAt || 0) - (a.createdAt || 0))[0],
    [pdis, vehicleId]);

    const prep = useMemo(() => {
        const jobs = (todos as ToDoItem[]).filter(t => t.type === 'prep' && t.vehicleId === vehicleId);
        const open = jobs.filter(t => !t.isComplete).sort((a, b) => (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0) || a.createdAt - b.createdAt);
        return { all: jobs.length, open, done: jobs.length - open.length };
    }, [todos, vehicleId]);

    const costs = useMemo(() => {
        const list = allReceipts.filter(r => r.vehicleId === vehicleId);
        // Net of VAT when it can be claimed back, so the profit line is what's actually kept.
        const total = list.reduce((sum, r) => sum + (r.amount || 0) - (isVatRegistered ? (r.vat || 0) : 0), 0);
        return { count: list.length, total };
    }, [allReceipts, vehicleId, isVatRegistered]);

    if (!vehicle) {
        return (
            <div className="mx-auto max-w-xl rounded-card border border-line bg-surface">
                <EmptyState
                    icon={<CarIcon />}
                    title="That car isn’t in this ledger"
                    description="It may have been deleted, or it belongs to the other ledger."
                    actionLabel="Back to stock"
                    onAction={backToStock}
                />
            </div>
        );
    }

    const isSold = vehicle.status === 'Sold';
    const isReserved = vehicle.status === 'Deposit Paid';
    const isSor = vehicle.ownershipType === 'Sale or Return';
    const name = `${vehicle.make} ${vehicle.model}`.trim() || 'Unnamed car';
    const saleDate = salesDoc?.invoiceDate ? new Date(salesDoc.invoiceDate) : null;
    const daysInStock = daysBetween(vehicle.purchaseDate, isSold && saleDate && !isNaN(saleDate.getTime()) ? saleDate : new Date());
    const mot = motWarning(vehicle);
    const motDays = daysUntil(vehicle.motDueDate);

    // Same rule the margin report uses: VAT on margin = margin ÷ 6 for margin-scheme (and SOR) cars, when VAT registered.
    const marginVat = (margin: number) =>
        isVatRegistered && (vehicle.vatScheme === 'Margin' || isSor) && margin > 0 ? margin / 6 : 0;

    const salePrice = isSold && salesDoc ? salesDoc.price : vehicle.advertisedPrice || null;
    const margin = salePrice !== null ? salePrice - vehicle.purchasePrice : null;
    const vatOnMargin = margin !== null ? marginVat(margin) : 0;
    const profit = margin !== null ? margin - vatOnMargin - costs.total : null;

    // Every action opens the editor/dialog the vehicle-actions modal opened, with the same data.
    const editCar = () => openModal('vehicle', vehicle);
    const newDoc = (docType: DocumentType) => openModal('invoice', { vehicle, docType });
    const viewDoc = (doc: SalesDocument) => openModal('invoice', { viewOnly: true, document: doc });
    const editDoc = (doc: SalesDocument) => openModal('editInvoice', doc);

    const primary: { label: string; onClick: () => void } | null =
        vehicle.status === 'Available' ? { label: 'Sell this car', onClick: () => newDoc('Sales Invoice') }
            : isReserved ? { label: 'Finish sale', onClick: () => newDoc('Sales Invoice') }
                : salesDoc ? { label: 'View invoice', onClick: () => viewDoc(salesDoc) }
                    : null;

    const v5cLinks = vehicle.v5cUrls || (vehicle.v5cUrl ? [vehicle.v5cUrl] : []);
    const docRows = [salesDoc, proformaDoc, depositDoc].filter((d): d is SalesDocument => !!d);
    const docCount = docRows.length + v5cLinks.length + (vehicle.invoiceUrl ? 1 : 0);

    const subtitle = [vehicle.year || null, vehicle.fuelType, vehicle.color].filter(Boolean).join(' · ');

    const details: Array<[string, React.ReactNode]> = ([
        ['Stock no.', vehicle.stockNumber ? <span className="num">#{vehicle.stockNumber}</span> : null],
        ['VIN', vehicle.vin ? <span className="num break-all">{vehicle.vin.toUpperCase()}</span> : null],
        ['Engine', vehicle.engineSize ? `${vehicle.engineSize} cc` : null],
        ['First registered', vehicle.firstRegistered ? formatDate(vehicle.firstRegistered) : null],
        ['CO2', typeof vehicle.co2Emissions === 'number' ? `${vehicle.co2Emissions} g/km` : null],
        ['Tax', vehicle.taxStatus ? `${vehicle.taxStatus}${vehicle.taxDueDate ? ` to ${formatDate(vehicle.taxDueDate)}` : ''}` : null],
        ['ULEZ', typeof vehicle.ulezCompliant === 'boolean' ? (vehicle.ulezCompliant ? 'Compliant' : 'Not compliant') : null],
        ['VAT scheme', vehicle.vatScheme],
        ['Ownership', isSor ? `Sale or return${vehicle.sorOwner?.name ? ` for ${vehicle.sorOwner.name}` : ''}` : 'Owned'],
    ] as Array<[string, React.ReactNode]>).filter(([, v]) => v !== null && v !== undefined && v !== '');

    const fixes: React.ReactNode[] = [];
    if (vehicle.status === 'Available' && salesDoc) {
        fixes.push(
            <Alert key="stray" tone="warning" title="This car still has a sales invoice"
                actions={<Button size="sm" variant="secondary" icon={<UndoIcon />} onClick={() => openModal('undoSaleConfirm', salesDoc)}>Remove stray invoice</Button>}>
                It’s marked for sale, so reports count it as sold until the invoice goes.
            </Alert>,
        );
    }
    if (isReserved && depositDoc) {
        fixes.push(<Button key="undo-dep" variant="secondary" icon={<UndoIcon />} onClick={() => openModal('undoDepositConfirm', depositDoc)}>Undo deposit</Button>);
    }
    if (isSold && salesDoc) {
        fixes.push(<Button key="undo-sale" variant="secondary" icon={<UndoIcon />} onClick={() => openModal('undoSaleConfirm', salesDoc)}>Undo sale</Button>);
    }
    if (isSold && !salesDoc) {
        fixes.push(
            <Alert key="fix" tone="warning" title="Sold, but there’s no sales invoice"
                actions={<Button size="sm" variant="secondary" icon={<UndoIcon />} onClick={() => openModal('forceUndoSaleConfirm', vehicle)}>Fix sale status</Button>}>
                Put it back in stock, then sell it again with an invoice.
            </Alert>,
        );
    }

    return (
        <div className="lg:grid lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
            <StockRail vehicles={vehicles} currentId={vehicleId} onOpen={openVehicle} onAll={backToStock} />

            <article
                key={vehicleId}
                aria-labelledby="car-title"
                className={cx(
                    // A column at least the height of the screen, so the action bar sits at the bottom even on a short page.
                    'mx-auto flex min-h-[calc(100dvh-10rem)] w-full min-w-0 max-w-3xl flex-col transition-[opacity,transform] duration-base ease-out md:min-h-[calc(100dvh-6rem)] lg:mx-0',
                    shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
                )}
            >
                {/* Who the car is */}
                <header className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Plate reg={vehicle.reg || '—'} size="lg" />
                        <span className="num text-base font-semibold text-ink-3">#{vehicle.stockNumber || '—'}</span>
                        <span className="ms-auto flex flex-wrap items-center gap-1.5">
                            {mot && <StatusChip status="due" size="lg">{mot}</StatusChip>}
                            {isSor && <StatusChip status="neutral" size="lg">SOR</StatusChip>}
                            <VehicleStatusChip status={vehicle.status} size="lg" />
                        </span>
                    </div>
                    {/* The shell's header carries the name and the Back button; this line says what kind of car and how long it has sat. */}
                    <h2 id="car-title" className="text-lg font-semibold leading-snug text-ink">
                        <span className="sr-only">{name}, </span>
                        {subtitle}{subtitle ? ' · ' : ''}
                        <span className={cx(!isSold && daysInStock >= 60 && 'text-warning')}>
                            {isSold ? `sold after ${daysInStock} days` : `${daysInStock} days in stock`}
                        </span>
                    </h2>
                    <dl className="m-0 grid grid-cols-3 divide-x divide-line border-y border-line rtl:divide-x-reverse">
                        <Fact label="Miles" value={vehicle.mileage ? vehicle.mileage.toLocaleString('en-GB') : '—'} />
                        <Fact
                            label="MOT to"
                            value={vehicle.motDueDate ? formatDate(vehicle.motDueDate, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                            warn={!isSold && motDays !== null && motDays <= 30}
                        />
                        <Fact label="Road tax" value={typeof vehicle.annualRoadTax === 'number' ? `£${vehicle.annualRoadTax.toLocaleString('en-GB')}/yr` : '—'} />
                    </dl>
                </header>

                <div className="mt-5 grid items-start gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {/* Money */}
                    <Section
                        title="Money"
                        summary={profit !== null ? <span className={cx('num', profit >= 0 ? 'text-success' : 'text-danger')}>{formatCurrency(profit)}</span> : undefined}
                    >
                        <dl className="m-0 divide-y divide-line">
                            <MoneyLine label={<>Bought{vehicle.purchaseDate ? <span className="text-ink-3"> {formatDate(vehicle.purchaseDate, { day: '2-digit', month: 'short' })}</span> : null}{isSor ? ' (owner payout)' : ''}</>} value={formatCurrency(vehicle.purchasePrice)} />
                            {isSold ? (
                                salesDoc
                                    ? <MoneyLine label={<>Sold{salesDoc.invoiceDate ? <span className="text-ink-3"> {formatDate(salesDoc.invoiceDate, { day: '2-digit', month: 'short' })}</span> : null}</>} value={formatCurrency(salesDoc.price)} />
                                    : <MoneyLine label="Sold" value={<span className="font-sans text-sm font-semibold">No invoice</span>} tone="muted" />
                            ) : (
                                <MoneyLine
                                    label="Asking price"
                                    value={vehicle.advertisedPrice ? formatCurrency(vehicle.advertisedPrice) : <button type="button" onClick={editCar} className="-my-3.5 inline-flex min-h-[48px] items-center font-sans text-sm font-semibold text-accent-text underline underline-offset-[3px]">Set a price</button>}
                                />
                            )}
                            {vatOnMargin > 0 && margin !== null && (
                                <MoneyLine label={<>VAT on margin <span className="num text-ink-3">({wholePounds(margin)} ÷ 6)</span></>} value={formatCurrency(-vatOnMargin)} tone="muted" />
                            )}
                            <MoneyLine
                                label={<>Costs on this car{costs.count > 0 && <span className="text-ink-3"> ({costs.count}{isVatRegistered ? ', ex VAT' : ''})</span>}</>}
                                value={costs.count > 0 ? formatCurrency(-costs.total) : <span className="font-sans text-sm font-semibold">None yet</span>}
                                tone="muted"
                            />
                            {profit !== null && (
                                <MoneyLine
                                    strong
                                    label={isSold ? 'Profit after VAT and costs' : 'Profit if sold at asking'}
                                    value={formatCurrency(profit)}
                                    tone={profit >= 0 ? 'up' : 'down'}
                                />
                            )}
                        </dl>
                    </Section>

                    {/* Prep & PDI */}
                    <Section
                        title="Prep and PDI"
                        summary={prep.all > 0 ? <span className="num">{prep.done} of {prep.all}</span> : undefined}
                    >
                        <SectionLabel as="h3" className="mt-3">Prep jobs</SectionLabel>
                        {prep.open.length > 0 ? (
                            <ul className="m-0 mt-1 list-none p-0">
                                {prep.open.map(job => (
                                    <li key={job.id}>
                                        <button
                                            type="button"
                                            onClick={() => openModal('todo', { type: 'prep', editingTodo: job })}
                                            className="-mx-2 flex min-h-[48px] w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
                                        >
                                            <span aria-hidden="true" className={cx('h-2 w-2 flex-none rotate-45 rounded-[1px]', job.priority === 'high' ? 'bg-danger' : 'bg-warning')} />
                                            <span className="min-w-0 flex-1 text-base text-ink">{job.description}</span>
                                            {job.priority === 'high' && <span className="text-xs font-semibold text-danger">Urgent</span>}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-1 py-2 text-sm text-ink-3">{prep.all > 0 ? `All ${prep.all} prep jobs done.` : 'No prep jobs on this car.'}</p>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="-ms-3"
                            icon={<PlusIcon />}
                            onClick={() => openModal('todo', { type: 'prep', prefillData: { vehicleReg: vehicle.reg } })}
                        >
                            Add prep job
                        </Button>

                        <SectionLabel as="h3" className="mt-4 border-t border-line pt-4">PDI</SectionLabel>
                        {latestPdi ? (
                            <ActionRow
                                onClick={() => openModal('pdi', { viewOnly: true, pdi: latestPdi })}
                                leading={<span className="grid h-10 w-10 place-items-center rounded-control bg-surface-2 text-ink-2"><ShieldCheckIcon className="h-5 w-5" /></span>}
                                title={<>PDI <span className="num">#{latestPdi.pdiNumber}</span></>}
                                meta={formatDate(latestPdi.inspectionDate)}
                                end={(() => { const v = pdiVerdict(latestPdi); return <StatusChip status={v.status}>{v.label}</StatusChip>; })()}
                            />
                        ) : (
                            <p className="mt-1 py-2 text-sm text-ink-3">No PDI yet. Do one before the car goes to its buyer.</p>
                        )}
                        <Button variant="ghost" size="sm" className="-ms-3" icon={<PlusIcon />} onClick={() => openModal('pdi', { vehicle })}>
                            {latestPdi ? 'New PDI' : 'Start PDI'}
                        </Button>
                    </Section>

                    {/* Documents */}
                    <Section title="Documents" summary={docCount > 0 ? <span className="num">{docCount}</span> : undefined}>
                        <div className="mt-1">
                            {docRows.map(doc => (
                                <div key={doc.id} className="flex items-center gap-1">
                                    <div className="min-w-0 flex-1">
                                        <ActionRow
                                            onClick={() => viewDoc(doc)}
                                            leading={<DocChip kind={DOC_KIND[doc.documentType]} label={null} />}
                                            title={<>{doc.documentType === 'Proforma Invoice' ? 'Proforma' : doc.documentType === 'Deposit Slip' ? 'Deposit slip' : 'Sales invoice'} <span className="num text-ink-2">#{doc.invoiceNumber}</span></>}
                                            meta={[doc.invoiceDate ? formatDate(doc.invoiceDate) : null, doc.customerName].filter(Boolean).join(' · ')}
                                        />
                                    </div>
                                    {/* Editable where the old actions list offered Edit: not a stray invoice on a car that's back in stock. */}
                                    {!(doc === salesDoc && vehicle.status === 'Available') && (
                                        <IconButton label={`Edit ${doc.documentType.toLowerCase()} #${doc.invoiceNumber}`} icon={<EditIcon />} onClick={() => editDoc(doc)} />
                                    )}
                                </div>
                            ))}
                            {vehicle.invoiceUrl && (
                                <ActionRow
                                    href={vehicle.invoiceUrl}
                                    external
                                    leading={<DocChip kind="PI" label={null} />}
                                    title="Purchase invoice"
                                    meta={vehicle.purchaseDate ? formatDate(vehicle.purchaseDate) : undefined}
                                />
                            )}
                            {v5cLinks.map((url, i) => (
                                <ActionRow
                                    key={url + i}
                                    href={url}
                                    external
                                    leading={<span className="grid h-[26px] w-[34px] place-items-center rounded-chip border border-line-strong bg-surface-2 text-ink-2"><DocumentTextIcon className="h-4 w-4" /></span>}
                                    title={v5cLinks.length > 1 ? `V5C, page ${i + 1}` : 'V5C logbook'}
                                />
                            ))}
                            {docCount === 0 && <p className="py-2 text-sm text-ink-3">No paperwork yet. Invoices, proformas and deposit slips land here as you make them.</p>}
                        </div>
                        {!isSold && (
                            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                                {vehicle.status === 'Available' && (
                                    <Button size="sm" variant="secondary" onClick={() => newDoc('Deposit Slip')}>Take a deposit</Button>
                                )}
                                {!proformaDoc && (
                                    <Button size="sm" variant="secondary" onClick={() => newDoc('Proforma Invoice')}>Make a proforma</Button>
                                )}
                            </div>
                        )}
                    </Section>

                    {/* The rest of the record */}
                    <Section title="Car details" defaultOpen={false}>
                        <dl className="m-0 divide-y divide-line">
                            {details.map(([label, value]) => (
                                <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                                    <dt className="flex-none text-sm text-ink-2">{label}</dt>
                                    <dd className="m-0 min-w-0 text-end text-sm font-semibold text-ink">{value}</dd>
                                </div>
                            ))}
                        </dl>
                        <Button variant="ghost" size="sm" className="-ms-3 mt-1" icon={<EditIcon />} onClick={editCar}>Edit details</Button>
                    </Section>
                </div>

                {fixes.length > 0 && (
                    <section aria-labelledby="car-fix" className="mt-6 space-y-3">
                        <SectionLabel className="px-1"><span id="car-fix">Fix or undo</span></SectionLabel>
                        <div className="flex flex-col items-start gap-3">{fixes}</div>
                    </section>
                )}

                <div aria-hidden="true" className="h-6 flex-none" />
                {/* The next step, in thumb reach. */}
                <div className="sticky bottom-0 z-sticky -mx-4 -mb-10 mt-auto border-t border-line bg-surface px-4 pb-3 pt-3 md:-mx-6 md:px-6 lg:bottom-4 lg:mx-0 lg:mb-0 lg:rounded-card lg:border lg:p-3 lg:shadow-e2">
                    <div className="mx-auto flex max-w-3xl gap-3">
                        <Button variant="secondary" icon={<EditIcon />} onClick={editCar} className={primary ? 'flex-none' : 'flex-1'}>Edit</Button>
                        {primary && <Button className="flex-1" onClick={primary.onClick}>{primary.label}</Button>}
                    </div>
                </div>
            </article>
        </div>
    );
};

export default CarPage;
