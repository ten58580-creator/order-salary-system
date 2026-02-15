'use client';

import { useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;

            if (user) {
                // Retrieve User Role
                const { data: staffData, error: staffError } = await supabase
                    .from('staff')
                    .select('role, company_id') // Check role
                    .eq('id', user.id)
                    .single();

                if (staffError && staffError.code !== 'PGRST116') { // Ignore 'not found' initially if we just want to allow generic access? No, strict.
                    console.error('Error fetching staff profile:', staffError);
                }

                const role = staffData?.role;

                if (role === 'client') {
                    router.push('/client');
                } else {
                    // Default to admin/staff dashboard
                    router.push('/');
                }
            }
        } catch (err: any) {
            setError(err.message || 'ログインに失敗しました');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-8 p-8 bg-white shadow rounded-xl">
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold text-gray-900">ログイン</h2>
                    {/* Start of the requested change */}
                    <div className="bg-white p-4 rounded-full shadow-lg mb-6 group-hover:scale-110 transition-transform duration-300">
                        <ClipboardList size={48} className="text-blue-600" />
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">
                        チェックル
                    </h1>
                    <p className="text-slate-500 font-bold mt-2">勤怠・給与管理システム</p>
                    {/* System Name Updated to Checkle */}
                    {/* End of the requested change */}
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <input
                                type="email"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="メールアドレス"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="パスワード"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center font-bold">
                            {error}
                        </div>
                    )}

                    <div className="text-center">
                        <a
                            href="/client/login"
                            className="text-sm text-blue-600 hover:text-blue-800 font-bold"
                        >
                            発注依頼側の方はこちら →
                        </a>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300"
                        >
                            {loading ? 'ログイン中...' : 'ログイン'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
