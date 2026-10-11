/*
 * Dev-only component gallery: every shared primitive in every state, with a
 * light/dark toggle and the six brand colours. Served by `vite` at
 * /ui-gallery.html; the production build only bundles index.html, so none
 * of this ships. All names, plates and money below are made up.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import './gallery.css';
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, Checkbox, Chip, Combobox, DataTable, Dialog, DocChip, EmptyState,
  FilterChips, IconButton, Input, KeyValues, List, ListRow, Pager, Plate, PlateInput, Radio, Search, Segmented, Sheet,
  ShowMore, Skeleton, SkeletonList, StatusChip, Stepper, Switch, TBody, THead, Tabs, Td, Th, Toast, ToastProvider, Tr,
  useToast, type ComboboxOption, type SortDir,
} from '../components/ui';
import { eyebrow } from '../components/ui/cx';
import Field from '../components/ui/Field';
import Select from '../components/common/Select';
import CurrencyInput from '../components/common/CurrencyInput';
import UkDateInput from '../components/common/UkDateInput';
import Calendar from '../components/common/Calendar';
import Spinner from '../components/common/Spinner';
import * as Icons from '../components/icons';

/* ------------------------------------------------------------------ */
/* Theme + brand controls                                              */
/* ------------------------------------------------------------------ */

type Mode = 'light' | 'dark';
const BRANDS = ['blue', 'green', 'red', 'purple', 'pink', 'yellow'] as const;
type Brand = typeof BRANDS[number];
/** Swatch colours for the picker only (brand-600 of each palette in styles.css). */
const SWATCH: Record<Brand, string> = {
  blue: 'rgb(2 132 199)', green: 'rgb(22 163 74)', red: 'rgb(220 38 38)',
  purple: 'rgb(124 58 237)', pink: 'rgb(219 39 119)', yellow: 'rgb(202 138 4)',
};

const readMode = (): Mode => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
const readBrand = (): Brand => BRANDS.find(b => document.documentElement.classList.contains(`theme-${b}`)) ?? 'blue';

const setParam = (key: string, value: string) => {
  const url = new URL(location.href);
  url.searchParams.set(key, value);
  history.replaceState(null, '', url);
};

const BrandPicker: React.FC<{ value: Brand; onChange: (b: Brand) => void }> = ({ value, onChange }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = BRANDS.indexOf(value);
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = BRANDS[(i + step + BRANDS.length) % BRANDS.length];
    onChange(next);
    ref.current?.querySelector<HTMLElement>(`[data-brand="${next}"]`)?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label="Brand colour" onKeyDown={onKeyDown} className="flex items-center">
      {BRANDS.map(b => {
        const on = b === value;
        return (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={b[0].toUpperCase() + b.slice(1)}
            title={b[0].toUpperCase() + b.slice(1)}
            data-brand={b}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(b)}
            className="group grid h-12 w-12 place-items-center rounded-full"
          >
            <span
              className={`grid h-7 w-7 place-items-center rounded-full transition-[box-shadow,transform] duration-quick ease-out group-active:scale-90 ${on ? 'shadow-[0_0_0_2px_rgb(var(--c-surface)),0_0_0_4px_rgb(var(--c-ink))]' : 'group-hover:scale-110'}`}
              style={{ background: SWATCH[b] }}
            >
              {on && <Icons.CheckIcon className="h-4 w-4 text-white [stroke-width:2.5]" />}
            </span>
          </button>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Layout pieces: a section, a labelled row, a captioned specimen      */
/* ------------------------------------------------------------------ */

const SECTIONS = [
  ['buttons', 'Buttons'], ['fields', 'Text fields'], ['select', 'Select & combobox'], ['choice', 'Checkbox, radio, switch'],
  ['chips', 'Chips, plates, tags'], ['nav', 'Tabs, steps, pages'], ['lists', 'Lists & cards'], ['table', 'Data table'],
  ['feedback', 'Alerts & toasts'], ['overlays', 'Sheet & dialog'], ['empty', 'Empty & loading'], ['search', 'Search & calendar'],
  ['icons', 'Icons'],
] as const;

const Section: React.FC<{ id: string; title: string; path: string; note?: React.ReactNode; children: React.ReactNode }> = ({ id, title, path, note, children }) => {
  const no = String(SECTIONS.findIndex(s => s[0] === id) + 1).padStart(2, '0');
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-line-strong pb-12 pt-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="num text-sm font-semibold text-ink-3" aria-hidden="true">{no}</span>
        <h2 id={`${id}-h`} className="text-[1.75rem] font-bold leading-[2.125rem] tracking-[-0.02em]">{title}</h2>
        <code className="font-mono text-xs text-ink-3 md:ms-auto">{path}</code>
      </div>
      {note && <p className="mt-2 max-w-[68ch] text-sm leading-5 text-ink-2">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
};

/** One labelled row of specimens, ruled like a ledger line. */
const Row: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 border-t border-line py-4 first:border-t-0 first:pt-0 md:grid-cols-[168px_minmax(0,1fr)] md:gap-6">
    <p className={`${eyebrow} md:pt-3`}>{label}</p>
    <div className={className ?? 'flex min-w-0 flex-wrap items-center gap-3'}>{children}</div>
  </div>
);

/** A specimen with its state written under it. */
const Sp: React.FC<{ c: string; children: React.ReactNode; className?: string }> = ({ c, children, className }) => (
  <div className={`flex flex-col items-start gap-1.5 ${className ?? ''}`}>
    {children}
    <span className="font-mono text-xs text-ink-3">{c}</span>
  </div>
);

/** Forced looks for review; the live control next to them does the real thing. */
const FORCED_FOCUS = 'outline outline-[3px] outline-offset-2 outline-focus';

/* ------------------------------------------------------------------ */
/* Demo data (invented)                                                */
/* ------------------------------------------------------------------ */

const SUPPLIERS: ComboboxOption[] = [
  { value: 'halden', label: 'Halden Motor Factors', hint: 'Parts' },
  { value: 'halfords', label: 'Halfords Watford' },
  { value: 'ecp', label: 'Euro Car Parts', hint: 'Parts' },
  { value: 'gsf', label: 'GSF Car Parts', hint: 'Parts' },
  { value: 'shell', label: 'Shell Watford', hint: 'Fuel' },
  { value: 'northgate', label: 'Northgate Auctions', hint: 'Cars' },
  { value: 'valet', label: 'Shine On Valeting', hint: 'Prep' },
  { value: 'tyres', label: 'Radlett Tyre Centre', hint: 'Prep' },
];
const CARS: ComboboxOption[] = [
  { value: '500', label: '#500 Ford Fiesta · LK68 TVN' },
  { value: '501', label: '#501 Toyota Yaris · YD20 KMF' },
  { value: '502', label: '#502 Kia Ceed · GN16 XWT' },
  { value: 'none', label: 'No car (general cost)' },
];

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

const Buttons: React.FC = () => {
  const [busy, setBusy] = React.useState(false);
  const run = () => { setBusy(true); window.setTimeout(() => setBusy(false), 1600); };
  return (
    <Section id="buttons" title="Buttons" path="ui/Button.tsx · ui/IconButton.tsx" note="One primary per screen, at the bottom on phones. Label with a verb and a thing. Small is 44px on phones, 36px only with a mouse.">
      <Row label="Primary · states">
        <Sp c="default"><Button>Save car</Button></Sp>
        <Sp c="hover"><Button className="!bg-accent-hover">Save car</Button></Sp>
        <Sp c="pressed"><Button className="!bg-accent-press">Save car</Button></Sp>
        <Sp c="focus-visible"><Button className={FORCED_FOCUS}>Save car</Button></Sp>
        <Sp c="disabled"><Button disabled>Save car</Button></Sp>
        <Sp c="loading"><Button loading>Saving…</Button></Sp>
      </Row>
      <Row label="Variants">
        <Button>Save car</Button>
        <Button variant="secondary">Keep car</Button>
        <Button variant="ghost">Add a note</Button>
        <Button variant="danger">Delete car</Button>
        <Button variant="success">Mark paid</Button>
      </Row>
      <Row label="Disabled">
        <Button variant="secondary" disabled>Keep car</Button>
        <Button variant="ghost" disabled>Add a note</Button>
        <Button variant="danger" disabled>Delete car</Button>
      </Row>
      <Row label="Sizes · icons">
        <Sp c="sm · 44 / 36"><Button size="sm" variant="secondary">Undo</Button></Sp>
        <Sp c="md · 48"><Button icon={<Icons.PlusIcon />}>Add car</Button></Sp>
        <Sp c="lg · 56"><Button size="lg" iconEnd={<Icons.ChevronRightIcon />}>Sell this car</Button></Sp>
        <Sp c="try it"><Button variant="secondary" loading={busy} onClick={run}>{busy ? 'Sending…' : 'Send invoice'}</Button></Sp>
      </Row>
      <Row label="Block" className="max-w-md">
        <Button block>Save expense</Button>
      </Row>
      <Row label="Icon buttons">
        <Sp c="ghost"><IconButton label="Search" icon={<Icons.MagnifyingGlassIcon />} /></Sp>
        <Sp c="outlined"><IconButton label="Edit" variant="outlined" icon={<Icons.EditIcon />} /></Sp>
        <Sp c="accent"><IconButton label="Add" variant="accent" icon={<Icons.PlusIcon />} /></Sp>
        <Sp c="badge"><IconButton label="Alerts" icon={<Icons.BellIcon />} badge={3} /></Sp>
        <Sp c="99+"><IconButton label="Inbox" icon={<Icons.InboxIcon />} badge={124} /></Sp>
        <Sp c="sm · 48 / 40"><IconButton label="More" size="sm" icon={<Icons.EllipsisVerticalIcon />} /></Sp>
        <Sp c="disabled"><IconButton label="Delete" icon={<Icons.TrashIcon />} disabled /></Sp>
      </Row>
    </Section>
  );
};

const Fields: React.FC = () => {
  const [name, setName] = React.useState('Leila Ahmed');
  const [price, setPrice] = React.useState('8495.00');
  const [date, setDate] = React.useState('2026-10-08');
  const [reg, setReg] = React.useState('LK68 TVN');
  return (
    <Section id="fields" title="Text fields" path="ui/Field · ui/Input · CurrencyInput · UkDateInput · PlateInput" note="Label above, always visible; hint under; the error replaces the hint and has an icon. Inputs are 16px so phones never zoom.">
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <Input label="Buyer name" hint="As on their driving licence." value={name} onChange={e => setName(e.target.value)} />
        <Field label="Sale price" htmlFor="g-price" hint="Format to pence on save.">
          <CurrencyInput id="g-price" value={price} onChange={e => setPrice(e.target.value)} />
        </Field>
        <Field label="Date of sale" htmlFor="g-date" hint="Type DD/MM/YYYY or pick from the calendar.">
          <UkDateInput id="g-date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Input label="Date of collection" defaultValue="31/09/2026" error="September has 30 days. Check the date." />
        <Input label="Stock number" value="#503" disabled hint="Given automatically." onChange={() => {}} className="num" />
        <Input label="Mileage" optional inputMode="numeric" defaultValue="42,180" trailing={<span className="text-sm font-semibold">mi</span>} className="num" />
        <Input label="Deposit" affix="£" inputMode="decimal" placeholder="0.00" className="num" />
        <Input label="Email" icon={<Icons.EnvelopeIcon />} type="email" placeholder="name@example.com" />
        <Field label="Registration" htmlFor="g-reg" hint="We fill make, model, colour, MOT and tax from DVLA." className="md:col-span-2 md:max-w-md">
          <PlateInput id="g-reg" value={reg} onChange={e => setReg(e.target.value)} action={<Button size="sm" variant="secondary">Look up</Button>} />
        </Field>
      </div>
    </Section>
  );
};

const Selects: React.FC = () => {
  const toast = useToast();
  const [suppliers, setSuppliers] = React.useState(SUPPLIERS);
  const [supplier, setSupplier] = React.useState('halfords');
  const [car, setCar] = React.useState('');
  return (
    <Section id="select" title="Select & combobox" path="common/Select · ui/Combobox" note="Native select for under 8 fixed options. Combobox for long or growing lists, with “Add new” last. On a phone the combobox opens a full-height sheet with its own search.">
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <Field label="VAT scheme" htmlFor="g-vat">
          <Select id="g-vat" defaultValue="margin">
            <option value="margin">Margin scheme</option>
            <option value="standard">Standard 20%</option>
            <option value="zero">Zero rated</option>
          </Select>
        </Field>
        <Field label="Category" htmlFor="g-cat" error="Choose a category.">
          <Select id="g-cat" defaultValue="">
            <option value="" disabled>Choose…</option>
            <option>Fuel</option>
            <option>Parts</option>
          </Select>
        </Field>
        <Combobox
          label="Supplier"
          noun="supplier"
          options={suppliers}
          value={supplier}
          onChange={v => setSupplier(v)}
          onCreate={q => {
            const value = `new-${q.toLowerCase().replace(/\W+/g, '-')}`;
            setSuppliers(s => [...s, { value, label: q }]);
            setSupplier(value);
            toast.success(`Added ${q} as a supplier`);
          }}
          hint="Type to search. Try “hal”, then a name that isn’t there."
        />
        <Combobox label="Car" noun="car" options={CARS} value={car} onChange={v => setCar(v)} error={car ? undefined : 'Choose a car from your stock, or pick “No car” for a general cost.'} />
        <Field label="Payment method" htmlFor="g-pay" hint="Locked once the sale is invoiced.">
          <Select id="g-pay" disabled defaultValue="bank"><option value="bank">Bank transfer</option></Select>
        </Field>
        <Combobox label="Prep supplier" noun="supplier" options={SUPPLIERS} value="valet" onChange={() => {}} disabled hint="Locked: prep is signed off." />
      </div>
    </Section>
  );
};

const Choices: React.FC = () => {
  const [paid, setPaid] = React.useState(true);
  const [paid2, setPaid2] = React.useState(false);
  const [rows, setRows] = React.useState([true, false, true]);
  const [method, setMethod] = React.useState('cash');
  const [terms, setTerms] = React.useState(true);
  const [warranty, setWarranty] = React.useState(false);
  const all = rows.every(Boolean);
  const some = rows.some(Boolean) && !all;
  return (
    <Section id="choice" title="Checkbox, radio, switch" path="ui/Choice.tsx" note="Switch takes effect now; checkbox is part of a form you save. The whole label row is the hit area. A bare control still gets a 48px target. Tab to see the focus ring.">
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-3">
        <div>
          <p className={`${eyebrow} mb-1`}>Checkbox</p>
          <Checkbox label="Paid" checked={paid} onChange={e => setPaid(e.target.checked)} />
          <Checkbox label="Paid" description="Unchecked" checked={paid2} onChange={e => setPaid2(e.target.checked)} />
          <Checkbox label="I agree to the terms" error />
          <Checkbox label="Locked" checked disabled onChange={() => {}} />
          <Checkbox
            label="Select all lines"
            description={`${rows.filter(Boolean).length} of 3 selected`}
            checked={all}
            indeterminate={some}
            onChange={e => setRows(rows.map(() => e.target.checked))}
          />
          <div className="mt-1 flex items-center gap-[26px] ps-3.5">
            {rows.map((on, i) => (
              <Checkbox key={i} aria-label={`Select line ${i + 1}`} checked={on} onChange={e => setRows(rows.map((r, j) => (j === i ? e.target.checked : r)))} />
            ))}
            <span className="ms-3 font-mono text-xs text-ink-3">bare · 48px target</span>
          </div>
        </div>
        <div role="radiogroup" aria-labelledby="g-radio-h">
          <p id="g-radio-h" className={`${eyebrow} mb-1`}>Radio</p>
          {[['cash', 'Cash'], ['card', 'Card'], ['bank', 'Bank transfer']].map(([v, l]) => (
            <Radio key={v} name="g-method" value={v} label={l} checked={method === v} onChange={() => setMethod(v)} />
          ))}
          <Radio name="g-method-x" label="Finance" description="Not set up for this ledger" disabled />
        </div>
        <div>
          <p className={`${eyebrow} mb-1`}>Switch</p>
          <Switch label="Terms page" description="Adds your sales terms to invoices" checked={terms} onChange={e => setTerms(e.target.checked)} />
          <Switch label="Warranty" checked={warranty} onChange={e => setWarranty(e.target.checked)} />
          <Switch label="MTD export" description="Needs an accountant login" disabled />
          <Switch label="Hide sold cars" checked disabled onChange={() => {}} />
        </div>
      </div>
    </Section>
  );
};

const Chips: React.FC<{ onFilters: () => void }> = ({ onFilters }) => {
  const [cut, setCut] = React.useState('all');
  return (
    <Section id="chips" title="Chips, plates, tags" path="ui/Chip · ui/StatusChip · ui/DocChip · ui/Plate · ui/Badge · ui/Avatar" note="Status is shape + word + colour, never colour alone. Plates are yellow in lists, white when showing the front, and never mirror.">
      <Row label="Filter chips">
        <FilterChips
          ariaLabel="Filter stock"
          value={cut}
          onChange={setCut}
          options={[{ value: 'all', label: 'All', count: 18 }, { value: 'sale', label: 'For sale', count: 11 }, { value: 'prep', label: 'In prep', count: 4 }, { value: 'res', label: 'Reserved', count: 2 }]}
          trailing={<Chip icon={<Icons.FunnelIcon />} count={2} onClick={onFilters}>Filters</Chip>}
        />
      </Row>
      <Row label="Chip · states">
        <Sp c="default"><Chip>Diesel</Chip></Sp>
        <Sp c="hover"><Chip className="!bg-surface-2">Diesel</Chip></Sp>
        <Sp c="focus-visible"><Chip className={FORCED_FOCUS}>Diesel</Chip></Sp>
        <Sp c="on"><Chip selected>Diesel</Chip></Sp>
        <Sp c="disabled"><Chip disabled>Electric</Chip></Sp>
      </Row>
      <Row label="Status">
        <StatusChip status="stock">For sale</StatusChip>
        <StatusChip status="prep">In prep</StatusChip>
        <StatusChip status="reserved">Reserved</StatusChip>
        <StatusChip status="sold">Sold</StatusChip>
        <StatusChip status="due">MOT due</StatusChip>
        <StatusChip status="dave">Draft ready</StatusChip>
        <StatusChip status="sold" size="lg">Paid</StatusChip>
      </Row>
      <Row label="Documents">
        <DocChip kind="SI" />
        <DocChip kind="PF" />
        <DocChip kind="DS" />
        <DocChip kind="PI" />
        <DocChip kind="SI" label="1043" />
        <DocChip kind="PI" label={null} />
      </Row>
      <Row label="Plates">
        <Plate reg="LK68TVN" size="sm" />
        <Plate reg="LK68 TVN" />
        <Plate reg="yd20kmf" front />
        <Plate reg="LK68 TVN" size="lg" />
        <span className="num text-sm font-semibold text-ink-3">#500</span>
      </Row>
      <Row label="Badges">
        <Badge>Draft</Badge>
        <Badge variant="primary">New</Badge>
        <Badge variant="success" dot>Paid</Badge>
        <Badge variant="warning" dot>Due Fri</Badge>
        <Badge variant="danger" dot>Overdue</Badge>
        <Badge variant="info" size="lg">Q3 2026</Badge>
      </Row>
      <Row label="Avatars">
        <Avatar name="Leila Ahmed" size="sm" />
        <Avatar name="Tom Ashworth" />
        <Avatar name="Priya Nair" size="lg" />
        <Avatar name="Dave" size="xl" />
      </Row>
    </Section>
  );
};

const Nav: React.FC = () => {
  const [tab, setTab] = React.useState('receipts');
  const [pill, setPill] = React.useState('month');
  const [density, setDensity] = React.useState<'comfortable' | 'compact'>('comfortable');
  const [period, setPeriod] = React.useState<'m' | 'q' | 'y'>('q');
  const [step, setStep] = React.useState(1);
  const [page, setPage] = React.useState(4);
  const [shown, setShown] = React.useState(20);
  return (
    <Section id="nav" title="Tabs, steps, pages" path="ui/Tabs · ui/Segmented · ui/Stepper · ui/Pager" note="Tabs switch views of the same thing; segmented sets a mode. Arrow keys move, Home and End jump. Phones page with “Show 20 more”.">
      <Row label="Tabs" className="min-w-0">
        <Tabs className="w-full" ariaLabel="Expenses views" activeTab={tab} onChange={setTab} tabs={[{ id: 'receipts', label: 'Receipts', count: 63 }, { id: 'pay', label: 'To pay', count: 2 }, { id: 'cats', label: 'Categories' }]} />
      </Row>
      <Row label="Tabs · pills">
        <Tabs variant="pills" ariaLabel="Period" activeTab={pill} onChange={setPill} tabs={[{ id: 'month', label: 'Month' }, { id: 'quarter', label: 'Quarter' }, { id: 'year', label: 'Year' }]} />
      </Row>
      <Row label="Segmented">
        <Segmented ariaLabel="Row density" value={density} onChange={setDensity} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        <div className="w-full max-w-sm">
          <Segmented full ariaLabel="VAT period" value={period} onChange={setPeriod} options={[{ value: 'm', label: 'Month' }, { value: 'q', label: 'Quarter' }, { value: 'y', label: 'Year', disabled: true }]} />
        </div>
      </Row>
      <Row label="Stepper · phone" className="block max-w-md">
        <Stepper current={step} onStepClick={setStep} steps={[{ label: 'Buyer' }, { label: 'Price' }, { label: 'Documents' }, { label: 'Send' }]} />
        <p className="mt-2 text-sm text-ink-2">Step <span className="num">{step + 1}</span> of <span className="num">4</span>
          <span className="ms-3 inline-flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setStep(s => Math.max(0, s - 1))}>Back</Button>
            <Button size="sm" onClick={() => setStep(s => Math.min(3, s + 1))}>Next</Button>
          </span>
        </p>
      </Row>
      <Row label="Stepper · desktop" className="block max-w-2xl overflow-x-auto">
        <Stepper className="min-w-[560px]" variant="dots" current={2} onStepClick={() => {}} steps={[{ label: 'Car' }, { label: 'Purchase · 1 error', error: true }, { label: 'Photos' }, { label: 'Price' }]} />
      </Row>
      <Row label="Pager">
        <Pager page={page} pageCount={12} onChange={setPage} />
      </Row>
      <Row label="Show more">
        <ShowMore shown={shown} total={63} noun="receipts" onMore={() => setShown(s => s + 20)} />
      </Row>
    </Section>
  );
};

const Lists: React.FC = () => (
  <Section id="lists" title="Lists & cards" path="ui/ListRow · ui/Card" note="Two lines at most: what it is, then the facts. Detail goes in the disclosure. Cards are flat: surface on a hairline.">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <List ariaLabel="Stock">
        <ListRow
          top={<><Plate reg="LK68TVN" /><span className="num text-xs font-semibold text-ink-3">#500</span><StatusChip status="stock">For sale</StatusChip></>}
          title="Ford Fiesta 1.0 EcoBoost Titanium"
          amount="£8,495"
          meta="2018 · 42,180 mi · open me"
          defaultOpen
          disclosure={
            <>
              <KeyValues items={[{ label: 'Bought', value: '£6,200' }, { label: 'Margin', value: '£2,295', tone: 'up' }, { label: 'Days', value: '23' }]} />
              <div className="flex gap-2"><Button size="sm" variant="secondary">Open</Button><Button size="sm">Sell</Button></div>
            </>
          }
        />
        <ListRow
          className="!bg-surface-3"
          top={<><Plate reg="YD20KMF" /><span className="num text-xs font-semibold text-ink-3">#501</span><StatusChip status="prep">In prep</StatusChip></>}
          title="Toyota Yaris 1.5 Hybrid Icon"
          amount="£13,250"
          meta="2020 · 28,904 mi · pressed state"
          onClick={() => {}}
        />
        <ListRow
          selected
          top={<><Plate reg="BF66RZA" /><span className="num text-xs font-semibold text-ink-3">#494</span><StatusChip status="reserved">Reserved</StatusChip></>}
          title="BMW 320d M Sport"
          amount="£10,750"
          meta="2016 · 88,020 mi · selected state"
          onClick={() => {}}
        />
        <ListRow leading={<Avatar name="Tom Ashworth" />} title="Tom Ashworth" meta="07700 900481 · deposit on #494" amount="+£500.00" end={<StatusChip status="sold">Paid</StatusChip>} onClick={() => {}} />
        <ListRow leading={<Avatar name="Leila Ahmed" />} title="Leila Ahmed" meta="Invoice 1043 · emailed 10:42" />
      </List>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader subtitle="4 cars · £1,960 each" action={<Badge variant="success" dot>Up 12%</Badge>}>Margin this month</CardHeader>
          <p className="num text-[2rem] font-semibold leading-none tracking-[-0.02em]">£7,840.00</p>
          <p className="mt-2 text-sm text-ink-3">October 2026 so far</p>
        </Card>
        <Card onClick={() => {}} padding="md">
          <p className={eyebrow}>VAT · Q3 2026</p>
          <p className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="text-base font-semibold">Due 7 Nov</span>
            <span className="num text-xl font-semibold">£6,628.03</span>
          </p>
          <p className="mt-1 text-sm text-ink-3">Tappable card · hover and press</p>
        </Card>
      </div>
    </div>
  </Section>
);

type BankLine = { id: string; date: string; desc: string; amount: number; hint: React.ReactNode; action: string };
const BANK: BankLine[] = [
  { id: 'a', date: '08/10/2026', desc: 'SHELL WATFORD', amount: -62.1, hint: <StatusChip status="dave">Fuel · receipt found</StatusChip>, action: 'Accept' },
  { id: 'b', date: '07/10/2026', desc: 'NORTHGATE AUCTIONS', amount: -6350, hint: <span className="text-ink-2">#502 purchase</span>, action: 'Match' },
  { id: 'c', date: '06/10/2026', desc: 'FPS T ASHWORTH', amount: 500, hint: <span className="text-ink-2">Deposit #494?</span>, action: 'Match' },
  { id: 'd', date: '06/10/2026', desc: 'DD HMRC VAT', amount: -4120.88, hint: <span className="text-ink-3">None</span>, action: 'Categorise' },
];
const money = (n: number) => `${n < 0 ? '−' : '+'}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

const Table: React.FC = () => {
  const [sel, setSel] = React.useState<Record<string, boolean>>({ a: true });
  const [dir, setDir] = React.useState<SortDir>('descending');
  return (
    <Section id="table" title="Data table" path="ui/DataTable" note="From 1024px only. Money right-aligned in mono with sign and pence; sort on a header button with aria-sort; row actions stay visible.">
      <p className="mb-3 text-sm text-ink-2 lg:hidden">Narrow screen: the same lines use list rows (above). Widen to 1024px to see the table.</p>
      <div className="hidden lg:block">
        <DataTable ariaLabel="Bank lines" minWidth={760}>
          <THead>
            <tr>
              <Th className="w-12"><Checkbox aria-label="Select all lines" checked={BANK.every(b => sel[b.id])} indeterminate={BANK.some(b => sel[b.id]) && !BANK.every(b => sel[b.id])} onChange={e => setSel(Object.fromEntries(BANK.map(b => [b.id, e.target.checked])))} /></Th>
              <Th sort={dir} onSort={() => setDir(d => (d === 'descending' ? 'ascending' : 'descending'))}>Date</Th>
              <Th>Description</Th>
              <Th numeric>Amount</Th>
              <Th>Suggestion</Th>
              <Th className="text-end">Action</Th>
            </tr>
          </THead>
          <TBody>
            {(dir === 'descending' ? BANK : [...BANK].reverse()).map(b => (
              <Tr key={b.id} selected={!!sel[b.id]}>
                <Td><Checkbox aria-label={`Select ${b.desc}`} checked={!!sel[b.id]} onChange={e => setSel(s => ({ ...s, [b.id]: e.target.checked }))} /></Td>
                <Td className="num">{b.date}</Td>
                <Td>{b.desc}</Td>
                <Td numeric tone={b.amount > 0 ? 'in' : 'out'}>{money(b.amount)}</Td>
                <Td>{b.hint}</Td>
                <Td className="text-end"><Button size="sm" variant={b.action === 'Accept' ? 'primary' : 'secondary'}>{b.action}</Button></Td>
              </Tr>
            ))}
          </TBody>
        </DataTable>
      </div>
    </Section>
  );
};

const Feedback: React.FC = () => {
  const toast = useToast();
  const [shown, setShown] = React.useState(true);
  return (
    <Section id="feedback" title="Alerts & toasts" path="ui/Alert · ui/Toast" note="A toast is a short past-tense result with one action; it stays 6 seconds, paused on hover or focus. An alert stays until it’s dealt with.">
      <Row label="Live">
        <Button variant="secondary" onClick={() => toast.success('Bank line ticked off', { label: 'Undo', onClick: () => toast.info('Bank line put back') })}>Show toast</Button>
        <Button variant="secondary" onClick={() => toast.error('Couldn’t reach DVLA. Check the plate and try again.')}>Show error toast</Button>
        <Button variant="secondary" onClick={() => toast.whatsapp('Is the Fiesta still available? Could I see it Saturday morning?', { label: 'Reply', onClick: () => {} }, 'Tom Ashworth · WhatsApp')}>Show WhatsApp</Button>
      </Row>
      <Row label="Toast · previews" className="flex max-w-[420px] flex-col gap-2">
        <Toast message="Bank line ticked off" action={{ label: 'Undo', onClick: () => {} }} onDismiss={() => {}} />
        <Toast variant="info" message="Invoice 1043 sent to Leila by email" onDismiss={() => {}} />
        <Toast variant="error" message="Couldn’t reach DVLA. Try again in a minute." onDismiss={() => {}} />
      </Row>
      <Row label="Alerts" className="grid max-w-2xl gap-3">
        <Alert tone="info" title="Dave is answering for you">He drafts replies; nothing is sent until you tap Send.</Alert>
        <Alert tone="success" title="Invoice sent to Leila">By email at 10:42. <a href="#feedback">View PDF</a></Alert>
        <Alert tone="warning" title="5 receipts have no VAT amount" actions={<Button size="sm" variant="secondary">Show receipts</Button>}>Fix them before you file Q3.</Alert>
        {shown
          ? <Alert tone="danger" title="Couldn’t save the receipt" onDismiss={() => setShown(false)}>No signal. It’s kept on this phone and will save when you’re back online.</Alert>
          : <Button variant="ghost" onClick={() => setShown(true)}>Bring the alert back</Button>}
      </Row>
    </Section>
  );
};

const Overlays: React.FC<{ onSheet: () => void; sheetOpenerRef: React.RefObject<HTMLButtonElement | null> }> = ({ onSheet, sheetOpenerRef }) => {
  const toast = useToast();
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const del = () => {
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setConfirm(false);
      toast.success('#500 Ford Fiesta deleted', { label: 'Undo', onClick: () => {} });
    }, 1200);
  };
  return (
    <Section id="overlays" title="Sheet & dialog" path="ui/Sheet · ui/Dialog (on common/Modal)" note="Under 640px a bottom sheet with a grab handle; above, a centred dialog. Focus stays inside, Esc closes, focus goes back to the button that opened it. Reduced motion: a plain fade.">
      <Row label="Live">
        <Button id="open-sheet" ref={sheetOpenerRef} variant="secondary" icon={<Icons.FunnelIcon />} onClick={onSheet}>Open filter sheet</Button>
        <Button id="open-dialog" variant="danger" icon={<Icons.TrashIcon />} onClick={() => setConfirm(true)}>Delete car…</Button>
      </Row>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        title="Delete #500 Ford Fiesta?"
        confirmLabel="Delete car"
        cancelLabel="Keep car"
        onConfirm={del}
        loading={busy}
      >
        Its costs, photos and prep notes go too. Sales documents stay in the Filing cabinet. You can’t undo this.
      </Dialog>
    </Section>
  );
};

const FilterSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [fuel, setFuel] = React.useState<string[]>(['petrol', 'hybrid']);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('12000');
  const [hideRes, setHideRes] = React.useState(true);
  const [gear, setGear] = React.useState('any');
  const toggle = (v: string) => setFuel(f => (f.includes(v) ? f.filter(x => x !== v) : [...f, v]));
  const count = 9 - (hideRes ? 0 : -2) - (fuel.length < 2 ? 3 : 0);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter stock"
      description="Applied when you tap Show."
      footer={<>
        <Button variant="ghost" onClick={() => { setFuel([]); setFrom(''); setTo(''); setHideRes(false); setGear('any'); }}>Clear all</Button>
        <Button onClick={onClose}>Show <span className="num">{count}</span> cars</Button>
      </>}
    >
      <div className="flex flex-col gap-5">
        <div role="group" aria-labelledby="fs-fuel">
          <p id="fs-fuel" className="mb-2 text-sm font-semibold">Fuel</p>
          <div className="flex flex-wrap gap-2">
            {[['petrol', 'Petrol'], ['diesel', 'Diesel'], ['hybrid', 'Hybrid'], ['electric', 'Electric']].map(([v, l]) => (
              <Chip key={v} selected={fuel.includes(v)} onClick={() => toggle(v)}>{l}</Chip>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price from" htmlFor="fs-from"><CurrencyInput id="fs-from" value={from} onChange={e => setFrom(e.target.value)} /></Field>
          <Field label="Price to" htmlFor="fs-to"><CurrencyInput id="fs-to" value={to} onChange={e => setTo(e.target.value)} /></Field>
        </div>
        <div role="radiogroup" aria-labelledby="fs-gear">
          <p id="fs-gear" className="text-sm font-semibold">Gearbox</p>
          {[['any', 'Any'], ['manual', 'Manual'], ['auto', 'Automatic']].map(([v, l]) => (
            <Radio key={v} name="fs-gear" value={v} label={l} checked={gear === v} onChange={() => setGear(v)} />
          ))}
        </div>
        <Switch label="Hide reserved cars" checked={hideRes} onChange={e => setHideRes(e.target.checked)} />
      </div>
    </Sheet>
  );
};

const Empty: React.FC = () => (
  <Section id="empty" title="Empty & loading" path="ui/EmptyState · ui/Skeleton · common/Spinner" note="Empty: what goes here, why it’s empty, the one thing to do. Loading lists copy the real row so nothing jumps; spinners only inside buttons and short waits, always with words.">
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-card border border-line bg-surface">
        <EmptyState
          icon={<Icons.UserGroupIcon />}
          title="No leads yet"
          description="Leads from Auto Trader and your website land here, and Dave answers them. You can add a walk-in by hand."
          actionLabel="Add a lead"
          onAction={() => {}}
          secondaryLabel="Connect Auto Trader"
          onSecondary={() => {}}
        />
      </div>
      <SkeletonList rows={3} label="Loading stock" />
    </div>
    <div className="mt-6 flex flex-wrap items-center gap-6">
      <Sp c="skeleton shapes">
        <span className="flex items-center gap-3"><Skeleton shape="circle" width={40} /><Skeleton width={140} height={16} /><Skeleton shape="pill" width={64} height={26} /></span>
      </Sp>
      <Sp c="spinner + words">
        <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-2"><Spinner className="h-4 w-4" />Reading receipt…</span>
      </Sp>
    </div>
  </Section>
);

const SearchCal: React.FC = () => {
  const [q, setQ] = React.useState('');
  const [q2, setQ2] = React.useState('LK68');
  const [day, setDay] = React.useState<string | null>(null);
  return (
    <Section id="search" title="Search & calendar" path="ui/Search · common/Calendar" note="One search for everything; press / to focus it on a desktop. Plates match with or without the space. Calendar weeks start on Monday.">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Search label="Search everything" value={q} onChange={setQ} shortcut="/" placeholder="Search cars, people, money" />
          <Search label="Search stock" value={q2} onChange={setQ2} />
          <List ariaLabel="Results">
            <ListRow leading={<Plate reg="LK68TVN" size="sm" />} title="Ford Fiesta · #500" meta="Car" onClick={() => {}} />
            <ListRow leading={<DocChip kind="SI" label={null} />} title="Invoice 1043 · LK68 TVN" meta="Sale" onClick={() => {}} />
          </List>
        </div>
        <div className="rounded-card border border-line bg-surface p-0 sm:p-4">
          <Calendar events={['2026-10-03', '2026-10-14', '2026-10-21']} selectedDate={day} onDateSelect={setDay} />
        </div>
      </div>
    </Section>
  );
};

const ICONS: Array<[string, keyof typeof Icons]> = [
  ['home', 'NavHomeIcon'], ['home · active', 'NavHomeSolidIcon'], ['car', 'NavCarIcon'], ['car · active', 'NavCarSolidIcon'],
  ['inbox', 'NavChatIcon'], ['inbox · active', 'NavChatSolidIcon'], ['more', 'NavGridIcon'], ['more · active', 'NavGridSolidIcon'],
  ['add', 'PlusIcon'], ['search', 'MagnifyingGlassIcon'], ['alerts', 'BellIcon'], ['camera', 'CameraIcon'],
  ['receipt', 'DocumentTextIcon'], ['bank', 'BanknotesIcon'], ['pound', 'PoundIcon'], ['plate', 'PlateIcon'],
  ['mileage', 'GaugeIcon'], ['scan', 'ScanIcon'], ['split', 'SplitIcon'], ['send', 'ArrowUpTrayIcon'],
  ['edit', 'EditIcon'], ['workshop', 'WrenchScrewdriverIcon'], ['leads', 'UserGroupIcon'], ['filing', 'ArchiveBoxIcon'],
  ['reports', 'ChartPieIcon'], ['settings', 'Cog6ToothIcon'], ['date', 'CalendarIcon'], ['warning', 'ExclamationTriangleIcon'],
];

const IconGrid: React.FC = () => (
  <Section id="icons" title="Icons" path="components/icons.tsx" note="24 grid, 1.5 stroke, round caps, currentColor. Outline everywhere; filled only for the active tab. Shown at 24, 20 and 16.">
    <ul className="m-0 grid list-none grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line p-0 sm:grid-cols-4 lg:grid-cols-7">
      {ICONS.map(([name, key]) => {
        const I = Icons[key] as unknown as React.ComponentType<{ className?: string; size?: 16 | 20 | 24 }>;
        return (
          <li key={key} className="flex flex-col gap-3 bg-surface p-3">
            <span className="flex items-end gap-3 text-ink-2">
              <I size={24} /><I size={20} /><I size={16} />
            </span>
            <span className="font-mono text-xs text-ink-3">{name}</span>
          </li>
        );
      })}
    </ul>
  </Section>
);

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const Gallery: React.FC = () => {
  const [mode, setMode] = React.useState<Mode>(readMode);
  const [brand, setBrand] = React.useState<Brand>(readBrand);
  const [sheet, setSheet] = React.useState(false);
  const [width, setWidth] = React.useState(() => window.innerWidth);
  const sheetOpenerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-theme', mode);
    BRANDS.forEach(b => html.classList.toggle(`theme-${b}`, b === brand));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0B1117' : '#F1F3F5');
  }, [mode, brand]);

  React.useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    document.documentElement.setAttribute('data-gallery-ready', '');
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <>
      <header className="z-nav border-b border-line bg-surface sm:sticky sm:top-0">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3 py-1">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-control bg-ink font-mono text-sm font-semibold text-surface" aria-hidden="true">DL</span>
            <div className="min-w-0">
              <p className="truncate text-base font-bold leading-5">Forecourt Ledger</p>
              <p className="truncate font-mono text-xs text-ink-3">components/ui · dev gallery</p>
            </div>
          </div>
          <Segmented ariaLabel="Colour theme" value={mode} onChange={m => { setMode(m); setParam('theme', m); }} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
            <span className="font-mono text-xs text-ink-3 sm:hidden">Brand</span>
            <BrandPicker value={brand} onChange={b => { setBrand(b); setParam('brand', b); }} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1240px] px-4 md:px-6 lg:grid lg:grid-cols-[184px_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Sections" className="hidden lg:block">
          <ol className="sticky top-[76px] m-0 list-none py-8 ps-0">
            {SECTIONS.map(([id, label], i) => (
              <li key={id}>
                <a href={`#${id}`} className="flex min-h-[36px] items-center gap-3 rounded-control px-2 text-sm text-ink-2 no-underline hover:bg-surface-2 hover:text-ink">
                  <span className="num w-5 text-xs text-ink-3">{String(i + 1).padStart(2, '0')}</span>{label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="min-w-0">
          <div className="pb-10 pt-8 md:pt-12">
            <p className={eyebrow}>04 · Component library</p>
            <h1 className="mt-3 text-[clamp(2.25rem,7vw,4rem)] font-bold leading-[0.95] tracking-[-0.035em]">The primitives</h1>
            <p className="mt-4 max-w-[60ch] text-base leading-6 text-ink-2">
              Every shared control in every state. Hover, press and focus work for real; forced looks sit beside them for review. Dev only: not in the production build. All names, plates and money are made up.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-3">
              <Plate reg="LK68 TVN" size="lg" />
              <span className="num text-sm font-semibold text-ink-3">#500</span>
              <StatusChip status="stock">For sale</StatusChip>
              <span className="num ms-auto text-xl font-semibold">£8,495.00</span>
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-ink-3">
              <div className="flex gap-1.5"><dt>theme</dt><dd className="m-0 text-ink-2">{mode}</dd></div>
              <div className="flex gap-1.5"><dt>brand</dt><dd className="m-0 text-ink-2">{brand}</dd></div>
              <div className="flex gap-1.5"><dt>width</dt><dd className="m-0 text-ink-2">{width}px</dd></div>
            </dl>
          </div>

          <Buttons />
          <Fields />
          <Selects />
          <Choices />
          <Chips onFilters={() => setSheet(true)} />
          <Nav />
          <Lists />
          <Table />
          <Feedback />
          <Overlays onSheet={() => setSheet(true)} sheetOpenerRef={sheetOpenerRef} />
          <Empty />
          <SearchCal />
          <IconGrid />
          <p className="border-t border-line py-8 font-mono text-xs text-ink-3">ui-gallery.html · dev/UiGallery.tsx · not shipped</p>
        </main>
      </div>

      <FilterSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  </React.StrictMode>,
);
