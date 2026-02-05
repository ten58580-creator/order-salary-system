'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Package } from 'lucide-react';
import OrderEntryModal from './OrderEntryModal';
import ProductRegistrationModal from './ProductRegistrationModal';

type Order = Database['public']['Tables']['orders']['Row'] & { unit_price?: number };
type Product = Database['public']['Tables']['products']['Row'];

interface OrderCalendarProps {
    companyId: string;
}

export default function OrderCalendar({ companyId }: OrderCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [orders, setOrders] = useState<Order[]>([]);
    const [productsCache, setProductsCache] = useState<Map<string, { name: string, price: number }>>(new Map());

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    useEffect(() => {
        if (companyId) {
            fetchProducts();
            fetchOrders();
        }
    }, [currentDate, companyId]);

    const fetchProducts = async () => {
        const { data } = await supabase.from('products').select('id, name, unit_price').eq('company_id', companyId);
        if (data) {
            const map = new Map();
            data.forEach(p => map.set(p.id, { name: p.name, price: p.unit_price }));
            setProductsCache(map);
        }
    };

    const fetchOrders = async () => {
        const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
        const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');

        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('company_id', companyId)
            .gte('order_date', start)
            .lte('order_date', end);

        if (data) setOrders(data);
    };

    const handleDayClick = (day: Date, order?: Order) => {
        setSelectedDate(day);
        setSelectedOrder(order || null);
        setIsModalOpen(true);
    };

    const navigateMonth = (dir: 'prev' | 'next') => {
        setCurrentDate(dir === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    };

    // Calendar Grid Gen
    const days = eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate)
    });

    const startDayOfWeek = getDay(startOfMonth(currentDate)); // 0: Sun, 1: Mon...
    const emptySlots = Array(startDayOfWeek).fill(null);

    const monthlyTotal = orders.reduce((sum, order) => {
        return sum + ((order.unit_price ?? 0) * order.quantity);
    }, 0);

    return (
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-end space-x-6">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-500 mb-1">今月の発注総額</span>
                        <span className="text-3xl font-extrabold text-blue-600 tracking-tight leading-none">
                            ¥{monthlyTotal.toLocaleString()}
                        </span>
                    </div>

                </div>

                <div className="flex items-center space-x-4">
                    <h2 className="text-xl font-bold text-gray-900">
                        {format(currentDate, 'yyyy年 MM月')}
                    </h2>
                    <div className="flex space-x-2">
                        <button onClick={() => navigateMonth('prev')} className="p-2 bg-white border-2 border-slate-200 rounded-lg hover:bg-slate-100 text-slate-900 transition"><ChevronLeft size={24} strokeWidth={2.5} /></button>
                        <button onClick={() => navigateMonth('next')} className="p-2 bg-white border-2 border-slate-200 rounded-lg hover:bg-slate-100 text-slate-900 transition"><ChevronRight size={24} strokeWidth={2.5} /></button>
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-100 text-center text-xs font-bold text-gray-500 py-2">
                <div className="text-red-500">日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div className="text-blue-500">土</div>
            </div>
            <div className="grid grid-cols-7 bg-white">
                {emptySlots.map((_, i) => <div key={`empty-${i}`} className="border-b border-r border-gray-100 h-32 bg-gray-50/30" />)}

                {days.map(day => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const dayOrders = orders.filter(o => o.order_date === dayStr);
                    const isToday = isSameDay(day, new Date());

                    const dayTotal = dayOrders.reduce((sum, order) => {
                        return sum + ((order.unit_price ?? 0) * order.quantity);
                    }, 0);

                    return (
                        <div
                            key={dayStr}
                            onClick={() => handleDayClick(day)}
                            className={`border-b border-r border-gray-100 h-32 p-2 relative hover:bg-blue-50 transition cursor-pointer flex flex-col ${isToday ? 'bg-blue-50/50' : ''}`}
                        >
                            <div className="flex justify-between items-start">
                                <span className={`text-sm font-bold ${getDay(day) === 0 ? 'text-red-500' : getDay(day) === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                                    {format(day, 'd')}
                                </span>
                                {dayTotal > 0 && (
                                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                        ¥{dayTotal.toLocaleString()}
                                    </span>
                                )}
                            </div>

                            <div className="mt-1 space-y-1 overflow-y-auto flex-1">
                                {dayOrders.map(order => (
                                    <div
                                        key={order.id}
                                        onClick={(e) => { e.stopPropagation(); handleDayClick(day, order); }}
                                        className="text-xs bg-blue-100 text-blue-800 px-1.5 py-1 rounded border border-blue-200 truncate hover:bg-blue-200"
                                    >
                                        <div className="font-bold truncate text-blue-950 mb-0.5">{productsCache.get(order.product_id)?.name || '不明な商品'}</div>
                                        <div className="text-right font-extrabold text-blue-800">{order.quantity} pk</div>
                                    </div>
                                ))}
                                {dayOrders.length === 0 && (
                                    <div className="h-full flex items-center justify-center text-gray-300">
                                        <Plus size={20} />
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <OrderEntryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                date={selectedDate}
                companyId={companyId}
                existingOrder={selectedOrder}
                onSave={fetchOrders}
            />

            <ProductRegistrationModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                companyId={companyId}
                onProductRegistered={async () => { await fetchProducts(); }}
            />
        </div>
    );
}
