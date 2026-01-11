
import React, { useState } from 'react';
import { signInWithEmail } from '../services/firebase';
import Spinner from '../components/common/Spinner';
import { ShieldCheckIcon, ExclamationTriangleIcon } from '../components/icons';

interface AdminLoginPageProps {
    error?: string | null;
}

const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ error: authError }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await signInWithEmail(email, password);
            // Auth state change will be handled by AdminContext
        } catch (err: any) {
            setError(err.message || 'Failed to sign in');
        }

        setIsLoading(false);
    };

    const displayError = authError || error;

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-500/20 mb-4">
                        <ShieldCheckIcon className="w-8 h-8 text-brand-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
                    <p className="text-gray-400 mt-2">Dealer Ledger Pro Administration</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-6 space-y-6 border border-gray-800">
                    {displayError && (
                        <div className="p-4 rounded-lg bg-red-900/50 border border-red-700 flex items-start gap-3">
                            <ExclamationTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm text-red-300">{displayError}</p>
                                {authError && (
                                    <p className="text-xs text-red-400 mt-1">
                                        Only authorized administrators can access this panel.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                            Email Address
                        </label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            placeholder="admin@example.com"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            placeholder="Enter your password"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 px-4 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Spinner className="w-5 h-5" />
                                Signing in...
                            </>
                        ) : (
                            'Sign in to Admin'
                        )}
                    </button>
                </form>

                {/* Back to main site */}
                <div className="text-center mt-6">
                    <a
                        href="/"
                        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                    >
                        &larr; Back to main site
                    </a>
                </div>
            </div>
        </div>
    );
};

export default AdminLoginPage;
