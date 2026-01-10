import React from 'react';
import { InternalJob } from '../../types';
import { WrenchScrewdriverIcon, PlusIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';

interface InternalJobsLedgerProps {
  jobs: InternalJob[];
  onAddClick: () => void;
}

const InternalJobsLedger = ({ jobs, onAddClick }: InternalJobsLedgerProps) => {
  if (!jobs) return <div className="flex justify-center items-center h-full"><Spinner /></div>;

  const EmptyState = () => (
    <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
      <WrenchScrewdriverIcon className="h-12 w-12 text-gray-500 mx-auto" />
      <h3 className="mt-4 text-lg font-medium text-white">No Internal Job Sheets</h3>
      <p className="mt-1 text-sm text-gray-400">Create a job sheet to track internal costs for repairs or prep work.</p>
       <div className="mt-6">
          <button onClick={onAddClick} className="inline-flex items-center gap-x-2 rounded-md bg-brand-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue-500">
              <PlusIcon className="-ml-0.5 h-5 w-5" /> Add Job Sheet
          </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-white hidden md:block">Internal Job Sheets</h1>
            <div className="hidden md:block">
                <button onClick={onAddClick} className="inline-flex items-center gap-x-2 rounded-md bg-brand-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-blue-500">
                    <PlusIcon className="-ml-1 mr-1 h-5 w-5" /> Add Job Sheet
                </button>
            </div>
        </div>
       {jobs.length === 0 ? <EmptyState /> : (
            <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
                <ul role="list" className="divide-y divide-gray-700">
                    {jobs.map((job) => (
                        <li key={job.id} className="group relative">
                            <div className="px-4 py-4 sm:px-6">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-brand-blue-400 truncate">Job #{job.jobSheetNumber}</p>
                                    <div className="ml-2 flex-shrink-0">
                                        <p className="px-2 hidden sm:inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-200">{formatCurrency(job.totalAmount)}</p>
                                    </div>
                                </div>
                                <div className="mt-2 sm:flex sm:justify-between">
                                    <div className="sm:flex">
                                        <p className="flex items-center text-sm text-gray-300 font-semibold">{job.carDetails.make} {job.carDetails.model} - <span className="uppercase ml-2 bg-gray-900 px-2 py-0.5 rounded text-xs">{job.carDetails.reg}</span></p>
                                    </div>
                                    <div className="mt-2 flex items-center text-sm text-gray-400 sm:mt-0">
                                        <p>{formatDate(job.jobDate)}</p>
                                    </div>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
       )}
    </div>
  );
};

export default InternalJobsLedger;
