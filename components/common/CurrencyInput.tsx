import React from 'react';
import { controlFrame, controlInput, cx } from '../ui/cx';
import '../ui/primitives.css';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'type'> {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  /** Classes for the box (margins, width). */
  className?: string;
  /** Red frame; pair with a Field error message. */
  error?: boolean;
}

/**
 * Money in: a mono "£" affix, tabular figures, decimal keypad on phones.
 * Still a number input underneath, so callers keep reading e.target.value.
 */
const CurrencyInput = ({ id, value, onChange, placeholder = '0.00', required = false, className = '', error, disabled, ...rest }: CurrencyInputProps) => {
  return (
    <div className={cx(controlFrame({ error: error || rest['aria-invalid'] === true || rest['aria-invalid'] === 'true', disabled }), className)}>
      <span className="num flex-none select-none pl-3.5 text-base font-semibold text-ink-2" aria-hidden="true">£</span>
      <input
        type="number"
        step="0.01"
        inputMode="decimal"
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        {...rest}
        className={cx(controlInput, 'num fl-no-spin pl-1.5')}
      />
    </div>
  );
};

export default CurrencyInput;
