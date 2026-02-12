'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { format, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, RefreshCw, Calendar, ArrowLeft } from 'lucide-react';
import { ja } from 'date-fns/locale';

type Order = Database['public']['Tables']['orders']['Row'] & {
    is_correction?: boolean;
    actual_quantity?: number | null; // Database column not yet in types or extended
};
type Product = Database['public']['Tables']['products']['Row'];

interface OrderDailyListProps {
    initialDate: Date;
    onBack: () => void;
}

export default function OrderDailyList({ initialDate, onBack }: OrderDailyListProps) {
    const [currentDate, setCurrentDate] = useState(initialDate);
    const [orders, setOrders] = useState<Order[]>([]);
    const [companies, setCompanies] = useState<Map<string, string>>(new Map());
    const [products, setProducts] = useState<Map<string, Product>>(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchMasterData();
    }, []);

    useEffect(() => {
        fetchOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate]);

    const fetchMasterData = async () => {
        // Companies
        const { data: cData } = await supabase.from('companies').select('id, name');
        if (cData) {
            const map = new Map();
            cData.forEach(c => map.set(c.id, c.name));
            setCompanies(map);
        }
        // Products (All)
        const { data: pData } = await supabase.from('products').select('*');
        if (pData) {
            const map = new Map();
            pData.forEach(p => map.set(p.id, p));
            setProducts(map);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('order_date', dateStr)
            .order('created_at'); // FIFO

        if (data) setOrders(data);
        setLoading(false);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return <span className="bg-gray-100 text-slate-950 px-3 py-1.5 rounded-md text-sm font-bold border border-gray-200">待機中</span>;
            case 'in_progress': return <span className="bg-blue-100 text-blue-900 px-3 py-1.5 rounded-md text-sm font-bold border border-blue-200 animate-pulse">製造中</span>;
            case 'processing': return <span className="bg-blue-100 text-blue-900 px-3 py-1.5 rounded-md text-sm font-bold border border-blue-200 animate-pulse">製造中</span>;
            case 'break': return <span className="bg-orange-100 text-orange-900 px-3 py-1.5 rounded-md text-sm font-bold border border-orange-200">中断中</span>;
            case 'completed': return <span className="bg-green-100 text-green-900 px-3 py-1.5 rounded-md text-sm font-bold border border-green-200">完了</span>;
            default: return <span className="text-slate-950 font-bold">{status}</span>;
        }
    };

    const dailyTotalPlanned = orders.reduce((sum, o) => sum + o.quantity, 0);
    const dailyTotalActual = orders.reduce((sum, o) => sum + (o.actual_quantity ?? 0), 0);
    const progress = orders.length > 0 ? (orders.filter(o => o.status === 'completed').length / orders.length) * 100 : 0;

    return (
        <div>
            {/* Header with Back Button */}
            <div className="mb-6 flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center text-slate-500 hover:text-blue-600 font-bold transition group"
                >
                    <ArrowLeft size={20} className="mr-1 group-hover:-translate-x-1 transition" />
                    カレンダーに戻る
                </button>

                <div className="flex items-center gap-4">
                    <button onClick={() => fetchOrders()} className="p-2 text-slate-400 hover:text-blue-600 transition" title="更新">
                        <RefreshCw size={20} />
                    </button>

                    {/* Date Picker */}
                    <div className="flex items-center bg-white border border-slate-200 p-1 rounded-xl shadow-sm">
                        <button onClick={() => setCurrentDate(subDays(currentDate, 1))} className="p-2 hover:bg-slate-50 rounded-lg transition text-slate-600">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="mx-4 flex items-center font-black text-slate-950 text-lg">
                            <Calendar className="mr-2 text-slate-400" size={18} />
                            {format(currentDate, 'yyyy年 MM月 dd日 (eee)', { locale: ja })}
                        </div>
                        <button onClick={() => setCurrentDate(addDays(currentDate, 1))} className="p-2 hover:bg-slate-50 rounded-lg transition text-slate-600">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="mb-8 flex flex-wrap gap-6 text-sm bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-center">
                    <div className="text-gray-500 font-bold mb-1">注文数</div>
                    <div className="font-black text-2xl text-slate-950">{orders.length} <span className="text-sm text-slate-400">件</span></div>
                </div>
                <div className="text-center border-l border-gray-100 pl-6">
                    <div className="text-gray-500 font-bold mb-1">予定総数</div>
                    <div className="font-black text-2xl text-slate-950">{dailyTotalPlanned.toLocaleString()} <span className="text-sm text-slate-400">pk</span></div>
                </div>
                <div className="text-center border-l border-gray-100 pl-6">
                    <div className="text-gray-500 font-bold mb-1">製造実績</div>
                    <div className="font-black text-2xl text-blue-600">{dailyTotalActual.toLocaleString()} <span className="text-sm text-blue-300">pk</span></div>
                </div>
                <div className="text-center border-l border-gray-100 pl-6">
                    <div className="text-gray-500 font-bold mb-1">進捗</div>
                    <div className="font-black text-2xl text-green-600">{Math.round(progress)}<span className="text-sm">%</span></div>
                </div>
            </div>

            {/* List */}
            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-20">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                        <p className="mt-4 text-slate-400 font-bold">読み込み中...</p>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <p className="text-slate-400 font-bold text-lg">この日の注文はありません</p>
                    </div>
                ) : (
                    orders.map(order => {
                        const product = products.get(order.product_id);
                        const companyName = companies.get(order.company_id) || '不明な会社';
                        const isCompleted = order.status === 'completed';

                        return (
                            <div key={order.id} className={`bg-white p-6 rounded-xl border-l-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 transition hover:shadow-md ${isCompleted ? 'border-green-500 opacity-80 bg-slate-50' : order.status === 'in_progress' || order.status === 'processing' ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-300'}`}>

                                <div className="flex-1 min-w-0 w-full">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-xs font-black text-slate-500 bg-slate-100 px-2 py-1 rounded">{companyName}</span>
                                        {getStatusBadge(order.status)}
                                        {order.is_correction && (
                                            <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded font-black border border-red-200">
                                                修正依頼
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-2xl font-black text-slate-900 truncate mb-3">{product?.name || '不明な商品'}</div>
                                    <div className="bg-slate-50 rounded-lg p-3 inline-flex items-center gap-4 border border-slate-100">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Plan</span>
                                            <span className="font-black text-slate-900 text-xl leading-none">{order.quantity} <span className="text-xs font-normal">pk</span></span>
                                        </div>
                                        {order.actual_quantity !== null && (
                                            <>
                                                <div className="w-px h-8 bg-slate-200"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Actual</span>
                                                    <span className="font-black text-blue-700 text-xl leading-none">{order.actual_quantity} <span className="text-xs font-normal">pk</span></span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
