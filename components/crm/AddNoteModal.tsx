import React, { useState } from 'react';
import { Button } from '../ui';
import { XMarkIcon, DocumentTextIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { Lead } from '../../types';

interface AddNoteModalProps {
    lead: Lead;
    onClose: () => void;
}

const AddNoteModal: React.FC<AddNoteModalProps> = ({ lead, onClose }) => {
    const { addLeadActivity } = useData();
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!note.trim()) return;

        setIsSubmitting(true);
        try {
            await addLeadActivity(lead.id, {
                type: 'NOTE',
                content: note.trim(),
                timestamp: new Date().toISOString(),
            });
            onClose();
        } catch (error) {
            console.error('Error adding note:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col w-full">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-purple-500/20">
                        <DocumentTextIcon className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Add Note</h2>
                        <p className="text-xs text-gray-400">
                            {lead.firstName} {lead.lastName}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit}>
                <div className="p-4">
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Enter your note..."
                        rows={4}
                        autoFocus
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                    />
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={isSubmitting || !note.trim()}
                    >
                        {isSubmitting ? 'Saving...' : 'Add Note'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default AddNoteModal;
