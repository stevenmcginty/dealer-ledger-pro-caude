import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import ConfirmDialog from './ConfirmDialog';

const ConfirmClearDataModal = () => {
    const { clearAllCompanyData } = useData();
    const { closeModal } = useUI();

    const handleConfirm = () => {
        clearAllCompanyData();
        closeModal();
        window.location.reload();
    }

    return (
        <ConfirmDialog
            title="Delete all data?"
            keepLabel="Keep my data"
            confirmLabel="Delete all data"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>Everything in this ledger goes for good. You can’t undo this.</p>
        </ConfirmDialog>
    );
};

export default ConfirmClearDataModal;
