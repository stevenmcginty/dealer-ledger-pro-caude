import React, { useState, useEffect, useRef } from 'react';
import { GeminiAction, ModalState, View } from '../../types';
import * as ai from '../../utils/ai';
import { MicrophoneIcon, XMarkIcon, SparklesIcon } from '../icons';
import Spinner from '../common/Spinner';

interface GeminiAssistantProps {
    onClose: () => void;
    onAction: (action: GeminiAction) => Promise<void>;
    dataContext: {
        vehicleRegs: string[];
        expenseCategories: string[];
        currentModal: ModalState;
        currentView: View;
        viewData: any;
    }
}

type Status = 'idle' | 'listening' | 'processing' | 'responding';

interface Message {
    role: 'user' | 'model';
    parts: { text: string }[];
    streaming?: boolean;
}

const GeminiAssistant = ({ onClose, onAction, dataContext }: GeminiAssistantProps) => {
    const [status, setStatus] = useState<Status>('idle');
    const [conversation, setConversation] = useState<Message[]>([
        { role: 'model', parts: [{ text: "Hello! How can I help you?" }] }
    ]);
    const [inputText, setInputText] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const recognitionRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [conversation]);

    useEffect(() => {
        // Focus input on open
        inputRef.current?.focus();
        // Cleanup listener on unmount
        return () => {
            stopListening();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stopListening = () => {
        if (recognitionRef.current && status === 'listening') {
            recognitionRef.current.stop();
        }
    };

    const processMessage = async (messageText: string) => {
        if (!messageText.trim()) return;
        stopListening();

        setStatus('processing');
        const newUserMessage: Message = { role: 'user', parts: [{ text: messageText }] };
        const thinkingMessage: Message = { role: 'model', parts: [{ text: '' }], streaming: true };
        const currentConversation = [...conversation, newUserMessage];
        setConversation([...currentConversation, thinkingMessage]);
        
        try {
            const onChunkCallback = (delta: string) => {
                setConversation(prev => {
                    const lastMessage = prev[prev.length - 1];
                    if (lastMessage && lastMessage.streaming) {
                        const newText = lastMessage.parts[0].text + delta;
                        const updatedLastMessage = { ...lastMessage, parts: [{ text: newText }] };
                        return [...prev.slice(0, -1), updatedLastMessage];
                    }
                    return prev;
                });
            };

            const action = await ai.processGeneralCommandStream(
                currentConversation, 
                dataContext,
                onChunkCallback
            );
            
            setConversation(prev => {
                const lastMessage = prev[prev.length - 1];
                const updatedLastMessage = { ...lastMessage, streaming: false, parts: [{ text: action.responseText }] };
                return [...prev.slice(0, -1), updatedLastMessage];
            });
            
            await onAction(action);

        } catch (error: any) {
            console.error("AI processing error:", error);
            const errorMessage: Message = { role: 'model', parts: [{ text: "Sorry, something went wrong. Please try again." }] };
            setConversation(prev => [...prev.slice(0, -1), errorMessage]);
        } finally {
             setStatus('idle');
        }
    };

    const handleListen = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            const errorMessage: Message = { role: 'model', parts: [{ text: "Sorry, your browser doesn't support voice recognition." }] };
            setConversation(prev => [...prev, errorMessage]);
            return;
        }

        if (status === 'listening') {
            stopListening();
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-GB';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognitionRef.current = recognition;

        recognition.onstart = () => setStatus('listening');
        recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    processMessage(event.results[i][0].transcript.trim());
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            setInterimTranscript(interim);
        };
        recognition.onend = () => { setStatus('idle'); setInterimTranscript(''); };
        recognition.onerror = (event: any) => { console.error('Speech recognition error:', event.error); if(event.error !== 'aborted' && event.error !== 'no-speech') { const errorMessage: Message = { role: 'model', parts: [{ text: "Sorry, I didn't catch that." }] }; setConversation(prev => [...prev, errorMessage]); } };
        
        recognition.start();
    };
    
    const handleTextSubmit = (e: React.FormEvent) => { e.preventDefault(); processMessage(inputText); setInputText(''); };

    const suggestedPrompts = [
        { label: "What cars are in stock?", action: () => processMessage("What cars are in stock?") },
        { label: "Remind me to call the bank", action: () => processMessage("Add a to-do to call the bank tomorrow") },
        { label: "Add a fuel receipt", action: () => processMessage("add a fuel receipt") },
    ];

    return (
        <div role="dialog" aria-modal="true" className="fixed bottom-0 right-0 left-0 z-[70] md:bottom-6 md:right-6 md:left-auto">
            <div className={`relative bg-gray-800 shadow-2xl flex flex-col rounded-t-2xl w-full max-w-xl max-h-[70vh] md:max-w-md md:h-auto md:max-h-[calc(100vh-120px)] md:rounded-xl animate-in slide-in-from-bottom-full md:slide-in-from-right-full duration-300 overflow-hidden`}>
                
                <header className="p-4 flex-shrink-0 flex items-center justify-between border-b border-gray-700 bg-gray-800/70 backdrop-blur-sm">
                    <div className="flex items-center gap-2"><SparklesIcon className="w-6 h-6 text-purple-400" /><h2 className="text-lg font-bold text-white">Gemini Assistant</h2></div>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><XMarkIcon className="h-6 w-6" /></button>
                </header>
                
                <div className="flex-1 px-4 py-4 min-h-0 overflow-y-auto space-y-4">
                    {conversation.map((msg, index) => (
                        <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                           {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-brand-600 flex-shrink-0 flex items-center justify-center"><SparklesIcon className="w-5 h-5 text-white"/></div>}
                            <div className={`max-w-md p-3 rounded-2xl whitespace-pre-wrap shadow-lg ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-none' : 'bg-gray-900/70 backdrop-blur-sm text-gray-200 rounded-bl-none'}`}>
                                {msg.parts[0].text}
                                {msg.streaming && <span className="inline-block w-2 h-4 bg-white cursor-blink ml-1" />}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <footer className="p-4 flex-shrink-0 flex flex-col items-center gap-4 border-t border-gray-700 bg-gray-800/70 backdrop-blur-sm">
                    {conversation.length <= 1 && status === 'idle' && (
                        <div className="flex flex-wrap justify-center gap-2 w-full">
                            {suggestedPrompts.map(p => (
                                <button key={p.label} onClick={p.action} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-full transition-colors">
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="w-full max-w-md flex items-center gap-2">
                         <div className="flex-1 relative">
                            <form onSubmit={handleTextSubmit}>
                                <input ref={inputRef} type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type a command or start talking..." className={`w-full bg-gray-700 border-gray-600 rounded-full py-3 px-5 text-white placeholder-gray-400 transition-opacity ${status === 'listening' ? 'opacity-20' : 'opacity-100'}`} disabled={status !== 'idle'}/>
                            </form>
                             {status === 'listening' && (
                                <div className="absolute inset-0 flex items-center px-5 text-gray-300 pointer-events-none">{interimTranscript}<span className="cursor-blink inline-block w-0.5 h-4 bg-white ml-1"></span></div>
                            )}
                        </div>
                        <button onClick={handleListen} className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-200 flex-shrink-0 ${status === 'listening' ? 'bg-red-600' : 'bg-brand-600 hover:bg-brand-500'}`} aria-label={status === 'listening' ? 'Stop listening' : 'Start listening'} disabled={status === 'processing'}>
                            {status === 'processing' ? <Spinner className="w-6 h-6"/> : <MicrophoneIcon className="w-6 h-6 text-white" />}
                            {status === 'listening' && <div className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping"></div>}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default GeminiAssistant;