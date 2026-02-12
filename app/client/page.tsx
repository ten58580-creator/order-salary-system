'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useRouter } from 'next/navigation';
import OrderCalendar from '@/components/OrderCalendar';
import { Database } from '@/types/supabase';
import { Plus, Package, Monitor } from 'lucide-react';
import ProductRegistrationModal from '@/components/ProductRegistrationModal';
import ProductEditModal from '@/components/ProductEditModal';
import ProductListModal from '@/components/ProductListModal';
import OrderHistoryModal from '@/components/OrderHistoryModal';
import ClientOrderDailyList from '@/components/ClientOrderDailyList';

type Product = Database['public']['Tables']['products']['Row'];

export default function ClientDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [companyName, setCompanyName] = useState<string>('');
    const [userCompanyId, setUserCompanyId] = useState<string>('');

    // Product Management State
    const [products, setProducts] = useState<Product[]>([]);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isProductListOpen, setIsProductListOpen] = useState(false);
    const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    // View State
    const [viewMode, setViewMode] = useState<'calendar' | 'daily'>('calendar');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    useEffect(() => {
        async function init() {
            // Check for PIN-based authentication first
            const sessionCompanyId = sessionStorage.getItem('pin_company_id');
            const sessionCompanyName = sessionStorage.getItem('pin_company_name');

            if (sessionCompanyId && sessionCompanyName) {
                // PIN authentication
                setUserCompanyId(sessionCompanyId);
                setCompanyName(sessionCompanyName);
                fetchProducts(sessionCompanyId);
                setLoading(false);
                return;
            }

            // Fallback to traditional auth
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/client/login');
                return;
            }

            const { data: staff } = await supabase.from('staff').select('company_id').eq('id', user.id).single();

            if (staff?.company_id) {
                setUserCompanyId(staff.company_id);
                const { data: company } = await supabase.from('companies').select('name').eq('id', staff.company_id).single();
                if (company) setCompanyName(company.name);

                // Fetch Products
                fetchProducts(staff.company_id);
            }
            setLoading(false);
        }
        init();
    }, [router]);

    const fetchProducts = async (cId: string) => {
        const { data } = await supabase
            .from('products')
            .select('*')
            .eq('company_id', cId)
            .eq('is_archived', false) // Only active products for client
            .order('name');
        if (data) setProducts(data);
    };

    if (loading) return <div className="p-8 text-center text-gray-500 font-bold">読み込み中...</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <header className="bg-white shadow sticky top-0 z-40">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <div className="flex items-center">
                        <Monitor className="text-blue-600 mr-3" size={28} />
                        <div>
                            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">発注ポータル</h1>
                            <p className="text-xs text-gray-500 font-bold mt-0.5">{companyName} 様専用ページ</p>
                        </div>
                    </div>
                    <button
                        onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
                        className="text-xs text-gray-400 hover:text-gray-700 font-bold border border-gray-200 px-3 py-1.5 rounded-full transition"
                    >
                        ログアウト
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto py-8 sm:px-6 lg:px-8 space-y-6">

                {/* Product Management Buttons */}
                {userCompanyId && (
                    <div className="px-4 sm:px-0 flex justify-end space-x-3">
                        <button
                            onClick={() => setIsOrderHistoryOpen(true)}
                            className="bg-white text-gray-700 border border-gray-200 px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 hover:border-gray-300 transition flex items-center"
                        >
                            <Package className="mr-2 text-gray-500" size={18} />
                            注文履歴一覧
                        </button>
                        <button
                            onClick={() => setIsProductListOpen(true)}
                            className="bg-white text-gray-700 border border-gray-200 px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 hover:border-gray-300 transition flex items-center"
                        >
                            <Package className="mr-2 text-gray-500" size={18} />
                            登録商品を確認・編集
                        </button>
                        <button
                            onClick={() => setIsRegisterModalOpen(true)}
                            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 transition flex items-center"
                        >
                            <Plus size={18} className="mr-1" />
                            新規商品追加
                        </button>
                    </div>
                )}

                {/* Content Section (Calendar or Daily List) */}
                <div className="px-4 sm:px-0">
                    {userCompanyId ? (
                        <div className="transition-all duration-300">
                            {viewMode === 'calendar' ? (
                                <OrderCalendar
                                    companyId={userCompanyId}
                                    onSelectDate={(date) => {
                                        setSelectedDate(date);
                                        setViewMode('daily');
                                    }}
                                />
                            ) : (
                                <ClientOrderDailyList
                                    date={selectedDate}
                                    companyId={userCompanyId}
                                    onBack={() => setViewMode('calendar')}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="p-6 bg-yellow-50 text-yellow-800 rounded-lg font-bold">
                            会社情報が紐づけられていません。管理者に連絡してください。
                        </div>
                    )}
                </div>
            </main>

            {/* Modals */}
            <OrderHistoryModal
                isOpen={isOrderHistoryOpen}
                onClose={() => setIsOrderHistoryOpen(false)}
                companyId={userCompanyId}
                companyName={companyName}
            />
            <ProductListModal
                isOpen={isProductListOpen}
                onClose={() => setIsProductListOpen(false)}
                products={products}
                companyName={companyName} // Added prop
                onSelectProduct={(p) => setEditingProduct(p)}
                onProductUpdated={() => fetchProducts(userCompanyId)}
            />
            <ProductRegistrationModal
                isOpen={isRegisterModalOpen}
                onClose={() => setIsRegisterModalOpen(false)}
                companyId={userCompanyId}
                onProductRegistered={() => fetchProducts(userCompanyId)}
            />
            <ProductEditModal
                isOpen={!!editingProduct}
                onClose={() => setEditingProduct(null)}
                product={editingProduct}
                onSave={() => fetchProducts(userCompanyId)}
            />
        </div>
    );
}
