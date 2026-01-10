import React from 'react';
import { formatDate } from '../../utils/helpers';
import { CalendarIcon } from '../icons';

interface UkDateInputProps {
  id: string;
  name?: string;
  value: string; // YYYY-MM-DD
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  required?: boolean;
}

const UkDateInput = ({ id, name, value, onChange, className, required }: UkDateInputProps) => {
  const formattedValue = value ? formatDate(value, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  return (
    <div className={`relative ${className || ''}`}>
      <input
        type="text"
        value={formattedValue}
        readOnly
        className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 text-white focus:outline-none focus:ring-brand-500 focus:border-brand-500 cursor-pointer"
        placeholder="DD/MM/YYYY"
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
        <CalendarIcon className="h-5 w-5 text-gray-400" />
      </div>
      <input
        type="date"
        id={id}
        name={name || id}
        value={value || ''}
        onChange={onChange}
        required={required}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        tabIndex={-1} // Prevent tabbing to the hidden input
      />
    </div>
  );
};

export default UkDateInput;
