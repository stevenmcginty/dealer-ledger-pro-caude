import React from 'react';
import { useData } from '../../hooks/useData';
import { useThemeMode } from '../../contexts/ThemeContext';
import { useToast } from '../ui/Toast';
import { CheckIcon } from '../icons';
import type { ThemeMode } from '../../utils/themeMode';
import { Panel, PanelSection } from './SettingsKit';

const MODES: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
];

// Each swatch wears its own theme-<name> class, so bg-brand-500 shows that palette.
const COLOURS = [
    { value: 'blue', name: 'Blue' },
    { value: 'green', name: 'Green' },
    { value: 'red', name: 'Red' },
    { value: 'purple', name: 'Purple' },
    { value: 'pink', name: 'Pink' },
    { value: 'yellow', name: 'Yellow' },
];

// The two themes' own values (styles.css), drawn small so each choice shows
// what it looks like whatever the page is showing now.
const PREVIEW = {
    light: { bg: '#F1F3F5', surface: '#FFFFFF', line: '#D5DCE2', ink: '#0F1B26', ink3: '#53606C', accent: 'bg-brand-700' },
    dark: { bg: '#0B1117', surface: '#131B22', line: '#27333D', ink: '#E8EEF3', ink3: '#909DA9', accent: 'bg-brand-400' },
} as const;

const MiniScreen: React.FC<{ look: 'light' | 'dark'; className?: string }> = ({ look, className = '' }) => {
    const p = PREVIEW[look];
    return (
        <span className={`absolute inset-0 block p-2 ${className}`} style={{ background: p.bg }}>
            <span className="block rounded-[4px] border px-1.5 py-1.5" style={{ background: p.surface, borderColor: p.line }}>
                <span className="block h-1.5 w-3/5 rounded-full" style={{ background: p.ink }} />
                <span className="mt-1 block h-1 w-4/5 rounded-full" style={{ background: p.ink3 }} />
            </span>
            <span className={`mt-1.5 block h-2.5 w-2/5 rounded-[3px] ${p.accent}`} />
        </span>
    );
};

// Native radios (visually hidden) give radiogroup semantics and arrow-key movement;
// the label is the target and shows the focus ring.
const focusRing = 'has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus';

const AppearancePage = () => {
    const { businessDetails, theme, updateTheme } = useData();
    const { mode, setMode } = useThemeMode();
    const toast = useToast();
    const businessName = businessDetails?.name?.trim() || 'your business';

    const chooseColour = async (value: string) => {
        if (value === theme) return;
        try {
            await updateTheme(value);
        } catch (err) {
            console.error('Could not save the colour', err);
            toast.error("Couldn't save the colour. Check your signal and try again.");
        }
    };

    return (
        <Panel ariaLabel="Appearance">
            <PanelSection title="Theme" description="Saved on this device only. System follows your phone or computer.">
                <fieldset>
                    <legend className="sr-only">Theme</legend>
                    <div className="grid grid-cols-3 gap-2 sm:max-w-md sm:gap-3">
                        {MODES.map(option => {
                            const checked = mode === option.value;
                            return (
                                <label
                                    key={option.value}
                                    className={`group cursor-pointer select-none rounded-control border p-1.5 transition-[border-color,box-shadow] duration-quick ease-out ${focusRing} ${
                                        checked ? 'border-accent shadow-[0_0_0_1px_rgb(var(--c-accent))]' : 'border-line hover:border-line-strong'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="appearance-theme-mode"
                                        value={option.value}
                                        checked={checked}
                                        onChange={() => setMode(option.value)}
                                        className="sr-only"
                                    />
                                    <span aria-hidden="true" className="relative block h-14 overflow-hidden rounded-[6px] border border-line">
                                        {option.value === 'system' ? (
                                            <>
                                                <MiniScreen look="light" className="[clip-path:polygon(0_0,100%_0,0_100%)]" />
                                                <MiniScreen look="dark" className="[clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                                            </>
                                        ) : (
                                            <MiniScreen look={option.value} />
                                        )}
                                    </span>
                                    <span className="flex min-h-[36px] items-center justify-between gap-1 px-1 pt-1">
                                        <span className={`text-sm font-semibold ${checked ? 'text-ink' : 'text-ink-2'}`}>{option.label}</span>
                                        <span
                                            aria-hidden="true"
                                            className={`grid h-5 w-5 flex-none place-items-center rounded-full transition-colors duration-quick ease-out ${checked ? 'bg-accent text-on-accent' : 'border-2 border-line-strong'}`}
                                        >
                                            {checked && <CheckIcon className="h-3.5 w-3.5" />}
                                        </span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            </PanelSection>

            <PanelSection title="Colour" description={`Changes the colour for everyone using ${businessName}.`}>
                <fieldset>
                    <legend className="sr-only">Colour</legend>
                    <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3 sm:gap-3">
                        {COLOURS.map(colour => {
                            const checked = theme === colour.value;
                            return (
                                <label
                                    key={colour.value}
                                    className={`flex min-h-12 cursor-pointer select-none items-center gap-3 rounded-control border px-3 transition-[background-color,border-color,box-shadow] duration-quick ease-out ${focusRing} ${
                                        checked ? 'border-accent bg-accent-soft text-accent-soft-ink shadow-[0_0_0_1px_rgb(var(--c-accent))]' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="appearance-brand-colour"
                                        value={colour.value}
                                        checked={checked}
                                        onChange={() => chooseColour(colour.value)}
                                        className="sr-only"
                                    />
                                    <span aria-hidden="true" className={`theme-${colour.value} grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-plate-ink ring-1 ring-inset ring-line`}>
                                        {checked && <CheckIcon className="h-4 w-4" />}
                                    </span>
                                    <span className="text-sm font-semibold">{colour.name}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            </PanelSection>
        </Panel>
    );
};

export default AppearancePage;
