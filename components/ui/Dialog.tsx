import React from 'react';
import Button from './Button';
import Sheet from './Sheet';

export interface DialogProps {
  open: boolean;
  /** Cancel: Esc, scrim, the cancel button. */
  onClose: () => void;
  /** The exact question, naming the thing: "Delete #500 Ford Fiesta?" */
  title: React.ReactNode;
  /** The consequence, in a sentence or two. */
  children?: React.ReactNode;
  /** Repeats the verb: "Delete car". */
  confirmLabel: string;
  /** Says what stays: "Keep car". */
  cancelLabel?: string;
  onConfirm: () => void;
  /** danger = red confirm button and an alertdialog. */
  tone?: 'danger' | 'default';
  /** The confirm is working: keeps its label, adds a spinner, Esc and scrim are off. */
  loading?: boolean;
  onExited?: () => void;
}

/**
 * Asks before something you can't undo. Phone: a bottom sheet; 640px and
 * up: a small centred dialog. Focus starts on the safe choice (cancel), Tab
 * stays inside, Esc cancels, and focus returns to the opener afterwards.
 * For things you can undo, act and offer Undo in a toast instead.
 */
const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  tone = 'default',
  loading = false,
  onExited,
}) => {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onExited={onExited}
      size="sm"
      role={tone === 'danger' ? 'alertdialog' : 'dialog'}
      dismissible={!loading}
      initialFocusRef={cancelRef}
    >
      <div className="px-5 pb-5 pt-2 sm:pt-5">
        <h2 data-modal-title="" className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">{title}</h2>
        {children && <div className="mt-2 text-base leading-6 text-ink-2">{children}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={loading} block className="sm:w-auto">
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} block className="sm:w-auto">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};

export default Dialog;
