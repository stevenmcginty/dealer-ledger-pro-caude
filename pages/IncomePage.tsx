import React from 'react';
import IncomePageDisplay from '../components/income/IncomePage';
import { useData } from '../hooks/useData';

const IncomePage = () => {
    const { miscInvoices } = useData();
    return <IncomePageDisplay invoices={miscInvoices} />;
};

export default IncomePage;
