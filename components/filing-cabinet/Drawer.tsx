
import React, { useState } from 'react';
import { ChevronDownIcon } from '../icons';
import { formatBytes } from '../../utils/helpers';

interface DrawerProps {
  title: string;
  count: number;
  children: React.ReactNode;
  totalSize?: number;
  isSizeLoading?: boolean;
}

const Drawer: React.FC<DrawerProps> = ({ title, count, children, totalSize, isSizeLoading }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="glass-card rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="flex items-center text-left gap-3"
                        aria-expanded={isOpen}
                    >
                        <h3 className="text-lg font-semibold text-white tracking-tight">{title}</h3>
                        <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded-full bg-white/10 px-2 text-xs font-medium text-gray-200">{count}</span>
                        {(totalSize !== undefined || isSizeLoading) && (
                            <span className="ml-2 hidden sm:inline-flex items-center rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-400">
                                {isSizeLoading ? 'Calculating...' : formatBytes(totalSize ?? 0)}
                            </span>
                        )}
                    </button>
                    <div className="flex items-center gap-2 ml-4">
                        <button onClick={() => setIsOpen(!isOpen)} className="p-1 hover:bg-white/5 rounded-lg transition-colors">
                            <ChevronDownIcon className={`h-6 w-6 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>
            <div className={`transition-all duration-300 ease-in-out grid ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                    <div className="p-4 pt-2">
                        <ul className="space-y-2">
                            {children}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Drawer;
