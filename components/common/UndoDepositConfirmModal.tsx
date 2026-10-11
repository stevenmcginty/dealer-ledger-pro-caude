import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { SalesDocument } from '../../types';
import { Plate } from '../ui';
import ConfirmDialog from './ConfirmDialog';

const UndoDepositConfirmModal = ({ document }: { document: SalesDocument }) => {
    const { undoDeposit } = useData();
    const { closeModal } = useUI();
    const reg = document.carDetails?.reg;

    const handleConfirm = () => {
        undoDeposit(document);
        closeModal();
    }

    return (
        <ConfirmDialog
            title={reg ? <>Undo the deposit on <Plate reg={reg} className="align-middle" />?</> : 'Undo this deposit?'}
            keepLabel="Keep deposit"
            confirmLabel="Undo deposit"
            onKeep={closeModal}
            onConfirm={handleConfirm}
        >
            <p>The deposit slip is deleted and the car goes back to Available. Prep jobs added with this deposit go too.</p>
        </ConfirmDialog>
    );
};

export default UndoDepositConfirmModal;
