import React, { useState, useEffect } from 'react';
import { BusinessDetails } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { db, auth } from '../../services/firebase';
import * as dataService from '../../services/dataService';
import UkDateInput from '../common/UkDateInput';
import SessionInfoCard from './SessionInfoCard';
import AppUpdateCard from './AppUpdateCard';
import FirebaseHealthCheckCard from './FirebaseHealthCheckCard';
import MotSweepCard from './MotSweepCard';
import Spinner from '../common/Spinner';
import { CONFIG } from '../../config';

const AdminProvisioning = () => {
    const [newUserUid, setNewUserUid] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const adminUser = auth.currentUser;
        if (!adminUser || !newUserUid.trim() || !newUserEmail.trim()) {
            setStatus('error');
            setMessage('Admin user not found or fields are empty.');
            return;
        }

        setStatus('running');
        setMessage('Provisioning new account...');

        try {
            await dataService.provisionAccountForNewUser(adminUser, newUserUid.trim(), newUserEmail.trim());
            setStatus('success');
            setMessage(`Successfully created a new business account for ${newUserEmail}.`);
            setNewUserUid('');
            setNewUserEmail('');
        } catch (error: any) {
            console.error("Provisioning failed:", error);
            setStatus('error');
            setMessage(`Failed to provision account: ${error.message}`);
        } finally {
            setTimeout(() => setStatus('idle'), 5000);
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold text-white">Admin: User Provisioning</h2>
            <p className="text-sm text-gray-400 mt-1">Create a new, separate business account for a user you have already created in Firebase Authentication.</p>
            
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                    <label htmlFor="newUserUid" className="block text-sm font-medium text-gray-300">New User's UID</label>
                    <input 
                        id="newUserUid" 
                        type="text" 
                        value={newUserUid}
                        onChange={e => setNewUserUid(e.target.value)}
                        placeholder="Paste UID from Firebase Console"
                        required 
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white font-mono" />
                </div>
                <div>
                    <label htmlFor="newUserEmail" className="block text-sm font-medium text-gray-300">New User's Email</label>
                    <input 
                        id="newUserEmail" 
                        type="email"
                        value={newUserEmail}
                        onChange={e => setNewUserEmail(e.target.value)}
                        placeholder="user@example.com"
                        required 
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                </div>
                <div className="flex justify-end">
                    <button type="submit" disabled={status === 'running'} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                        {status === 'running' ? <Spinner /> : 'Provision New Business'}
                    </button>
                </div>
            </form>

            {status !== 'idle' && (
                <div className={`mt-4 p-3 text-sm rounded-md ${status === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                    {message}
                </div>
            )}
        </div>
    );
};


const BusinessDetailsPage = () => {
    const { businessDetails, updateBusinessDetails, companyId } = useData();
    const { openModal } = useUI();
    const [formData, setFormData] = useState<BusinessDetails>({
        name: '', address: '', phone: '', email: '', vatNumber: '', companyNumber: '', bankDetails: '', invoiceTerms: '', theme: 'blue', vatStartDate: '', operatingMode: 'dealership', isVatRegistered: false, mtdVatExportEnabled: false
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const currentUserEmail = auth.currentUser?.email;
    const adminEmail = CONFIG.ADMIN_EMAIL;
    const isAdmin = currentUserEmail === adminEmail;

    const themes = [
        { name: 'Blue', value: 'blue', color: 'bg-blue-500' },
        { name: 'Green', value: 'green', color: 'bg-green-500' },
        { name: 'Red', value: 'red', color: 'bg-red-500' },
        { name: 'Purple', value: 'purple', color: 'bg-purple-500' },
        { name: 'Pink', value: 'pink', color: 'bg-pink-500' },
        { name: 'Yellow', value: 'yellow', color: 'bg-yellow-500' },
    ];

    useEffect(() => {
        if (businessDetails) {
            setFormData({ operatingMode: 'dealership', isVatRegistered: false, mtdVatExportEnabled: false, ...businessDetails });
        }
    }, [businessDetails]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setSaveSuccess(false);
        await updateBusinessDetails(formData);
        setIsSaving(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
    };

    return (
        <div className="space-y-8 max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
                 <h2 className="text-lg font-semibold text-white">Business Details & Appearance</h2>
                 <p className="text-sm text-gray-400 -mt-4">This information will appear on your sales invoices.</p>
                 
                 <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300">Operating Mode</label>
                    <div className="mt-2 flex items-center space-x-2 rounded-lg bg-gray-700 p-1">
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, operatingMode: 'dealership' }))} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${formData.operatingMode === 'dealership' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Dealership</button>
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, operatingMode: 'paint_shop' }))} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${formData.operatingMode === 'paint_shop' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Paint Shop</button>
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, operatingMode: 'mechanic' }))} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${formData.operatingMode === 'mechanic' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Mechanic</button>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                        <label htmlFor="name" className="block text-sm font-medium text-gray-300">Company Name</label>
                        <input type="text" name="name" id="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white" />
                    </div>
                     <div className="md:col-span-2">
                        <label htmlFor="address" className="block text-sm font-medium text-gray-300">Address</label>
                        <textarea name="address" id="address" value={formData.address} onChange={handleChange} rows={4} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white" />
                    </div>
                     <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-300">Phone Number</label>
                        <input type="text" name="phone" id="phone" value={formData.phone || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white" />
                    </div>
                     <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email Address</label>
                        <input type="email" name="email" id="email" value={formData.email || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white" />
                    </div>
                    <div className="md:col-span-2 relative flex items-start">
                        <div className="flex h-6 items-center">
                            <input 
                                id="isVatRegistered" 
                                name="isVatRegistered" 
                                type="checkbox" 
                                checked={formData.isVatRegistered || false} 
                                onChange={(e) => setFormData(prev => ({ ...prev, isVatRegistered: e.target.checked }))} 
                                className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600 focus:ring-brand-600"
                            />
                        </div>
                        <div className="ml-3 text-sm leading-6">
                            <label htmlFor="isVatRegistered" className="font-medium text-gray-300">Business is VAT Registered</label>
                            <p className="text-gray-400">Enable this to activate VAT calculations across the app.</p>
                        </div>
                    </div>
                      <div className={formData.isVatRegistered ? '' : 'opacity-50'}>
                        <label htmlFor="vatNumber" className="block text-sm font-medium text-gray-300">VAT Number</label>
                        <input type="text" name="vatNumber" id="vatNumber" value={formData.vatNumber || ''} onChange={handleChange} disabled={!formData.isVatRegistered} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white disabled:bg-gray-700/50 disabled:cursor-not-allowed" />
                    </div>
                     <div>
                        <label htmlFor="companyNumber" className="block text-sm font-medium text-gray-300">Company Number</label>
                        <input type="text" name="companyNumber" id="companyNumber" value={formData.companyNumber || ''} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white" />
                    </div>
                    <div className={`md:col-span-2 ${formData.isVatRegistered ? '' : 'opacity-50'}`}>
                        <label htmlFor="vatStartDate" className="block text-sm font-medium text-gray-300">VAT Quarter Start Date</label>
                        <UkDateInput id="vatStartDate" name="vatStartDate" value={formData.vatStartDate || ''} onChange={handleChange} className="mt-1" />
                        <p className="text-xs text-gray-400 mt-1">Set the first day of any of your VAT quarters to get correct date ranges in the VAT Summary. E.g., if your quarters are Feb-Apr, May-Jul etc., set this to a Feb 1st.</p>
                    </div>
                    <div className={`md:col-span-2 relative flex items-start ${formData.isVatRegistered ? '' : 'opacity-50'}`}>
                        <div className="flex h-6 items-center">
                            <input
                                id="mtdVatExportEnabled"
                                name="mtdVatExportEnabled"
                                type="checkbox"
                                checked={formData.mtdVatExportEnabled || false}
                                onChange={(e) => setFormData(prev => ({ ...prev, mtdVatExportEnabled: e.target.checked }))}
                                disabled={!formData.isVatRegistered}
                                className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600 focus:ring-brand-600 disabled:cursor-not-allowed"
                            />
                        </div>
                        <div className="ml-3 text-sm leading-6">
                            <label htmlFor="mtdVatExportEnabled" className="font-medium text-gray-300">Enable MTD VAT bridging export</label>
                            <p className="text-gray-400">Adds an MTD spreadsheet export to the VAT page for bridging software submissions.</p>
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="bankDetails" className="block text-sm font-medium text-gray-300">Bank Details</label>
                        <textarea name="bankDetails" id="bankDetails" value={formData.bankDetails || ''} onChange={handleChange} rows={3} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white" />
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="invoiceTerms" className="block text-sm font-medium text-gray-300">Invoice Terms & Conditions</label>
                        <textarea name="invoiceTerms" id="invoiceTerms" value={formData.invoiceTerms || ''} onChange={handleChange} rows={4} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white" />
                    </div>
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-300">Theme Colour</label>
                    <fieldset className="mt-2">
                        <legend className="sr-only">Choose a theme color</legend>
                        <div className="flex items-center space-x-3">
                           {themes.map(theme => (
                                <label key={theme.value} className="-m-0.5 relative p-0.5 rounded-full flex items-center justify-center cursor-pointer focus:outline-none">
                                    <input type="radio" name="theme" value={theme.value} checked={formData.theme === theme.value} onChange={e => setFormData(prev => ({ ...prev, theme: e.target.value }))} className="sr-only" />
                                    <span aria-hidden="true" className={`h-8 w-8 ${theme.color} border border-black border-opacity-10 rounded-full`}></span>
                                    {formData.theme === theme.value && <span className="absolute inset-0 rounded-full ring-2 ring-offset-2 ring-offset-gray-800 ring-white" aria-hidden="true"></span>}
                                </label>
                           ))}
                        </div>
                    </fieldset>
                </div>
                <div className="flex justify-end pt-4">
                    <button type="submit" disabled={isSaving} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                        {isSaving ? 'Saving...' : (saveSuccess ? 'Saved!' : 'Save Changes')}
                    </button>
                </div>
            </form>

            {isAdmin && <AdminProvisioning />}

            <MotSweepCard />

            <AppUpdateCard />

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-lg font-semibold text-white">Firebase Diagnostics</h2>
                <div className="mt-4 space-y-6">
                    <SessionInfoCard />
                    <FirebaseHealthCheckCard />
                </div>
            </div>
        </div>
    );
};

export default BusinessDetailsPage;