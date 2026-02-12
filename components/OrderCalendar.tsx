'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface OrderCalendarProps {
    onSelectDate?: (date: Date) => void;
    companyId?: string;
}

type DailyStats = {
    count: number;
    totalPk: number;
};

export default function OrderCalendar({ onSelectDate, companyId }: OrderCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthlyStats, setMonthlyStats] = useState<Map<string, DailyStats>>(new Map());
    const [loading, setLoading] = useState(false);
    const [totalOrders, setTotalOrders] = useState(0);
    const [totalAmount, setTotalAmount] = useState(0);

    useEffect(() => {
        fetchMonthlyData();
    }, [currentMonth, companyId]);

    const fetchMonthlyData = async () => {
        setLoading(true);
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);

        let query = supabase
            .from('orders')
            .select('order_date, quantity, products(unit_price)')
            .gte('order_date', format(start, 'yyyy-MM-dd'))
            .lte('order_date', format(end, 'yyyy-MM-dd'));

        if (companyId) {
            query = query.eq('company_id', companyId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching monthly orders:', error);
            setLoading(false);
            return;
        }

        const stats = new Map<string, DailyStats>();
        let monthTotalCount = 0;
        let monthTotalAmount = 0;

        data?.forEach((order: any) => {
            const dateStr = order.order_date;
            const current = stats.get(dateStr) || { count: 0, totalPk: 0 };
            stats.set(dateStr, {
                count: current.count + 1,
                totalPk: current.totalPk + order.quantity
            });
            monthTotalCount++;
            if (order.products?.unit_price) {
                monthTotalAmount += order.quantity * order.products.unit_price;
            }
        });

        setMonthlyStats(stats);
        setTotalOrders(monthTotalCount);
        setTotalAmount(monthTotalAmount);
        setLoading(false);
    };

    const days = eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentMonth)),
        end: endOfWeek(endOfMonth(currentMonth))
    });

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7));
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex gap-8">
                    <div>
                        <div className="text-sm text-slate-500 font-bold mb-1">今月の受注総数</div>
                        <div className="text-3xl font-black text-slate-900 flex items-baseline">
                            {totalOrders} <span className="text-sm ml-1 text-slate-500">件</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-slate-500 font-bold mb-1">今月の受注総額 (概算)</div>
                        <div className="text-3xl font-black text-blue-600 flex items-baseline">
                            ¥{totalAmount.toLocaleString()}
                        </div>
                    </div>
                </div>

                <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-200">
                    <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-white rounded-lg transition shadow-sm hover:shadow text-slate-600">
                        <ChevronLeft size={20} />
                    </button>
                    <div className="mx-6 text-xl font-black text-slate-900 flex items-center">
                        {format(currentMonth, 'yyyy年 MM月', { locale: ja })}
                    </div>
                    <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-white rounded-lg transition shadow-sm hover:shadow text-slate-600">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="w-full">
                {/* Day Headers */}
                <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
                    {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
                        <div key={day} className={`p-3 text-center text-sm font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-500'}`}>
                            {day}
                        </div>
                    ))}
                </div>

                {/* Weeks */}
                <div className="divide-y divide-slate-100">
                    {weeks.map((week, weekIndex) => (
                        <div key={weekIndex} className="grid grid-cols-7 divide-x divide-slate-100">
                            {week.map((day) => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const stat = monthlyStats.get(dateStr);
                                const isCurrentMonth = isSameMonth(day, currentMonth);
                                const isTodayDate = isToday(day);

                                return (
                                    <div
                                        key={dateStr}
                                        onClick={() => onSelectDate?.(day)}
                                        className={`
                                            min-h-[120px] p-2 transition cursor-pointer relative group
                                            ${!isCurrentMonth ? 'bg-slate-50/50 text-slate-300' : 'bg-white hover:bg-blue-50/50'}
                                            ${isTodayDate ? 'bg-blue-50/30' : ''}
                                        `}
                                    >
                                        <div className={`
                                            text-sm font-bold mb-2 w-7 h-7 flex items-center justify-center rounded-full
                                            ${isTodayDate ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-slate-700' : 'text-slate-300'}
                                        `}>
                                            {format(day, 'd')}
                                        </div>

                                        {/* Stats Badges */}
                                        {stat && (
                                            <div className="space-y-1.5 animate-in fade-in zoom-in duration-200">
                                                <div className="flex items-center justify-between bg-blue-100/50 px-2 py-1 rounded text-xs font-bold text-blue-900 border border-blue-100">
                                                    <span className="text-[10px] text-blue-400">受注</span>
                                                    <span>{stat.count}件</span>
                                                </div>
                                                <div className="flex items-center justify-between bg-emerald-100/50 px-2 py-1 rounded text-xs font-bold text-emerald-900 border border-emerald-100">
                                                    <span className="text-[10px] text-emerald-500">予定</span>
                                                    <span>{stat.totalPk.toLocaleString()}pk</span>
                                                </div>
                                            </div>
                                        )}

                                        {!stat && isCurrentMonth && (
                                            <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                <span className="text-slate-200 text-2xl">+</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {loading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center backdrop-blur-sm">
                    <Loader2 className="animate-spin text-blue-600" size={32} />
                </div>
            )}
        </div>
    );
}
