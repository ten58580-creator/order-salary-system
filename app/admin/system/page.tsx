'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/utils/supabaseClient';
import AdminGuard from '@/components/AdminGuard';
import { Settings, Save, Lock, ChevronLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useAdminGuard } from '@/components/AdminGuardContext';

export default function SystemSettingsPage() {
    return (
        <AdminGuard>
            <SystemSettingsContent />
        </AdminGuard>
    );
}

function SystemSettingsContent() {
    const { authMode } = useAdminGuard();
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleUpdatePin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        // Validation
        if (!/^\d{4,8}$/.test(newPin)) {
            setMessage({ type: 'error', text: '新しいPINコードは4〜8桁の数字で入力してください' });
            setLoading(false);
            return;
        }

        if (newPin !== confirmPin) {
            setMessage({ type: 'error', text: '確認用PINコードが一致しません' });
            setLoading(false);
            return;
        }

        try {
            // 1. Verify Current PIN (Security Check)
            // Even if unlocked, we require current PIN to change it (unless super admin?)
            // If logged in via Auth (authMode='auth'), maybe we skip current PIN check?
            // Or maybe we still require it if it exists?
            // Let's assume strict security: always require current PIN to change it, 
            // UNLESS authMode='auth' (Super Admin) - but actually `verify_admin_pin` works for everyone.
            // If I am super admin, I might not know the PIN?
            // Let's stick to standard flow: verify current PIN first.

            // However, if the user forgot the PIN, they can login via Supabase Auth (/login) to reset it?
            // If logged in via Auth, we can skip verification or require password?
            // For simplicity in this "Field Mode", let's require PIN verification if authMode='pin'.
            // If authMode='auth', we can skip verification or require it. 
            // Let's require it for now to be safe, or if authMode='auth', maybe allow reset without current PIN?
            // "System Settings" implies general settings, but currently only PIN.

            let bypassCurrentPin = false;

            if (authMode === 'auth') {
                // Option: Allow bypass if authenticated as admin
                // But for now let's keep it simple and require verification or implement a "Reset" flow later.
                // Actually, if I am logged in as Admin, I might want to reset the PIN without knowing it.
                // Let's allow bypass if authMode === 'auth'.
                bypassCurrentPin = true;
            }

            if (!bypassCurrentPin) {
                // Using v2 to avoid 404 cache issues
                const { data: isValid } = await supabase.rpc('verify_admin_pin_v2', { pin_code: currentPin });
                if (!isValid) {
                    setMessage({ type: 'error', text: '現在のPINコードが正しくありません' });
                    setLoading(false);
                    return;
                }
            }

            // 2. Update PIN
            // We need a server-side function to update it.
            // `update_admin_pin` RPC was created.
            // But it checks `auth.role()`.
            // If we are in 'pin' mode (anon), we are NOT authenticated as a Supabase user.
            // So `update_admin_pin` will fail with 'Not authenticated'.

            // This is a problem!
            // 'PIN Mode' is essentially 'Anonymous with a client-side secret'.
            // To update the PIN securely, we usually need a privileged context.
            // If the user is only "PIN authenticated", they are technically 'anon'.
            // We need a way to allow 'anon' to update ONLY IF they provide the old PIN.
            // But `update_admin_pin` logic currently requires `auth.role() != 'anon'`.

            // Options:
            // A. Relax `update_admin_pin` to allow anon IF strict verification is done inside the function.
            // B. Require "Real" Login to change PIN.

            // The prompt says: "Admin Settings ... add PIN config". "Access ... requires PIN".
            // It doesn't explicitly say "PIN Change requires Login".
            // But for security, allowing anon to change PIN (even with old PIN) is risky if rate limiting is missing.
            // However, typical "Kiosk" mode allows this.

            // Let's modify `update_admin_pin` or create `change_admin_pin_by_pin` RPC?
            // The existing `update_admin_pin` I wrote requires auth.
            // I should have anticipated this.
            // Use `verify_admin_pin` inside the update function?

            // Let's try to call `update_admin_pin` first. If it fails, we know why.
            // Actually, I can't easily change the RPC now without another migration.
            // Wait, I can send another migration / query.

            // Let's create a new RPC `change_admin_pin` that takes `current_pin` and `new_pin`.
            // It verifies `current_pin` matches stored hash, then updates.
            // This is safe even for anon.

            const { error: updateError } = await supabase.rpc('change_admin_pin', {
                current_pin: bypassCurrentPin ? 'OVERRIDE' : currentPin, // We need to handle this in SQL
                new_pin: newPin
            });

            // Wait, I haven't created `change_admin_pin` yet. I created `update_admin_pin`.
            // I need to create `change_admin_pin` in SQL.
            // Let's just create it via SQL query tool/migration now.

            if (updateError) throw updateError;

            setMessage({ type: 'success', text: 'PINコードを変更しました' });
            setCurrentPin('');
            setNewPin('');
            setConfirmPin('');

        } catch (err: any) {
            console.error('Update Error:', err);
            setMessage({ type: 'error', text: err.message || '更新に失敗しました' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="max-w-2xl mx-auto pb-20">
                <div className="mb-8">
                    <Link href="/admin" className="text-slate-500 hover:text-slate-900 font-bold flex items-center mb-4 transition w-fit">
                        <ChevronLeft size={20} className="mr-1" />
                        ダッシュボードに戻る
                    </Link>
                    <h1 className="text-3xl font-extrabold text-slate-950 flex items-center">
                        <Settings className="mr-3 text-slate-400" size={32} />
                        システム設定
                    </h1>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center">
                        <div className="bg-white p-2 rounded-lg shadow-sm mr-4">
                            <Lock className="text-blue-600" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900">管理者PINコード設定</h2>
                            <p className="text-sm text-slate-500 font-bold">管理画面のロック解除に使用するPINコードを変更します</p>
                        </div>
                    </div>

                    <div className="p-8">
                        {authMode === 'pin' && (
                            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start">
                                <AlertTriangle className="text-yellow-600 mr-3 flex-shrink-0" size={20} />
                                <p className="text-sm text-yellow-800 font-bold">
                                    セキュリティのため、変更には現在のPINコードが必要です。<br />
                                    PINコードを忘れた場合は、管理者アカウントでログインしてリセットしてください。
                                </p>
                            </div>
                        )}

                        <form onSubmit={handleUpdatePin} className="space-y-6">

                            {/* Current PIN (Only if PIN mode) */}
                            {authMode !== 'auth' && (
                                <div>
                                    <label className="block text-sm font-black text-slate-700 mb-2">現在のPINコード</label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        pattern="\d*"
                                        required
                                        value={currentPin}
                                        onChange={(e) => setCurrentPin(e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-lg font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none transition"
                                        placeholder="現在のPINを入力"
                                    />
                                </div>
                            )}

                            {/* Override Message for Auth Mode */}
                            {authMode === 'auth' && (
                                <div className="mb-4 text-sm text-green-600 font-bold flex items-center">
                                    <CheckCircle size={16} className="mr-2" />
                                    管理者権限でログイン中のため、現在のPIN入力は不要です
                                </div>
                            )}


                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-black text-slate-700 mb-2">新しいPINコード</label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        pattern="\d{4,8}"
                                        maxLength={8}
                                        required
                                        value={newPin}
                                        onChange={(e) => setNewPin(e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-lg font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none transition"
                                        placeholder="4〜8桁の数字"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-black text-slate-700 mb-2">新しいPINコード (確認)</label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        pattern="\d{4,8}"
                                        maxLength={8}
                                        required
                                        value={confirmPin}
                                        onChange={(e) => setConfirmPin(e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-lg font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none transition"
                                        placeholder="確認のため再入力"
                                    />
                                </div>
                            </div>

                            {message && (
                                <div className={`p-4 rounded-xl font-bold flex items-center ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                    {message.type === 'success' ? <CheckCircle size={20} className="mr-2" /> : <AlertTriangle size={20} className="mr-2" />}
                                    {message.text}
                                </div>
                            )}

                            <div className="pt-4 border-t border-slate-100 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="bg-slate-900 text-white font-bold py-3 px-8 rounded-xl shadow-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center"
                                >
                                    <Save size={18} className="mr-2" />
                                    {loading ? '更新中...' : '設定を保存'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
