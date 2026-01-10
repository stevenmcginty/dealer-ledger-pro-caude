import { useContext } from 'react';
// FIX: Correct the import path for DataContextState. It is exported from `../types`.
import { DataContext } from '../contexts/DataContext';
import type { DataContextState } from '../types';

export const useData = (): DataContextState => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};