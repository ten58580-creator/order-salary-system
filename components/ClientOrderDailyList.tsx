'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { format, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, ArrowLeft, Plus, Edit2, RefreshCw } from 'lucide-react';
import { ja } from 'date-fns/locale';
import OrderEntryModal from './OrderEntryModal';

type Order = Database['public']['Tables']['orders']['Row'];
type Product = Database['public']['Tables']['products']['Row'];

interface ClientOrderDailyListProps {
    date: Date;
    companyId: string;
    onBack: () => void;
}

export default function ClientOrderDailyList({ date, companyId, onBack }: ClientOrderDailyListProps) {
    const [currentDate, setCurrentDate] = useState(date);
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Map<string, Product>>(new Map());
    const [loading, setLoading] = useState(true);

    // Modal State
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);

    useEffect(() => {
        fetchProducts();
    }, [companyId]);

    useEffect(() => {
        fetchOrders();
    }, [currentDate, companyId]);

    const fetchProducts = async () => {
        const { data } = await supabase
            .from('products')
            .select('*')
            .eq('company_id', companyId);

        if (data) {
            const map = new Map();
            data.forEach(p => map.set(p.id, p));
            setProducts(map);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const { data } = await supabase
            .from('orders')
            .select('*')
            .eq('company_id', companyId)
            .eq('order_date', dateStr)
            .order('created_at');

        if (data) setOrders(data);
        setLoading(false);
    };

    const handleEdit = (order: Order) => {
        setEditingOrder(order);
        setIsEntryModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingOrder(null);
        setIsEntryModalOpen(true);
    };

    const handleModalSave = () => {
        fetchOrders();
    };

    const totalAmount = orders.reduce((sum, o) => {
        const p = products.get(o.product_id);
        return sum + (o.quantity * (p?.unit_price || 0));
    }, 0);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px]">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
                <button
                    onClick={onBack}
                    className="flex items-center text-slate-600 hover:text-blue-600 font-bold transition group"
                >
                    <ArrowLeft size={20} className="mr-1 group-hover:-translate-x-1 transition" />
                    カレンダーへ
                </button>

                <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm">
                    <button onClick={() => setCurrentDate(subDays(currentDate, 1))} className="p-2 hover:bg-slate-50 text-slate-500">
                        <ChevronLeft size={20} />
                    </button>
                    <div className="px-4 font-black text-lg text-slate-900">
                        {format(currentDate, 'yyyy年 MM月 dd日 (eee)', { locale: ja })}
                    </div>
                    <button onClick={() => setCurrentDate(addDays(currentDate, 1))} className="p-2 hover:bg-slate-50 text-slate-500">
                        <ChevronRight size={20} />
                    </button>
                </div>

                <button onClick={() => fetchOrders()} className="p-2 text-slate-400 hover:text-blue-600 transition">
                    <RefreshCw size={20} />
                </button>
            </div>

            {/* Content */}
            <div className="p-6">
                {/* Summary Card */}
                <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-4 flex justify-between items-center">
                    <div>
                        <div className="text-sm font-bold text-blue-800 mb-1">本日の注文合計 (税込概算)</div>
                        <div className="text-3xl font-black text-blue-600">
                            ¥{totalAmount.toLocaleString()}
                        </div>
                    </div>
                    <button
                        onClick={handleAddNew}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold shadow-md hover:bg-blue-700 transition flex items-center"
                    >
                        <Plus size={20} className="mr-2" />
                        注文を追加
                    </button>
                </div>

                {/* Orders List */}
                {loading ? (
                    <div className="text-center py-12 text-gray-400">読み込み中...</div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-xl">
                        <p className="text-gray-400 font-bold mb-4">この日の注文はまだありません</p>
                        <button
                            onClick={handleAddNew}
                            className="text-blue-600 font-bold hover:underline"
                        >
                            注文を作成する
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {orders.map(order => {
                            const product = products.get(order.product_id);
                            return (
                                <div
                                    key={order.id}
                                    onClick={() => handleEdit(order)}
                                    className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition cursor-pointer group"
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center">
                                            <div className="bg-blue-100 text-blue-600 p-2 rounded-lg mr-4 group-hover:bg-blue-600 group-hover:text-white transition">
                                                <Edit2 size={20} />
                                            </div>
                                            <div>
                                                <div className="font-bold text-lg text-gray-900">{product?.name || '不明な商品'}</div>
                                                <div className="text-sm text-gray-500 font-bold">
                                                    単価: ¥{product?.unit_price.toLocaleString()} / {product?.unit}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-2xl font-black text-gray-900">
                                                {order.quantity} <span className="text-sm font-normal text-gray-500">{product?.unit}</span>
                                            </div>
                                            <div className="text-sm font-bold text-blue-600">
                                                ¥{(order.quantity * (product?.unit_price || 0)).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Order Entry Modal */}
            <OrderEntryModal
                isOpen={isEntryModalOpen}
                onClose={() => setIsEntryModalOpen(false)}
                date={currentDate}
                companyId={companyId}
                existingOrder={editingOrder}
                onSave={handleModalSave}
            />
        </div>
    );
}
