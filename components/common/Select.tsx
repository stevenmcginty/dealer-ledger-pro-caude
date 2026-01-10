import React from 'react';
import { ChevronUpDownIcon } from '../icons';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

const Select: React.FC<SelectProps> = ({ className, wrapperClassName, children, ...props }) => {
  return (
    <div className={`relative ${wrapperClassName || ''}`}>
      <select
        {...props}
        className={`block w-full appearance-none bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 text-white focus:outline-none focus:ring-brand-500 focus:border-brand-500 ${className || ''}`}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
        <ChevronUpDownIcon className="h-5 w-5" />
      </div>
    </div>
  );
};

export default Select;
