import React, { useState } from 'react';
import { signOut, auth } from '../../services/firebase';
import { ExclamationTriangleIcon, ClipboardIcon, CheckCircleIcon } from '../icons';

const PermissionDeniedHandler = () => {
    const user = auth.currentUser;
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!user?.uid) return;
        navigator.clipboard.writeText(user.uid).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="bg-gray-950 flex items-center justify-center h-screen p-4">
            <div className="bg-gray-800 p-8 rounded-lg text-center max-w-lg shadow-2xl border border-yellow-500/30">
                <ExclamationTriangleIcon className="h-12 w-12 text-yellow-400 mx-auto" />
                <h2 className="mt-4 text-xl font-bold text-white">Account Not Linked</h2>
                <p className="mt-2 text-gray-300">
                    Your account (<span className="font-semibold text-white">{user?.email || '...'}</span>) has been created but is not yet linked to a business.
                </p>
                <p className="mt-4 text-gray-300">
                    To activate your account, please copy your User ID below and provide it to the system administrator.
                </p>

                <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-400 text-left">Your User ID</label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                        <input
                            type="text"
                            readOnly
                            value={user?.uid || 'Loading...'}
                            className="block w-full flex-1 rounded-none rounded-l-md bg-gray-900 border-gray-700 px-3 py-2 text-gray-400 font-mono"
                        />
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-gray-700 bg-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-500"
                        >
                            {copied ? <CheckCircleIcon className="h-5 w-5 text-green-400" /> : <ClipboardIcon className="h-5 w-5" />}
                            <span>{copied ? 'Copied!' : 'Copy'}</span>
                        </button>
                    </div>
                </div>

                <div className="mt-8">
                    <button
                        onClick={() => signOut()}
                        className="w-full px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md"
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PermissionDeniedHandler;
