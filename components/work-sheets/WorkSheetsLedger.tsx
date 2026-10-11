import React, { useState, useMemo } from 'react';
import { WorkSheet, workSheetRecordType } from '../../types';
import { WrenchScrewdriverIcon } from '../icons';
import { formatCurrency } from '../../utils/helpers';
import Spinner from '../common/Spinner';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { EmptyState, Search, StatusChip } from '../ui';
import JobBook, { JobBookBar, JobBookRow } from './JobBook';

interface WorkSheetsLedgerProps {
  sheets: WorkSheet[];
}

/** Same sum the editor shows: line amounts, plus 20% when VAT was added to chargeable work. */
const sheetTotal = (sheet: WorkSheet): number | null => {
  const priced = (sheet.items || []).filter(i => typeof i.amount === 'number');
  if (priced.length === 0) return null;
  const sum = priced.reduce((s, i) => s + (i.amount || 0), 0);
  return workSheetRecordType(sheet) === 'customer' && sheet.vatApplied ? sum * 1.2 : sum;
};

const WorkSheetsLedger = ({ sheets }: WorkSheetsLedgerProps) => {
  const { openModal } = useUI();
  const { vehicles } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSheets = useMemo(() => {
    if (!searchTerm.trim()) {
        return sheets;
    }
    const lowercasedTerm = searchTerm.toLowerCase();
    return sheets.filter(sheet => {
        const carDetails = sheet.carDetails || vehicles.find(v => v.id === sheet.vehicleId);
        return (
            String(sheet.workSheetNumber || '').toLowerCase().includes(lowercasedTerm) ||
            String(sheet.customerName || '').toLowerCase().includes(lowercasedTerm) ||
            (carDetails && String(carDetails.reg || '').toLowerCase().includes(lowercasedTerm)) ||
            (carDetails && String(carDetails.make || '').toLowerCase().includes(lowercasedTerm)) ||
            (carDetails && String(carDetails.model || '').toLowerCase().includes(lowercasedTerm)) ||
            (carDetails && String(carDetails.stockNumber || '').toLowerCase().includes(lowercasedTerm))
        );
    });
  }, [sheets, searchTerm, vehicles]);

  if (!sheets || !vehicles) return <div className="flex justify-center items-center h-full"><Spinner /></div>;

  const count = filteredSheets.length;

  return (
    <div className="space-y-4">
      <JobBookBar summary={sheets.length > 0 && <><span className="num font-semibold text-ink">{count}</span> work {count === 1 ? 'sheet' : 'sheets'}{searchTerm ? ' found' : ''}</>}>
        <Search value={searchTerm} onChange={setSearchTerm} label="Search work sheets" placeholder="Search reg, car or customer" shortcut="/" />
      </JobBookBar>

      {count === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          {searchTerm ? (
            <EmptyState
              icon={<WrenchScrewdriverIcon />}
              title="No work sheets match"
              description={`Nothing found for “${searchTerm}”. Try a reg, a sheet number or a customer name.`}
              secondaryLabel="Clear search"
              onSecondary={() => setSearchTerm('')}
            />
          ) : (
            <EmptyState
              icon={<WrenchScrewdriverIcon />}
              title="No work sheets yet"
              description="A work sheet lists the work done on a car. Print it as a receipt for the customer or keep it as an internal record."
              actionLabel="Add work sheet"
              onAction={() => openModal('workSheet')}
            />
          )}
        </div>
      ) : (
        <JobBook label="Work sheets" head={{ primary: 'Vehicle', secondary: 'Customer', status: 'Type', amount: 'Total' }}>
          {filteredSheets.map(sheet => {
            const carDetails = sheet.carDetails || vehicles.find(v => v.id === sheet.vehicleId);
            if (!carDetails) return null;
            const internal = workSheetRecordType(sheet) === 'internal';
            const total = sheetTotal(sheet);
            const car = `${carDetails.make || ''} ${carDetails.model || ''}`.trim();
            return (
              <JobBookRow
                key={sheet.id}
                noun="work sheet"
                number={String(sheet.workSheetNumber)}
                date={sheet.workDate}
                reg={carDetails.reg}
                title={car || 'Vehicle'}
                detail={sheet.customerName || (internal ? 'In-house work' : undefined)}
                status={internal ? <StatusChip status="neutral">Internal</StatusChip> : <StatusChip status="stock">Customer</StatusChip>}
                amount={total === null ? <span className="text-ink-3">—</span> : formatCurrency(total)}
                openLabel={`View work sheet ${sheet.workSheetNumber}, ${carDetails.reg || ''} ${car}${sheet.customerName ? `, ${sheet.customerName}` : ''}`}
                onOpen={() => openModal('workSheet', { viewOnly: true, sheet })}
                onEdit={() => openModal('workSheet', { editingSheet: sheet })}
                onDelete={() => openModal('deleteWorkSheetConfirm', sheet)}
              />
            );
          })}
        </JobBook>
      )}
    </div>
  );
};

export default WorkSheetsLedger;
