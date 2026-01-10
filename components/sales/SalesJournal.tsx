import React from 'react';
import { SalesDocument } from '../../types';
import { DocumentTextIcon, EditIcon, UndoIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';

interface SalesJournalProps {
  documents: SalesDocument[];
}

const SalesJournal = ({ documents }: SalesJournalProps) => {
  const { openModal } = useUI();
  const { vehicles } = useData();

  if (!documents || !vehicles) return <div className="flex justify-center items-center h-full"><Spinner /></div>;

  const salesDocumentsOnly = documents.filter(doc => doc.documentType !== 'Purchase Invoice');

  const docTypeColors = {
    'Sales Invoice': 'bg-green-800 text-green-100',
    'Proforma Invoice': 'bg-yellow-800 text-yellow-100',
    'Deposit Slip': 'bg-cyan-800 text-cyan-100',
    'Purchase Invoice': 'bg-gray-700 text-gray-200',
  };

  const EmptyState = () => (
    <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
      <DocumentTextIcon className="h-12 w-12 text-gray-500 mx-auto" />
      <h3 className="mt-4 text-lg font-medium text-white">No Sales Documents Found</h3>
      <p className="mt-1 text-sm text-gray-400">Create your first document from an available vehicle in the stock list.</p>
    </div>
  );

  return (
    <div className="space-y-6">
       {salesDocumentsOnly.length === 0 ? <EmptyState /> : (
            <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
                <ul role="list" className="divide-y divide-gray-700">
                    {salesDocumentsOnly.map((doc) => {
                        const carDetails = doc.carDetails || vehicles.find(v => v.id === doc.vehicleId);
                        return (
                            <li key={doc.id} className="group relative">
                                <button onClick={() => openModal('invoice', { viewOnly: true, document: doc })} className="block w-full text-left hover:bg-gray-700/50 focus:outline-none focus:bg-gray-700/50 transition duration-150 ease-in-out">
                                    <div className="px-4 py-4 sm:px-6">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-brand-400 truncate">Doc #{doc.invoiceNumber}</p>
                                            <div className="ml-2 flex-shrink-0 flex items-center gap-x-2">
                                                <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${docTypeColors[doc.documentType]}`}>{doc.documentType}</p>
                                                <p className="px-2 hidden sm:inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-200">{formatCurrency(doc.subtotal)}</p>
                                            </div>
                                        </div>
                                        <div className="mt-2 sm:flex sm:justify-between">
                                            <div className="sm:flex">
                                                <p className="flex items-center text-sm text-gray-300 font-semibold">{carDetails?.make} {carDetails?.model} - <span className="uppercase ml-2 bg-gray-900 px-2 py-0.5 rounded text-xs">{carDetails?.reg}</span></p>
                                                <p className="mt-2 flex items-center text-sm text-gray-400 sm:mt-0 sm:ml-6">To: {doc.customerName}</p>
                                            </div>
                                            <div className="mt-2 flex items-center text-sm text-gray-400 sm:mt-0">
                                                <p>{formatDate(doc.invoiceDate)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                                 <div className="absolute top-1/2 -translate-y-1/2 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-x-2">
                                    {(doc.documentType === 'Sales Invoice' || doc.documentType === 'Deposit Slip') && (
                                        <button onClick={() => openModal('undoSaleConfirm', doc)} className="p-2 rounded-full text-gray-300 bg-gray-700 hover:bg-red-600 hover:text-white" title="Undo Sale">
                                            <UndoIcon className="h-5 w-5" />
                                        </button>
                                    )}
                                    <button onClick={() => openModal('editInvoice', doc)} className="p-2 rounded-full text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white" title="Edit Document">
                                        <EditIcon className="h-5 w-5" />
                                    </button>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </div>
       )}
    </div>
  );
};

export default SalesJournal;