'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { format, parse, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, RefreshCw, Calendar } from 'lucide-react';
import Link from 'next/link';

type Order = Database['public']['Tables']['orders']['Row'];
type Company = Database['public']['Tables']['companies']['Row'];
type Product = Database['public']['Tables']['products']['Row'];

export default function AdminOrdersPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
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
        <DashboardLayout>
            <div className="max-w-5xl mx-auto pb-20">
                <div className="mb-8">
                    <Link href="/admin" className="text-gray-500 hover:text-blue-600 font-bold flex items-center mb-4 transition w-fit">
                        <ChevronLeft size={20} className="mr-1" />
                        ダッシュボードに戻る
                    </Link>

                    {/* Header Controls */}
                    <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex items-center space-x-4 mb-4 md:mb-0">
                            <button onClick={() => setCurrentDate(subDays(currentDate, 1))} className="p-2 border rounded hover:bg-gray-50"><ChevronLeft size={20} className="text-slate-600" /></button>
                            <div className="text-2xl font-black text-slate-900 flex items-center">
                                <Calendar className="mr-2 text-slate-500" />
                                {format(currentDate, 'yyyy年 MM月 dd日 (eee)')}
                            </div>
                            <button onClick={() => setCurrentDate(addDays(currentDate, 1))} className="p-2 border rounded hover:bg-gray-50"><ChevronRight size={20} className="text-slate-600" /></button>
                        </div>

                        <div className="flex gap-6 text-sm">
                            <div className="text-center">
                                <div className="text-gray-500 font-bold">注文数</div>
                                <div className="font-black text-xl text-slate-950">{orders.length} <span className="text-xs">件</span></div>
                            </div>
                            <div className="text-center border-l border-gray-200 pl-6">
                                <div className="text-gray-500 font-bold">予定総数</div>
                                <div className="font-black text-xl text-slate-950">{dailyTotalPlanned.toLocaleString()} <span className="text-xs">pk</span></div>
                            </div>
                            <div className="text-center border-l border-gray-200 pl-6">
                                <div className="text-gray-500 font-bold">製造実績</div>
                                <div className="font-black text-xl text-blue-700">{dailyTotalActual.toLocaleString()} <span className="text-xs">pk</span></div>
                            </div>
                            <div className="text-center border-l border-gray-200 pl-6">
                                <div className="text-gray-500 font-bold">進捗</div>
                                <div className="font-black text-xl text-green-700">{Math.round(progress)}%</div>
                            </div>
                        </div>

                        <button onClick={() => fetchOrders()} className="p-2 text-gray-400 hover:text-blue-600 transition ml-4">
                            <RefreshCw size={24} />
                        </button>
                    </div>
                </div>

                {/* List */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500 font-bold">読み込み中...</div>
                    ) : orders.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                            <p className="text-gray-400 font-bold text-xl">この日の注文はありません</p>
                        </div>
                    ) : (
                        orders.map(order => {
                            const product = products.get(order.product_id);
                            const companyName = companies.get(order.company_id) || '不明な会社';
                            const isCompleted = order.status === 'completed';

                            return (
                                <div key={order.id} className={`bg-white p-6 rounded-xl border-l-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 transition ${isCompleted ? 'border-green-500 opacity-80' : order.status === 'in_progress' || order.status === 'processing' ? 'border-blue-500 ring-2 ring-blue-50' : 'border-gray-300'}`}>

                                    <div className="flex-1 min-w-0 w-full">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-sm font-black text-slate-600 bg-slate-100 px-3 py-1 rounded-md">{companyName}</span>
                                            {getStatusBadge(order.status)}
                                        </div>
                                        <div className="text-2xl font-black text-slate-950 truncate mb-2">{product?.name || '不明な商品'}</div>
                                        <div className="text-base text-slate-500 font-bold flex items-center">
                                            予定: <span className="font-black text-slate-950 text-xl ml-2">{order.quantity} <span className="text-sm">pk</span></span>
                                            {order.actual_quantity !== null && (
                                                <>
                                                    <span className="mx-3 text-gray-300">|</span>
                                                    <span className="text-blue-700">
                                                        実績: <span className="font-black text-xl ml-1">{order.actual_quantity} <span className="text-sm">pk</span></span>
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* No Actions - Read Only for Admin/Clerk */}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
