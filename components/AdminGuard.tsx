'use client';

import React, { useState } from 'react';
import { useAdminGuard } from '@/components/AdminGuardContext';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AdminPinModal from '@/components/AdminPinModal';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const { isUnlocked } = useAdminGuard();
    const router = useRouter();

    // State to toggle between "PIN Input Modal" and "Just Dimmed Locked Screen"
    const [showPinInput, setShowPinInput] = useState(false);

    const handleDismissInput = () => {
        // User requested: "When X is pressed ... return to Dashboard top screen"
        router.push('/');
    };

    const handleShowInput = () => {
        setShowPinInput(true);
    };

    return (
        <div className="relative min-h-screen">
            <div className={`transition-all duration-300 ${!isUnlocked ? 'filter blur-md pointer-events-none select-none opacity-30 h-screen overflow-hidden' : ''}`}>
                {children}
            </div>

            {!isUnlocked && (
                <>
                    {/* Dimmed Overlay with Lock Icon */}
                    {!showPinInput && (
                        <div className="fixed inset-0 z-40 bg-slate-900/30 flex items-center justify-center cursor-pointer backdrop-blur-sm" onClick={handleShowInput}>
                            <div className="flex flex-col items-center justify-center group">
                                <div className="bg-slate-900/80 p-8 rounded-full shadow-2xl backdrop-blur-md group-hover:scale-110 transition-transform duration-300">
                                    <Lock size={64} className="text-white" />
                                </div>
                                <div className="mt-4 bg-slate-900/80 text-white px-6 py-2 rounded-full font-bold shadow-lg backdrop-blur-md">
                                    タップしてロック解除
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PIN Modal */}
                    {showPinInput && (
                        <AdminPinModal onClose={handleDismissInput} />
                    )}
                </>
            )}
        </div>
    );
}
