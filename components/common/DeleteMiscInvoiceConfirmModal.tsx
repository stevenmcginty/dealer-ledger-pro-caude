import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { MiscInvoice } from '../../types';
import ConfirmDialog from './ConfirmDialog';

const DeleteMiscInvoiceConfirmModal = ({ invoice }: { invoice: MiscInvoice }) => {
    const { deleteMiscInvoice } = useData();
    const { closeModal } = useUI();

    const handleConfirm = () => {
        deleteMiscInvoice(invoice.id);
        closeModal();
    }

    return (
        <ConfirmDialog
            title={<>Delete invoice <span className="font-mono tabular-nums">#{invoice.invoiceNumber}</span>?</>}
            keepLabel="Keep invoice"
            confirmLabel="Delete invoice"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>The invoice goes for good. You can’t undo this.</p>
        </ConfirmDialog>
    );
};

export default DeleteMiscInvoiceConfirmModal;
