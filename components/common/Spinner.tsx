import React from 'react';

/**
 * A quiet ring with a turning arc, in currentColor. Sized 20px unless a class
 * (h-4 w-4 …) says otherwise; the width/height attributes lose to any class.
 * Prefer a Skeleton for lists; this is for buttons and small waits.
 */
const Spinner = ({ className = '' }: { className?: string }) => (
  <svg
    className={`animate-spin ${className}`}
    width={20}
    height={20}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".22" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export default Spinner;
