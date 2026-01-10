import React from 'react';
import SalesJournal from '../components/sales/SalesJournal';
import { useData } from '../hooks/useData';

const SalesPage = () => {
    const { salesDocs } = useData();
    return <SalesJournal documents={salesDocs} />;
};

export default SalesPage;
