import React, { useCallback, useState } from 'react';
import { Avatar, Button, EmptyState, IconButton, Plate, StatusChip } from '../components/ui';
import { cx, eyebrow } from '../components/ui/cx';
import { UserGroupIcon, PhoneIcon, EnvelopeIcon, DocumentTextIcon, ArrowLeftIcon, EditIcon, WhatsAppIcon, CarIcon, ClockIcon } from '../components/icons';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import { LeadStage } from '../types';
import ActivityTimeline from '../components/crm/ActivityTimeline';
import StartWhatsAppSheet from '../components/salesAgent/StartWhatsAppSheet';
import { requestAgentConversation } from '../utils/agentInboxLink';
import { STAGE_CHIP, STAGE_LABEL, STAGE_ORDER, daysInStage, fullName as nameOf, STALE_DAYS } from '../components/crm/leadStage';
import StageMark from '../components/crm/StageMark';
import { VEHICLE_CHIP } from '../components/sales/docMeta';
import { formatCurrency } from '../utils/helpers';

const STAGE_OPTIONS = STAGE_ORDER;

const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** A section heading in the ledger's small mono caps. */
const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode; id?: string }> = ({ children, action, id }) => (
    <div className="mb-2 flex min-h-[36px] items-center justify-between gap-3">
        <h2 id={id} className={eyebrow}>{children}</h2>
        {action && <div className="flex flex-none items-center gap-1">{action}</div>}
    </div>
);

/** Call / WhatsApp / Email: one row, equal weight, never the accent. */
const contactButton =
    'inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink ' +
    'transition-[background-color,transform] duration-quick ease-out hover:bg-surface-2 active:scale-[.97] active:bg-surface-3 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:flex-none';

const LeadDetailPage: React.FC = () => {
    const { companyId, leads, selectedLeadId, vehicles, updateLeadStage } = useData();
    const { setView, openModal } = useUI();
    const [whatsAppOpen, setWhatsAppOpen] = useState(false);

    const lead = leads.find(l => l.id === selectedLeadId);

    const handleBack = useCallback(() => {
        setView('pipeline');
    }, [setView]);

    const handleEditLead = useCallback(() => {
        if (lead) {
            openModal('lead', { editingLead: lead });
        }
    }, [lead, openModal]);

    const handleAddNote = useCallback(() => {
        if (lead) {
            openModal('addNote', { lead });
        }
    }, [lead, openModal]);

    const handleLogCall = useCallback(() => {
        if (lead) {
            openModal('logCall', { lead });
        }
    }, [lead, openModal]);

    const handleStageChange = useCallback(async (newStage: LeadStage) => {
        if (lead && lead.stage !== newStage) {
            await updateLeadStage(lead.id, newStage);
        }
    }, [lead, updateLeadStage]);

    const handleConvertToSale = useCallback(() => {
        if (lead) {
            openModal('convertToSale', { lead });
        }
    }, [lead, openModal]);

    if (!lead) {
        return (
            <EmptyState
                icon={<UserGroupIcon />}
                title="No lead open"
                description="Pick a lead from the pipeline to see who they are, the car they want and what happens next."
                actionLabel="Go to pipeline"
                onAction={handleBack}
                className="px-0"
            />
        );
    }

    const linkedVehicle = lead.vehicleId
        ? vehicles.find(v => v.id === lead.vehicleId)
        : null;

    const fullName = nameOf(lead);
    const isOpen = lead.stage !== LeadStage.WON && lead.stage !== LeadStage.LOST;
    const days = daysInStage(lead);
    const stale = isOpen && days > STALE_DAYS;
    const vehicleChip = linkedVehicle ? VEHICLE_CHIP[linkedVehicle.status] : null;

    /* ---- The car: the one they want, as the forecourt knows it ---- */
    const carBlock = (
        <section aria-labelledby="lead-car">
            <SectionTitle id="lead-car">The car</SectionTitle>
            <div className="rounded-card border border-line bg-surface p-4">
                {linkedVehicle ? (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <Plate reg={linkedVehicle.reg} />
                            {linkedVehicle.stockNumber && (
                                <span className="num text-sm font-semibold text-ink-3">#{linkedVehicle.stockNumber}</span>
                            )}
                            {vehicleChip && (
                                <StatusChip status={vehicleChip.status} className="ms-auto">{vehicleChip.label}</StatusChip>
                            )}
                        </div>
                        <p className="mt-3 text-lg font-bold leading-snug text-ink">
                            {linkedVehicle.make} {linkedVehicle.model}
                        </p>
                        <p className="num mt-0.5 text-sm text-ink-3">
                            {linkedVehicle.year} · {linkedVehicle.mileage.toLocaleString()} mi
                        </p>
                    </>
                ) : lead.vehicleOfInterest ? (
                    <p className="flex items-start gap-3 text-base text-ink">
                        <CarIcon className="mt-0.5 h-5 w-5 flex-none text-ink-3" aria-hidden="true" />
                        {lead.vehicleOfInterest}
                    </p>
                ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-ink-3">No car linked yet.</p>
                        <Button variant="ghost" size="sm" onClick={handleEditLead}>Link a car</Button>
                    </div>
                )}
                {lead.value ? (
                    <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3">
                        <span className="text-sm text-ink-2">Estimated value</span>
                        <span className="num text-lg font-semibold text-ink">{formatCurrency(lead.value)}</span>
                    </div>
                ) : null}
            </div>
        </section>
    );

    /* ---- The next step: one accent action on the page ----
       Phone: a footer fixed on top of the tab bar (--nav-h), in the thumb zone.
       Tablet and desktop: a card in the flow / at the top of the rail. */
    const nextStep = isOpen ? (
        <section
            aria-label="Next step"
            className={cx(
                'rounded-card border border-line bg-surface p-4',
                'max-md:fixed max-md:inset-x-0 max-md:z-sticky max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:px-4 max-md:py-3',
            )}
            style={{ bottom: 'max(var(--nav-h), env(safe-area-inset-bottom))' }}
        >
            <p className="text-sm text-ink-2 max-md:truncate">
                {linkedVehicle
                    ? <>Ready to sell {fullName.split(' ')[0]} the {linkedVehicle.make} {linkedVehicle.model}?</>
                    : <>Ready to sell {fullName.split(' ')[0]} a car?</>}
            </p>
            <Button block size="lg" className="mt-3 max-md:mt-2" onClick={handleConvertToSale}>
                Start sale
            </Button>
        </section>
    ) : (
        <section aria-label="Outcome" className={cx(
            'flex items-center gap-3 rounded-card border p-4',
            lead.stage === LeadStage.WON ? 'border-line bg-success-soft text-success-ink' : 'border-line bg-surface-2 text-ink-2',
        )}>
            <StatusChip status={STAGE_CHIP[lead.stage]} size="lg">{STAGE_LABEL[lead.stage]}</StatusChip>
            <p className="text-sm">
                {lead.stage === LeadStage.WON ? 'This lead bought a car.' : 'This lead did not buy. Move the stage back to reopen it.'}
            </p>
        </section>
    );

    /* ---- Stage: a two-second read, one tap to move ---- */
    const stageBlock = (
        <section aria-labelledby="lead-stage">
            <SectionTitle id="lead-stage">Stage</SectionTitle>
            <div role="radiogroup" aria-labelledby="lead-stage" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {STAGE_OPTIONS.map(stage => {
                    const current = lead.stage === stage;
                    return (
                        <button
                            key={stage}
                            type="button"
                            role="radio"
                            aria-checked={current}
                            onClick={() => handleStageChange(stage)}
                            className={cx(
                                'flex min-h-[48px] items-center gap-2 rounded-control border px-3 text-start text-sm font-semibold',
                                'transition-colors duration-quick ease-out',
                                current
                                    ? 'border-accent bg-accent-soft text-accent-soft-ink'
                                    : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2 hover:text-ink active:bg-surface-3',
                            )}
                        >
                            <StageMark stage={stage} />
                            {STAGE_LABEL[stage]}
                        </button>
                    );
                })}
            </div>
        </section>
    );

    /* ---- Contact facts ---- */
    const detailsBlock = (
        <section aria-labelledby="lead-details">
            <SectionTitle id="lead-details">Details</SectionTitle>
            <dl className="m-0 divide-y divide-line rounded-card border border-line bg-surface text-sm">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="flex-none text-ink-3">Email</dt>
                    <dd className="m-0 min-w-0 truncate text-end">
                        <a href={`mailto:${encodeURIComponent(lead.email)}`} className="font-semibold text-accent-text underline-offset-2 hover:underline">
                            {lead.email}
                        </a>
                    </dd>
                </div>
                {lead.phone && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <dt className="flex-none text-ink-3">Phone</dt>
                        <dd className="m-0 min-w-0 truncate text-end">
                            <a href={`tel:${encodeURIComponent(lead.phone)}`} className="num font-semibold text-accent-text underline-offset-2 hover:underline">
                                {lead.phone}
                            </a>
                        </dd>
                    </div>
                )}
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-ink-3">Source</dt>
                    <dd className="m-0 text-ink">{lead.source}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-ink-3">Created</dt>
                    <dd className="num m-0 text-ink">{shortDate(lead.createdAt)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-ink-3">Last updated</dt>
                    <dd className="num m-0 text-ink">{shortDate(lead.updatedAt)}</dd>
                </div>
            </dl>
        </section>
    );

    return (
        <div className="mx-auto max-w-6xl">
            {/* Top bar: back is read more than tapped, so it sits up here. */}
            <div className="-ms-3 mb-2 flex items-center justify-between gap-2">
                <IconButton label="Back to pipeline" icon={<ArrowLeftIcon />} onClick={handleBack} className="[&_svg]:rtl:-scale-x-100" />
                <Button variant="ghost" size="sm" icon={<EditIcon />} onClick={handleEditLead} className="-me-2">
                    Edit lead
                </Button>
            </div>

            {/* One flow on phones (person, next step, car, activity, stage, details);
                two columns on desktop with the next step at the top of the rail.
                The column wrappers dissolve (display: contents) below 1024px. */}
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
                <div className="contents lg:block lg:min-w-0 lg:space-y-6">
                    <header className="order-1 flex items-start gap-4">
                        <Avatar name={fullName} size="xl" />
                        <div className="min-w-0 flex-1 pt-0.5">
                            <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.01em] text-ink">{fullName}</h1>
                            <p className="mt-1 text-sm text-ink-3">{lead.source} lead · since {shortDate(lead.createdAt)}</p>
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                <StatusChip status={STAGE_CHIP[lead.stage]}>{STAGE_LABEL[lead.stage]}</StatusChip>
                                {isOpen && (
                                    <span className={cx('flex items-center gap-1 text-sm', stale ? 'font-semibold text-warning' : 'text-ink-3')}>
                                        {stale && <ClockIcon className="h-4 w-4" aria-hidden="true" />}
                                        <span className="num">{days}</span> {days === 1 ? 'day' : 'days'} in this stage
                                    </span>
                                )}
                            </div>
                        </div>
                    </header>

                    <div className="order-2 flex gap-2">
                        {lead.phone && (
                            <a href={`tel:${encodeURIComponent(lead.phone)}`} className={contactButton}>
                                <PhoneIcon aria-hidden="true" />Call
                            </a>
                        )}
                        {lead.phone && (
                            <button type="button" onClick={() => setWhatsAppOpen(true)} className={contactButton}>
                                <WhatsAppIcon aria-hidden="true" className="text-[#25d366]" />WhatsApp
                            </button>
                        )}
                        <a href={`mailto:${encodeURIComponent(lead.email)}`} className={contactButton}>
                            <EnvelopeIcon aria-hidden="true" />Email
                        </a>
                    </div>

                    <section aria-labelledby="lead-activity" className="order-5">
                        <SectionTitle
                            id="lead-activity"
                            action={
                                <>
                                    <Button variant="ghost" size="sm" icon={<DocumentTextIcon />} onClick={handleAddNote}>Add note</Button>
                                    <Button variant="ghost" size="sm" icon={<PhoneIcon />} onClick={handleLogCall}>Log call</Button>
                                </>
                            }
                        >
                            Activity
                        </SectionTitle>
                        <div className="rounded-card border border-line bg-surface p-4">
                            <ActivityTimeline activities={lead.history} />
                        </div>
                    </section>
                </div>

                <aside className="contents lg:block lg:space-y-6">
                    <div className="order-3">{nextStep}</div>
                    <div className="order-4">{carBlock}</div>
                    <div className="order-6">{stageBlock}</div>
                    <div className="order-7">{detailsBlock}</div>
                </aside>
            </div>
            {/* Room under the last block so the fixed phone footer never covers it. */}
            {isOpen && <div aria-hidden="true" className="h-28 md:hidden" />}

            {whatsAppOpen && companyId && (
                <StartWhatsAppSheet
                    companyId={companyId}
                    defaults={{
                        phone: lead.phone,
                        firstName: lead.firstName,
                        lastName: lead.lastName,
                        vehicleTitle: linkedVehicle
                            ? `${linkedVehicle.make} ${linkedVehicle.model}`.trim()
                            : lead.vehicleOfInterest,
                        leadId: lead.id,
                    }}
                    onClose={() => setWhatsAppOpen(false)}
                    onStarted={convId => {
                        setWhatsAppOpen(false);
                        requestAgentConversation(convId);
                        setView('agentInbox');
                    }}
                />
            )}
        </div>
    );
};

export default LeadDetailPage;
