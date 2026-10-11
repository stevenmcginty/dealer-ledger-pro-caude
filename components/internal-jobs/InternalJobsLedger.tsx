import React, { useState, useMemo } from 'react';
import { WrenchScrewdriverIcon } from '../icons';
import { formatCurrency } from '../../utils/helpers';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { EmptyState, Search, SkeletonList } from '../ui';
import JobBook, { JobBookBar, JobBookRow } from '../work-sheets/JobBook';

const InternalJobsLedger = () => {
  const { openModal } = useUI();
  const { internalJobs, vehicles, isLoading } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredJobs = useMemo(() => {
    const jobs = internalJobs || [];
    if (!searchTerm.trim()) return jobs;
    const term = searchTerm.toLowerCase();
    return jobs.filter(job => {
      const car = job.carDetails || vehicles.find(v => v.id === job.vehicleId);
      return (
        String(job.jobSheetNumber || '').toLowerCase().includes(term) ||
        (car && String(car.reg || '').toLowerCase().includes(term)) ||
        (car && String(car.make || '').toLowerCase().includes(term)) ||
        (car && String(car.model || '').toLowerCase().includes(term)) ||
        (car && String(car.stockNumber || '').toLowerCase().includes(term)) ||
        job.items?.some(item => String(item.description || '').toLowerCase().includes(term))
      );
    });
  }, [internalJobs, vehicles, searchTerm]);

  const totalCost = useMemo(
    () => filteredJobs.reduce((sum, job) => sum + (job.totalAmount || 0), 0),
    [filteredJobs]
  );

  if (isLoading) return <SkeletonList rows={4} label="Loading job sheets" />;

  const count = filteredJobs.length;

  return (
    <div className="space-y-4">
      <JobBookBar
        summary={count > 0 && (
          <>
            <span className="num font-semibold text-ink">{count}</span> job {count === 1 ? 'sheet' : 'sheets'} ·{' '}
            <span className="num font-semibold text-ink">{formatCurrency(totalCost)}</span> internal cost
          </>
        )}
      >
        <Search value={searchTerm} onChange={setSearchTerm} label="Search job sheets" placeholder="Search reg, car or work done" shortcut="/" />
      </JobBookBar>

      {count === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          {searchTerm ? (
            <EmptyState
              icon={<WrenchScrewdriverIcon />}
              title="No job sheets match"
              description={`Nothing found for “${searchTerm}”. Try a reg, a job number or the work done.`}
              secondaryLabel="Clear search"
              onSecondary={() => setSearchTerm('')}
            />
          ) : (
            <EmptyState
              icon={<WrenchScrewdriverIcon />}
              title="No internal job sheets yet"
              description="Record in-house repair and prep work against a car, so its true cost is on the books."
              actionLabel="Add job sheet"
              onAction={() => openModal('internalJob')}
            />
          )}
        </div>
      ) : (
        <JobBook label="Internal job sheets" head={{ primary: 'Vehicle', secondary: 'Work done', amount: 'Cost' }}>
          {filteredJobs.map(job => {
            const car = job.carDetails || vehicles.find(v => v.id === job.vehicleId);
            const name = `${car?.make || ''} ${car?.model || ''}`.trim();
            const items = job.items || [];
            const work = items.length === 0 ? undefined
              : items.length === 1 ? items[0].description
                : `${items[0].description} +${items.length - 1} more`;
            return (
              <JobBookRow
                key={job.id}
                noun="job sheet"
                number={String(job.jobSheetNumber)}
                date={job.jobDate}
                reg={car?.reg}
                title={name || 'Vehicle'}
                detail={work}
                amount={formatCurrency(job.totalAmount)}
                openLabel={`View job sheet ${job.jobSheetNumber}, ${car?.reg || ''} ${name}, ${formatCurrency(job.totalAmount)}`}
                onOpen={() => openModal('internalJob', { viewOnly: true, job })}
                onEdit={() => openModal('internalJob', { editingJob: job })}
                onDelete={() => openModal('deleteInternalJobConfirm', job)}
              />
            );
          })}
        </JobBook>
      )}
    </div>
  );
};

export default InternalJobsLedger;
