import React from 'react';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import GeminiAssistant from './GeminiAssistant';
import { GeminiAction, NewToDoItem, ToDoItem, ToDoItemUpdate } from '../../types';

const AssistantManager = () => {
    const { isAssistantOpen, toggleAssistant, setView, openModal, modal, view } = useUI();
    const { 
        vehicles, 
        expenseCategories, 
        addToDo, 
        todos, 
        updateToDo, 
        deleteToDo, 
        reclassifyToDo,
        markToDosAsComplete
    } = useData();

    const handleAssistantAction = async (action: GeminiAction) => {
        const { intent, entities } = action;
    
        switch (intent) {
            case 'NAVIGATE':
                if (entities.viewTarget) {
                    setView(entities.viewTarget);
                }
                break;
            case 'CREATE_DOCUMENT': {
                const vehicle = entities.vehicleReg 
                    ? vehicles.find(v => v.reg.replace(/\s/g, '').toUpperCase() === entities.vehicleReg?.replace(/\s/g, '').toUpperCase())
                    : undefined;
    
                if (vehicle && (entities.documentType === 'Sales Invoice' || entities.documentType === 'Proforma Invoice' || entities.documentType === 'Deposit Slip')) {
                     openModal('invoice', { vehicle, docType: entities.documentType, prefillData: entities.prefillData });
                }
                break;
            }
            case 'ADD_TODO':
            case 'ADD_WARRANTY_CLAIM': {
                const newTodo: NewToDoItem = {
                    description: entities.task || 'Untitled Task',
                    isComplete: false,
                    priority: intent === 'ADD_WARRANTY_CLAIM' ? 'high' : 'normal',
                    type: intent === 'ADD_WARRANTY_CLAIM' ? 'warranty' : (entities.targetCategory === 'vehicle' ? 'prep' : 'general'),
                    dueDate: entities.dueDate,
                    remedy: entities.remedy
                };
                if (entities.vehicleReg) {
                    const vehicle = vehicles.find(v => v.reg.replace(/\s/g, '').toUpperCase() === entities.vehicleReg?.replace(/\s/g, '').toUpperCase());
                    if (vehicle) {
                        newTodo.vehicleId = vehicle.id;
                        newTodo.vehicleReg = vehicle.reg;
                    } else {
                        newTodo.vehicleReg = entities.vehicleReg.toUpperCase();
                    }
                }
                await addToDo(newTodo);
                break;
            }
            case 'ADD_EXPENSE':
                openModal('expense', { prefillData: entities.prefillData });
                break;
            case 'UPDATE_TODO': {
                if (!entities.task) break;
                const findFn = (t: ToDoItem) => 
                    t.description.toLowerCase().includes(entities.task!.toLowerCase()) && 
                    !t.isComplete &&
                    (!entities.vehicleReg || (t.vehicleReg && t.vehicleReg.replace(/\s/g, '').toUpperCase() === entities.vehicleReg.replace(/\s/g, '').toUpperCase()));
                
                const tasksToUpdate = todos.filter(findFn);
                
                if (entities.markAll) {
                    if (tasksToUpdate.length > 0) {
                        await markToDosAsComplete(tasksToUpdate.map(t => t.id));
                    }
                } else {
                    if (tasksToUpdate.length > 0) {
                        await updateToDo(tasksToUpdate[0].id, { isComplete: entities.taskStatus === 'complete' });
                    }
                }
                break;
            }
            case 'DELETE_TODO': {
                 if (!entities.task) break;
                 const findFn = (t: ToDoItem) => 
                    t.description.toLowerCase().includes(entities.task!.toLowerCase()) && 
                    (!entities.vehicleReg || (t.vehicleReg && t.vehicleReg.replace(/\s/g, '').toUpperCase() === entities.vehicleReg.replace(/\s/g, '').toUpperCase()));
    
                 const taskToDelete = todos.find(findFn);
                 if (taskToDelete) {
                    await deleteToDo(taskToDelete.id);
                 }
                break;
            }
            case 'RECLASSIFY_TODO': {
                if (!entities.task || !entities.targetCategory) break;
                const taskToMove = todos.find(t => t.description.toLowerCase().includes(entities.task!.toLowerCase()));
                if (taskToMove) {
                    const vehicle = entities.vehicleReg ? vehicles.find(v => v.reg.replace(/\s/g, '').toUpperCase() === entities.vehicleReg?.replace(/\s/g, '').toUpperCase()) : undefined;
                    await reclassifyToDo(taskToMove.id, entities.targetCategory, vehicle ? {id: vehicle.id, reg: vehicle.reg} : undefined);
                }
                break;
            }
            case 'CONVERSATIONAL_RESPONSE':
            case 'INCOMPLETE_ACTION':
            case 'UNKNOWN':
                break;
        }
    };
    
    const dataContext = {
        vehicleRegs: vehicles.map(v => v.reg),
        expenseCategories: expenseCategories.map(c => c.name),
        currentModal: modal,
        currentView: view,
        viewData: {},
    };

    if (!isAssistantOpen) return null;
    
    return (
        <GeminiAssistant 
            onClose={toggleAssistant}
            onAction={handleAssistantAction}
            dataContext={dataContext}
        />
    );
};

export default AssistantManager;
