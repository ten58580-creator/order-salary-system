'use client';

import { useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useRouter } from 'next/navigation';
import { KeyRound, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function ClientLoginPage() {
    const router = useRouter();
    const [pinCode, setPinCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePinLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Validate PIN format
        if (!/^\d{4,6}$/.test(pinCode)) {
            setError('PINコードは4〜6桁の数字で入力してください');
            setLoading(false);
            return;
        }

        try {
            // Find company by PIN
            const { data: companies, error: fetchError } = await supabase
                .from('companies')
                .select('id, name')
                .eq('pin_code', pinCode);

            if (fetchError) throw fetchError;

            if (!companies || companies.length === 0) {
                setError('PINコードが正しくありません');
                setLoading(false);
                return;
            }

            // Store company_id in session
            const company = companies[0];
            sessionStorage.setItem('pin_company_id', company.id);
            sessionStorage.setItem('pin_company_name', company.name);

            // Redirect to client dashboard
            router.push('/client');
        } catch (err: any) {
            console.error('PIN Login Error:', err);
            setError(err.message || 'ログインに失敗しました');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
            <div className="max-w-md w-full space-y-8 p-8 bg-white shadow-2xl rounded-2xl">
                <div className="text-center">
                    <div className="mx-auto h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
                        <KeyRound className="text-white" size={32} />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900">発注ポータル</h2>
                    <p className="mt-2 text-sm text-gray-600 font-bold">PINコードでログイン</p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handlePinLogin}>
                    <div>
                        <label htmlFor="pin" className="block text-sm font-bold text-gray-700 mb-2">
                            PINコード（4〜6桁）
                        </label>
                        <input
                            id="pin"
                            type="text"
                            inputMode="numeric"
                            pattern="\d{4,6}"
                            required
                            maxLength={6}
                            className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-2xl font-mono font-black tracking-widest"
                            placeholder="****"
                            value={pinCode}
                            onChange={(e) => {
                                // Convert full-width to half-width and remove non-digits
                                const halfWidth = e.target.value
                                    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                                    .replace(/\D/g, '');
                                setPinCode(halfWidth);
                            }}
                            autoComplete="off"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-lg text-sm font-bold text-center">
                            {error}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={loading || pinCode.length < 4}
                            className="group relative w-full flex justify-center items-center py-3 px-4 border border-transparent text-sm font-bold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed transition"
                        >
                            {loading ? 'ログイン中...' : 'ログイン'}
                            {!loading && <ArrowRight className="ml-2" size={18} />}
                        </button>
                    </div>

                    <div className="text-center mt-4">
                        <Link
                            href="/login"
                            className="text-sm text-gray-500 hover:text-gray-700 font-bold"
                        >
                            管理者の方はこちら →
                        </Link>
                    </div>
                </form>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-800 font-bold text-center">
                        PINコードをお忘れの場合は、管理者にお問い合わせください
                    </p>
                </div>
            </div>
        </div>
    );
}
