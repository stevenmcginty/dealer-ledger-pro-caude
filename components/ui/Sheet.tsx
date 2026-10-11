import React from 'react';
import Modal, { type ModalProps } from '../common/Modal';

export interface SheetProps extends Omit<ModalProps, 'open' | 'onExited'> {
  /** Shown while true. Setting it false plays the exit, then unmounts. */
  open: boolean;
  /** The exit has finished (focus is already back on the opener). */
  onExited?: () => void;
}

/**
 * A bottom sheet on phones (grab handle, max 90dvh, actions pinned) and a
 * centred dialog from 640px. Controlled: pass open, and close it from
 * onClose (Esc, scrim, X, drag-down). Focus is trapped inside while open
 * and goes back to the opener on close. One at a time; push a second step
 * inside the sheet rather than stacking another on top.
 */
const Sheet: React.FC<SheetProps> = ({ open, onExited, ...props }) => {
  // Stay mounted through the exit animation.
  const [mounted, setMounted] = React.useState(open);
  if (open && !mounted) setMounted(true);

  if (!mounted) return null;
  return (
    <Modal
      {...props}
      open={open}
      onExited={() => { setMounted(false); onExited?.(); }}
    />
  );
};

export default Sheet;
