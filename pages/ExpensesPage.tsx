import React from 'react';
import ExpensesHub from '../components/expenses/ExpensesHub';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import * as dataService from '../services/dataService';
import { FinancialAccount } from '../types';

const ExpensesPage = () => {
    const { companyId, transactions, suppliers, allReceipts } = useData();
    const { openModal } = useUI();
    
    const handleUpload = async (file: File, account: FinancialAccount) => {
        if (!companyId) return;
        openModal('progress');
        await dataService.processStatement(companyId, file, account, allReceipts, transactions, (progress) => {
            openModal('progress', progress);
        });
    }

    return (
        <ExpensesHub 
            allReceipts={allReceipts} 
            transactions={transactions} 
            suppliers={suppliers}
            onUpload={handleUpload}
        />
    );
};

export default ExpensesPage;