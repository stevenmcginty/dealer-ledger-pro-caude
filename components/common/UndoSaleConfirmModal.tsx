import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { SalesDocument } from '../../types';
import { Plate } from '../ui';
import ConfirmDialog from './ConfirmDialog';

const UndoSaleConfirmModal = ({ document }: { document: SalesDocument }) => {
    const { undoSale } = useData();
    const { closeModal } = useUI();
    const reg = document.carDetails?.reg;

    const handleConfirm = () => {
        undoSale(document);
        closeModal();
    }

    return (
        <ConfirmDialog
            title={reg ? <>Undo the sale of <Plate reg={reg} className="align-middle" />?</> : 'Undo this sale?'}
            keepLabel="Keep sale"
            confirmLabel="Undo sale"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>The invoice is deleted and the car goes back to Available. Any part-exchange on this sale goes too.</p>
        </ConfirmDialog>
    );
};

export default UndoSaleConfirmModal;
