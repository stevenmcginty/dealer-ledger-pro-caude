import React from 'react';
import { StockLedger } from '../components/stock/StockLedger';
import { useData } from '../hooks/useData';

const StockPage = () => {
    const { vehicles, salesDocs } = useData();
    return <StockLedger vehicles={vehicles} salesDocs={salesDocs} />;
};

export default StockPage;