
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

// ============== AUTO-RESPONSE FUNCTIONS ==============

export interface EmailComplexityResult {
    isComplex: boolean;
    complexityScore: number;       // 0-100
    reason: string;
    suggestedAction: 'auto_respond' | 'human_review' | 'skip';
    detectedKeywords: string[];
}

/**
 * Analyze email complexity to determine if AI can safely auto-respond
 */
export const analyzeEmailComplexity = async (
    email: { subject: string; body: string },
    settings?: {
        simpleIntents?: string[];
        complexKeywords?: string[];
    }
): Promise<EmailComplexityResult> => {
    const prompt = `Analyze this car dealership enquiry email and determine if it can be safely auto-responded to by AI.

Email Subject: ${email.subject}
Email Body: ${email.body}

RULES FOR AUTO-RESPONSE (these are SAFE for AI to handle):
- Simple availability questions ("Is the car still available?")
- Basic pricing enquiries ("What's the price?", "How much?")
- Test drive requests ("Can I book a test drive?", "When can I view?")
- General interest expressions ("I'm interested in...", "Can you send more info?")
- Opening hours questions
- Short/empty messages asking for basic info
- Location/address enquiries

RULES FOR HUMAN REVIEW (AI should NOT auto-respond to these):
- Finance calculations or specific monthly payment questions
- Trade-in/part exchange valuations requiring assessment
- Detailed warranty questions with specific scenarios
- Legal or compliance questions
- Complaints, disputes, or expressions of unhappiness
- Multiple complex questions in one email
- Questions about car history, accidents, or HPI checks
- Specific mechanical or technical questions
- Negotiation attempts or "best price" requests
- Questions requiring specific knowledge the AI doesn't have

Analyze the email and return your assessment.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isComplex: { type: Type.BOOLEAN },
                        complexityScore: { type: Type.NUMBER },
                        reason: { type: Type.STRING },
                        suggestedAction: { type: Type.STRING },
                        detectedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    }
                }
            }
        });

        const result = JSON.parse(response.text || '{}');
        return {
            isComplex: result.isComplex ?? false,
            complexityScore: result.complexityScore ?? 50,
            reason: result.reason || 'Unable to determine',
            suggestedAction: result.suggestedAction || 'human_review',
            detectedKeywords: result.detectedKeywords || [],
        };
    } catch (error) {
        console.error('Error analyzing email complexity:', error);
        // Default to human review on error (safer)
        return {
            isComplex: true,
            complexityScore: 100,
            reason: 'Error analyzing email - defaulting to human review',
            suggestedAction: 'human_review',
            detectedKeywords: [],
        };
    }
};

export interface EnhancedEmailAnalysis extends EmailAnalysisResult {
    complexity: EmailComplexityResult;
    suggestedAutoResponse?: string;
}

/**
 * Enhanced email analysis for auto-response system
 * Combines vehicle matching, intent detection, and complexity analysis
 */
export const analyzeEmailForAutoResponse = async (
    email: { subject: string; body: string; senderEmail: string; senderName: string },
    inventory: Vehicle[],
    businessDetails: { name: string; phone?: string; address?: string }
): Promise<EnhancedEmailAnalysis> => {
    // Run both analyses in parallel for performance
    const [basicAnalysis, complexityAnalysis] = await Promise.all([
        analyzeIncomingEmail(email, inventory),
        analyzeEmailComplexity({ subject: email.subject, body: email.body })
    ]);

    let suggestedAutoResponse: string | undefined;

    // Only generate auto-response if it's a simple enquiry
    if (!complexityAnalysis.isComplex && complexityAnalysis.suggestedAction === 'auto_respond') {
        // Find the matched vehicle
        const matchedVehicle = basicAnalysis.suggestedVehicleId
            ? inventory.find(v => v.id === basicAnalysis.suggestedVehicleId)
            : undefined;

        suggestedAutoResponse = await generateAutoResponseEmail(
            email,
            basicAnalysis.intent,
            matchedVehicle,
            businessDetails
        );
    }

    return {
        ...basicAnalysis,
        complexity: complexityAnalysis,
        suggestedAutoResponse,
    };
};

/**
 * Generate an auto-response email for simple enquiries
 */
export const generateAutoResponseEmail = async (
    originalEmail: { subject: string; body: string; senderName: string },
    intent: EmailIntent,
    vehicle?: Vehicle,
    businessDetails?: { name: string; phone?: string; address?: string }
): Promise<string> => {
    const businessName = businessDetails?.name || 'Our Dealership';
    const businessPhone = businessDetails?.phone || '';
    const businessAddress = businessDetails?.address || '';

    const vehicleInfo = vehicle
        ? `
Vehicle Details:
- ${vehicle.year} ${vehicle.make} ${vehicle.model}
- Registration: ${vehicle.reg}
- Mileage: ${vehicle.mileage?.toLocaleString() || 'Please enquire'} miles
- Colour: ${vehicle.color || 'Please enquire'}`
        : '';

    const intentContext: Record<EmailIntent, string> = {
        availability: 'They are asking if a vehicle is still available.',
        pricing: 'They are asking about price or cost.',
        test_drive: 'They want to book a test drive or viewing.',
        trade_in: 'They mentioned a trade-in (but this is complex - keep response simple).',
        finance: 'They mentioned finance (but this is complex - keep response simple).',
        general: 'This is a general enquiry.',
    };

    const prompt = `Generate a professional, friendly auto-response email for a UK car dealership.

CONTEXT:
- Customer Name: ${originalEmail.senderName}
- Original Subject: ${originalEmail.subject}
- Original Message: ${originalEmail.body}
- Customer Intent: ${intentContext[intent]}
${vehicleInfo}

BUSINESS INFO:
- Dealership: ${businessName}
${businessPhone ? `- Phone: ${businessPhone}` : ''}
${businessAddress ? `- Address: ${businessAddress}` : ''}

REQUIREMENTS:
1. Be warm, professional, and helpful
2. Use the customer's first name if available
3. Address their specific question briefly
4. If a vehicle was identified, confirm it's currently available (or say you'll check)
5. Invite them to call, email back, or visit for more information
6. Keep it under 150 words
7. Don't make specific promises about prices, finance, or trade-in values
8. Sign off with the dealership name
9. Write in British English

Return ONLY the email body text (no subject line, no "Subject:" prefix).`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [{ text: prompt }] },
        });

        return response.text?.trim() || '';
    } catch (error) {
        console.error('Error generating auto-response:', error);
        return '';
    }
};
