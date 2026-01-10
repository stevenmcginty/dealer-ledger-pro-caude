import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Receipt } from '../../types';
import { ExclamationTriangleIcon } from '../icons';
import { formatCurrency } from '../../utils/helpers';

interface ModalData {
    month: string;
    receiptsToPay: Receipt[];
}

const MarkMonthPaidConfirmModal = ({ data }: { data: ModalData }) => {
    const { markReceiptsAsPaid } = useData();
    const { closeModal } = useUI();
    const { month, receiptsToPay } = data;

    const totalAmount = receiptsToPay.reduce((sum, r) => sum + r.amount, 0);

    const handleConfirm = () => {
        const receiptIds = receiptsToPay.map(r => r.id);
        markReceiptsAsPaid(receiptIds);
        closeModal();
    }

    return (
        <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white">Mark All as Paid?</h3>
            <p className="mt-2 text-sm text-gray-400">
                Are you sure you want to mark all {receiptsToPay.length} invoices for {month} totalling {formatCurrency(totalAmount)} as paid?
                <br /><br />
                This action does not create a ledger entry and should only be used if you have paid these invoices outside of your tracked bank accounts.
            </p>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={closeModal} type="button" className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button onClick={handleConfirm} type="button" className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md">Confirm & Mark Paid</button>
            </div>
        </div>
    );
};

export default MarkMonthPaidConfirmModal;
