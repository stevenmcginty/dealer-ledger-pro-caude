import React from 'react';
import WorkSheetsLedger from '../components/work-sheets/WorkSheetsLedger';
import { useData } from '../hooks/useData';

const WorkSheetsPage = () => {
    const { workSheets } = useData();
    return <WorkSheetsLedger sheets={workSheets} />;
};

export default WorkSheetsPage;