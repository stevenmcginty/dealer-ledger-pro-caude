import React from 'react';
import { cx } from './cx';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  name: string;
  src?: string;
  size?: AvatarSize;
  className?: string;
}

const SIZE: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

// Soft tints from the semantic set, so initials stay readable in both themes
// and no colour is invented for people.
const TINTS = [
  'bg-accent-soft text-accent-soft-ink',
  'bg-info-soft text-info-ink',
  'bg-success-soft text-success-ink',
  'bg-warning-soft text-warning-ink',
  'bg-danger-soft text-danger-ink',
  'bg-surface-3 text-ink',
];

const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
};

const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', className = '' }) => {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cx(SIZE[size], 'flex-none rounded-full object-cover ring-1 ring-line', className)}
      />
    );
  }

  const tint = TINTS[name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % TINTS.length];
  return (
    <div
      className={cx(SIZE[size], tint, 'flex flex-none select-none items-center justify-center rounded-full font-mono font-bold', className)}
      title={name}
      role="img"
      aria-label={name}
    >
      <span aria-hidden="true">{initials(name)}</span>
    </div>
  );
};

export default Avatar;
