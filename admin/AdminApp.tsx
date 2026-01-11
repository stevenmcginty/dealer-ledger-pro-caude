
import React, { useEffect } from 'react';
import { AdminProvider, useAdmin } from '../contexts/AdminContext';
import AdminLoginPage from './AdminLoginPage';
import AdminDashboard from './AdminDashboard';
import BusinessList from './BusinessList';
import BusinessDetail from './BusinessDetail';
import PlanManagement from './PlanManagement';
import FeatureManagement from './FeatureManagement';
import AdminNav from './components/AdminNav';
import Spinner from '../components/common/Spinner';

const AdminContent: React.FC = () => {
    const {
        isLoading,
        isAdmin,
        authError,
        user,
        view,
        seedDefaultData
    } = useAdmin();

    // Seed default data on first load if admin
    useEffect(() => {
        if (isAdmin) {
            seedDefaultData();
        }
    }, [isAdmin, seedDefaultData]);

    // Loading state
    if (isLoading) {
        return (
            <div className="bg-gray-950 flex items-center justify-center h-screen">
                <div className="text-center">
                    <Spinner className="h-10 w-10 text-brand-500 mx-auto" />
                    <p className="mt-4 text-gray-400">Verifying admin access...</p>
                </div>
            </div>
        );
    }

    // Not logged in or not admin
    if (!user || !isAdmin) {
        return <AdminLoginPage error={authError} />;
    }

    // Render admin panel
    const renderView = () => {
        switch (view) {
            case 'dashboard':
                return <AdminDashboard />;
            case 'businesses':
                return <BusinessList />;
            case 'business-detail':
                return <BusinessDetail />;
            case 'plans':
                return <PlanManagement />;
            case 'features':
                return <FeatureManagement />;
            default:
                return <AdminDashboard />;
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
            <AdminNav />
            <main className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-7xl mx-auto">
                        {renderView()}
                    </div>
                </div>
            </main>
        </div>
    );
};

const AdminApp: React.FC = () => {
    return (
        <AdminProvider>
            <AdminContent />
        </AdminProvider>
    );
};

export default AdminApp;
