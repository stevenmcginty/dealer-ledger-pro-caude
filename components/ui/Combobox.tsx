import React from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronUpDownIcon, MagnifyingGlassIcon, PlusIcon } from '../icons';
import Field from './Field';
import Sheet from './Sheet';
import { controlFrame, controlInput, cx } from './cx';
import { useMediaQuery } from './useMediaQuery';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Grey words on the end of the row ("Parts"). */
  hint?: string;
}

export interface ComboboxProps {
  /** Visible label above the field; also names the list. */
  label: string;
  options: ComboboxOption[];
  /** The chosen option's value, or '' for none. */
  value: string;
  onChange: (value: string, option?: ComboboxOption) => void;
  /** Offers "Add “hal” as a new supplier" last in the list. Gets the typed words. */
  onCreate?: (query: string) => void;
  /** What one option is, for the add row and the empty line: "supplier". */
  noun?: string;
  placeholder?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  disabled?: boolean;
  id?: string;
  /** Most rows the list shows at once (the rest come as you type). Default 50. */
  maxResults?: number;
  className?: string;
}

type Item = { kind: 'option'; option: ComboboxOption } | { kind: 'create'; query: string };

const LIST_MAX_H = 320;
const GAP = 6;
const EDGE = 8;

/** Bold, underlined match, so it reads without colour. */
const Highlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-bold text-inherit underline underline-offset-[3px]">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
};

const useItems = (options: ComboboxOption[], query: string, onCreate: ComboboxProps['onCreate'], max: number): Item[] =>
  React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = (q ? options.filter(o => o.label.toLowerCase().includes(q)) : options).slice(0, max);
    const items: Item[] = hits.map(option => ({ kind: 'option', option }));
    if (onCreate && q && !options.some(o => o.label.toLowerCase() === q)) items.push({ kind: 'create', query: query.trim() });
    return items;
  }, [options, query, onCreate, max]);

interface ListProps {
  id: string;
  label: string;
  items: Item[];
  value: string;
  query: string;
  active: number;
  noun: string;
  onActive: (i: number) => void;
  onPick: (item: Item) => void;
  className?: string;
  style?: React.CSSProperties;
  listRef?: React.Ref<HTMLUListElement>;
}

const optionId = (listId: string, i: number) => `${listId}-o${i}`;

const ListBox: React.FC<ListProps> = ({ id, label, items, value, query, active, noun, onActive, onPick, className, style, listRef }) => (
  <ul
    ref={listRef}
    id={id}
    role="listbox"
    aria-label={label}
    // Keep focus in the input while the list is pressed or scrolled.
    onMouseDown={e => e.preventDefault()}
    className={cx('m-0 list-none p-1.5', className)}
    style={style}
  >
    {items.length === 0 && (
      <li role="presentation" className="px-2.5 py-3 text-sm text-ink-3">No {noun}s match “{query.trim()}”.</li>
    )}
    {items.map((item, i) => {
      const isActive = i === active;
      if (item.kind === 'create') {
        return (
          <li
            key="__create"
            id={optionId(id, i)}
            role="option"
            aria-selected={false}
            onMouseMove={() => onActive(i)}
            onClick={() => onPick(item)}
            className={cx(
              'mt-1 flex min-h-[48px] cursor-pointer items-center gap-2.5 rounded-chip border-t border-line px-2.5 text-base font-semibold text-accent-text',
              isActive && 'bg-surface-2',
            )}
          >
            <PlusIcon className="h-5 w-5 flex-none" aria-hidden="true" />
            <span className="min-w-0 truncate">Add “{item.query}” as a new {noun}</span>
          </li>
        );
      }
      const { option } = item;
      const selected = option.value === value;
      return (
        <li
          key={option.value}
          id={optionId(id, i)}
          role="option"
          aria-selected={selected}
          onMouseMove={() => onActive(i)}
          onClick={() => onPick(item)}
          className={cx(
            'flex min-h-[48px] cursor-pointer items-center gap-2.5 rounded-chip px-2.5 text-base',
            selected ? 'bg-accent-soft font-semibold text-accent-soft-ink' : 'text-ink',
            isActive && (selected ? 'outline outline-2 -outline-offset-2 outline-accent' : 'bg-surface-2'),
          )}
        >
          <span className="min-w-0 flex-1 truncate"><Highlight text={option.label} query={query} /></span>
          {option.hint && <span className="flex-none text-sm font-normal text-ink-3">{option.hint}</span>}
          {selected && <CheckIcon className="h-5 w-5 flex-none" aria-hidden="true" />}
        </li>
      );
    })}
  </ul>
);

/**
 * Pick one from a long or growing list (suppliers, cars, categories), with
 * "Add new" last. ARIA 1.2 combobox: arrows move the active option, Enter
 * picks, Esc closes. From 640px the list drops under the field; on a phone
 * the field opens a full-height sheet with its own search box.
 */
const Combobox: React.FC<ComboboxProps> = ({
  label,
  options,
  value,
  onChange,
  onCreate,
  noun = 'item',
  placeholder = 'Choose…',
  hint,
  error,
  optional,
  disabled,
  id,
  maxResults = 50,
  className,
}) => {
  const wide = useMediaQuery('(min-width: 640px)');
  const autoId = React.useId().replace(/:/g, '');
  const fieldId = id || `cb${autoId}`;
  const listId = `${fieldId}-list`;
  const selected = options.find(o => o.value === value);
  const selectedLabel = selected?.label ?? '';

  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(selectedLabel);
  const [editing, setEditing] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const query = editing ? text : '';
  const items = useItems(options, query, onCreate, maxResults);

  const frameRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Follow the parent's value when not typing.
  React.useEffect(() => { if (!editing) setText(selectedLabel); }, [selectedLabel, editing]);

  // Keep the active option in view.
  React.useEffect(() => {
    if (active < 0) return;
    document.getElementById(optionId(listId, active))?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const close = (revert = true) => {
    setOpen(false);
    setActive(-1);
    setEditing(false);
    if (revert) setText(selectedLabel);
  };

  const pick = (item: Item) => {
    if (item.kind === 'create') {
      onCreate?.(item.query);
      setText(item.query);
    } else {
      onChange(item.option.value, item.option);
      setText(item.option.label);
    }
    setOpen(false);
    setActive(-1);
    setEditing(false);
  };

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    const at = items.findIndex(it => it.kind === 'option' && it.option.value === value);
    setActive(at >= 0 ? at : items.length ? 0 : -1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, inSheet = false) => {
    const listOpen = inSheet || open;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!listOpen) { openList(); return; }
        if (items.length) setActive(a => (a + 1) % items.length);
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (!listOpen) { openList(); return; }
        if (items.length) setActive(a => (a <= 0 ? items.length - 1 : a - 1));
        return;
      case 'Enter':
        if (listOpen && active >= 0 && items[active]) {
          e.preventDefault();
          pick(items[active]);
          if (inSheet) setSheetOpen(false);
        }
        return;
      case 'Escape':
        if (!inSheet && open) {
          // Close the list only; a surrounding sheet stays open.
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        return;
      case 'Tab':
        if (!inSheet && open) close();
        return;
      default:
    }
  };

  const onBlur = () => {
    if (!editing) { close(); return; }
    // Emptied the field: that clears the choice. Anything else half-typed goes back.
    if (text.trim() === '' && value) onChange('', undefined);
    close(text.trim() !== '');
  };

  // ---- Wide: the list hangs under the field, fixed so a sheet or table never clips it ----
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!open || !wide) return;
    const place = () => {
      const r = frameRef.current?.getBoundingClientRect();
      if (!r) return;
      const vh = window.innerHeight;
      const below = vh - r.bottom - GAP - EDGE;
      const above = r.top - GAP - EDGE;
      const up = below < 200 && above > below;
      const maxH = Math.max(120, Math.min(LIST_MAX_H, up ? above : below));
      const listH = Math.min(maxH, listRef.current?.scrollHeight ?? maxH);
      setPos({ top: up ? r.top - GAP - listH : r.bottom + GAP, left: r.left, width: r.width, maxH });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open, wide, items.length]);

  // ---- Phone: the field is a button that opens a sheet with its own search ----
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const sheetInputRef = React.useRef<HTMLInputElement>(null);
  const openSheet = () => {
    if (disabled) return;
    setText('');
    setEditing(true);
    setActive(-1);
    setSheetOpen(true);
  };
  const closeSheet = () => { setSheetOpen(false); setEditing(false); setText(selectedLabel); setActive(-1); };

  const describedBy = (ids: { describedBy?: string }) => ids.describedBy;

  return (
    <Field label={label} htmlFor={fieldId} hint={hint} error={error} optional={optional} className={className}>
      {ids => wide ? (
        <div ref={frameRef} className={controlFrame({ error: !!error, disabled })}>
          <input
            ref={inputRef}
            id={ids.id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined}
            aria-invalid={ids.invalid || undefined}
            aria-describedby={describedBy(ids)}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            placeholder={placeholder}
            value={text}
            onChange={e => { setText(e.target.value); setEditing(true); setOpen(true); setActive(0); }}
            onClick={() => { if (!open) openList(); }}
            onKeyDown={e => onKeyDown(e)}
            onBlur={onBlur}
            className={cx(controlInput, 'pe-1')}
          />
          <span className="pointer-events-none flex flex-none pe-3 text-ink-2" aria-hidden="true">
            {editing ? <MagnifyingGlassIcon className="h-5 w-5" /> : <ChevronUpDownIcon className="h-5 w-5" />}
          </span>
          {open && createPortal(
            <ListBox
              id={listId}
              label={label}
              items={items}
              value={value}
              query={query}
              active={active}
              noun={noun}
              onActive={setActive}
              onPick={pick}
              listRef={listRef}
              className="fixed z-[55] overflow-y-auto overscroll-contain rounded-control border border-line bg-surface text-ink shadow-e2"
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width, maxHeight: pos?.maxH ?? LIST_MAX_H }}
            />,
            document.body,
          )}
        </div>
      ) : (
        <>
          <button
            ref={triggerRef}
            id={ids.id}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            aria-invalid={ids.invalid || undefined}
            aria-describedby={describedBy(ids)}
            disabled={disabled}
            onClick={openSheet}
            className={cx(controlFrame({ error: !!error, disabled }), 'w-full cursor-pointer text-start disabled:cursor-not-allowed')}
          >
            <span className={cx('min-w-0 flex-1 truncate px-3.5 py-3 text-base leading-snug', selected && !disabled ? 'text-ink' : 'text-ink-3')}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronUpDownIcon className="me-3 h-5 w-5 flex-none text-ink-2" aria-hidden="true" />
          </button>
          <Sheet open={sheetOpen} onClose={closeSheet} title={label} tall initialFocusRef={sheetInputRef}>
            <div className="sticky top-0 z-[1] -mx-5 bg-surface px-5 pb-2">
              <div className={controlFrame()}>
                <MagnifyingGlassIcon className="ms-3.5 h-5 w-5 flex-none text-ink-3" aria-hidden="true" />
                <input
                  ref={sheetInputRef}
                  type="search"
                  role="combobox"
                  aria-label={`Search ${label.toLowerCase()}`}
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={active >= 0 ? optionId(listId, active) : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={`Search ${noun}s`}
                  value={text}
                  onChange={e => { setText(e.target.value); setActive(0); }}
                  onKeyDown={e => onKeyDown(e, true)}
                  className={cx(controlInput, 'ps-2 [&::-webkit-search-cancel-button]:hidden')}
                />
              </div>
            </div>
            <ListBox
              id={listId}
              label={label}
              items={items}
              value={value}
              query={text}
              active={active}
              noun={noun}
              onActive={setActive}
              onPick={item => { pick(item); setSheetOpen(false); }}
              className="-mx-1.5"
            />
          </Sheet>
        </>
      )}
    </Field>
  );
};

export default Combobox;
