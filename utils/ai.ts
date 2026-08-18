
import { GoogleGenAI, Type } from "@google/genai";
import { fileToBase64 } from './helpers';
import { GeminiAction, StatementTransaction, Vehicle } from '../types';

// Load Gemini API key from Vite environment variables
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

// Surface a clear, actionable message instead of a cryptic SDK auth error when the
// Gemini key hasn't been configured. (Set VITE_GEMINI_API_KEY in .env.local and restart.)
const ensureApiKey = () => {
    if (!apiKey) {
        throw new Error('AI features need a Gemini API key. Add VITE_GEMINI_API_KEY to your .env.local file and restart the app.');
    }
};

export const getCategorySuggestionForTx = async (description: string, categories: string[]): Promise<string> => {
    const textPart = { text: `Given the transaction description "${description}", which of the following expense categories is the most logical fit? [${categories.join(', ')}]. Respond ONLY with the category name in a JSON format like this: {"category": "chosen_category_name"}.` };

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: [textPart] },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    category: { type: Type.STRING },
                }
            },
        },
    });

    if (!response.text) return 'Other';
    try {
        const result = JSON.parse(response.text.trim());
        const suggestedCategory = result.category;
        // Validate that the AI returned a valid category
        if (suggestedCategory && categories.includes(suggestedCategory)) {
            return suggestedCategory;
        }
        return 'Other';
    } catch (e) {
        console.error("Failed to parse category suggestion from AI:", e);
        return 'Other';
    }
}

export const scanVehicleInvoice = async (file: File): Promise<Partial<Vehicle> & { grandTotal?: number, totalDeliveryCost?: number, deliveryVat?: number, vendor?: string }> => {
    ensureApiKey();
    const base64Data = await fileToBase64(file);
    const mimeType = file.type;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
            parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: "Analyze this vehicle purchase invoice. 1. Find the 'grandTotal' (The final amount at the bottom including hammer price, indemnity fees, and VAT). 2. Find the 'totalDeliveryCost' (The specific line item amount for delivery/transport, including its VAT). 3. Extract vehicle details." }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    reg: { type: Type.STRING },
                    make: { type: Type.STRING },
                    model: { type: Type.STRING },
                    vin: { type: Type.STRING },
                    color: { type: Type.STRING },
                    year: { type: Type.NUMBER },
                    mileage: { type: Type.NUMBER },
                    engineSize: { type: Type.STRING },
                    firstRegistered: { type: Type.STRING },
                    grandTotal: { type: Type.NUMBER, description: "The final total amount of the invoice including all fees and taxes." },
                    purchaseDate: { type: Type.STRING },
                    totalDeliveryCost: { type: Type.NUMBER, description: "The gross amount for delivery or transport if present." },
                    deliveryVat: { type: Type.NUMBER },
                    vendor: { type: Type.STRING },
                }
            }
        }
    });

    return JSON.parse(response.text || '{}');
};

export const scanExpenseReceipt = async (file: File, categories: string[]): Promise<{
    vendor?: string;
    date?: string;
    amount?: number;
    vat?: number;
    category?: string;
}> => {
    ensureApiKey();
    const base64Data = await fileToBase64(file);
    const mimeType = file.type;

    const prompt = `Extract receipt details. Suggest a category from this list: [${categories.join(', ')}]. Return JSON.`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
            parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: prompt }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    vendor: { type: Type.STRING },
                    date: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                    vat: { type: Type.NUMBER },
                    category: { type: Type.STRING },
                }
            }
        }
    });

    return JSON.parse(response.text || '{}');
};

export const getSmartReconciliationSuggestion = async (
    tx: StatementTransaction, 
    unreconciledReceipts: any[], 
    categories: string[], 
    vehicles: Vehicle[], 
    transactionHistory: any[]
): Promise<{
    match?: { vehicleId?: string, receiptIds?: string[] };
    suggestion?: { category: string };
}> => {
    // This function can be complex, simplifying for this example to return a category based on history or simple rules
    // In a real app, you might send a lot of context to Gemini here.
    
    // Simple heuristic: check history
    const historyMatch = transactionHistory.find(t => t.description === tx.description && t.category !== 'Other');
    if (historyMatch) {
        return { suggestion: { category: historyMatch.category } };
    }

    // Ask Gemini for category
    const cat = await getCategorySuggestionForTx(tx.description, categories);
    return { suggestion: { category: cat } };
};

export const processGeneralCommandStream = async (
    conversationHistory: any[],
    dataContext: any,
    onChunk: (text: string) => void
): Promise<GeminiAction> => {
    // Basic implementation that processes text and returns a structured action.
    // Streaming is simulated by just awaiting the full response for simplicity in this utility fix, 
    // but typically you'd use generateContentStream.
    
    const contextPrompt = `
        You are an assistant for a car dealership management app.
        Context:
        Vehicles: ${JSON.stringify(dataContext.vehicleRegs)}
        Categories: ${JSON.stringify(dataContext.expenseCategories)}
        Current View: ${dataContext.currentView}
        
        Determine the user intent and extract entities.
        Intents: NAVIGATE, CREATE_DOCUMENT, ADD_TODO, ADD_WARRANTY_CLAIM, ADD_EXPENSE, UPDATE_TODO, DELETE_TODO, RECLASSIFY_TODO, CONVERSATIONAL_RESPONSE.
    `;

    const lastMessage = conversationHistory[conversationHistory.length - 1].parts[0].text;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
            { role: 'user', parts: [{ text: contextPrompt }] },
            { role: 'user', parts: [{ text: lastMessage }] }
        ],
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    intent: { type: Type.STRING },
                    entities: { type: Type.OBJECT },
                    responseText: { type: Type.STRING }
                }
            }
        }
    });

    const text = response.text || '{}';
    const result = JSON.parse(text);
    
    // Simulate streaming the response text to the UI callback
    if (result.responseText) {
        onChunk(result.responseText);
    }

    return result as GeminiAction;
};

export const analyzeCanvasUpload = async (file: File): Promise<{ headline: string, documentType?: string, registrationNumber?: string }> => {
    ensureApiKey();
    const base64Data = await fileToBase64(file);
    const mimeType = file.type;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
            parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: "Analyze this document. Identify what it is (e.g. V5C, Invoice, MOT). If it's a V5C, extract the registration number. Provide a short headline summary." }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    headline: { type: Type.STRING },
                    documentType: { type: Type.STRING },
                    registrationNumber: { type: Type.STRING }
                }
            }
        }
    });

    return JSON.parse(response.text || '{}');
};

