import React, { useEffect, useRef, useState } from 'react';
import CalendarPopover from './CalendarPopover';
import { formatUkDate, parseUkDate } from '../../utils/ukDate';

interface UkDateInputProps {
  id: string;
  name?: string;
  value: string; // YYYY-MM-DD
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  required?: boolean;
}

// A bolder calendar glyph than the shared CalendarIcon: binder rings, a header band and
// solid date dots, so it still reads as "calendar" at 20px on a low-contrast screen.
const CalendarGlyph = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.75h17M8 3v4M16 3v4" />
    <g fill="currentColor" stroke="none">
      <rect x="6.6" y="12.2" width="2.4" height="2.4" rx="0.6" />
      <rect x="10.8" y="12.2" width="2.4" height="2.4" rx="0.6" />
      <rect x="15" y="12.2" width="2.4" height="2.4" rx="0.6" />
      <rect x="6.6" y="16" width="2.4" height="2.4" rx="0.6" />
      <rect x="10.8" y="16" width="2.4" height="2.4" rx="0.6" />
    </g>
  </svg>
);

const INVALID_MESSAGE = 'Enter a real date as DD/MM/YYYY, e.g. 30/09/2026';

// The app's one date field. Type a UK date (30/09/2026, 30-9-26, 30092026 …) and it commits on
// Enter or blur, or press the calendar button for a dark Monday-first picker. The value handed to
// onChange is always 'YYYY-MM-DD' or '' — callers read e.target.name/value/id/type as before.
const UkDateInput = ({ id, name, value, onChange, className, required }: UkDateInputProps) => {
  const [draft, setDraft] = useState(() => formatUkDate(value));
  const [dirty, setDirty] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Follow the parent's value (e.g. a reset or a date filled by a receipt scan).
  useEffect(() => {
    setDraft(formatUkDate(value));
    setDirty(false);
    setInvalid(false);
  }, [value]);

  // A bad typed date blocks native form submission instead of being silently dropped.
  useEffect(() => {
    inputRef.current?.setCustomValidity(invalid ? INVALID_MESSAGE : '');
  }, [invalid]);

  const emit = (iso: string) => {
    if (iso === (value || '')) return;
    const target = { id, name: name || id, value: iso, type: 'text' } as unknown as EventTarget & HTMLInputElement;
    const event = {
      target,
      currentTarget: target,
      type: 'change',
      bubbles: true,
      cancelable: false,
      defaultPrevented: false,
      isDefaultPrevented: () => false,
      isPropagationStopped: () => false,
      preventDefault: () => {},
      stopPropagation: () => {},
      persist: () => {},
      timeStamp: Date.now(),
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    onChange(event);
  };

  /** Commit the typed text. Returns false (and flags the field) when it is not a real date. */
  const commitDraft = (): boolean => {
    if (!dirty) return true;
    const iso = parseUkDate(draft);
    if (iso === null) { setInvalid(true); return false; }
    setDraft(formatUkDate(iso));
    setDirty(false);
    setInvalid(false);
    emit(iso);
    return true;
  };

  const pick = (iso: string) => {
    setDraft(formatUkDate(iso));
    setDirty(false);
    setInvalid(false);
    setOpen(false);
    emit(iso);
    inputRef.current?.focus();
  };

  const closeCalendar = (reason: 'escape' | 'outside' | 'tab') => {
    setOpen(false);
    if (reason === 'escape') buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Commit here rather than submit the form with a stale value.
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'ArrowDown' && (e.altKey || !open)) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  const typedIso = parseUkDate(draft) || '';
  const errorId = `${id}-error`;

  return (
    <div ref={wrapperRef} className={`relative ${className || ''}`}>
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name || id}
        value={draft}
        required={required}
        autoComplete="off"
        spellCheck={false}
        placeholder="DD/MM/YYYY"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        title={invalid ? INVALID_MESSAGE : undefined}
        onChange={e => { setDraft(e.target.value); setDirty(true); if (invalid) setInvalid(false); }}
        onBlur={commitDraft}
        onKeyDown={onKeyDown}
        className={`block w-full min-w-0 rounded-md bg-gray-700 border-gray-600 py-2 pl-2.5 pr-10 text-white placeholder-gray-500 shadow-sm focus:outline-none focus:ring-2 ${
          invalid ? 'ring-2 ring-red-500/80 focus:ring-red-500' : 'focus:ring-brand-500'
        }`}
      />
      {invalid && <span id={errorId} className="sr-only">{INVALID_MESSAGE}</span>}
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? 'Close calendar' : 'Open calendar'}
        title="Open calendar"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-calendar` : undefined}
        onClick={() => setOpen(o => !o)}
        className={`absolute inset-y-1 right-1 flex w-8 cursor-pointer items-center justify-center rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
          open
            ? 'bg-brand-600 text-white'
            : 'bg-brand-500/20 text-brand-300 ring-1 ring-inset ring-brand-400/40 hover:bg-brand-500/35 hover:text-white'
        }`}
      >
        <CalendarGlyph className="h-5 w-5" />
      </button>
      {open && (
        <CalendarPopover
          id={id}
          anchorRef={wrapperRef}
          selected={value || ''}
          initialFocus={typedIso}
          allowClear={!required}
          onPick={pick}
          onClose={closeCalendar}
        />
      )}
    </div>
  );
};

export default UkDateInput;
