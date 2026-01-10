import { NewToDoItem, ToDoItem, ToDoItemUpdate } from '../types';
import * as google from './google';
import { toYYYYMMDD } from '../utils/helpers';

// Transformation functions to convert Google API objects into our app's ToDoItem format.
const transformGoogleEvent = (event: any): ToDoItem => {
    const isComplete = event.summary?.startsWith('[✓]');
    const description = isComplete ? event.summary.substring(4).trim() : event.summary;
    
    let dueDate: string | undefined;
    let dueTime: string | undefined;

    if (event.start.dateTime) { // Has a specific time, e.g., "2024-08-21T10:00:00+01:00"
        const dt = new Date(event.start.dateTime);
        dueDate = toYYYYMMDD(dt);
        dueTime = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } else if (event.start.date) { // All-day event, e.g., "2024-08-21"
        dueDate = event.start.date;
    }

    return {
        id: `gcal-${event.id}`,
        description: description || 'Untitled Event',
        isComplete,
        googleCalendarEventId: event.id,
        recurringEventId: event.recurringEventId,
        dueDate: dueDate,
        dueTime: dueTime,
        priority: 'normal',
        type: 'general',
        createdAt: new Date(event.created).getTime(),
    };
};

const transformGoogleTask = (task: any): ToDoItem => {
    let dueDate: string | undefined;
    let dueTime: string | undefined;

    if (task.due) {
        const dueString = task.due as string; // "2024-08-21T15:00:00.000Z"
        dueDate = dueString.split('T')[0];
        
        // Check if there is a specific time set (not midnight UTC)
        if (dueString.includes('T') && !dueString.endsWith('T00:00:00.000Z')) {
            const dt = new Date(dueString);
            dueTime = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        }
    }

    return {
        id: `gtask-${task.id}`,
        description: task.title || 'Untitled Task',
        isComplete: task.status === 'completed',
        googleTaskId: task.id,
        dueDate: dueDate,
        dueTime: dueTime,
        priority: 'normal',
        type: 'general',
        createdAt: new Date(task.updated).getTime(),
    };
};

export interface SyncResult {
    syncedTodos: ToDoItem[];
    error?: string; // A non-critical error message for partial failures
}


/**
 * Main sync function. Fetches Google Calendar events (critical) and Google Tasks (non-critical).
 * If Tasks fail, it returns the Calendar data along with an error message.
 * If Calendar fails, it throws a critical error to be handled by the UI.
 */
export const syncWithGoogle = async (): Promise<SyncResult> => {
    let events: any[] = [];
    let tasks: any[] = [];
    let taskError: string | undefined;

    // First, try to get calendar events. This is considered critical for the sync.
    try {
        events = await google.listGoogleCalendarEvents();
    } catch (error: any) {
        console.error("Critical error fetching Google Calendar events:", error);
        // Re-throw to be caught by the DataContext for critical UI feedback.
        throw error;
    }

    // Second, try to get tasks. This is non-critical. If it fails, we capture the error but continue.
    try {
        tasks = await google.listRecentGoogleTasks();
    } catch (error: any) {
        console.warn(
            "Non-critical error fetching Google Tasks. Proceeding with Calendar events only.",
            error
        );
        taskError = error.result?.error?.message || error.message || "Failed to fetch Google Tasks.";
    }

    const transformedEvents = events.map(transformGoogleEvent);
    const transformedTasks = tasks.map(transformGoogleTask);

    return {
        syncedTodos: [...transformedEvents, ...transformedTasks],
        error: taskError,
    };
};


/**
 * Creates a new task on Google. We use Google Tasks for this as it's more suited for to-do items.
 */
export const createGoogleTask = async (data: NewToDoItem): Promise<void> => {
    if (!data.dueDate) { // Should always have a dueDate for general tasks from our UI/AI
        console.warn("Cannot create a Google task without a due date.");
        return;
    }
    // Create date at midnight UTC for date-only tasks.
    const [year, month, day] = data.dueDate.split('-').map(Number);
    const dueDateUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    await google.createGoogleTask(data.description, dueDateUTC);
};

/**
 * Updates an existing Google Task or Google Calendar Event.
 */
export const updateGoogleTask = async (originalTodo: ToDoItem, updates: ToDoItemUpdate): Promise<void> => {
    if (originalTodo.googleTaskId) {
        const taskId = originalTodo.googleTaskId;
        const taskUpdates: any = {};
        if (updates.isComplete !== undefined) taskUpdates.status = updates.isComplete ? 'completed' : 'needsAction';
        if (updates.description) taskUpdates.title = updates.description;
        if (updates.dueDate) taskUpdates.due = updates.dueDate;
        
        await google.updateGoogleTask(taskId, taskUpdates);

    } else if (originalTodo.googleCalendarEventId) {
        const eventId = originalTodo.googleCalendarEventId;
        let summary = updates.description || originalTodo.description;
        if (updates.isComplete === true) {
            summary = `[✓] ${summary.replace('[✓]', '').trim()}`;
        } else if (updates.isComplete === false) {
            summary = summary.replace('[✓]', '').trim();
        }
        await google.updateGoogleCalendarEvent(eventId, summary);
    }
};

/**
 * Deletes a task from Google Tasks or Google Calendar.
 */
export const deleteGoogleTask = async (todo: ToDoItem): Promise<void> => {
    if (todo.googleTaskId) {
        await google.deleteGoogleTask(todo.googleTaskId);
    } else if (todo.googleCalendarEventId) {
        await google.deleteGoogleCalendarEvent(todo.googleCalendarEventId);
    }
};