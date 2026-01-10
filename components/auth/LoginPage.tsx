import React, { useState } from 'react';
import { signInWithEmail } from '../../services/firebase';
import { CarIcon } from '../icons';
import Spinner from '../common/Spinner';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await signInWithEmail(email, password);
            // onAuthStateChanged in App.tsx will handle the redirect
        } catch (error: any) {
            console.error("Sign-in error:", error);
            if (error.code === 'auth/invalid-credential') {
                setError("Invalid email or password. Please try again.");
            } else {
                // Display the specific Firebase error to the user for better debugging.
                setError(`System Error: ${error.message}`);
            }
            setIsLoading(false);
            setPassword(''); // Clear password on failed attempt
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-sm text-center">
                <div className="flex items-center justify-center mb-6">
                    <CarIcon className="h-10 w-10 text-brand-400" />
                    <span className="ml-3 text-3xl font-bold text-white tracking-tight">Dealer Ledger Pro</span>
                </div>
                <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700/50">
                    <h2 className="text-2xl font-semibold text-white mb-2">Welcome</h2>
                    <p className="text-gray-400 mb-8">Sign in to access your dashboard.</p>
                    
                    {error && (
                        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6 text-sm text-left">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSignIn} className="space-y-6">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-300 text-left">
                                Email address
                            </label>
                            <div className="mt-1">
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-brand-500 focus:border-brand-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password"className="block text-sm font-medium text-gray-300 text-left">
                                Password
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-brand-500 focus:border-brand-500"
                                />
                            </div>
                        </div>
                        
                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-brand-500 disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <Spinner className="h-5 w-5 text-white" />
                                ) : (
                                    'Sign in'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
                <p className="text-xs text-gray-600 mt-8">Securely manage your dealership operations.</p>
            </div>
        </div>
    );
};

export default LoginPage;