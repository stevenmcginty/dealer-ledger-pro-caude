import React from 'react';

/*
 * The app's icon set. Rules (Forecourt Ledger, 4.3): 24 grid, 1.5 stroke,
 * round caps and joins, always currentColor. Sizes 16 / 20 / 24, set with
 * `size` or a Tailwind h-/w- class. Outline everywhere; the *SolidIcon
 * twins are only for the active tab / sidebar item.
 * Decorative by default (aria-hidden); pass `title` to make one speak.
 */
export type IconSize = 16 | 20 | 24;
export type IconProps = {
  className?: string;
  /** Pixel size. Leave out to size with classes (h-5 w-5) as before. */
  size?: IconSize;
  /** Accessible name. Without it the icon is hidden from screen readers. */
  title?: string;
  style?: React.CSSProperties;
};

const Icon = ({ className, size, title, style, solid, children }: IconProps & { solid?: boolean; children: React.ReactNode }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill={solid ? 'currentColor' : 'none'}
    stroke={solid ? 'none' : 'currentColor'}
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    width={size}
    height={size}
    className={className}
    style={style}
    focusable="false"
    aria-hidden={title ? undefined : true}
    role={title ? 'img' : undefined}
  >
    {title && <title>{title}</title>}
    {children}
  </svg>
);

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h7.5" />
  </Icon>
);
export const CarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V14.25m-17.25 4.5v-1.875a3.375 3.375 0 013.375-3.375h9.75a3.375 3.375 0 013.375 3.375v1.875m-17.25 4.5h16.5M5.625 13.5h12.75" />
  </Icon>
);
export const DocumentTextIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </Icon>
);
export const CreditCardIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21.75z" />
  </Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v16m8-8H4" />
  </Icon>
);
export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
  </Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.067-2.09.92-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </Icon>
);
export const SparklesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.5 21.75l-.398-1.178a3.375 3.375 0 00-2.3-2.3L12.75 18l1.178-.398a3.375 3.375 0 002.3-2.3L16.5 14.25l.398 1.178a3.375 3.375 0 002.3 2.3l1.178.398-1.178.398a3.375 3.375 0 00-2.3 2.3z" />
  </Icon>
);
export const XMarkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 18L18 6M6 6l12 12" />
  </Icon>
);
export const CheckCircleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </Icon>
);
export const InformationCircleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12v-.008z" />
  </Icon>
);
export const PrinterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6 18.75m.72-4.921c.24.03.48.062.72.096m0 0c.24.03.48.062.72.096m-1.44 0a42.415 42.415 0 0010.56 0m-10.56 0L12 18.75m-5.28 0c-.24.03-.48.062-.72.096m-1.44 0A42.415 42.415 0 0112 13.829m-1.44 0L12 18.75" />
    <path d="M16.5 6.75h-9a1.5 1.5 0 00-1.5 1.5v9a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-9a1.5 1.5 0 00-1.5-1.5z" />
  </Icon>
);
export const ArrowUpTrayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </Icon>
);
export const ArrowDownTrayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </Icon>
);
export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 47.758 47.758 0 00-4.542 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
    <path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
  </Icon>
);
export const TagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L9.568 3z" />
    <path d="M6 6h.008v.008H6V6z" />
  </Icon>
);
export const CalculatorIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 3h.008v.008H8.25v-.008zm0 3h.008v.008H8.25v-.008zm3-6h.008v.008H11.25v-.008zm0 3h.008v.008H11.25v-.008zm0 3h.008v.008H11.25v-.008zm3-6h.008v.008H14.25v-.008zm0 3h.008v.008H14.25v-.008zM5.25 8.25a.75.75 0 01.75-.75h12a.75.75 0 01.75.75v10.5a.75.75 0 01-.75-.75h-12a.75.75 0 01-.75-.75V8.25z" />
  </Icon>
);
export const Bars3Icon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
  </Icon>
);
export const ChartPieIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.5 6a7.5 7.5 0 100 12h-3a7.5 7.5 0 000-12h3z" />
    <path d="M14.25 9a3 3 0 100 6h-3a3 3 0 000-6h3z" />
  </Icon>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </Icon>
);
export const ChevronUpDownIcon = (p: IconProps) => (
  <Icon {...p}>
      <path d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
    </Icon>
);
export const Cog6ToothIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M9.594 3.94c.09-.542.56-1.008 1.11-.962a8.25 8.25 0 015.584 5.584c.046.55-.422 1.02-.962 1.11l-4.28 1.07a1.125 1.125 0 01-1.254-1.254l1.07-4.28zM9.594 3.94L8.25 2.25a.75.75 0 00-1.06-1.061l-1.696 1.696a1.125 1.125 0 00-1.59 1.591L5.352 5.352a1.125 1.125 0 001.59 1.59l1.696-1.696a.75.75 0 001.061-1.06zm7.07 7.07l1.344 1.344a.75.75 0 001.06 1.06l1.697-1.697a1.125 1.125 0 00-1.59-1.59l-1.697 1.697a.75.75 0 00-1.06 1.06zm-7.07 7.07l-1.344-1.344a.75.75 0 00-1.06-1.06l-1.697 1.697a1.125 1.125 0 001.59 1.59l1.697-1.697a.75.75 0 001.06-1.06zM12 15a3 3 0 100-6 3 3 0 000 6z" />
    </Icon>
);
export const FuelIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.343-.026.69.043.998.163m-2.974 2.028a2.25 2.25 0 012.25-2.25h.008a2.25 2.25 0 012.25 2.25v.908c0 1.135-.845 2.098-1.976 2.192a48.424 48.424 0 01-1.022.067c-.53.026-1.06.026-1.59 0a2.25 2.25 0 01-2.25-2.25v-.908" />
        <path d="M15.75 9.75v-4.5a3.375 3.375 0 00-3.375-3.375h-1.5A3.375 3.375 0 007.5 5.25v4.5m-3.75 4.5h15a2.25 2.25 0 012.25 2.25v3.75a2.25 2.25 0 01-2.25-2.25h-15a2.25 2.25 0 01-2.25-2.25v-3.75a2.25 2.25 0 012.25-2.25z" />
    </Icon>
);
export const WrenchScrewdriverIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.83-5.83M11.42 15.17l-4.24-4.24a5.25 5.25 0 00-7.42 0L0 12l5.83-5.83a5.25 5.25 0 007.42 0l4.24 4.24m-8.48-8.48L12 0l-5.83 5.83a5.25 5.25 0 000 7.42l4.24 4.24" />
    </Icon>
);
export const BanknotesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
  </Icon>
);
export const EllipsisVerticalIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
    </Icon>
);
export const ExclamationTriangleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </Icon>
);
export const UndoIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </Icon>
);
export const ArchiveBoxIcon = (p: IconProps) => (
  <Icon {...p}>
      <path d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.343-.026.69.043.998.163m-2.974 2.028a2.25 2.25 0 012.25-2.25h.008a2.25 2.25 0 012.25 2.25v.908c0 1.135-.845 2.098-1.976 2.192a48.424 48.424 0 01-1.022.067c-.53.026-1.06.026-1.59 0a2.25 2.25 0 01-2.25-2.25v-.908" />
      <path d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125V6.375c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v.001c0 .621.504 1.125 1.125 1.125z" />
    </Icon>
);
export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </Icon>
);
export const FireIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
        <path d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </Icon>
);
export const MicrophoneIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M12 18.75a6 6 0 006-6v-1.5a6 6 0 00-12 0v1.5a6 6 0 006 6z" />
        <path d="M19.5 12a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
        <path d="M12 12.75a.75.75 0 00.75-.75v-3a.75.75 0 00-1.5 0v3a.75.75 0 00.75.75z" />
    </Icon>
);
export const ClipboardDocumentListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
  </Icon>
);
export const BuildingStorefrontIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 21v-7.5A.75.75 0 0 1 14.25 12h.01a.75.75 0 0 1 .75.75v7.5m-3.75-7.5A.75.75 0 0 0 9.75 12h-.01a.75.75 0 0 0-.75.75v7.5m-3.75 0V12A.75.75 0 0 1 5.25 12h.01a.75.75 0 0 1 .75.75v7.5m-3.75 0h16.5a1.5 1.5 0 0 0 1.5-1.5v-1.5a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v1.5a1.5 1.5 0 0 0 1.5 1.5Z" />
    <path d="M4.5 12V6a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 19.5 6v6" />
    <path d="M18 12a2.25 2.25 0 0 0-2.25-2.25H8.25A2.25 2.25 0 0 0 6 12" />
    <path d="M18 12H6" />
  </Icon>
);
export const ArrowTopRightOnSquareIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
  </Icon>
);
export const ClipboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v3.042m-7.332 0c-.055.194-.084.4-.084.612v3.042m0 0v1.125c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25m.75 12V9.375m0 0H7.5m9-6h3V3.375c0-.621-.504-1.125-1.125-1.125h-9.75c-.621 0-1.125.504-1.125 1.125V9.375m0 0H18" />
  </Icon>
);
export const PaperClipIcon = (p: IconProps) => (
  <Icon {...p}>
      <path d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.122 2.122l7.81-7.81" />
    </Icon>
);
export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0h18M9.75 12.75h.008v.008H9.75v-.008zm0 4.5h.008v.008H9.75v-.008zm4.5-4.5h.008v.008H14.25v-.008zm-4.5 0h.008v.008H9.75v-.008zm0 4.5h.008v.008H9.75v-.008zm-4.5 4.5h.008v.008H5.25v-.008zm4.5 0h.008v.008H9.75v-.008zm4.5 0h.008v.008H14.25v-.008zm4.5-4.5h.008v.008H18.75v-.008zm-4.5 4.5h.008v.008H14.25v-.008z" />
    </Icon>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M15.75 19.5L8.25 12l7.5-7.5" />
    </Icon>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </Icon>
);

// CRM Icons
export const UserGroupIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </Icon>
);
export const InboxIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-17.5 0V6.108c0-1.135.845-2.098 1.976-2.192a48.424 48.424 0 0111.048 0c1.131.094 1.976 1.057 1.976 2.192V13.5m-17.5 0V18c0 1.32.844 2.484 2.092 2.892a48.208 48.208 0 0013.316 0A2.25 2.25 0 0021.75 18v-4.5" />
    </Icon>
);
export const ViewColumnsIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
    </Icon>
);
export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </Icon>
);
export const EnvelopeIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </Icon>
);
/** WhatsApp mark, used as a channel chip — not as a product logo. */
export const WhatsAppIcon = (p: IconProps) => (
  <Icon {...p} solid>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </Icon>
);
export const MagnifyingGlassIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </Icon>
);
export const FunnelIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
    </Icon>
);
export const ChatBubbleLeftIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </Icon>
);
export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </Icon>
);
export const CurrencyPoundIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M14.121 7.629A3 3 0 009.017 9.43c-.023.212-.002.425.028.636l.506 3.541a4.5 4.5 0 01-.43 2.65L6 21h9m0-18a3 3 0 00-3 3v.86l6 6m-6-6l6-6m-6 6l-6 6" />
    </Icon>
);
export const TruckIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H19.5M15.75 9h3.375c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125H15.75m0-3.75v3.75m0-3.75V5.625A2.625 2.625 0 0013.125 3H5.625A2.625 2.625 0 003 5.625v8.25c0 .621.504 1.125 1.125 1.125h2.25" />
    </Icon>
);

export const ChatBubbleLeftRightIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
    </Icon>
);
export const BoltIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </Icon>
);
export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
    </Icon>
);
export const ArrowPathIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </Icon>
);
export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </Icon>
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </Icon>
);
export const ShieldCheckIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </Icon>
);
export const XCircleIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </Icon>
);
export const SignalIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </Icon>
);
export const ArrowLeftOnRectangleIcon = (p: IconProps) => (
  <Icon {...p}>
        <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
    </Icon>
);


/* ---- Small glyphs the primitives need (drawn on the 24 grid) ---- */
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>
);
export const ExclamationCircleIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.75V13M12 16.25v.01" /></Icon>
);
export const MinusIcon = (p: IconProps) => (
  <Icon {...p}><path d="M5 12h14" /></Icon>
);

/* ---- Navigation pairs: outline at rest, solid when active. Same silhouettes
   so the swap reads as "lit", not as a different icon. ---- */
export const NavHomeIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3.5 10.5 12 3.75l8.5 6.75V19.5a1 1 0 0 1-1 1H15v-6h-6v6H4.5a1 1 0 0 1-1-1z" /></Icon>
);
export const NavHomeSolidIcon = (p: IconProps) => (
  <Icon {...p} solid><path d="M3.5 10.5 12 3.75l8.5 6.75V19.5a1 1 0 0 1-1 1H15v-6h-6v6H4.5a1 1 0 0 1-1-1z" /></Icon>
);
export const NavCarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 17H4a1 1 0 0 1-1-1v-3.2a2 2 0 0 1 .6-1.4L6 9l1.6-3.2A1.5 1.5 0 0 1 8.9 5h6.2a1.5 1.5 0 0 1 1.3.8L18 9l2.4 2.4a2 2 0 0 1 .6 1.4V16a1 1 0 0 1-1 1h-1M9 17h6M6 9h12" />
    <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
  </Icon>
);
export const NavCarSolidIcon = (p: IconProps) => {
  const id = React.useId();
  return (
    <Icon {...p} solid>
      <mask id={id}>
        <rect width="24" height="24" fill="white" />
        <circle cx="7" cy="17" r="3.4" fill="black" /><circle cx="17" cy="17" r="3.4" fill="black" />
      </mask>
      <path mask={`url(#${id})`} d="M3 12.8a2 2 0 0 1 .6-1.4L6 9l1.6-3.2A1.5 1.5 0 0 1 8.9 5h6.2a1.5 1.5 0 0 1 1.3.8L18 9l2.4 2.4a2 2 0 0 1 .6 1.4V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <circle cx="7" cy="17" r="2.4" /><circle cx="17" cy="17" r="2.4" />
    </Icon>
  );
};
export const NavChatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z" />
    <path d="M8 8.75h8M8 12h5" />
  </Icon>
);
export const NavChatSolidIcon = (p: IconProps) => {
  const id = React.useId();
  return (
    <Icon {...p} solid>
      <mask id={id}>
        <rect width="24" height="24" fill="white" />
        <path d="M8 8.75h8M8 12h5" stroke="black" strokeWidth="1.5" strokeLinecap="round" />
      </mask>
      <path mask={`url(#${id})`} d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z" />
    </Icon>
  );
};
export const NavGridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
);
export const NavGridSolidIcon = (p: IconProps) => (
  <Icon {...p} solid>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
);

/* ---- Trade glyphs Heroicons does not draw ---- */
export const PoundIcon = (p: IconProps) => (
  <Icon {...p}><path d="M15.75 7a3.25 3.25 0 0 0-6 1.75V18M7 13h6.5M7 18h10.5" /></Icon>
);
export const PlateIcon = (p: IconProps) => (
  <Icon {...p}><rect x="2.5" y="8" width="19" height="8" rx="1.5" /><path d="M6 12h1.5M10 12h4.5M17 12h1" /></Icon>
);
export const GaugeIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4.6 17.5a8.25 8.25 0 1 1 14.8 0" /><path d="m12 13.5 3.75-3.75" /><circle cx="12" cy="13.5" r="1.25" /></Icon>
);
export const ScanIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16" /></Icon>
);
export const SplitIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 20.5V13L6 7M12 13l6-6M5 4.5v3.5h3.5M19 4.5v3.5h-3.5" /></Icon>
);

export const iconMap: { [key: string]: React.ComponentType<{ className?: string }> } = {
    HomeIcon,
    CarIcon,
    DocumentTextIcon,
    CreditCardIcon,
    CalculatorIcon,
    ChartPieIcon,
    ArrowDownTrayIcon,
    TagIcon,
    FuelIcon,
    WrenchScrewdriverIcon,
    BanknotesIcon,
    EllipsisVerticalIcon,
    ArchiveBoxIcon,
    BuildingStorefrontIcon,
    ExclamationTriangleIcon,
    CalendarIcon,
    UserGroupIcon,
    InboxIcon,
    ViewColumnsIcon,
    PhoneIcon,
    EnvelopeIcon,
    MagnifyingGlassIcon,
    FunnelIcon,
    ChatBubbleLeftIcon,
    ArrowLeftIcon,
    CurrencyPoundIcon,
    TruckIcon,
};

export const getIcon = (name: string): React.ComponentType<{ className?: string }> => {
    return iconMap[name] || TagIcon;
};