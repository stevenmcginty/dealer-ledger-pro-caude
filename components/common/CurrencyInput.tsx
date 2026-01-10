import React from 'react';

interface CurrencyInputProps {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

const CurrencyInput = ({ id, value, onChange, placeholder = "0.00", required = false, className = '' }: CurrencyInputProps) => {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <span className="text-gray-400 sm:text-sm">£</span>
      </div>
      <input
        type="number"
        step="0.01"
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        required={required}
        className={`block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 pl-7 text-white focus:outline-none focus:ring-brand-500 focus:border-brand-500 ${className}`}
        placeholder={placeholder}
      />
    </div>
  );
};

export default CurrencyInput;