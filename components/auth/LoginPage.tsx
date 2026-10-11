import React, { useState } from 'react';
import { signInWithEmail } from '../../services/firebase';
import { NavCarIcon } from '../icons';
import { Alert, Button, Input } from '../ui';

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
                setError("That email or password is wrong. Check them and try again.");
            } else {
                // Display the specific Firebase error to the user for better debugging.
                setError(`Couldn’t sign in: ${error.message}`);
            }
            setIsLoading(false);
            setPassword(''); // Clear password on failed attempt
        }
    };

    return (
        <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg px-4 py-10 text-ink">
            <div className="w-full max-w-sm">
                <div className="mb-8 flex items-center justify-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-card bg-accent text-on-accent" aria-hidden="true">
                        <NavCarIcon className="h-7 w-7" />
                    </span>
                    <span className="text-2xl font-bold tracking-[-0.01em] text-ink">Dealer Ledger Pro</span>
                </div>

                <div className="rounded-card border border-line bg-surface p-5 sm:p-6">
                    <h1 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">Sign in</h1>
                    <p className="mt-1 text-base leading-6 text-ink-2">Use the email and password for your ledger.</p>

                    {error && (
                        <Alert tone="danger" className="mt-5">{error}</Alert>
                    )}

                    <form onSubmit={handleSignIn} className="mt-6 space-y-5">
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            label="Email address"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />

                        <Input
                            id="password"
                            name="password"
                            type="password"
                            label="Password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />

                        <Button type="submit" variant="primary" block loading={isLoading}>
                            Sign in
                        </Button>
                    </form>
                </div>
                <p className="mt-8 text-center text-sm text-ink-3">Stock, sales, costs and VAT for your dealership.</p>
            </div>
        </main>
    );
};

export default LoginPage;
