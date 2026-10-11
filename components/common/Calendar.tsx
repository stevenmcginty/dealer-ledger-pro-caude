import React, { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import { toYYYYMMDD } from '../../utils/helpers';

interface CalendarProps {
    events: string[]; // Dates in 'YYYY-MM-DD' format
    selectedDate: string | null;
    onDateSelect: (date: string) => void;
}

const Calendar = ({ events, selectedDate, onDateSelect }: CalendarProps) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const eventSet = new Set(events);
    const today = new Date();
    const todayStr = toYYYYMMDD(today);

    const changeMonth = (amount: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
    };

    const monthName = currentDate.toLocaleString('default', { month: 'long' });
    const year = currentDate.getFullYear();

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInPrevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();
    
    // Adjust firstDayOfMonth to be Monday-first (0 = Monday, 6 = Sunday)
    const startDay = (firstDayOfMonth === 0) ? 6 : firstDayOfMonth - 1;

    const calendarDays = [];
    // Previous month's padding
    for (let i = startDay; i > 0; i--) {
        const day = daysInPrevMonth - i + 1;
        calendarDays.push({ day, isCurrentMonth: false });
    }
    // Current month's days
    for (let day = 1; day <= daysInMonth; day++) {
        calendarDays.push({ day, isCurrentMonth: true });
    }
    // Next month's padding
    const remaining = 42 - calendarDays.length; // 6 rows * 7 days
    for (let day = 1; day <= remaining; day++) {
        calendarDays.push({ day, isCurrentMonth: false });
    }

    return (
        <div className="text-ink">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold tracking-[-0.01em]">{monthName} <span className="num font-semibold text-ink-2">{year}</span></h3>
                <div className="flex items-center gap-1">
                    <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)} className="inline-grid h-12 w-12 md:[@media(pointer:fine)]:h-10 md:[@media(pointer:fine)]:w-10 place-items-center rounded-control text-ink-2 transition-colors duration-quick ease-out hover:bg-surface-2 hover:text-ink active:bg-surface-3"><ChevronLeftIcon className="h-5 w-5" /></button>
                    <button type="button" onClick={() => setCurrentDate(new Date())} className="min-h-[48px] md:[@media(pointer:fine)]:min-h-[40px] rounded-control px-3 text-sm font-semibold text-accent-text transition-colors duration-quick ease-out hover:bg-accent-soft">Today</button>
                    <button type="button" aria-label="Next month" onClick={() => changeMonth(1)} className="inline-grid h-12 w-12 md:[@media(pointer:fine)]:h-10 md:[@media(pointer:fine)]:w-10 place-items-center rounded-control text-ink-2 transition-colors duration-quick ease-out hover:bg-surface-2 hover:text-ink active:bg-surface-3"><ChevronRightIcon className="h-5 w-5" /></button>
                </div>
            </div>
            <div className="mb-2 grid grid-cols-7 sm:gap-1 text-center font-mono text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
            </div>
            <div className="grid grid-cols-7 sm:gap-1">
                {calendarDays.map((d, index) => {
                    if (!d.isCurrentMonth) {
                        return <div key={`pad-${index}`} aria-hidden="true"></div>;
                    }
                    
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d.day);
                    const dateStr = toYYYYMMDD(date);
                    
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const hasEvent = eventSet.has(dateStr);
                    
                    let dayClasses = "num relative flex h-12 md:[@media(pointer:fine)]:h-10 w-full cursor-pointer items-center justify-center rounded-control text-sm transition-colors duration-quick ease-out ";
                    if (isSelected) {
                        dayClasses += "bg-accent font-semibold text-on-accent hover:bg-accent-hover";
                    } else if (isToday && hasEvent) {
                        dayClasses += "bg-warning-soft font-semibold text-warning-ink ring-1 ring-inset ring-warning";
                    } else if (isToday) {
                        dayClasses += "font-semibold text-accent-text ring-1 ring-inset ring-accent/50 hover:bg-accent-soft";
                    } else {
                        dayClasses += "text-ink hover:bg-surface-2";
                    }

                    return (
                        <div key={dateStr} className="flex justify-center items-center">
                            <button type="button" onClick={() => onDateSelect(dateStr)} aria-pressed={isSelected} aria-current={isToday ? 'date' : undefined} className={dayClasses}>
                                {d.day}
                                {hasEvent && <span aria-hidden="true" className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-on-accent' : 'bg-accent'}`}></span>}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Calendar;