import React, { useState, useRef, useEffect } from 'react';
import { Notification } from '../../types';
import { BellIcon } from '../icons';

interface NotificationBellProps {
    notifications: Notification[];
}

const NotificationBell = ({ notifications }: NotificationBellProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const count = notifications.length;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700"
            >
                <span className="sr-only">View notifications</span>
                <BellIcon className="h-6 w-6" />
                {count > 0 && (
                    <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-gray-900" />
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-md bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-20">
                    <div className="py-1">
                        <div className="px-4 py-2 text-sm font-semibold text-white border-b border-gray-700">
                            Notifications
                        </div>
                        <ul className="max-h-96 overflow-y-auto">
                            {count > 0 ? (
                                notifications.map(notif => (
                                    <li key={notif.id} className="px-4 py-3 text-sm text-gray-300 hover:bg-gray-700">
                                        <p>{notif.message}</p>
                                    </li>
                                ))
                            ) : (
                                <li className="px-4 py-3 text-sm text-center text-gray-400">
                                    No new notifications
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;