'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { usePathname, useRouter } from 'next/navigation';

type AuthMode = 'pin' | 'auth' | 'none';

interface AdminGuardContextType {
    isUnlocked: boolean;
    authMode: AuthMode;
    unlock: (pin: string) => Promise<boolean>;
    lock: () => void;
    lastActivity: number;
}

const AdminGuardContext = createContext<AdminGuardContextType | undefined>(undefined);

export function AdminGuardProvider({ children }: { children: React.ReactNode }) {
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [authMode, setAuthMode] = useState<AuthMode>('none');
    const [lastActivity, setLastActivity] = useState(Date.now());
    const pathname = usePathname();
    const router = useRouter();

    // Configuration
    const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

    // 1. Initial Auth Check (Supabase Auth)
    // If logged in via /login (Supabase Auth), we unlock permanently for this session
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setIsUnlocked(true);
                setAuthMode('auth');
            }
        };
        checkAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                setIsUnlocked(true);
                setAuthMode('auth');
            } else {
                // If logged out, reset everything
                setIsUnlocked(false);
                setAuthMode('none');
                setLastActivity(Date.now());
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // 2. Activity Listener (Only if authMode === 'pin' and isUnlocked)
    useEffect(() => {
        if (!isUnlocked || authMode !== 'pin') return;

        const updateActivity = () => {
            setLastActivity(Date.now());
        };

        window.addEventListener('mousemove', updateActivity);
        window.addEventListener('keydown', updateActivity);
        window.addEventListener('click', updateActivity);
        window.addEventListener('scroll', updateActivity);
        window.addEventListener('touchstart', updateActivity);

        return () => {
            window.removeEventListener('mousemove', updateActivity);
            window.removeEventListener('keydown', updateActivity);
            window.removeEventListener('click', updateActivity);
            window.removeEventListener('scroll', updateActivity);
            window.removeEventListener('touchstart', updateActivity);
        };
    }, [isUnlocked, authMode]);

    // 3. Auto-Lock Interval
    useEffect(() => {
        if (!isUnlocked || authMode !== 'pin') return;

        const interval = setInterval(() => {
            const now = Date.now();
            if (now - lastActivity > TIMEOUT_MS) {
                console.log('Auto-locking due to inactivity');
                lock();
            }
        }, 10000); // Check every 10 seconds

        return () => clearInterval(interval);
    }, [isUnlocked, authMode, lastActivity]);

    // 4. Force lock on route change? 
    // User requirement: "Strict initial state (Reload ... must start locked)".
    // Handled by in-memory state (reset on reload).
    // User requirement: "Open a new tab ... must start locked".
    // Handled by in-memory state.
    // User requirement: "End Admin Mode button returns to locked state".

    // Unlock Function
    const unlock = async (pin: string): Promise<boolean> => {
        try {
            // Using v2 to avoid 404 cache issues
            const { data, error } = await supabase.rpc('verify_admin_pin_v2', { pin_code: pin });
            if (error) throw error;

            if (data === true) {
                setIsUnlocked(true);
                setAuthMode('pin');
                setLastActivity(Date.now());
                return true;
            }
            return false;
        } catch (err) {
            console.error('PIN Verification Error:', JSON.stringify(err, null, 2));
            console.error(err);
            return false;
        }
    };

    // Lock Function
    const lock = () => {
        if (authMode === 'auth') {
            // If logged in via Supabase Auth, "Lock" might mean signing out?
            // User request: "Using /admin/login ... start with all locks cleared"
            // "Manual lock button ... return to state requiring PIN".
            // If they are logged in via /login, maybe we don't allow manual lock, or manual lock signs them out?
            // "If not logged in via /login... must start locked".
            // Implies mixed usage.
            // Let's assume Manual Lock for Auth users just signs them out?
            // Or maybe just sets isUnlocked=false locally (authMode stays 'auth' but locked?). 
            // "Strict Initial State... unless logged in via /login".
            // If I am logged in via /login, and I press Lock, what happens?
            // Let's implement lock() as setting isUnlocked=false regardless of mode.
            // BUT, the useEffect(checkAuth) will immediately unlock it again on reload if we are not careful?
            // Actually, if we set isUnlocked=false, the user is still authenticated in Supabase.
            // If they reload, checkAuth runs -> session exists -> unlocks.
            // So for 'auth' mode, 'lock' effectively means 'logout'.
            supabase.auth.signOut().then(() => {
                setIsUnlocked(false);
                setAuthMode('none');
                router.push('/login');
            });
        } else {
            setIsUnlocked(false);
            setAuthMode('none');
            router.push('/admin');
        }
    };

    // Special Lock for PIN mode (Manual Button)
    // If we are in 'auth' mode, we might want to just hide the lock button?
    // "In Admin Mode ... show lock button".
    // If I am super admin (auth), do I need a lock button? Probably yes, to leave the desk.
    // Use the logic above: if auth, logout. If pin, just lock.

    return (
        <AdminGuardContext.Provider value={{ isUnlocked, authMode, unlock, lock, lastActivity }}>
            {children}
        </AdminGuardContext.Provider>
    );
}

export function useAdminGuard() {
    const context = useContext(AdminGuardContext);
    if (context === undefined) {
        throw new Error('useAdminGuard must be used within an AdminGuardProvider');
    }
    return context;
}
