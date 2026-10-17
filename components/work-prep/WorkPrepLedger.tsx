import React, { useState, useMemo } from 'react';
import { ToDoItem } from '../../types';
import { useData } from '../../hooks/useData';
import { formatDate } from '../../utils/helpers';
import { WrenchScrewdriverIcon, UndoIcon } from '../icons';
import { Button, EmptyState, Plate, Search, SkeletonList } from '../ui';
import { PageHead } from '../stock/parts';
import { useUI } from '../../hooks/useUI';

const WorkPrepLedger = () => {
    const { todos, vehicles, isLoading } = useData();
    const { openModal } = useUI();
    const [searchTerm, setSearchTerm] = useState('');

    const archivedPrepTasks = useMemo(() => {
        const prepTasks = todos.filter(t => t.type === 'prep' && t.completionDate);

        const groupedByVehicle = prepTasks.reduce((acc, task) => {
            const vehicleId = task.vehicleId;
            if (vehicleId) {
                if (!acc[vehicleId]) {
                    acc[vehicleId] = [];
                }
                acc[vehicleId].push(task);
            }
            return acc;
        }, {} as Record<string, ToDoItem[]>);

        const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
        
        let result = Object.entries(groupedByVehicle).map(([vehicleId, tasks]) => {
            const vehicle = vehicleMap.get(vehicleId);
            if (!vehicle) return null;
            
            const mostRecentCompletion = Math.max(...tasks.map(t => new Date(t.completionDate!).getTime()));
            
            return {
                vehicle,
                tasks: tasks.sort((a, b) => new Date(b.completionDate!).getTime() - new Date(a.completionDate!).getTime()),
                mostRecentCompletion,
            };
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        if (searchTerm.trim() !== '') {
            const lowercasedTerm = searchTerm.toLowerCase();
            result = result.filter(({ vehicle }) =>
                (vehicle.reg || '').toLowerCase().includes(lowercasedTerm) ||
                (vehicle.make || '').toLowerCase().includes(lowercasedTerm) ||
                (vehicle.model || '').toLowerCase().includes(lowercasedTerm) ||
                String(vehicle.stockNumber || '').toLowerCase().includes(lowercasedTerm)
            );
        }

        return result.sort((a, b) => b.mostRecentCompletion - a.mostRecentCompletion);
    }, [todos, vehicles, searchTerm]);
    
    if (isLoading) {
        return <SkeletonList rows={3} label="Loading finished prep" />;
    }

    const jobCount = archivedPrepTasks.reduce((n, g) => n + g.tasks.length, 0);

    return (
        <div className="space-y-4 pb-6">
            <PageHead
                facts={jobCount > 0
                    ? <>Finished prep · {archivedPrepTasks.length} car{archivedPrepTasks.length === 1 ? '' : 's'}, {jobCount} job{jobCount === 1 ? '' : 's'}</>
                    : 'Finished prep, grouped by car'}
            />
            <Search
                value={searchTerm}
                onChange={setSearchTerm}
                label="Search finished prep"
                placeholder="Reg, make, model or stock no."
                className="w-full lg:max-w-sm"
            />

            {archivedPrepTasks.length === 0 ? (
                <div className="rounded-card border border-line bg-surface">
                    {searchTerm ? (
                        <EmptyState
                            icon={<WrenchScrewdriverIcon />}
                            title={`No cars match “${searchTerm}”`}
                            description="Search looks at the reg, make, model and stock number."
                            actionLabel="Clear search"
                            onAction={() => setSearchTerm('')}
                        />
                    ) : (
                        <EmptyState
                            icon={<WrenchScrewdriverIcon />}
                            title="No finished prep yet"
                            description="When you archive done prep jobs from Today, they land here, grouped by car."
                        />
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {archivedPrepTasks.map(({ vehicle, tasks }) => (
                        <section key={vehicle.id} aria-label={`${vehicle.reg} ${vehicle.make} ${vehicle.model}`} className="rounded-card border border-line bg-surface">
                            <header className="flex items-center gap-3 border-b border-line py-3 pe-2 ps-4">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Plate reg={vehicle.reg} size="sm" />
                                        <span className="num text-sm font-semibold text-ink-3">#{vehicle.stockNumber}</span>
                                    </div>
                                    <h3 className="truncate text-base font-semibold text-ink">{vehicle.make} {vehicle.model}</h3>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<UndoIcon />}
                                    onClick={() => openModal('unarchivePrepConfirm', { vehicle, tasks })}
                                    title="Move these jobs back to the prep list on Today"
                                >
                                    Back to prep
                                </Button>
                            </header>
                            <ul className="m-0 list-none divide-y divide-line p-0">
                                {tasks.map(task => (
                                    <li key={task.id} className="flex min-h-[48px] items-center gap-3 px-4 py-2">
                                        <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-success" />
                                        <p className="min-w-0 flex-1 text-base text-ink">{task.description}</p>
                                        <p className="num flex-none text-sm text-ink-3">{formatDate(task.completionDate!)}</p>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
};

export default WorkPrepLedger;