import React, { useState } from 'react';
import { Button, Input } from '../ui';
import { XMarkIcon, EnvelopeIcon } from '../icons';
import { useData } from '../../hooks/useData';

interface AddTestEmailModalProps {
    onClose: () => void;
}

const SAMPLE_EMAILS = [
    {
        senderName: 'John Smith',
        senderEmail: 'john.smith@gmail.com',
        subject: 'Enquiry about BMW 3 Series',
        body: 'Hi, I saw your BMW 3 Series listed online and I\'m very interested. Is it still available? What\'s your best price? I can come for a viewing this weekend. My number is 07700 900123. Thanks, John',
    },
    {
        senderName: 'Sarah Johnson',
        senderEmail: 'sarah.j@autotrader.co.uk',
        subject: 'Test drive request - Ford Focus',
        body: 'Hello, I would like to book a test drive for the Ford Focus you have advertised. I\'m available Tuesday or Wednesday afternoon. Please let me know what times work for you. Kind regards, Sarah',
    },
    {
        senderName: 'Mike Williams',
        senderEmail: 'mike.w@motors.co.uk',
        subject: 'Part exchange enquiry',
        body: 'Hi there, I\'m interested in the Audi A4 you have for sale. I have a 2019 VW Golf to trade in with 45,000 miles. Would you be interested in a part exchange? What price would you offer? Cheers, Mike',
    },
    {
        senderName: 'Emma Brown',
        senderEmail: 'emma.brown@yahoo.com',
        subject: 'Finance options available?',
        body: 'Good morning, I\'m looking at the Mercedes C-Class in your stock. Do you offer finance options? I\'d be looking at around £300/month. Can you send me some quotes? Thanks, Emma. Tel: 07712 345678',
    },
];

const AddTestEmailModal: React.FC<AddTestEmailModalProps> = ({ onClose }) => {
    const { addInboxEmail } = useData();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedSample, setSelectedSample] = useState<number | null>(null);

    const [formData, setFormData] = useState({
        senderName: '',
        senderEmail: '',
        subject: '',
        body: '',
    });

    const handleSampleSelect = (index: number) => {
        setSelectedSample(index);
        setFormData(SAMPLE_EMAILS[index]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.senderEmail || !formData.subject) return;

        setIsSubmitting(true);
        try {
            await addInboxEmail({
                source: 'manual',
                senderName: formData.senderName || formData.senderEmail.split('@')[0],
                senderEmail: formData.senderEmail,
                subject: formData.subject,
                body: formData.body,
                receivedAt: new Date().toISOString(),
                status: 'UNREAD',
            });
            onClose();
        } catch (error) {
            console.error('Error adding test email:', error);
        } finally {
            setIsSubmitting(false);
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
                    <div>
                        <h2 className="text-lg font-semibold text-white">Add Test Email</h2>
                        <p className="text-xs text-gray-400">Simulate an incoming enquiry</p>
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
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4">
                    {/* Sample Emails */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Quick Samples
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {SAMPLE_EMAILS.map((sample, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSampleSelect(idx)}
                                    className={`p-2 text-left text-sm rounded-lg border transition-colors ${
                                        selectedSample === idx
                                            ? 'border-brand-500 bg-brand-500/20 text-white'
                                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:border-gray-600'
                                    }`}
                                >
                                    <p className="font-medium truncate">{sample.senderName}</p>
                                    <p className="text-xs text-gray-500 truncate">{sample.subject}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-700 pt-4">
                        <p className="text-xs text-gray-500 mb-3">Or enter custom details:</p>

                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Sender Name"
                                value={formData.senderName}
                                onChange={(e) => setFormData(prev => ({ ...prev, senderName: e.target.value }))}
                            />
                            <Input
                                label="Sender Email"
                                type="email"
                                value={formData.senderEmail}
                                onChange={(e) => setFormData(prev => ({ ...prev, senderEmail: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="mt-4">
                            <Input
                                label="Subject"
                                value={formData.subject}
                                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Body</label>
                            <textarea
                                value={formData.body}
                                onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                                rows={4}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 flex justify-end gap-3 flex-shrink-0">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSubmitting || !formData.senderEmail}>
                        {isSubmitting ? 'Adding...' : 'Add Email'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default AddTestEmailModal;
