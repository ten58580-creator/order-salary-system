'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAdminGuard } from '@/components/AdminGuardContext';
import { Lock, ArrowRight, X } from 'lucide-react';

interface AdminPinModalProps {
    onClose: () => void;
    onSuccess?: () => void;
}

export default function AdminPinModal({ onClose, onSuccess }: AdminPinModalProps) {
    const { unlock } = useAdminGuard();
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Auto-focus input
        if (inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, []);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const success = await unlock(pin);
        if (success) {
            setPin('');
            if (onSuccess) onSuccess();
        } else {
            setError('PINコードが正しくありません');
            setPin('');
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-all duration-300"
                onClick={onClose}
            />

            <div
                className="bg-white p-8 rounded-2xl shadow-2xl border border-slate-100 text-center relative animate-in fade-in zoom-in duration-200 w-full max-w-md z-10"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition"
                    title="閉じる"
                >
                    <X size={24} />
                </button>

                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-500">
                    <Lock size={32} />
                </div>

                <h2 className="text-2xl font-black text-slate-900 mb-2">管理者ロック</h2>
                <p className="text-slate-500 font-bold mb-8">
                    操作を行うにはPINコードを入力してください
                </p>

                <form onSubmit={handleUnlock} className="space-y-4">
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type="password"
                            inputMode="numeric"
                            pattern="\d*"
                            maxLength={8}
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            className="w-full text-center text-3xl font-mono font-black tracking-widest py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition text-slate-900 placeholder:text-slate-200"
                            placeholder="****"
                            autoComplete="off"
                        />
                    </div>

                    {error && (
                        <div className="text-red-500 font-bold text-sm bg-red-50 py-2 rounded-lg animate-pulse border border-red-100">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || pin.length < 4}
                        className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
                    >
                        {loading ? '確認中...' : (
                            <>
                                解除
                                <ArrowRight size={18} className="ml-2" />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
