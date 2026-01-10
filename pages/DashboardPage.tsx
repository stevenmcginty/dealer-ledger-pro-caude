

import React, { useMemo, useState, useEffect } from 'react';
import { ToDoItem, Vehicle } from '../types';
import { ExclamationTriangleIcon, PlusIcon, CheckCircleIcon, WrenchScrewdriverIcon, EditIcon, XMarkIcon, TrashIcon, CalendarIcon } from '../components/icons';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import Calendar from '../components/common/Calendar';
import Spinner from '../components/common/Spinner';
import { toYYYYMMDD, formatDate } from '../utils/helpers';
import DayTasksList, { ToDoItemRow } from '../components/todo/ToDoList';


// --- Calendar & Tasks Section ---
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
    

    if (isLoading) {
        return <div className="bg-gray-800 rounded-lg shadow-lg p-6 flex justify-center items-center h-full"><Spinner /></div>;
    }

    if (!googleUser) {
        return (
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 text-center flex flex-col justify-center items-center h-full">
                <CalendarIcon className="h-12 w-12 text-gray-500 mx-auto" />
                <h3 className="text-xl font-bold text-white mt-4">Connect Your Calendar</h3>
                <p className="mt-2 text-gray-400">To manage your general tasks and schedule, please connect your Google Account.</p>
                <button 
                    onClick={handleGoogleSignIn} 
                    className="mt-6 inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500"
                >
                    Connect to Google
                </button>
                 {googleConnectionMessage && (
                    <p className="mt-4 text-sm text-gray-400">{googleConnectionMessage}</p>
                 )}
            </div>
        );
    }
    
    return (
        <div className="bg-gray-800 rounded-lg shadow-lg">
            <div className="p-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold text-green-400">General Tasks & Calendar</h3>
            </div>
            
            <div className="p-4">
                <Calendar events={eventDates} selectedDate={selectedDate} onDateSelect={setSelectedDate} />
            </div>
            
            <div className="p-4 border-t border-gray-700 animate-in fade-in-0 duration-300">
                <DayTasksList tasks={tasksForSelectedDay} selectedDate={selectedDate} />
            </div>
            
            <div className="border-t border-gray-700">
                 <div className="p-4">
                    <h3 className="text-lg font-semibold text-green-400">Upcoming Tasks</h3>
                </div>
                <div className="divide-y divide-gray-700/50 max-h-96 overflow-y-auto">
                    {upcomingTasks.length > 0 ? (
                        upcomingTasks.map(item => <ToDoItemRow key={item.id} item={item} />)
                    ) : (
                        <p className="p-4 text-sm text-center text-gray-400">No upcoming tasks.</p>
                    )}
                </div>
            </div>

            {googleConnectionMessage === 'Syncing...' && <div className="p-4 text-center text-gray-400 text-sm flex items-center justify-center gap-2 border-t border-gray-700"><Spinner className="h-4 w-4"/> {googleConnectionMessage}</div>}
        </div>
    );
};


// --- Warranty Claims View ---
const WarrantyClaimsView = () => {
    const { todos, vehicles } = useData();
    const { openModal } = useUI();

    const warrantyClaims = useMemo(() => {
        return todos.filter(t => t.type === 'warranty' && !t.isComplete);
    }, [todos]);

    if (warrantyClaims.length === 0) return null;

    return (
        <div className="space-y-4">
             <h2 className="text-xl font-bold text-white">Warranty Claims</h2>
             {warrantyClaims.map(item => {
                const vehicle = vehicles.find(v => v.id === item.vehicleId);
                return (
                    <div key={item.id} className="p-4 rounded-lg shadow-lg border bg-red-900/50 border-red-700">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-2">
                                    <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                                    <h3 className="font-bold text-white">{vehicle ? vehicle.reg : item.vehicleReg || 'General Claim'}</h3>
                                </div>
                                {vehicle && <p className="text-sm text-gray-300 mt-1">{vehicle.make} {vehicle.model}</p>}
                            </div>
                             <div className="flex items-center -mr-2">
                                <button onClick={() => openModal('todo', { type: 'warranty', editingTodo: item })} className="p-2 text-sm text-red-300 hover:text-white rounded-full hover:bg-red-900/50" title="Edit Claim">
                                    <EditIcon className="h-5 w-5" />
                                </button>
                                <button onClick={() => openModal('deleteTodoConfirm', item)} className="p-2 text-sm text-red-300 hover:text-white rounded-full hover:bg-red-900/50" title="Delete Claim">
                                    <XMarkIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        <p className="mt-2 text-sm text-gray-200">{item.description}</p>
                    </div>
                )
            })}
        </div>
    );
};

// FIX: Extracted props to a named interface to resolve 'key' prop error.
interface PrepTaskItemProps {
    task: ToDoItem;
}
const PrepTaskItem: React.FC<PrepTaskItemProps> = ({ task }) => {
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
        <div className={`flex items-start group ${isComplete ? 'opacity-50' : ''}`}>
            <input
                type="checkbox"
                checked={isComplete}
                onChange={onToggleComplete}
                className="h-5 w-5 rounded border-gray-500 bg-gray-900 text-brand-500 focus:ring-brand-500 mt-0.5"
            />
            <p className={`ml-3 text-sm flex-1 ${isComplete ? 'line-through text-gray-500' : 'text-gray-200'}`}>{task.description}</p>
        </div>
    );
};


// --- Vehicle Prep View ---
const VehiclePrepView = () => {
    const { todos, vehicles } = useData();
    const { openModal } = useUI();
    const [prepVehicles, setPrepVehicles] = useState<{ vehicle: Vehicle; tasks: ToDoItem[]; isFullyComplete: boolean }[]>([]);
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

            const result: { vehicle: Vehicle; tasks: ToDoItem[]; isFullyComplete: boolean }[] = [];
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

    if (isCalculating) {
        return (
             <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner h-full flex flex-col justify-center items-center">
                <Spinner />
                <p className="mt-2 text-sm text-gray-400">Calculating prep list...</p>
            </div>
        );
    }

    if (prepVehicles.length === 0) {
        return (
             <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner h-full flex flex-col justify-center items-center">
                <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
                <h3 className="mt-4 text-lg font-medium text-white">All Prep Work Done!</h3>
                <p className="mt-1 text-sm text-gray-400">No vehicles currently require preparation.</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                 {prepVehicles.map(({ vehicle, tasks, isFullyComplete }) => {
                     const sortedTasks = [...tasks].sort((a, b) => (a.isComplete ? 1 : 0) - (b.isComplete ? 1 : 0) || a.createdAt - b.createdAt);
                     return (
                         <div key={vehicle.id} className={`p-4 rounded-lg shadow-lg border flex flex-col h-full transition-all ${
                                isFullyComplete
                                    ? 'bg-gray-800/50 border-gray-700/50 opacity-70'
                                    : 'bg-gray-800 border-gray-700'
                            }`}>
                             <div className="flex justify-between items-start">
                                 <div>
                                     <div className="flex items-center gap-2">
                                         <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${vehicle.status === 'Available' ? 'bg-green-800 text-green-200' : 'bg-cyan-800 text-cyan-200'}`}>{vehicle.status}</span>
                                     </div>
                                     <h3 className="font-bold text-white mt-2 text-lg">{vehicle.reg}</h3>
                                     <p className="text-sm text-gray-400">{vehicle.make} {vehicle.model}</p>
                                 </div>
                                 <div className="flex items-center gap-1">
                                    <button onClick={() => openModal('todo', { type: 'prep', prefillData: { vehicleReg: vehicle.reg } })} className="p-2 text-gray-400 hover:text-white"><PlusIcon className="h-5 w-5" /></button>
                                    <button onClick={() => openModal('archivePrepConfirm', { vehicle, tasks })} className="p-2 text-gray-400 hover:text-red-400"><TrashIcon className="h-5 w-5" /></button>
                                </div>
                             </div>
                             <div className="mt-4 space-y-2 flex-1">
                                 {sortedTasks.map(task => <PrepTaskItem key={task.id} task={task} />)}
                             </div>
                             {isFullyComplete && (
                                <div className="mt-4 text-center text-xs text-green-400 font-semibold p-2 bg-green-900/50 rounded-md">
                                    All Prep Complete
                                </div>
                             )}
                         </div>
                     );
                 })}
            </div>
        </div>
    );
};

// --- Quick Stats Section (Mobile-first) ---
const QuickStats = () => {
    const { vehicles, todos, leads } = useData();

    const stats = useMemo(() => {
        const inStock = vehicles.filter(v => v.status === 'Available' || v.status === 'In Stock').length;
        const depositPaid = vehicles.filter(v => v.status === 'Deposit Paid').length;
        const prepTasks = todos.filter(t => t.type === 'prep' && !t.isComplete).length;
        const dueTasks = todos.filter(t => t.type === 'general' && !t.isComplete && t.dueDate).length;
        const activeLeads = leads?.filter(l => l.stage !== 'Sold' && l.stage !== 'Lost').length || 0;
        const warrantyClaims = todos.filter(t => t.type === 'warranty' && !t.isComplete).length;

        return { inStock, depositPaid, prepTasks, dueTasks, activeLeads, warrantyClaims };
    }, [vehicles, todos, leads]);

    return (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
            <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-green-400">{stats.inStock}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">In Stock</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-cyan-400">{stats.depositPaid}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Deposits</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-purple-400">{stats.activeLeads}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Leads</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-amber-400">{stats.prepTasks}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Prep Jobs</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-blue-400">{stats.dueTasks}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Tasks Due</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className={`text-2xl sm:text-3xl font-bold ${stats.warrantyClaims > 0 ? 'text-red-400' : 'text-gray-500'}`}>{stats.warrantyClaims}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Warranty</p>
            </div>
        </div>
    );
};

// --- Main Dashboard Page ---
const DashboardPage = () => {
    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Quick Stats - Always visible at top */}
            <QuickStats />

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="lg:col-span-1">
                    <CalendarTasksSection />
                </div>
                <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                    <WarrantyClaimsView />
                    <div>
                        <h2 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4">Vehicle Prep</h2>
                        <div className="bg-gray-800 rounded-lg shadow-lg">
                             <VehiclePrepView />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;