import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Receipt } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import ConfirmDialog from './ConfirmDialog';

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
        <ConfirmDialog
            title={`Mark ${month} as paid?`}
            keepLabel="Keep unpaid"
            confirmLabel={<>Mark <span className="font-mono tabular-nums">{receiptsToPay.length}</span> as paid</>}
            variant="primary"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>
                All <span className="font-mono tabular-nums">{receiptsToPay.length}</span> invoices for {month}, totalling{' '}
                <span className="font-mono font-semibold tabular-nums text-ink">{formatCurrency(totalAmount)}</span>, are marked as paid.
            </p>
            <p>No ledger entry is made. Use this only if you paid them outside your tracked bank accounts.</p>
        </ConfirmDialog>
    );
};

export default MarkMonthPaidConfirmModal;
