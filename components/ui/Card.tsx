import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> & {
  Header: React.FC<CardHeaderProps>;
  Body: React.FC<CardBodyProps>;
} = ({ children, className = '', padding = 'md', hover = false, onClick }) => {
  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const hoverStyles = hover
    ? 'cursor-pointer hover:bg-gray-700/50 hover:border-gray-600 transition-colors duration-200'
    : '';

  return (
    <div
      className={`bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl ${paddingStyles[padding]} ${hoverStyles} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
};

const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '', action }) => (
  <div className={`flex items-center justify-between pb-3 border-b border-gray-700/50 mb-4 ${className}`}>
    <h3 className="text-lg font-semibold text-white">{children}</h3>
    {action && <div>{action}</div>}
  </div>
);

const CardBody: React.FC<CardBodyProps> = ({ children, className = '' }) => (
  <div className={className}>{children}</div>
);

Card.Header = CardHeader;
Card.Body = CardBody;

export default Card;
