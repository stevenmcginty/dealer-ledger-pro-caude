
import React from 'react';
import { useAdmin } from '../../contexts/AdminContext';
import { signOut } from '../../services/firebase';
import {
    ChartPieIcon,
    BuildingStorefrontIcon,
    CreditCardIcon,
    Cog6ToothIcon,
    ArrowLeftOnRectangleIcon,
    TagIcon,
    ShieldCheckIcon
} from '../../components/icons';
import { AdminView } from '../../types';

interface NavItemProps {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    view: AdminView;
    isActive: boolean;
    onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ label, icon: Icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
            isActive
                ? 'bg-brand-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
    >
        <Icon className="w-5 h-5" />
        {label}
    </button>
);

const AdminNav: React.FC = () => {
    const { view, setView, adminProfile, businesses, plans, features } = useAdmin();

    const handleLogout = async () => {
        await signOut();
        window.location.href = '/';
    };

    const navItems: { label: string; icon: React.ComponentType<{ className?: string }>; view: AdminView; badge?: number }[] = [
        { label: 'Dashboard', icon: ChartPieIcon, view: 'dashboard' },
        { label: 'Businesses', icon: BuildingStorefrontIcon, view: 'businesses', badge: businesses.length },
        { label: 'Plans', icon: CreditCardIcon, view: 'plans', badge: plans.length },
        { label: 'Features', icon: TagIcon, view: 'features', badge: features.length },
    ];

    return (
        <nav className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-gray-800">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center">
                        <ShieldCheckIcon className="w-6 h-6 text-brand-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-white">Admin Panel</h1>
                        <p className="text-xs text-gray-500">Dealer Ledger Pro</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {navItems.map((item) => (
                    <div key={item.view} className="relative">
                        <NavItem
                            label={item.label}
                            icon={item.icon}
                            view={item.view}
                            isActive={view === item.view || (item.view === 'businesses' && view === 'business-detail')}
                            onClick={() => setView(item.view)}
                        />
                        {item.badge !== undefined && item.badge > 0 && (
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-medium bg-gray-700 text-gray-300 rounded-full">
                                {item.badge}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* User & Logout */}
            <div className="p-4 border-t border-gray-800 space-y-3">
                {adminProfile && (
                    <div className="px-4 py-2 rounded-lg bg-gray-800/50">
                        <p className="text-sm font-medium text-white truncate">{adminProfile.email}</p>
                        <p className="text-xs text-gray-500 capitalize">{adminProfile.role?.replace('_', ' ') || 'Super Admin'}</p>
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
                >
                    <ArrowLeftOnRectangleIcon className="w-5 h-5" />
                    Sign Out
                </button>
            </div>
        </nav>
    );
};

export default AdminNav;
