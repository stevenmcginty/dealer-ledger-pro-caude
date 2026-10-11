import React from 'react';
import { cx } from './cx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Hover and press feedback, for cards that open something. */
  hover?: boolean;
  onClick?: () => void;
  /** Render as another element (section, article, li). */
  as?: 'div' | 'section' | 'article' | 'li';
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  /** Small grey line under the title. */
  subtitle?: React.ReactNode;
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

const PADDING = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5 sm:p-6' };

/** Flat surface on a hairline. Shadows are kept for things that float. */
const Card: React.FC<CardProps> & {
  Header: React.FC<CardHeaderProps>;
  Body: React.FC<CardBodyProps>;
} = ({ children, className = '', padding = 'md', hover = false, onClick, as: Tag = 'div' }) => {
  const interactive = hover || !!onClick;
  return (
    <Tag
      className={cx(
        'rounded-card border border-line bg-surface text-ink',
        PADDING[padding],
        interactive && 'cursor-pointer transition-[background-color,border-color,transform] duration-quick ease-out hover:border-line-strong hover:bg-surface-2/60 active:scale-[.995] active:bg-surface-2',
        className,
      )}
      onClick={onClick}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); }
      } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </Tag>
  );
};

const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '', action, subtitle }) => (
  <div className={cx('mb-4 flex items-start justify-between gap-3 border-b border-line pb-3', className)}>
    <div className="min-w-0">
      <h3 className="text-lg font-bold leading-[1.625rem] tracking-[-0.01em] text-ink">{children}</h3>
      {subtitle && <p className="mt-0.5 text-sm leading-5 text-ink-3">{subtitle}</p>}
    </div>
    {action && <div className="flex flex-none items-center gap-2">{action}</div>}
  </div>
);

const CardBody: React.FC<CardBodyProps> = ({ children, className = '' }) => (
  <div className={className}>{children}</div>
);

Card.Header = CardHeader;
Card.Body = CardBody;

export { CardHeader, CardBody };
export default Card;
