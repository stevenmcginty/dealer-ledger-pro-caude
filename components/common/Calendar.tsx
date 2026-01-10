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
        <div className="text-white">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{monthName} {year}</h3>
                <div className="flex items-center gap-2">
                    <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-gray-700"><ChevronLeftIcon className="h-5 w-5" /></button>
                    <button onClick={() => setCurrentDate(new Date())} className="text-sm px-3 py-1 rounded-md hover:bg-gray-700">Today</button>
                    <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-gray-700"><ChevronRightIcon className="h-5 w-5" /></button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-2">
                <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((d, index) => {
                    if (!d.isCurrentMonth) {
                        return <div key={`pad-${index}`} className="p-2 rounded-lg"></div>;
                    }
                    
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d.day);
                    const dateStr = toYYYYMMDD(date);
                    
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const hasEvent = eventSet.has(dateStr);
                    
                    let dayClasses = "relative w-full h-10 flex items-center justify-center rounded-lg cursor-pointer transition-colors text-sm ";
                    if (isSelected) {
                        dayClasses += "bg-brand-600 text-white font-bold";
                    } else if (isToday && hasEvent) {
                        dayClasses += "bg-yellow-600 text-white font-semibold";
                    } else if (isToday) {
                        dayClasses += "bg-gray-600 text-white";
                    } else {
                        dayClasses += "hover:bg-gray-700";
                    }

                    return (
                        <div key={dateStr} className="flex justify-center items-center">
                            <button onClick={() => onDateSelect(dateStr)} className={dayClasses}>
                                {d.day}
                                {hasEvent && <span className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-brand-400"></span>}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Calendar;