import React, { useMemo, useState, useEffect } from 'react';
import { ToDoItem, Vehicle } from '../types';
import {
    ExclamationTriangleIcon, PlusIcon, CheckCircleIcon, CalendarIcon, ArchiveBoxIcon, XMarkIcon,
    ChevronRightIcon, ChatBubbleLeftRightIcon, BanknotesIcon, ClockIcon, PoundIcon, WrenchScrewdriverIcon,
} from '../components/icons';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import Calendar from '../components/common/Calendar';
import Spinner from '../components/common/Spinner';
import { toYYYYMMDD, formatCurrency, formatDate } from '../utils/helpers';
import DayTasksList, { ToDoItemRow } from '../components/todo/ToDoList';
import PrepDictation from '../components/work-prep/PrepDictation';
import { IconButton, Plate, StatusChip, EmptyState, Skeleton, SkeletonList, Checkbox } from '../components/ui';
import { cx } from '../components/ui/cx';

/*
 * Today: "what needs me now?" in two seconds.
 * Phone: Needs you, then the numbers, then prep, then tasks.
 * Tablet: two columns. Desktop: numbers across the top, then three columns.
 */

/** MOTs this close (or already expired) are shown. Same window as the alerts bell. */
const MOT_URGENT_DAYS = 30;
/** MOT rows shown before they fold into one "more" row. */
const MOT_ROWS_SHOWN = 3;

const daysUntil = (ymd: string): number => {
    const [y, m, d] = ymd.split('-').map(Number);
    const due = new Date(y, (m || 1) - 1, d || 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / 86400000);
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const statusChip = (status: Vehicle['status']) =>
    status === 'Deposit Paid' ? <StatusChip status="reserved">Deposit paid</StatusChip>
        : status === 'Sold' ? <StatusChip status="sold">Sold</StatusChip>
            : <StatusChip status="stock">In stock</StatusChip>;

// --- Section heading: title, a quiet count, and room for small actions on the end ---
const SectionHead: React.FC<{ id?: string; title: string; count?: number; children?: React.ReactNode }> = ({ id, title, count, children }) => (
    <div className="flex min-h-[48px] items-center gap-2">
        <h2 id={id} className="text-lg font-bold leading-tight tracking-[-0.01em] text-ink">{title}</h2>
        {count !== undefined && count > 0 && <span className="num text-sm font-semibold text-ink-3">{count}</span>}
        {children && <div className="ms-auto flex items-center gap-1">{children}</div>}
    </div>
);

// --- One "needs you" line: tone tile, what it is, the facts, one tap to the fix ---
type Tone = 'accent' | 'danger' | 'warning' | 'info' | 'success';
const TILE: Record<Tone, string> = {
    accent: 'bg-accent-soft text-accent-soft-ink',
    danger: 'bg-danger-soft text-danger-ink',
    warning: 'bg-warning-soft text-warning-ink',
    info: 'bg-info-soft text-info-ink',
    success: 'bg-success-soft text-success-ink',
};

interface NeedRowProps {
    tone: Tone;
    icon: React.ReactNode;
    title: React.ReactNode;
    meta?: React.ReactNode;
    onClick?: () => void;
    /** A second control on the end (kept outside the row button). */
    action?: React.ReactNode;
    /** Let the title run to two lines (warranty notes). */
    wrapTitle?: boolean;
}

const NeedRow: React.FC<NeedRowProps> = ({ tone, icon, title, meta, onClick, action, wrapTitle }) => {
    const body = (
        <>
            <span aria-hidden="true" className={cx('grid h-10 w-10 flex-none place-items-center rounded-control [&_svg]:h-5 [&_svg]:w-5', TILE[tone])}>{icon}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={cx('text-base font-semibold leading-[1.3] text-ink', wrapTitle ? 'line-clamp-2' : 'truncate')}>{title}</span>
                {meta && <span className="flex min-w-0 items-center gap-2 text-sm leading-[1.3] text-ink-3">{meta}</span>}
            </span>
        </>
    );
    return (
        <li className="flex items-center border-b border-line last:border-b-0">
            {onClick ? (
                <button
                    type="button"
                    onClick={onClick}
                    className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 ps-3.5 pe-2 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
                >
                    {body}
                    {!action && <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3 rtl:-scale-x-100" />}
                </button>
            ) : (
                <div className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 ps-3.5 pe-2">{body}</div>
            )}
            {action && <div className="flex flex-none pe-1">{action}</div>}
        </li>
    );
};

const Meta: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="min-w-0 truncate">{children}</span>;

// --- Needs you ---
const NeedsYou = () => {
    const { todos, vehicles, leads, transactions, financialAccounts, salesDocs, jobInvoices, isServiceBusiness } = useData();
    const { setView, openModal } = useUI();

    const newLeads = useMemo(() => (leads || []).filter(l => l.stage === 'New Lead'), [leads]);

    const warrantyClaims = useMemo(() => todos.filter(t => t.type === 'warranty' && !t.isComplete), [todos]);

    const mots = useMemo(() => {
        if (isServiceBusiness) return [];
        return vehicles
            .filter(v => v.status !== 'Sold' && v.motDueDate)
            .map(v => ({ vehicle: v, days: daysUntil(v.motDueDate!) }))
            .filter(r => r.days <= MOT_URGENT_DAYS)
            .sort((a, b) => a.days - b.days);
    }, [vehicles, isServiceBusiness]);

    const dueTasks = useMemo(() => {
        const today = toYYYYMMDD(new Date());
        const open = todos.filter(t => t.type === 'general' && !t.isComplete && t.dueDate && t.dueDate <= today);
        return { overdue: open.filter(t => t.dueDate! < today), today: open.filter(t => t.dueDate === today) };
    }, [todos]);

    const bank = useMemo(() => {
        const open = (transactions || []).filter(t => t.status === 'Unreconciled');
        const byAccount = new Map<string, number>();
        for (const t of open) {
            const name = financialAccounts.find(a => a.id === t.accountId)?.name || (t.type === 'Credit Card' ? 'Credit card' : 'Bank');
            byAccount.set(name, (byAccount.get(name) || 0) + 1);
        }
        return { count: open.length, split: [...byAccount.entries()].sort((a, b) => b[1] - a[1]) };
    }, [transactions, financialAccounts]);

    const owed = useMemo(() => {
        const docs = isServiceBusiness
            ? (jobInvoices || []).filter(i => i.status === 'Invoice' && i.balance > 0.005).map(i => ({ who: i.customerDetails?.name || '', date: i.invoiceDate, balance: i.balance }))
            : (salesDocs || []).filter(d => d.documentType === 'Sales Invoice' && d.balance > 0.005).map(d => ({ who: d.customerName, date: d.invoiceDate, balance: d.balance }));
        const oldest = [...docs].sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
        return { count: docs.length, total: docs.reduce((s, d) => s + d.balance, 0), oldest };
    }, [isServiceBusiness, jobInvoices, salesDocs]);

    const openMot = (vehicle: Vehicle) => {
        setView('stock');
        openModal('vehicle', vehicle);
    };

    const scrollToTasks = () => {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        document.getElementById('today-tasks')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };

    const rows: React.ReactNode[] = [];

    // People first.
    if (newLeads.length > 0) {
        const names = newLeads.slice(0, 2).map(l => `${l.firstName} ${l.lastName}`.trim()).join(', ');
        rows.push(
            <NeedRow key="leads" tone="accent" icon={<ChatBubbleLeftRightIcon />}
                title={plural(newLeads.length, 'new enquiry', 'new enquiries')}
                meta={<Meta>{names}{newLeads.length > 2 ? ` and ${newLeads.length - 2} more` : ''}</Meta>}
                onClick={() => setView('pipeline')} />,
        );
    }
    for (const claim of warrantyClaims) {
        const vehicle = vehicles.find(v => v.id === claim.vehicleId);
        const reg = vehicle?.reg || claim.vehicleReg;
        rows.push(
            <NeedRow key={claim.id} tone="danger" icon={<ExclamationTriangleIcon />} wrapTitle
                title={claim.description}
                meta={<>{reg && <Plate reg={reg} size="sm" />}<Meta>{vehicle ? `${vehicle.make} ${vehicle.model}` : 'Warranty claim'}</Meta></>}
                onClick={() => openModal('todo', { type: 'warranty', editingTodo: claim })}
                action={<IconButton label="Delete warranty claim" icon={<XMarkIcon />} onClick={() => openModal('deleteTodoConfirm', claim)} />} />,
        );
    }

    // Then deadlines.
    for (const { vehicle, days } of mots.slice(0, MOT_ROWS_SHOWN)) {
        const title = days < 0 ? `MOT ran out ${plural(-days, 'day', 'days')} ago`
            : days === 0 ? 'MOT runs out today'
                : `MOT runs out in ${plural(days, 'day', 'days')}`;
        rows.push(
            <NeedRow key={`mot-${vehicle.id}`} tone={days <= 7 ? 'danger' : 'warning'} icon={<ExclamationTriangleIcon />}
                title={title}
                meta={<><Plate reg={vehicle.reg} size="sm" /><Meta><span className="num">#{vehicle.stockNumber}</span> · {vehicle.make} {vehicle.model}</Meta></>}
                onClick={() => openMot(vehicle)} />,
        );
    }
    if (mots.length > MOT_ROWS_SHOWN) {
        const rest = mots.length - MOT_ROWS_SHOWN;
        rows.push(
            <NeedRow key="mot-more" tone="warning" icon={<ExclamationTriangleIcon />}
                title={`${plural(rest, 'more MOT', 'more MOTs')} due within ${MOT_URGENT_DAYS} days`}
                meta={<Meta>Open the stock list</Meta>}
                onClick={() => setView('stock')} />,
        );
    }
    const dueCount = dueTasks.overdue.length + dueTasks.today.length;
    if (dueCount > 0) {
        const title = dueTasks.overdue.length && dueTasks.today.length
            ? `${plural(dueTasks.overdue.length, 'task', 'tasks')} overdue, ${dueTasks.today.length} due today`
            : dueTasks.overdue.length ? `${plural(dueTasks.overdue.length, 'task', 'tasks')} overdue`
                : `${plural(dueTasks.today.length, 'task', 'tasks')} due today`;
        const first = [...dueTasks.overdue, ...dueTasks.today][0];
        rows.push(
            <NeedRow key="tasks" tone={dueTasks.overdue.length ? 'danger' : 'warning'} icon={<ClockIcon />}
                title={title} meta={<Meta>{first.dueTime ? `${first.dueTime} · ` : ''}{first.description}</Meta>}
                onClick={scrollToTasks} />,
        );
    }

    // Then money.
    if (bank.count > 0) {
        rows.push(
            <NeedRow key="bank" tone="warning" icon={<BanknotesIcon />}
                title={plural(bank.count, 'bank line to check', 'bank lines to check')}
                meta={<Meta>{bank.split.map(([name, n]) => `${name} ${n}`).join(' · ')}</Meta>}
                onClick={() => setView('expenses', { tab: 'bank' })} />,
        );
    }
    if (owed.count > 0) {
        rows.push(
            <NeedRow key="owed" tone="info" icon={<PoundIcon />}
                title={<><span className="num">{formatCurrency(owed.total)}</span> owed to you</>}
                meta={<Meta>{plural(owed.count, 'invoice', 'invoices')}{owed.oldest?.date ? ` · oldest ${formatDate(owed.oldest.date, { day: 'numeric', month: 'short' })}` : ''}{owed.count === 1 && owed.oldest?.who ? ` · ${owed.oldest.who}` : ''}</Meta>}
                onClick={() => setView(isServiceBusiness ? 'jobInvoices' : 'sales')} />,
        );
    }

    return (
        <section aria-labelledby="today-needs" className="[grid-area:needs] min-w-0">
            <SectionHead id="today-needs" title="Needs you" count={rows.length} />
            <ul className="m-0 mt-1 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
                {rows.length > 0 ? rows : (
                    <NeedRow tone="success" icon={<CheckCircleIcon />} title="Nothing needs you"
                        meta={<Meta>No enquiries, claims, MOTs or bank lines waiting.</Meta>} />
                )}
            </ul>
        </section>
    );
};

// --- At a glance: four numbers, one tap each ---
const Glance = () => {
    const { vehicles, todos, leads, jobInvoices, workSheets, isServiceBusiness } = useData();
    const { setView } = useUI();

    const cells = useMemo(() => {
        const activeLeads = (leads || []).filter(l => l.stage !== 'Sold' && l.stage !== 'Lost');
        const newLeads = activeLeads.filter(l => l.stage === 'New Lead').length;
        if (isServiceBusiness) {
            const quotes = (jobInvoices || []).filter(i => i.status === 'Quote');
            const owing = (jobInvoices || []).filter(i => i.status === 'Invoice' && i.balance > 0.005);
            const month = toYYYYMMDD(new Date()).slice(0, 7);
            const sheets = (workSheets || []).filter(s => (s.workDate || '').startsWith(month)).length;
            return [
                { label: 'Open quotes', value: String(quotes.length), sub: `${formatCurrency(quotes.reduce((s, q) => s + (q.total || 0), 0))} quoted`, go: 'jobInvoices' as const },
                { label: 'Owed', value: formatCurrency(owing.reduce((s, i) => s + i.balance, 0)), sub: plural(owing.length, 'invoice', 'invoices'), go: 'jobInvoices' as const },
                { label: 'Work sheets', value: String(sheets), sub: 'this month', go: 'workSheets' as const },
                { label: 'Open leads', value: String(activeLeads.length), sub: `${newLeads} new`, go: 'pipeline' as const },
            ];
        }
        const inStock = vehicles.filter(v => v.status === 'Available');
        const atCost = inStock.reduce((s, v) => s + (v.ownershipType === 'Sale or Return' ? 0 : v.purchasePrice || 0), 0);
        const deposits = vehicles.filter(v => v.status === 'Deposit Paid').length;
        const prepOpen = todos.filter(t => t.type === 'prep' && !t.isComplete);
        const prepCars = new Set(prepOpen.map(t => t.vehicleId).filter(Boolean)).size;
        return [
            { label: 'In stock', value: String(inStock.length), sub: `${formatCurrency(atCost)} at cost`, go: 'stock' as const },
            { label: 'Deposits', value: String(deposits), sub: deposits === 1 ? 'car held' : 'cars held', go: 'stock' as const },
            { label: 'Open leads', value: String(activeLeads.length), sub: `${newLeads} new`, go: 'pipeline' as const },
            { label: 'Prep jobs', value: String(prepOpen.length), sub: `on ${plural(prepCars, 'car', 'cars')}`, go: 'workPrep' as const },
        ];
    }, [vehicles, todos, leads, jobInvoices, workSheets, isServiceBusiness]);

    return (
        <section aria-labelledby="today-glance" className="[grid-area:glance] min-w-0">
            <SectionHead id="today-glance" title="At a glance" />
            <div className="mt-1 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
                {cells.map(c => (
                    <button
                        key={c.label}
                        type="button"
                        onClick={() => setView(c.go)}
                        className="flex min-h-[96px] min-w-0 flex-col items-start gap-1 bg-surface px-3.5 py-3 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
                    >
                        <span className="text-sm text-ink-2">{c.label}</span>
                        <span className="num max-w-full truncate text-2xl font-semibold leading-tight tracking-[-0.03em] text-ink">{c.value}</span>
                        <span className="max-w-full truncate text-xs font-semibold text-ink-3">{c.sub}</span>
                    </button>
                ))}
            </div>
        </section>
    );
};

// --- Prep: one block per car, jobs ticked off in place ---
const PrepTaskItem: React.FC<{ task: ToDoItem }> = ({ task }) => {
    const { updateToDo } = useData();
    const [isComplete, setIsComplete] = useState(task.isComplete);

    useEffect(() => {
        setIsComplete(task.isComplete);
    }, [task.isComplete]);

    const onToggleComplete = () => {
        const newCompleteState = !isComplete;
        setIsComplete(newCompleteState);
        updateToDo(task.id, { isComplete: newCompleteState });
    };

    return (
        <Checkbox
            checked={isComplete}
            onChange={onToggleComplete}
            className="px-3.5"
            label={<span className={cx('transition-colors duration-quick ease-out', isComplete ? 'text-ink-3 line-through' : 'text-ink')}>{task.description}</span>}
        />
    );
};

type PrepCar = { vehicle: Vehicle; tasks: ToDoItem[]; isFullyComplete: boolean };

const PrepCarBlock: React.FC<PrepCar> = ({ vehicle, tasks, isFullyComplete }) => {
    const { openModal } = useUI();
    const sortedTasks = [...tasks].sort((a, b) => (a.isComplete ? 1 : 0) - (b.isComplete ? 1 : 0) || a.createdAt - b.createdAt);
    const done = tasks.filter(t => t.isComplete).length;
    const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

    return (
        <li className="border-b border-line last:border-b-0">
            <div className="flex min-w-0 items-center gap-2 px-3.5 pt-3.5">
                <Plate reg={vehicle.reg} />
                <span className={cx('min-w-0 truncate text-base font-semibold', isFullyComplete ? 'text-ink-2' : 'text-ink')}>{vehicle.make} {vehicle.model}</span>
            </div>
            <div className="flex min-w-0 items-center gap-2.5 ps-3.5 pe-1">
                {isFullyComplete ? <StatusChip status="sold">Prep done</StatusChip> : statusChip(vehicle.status)}
                <span className="num flex-none text-sm font-semibold text-ink-2">{done}/{tasks.length}</span>
                <span
                    role="progressbar"
                    aria-label={`${vehicle.reg} prep`}
                    aria-valuemin={0}
                    aria-valuemax={tasks.length}
                    aria-valuenow={done}
                    className="h-1 min-w-[24px] flex-1 overflow-hidden rounded-full bg-surface-3"
                >
                    <span
                        className={cx('block h-full rounded-full transition-[width] duration-base ease-out', isFullyComplete ? 'bg-success' : 'bg-ink-2')}
                        style={{ width: `${pct}%` }}
                    />
                </span>
                <span className="flex flex-none items-center">
                    <IconButton label={`Add prep job for ${vehicle.reg}`} icon={<PlusIcon />} onClick={() => openModal('todo', { type: 'prep', prefillData: { vehicleReg: vehicle.reg } })} />
                    <IconButton label={`Archive prep for ${vehicle.reg}`} icon={<ArchiveBoxIcon />} onClick={() => openModal('archivePrepConfirm', { vehicle, tasks })} />
                </span>
            </div>
            <div className="pb-2">
                {sortedTasks.map(task => <PrepTaskItem key={task.id} task={task} />)}
            </div>
        </li>
    );
};

const VehiclePrepView = () => {
    const { todos, vehicles, isServiceBusiness } = useData();
    const { openModal } = useUI();
    const [prepVehicles, setPrepVehicles] = useState<PrepCar[]>([]);
    const [isCalculating, setIsCalculating] = useState(true);

    useEffect(() => {
        setIsCalculating(true);
        const timerId = setTimeout(() => {
            const prepTasks = todos.filter(t => t.type === 'prep' && t.vehicleId && !t.completionDate);

            if (prepTasks.length === 0) {
                setPrepVehicles([]);
                setIsCalculating(false);
                return;
            }

            const tasksByVehicleId = new Map<string, ToDoItem[]>();
            for (const task of prepTasks) {
                const vehicleId = task.vehicleId!;
                if (!tasksByVehicleId.has(vehicleId)) {
                    tasksByVehicleId.set(vehicleId, []);
                }
                tasksByVehicleId.get(vehicleId)!.push(task);
            }

            const vehicleMap = new Map<string, Vehicle>();
            for (const vehicle of vehicles) {
                vehicleMap.set(vehicle.id, vehicle);
            }

            const result: PrepCar[] = [];
            for (const [vehicleId, vehicleTasks] of tasksByVehicleId.entries()) {
                const vehicle = vehicleMap.get(vehicleId);
                if (vehicle) {
                    const isFullyComplete = vehicleTasks.every(t => t.isComplete);
                    result.push({ vehicle, tasks: vehicleTasks, isFullyComplete });
                }
            }

            result.sort((a, b) => {
                if (a.isFullyComplete !== b.isFullyComplete) {
                    return a.isFullyComplete ? 1 : -1;
                }
                return 0;
            });

            setPrepVehicles(result);
            setIsCalculating(false);
        }, 0);

        return () => clearTimeout(timerId);
    }, [todos, vehicles]);

    // Service businesses don't prep stock; only show the panel if there is some.
    if (isServiceBusiness && !isCalculating && prepVehicles.length === 0) return null;

    const open = prepVehicles.filter(p => !p.isFullyComplete).length;

    return (
        <section aria-labelledby="today-prep" className="[grid-area:prep] min-w-0">
            <SectionHead id="today-prep" title="Prep" count={open}>
                <PrepDictation />
                <IconButton label="Add prep job" icon={<PlusIcon />} onClick={() => openModal('todo', { type: 'prep' })} />
            </SectionHead>
            <div className="mt-1">
                {isCalculating ? (
                    <SkeletonList rows={2} label="Loading prep" />
                ) : prepVehicles.length === 0 ? (
                    <div className="rounded-card border border-line bg-surface">
                        <EmptyState
                            icon={<WrenchScrewdriverIcon />}
                            title="No cars in prep"
                            description="Prep jobs you add to a car show here, so you can tick them off on the forecourt."
                            actionLabel="Add prep job"
                            onAction={() => openModal('todo', { type: 'prep' })}
                        />
                    </div>
                ) : (
                    <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
                        {prepVehicles.map(p => <PrepCarBlock key={p.vehicle.id} {...p} />)}
                    </ul>
                )}
            </div>
        </section>
    );
};

// --- Tasks & diary (Google) ---
const CalendarTasksSection = () => {
    const { todos, isLoading, googleUser, handleGoogleSignIn, googleConnectionMessage } = useData();
    const [selectedDate, setSelectedDate] = useState<string>(toYYYYMMDD(new Date()));

    const generalTodos = useMemo(() => todos.filter(t => t.type === 'general'), [todos]);

    const eventDates = useMemo(() => {
        return generalTodos.filter(t => t.dueDate && !t.isComplete).map(t => t.dueDate!);
    }, [generalTodos]);

    const tasksForSelectedDay = useMemo(() => {
        return generalTodos.filter(t => t.dueDate === selectedDate);
    }, [generalTodos, selectedDate]);

    const upcomingTasks = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return todos
            .filter(t =>
                t.type === 'general' &&
                !t.isComplete &&
                t.dueDate &&
                new Date(t.dueDate) >= today
            )
            .sort((a, b) => {
                const dateA = new Date(a.dueDate!).getTime();
                const dateB = new Date(b.dueDate!).getTime();
                if (dateA !== dateB) return dateA - dateB;
                const timeA = a.dueTime || '00:00';
                const timeB = b.dueTime || '00:00';
                return timeA.localeCompare(timeB);
            })
            .slice(0, 10);
    }, [todos]);

    let body: React.ReactNode;
    if (isLoading) {
        body = (
            <div aria-busy="true" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
                <span className="sr-only">Loading tasks</span>
                <Skeleton width="40%" height={18} />
                <Skeleton height={220} />
            </div>
        );
    } else if (!googleUser) {
        body = (
            <div className="rounded-card border border-line bg-surface">
                <EmptyState
                    icon={<CalendarIcon />}
                    title="Connect Google Calendar"
                    description="Your tasks and diary show here. Tasks you add are kept in step with Google."
                    actionLabel="Connect Google"
                    onAction={handleGoogleSignIn}
                />
                {googleConnectionMessage && (
                    <p role="status" className="border-t border-line px-5 py-3 text-sm text-ink-2">{googleConnectionMessage}</p>
                )}
            </div>
        );
    } else {
        body = (
            <div className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="p-3">
                    <Calendar events={eventDates} selectedDate={selectedDate} onDateSelect={setSelectedDate} />
                </div>
                <div className="border-t border-line">
                    <DayTasksList tasks={tasksForSelectedDay} selectedDate={selectedDate} />
                </div>
                <div className="border-t border-line">
                    <h3 className="px-3.5 pb-1 pt-4 text-sm font-semibold text-ink-2">Coming up</h3>
                    <div className="max-h-96 overflow-y-auto">
                        {upcomingTasks.length > 0 ? (
                            upcomingTasks.map(item => <ToDoItemRow key={item.id} item={item} />)
                        ) : (
                            <p className="px-3.5 pb-4 pt-1 text-sm text-ink-3">Nothing coming up.</p>
                        )}
                    </div>
                </div>
                {googleConnectionMessage === 'Syncing...' && (
                    <p role="status" className="flex items-center gap-2 border-t border-line px-3.5 py-3 text-sm text-ink-2">
                        <Spinner className="h-4 w-4" /> Syncing with Google…
                    </p>
                )}
            </div>
        );
    }

    return (
        <section aria-labelledby="today-tasks-h" id="today-tasks" className="[grid-area:tasks] min-w-0 scroll-mt-4">
            <SectionHead id="today-tasks-h" title="Tasks" count={upcomingTasks.length} />
            <div className="mt-1">{body}</div>
        </section>
    );
};

// --- Main Dashboard Page ---
const DashboardPage = () => {
    return (
        <div
            className={cx(
                'grid grid-cols-1 items-start gap-x-6 gap-y-8 pb-4',
                "[grid-template-areas:'needs'_'glance'_'prep'_'tasks']",
                "md:grid-cols-2 md:[grid-template-areas:'needs_glance'_'needs_tasks'_'prep_tasks']",
                "lg:grid-cols-3 lg:gap-y-6 lg:[grid-template-areas:'glance_glance_glance'_'needs_prep_tasks']",
            )}
        >
            <NeedsYou />
            <Glance />
            <VehiclePrepView />
            <CalendarTasksSection />
        </div>
    );
};

export default DashboardPage;
