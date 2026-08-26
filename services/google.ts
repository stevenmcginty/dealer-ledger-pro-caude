// services/google.ts
import { CONFIG } from '../config';

declare const gapi: any;
declare const google: any;

const CLIENT_ID = CONFIG.GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/tasks';

let tokenClient: any | null = null;
let initPromise: Promise<void> | null = null;

const loadScript = (id: string, src: string): Promise<void> => {
    return new Promise((resolve) => {
        if (document.getElementById(id)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        document.body.appendChild(script);
    });
};

export const initializeGoogleClient = (callback: (tokenResponse: any) => void): Promise<void> => {
    if (initPromise) {
        return initPromise;
    }
    initPromise = new Promise(async (resolve, reject) => {
        try {
            await loadScript('gapi-script', 'https://apis.google.com/js/api.js');
            await new Promise<void>(res => gapi.load('client', res));
            await loadScript('gsi-script', 'https://accounts.google.com/gsi/client');
            await gapi.client.init({});
            await gapi.client.load('calendar', 'v3');
            await gapi.client.load('tasks', 'v1');
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: callback,
            });
            resolve();
        } catch (error) {
            console.error("Google Client initialization failed", error);
            reject(error);
        }
    });
    return initPromise;
};

export const requestAccessToken = (isSilent: boolean) => {
    if (tokenClient) {
        // Use 'none' for silent, background refresh attempts.
        // Use an empty prompt for user-initiated flows to let Google decide if a UI is needed.
        tokenClient.requestAccessToken({ prompt: isSilent ? 'none' : '' });
    } else {
        console.error("Token client not initialized.");
    }
};

export const revokeAccessToken = (token: string) => {
    if(token) {
        google.accounts.oauth2.revoke(token, () => {});
    }
};

export const setGapiToken = (token: object | null) => {
    gapi.client.setToken(token);
};

export const getUserProfile = async () => {
     try {
        const token = gapi.client.getToken();
        if (!token || !token.access_token) {
            throw new Error('No access token available for user profile fetch.');
        }
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
                'Authorization': `Bearer ${token.access_token}`
            }
        });
        if (!response.ok) throw new Error(`Failed to fetch user profile: ${response.statusText}`);
        return await response.json();
    } catch(error) {
        console.error("Error fetching user profile", error);
        return null;
    }
};

// Fetches both upcoming events and recently updated events to ensure completed items are shown.
export const listGoogleCalendarEvents = async (): Promise<any[]> => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(today.getDate() - 2);

    const upcomingEventsPromise = gapi.client.calendar.events.list({
        'calendarId': 'primary',
        'timeMin': today.toISOString(),
        'showDeleted': false,
        'singleEvents': true,
        'maxResults': 250,
        'orderBy': 'startTime'
    });

    // Also fetch events updated recently to catch completed items from today that might otherwise be missed.
    const updatedEventsPromise = gapi.client.calendar.events.list({
        'calendarId': 'primary',
        'updatedMin': twoDaysAgo.toISOString(),
        'showDeleted': false,
        'singleEvents': true,
        'maxResults': 250
    });

    const [upcomingResponse, updatedResponse] = await Promise.all([upcomingEventsPromise, updatedEventsPromise]);
    
    const combinedEvents = [
        ...(upcomingResponse.result.items || []),
        ...(updatedResponse.result.items || [])
    ];

    // Deduplicate using a Map, which is a concise way to get unique items by a key.
    const uniqueEventsById = new Map(combinedEvents.map(event => [event.id, event]));
    const uniqueEvents = Array.from(uniqueEventsById.values());
    
    // Sort all unique events by start time to ensure we process them chronologically.
    uniqueEvents.sort((a, b) => {
        const timeA = new Date(a.start.dateTime || a.start.date).getTime();
        const timeB = new Date(b.start.dateTime || b.start.date).getTime();
        return timeA - timeB;
    });

    const recurringEventsSeen = new Set<string>();
    const finalEvents: any[] = [];

    for (const event of uniqueEvents) {
        if (event.recurringEventId) {
            // This is an instance of a recurring event.
            if (!recurringEventsSeen.has(event.recurringEventId)) {
                // It's the first time we've seen this recurring series, so add it.
                recurringEventsSeen.add(event.recurringEventId);
                finalEvents.push(event);
            }
            // If we've already seen it, we skip subsequent instances.
        } else {
            // This is a non-recurring event, so we always keep it.
            finalEvents.push(event);
        }
    }

    return finalEvents;
};


// Low-level function to fetch recently updated Google Tasks (both complete and incomplete).
export const listRecentGoogleTasks = async (): Promise<any[]> => {
    let allTasks: any[] = [];
    let pageToken: string | undefined = undefined;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    do {
        const response: { result: { items?: any[]; nextPageToken?: string } } = await gapi.client.tasks.tasks.list({
            tasklist: '@default',
            showCompleted: true,
            showHidden: false,
            updatedMin: thirtyDaysAgo.toISOString(),
            maxResults: 100,
            pageToken: pageToken,
        });

        if (response.result.items) {
            allTasks = allTasks.concat(response.result.items);
        }
        pageToken = response.result.nextPageToken;
    } while (pageToken);
    
    return allTasks;
};


// Low-level API calls for mutations
export const createGoogleTask = async (summary: string, dueDate: Date): Promise<any> => {
    const task = { 'title': summary, 'due': dueDate.toISOString() };
    const response = await gapi.client.tasks.tasks.insert({ tasklist: '@default', resource: task });
    return response.result;
};

export const updateGoogleTask = async (taskId: string, updates: any): Promise<any> => {
    const response = await gapi.client.tasks.tasks.patch({ tasklist: '@default', task: taskId, resource: updates });
    return response.result;
};

export const deleteGoogleTask = async (taskId: string): Promise<void> => {
    try {
        await gapi.client.tasks.tasks.delete({ tasklist: '@default', task: taskId });
    } catch (error: any) {
        if (error.result?.error?.code !== 404 && error.result?.error?.code !== 410) {
            console.error("Error deleting Google Task:", error);
            throw error;
        }
    }
};

export const updateGoogleCalendarEvent = async (eventId: string, summary: string): Promise<any> => {
    const response = await gapi.client.calendar.events.patch({ calendarId: 'primary', eventId: eventId, resource: { summary } });
    return response.result;
};

export const deleteGoogleCalendarEvent = async (eventId: string): Promise<void> => {
    try {
        await gapi.client.calendar.events.delete({ calendarId: 'primary', eventId: eventId });
    } catch (error: any) {
        if (error.result?.error?.code !== 410) {
            console.error("Error deleting Google Calendar event:", error);
            throw error;
        }
    }
};