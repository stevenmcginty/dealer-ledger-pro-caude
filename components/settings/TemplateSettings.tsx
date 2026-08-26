import React, { useState } from 'react';
import { Card, Button, Badge, Input, EmptyState, useToast } from '../ui';
import { DocumentTextIcon, PlusIcon, PencilIcon, TrashIcon, SparklesIcon } from '../icons';
import { useData } from '../../hooks/useData';
import { EmailTemplate, NewEmailTemplate } from '../../types';

const TEMPLATE_CATEGORIES = [
    'Initial Response',
    'Follow Up',
    'Test Drive',
    'Price Quote',
    'Vehicle Info',
    'Sold/Unavailable',
    'Custom',
];

const TEMPLATE_VARIABLES = [
    { key: '{{firstName}}', description: 'Customer first name' },
    { key: '{{lastName}}', description: 'Customer last name' },
    { key: '{{vehicleMake}}', description: 'Vehicle make' },
    { key: '{{vehicleModel}}', description: 'Vehicle model' },
    { key: '{{vehicleYear}}', description: 'Vehicle year' },
    { key: '{{vehicleReg}}', description: 'Vehicle registration' },
    { key: '{{vehiclePrice}}', description: 'Vehicle price' },
    { key: '{{businessName}}', description: 'Your business name' },
    { key: '{{businessPhone}}', description: 'Your phone number' },
];

const DEFAULT_TEMPLATES: Omit<NewEmailTemplate, 'createdAt'>[] = [
    {
        name: 'Initial Response',
        category: 'Initial Response',
        subject: 'Re: Enquiry about {{vehicleMake}} {{vehicleModel}}',
        body: `Hi {{firstName}},

Thank you for your enquiry about the {{vehicleYear}} {{vehicleMake}} {{vehicleModel}} ({{vehicleReg}}).

This vehicle is currently available and priced at {{vehiclePrice}}. It's in excellent condition and ready for viewing.

Would you like to arrange a viewing or test drive? We're available Monday to Saturday, 9am-6pm.

Please feel free to call us on {{businessPhone}} or reply to this email.

Best regards,
{{businessName}}`,
    },
    {
        name: 'Vehicle Sold',
        category: 'Sold/Unavailable',
        subject: 'Re: Enquiry about {{vehicleMake}} {{vehicleModel}}',
        body: `Hi {{firstName}},

Thank you for your interest in the {{vehicleMake}} {{vehicleModel}}.

Unfortunately, this vehicle has now been sold. However, we have similar vehicles in stock that might interest you.

Would you like me to send you details of our current stock?

Best regards,
{{businessName}}`,
    },
    {
        name: 'Test Drive Confirmation',
        category: 'Test Drive',
        subject: 'Test Drive Confirmation - {{vehicleMake}} {{vehicleModel}}',
        body: `Hi {{firstName}},

This is to confirm your test drive appointment for the {{vehicleYear}} {{vehicleMake}} {{vehicleModel}}.

Please remember to bring:
- Your driving licence
- Proof of insurance (if required)

Our address: [Your Address]

If you need to reschedule, please call us on {{businessPhone}}.

See you soon!

Best regards,
{{businessName}}`,
    },
];

const TemplateSettings: React.FC = () => {
    const { emailTemplates, addEmailTemplate, updateEmailTemplate, deleteEmailTemplate } = useData();
    const toast = useToast();
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    const [formData, setFormData] = useState<Partial<NewEmailTemplate>>({
        name: '',
        category: 'Custom',
        subject: '',
        body: '',
    });

    const filteredTemplates = selectedCategory === 'all'
        ? emailTemplates
        : emailTemplates.filter(t => t.category === selectedCategory);

    const handleCreateTemplate = async () => {
        if (!formData.name || !formData.subject || !formData.body) {
            toast.error('Please fill in all fields');
            return;
        }
        await addEmailTemplate(formData as NewEmailTemplate);
        setFormData({ name: '', category: 'Custom', subject: '', body: '' });
        setIsCreating(false);
    };

    const handleUpdateTemplate = async () => {
        if (!isEditing || !formData.name || !formData.subject || !formData.body) return;
        await updateEmailTemplate(isEditing, formData);
        setFormData({ name: '', category: 'Custom', subject: '', body: '' });
        setIsEditing(null);
    };

    const handleEditClick = (template: EmailTemplate) => {
        setFormData({
            name: template.name,
            category: template.category,
            subject: template.subject,
            body: template.body,
        });
        setIsEditing(template.id);
        setIsCreating(false);
    };

    const handleDeleteTemplate = async (id: string) => {
        if (confirm('Are you sure you want to delete this template?')) {
            await deleteEmailTemplate(id);
        }
    };

    const handleAddDefaultTemplates = async () => {
        for (const template of DEFAULT_TEMPLATES) {
            await addEmailTemplate(template as NewEmailTemplate);
        }
    };

    const insertVariable = (variable: string) => {
        setFormData(prev => ({
            ...prev,
            body: (prev.body || '') + variable,
        }));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">Email Templates</h3>
                    <p className="text-sm text-gray-400">
                        Create reusable templates for common email responses
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {emailTemplates.length === 0 && (
                        <Button variant="ghost" onClick={handleAddDefaultTemplates}>
                            <SparklesIcon className="w-4 h-4 mr-2" />
                            Add Starter Templates
                        </Button>
                    )}
                    <Button onClick={() => { setIsCreating(true); setIsEditing(null); }}>
                        <PlusIcon className="w-4 h-4 mr-2" />
                        New Template
                    </Button>
                </div>
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        selectedCategory === 'all'
                            ? 'bg-brand-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                >
                    All ({emailTemplates.length})
                </button>
                {TEMPLATE_CATEGORIES.map(cat => {
                    const count = emailTemplates.filter(t => t.category === cat).length;
                    if (count === 0 && selectedCategory !== cat) return null;
                    return (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                selectedCategory === cat
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                        >
                            {cat} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Template Editor */}
            {(isCreating || isEditing) && (
                <Card className="border-brand-500/50">
                    <Card.Header>{isCreating ? 'Create Template' : 'Edit Template'}</Card.Header>
                    <Card.Body className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">
                                    Template Name
                                </label>
                                <Input
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g., Initial Response"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">
                                    Category
                                </label>
                                <select
                                    value={formData.category || 'Custom'}
                                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                                >
                                    {TEMPLATE_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Subject Line
                            </label>
                            <Input
                                value={formData.subject || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                                placeholder="e.g., Re: Enquiry about {{vehicleMake}} {{vehicleModel}}"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Email Body
                            </label>
                            <textarea
                                value={formData.body || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                                placeholder="Enter your email template..."
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 h-48 resize-none font-mono text-sm"
                            />
                        </div>

                        {/* Variables */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Insert Variable
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {TEMPLATE_VARIABLES.map(v => (
                                    <button
                                        key={v.key}
                                        onClick={() => insertVariable(v.key)}
                                        className="px-2 py-1 text-xs bg-gray-800 text-brand-400 rounded hover:bg-gray-700"
                                        title={v.description}
                                    >
                                        {v.key}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setIsCreating(false);
                                    setIsEditing(null);
                                    setFormData({ name: '', category: 'Custom', subject: '', body: '' });
                                }}
                            >
                                Cancel
                            </Button>
                            <Button onClick={isCreating ? handleCreateTemplate : handleUpdateTemplate}>
                                {isCreating ? 'Create Template' : 'Save Changes'}
                            </Button>
                        </div>
                    </Card.Body>
                </Card>
            )}

            {/* Template List */}
            {filteredTemplates.length === 0 && !isCreating ? (
                <EmptyState
                    icon={<DocumentTextIcon className="w-12 h-12" />}
                    title="No templates yet"
                    description="Create email templates to speed up your responses"
                    actionLabel="Create Template"
                    onAction={() => setIsCreating(true)}
                />
            ) : (
                <div className="space-y-3">
                    {filteredTemplates.map(template => (
                        <Card key={template.id} className="hover:border-gray-600 transition-colors">
                            <Card.Body className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-medium text-white">{template.name}</h4>
                                            <Badge variant="default" size="sm">{template.category}</Badge>
                                        </div>
                                        <p className="text-sm text-gray-400 truncate">{template.subject}</p>
                                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{template.body}</p>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={() => handleEditClick(template)}
                                            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"
                                        >
                                            <PencilIcon className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTemplate(template.id)}
                                            className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-700"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </Card.Body>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TemplateSettings;
