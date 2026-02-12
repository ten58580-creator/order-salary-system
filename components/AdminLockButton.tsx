'use client';

import { useAdminGuard } from '@/components/AdminGuardContext';
import { Lock } from 'lucide-react';

export default function AdminLockButton() {
    const { isUnlocked, lock, authMode } = useAdminGuard();

    if (!isUnlocked) return null;

    // Optional: Hide if authMode is 'auth' and we don't want to show "Lock" (which means logout)
    // But user requested "In Admin Mode... show lock button".
    // If I logged in via password, I am definitely in Admin Mode.
    // So I should show it.

    return (
        <button
            onClick={lock}
            className="flex items-center bg-red-600 text-white px-5 py-2.5 rounded-full text-sm font-black hover:bg-red-700 transition shadow-md border-2 border-red-500 ring-2 ring-transparent hover:ring-red-200"
            title={authMode === 'auth' ? "ログアウト" : "管理者モードを終了 (ロック)"}
        >
            <Lock size={16} className="mr-1.5" />
            {authMode === 'auth' ? 'ログアウト' : 'ロック'}
        </button>
    );
}
