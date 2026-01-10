import React, { useState } from 'react';
import { Button } from '../ui';
import { XMarkIcon, SparklesIcon, EnvelopeIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { InboxEmail, Lead } from '../../types';
import { generateEmailReply } from '../../utils/ai';

interface EmailComposerProps {
    email?: InboxEmail;
    lead?: Lead;
    replyTo?: boolean;
    onClose: () => void;
}

const DEFAULT_TEMPLATES = [
    { id: 'availability', name: 'Vehicle Availability', category: 'Response' },
    { id: 'pricing', name: 'Pricing Information', category: 'Response' },
    { id: 'test_drive', name: 'Test Drive Booking', category: 'Scheduling' },
    { id: 'follow_up', name: 'Follow Up', category: 'Nurture' },
    { id: 'thank_you', name: 'Thank You', category: 'Post-Sale' },
];

const EmailComposer: React.FC<EmailComposerProps> = ({ email, lead, replyTo, onClose }) => {
    const { businessDetails, vehicles, updateInboxEmail, addLeadActivity } = useData();
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSending, setIsSending] = useState(false);

    const [formData, setFormData] = useState({
        to: email?.senderEmail || lead?.email || '',
        subject: replyTo && email ? `Re: ${email.subject}` : '',
        body: '',
        selectedTemplate: '',
    });

    const handleTemplateSelect = async (templateId: string) => {
        setFormData(prev => ({ ...prev, selectedTemplate: templateId }));

        if (email && templateId) {
            setIsGenerating(true);
            try {
                // Find linked vehicle if any
                const linkedVehicle = email.analysis?.suggestedVehicleId
                    ? vehicles.find(v => v.id === email.analysis?.suggestedVehicleId)
                    : undefined;

                const generatedBody = await generateEmailReply(
                    {
                        subject: email.subject,
                        body: email.body,
                        senderName: email.senderName,
                    },
                    templateId,
                    linkedVehicle,
                    businessDetails?.name
                );

                setFormData(prev => ({ ...prev, body: generatedBody }));
            } catch (error) {
                console.error('Error generating email:', error);
            } finally {
                setIsGenerating(false);
            }
        }
    };

    const handleSend = async () => {
        if (!formData.to || !formData.body) return;

        setIsSending(true);
        try {
            // Open email client with pre-filled content
            const mailtoLink = `mailto:${formData.to}?subject=${encodeURIComponent(formData.subject)}&body=${encodeURIComponent(formData.body)}`;
            window.open(mailtoLink, '_blank');

            // Update email status if replying
            if (email) {
                await updateInboxEmail(email.id, { status: 'SENT' });
            }

            // Add activity to lead if linked
            if (lead) {
                await addLeadActivity(lead.id, {
                    type: 'EMAIL_OUT',
                    content: `Email sent: "${formData.subject}"`,
                    timestamp: new Date().toISOString(),
                });
            }

            onClose();
        } catch (error) {
            console.error('Error sending email:', error);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex flex-col w-full max-h-[80vh]">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-500/20">
                        <EnvelopeIcon className="w-5 h-5 text-blue-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">
                        {replyTo ? 'Reply to Email' : 'Compose Email'}
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4">
                    {/* To Field */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">To</label>
                        <input
                            type="email"
                            value={formData.to}
                            onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                    </div>

                    {/* Subject Field */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Subject</label>
                        <input
                            type="text"
                            value={formData.subject}
                            onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                    </div>

                    {/* Template Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Quick Templates
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {DEFAULT_TEMPLATES.map(template => (
                                <button
                                    key={template.id}
                                    onClick={() => handleTemplateSelect(template.id)}
                                    disabled={isGenerating}
                                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                                        formData.selectedTemplate === template.id
                                            ? 'border-brand-500 bg-brand-500/20 text-white'
                                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:border-gray-600'
                                    }`}
                                >
                                    {template.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* AI Generation Status */}
                    {isGenerating && (
                        <div className="flex items-center gap-2 p-3 bg-brand-500/10 border border-brand-500/30 rounded-lg">
                            <SparklesIcon className="w-5 h-5 text-brand-400 animate-pulse" />
                            <span className="text-sm text-brand-300">Generating email with AI...</span>
                        </div>
                    )}

                    {/* Body Field */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Message</label>
                        <textarea
                            value={formData.body}
                            onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                            rows={10}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                            placeholder="Write your message..."
                        />
                    </div>

                    {/* Original Email Reference */}
                    {email && replyTo && (
                        <div className="p-3 bg-gray-800/50 rounded-lg border-l-2 border-gray-600">
                            <p className="text-xs text-gray-500 mb-1">Original message from {email.senderName}:</p>
                            <p className="text-xs text-gray-400 line-clamp-3">{email.body}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700 flex justify-between items-center flex-shrink-0">
                <p className="text-xs text-gray-500">
                    Opens in your default email client
                </p>
                <div className="flex gap-3">
                    <Button variant="ghost" onClick={onClose} disabled={isSending}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSend}
                        disabled={isSending || !formData.to || !formData.body}
                    >
                        {isSending ? 'Opening...' : 'Send Email'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default EmailComposer;
