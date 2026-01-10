import React from 'react';
import { SparklesIcon } from '../icons';

interface GeminiFABProps {
    onClick: () => void;
}

const GeminiFAB = ({ onClick }: GeminiFABProps) => {
    return (
        <button
            onClick={onClick}
            className="fixed bottom-28 right-6 md:bottom-8 md:right-8 z-[60] h-16 w-16 rounded-full bg-gradient-to-br from-purple-600 to-brand-600 text-white shadow-2xl flex items-center justify-center transform transition-all duration-300 hover:scale-110 hover:shadow-purple-500/50 focus:outline-none focus:ring-4 focus:ring-purple-500/50"
            aria-label="Ask Gemini"
        >
            <SparklesIcon className="h-8 w-8" />
        </button>
    );
};

export default GeminiFAB;