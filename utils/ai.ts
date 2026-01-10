
import { GoogleGenAI, Type } from "@google/genai";
import { fileToBase64 } from './helpers';
import { GeminiAction, StatementTransaction, Vehicle } from '../types';

// Load Gemini API key from Vite environment variables
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

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

export const scanVehicleInvoice = async (file: File): Promise<Partial<Vehicle> & { deliveryCharge?: number, deliveryVat?: number, vendor?: string }> => {
    const base64Data = await fileToBase64(file);
    const mimeType = file.type;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
            parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: "Extract vehicle details from this invoice. Return JSON." }
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
                    purchasePrice: { type: Type.NUMBER },
                    purchaseDate: { type: Type.STRING },
                    deliveryCharge: { type: Type.NUMBER },
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

export type EmailIntent = 'availability' | 'pricing' | 'test_drive' | 'trade_in' | 'finance' | 'general';

export interface EmailAnalysisResult {
    vehicleExtracted?: string;
    suggestedVehicleId?: string;
    intent: EmailIntent;
    suggestedTemplate?: string;
    phoneNumber?: string;
    urgency?: 'low' | 'medium' | 'high';
}

export const analyzeIncomingEmail = async (
    email: { subject: string; body: string; senderEmail: string },
    inventory: Vehicle[]
): Promise<EmailAnalysisResult> => {
    const vehicleList = inventory.map(v => ({
        id: v.id,
        reg: v.reg,
        make: v.make,
        model: v.model,
        year: v.year,
    }));

    const prompt = `Analyze this incoming email from a potential car buyer.

Email Subject: ${email.subject}
Email Body: ${email.body}
Sender: ${email.senderEmail}

Available Vehicles:
${JSON.stringify(vehicleList, null, 2)}

Extract:
1. vehicleExtracted - The vehicle they're asking about (make/model/reg if mentioned)
2. suggestedVehicleId - Match to a vehicle ID from the list if possible
3. intent - One of: availability, pricing, test_drive, trade_in, finance, general
4. phoneNumber - Extract any phone number mentioned in the email
5. urgency - low/medium/high based on language used

Return JSON.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        vehicleExtracted: { type: Type.STRING },
                        suggestedVehicleId: { type: Type.STRING },
                        intent: { type: Type.STRING },
                        phoneNumber: { type: Type.STRING },
                        urgency: { type: Type.STRING },
                    }
                }
            }
        });

        const result = JSON.parse(response.text || '{}');
        return {
            vehicleExtracted: result.vehicleExtracted || undefined,
            suggestedVehicleId: result.suggestedVehicleId || undefined,
            intent: result.intent || 'general',
            phoneNumber: result.phoneNumber || undefined,
            urgency: result.urgency || 'medium',
        };
    } catch (error) {
        console.error('Error analyzing email:', error);
        return { intent: 'general' };
    }
};

export const generateEmailReply = async (
    originalEmail: { subject: string; body: string; senderName: string },
    template: string,
    vehicle?: Vehicle,
    businessName?: string
): Promise<string> => {
    const vehicleInfo = vehicle
        ? `Vehicle: ${vehicle.make} ${vehicle.model} (${vehicle.year}) - ${vehicle.reg}`
        : '';

    const prompt = `Generate a professional email reply for a car dealership.

Original Email:
Subject: ${originalEmail.subject}
From: ${originalEmail.senderName}
Body: ${originalEmail.body}

${vehicleInfo}

Template Style: ${template}
Business Name: ${businessName || 'Our Dealership'}

Write a friendly, professional reply. Keep it concise but helpful. Return only the email body text.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [{ text: prompt }] },
        });

        return response.text || '';
    } catch (error) {
        console.error('Error generating email reply:', error);
        return '';
    }
};
