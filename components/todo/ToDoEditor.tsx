import React, { useState, useEffect, useMemo, useRef } from 'react';
import { NewToDoItem, ToDoItem, Vehicle, ToDoItemUpdate } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { useToast } from '../ui';
import { XMarkIcon } from '../icons';
import Spinner from '../common/Spinner';
import UkDateInput from '../common/UkDateInput';

interface ToDoEditorProps {
    type: 'general' | 'prep' | 'warranty';
    editingTodo?: ToDoItem;
    prefillData?: Partial<NewToDoItem>;
}

const ToDoEditor = ({ type, editingTodo, prefillData }: ToDoEditorProps) => {
    const { closeModal } = useUI();
    const { vehicles, addToDo, updateToDo } = useData();
    const toast = useToast();
    
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<'normal' | 'high'>('normal');
    const [dueDate, setDueDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // State for vehicle selection autocomplete
    const [vehicleId, setVehicleId] = useState<string | undefined>(undefined);
    const [regInput, setRegInput] = useState('');
    const [suggestions, setSuggestions] = useState<Vehicle[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionBoxRef = useRef<HTMLDivElement>(null);

    const isEditing = !!editingTodo;
    const isPrep = type === 'prep';
    const isWarranty = type === 'warranty';
    const showVehicleSelector = isPrep || isWarranty;

    const vehicleList = useMemo(() => {
        if (isPrep) {
            return vehicles.filter(v => v.status !== 'Sold');
        }
        if (isWarranty) {
            return vehicles.filter(v => v.status === 'Sold');
        }
        return [];
    }, [isPrep, isWarranty, vehicles]);

    useEffect(() => {
        if(isEditing && editingTodo) {
            setDescription(editingTodo.description);
            setPriority(editingTodo.priority);
            setDueDate(editingTodo.dueDate || '');
            if (editingTodo.vehicleId) {
                setVehicleId(editingTodo.vehicleId);
                setRegInput(editingTodo.vehicleReg || '');
            }
        } else if (prefillData) {
            setDescription(prefillData.description || '');
            setPriority(prefillData.priority || 'normal');
            setDueDate(prefillData.dueDate || new Date().toISOString().split('T')[0]);
            if (prefillData.vehicleReg) {
                const vehicle = vehicleList.find(v => v.reg.replace(/\s/g, '').toLowerCase() === prefillData.vehicleReg?.replace(/\s/g, '').toLowerCase());
                if (vehicle) {
                    setVehicleId(vehicle.id);
                    setRegInput(vehicle.reg);
                } else {
                    setRegInput(prefillData.vehicleReg);
                }
            }
        } else {
            if (type === 'warranty') setPriority('high');
            if (type === 'general') setDueDate(new Date().toISOString().split('T')[0]);
        }
    }, [editingTodo, isEditing, type, prefillData, vehicleList]);
    
    // Effect to close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    
    const handleRegInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setRegInput(value);
        setVehicleId(undefined); // Clear selected vehicle if user is typing again

        if (value.trim() === '') {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const lowerValue = value.toLowerCase();
        const filtered = vehicleList.filter(v => 
            v.reg.toLowerCase().includes(lowerValue) ||
            v.make.toLowerCase().includes(lowerValue) ||
            v.model.toLowerCase().includes(lowerValue)
        );
        setSuggestions(filtered.slice(0, 5)); // Limit to 5 suggestions
        setShowSuggestions(true);
    };

    const handleSuggestionClick = (vehicle: Vehicle) => {
        setVehicleId(vehicle.id);
        setRegInput(vehicle.reg);
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        if (!description.trim()) {
            toast.error('Please enter a description.');
            return;
        }

        if (isPrep && !vehicleId) {
            toast.error('Please select a vehicle from the list for this prep task.');
            return;
        }

        setIsSubmitting(true);

        try {
            if (isEditing && editingTodo) {
                const vehicle = vehicleId ? vehicles.find(v => v.id === vehicleId) : undefined;
                const updateData: ToDoItemUpdate = {
                    description: description.trim(),
                    priority,
                    type,
                };

                if (type === 'general') {
                    updateData.dueDate = dueDate || undefined;
                }
                if (isPrep || isWarranty) {
                    updateData.vehicleId = vehicle?.id || undefined;
                    updateData.vehicleReg = vehicle ? vehicle.reg : (regInput.trim().toUpperCase() || undefined);
                }
                
                await updateToDo(editingTodo.id, updateData);
            } else {
                const tasks = description.trim().split('\n').filter(line => line.trim() !== '');
                const vehicle = vehicleId ? vehicles.find(v => v.id === vehicleId) : undefined;

                const promises = tasks.map(taskDescription => {
                    const newTodoData: NewToDoItem = {
                        description: taskDescription,
                        priority,
                        isComplete: false,
                        type: type,
                    };

                    if (type === 'general' && dueDate) {
                        newTodoData.dueDate = dueDate;
                    }

                    if (vehicle) {
                        newTodoData.vehicleId = vehicle.id;
                        newTodoData.vehicleReg = vehicle.reg;
                    } else if (showVehicleSelector && regInput.trim()) {
                        newTodoData.vehicleReg = regInput.trim().toUpperCase();
                    }
                    
                    return addToDo(newTodoData);
                });

                await Promise.all(promises);
            }
            closeModal();
        } catch (error) {
            console.error("Failed to save ToDo item:", error);
            toast.error(`An error occurred while saving: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsSubmitting(false);
        }
    };


    const getTitle = () => {
        const action = isEditing ? 'Edit' : 'Add';
        switch (type) {
            case 'general': return `${action} General Task`;
            case 'prep': return `${action} Prep Task`;
            case 'warranty': return `${action} Warranty Claim`;
        }
    };
    
    return (
        <form onSubmit={handleSubmit} className="w-full flex flex-col h-full">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{getTitle()}</h2>
                <button type="button" onClick={closeModal} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                {showVehicleSelector && (
                    <div className="relative" ref={suggestionBoxRef}>
                        <label htmlFor="vehicleReg" className="block text-sm font-medium text-gray-300">Vehicle</label>
                        <input 
                            type="text"
                            id="vehicleReg"
                            value={regInput}
                            onChange={handleRegInputChange}
                            required={isPrep}
                            placeholder={isPrep ? 'Search by Reg, Make, Model...' : 'Search or enter Reg (Optional)'}
                            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white uppercase"
                            autoComplete="off"
                        />
                         {showSuggestions && suggestions.length > 0 && (
                            <ul className="absolute z-10 mt-1 w-full bg-gray-600 border border-gray-500 rounded-md shadow-lg max-h-60 overflow-auto">
                                {suggestions.map(v => (
                                    <li key={v.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleSuggestionClick(v)}
                                            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-brand-600"
                                        >
                                            <span className="font-bold">{v.reg}</span> - {v.make} {v.model}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-300">{type === 'warranty' ? 'Issue & Action Plan' : 'Task Description'}</label>
                    <textarea 
                        id="description" 
                        value={description} 
                        onChange={e => setDescription(e.target.value)} 
                        required 
                        rows={isEditing ? 4 : 8}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" 
                        placeholder={type === 'warranty' ? "Describe the issue, what you will do..." : "Task details... You can add multiple tasks by putting each on a new line."}
                    />
                </div>
                {type === 'general' && (
                    <div>
                        <label htmlFor="dueDate" className="block text-sm font-medium text-gray-300">Due Date</label>
                        <UkDateInput id="dueDate" value={dueDate} onChange={e => setDueDate(e.target.value)} className="mt-1" required/>
                    </div>
                )}
                {(isPrep || isWarranty) && (
                     <div>
                        <label className="block text-sm font-medium text-gray-300">Priority</label>
                        <div className="mt-2 flex items-center space-x-2 rounded-lg bg-gray-700 p-1">
                            <button type="button" onClick={() => setPriority('normal')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${priority === 'normal' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Normal</button>
                            <button type="button" onClick={() => setPriority('high')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${priority === 'high' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>High</button>
                        </div>
                    </div>
                )}
            </div>
            <footer className="p-4 border-t border-gray-700 flex justify-end">
                <button type="submit" disabled={isSubmitting} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : (isEditing ? 'Update Task' : 'Add Task')}
                </button>
            </footer>
        </form>
    );
};

export default ToDoEditor;
