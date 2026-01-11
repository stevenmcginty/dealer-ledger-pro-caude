import React, { useState, useEffect } from 'react';
import { useData } from '../../hooks/useData';
import { InboxEmail, Lead } from '../../types';
import {
    EnvelopeIcon,
    CheckCircleIcon,
    XMarkIcon,
    PencilIcon,
    PaperAirplaneIcon,
    ExclamationTriangleIcon,
    ClockIcon,
    UserIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ArrowPathIcon
} from '../icons';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface ReviewQueueProps {
    companyId?: string;
}

const ReviewQueue: React.FC<ReviewQueueProps> = ({ companyId }) => {
    const { inboxEmails, leads, updateInboxEmail, crmSettings } = useData();

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingResponse, setEditingResponse] = useState<string | null>(null);
    const [editedResponse, setEditedResponse] = useState<string>('');
    const [sendingId, setSendingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Filter emails that require human review
    const reviewQueue = inboxEmails.filter(email =>
        email.requiresHumanReview === true &&
        email.status !== 'REPLIED' &&
        email.status !== 'ARCHIVED'
    ).sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

    // Get lead for an email
    const getLeadForEmail = (email: InboxEmail): Lead | undefined => {
        return leads.find(l => l.id === email.leadId);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor(diff / (1000 * 60));

        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    const truncateBody = (body: string, maxLen: number = 150) => {
        if (body.length <= maxLen) return body;
        return body.slice(0, maxLen) + '...';
    };

    const handleApproveAiResponse = async (email: InboxEmail) => {
        if (!email.analysis?.suggestedResponse) return;

        setSendingId(email.id);
        setError(null);

        try {
            // Call the Cloud Function to send the email
            const functions = getFunctions();
            const sendEmail = httpsCallable(functions, 'sendGmailEmail');

            await sendEmail({
                accessToken: crmSettings?.gmailAccessToken,
                to: email.senderEmail,
                subject: `Re: ${email.subject}`,
                body: email.analysis.suggestedResponse,
                threadId: email.gmailThreadId
            });

            // Update email status
            await updateInboxEmail(email.id, {
                status: 'REPLIED',
                reviewedAt: new Date().toISOString(),
                autoResponseSentAt: new Date().toISOString()
            });

            setSuccess(`Reply sent to ${email.senderEmail}`);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to send email');
        } finally {
            setSendingId(null);
        }
    };

    const handleSendEditedResponse = async (email: InboxEmail) => {
        if (!editedResponse.trim()) return;

        setSendingId(email.id);
        setError(null);

        try {
            const functions = getFunctions();
            const sendEmail = httpsCallable(functions, 'sendGmailEmail');

            await sendEmail({
                accessToken: crmSettings?.gmailAccessToken,
                to: email.senderEmail,
                subject: `Re: ${email.subject}`,
                body: editedResponse,
                threadId: email.gmailThreadId
            });

            await updateInboxEmail(email.id, {
                status: 'REPLIED',
                reviewedAt: new Date().toISOString(),
                autoResponseSentAt: new Date().toISOString()
            });

            setEditingResponse(null);
            setEditedResponse('');
            setSuccess(`Reply sent to ${email.senderEmail}`);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to send email');
        } finally {
            setSendingId(null);
        }
    };

    const handleDismiss = async (email: InboxEmail) => {
        try {
            await updateInboxEmail(email.id, {
                requiresHumanReview: false,
                reviewedAt: new Date().toISOString(),
                status: 'UNREAD'
            });
            setSuccess('Email dismissed from review queue');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to dismiss');
        }
    };

    const handleArchive = async (email: InboxEmail) => {
        try {
            await updateInboxEmail(email.id, {
                requiresHumanReview: false,
                reviewedAt: new Date().toISOString(),
                status: 'ARCHIVED'
            });
            setSuccess('Email archived');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to archive');
        }
    };

    const startEditing = (email: InboxEmail) => {
        setEditingResponse(email.id);
        setEditedResponse(email.analysis?.suggestedResponse || '');
    };

    if (reviewQueue.length === 0) {
        return (
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
                <div className="p-4 rounded-full bg-green-500/20 inline-block mb-4">
                    <CheckCircleIcon className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">All Caught Up!</h3>
                <p className="text-gray-400 text-sm">
                    No emails require human review at the moment.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20">
                        <ExclamationTriangleIcon className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Review Queue</h3>
                        <p className="text-sm text-gray-400">
                            {reviewQueue.length} email{reviewQueue.length !== 1 ? 's' : ''} flagged for review
                        </p>
                    </div>
                </div>
            </div>

            {/* Success/Error Messages */}
            {success && (
                <div className="p-3 rounded-lg bg-green-500/20 text-green-400 flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5" />
                    {success}
                </div>
            )}
            {error && (
                <div className="p-3 rounded-lg bg-red-500/20 text-red-400 flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5" />
                    {error}
                    <button onClick={() => setError(null)} className="ml-auto hover:text-red-300">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Email List */}
            <div className="space-y-3">
                {reviewQueue.map((email) => {
                    const lead = getLeadForEmail(email);
                    const isExpanded = expandedId === email.id;
                    const isEditing = editingResponse === email.id;
                    const isSending = sendingId === email.id;

                    return (
                        <div
                            key={email.id}
                            className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
                        >
                            {/* Collapsed Header */}
                            <div
                                className="p-4 cursor-pointer hover:bg-gray-750 transition-colors"
                                onClick={() => setExpandedId(isExpanded ? null : email.id)}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="pt-1">
                                        {isExpanded ? (
                                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                                        ) : (
                                            <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium text-white truncate">
                                                {email.senderName}
                                            </span>
                                            <span className="text-xs text-gray-500 truncate">
                                                &lt;{email.senderEmail}&gt;
                                            </span>
                                            <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
                                                {formatDate(email.receivedAt)}
                                            </span>
                                        </div>

                                        <div className="text-sm text-gray-300 truncate mb-1">
                                            {email.subject}
                                        </div>

                                        {!isExpanded && (
                                            <div className="text-xs text-gray-500 truncate">
                                                {truncateBody(email.body)}
                                            </div>
                                        )}

                                        {/* Flags */}
                                        <div className="flex items-center gap-2 mt-2">
                                            {email.analysis?.isComplexQuestion && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full text-xs">
                                                    <ExclamationTriangleIcon className="w-3 h-3" />
                                                    Complex
                                                </span>
                                            )}
                                            {email.analysis?.complexityReason && (
                                                <span className="text-xs text-gray-500">
                                                    {email.analysis.complexityReason}
                                                </span>
                                            )}
                                            {lead && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs">
                                                    <UserIcon className="w-3 h-3" />
                                                    {lead.firstName} {lead.lastName}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="border-t border-gray-700">
                                    {/* Full Email Body */}
                                    <div className="p-4 bg-gray-900">
                                        <div className="text-xs text-gray-500 mb-2">Original Message:</div>
                                        <div className="text-sm text-gray-300 whitespace-pre-wrap max-h-60 overflow-y-auto">
                                            {email.body}
                                        </div>
                                    </div>

                                    {/* AI Suggested Response */}
                                    {email.analysis?.suggestedResponse && !isEditing && (
                                        <div className="p-4 bg-gray-850 border-t border-gray-700">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs text-gray-500">AI Suggested Response:</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        startEditing(email);
                                                    }}
                                                    className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                                                >
                                                    <PencilIcon className="w-3 h-3" />
                                                    Edit
                                                </button>
                                            </div>
                                            <div className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800 p-3 rounded-lg">
                                                {email.analysis.suggestedResponse}
                                            </div>
                                        </div>
                                    )}

                                    {/* Edit Response */}
                                    {isEditing && (
                                        <div className="p-4 bg-gray-850 border-t border-gray-700">
                                            <div className="text-xs text-gray-500 mb-2">Edit Response:</div>
                                            <textarea
                                                value={editedResponse}
                                                onChange={(e) => setEditedResponse(e.target.value)}
                                                rows={6}
                                                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-brand-500"
                                                placeholder="Type your response..."
                                            />
                                            <div className="flex gap-2 mt-3">
                                                <button
                                                    onClick={() => {
                                                        setEditingResponse(null);
                                                        setEditedResponse('');
                                                    }}
                                                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => handleSendEditedResponse(email)}
                                                    disabled={isSending || !editedResponse.trim()}
                                                    className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    {isSending ? (
                                                        <>
                                                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                                            Sending...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <PaperAirplaneIcon className="w-4 h-4" />
                                                            Send
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    {!isEditing && (
                                        <div className="p-4 border-t border-gray-700 flex items-center gap-2">
                                            {email.analysis?.suggestedResponse && (
                                                <button
                                                    onClick={() => handleApproveAiResponse(email)}
                                                    disabled={isSending}
                                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
                                                >
                                                    {isSending ? (
                                                        <>
                                                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                                            Sending...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircleIcon className="w-4 h-4" />
                                                            Approve & Send
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => startEditing(email)}
                                                className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm flex items-center gap-1"
                                            >
                                                <PencilIcon className="w-4 h-4" />
                                                Write Custom Reply
                                            </button>
                                            <div className="flex-1" />
                                            <button
                                                onClick={() => handleDismiss(email)}
                                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
                                            >
                                                Dismiss
                                            </button>
                                            <button
                                                onClick={() => handleArchive(email)}
                                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
                                            >
                                                Archive
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ReviewQueue;
