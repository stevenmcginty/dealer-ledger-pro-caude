import React, { useState, useMemo, useCallback } from 'react';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import { InboxIcon, PlusIcon, MagnifyingGlassIcon, SparklesIcon, UserGroupIcon, EnvelopeIcon } from '../components/icons';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import { EmailStatus, InboxEmail } from '../types';

const STATUS_VARIANTS: Record<EmailStatus, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
    'UNREAD': 'primary',
    'ANALYZING': 'warning',
    'NEEDS_REVIEW': 'danger',
    'SCHEDULED': 'default',
    'SENT': 'success',
    'ARCHIVED': 'default',
};

const STATUS_ORDER: EmailStatus[] = ['UNREAD', 'NEEDS_REVIEW', 'ANALYZING', 'SCHEDULED', 'SENT', 'ARCHIVED'];

const InboxPage: React.FC = () => {
    const { inboxEmails, updateInboxEmail, leads } = useData();
    const { openModal } = useUI();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<EmailStatus | ''>('');
    const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

    // Filter and sort emails
    const filteredEmails = useMemo(() => {
        let emails = [...inboxEmails];

        // Apply search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            emails = emails.filter(email =>
                email.senderName.toLowerCase().includes(query) ||
                email.senderEmail.toLowerCase().includes(query) ||
                email.subject.toLowerCase().includes(query) ||
                email.body.toLowerCase().includes(query)
            );
        }

        // Apply status filter
        if (statusFilter) {
            emails = emails.filter(email => email.status === statusFilter);
        }

        // Sort by received date (newest first), then by status priority
        return emails.sort((a, b) => {
            const statusDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
            if (statusDiff !== 0) return statusDiff;
            return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
        });
    }, [inboxEmails, searchQuery, statusFilter]);

    const handleCreateLead = useCallback((email: InboxEmail) => {
        openModal('createLeadFromEmail', { email });
    }, [openModal]);

    const handleAnalyzeEmail = useCallback(async (email: InboxEmail) => {
        openModal('analyzeEmail', { email });
    }, [openModal]);

    const handleArchive = useCallback(async (emailId: string) => {
        await updateInboxEmail(emailId, { status: 'ARCHIVED' });
    }, [updateInboxEmail]);

    const handleSelectEmail = useCallback((emailId: string) => {
        setSelectedEmails(prev => {
            const next = new Set(prev);
            if (next.has(emailId)) {
                next.delete(emailId);
            } else {
                next.add(emailId);
            }
            return next;
        });
    }, []);

    const handleSelectAll = useCallback(() => {
        if (selectedEmails.size === filteredEmails.length) {
            setSelectedEmails(new Set());
        } else {
            setSelectedEmails(new Set(filteredEmails.map(e => e.id)));
        }
    }, [filteredEmails, selectedEmails.size]);

    const handleBulkArchive = useCallback(async () => {
        for (const emailId of selectedEmails) {
            await updateInboxEmail(emailId, { status: 'ARCHIVED' });
        }
        setSelectedEmails(new Set());
    }, [selectedEmails, updateInboxEmail]);

    // Count emails by status
    const statusCounts = useMemo(() => {
        return inboxEmails.reduce((acc, email) => {
            acc[email.status] = (acc[email.status] || 0) + 1;
            return acc;
        }, {} as Record<EmailStatus, number>);
    }, [inboxEmails]);

    const unreadCount = statusCounts['UNREAD'] || 0;
    const needsReviewCount = statusCounts['NEEDS_REVIEW'] || 0;

    // Check if email already has a lead
    const getLinkedLead = useCallback((email: InboxEmail) => {
        if (email.leadId) {
            return leads.find(l => l.id === email.leadId);
        }
        // Check by email address
        return leads.find(l => l.email.toLowerCase() === email.senderEmail.toLowerCase());
    }, [leads]);

    if (inboxEmails.length === 0) {
        return (
            <EmptyState
                icon={InboxIcon}
                title="Inbox is empty"
                description="Incoming emails from potential leads will appear here. Connect your email or add emails manually to get started."
                actionLabel="Add Test Email"
                onAction={() => openModal('addTestEmail')}
            />
        );
    }

    return (
        <div className="space-y-4">
            {/* Header Stats */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-white">{inboxEmails.length}</span>
                    <span className="text-gray-400">emails</span>
                </div>
                {unreadCount > 0 && (
                    <Badge variant="primary">{unreadCount} unread</Badge>
                )}
                {needsReviewCount > 0 && (
                    <Badge variant="danger">{needsReviewCount} needs review</Badge>
                )}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    {/* Search */}
                    <div className="relative flex-1 sm:flex-initial">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search emails..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-3 py-1.5 w-full sm:w-56 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                    </div>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as EmailStatus | '')}
                        className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                        <option value="">All Status</option>
                        {STATUS_ORDER.map(status => (
                            <option key={status} value={status}>
                                {status.replace('_', ' ')} ({statusCounts[status] || 0})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Bulk Actions */}
                {selectedEmails.size > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">{selectedEmails.size} selected</span>
                        <Button variant="ghost" size="sm" onClick={handleBulkArchive}>
                            Archive Selected
                        </Button>
                    </div>
                )}
            </div>

            {/* Email List */}
            <div className="space-y-2">
                {/* Select All */}
                {filteredEmails.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400">
                        <input
                            type="checkbox"
                            checked={selectedEmails.size === filteredEmails.length && filteredEmails.length > 0}
                            onChange={handleSelectAll}
                            className="rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500"
                        />
                        <span>Select all</span>
                    </div>
                )}

                {filteredEmails.map(email => {
                    const linkedLead = getLinkedLead(email);
                    const isSelected = selectedEmails.has(email.id);

                    return (
                        <Card
                            key={email.id}
                            className={`transition-colors ${isSelected ? 'border-brand-500/50 bg-brand-500/5' : ''}`}
                        >
                            <Card.Body className="p-3 sm:p-4">
                                <div className="flex items-start gap-2 sm:gap-3">
                                    {/* Checkbox */}
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleSelectEmail(email.id)}
                                        className="mt-1 rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500"
                                    />

                                    {/* Email Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                                            <span className="font-medium text-white truncate max-w-[150px] sm:max-w-none">
                                                {email.senderName}
                                            </span>
                                            <span className="text-xs text-gray-500 truncate hidden sm:inline">
                                                &lt;{email.senderEmail}&gt;
                                            </span>
                                            {/* Timestamp on mobile */}
                                            <span className="text-xs text-gray-500 sm:hidden ml-auto">
                                                {new Date(email.receivedAt).toLocaleDateString('en-GB', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                })}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1 mb-1">
                                            <Badge variant={STATUS_VARIANTS[email.status]} size="sm">
                                                {email.status.replace('_', ' ')}
                                            </Badge>
                                            {linkedLead && (
                                                <Badge variant="success" size="sm" dot>
                                                    Lead exists
                                                </Badge>
                                            )}
                                        </div>

                                        <p className="text-sm text-gray-300 truncate mb-1">
                                            {email.subject}
                                        </p>

                                        <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                                            {email.body}
                                        </p>

                                        {/* AI Analysis Results */}
                                        {email.analysis && (
                                            <div className="flex flex-wrap items-center gap-2 mt-2 p-2 bg-gray-800/50 rounded-lg">
                                                <SparklesIcon className="w-4 h-4 text-brand-400" />
                                                {email.analysis.vehicleExtracted && (
                                                    <span className="text-xs text-brand-300">
                                                        Vehicle: {email.analysis.vehicleExtracted}
                                                    </span>
                                                )}
                                                {email.analysis.intent && (
                                                    <Badge variant="default" size="sm">
                                                        {email.analysis.intent}
                                                    </Badge>
                                                )}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-3">
                                            {!linkedLead && (
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={() => handleCreateLead(email)}
                                                >
                                                    <UserGroupIcon className="w-4 h-4 sm:mr-1" />
                                                    <span className="hidden sm:inline">Create Lead</span>
                                                </Button>
                                            )}
                                            {!email.analysis && email.status !== 'ARCHIVED' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleAnalyzeEmail(email)}
                                                >
                                                    <SparklesIcon className="w-4 h-4 sm:mr-1" />
                                                    <span className="hidden sm:inline">Analyze</span>
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openModal('emailComposer', { email, replyTo: true })}
                                            >
                                                <EnvelopeIcon className="w-4 h-4 sm:mr-1" />
                                                <span className="hidden sm:inline">Reply</span>
                                            </Button>
                                            {email.status !== 'ARCHIVED' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleArchive(email.id)}
                                                >
                                                    <span className="sm:hidden">X</span>
                                                    <span className="hidden sm:inline">Archive</span>
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Timestamp - desktop only */}
                                    <div className="hidden sm:block text-right flex-shrink-0">
                                        <span className="text-xs text-gray-500">
                                            {new Date(email.receivedAt).toLocaleDateString('en-GB', {
                                                day: 'numeric',
                                                month: 'short',
                                            })}
                                        </span>
                                        <p className="text-xs text-gray-600">
                                            {new Date(email.receivedAt).toLocaleTimeString('en-GB', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </p>
                                    </div>
                                </div>
                            </Card.Body>
                        </Card>
                    );
                })}

                {filteredEmails.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-gray-400">No emails match your filters</p>
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setStatusFilter('');
                            }}
                            className="mt-2 text-sm text-brand-400 hover:text-brand-300"
                        >
                            Clear filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InboxPage;
