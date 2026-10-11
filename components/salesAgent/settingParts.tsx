/**
 * Form pieces shared by the sales-agent settings and its cards: the app's
 * Switch with the yes/no shape these pages already use, a labelled textarea
 * and a native select on the shared control frame.
 */

import React from 'react';
import { ChevronDownIcon } from '../icons';
import { Field, Switch } from '../ui';
import { controlFrame, controlInput } from '../ui/cx';

/** A labelled on/off switch. The agent's settings are mostly yes-or-no answers. */
export const SettingSwitch: React.FC<{
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    hint?: string;
    disabled?: boolean;
}> = ({ checked, onChange, label, hint, disabled }) => (
    <Switch
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        label={label}
        description={hint}
        disabled={disabled}
    />
);

export const SettingTextArea: React.FC<{
    label: string;
    value: string;
    rows?: number;
    hint?: string;
    placeholder?: string;
    onChange: (next: string) => void;
}> = ({ label, value, rows = 4, hint, placeholder, onChange }) => (
    <Field label={label} hint={hint}>
        {({ id, describedBy }) => (
            <div className={`${controlFrame()} items-stretch`}>
                <textarea
                    id={id}
                    aria-describedby={describedBy}
                    rows={rows}
                    value={value}
                    placeholder={placeholder}
                    onChange={e => onChange(e.target.value)}
                    className={`${controlInput} resize-y leading-[1.45]`}
                />
            </div>
        )}
    </Field>
);

export const SettingSelect: React.FC<{
    label: string;
    value: string;
    onChange: (next: string) => void;
    hint?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}> = ({ label, value, onChange, hint, className, children }) => (
    <Field label={label} hint={hint} className={className}>
        {({ id, describedBy }) => (
            <div className={controlFrame()}>
                <select
                    id={id}
                    aria-describedby={describedBy}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className={`${controlInput} cursor-pointer pe-10`}
                >
                    {children}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute end-3 h-5 w-5 text-ink-2" />
            </div>
        )}
    </Field>
);
