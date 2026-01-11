
import React, { useState, useEffect } from 'react';
import { db, storage } from '../../services/firebase';
import { useData } from '../../hooks/useData';
import {
    CreditCardIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon
} from '../icons';

interface StorageInfo {
    databaseBytes: number;
    storageBytes: number;
    totalBytes: number;
    limitBytes: number;
    planName: string;
    isLoading: boolean;
    error: string | null;
}

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const SubscriptionStorage: React.FC = () => {
    const { companyId } = useData();
    const [storageInfo, setStorageInfo] = useState<StorageInfo>({
        databaseBytes: 0,
        storageBytes: 0,
        totalBytes: 0,
        limitBytes: 0,
        planName: '',
        isLoading: true,
        error: null
    });

    useEffect(() => {
        if (!companyId) return;

        const calculateStorage = async () => {
            try {
                // Get company data to estimate database size
                const companySnapshot = await db.ref(`companies/${companyId}`).once('value');
                const companyData = companySnapshot.val();

                // Estimate database size (JSON string length is a rough approximation)
                const databaseBytes = companyData
                    ? new Blob([JSON.stringify(companyData)]).size
                    : 0;

                // Get subscription info
                const subscription = companyData?.subscription;
                let planName = 'No Plan';
                let limitBytes = 0;

                if (subscription?.planId) {
                    // Fetch plan details
                    const planSnapshot = await db.ref(`admin/plans/${subscription.planId}`).once('value');
                    const plan = planSnapshot.val();
                    if (plan) {
                        planName = plan.name;
                        limitBytes = (plan.storageLimitMB || 0) * 1024 * 1024;
                    }
                }

                // Try to estimate Firebase Storage usage (files/images)
                let storageBytes = 0;
                try {
                    // List files in company's storage folder
                    const storageRef = storage.ref(`companies/${companyId}`);
                    const fileList = await storageRef.listAll();

                    // Get metadata for each file to sum up sizes
                    const metadataPromises = fileList.items.map(item => item.getMetadata());
                    const metadataResults = await Promise.all(metadataPromises);
                    storageBytes = metadataResults.reduce((sum, meta) => sum + (meta.size || 0), 0);

                    // Also check prefixes (subdirectories)
                    for (const prefix of fileList.prefixes) {
                        const subList = await prefix.listAll();
                        const subMetaPromises = subList.items.map(item => item.getMetadata());
                        const subMetaResults = await Promise.all(subMetaPromises);
                        storageBytes += subMetaResults.reduce((sum, meta) => sum + (meta.size || 0), 0);
                    }
                } catch (storageError) {
                    // Storage might not have any files yet, that's ok
                    console.log('No storage files found or error accessing storage');
                }

                const totalBytes = databaseBytes + storageBytes;

                setStorageInfo({
                    databaseBytes,
                    storageBytes,
                    totalBytes,
                    limitBytes,
                    planName,
                    isLoading: false,
                    error: null
                });
            } catch (error: any) {
                setStorageInfo(prev => ({
                    ...prev,
                    isLoading: false,
                    error: error.message || 'Failed to calculate storage'
                }));
            }
        };

        calculateStorage();
    }, [companyId]);

    const usagePercent = storageInfo.limitBytes > 0
        ? Math.min((storageInfo.totalBytes / storageInfo.limitBytes) * 100, 100)
        : 0;

    const isNearLimit = usagePercent > 80;
    const isOverLimit = usagePercent >= 100;

    if (storageInfo.isLoading) {
        return (
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                    <div className="h-8 bg-gray-700 rounded"></div>
                    <div className="h-4 bg-gray-700 rounded w-1/2"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Current Plan */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-brand-500/20">
                        <CreditCardIcon className="w-5 h-5 text-brand-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">Current Plan</h3>
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-2xl font-bold text-white">{storageInfo.planName}</p>
                        <p className="text-sm text-gray-400 mt-1">
                            {storageInfo.limitBytes > 0
                                ? `${formatBytes(storageInfo.limitBytes)} storage included`
                                : 'No storage limit set'}
                        </p>
                    </div>
                    {storageInfo.planName !== 'No Plan' && (
                        <div className="flex items-center gap-2 text-green-400">
                            <CheckCircleIcon className="w-5 h-5" />
                            <span className="text-sm font-medium">Active</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Storage Usage */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Storage Usage</h3>

                {storageInfo.error ? (
                    <div className="text-red-400 text-sm">{storageInfo.error}</div>
                ) : (
                    <>
                        {/* Progress Bar */}
                        <div className="mb-4">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-400">Used</span>
                                <span className={`font-medium ${isOverLimit ? 'text-red-400' : isNearLimit ? 'text-amber-400' : 'text-white'}`}>
                                    {formatBytes(storageInfo.totalBytes)}
                                    {storageInfo.limitBytes > 0 && ` / ${formatBytes(storageInfo.limitBytes)}`}
                                </span>
                            </div>
                            <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        isOverLimit ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : 'bg-brand-500'
                                    }`}
                                    style={{ width: `${storageInfo.limitBytes > 0 ? usagePercent : 0}%` }}
                                />
                            </div>
                            {storageInfo.limitBytes > 0 && (
                                <p className="text-xs text-gray-500 mt-1 text-right">
                                    {usagePercent.toFixed(1)}% used
                                </p>
                            )}
                        </div>

                        {/* Warning */}
                        {isNearLimit && !isOverLimit && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-4">
                                <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
                                <p className="text-sm text-amber-300">
                                    You're approaching your storage limit. Consider upgrading your plan.
                                </p>
                            </div>
                        )}

                        {isOverLimit && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 mb-4">
                                <ExclamationTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
                                <p className="text-sm text-red-300">
                                    You've exceeded your storage limit. Please upgrade your plan or remove some data.
                                </p>
                            </div>
                        )}

                        {/* Breakdown */}
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Database</p>
                                <p className="text-lg font-semibold text-white">{formatBytes(storageInfo.databaseBytes)}</p>
                                <p className="text-xs text-gray-500">Vehicle records, transactions, etc.</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">File Storage</p>
                                <p className="text-lg font-semibold text-white">{formatBytes(storageInfo.storageBytes)}</p>
                                <p className="text-xs text-gray-500">Images, documents, receipts</p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Tips */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Storage Tips</h4>
                <ul className="text-xs text-gray-500 space-y-1">
                    <li>• Compress images before uploading to save space</li>
                    <li>• Archive old vehicle records you no longer need</li>
                    <li>• Delete duplicate or unused documents from the filing cabinet</li>
                </ul>
            </div>
        </div>
    );
};

export default SubscriptionStorage;
