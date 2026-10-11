import React, { useState, useEffect, useMemo, useRef } from 'react';
import { NewToDoItem, ToDoItem, Vehicle, ToDoItemUpdate } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { useToast, Button, Field, Segmented } from '../ui';
import EditorFrame, { FrameInput, FrameTextarea, VehicleSuggestions } from '../work-sheets/EditorFrame';
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
        switch (type) {
            case 'general': return isEditing ? 'Edit task' : 'New task';
            case 'prep': return isEditing ? 'Edit prep job' : 'New prep job';
            case 'warranty': return isEditing ? 'Edit warranty claim' : 'New warranty claim';
        }
    };

    const saveLabel = isEditing ? 'Save changes' : type === 'general' ? 'Add task' : type === 'prep' ? 'Add prep job' : 'Add claim';

    return (
        <EditorFrame
            title={getTitle()}
            onClose={closeModal}
            formId="todo-editor-form"
            onSubmit={handleSubmit}
            footer={<>
                <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                <Button type="submit" form="todo-editor-form" loading={isSubmitting}>{saveLabel}</Button>
            </>}
        >
            {showVehicleSelector && (
                <div className="relative" ref={suggestionBoxRef}>
                    <Field label="Vehicle" optional={!isPrep} htmlFor="vehicleReg" hint={isWarranty ? 'Sold cars only. Or type a reg that isn’t on the books.' : undefined}>
                        <FrameInput
                            type="text"
                            id="vehicleReg"
                            value={regInput}
                            onChange={handleRegInputChange}
                            required={isPrep}
                            placeholder={isPrep ? 'Search reg, make or model' : 'Search or type a reg'}
                            className="font-mono uppercase tracking-[0.06em]"
                            autoComplete="off"
                        />
                    </Field>
                    {showSuggestions && suggestions.length > 0 && (
                        <VehicleSuggestions vehicles={suggestions} onPick={handleSuggestionClick} showStatus={false} />
                    )}
                </div>
            )}
            <Field
                label={type === 'warranty' ? 'Issue and what you’ll do' : isPrep ? 'Prep jobs' : 'Task'}
                htmlFor="description"
                hint={!isEditing && type !== 'warranty' ? 'Put each one on its own line to add several at once.' : undefined}
            >
                <FrameTextarea
                    id="description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    required
                    rows={isEditing ? 4 : 6}
                    placeholder={type === 'warranty' ? 'Describe the issue and what you will do' : isPrep ? 'e.g. Valet inside and out' : 'e.g. Ring the auction house'}
                />
            </Field>
            {type === 'general' && (
                <Field label="Due date" htmlFor="dueDate">
                    <UkDateInput id="dueDate" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
                </Field>
            )}
            {(isPrep || isWarranty) && (
                <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-ink">Priority</span>
                    <Segmented
                        ariaLabel="Priority"
                        full
                        value={priority}
                        onChange={v => setPriority(v)}
                        options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]}
                    />
                </div>
            )}
        </EditorFrame>
    );
};

export default ToDoEditor;
