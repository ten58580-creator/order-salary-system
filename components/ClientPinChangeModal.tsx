'use client';

import { useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { X, Save, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ClientPinChangeModalProps {
    isOpen: boolean;
    onClose: () => void;
    companyId: string;
}

export default function ClientPinChangeModal({ isOpen, onClose, companyId }: ClientPinChangeModalProps) {
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const resetForm = () => {
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setError(null);
        setSuccess(false);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        // Validation
        if (!/^\d{4,6}$/.test(newPin)) {
            setError('新しいPINコードは4〜6桁の数字で入力してください。');
            setLoading(false);
            return;
        }

        if (newPin !== confirmPin) {
            setError('新しいPINコードが一致しません。');
            setLoading(false);
            return;
        }

        if (newPin === currentPin) {
            setError('新しいPINコードは現在のPINコードと異なるものを設定してください。');
            setLoading(false);
            return;
        }

        try {
            // Verify current PIN
            const { data: company, error: fetchError } = await supabase
                .from('companies')
                .select('pin_code')
                .eq('id', companyId)
                .single();

            if (fetchError || !company) {
                throw new Error('会社情報の取得に失敗しました。');
            }

            if (company.pin_code !== currentPin) {
                setError('現在のPINコードが正しくありません。');
                setLoading(false);
                return;
            }

            // Update PIN
            const { error: updateError } = await supabase
                .from('companies')
                .update({ pin_code: newPin })
                .eq('id', companyId);

            if (updateError) {
                throw updateError;
            }

            setSuccess(true);
            setTimeout(() => {
                handleClose();
            }, 2000);

        } catch (err: any) {
            console.error('PIN Change Error:', err);
            setError(err.message || 'PINコードの変更に失敗しました。');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 transition-opacity" onClick={handleClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h3 className="font-extrabold text-xl text-gray-900 flex items-center">
                        <Lock className="mr-2 text-blue-600" size={24} />
                        PINコード変更
                    </h3>
                    <button onClick={handleClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    {success ? (
                        <div className="text-center py-8">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                                <CheckCircle2 className="h-8 w-8 text-green-600" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">変更完了</h3>
                            <p className="text-sm text-gray-500 mt-2 font-bold">PINコードを更新しました。</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                                    <AlertCircle className="text-red-600 mr-2 flex-shrink-0 mt-0.5" size={18} />
                                    <p className="text-sm text-red-700 font-bold">{error}</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">現在のPINコード</label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    required
                                    value={currentPin}
                                    onChange={(e) => setCurrentPin(e.target.value)}
                                    className="w-full border-2 border-slate-300 rounded-lg p-3 font-mono text-lg font-bold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                                    placeholder="****"
                                />
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">新しいPINコード（4〜6桁）</label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        pattern="\d{4,6}"
                                        required
                                        maxLength={6}
                                        value={newPin}
                                        onChange={(e) => setNewPin(e.target.value)}
                                        className="w-full border-2 border-slate-300 rounded-lg p-3 font-mono text-lg font-bold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                                        placeholder="****"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">新しいPINコード（確認）</label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        pattern="\d{4,6}"
                                        required
                                        maxLength={6}
                                        value={confirmPin}
                                        onChange={(e) => setConfirmPin(e.target.value)}
                                        className="w-full border-2 border-slate-300 rounded-lg p-3 font-mono text-lg font-bold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                                        placeholder="****"
                                    />
                                </div>
                            </div>

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? '更新中...' : '変更を保存する'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
