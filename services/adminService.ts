
import { db, auth } from './firebase';
import {
    SubscriptionPlan, Feature, BusinessSubscription, BusinessFeatureOverride,
    AdminBusinessRecord, SuperAdmin, AdminActivityLog, AdminPermission
} from '../types';
import { CONFIG } from '../config';

// --- Admin Roots ---
const ADMIN_ROOT = 'admin';
const adminRef = (path: string) => `${ADMIN_ROOT}/${path}`;

// --- Super Admin Verification ---

export const isSuperAdmin = async (uid: string): Promise<boolean> => {
    // Check against config first (fallback)
    if (CONFIG.ADMIN_UIDS.includes(uid)) {
        return true;
    }
    // Check database
    const snapshot = await db.ref(adminRef(`superAdmins/${uid}`)).once('value');
    return snapshot.exists();
};

export const getSuperAdminProfile = async (uid: string): Promise<SuperAdmin | null> => {
    const snapshot = await db.ref(adminRef(`superAdmins/${uid}`)).once('value');
    if (!snapshot.exists()) return null;
    return { uid, ...snapshot.val() } as SuperAdmin;
};

export const updateSuperAdminLastLogin = async (uid: string): Promise<void> => {
    await db.ref(adminRef(`superAdmins/${uid}`)).update({
        lastLoginAt: Date.now()
    });
};

// --- Super Admin CRUD ---

export const getAllSuperAdmins = async (): Promise<SuperAdmin[]> => {
    const snapshot = await db.ref(adminRef('superAdmins')).once('value');
    if (!snapshot.exists()) return [];
    const data = snapshot.val();
    return Object.entries(data).map(([uid, val]: [string, any]) => ({
        uid,
        ...val
    })) as SuperAdmin[];
};

export const createSuperAdmin = async (data: Omit<SuperAdmin, 'createdAt' | 'lastLoginAt'>): Promise<void> => {
    await db.ref(adminRef(`superAdmins/${data.uid}`)).set({
        email: data.email,
        role: data.role,
        permissions: data.permissions,
        createdAt: Date.now(),
        lastLoginAt: 0
    });
};

export const updateSuperAdmin = async (uid: string, data: Partial<SuperAdmin>): Promise<void> => {
    const { uid: _, ...updateData } = data as any;
    await db.ref(adminRef(`superAdmins/${uid}`)).update(updateData);
};

export const deleteSuperAdmin = async (uid: string): Promise<void> => {
    await db.ref(adminRef(`superAdmins/${uid}`)).remove();
};

// --- Business Management ---

export const getAllBusinesses = async (): Promise<AdminBusinessRecord[]> => {
    const companiesSnapshot = await db.ref('companies').once('value');
    if (!companiesSnapshot.exists()) return [];

    const companies = companiesSnapshot.val();
    const businesses: AdminBusinessRecord[] = [];

    for (const [companyId, companyData] of Object.entries(companies) as [string, any][]) {
        const meta = companyData.meta || {};
        const businessDetails = companyData.businessDetails || {};
        const subscription = companyData.subscription || null;
        const featureOverrides = companyData.featureOverrides
            ? Object.values(companyData.featureOverrides) as BusinessFeatureOverride[]
            : [];
        const users = companyData.users ? Object.keys(companyData.users).length : 1;

        // Handle legacy data structures - try multiple possible field locations
        const businessName =
            businessDetails.name ||
            businessDetails.businessName ||
            companyData.name ||
            companyData.businessName ||
            meta.name ||
            meta.businessName ||
            'Unnamed Business';

        const ownerEmail =
            meta.ownerEmail ||
            meta.email ||
            businessDetails.email ||
            companyData.email ||
            '';

        const ownerUid = meta.ownerUid || meta.uid || companyId;
        const createdAt = meta.createdAt || companyData.createdAt || 0;

        businesses.push({
            id: companyId,
            ownerUid,
            ownerEmail,
            businessName,
            createdAt,
            provisionedBy: meta.provisionedBy || '',
            subscription: subscription ? { id: companyId, businessId: companyId, ...subscription } : undefined,
            featureOverrides,
            lastActivityAt: meta.lastActivityAt,
            userCount: users
        });
    }

    return businesses.sort((a, b) => b.createdAt - a.createdAt);
};

export const getBusinessById = async (companyId: string): Promise<AdminBusinessRecord | null> => {
    const snapshot = await db.ref(`companies/${companyId}`).once('value');
    if (!snapshot.exists()) return null;

    const companyData = snapshot.val();
    const meta = companyData.meta || {};
    const businessDetails = companyData.businessDetails || {};
    const subscription = companyData.subscription || null;
    const featureOverrides = companyData.featureOverrides
        ? Object.values(companyData.featureOverrides) as BusinessFeatureOverride[]
        : [];
    const users = companyData.users ? Object.keys(companyData.users).length : 1;

    return {
        id: companyId,
        ownerUid: meta.ownerUid || companyId,
        ownerEmail: meta.ownerEmail || '',
        businessName: businessDetails.name || 'Unnamed Business',
        createdAt: meta.createdAt || 0,
        provisionedBy: meta.provisionedBy || '',
        subscription: subscription ? { id: companyId, businessId: companyId, ...subscription } : undefined,
        featureOverrides,
        lastActivityAt: meta.lastActivityAt,
        userCount: users
    };
};

export const updateBusinessMeta = async (companyId: string, data: Partial<{ ownerEmail: string; lastActivityAt: number }>): Promise<void> => {
    await db.ref(`companies/${companyId}/meta`).update(data);
};

export const testFirebaseConnectivity = async (companyId: string, type: 'read' | 'write' = 'read'): Promise<{ success: boolean; message: string }> => {
    try {
        if (type === 'read') {
            // Test read
            const snapshot = await db.ref(`companies/${companyId}/meta`).once('value');
            if (!snapshot.exists()) {
                return { success: false, message: 'Company data not found - path may not exist' };
            }
            return { success: true, message: 'Read access confirmed - data retrieved successfully' };
        } else {
            // Test write (timestamp update)
            await db.ref(`companies/${companyId}/meta`).update({
                lastConnectivityTest: Date.now()
            });
            return { success: true, message: 'Write access confirmed - timestamp updated successfully' };
        }
    } catch (error: any) {
        return { success: false, message: error.message || `${type} operation failed` };
    }
};

// --- Subscription Management ---

export const getBusinessSubscription = async (companyId: string): Promise<BusinessSubscription | null> => {
    const snapshot = await db.ref(`companies/${companyId}/subscription`).once('value');
    if (!snapshot.exists()) return null;
    return { id: companyId, businessId: companyId, ...snapshot.val() } as BusinessSubscription;
};

export const updateBusinessSubscription = async (companyId: string, data: Partial<BusinessSubscription>): Promise<void> => {
    const { id, businessId, ...updateData } = data as any;
    await db.ref(`companies/${companyId}/subscription`).update({
        ...updateData,
        updatedAt: Date.now()
    });
};

export const createBusinessSubscription = async (companyId: string, data: Omit<BusinessSubscription, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>): Promise<void> => {
    await db.ref(`companies/${companyId}/subscription`).set({
        ...data,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
};

export const deleteBusinessSubscription = async (companyId: string): Promise<void> => {
    await db.ref(`companies/${companyId}/subscription`).remove();
};

export const assignPlanToBusiness = async (companyId: string, planId: string, billingCycle: 'monthly' | 'yearly'): Promise<void> => {
    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    await db.ref(`companies/${companyId}/subscription`).set({
        planId,
        status: 'active',
        billingCycle,
        currentPeriodStart: now.toISOString().split('T')[0],
        currentPeriodEnd: periodEnd.toISOString().split('T')[0],
        cancelAtPeriodEnd: false,
        stripeCustomerId: '',
        stripeSubscriptionId: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
};

// --- Feature Override Management ---

export const getBusinessFeatureOverrides = async (companyId: string): Promise<BusinessFeatureOverride[]> => {
    const snapshot = await db.ref(`companies/${companyId}/featureOverrides`).once('value');
    if (!snapshot.exists()) return [];
    return Object.values(snapshot.val()) as BusinessFeatureOverride[];
};

export const setBusinessFeatureOverride = async (
    companyId: string,
    featureId: string,
    enabled: boolean,
    expiresAt?: string
): Promise<void> => {
    await db.ref(`companies/${companyId}/featureOverrides/${featureId}`).set({
        featureId,
        enabled,
        expiresAt: expiresAt || null
    });
};

export const removeBusinessFeatureOverride = async (companyId: string, featureId: string): Promise<void> => {
    await db.ref(`companies/${companyId}/featureOverrides/${featureId}`).remove();
};

// --- Plan Management ---

export const subscribeToPlans = (callback: (plans: SubscriptionPlan[]) => void): (() => void) => {
    const ref = db.ref(adminRef('plans'));
    const listener = ref.on('value', snapshot => {
        if (!snapshot.exists()) {
            callback([]);
            return;
        }
        const data = snapshot.val();
        const plans = Object.entries(data).map(([id, val]: [string, any]) => ({
            id,
            ...val
        })) as SubscriptionPlan[];
        callback(plans.sort((a, b) => a.displayOrder - b.displayOrder));
    });
    return () => ref.off('value', listener);
};

export const getAllPlans = async (): Promise<SubscriptionPlan[]> => {
    const snapshot = await db.ref(adminRef('plans')).once('value');
    if (!snapshot.exists()) return [];
    const data = snapshot.val();
    return Object.entries(data)
        .map(([id, val]: [string, any]) => ({ id, ...val }))
        .sort((a, b) => a.displayOrder - b.displayOrder) as SubscriptionPlan[];
};

export const getPlanById = async (planId: string): Promise<SubscriptionPlan | null> => {
    const snapshot = await db.ref(adminRef(`plans/${planId}`)).once('value');
    if (!snapshot.exists()) return null;
    return { id: planId, ...snapshot.val() } as SubscriptionPlan;
};

export const createPlan = async (data: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const ref = db.ref(adminRef('plans')).push();
    const id = ref.key!;
    await ref.set({
        ...data,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    return id;
};

export const updatePlan = async (planId: string, data: Partial<SubscriptionPlan>): Promise<void> => {
    const { id, ...updateData } = data as any;
    await db.ref(adminRef(`plans/${planId}`)).update({
        ...updateData,
        updatedAt: Date.now()
    });
};

export const deletePlan = async (planId: string): Promise<void> => {
    await db.ref(adminRef(`plans/${planId}`)).remove();
};

// --- Feature Management ---

export const subscribeToFeatures = (callback: (features: Feature[]) => void): (() => void) => {
    const ref = db.ref(adminRef('features'));
    const listener = ref.on('value', snapshot => {
        if (!snapshot.exists()) {
            callback([]);
            return;
        }
        const data = snapshot.val();
        const features = Object.entries(data).map(([id, val]: [string, any]) => ({
            id,
            ...val
        })) as Feature[];
        callback(features);
    });
    return () => ref.off('value', listener);
};

export const getAllFeatures = async (): Promise<Feature[]> => {
    const snapshot = await db.ref(adminRef('features')).once('value');
    if (!snapshot.exists()) return [];
    const data = snapshot.val();
    return Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) as Feature[];
};

export const getFeatureById = async (featureId: string): Promise<Feature | null> => {
    const snapshot = await db.ref(adminRef(`features/${featureId}`)).once('value');
    if (!snapshot.exists()) return null;
    return { id: featureId, ...snapshot.val() } as Feature;
};

export const createFeature = async (data: Omit<Feature, 'id' | 'createdAt'>): Promise<string> => {
    const ref = db.ref(adminRef('features')).push();
    const id = ref.key!;
    await ref.set({
        ...data,
        createdAt: Date.now()
    });
    return id;
};

export const updateFeature = async (featureId: string, data: Partial<Feature>): Promise<void> => {
    const { id, ...updateData } = data as any;
    await db.ref(adminRef(`features/${featureId}`)).update(updateData);
};

export const deleteFeature = async (featureId: string): Promise<void> => {
    await db.ref(adminRef(`features/${featureId}`)).remove();
};

// --- Activity Logging ---

export const logAdminActivity = async (
    adminUid: string,
    action: string,
    targetType: AdminActivityLog['targetType'],
    targetId: string,
    details?: any
): Promise<void> => {
    const ref = db.ref(adminRef('activityLog')).push();
    await ref.set({
        adminUid,
        action,
        targetType,
        targetId,
        details: details || null,
        timestamp: Date.now()
    });
};

export const getAdminActivityLog = async (limit: number = 100): Promise<AdminActivityLog[]> => {
    const snapshot = await db.ref(adminRef('activityLog'))
        .orderByChild('timestamp')
        .limitToLast(limit)
        .once('value');

    if (!snapshot.exists()) return [];
    const data = snapshot.val();
    return Object.entries(data)
        .map(([id, val]: [string, any]) => ({ id, ...val }))
        .sort((a, b) => b.timestamp - a.timestamp) as AdminActivityLog[];
};

// --- Seed Default Data ---

export const seedDefaultPlans = async (): Promise<void> => {
    const existingPlans = await getAllPlans();
    if (existingPlans.length > 0) return; // Already seeded

    const defaultPlans = [
        {
            name: 'Basic',
            slug: 'basic',
            description: 'Essential features for small dealerships',
            priceMonthly: 2999,
            priceYearly: 29900,
            stripePriceIdMonthly: '',
            stripePriceIdYearly: '',
            featureIds: [],
            maxUsers: 2,
            storageLimitMB: 500,
            isActive: true,
            displayOrder: 1
        },
        {
            name: 'Pro',
            slug: 'pro',
            description: 'Advanced features including CRM',
            priceMonthly: 5999,
            priceYearly: 59900,
            stripePriceIdMonthly: '',
            stripePriceIdYearly: '',
            featureIds: [],
            maxUsers: 5,
            storageLimitMB: 2048,
            isActive: true,
            displayOrder: 2
        },
        {
            name: 'Enterprise',
            slug: 'enterprise',
            description: 'Full platform access for large operations',
            priceMonthly: 9999,
            priceYearly: 99900,
            stripePriceIdMonthly: '',
            stripePriceIdYearly: '',
            featureIds: [],
            maxUsers: -1,
            storageLimitMB: 10240,
            isActive: true,
            displayOrder: 3
        }
    ];

    for (const plan of defaultPlans) {
        await createPlan(plan);
    }
};

export const seedDefaultFeatures = async (): Promise<void> => {
    const existingFeatures = await getAllFeatures();
    if (existingFeatures.length > 0) return; // Already seeded

    const defaultFeatures = [
        { key: 'crm_pipeline', name: 'Sales Pipeline', description: 'Kanban-style lead pipeline', category: 'crm' as const, isActive: true },
        { key: 'crm_inbox', name: 'Email Inbox', description: 'Unified inbox for lead emails', category: 'crm' as const, isActive: true },
        { key: 'crm_leads', name: 'Lead Management', description: 'Full lead tracking and history', category: 'crm' as const, isActive: true },
        { key: 'ai_assistant', name: 'AI Assistant', description: 'Gemini-powered AI helper', category: 'advanced' as const, isActive: true },
        { key: 'advanced_reporting', name: 'Advanced Reports', description: 'Custom report builder', category: 'reporting' as const, isActive: true },
        { key: 'integrations_twilio', name: 'Twilio Integration', description: 'SMS and voice calling', category: 'integrations' as const, isActive: true },
        { key: 'integrations_whatsapp', name: 'WhatsApp Integration', description: 'WhatsApp Business messaging', category: 'integrations' as const, isActive: true }
    ];

    for (const feature of defaultFeatures) {
        await createFeature(feature);
    }
};

// Initialize super admin from config if not exists
export const initializeSuperAdminFromConfig = async (): Promise<void> => {
    const adminUid = CONFIG.ADMIN_UID;
    const adminEmail = CONFIG.ADMIN_EMAIL;

    if (!adminUid || !adminEmail) return;

    const existing = await getSuperAdminProfile(adminUid);
    if (existing) return;

    await createSuperAdmin({
        uid: adminUid,
        email: adminEmail,
        role: 'super_admin',
        permissions: [
            'manage_businesses',
            'manage_subscriptions',
            'manage_features',
            'manage_plans',
            'manage_admins',
            'view_analytics',
            'impersonate_user'
        ]
    });
};
