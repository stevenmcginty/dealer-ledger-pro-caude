
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, type User } from '../services/firebase';
import {
    SubscriptionPlan, Feature, AdminBusinessRecord, SuperAdmin, AdminActivityLog, AdminView
} from '../types';
import * as adminService from '../services/adminService';

interface AdminContextState {
    // Auth
    user: User | null;
    adminProfile: SuperAdmin | null;
    isAdmin: boolean;
    isLoading: boolean;
    authError: string | null;

    // Data
    businesses: AdminBusinessRecord[];
    plans: SubscriptionPlan[];
    features: Feature[];
    activityLog: AdminActivityLog[];
    selectedBusinessId: string | null;
    selectedBusiness: AdminBusinessRecord | null;

    // UI State
    view: AdminView;
    isDataLoading: boolean;
}

interface AdminContextActions {
    // Navigation
    setView: (view: AdminView) => void;
    selectBusiness: (businessId: string | null) => void;

    // Business actions
    refreshBusinesses: () => Promise<void>;
    getBusinessById: (id: string) => Promise<AdminBusinessRecord | null>;
    testBusinessConnectivity: (id: string, type?: 'read' | 'write') => Promise<{ success: boolean; message: string }>;
    updateBusinessSubscription: (businessId: string, data: Partial<any>) => Promise<void>;
    setBusinessFeatureOverride: (businessId: string, featureId: string, enabled: boolean, expiresAt?: string) => Promise<void>;
    removeBusinessFeatureOverride: (businessId: string, featureId: string) => Promise<void>;
    assignPlanToBusiness: (businessId: string, planId: string, billingCycle: 'monthly' | 'yearly') => Promise<void>;

    // Plan actions
    createPlan: (data: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
    updatePlan: (id: string, data: Partial<SubscriptionPlan>) => Promise<void>;
    deletePlan: (id: string) => Promise<void>;

    // Feature actions
    createFeature: (data: Omit<Feature, 'id' | 'createdAt'>) => Promise<string>;
    updateFeature: (id: string, data: Partial<Feature>) => Promise<void>;
    deleteFeature: (id: string) => Promise<void>;

    // Activity Log
    refreshActivityLog: () => Promise<void>;
    logActivity: (action: string, targetType: AdminActivityLog['targetType'], targetId: string, details?: any) => Promise<void>;

    // Seed data
    seedDefaultData: () => Promise<void>;
}

type AdminContextType = AdminContextState & AdminContextActions;

const AdminContext = createContext<AdminContextType | null>(null);

export const useAdmin = (): AdminContextType => {
    const context = useContext(AdminContext);
    if (!context) {
        throw new Error('useAdmin must be used within an AdminProvider');
    }
    return context;
};

interface AdminProviderProps {
    children: ReactNode;
}

export const AdminProvider: React.FC<AdminProviderProps> = ({ children }) => {
    // Auth state
    const [user, setUser] = useState<User | null>(null);
    const [adminProfile, setAdminProfile] = useState<SuperAdmin | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    // Data state
    const [businesses, setBusinesses] = useState<AdminBusinessRecord[]>([]);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [features, setFeatures] = useState<Feature[]>([]);
    const [activityLog, setActivityLog] = useState<AdminActivityLog[]>([]);
    const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

    // UI state
    const [view, setView] = useState<AdminView>('dashboard');
    const [isDataLoading, setIsDataLoading] = useState(false);

    // Auth listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(async (authUser) => {
            setUser(authUser);

            if (authUser) {
                try {
                    const isSuperAdmin = await adminService.isSuperAdmin(authUser.uid);
                    setIsAdmin(isSuperAdmin);

                    if (isSuperAdmin) {
                        const profile = await adminService.getSuperAdminProfile(authUser.uid);
                        setAdminProfile(profile);
                        await adminService.updateSuperAdminLastLogin(authUser.uid);
                        setAuthError(null);
                    } else {
                        setAuthError('You do not have admin access');
                        setAdminProfile(null);
                    }
                } catch (error: any) {
                    setAuthError(error.message || 'Failed to verify admin status');
                    setIsAdmin(false);
                    setAdminProfile(null);
                }
            } else {
                setIsAdmin(false);
                setAdminProfile(null);
                setAuthError(null);
            }

            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Subscribe to plans and features when admin
    useEffect(() => {
        if (!isAdmin) return;

        const unsubPlans = adminService.subscribeToPlans(setPlans);
        const unsubFeatures = adminService.subscribeToFeatures(setFeatures);

        // Load initial data
        loadInitialData();

        return () => {
            unsubPlans();
            unsubFeatures();
        };
    }, [isAdmin]);

    const loadInitialData = async () => {
        setIsDataLoading(true);
        try {
            const [businessesData, activityData] = await Promise.all([
                adminService.getAllBusinesses(),
                adminService.getAdminActivityLog(50)
            ]);
            setBusinesses(businessesData);
            setActivityLog(activityData);
        } catch (error) {
            console.error('Failed to load admin data:', error);
        }
        setIsDataLoading(false);
    };

    // Actions
    const selectBusiness = useCallback((businessId: string | null) => {
        setSelectedBusinessId(businessId);
        if (businessId) {
            setView('business-detail');
        }
    }, []);

    const refreshBusinesses = useCallback(async () => {
        setIsDataLoading(true);
        const data = await adminService.getAllBusinesses();
        setBusinesses(data);
        setIsDataLoading(false);
    }, []);

    const getBusinessById = useCallback(async (id: string) => {
        return adminService.getBusinessById(id);
    }, []);

    const testBusinessConnectivity = useCallback(async (id: string, type: 'read' | 'write' = 'read') => {
        return adminService.testFirebaseConnectivity(id, type);
    }, []);

    const updateBusinessSubscription = useCallback(async (businessId: string, data: Partial<any>) => {
        await adminService.updateBusinessSubscription(businessId, data);
        if (user) {
            await adminService.logAdminActivity(user.uid, 'update_subscription', 'subscription', businessId, data);
        }
        await refreshBusinesses();
    }, [user, refreshBusinesses]);

    const setBusinessFeatureOverride = useCallback(async (businessId: string, featureId: string, enabled: boolean, expiresAt?: string) => {
        await adminService.setBusinessFeatureOverride(businessId, featureId, enabled, expiresAt);
        if (user) {
            await adminService.logAdminActivity(user.uid, 'set_feature_override', 'business', businessId, { featureId, enabled, expiresAt });
        }
        await refreshBusinesses();
    }, [user, refreshBusinesses]);

    const removeBusinessFeatureOverride = useCallback(async (businessId: string, featureId: string) => {
        await adminService.removeBusinessFeatureOverride(businessId, featureId);
        if (user) {
            await adminService.logAdminActivity(user.uid, 'remove_feature_override', 'business', businessId, { featureId });
        }
        await refreshBusinesses();
    }, [user, refreshBusinesses]);

    const assignPlanToBusiness = useCallback(async (businessId: string, planId: string, billingCycle: 'monthly' | 'yearly') => {
        await adminService.assignPlanToBusiness(businessId, planId, billingCycle);
        if (user) {
            await adminService.logAdminActivity(user.uid, 'assign_plan', 'subscription', businessId, { planId, billingCycle });
        }
        await refreshBusinesses();
    }, [user, refreshBusinesses]);

    // Plan actions
    const createPlan = useCallback(async (data: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>) => {
        const id = await adminService.createPlan(data);
        if (user) {
            await adminService.logAdminActivity(user.uid, 'create_plan', 'plan', id, { name: data.name });
        }
        return id;
    }, [user]);

    const updatePlan = useCallback(async (id: string, data: Partial<SubscriptionPlan>) => {
        await adminService.updatePlan(id, data);
        if (user) {
            await adminService.logAdminActivity(user.uid, 'update_plan', 'plan', id, data);
        }
    }, [user]);

    const deletePlan = useCallback(async (id: string) => {
        await adminService.deletePlan(id);
        if (user) {
            await adminService.logAdminActivity(user.uid, 'delete_plan', 'plan', id);
        }
    }, [user]);

    // Feature actions
    const createFeature = useCallback(async (data: Omit<Feature, 'id' | 'createdAt'>) => {
        const id = await adminService.createFeature(data);
        if (user) {
            await adminService.logAdminActivity(user.uid, 'create_feature', 'feature', id, { name: data.name });
        }
        return id;
    }, [user]);

    const updateFeature = useCallback(async (id: string, data: Partial<Feature>) => {
        await adminService.updateFeature(id, data);
        if (user) {
            await adminService.logAdminActivity(user.uid, 'update_feature', 'feature', id, data);
        }
    }, [user]);

    const deleteFeature = useCallback(async (id: string) => {
        await adminService.deleteFeature(id);
        if (user) {
            await adminService.logAdminActivity(user.uid, 'delete_feature', 'feature', id);
        }
    }, [user]);

    // Activity log
    const refreshActivityLog = useCallback(async () => {
        const data = await adminService.getAdminActivityLog(100);
        setActivityLog(data);
    }, []);

    const logActivity = useCallback(async (action: string, targetType: AdminActivityLog['targetType'], targetId: string, details?: any) => {
        if (!user) return;
        await adminService.logAdminActivity(user.uid, action, targetType, targetId, details);
        await refreshActivityLog();
    }, [user, refreshActivityLog]);

    // Seed data
    const seedDefaultData = useCallback(async () => {
        await adminService.seedDefaultPlans();
        await adminService.seedDefaultFeatures();
        await adminService.initializeSuperAdminFromConfig();
    }, []);

    // Computed values
    const selectedBusiness = selectedBusinessId
        ? businesses.find(b => b.id === selectedBusinessId) || null
        : null;

    const value: AdminContextType = {
        // State
        user,
        adminProfile,
        isAdmin,
        isLoading,
        authError,
        businesses,
        plans,
        features,
        activityLog,
        selectedBusinessId,
        selectedBusiness,
        view,
        isDataLoading,

        // Actions
        setView,
        selectBusiness,
        refreshBusinesses,
        getBusinessById,
        testBusinessConnectivity,
        updateBusinessSubscription,
        setBusinessFeatureOverride,
        removeBusinessFeatureOverride,
        assignPlanToBusiness,
        createPlan,
        updatePlan,
        deletePlan,
        createFeature,
        updateFeature,
        deleteFeature,
        refreshActivityLog,
        logActivity,
        seedDefaultData
    };

    return (
        <AdminContext.Provider value={value}>
            {children}
        </AdminContext.Provider>
    );
};

export default AdminContext;
