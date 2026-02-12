'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { format, parse, addDays, subDays } from 'date-fns';
import { ChevronLeft, ClipboardList } from 'lucide-react';
import Link from 'next/link';

import AdminGuard from '@/components/AdminGuard';
import OrderCalendar from '@/components/OrderCalendar';
import OrderDailyList from '@/components/OrderDailyList';

type Order = Database['public']['Tables']['orders']['Row'] & {
    is_correction?: boolean;
};
type Company = Database['public']['Tables']['companies']['Row'];
type Product = Database['public']['Tables']['products']['Row'];

export default function AdminOrdersPage() {
    return (
        <AdminGuard>
            <AdminOrdersContent />
        </AdminGuard>
    );
}

function AdminOrdersContent() {
    const [viewMode, setViewMode] = useState<'calendar' | 'daily'>('calendar');
    const [selectedDate, setSelectedDate] = useState(new Date());

    const handleDateSelect = (date: Date) => {
        setSelectedDate(date);
        setViewMode('daily');
    };

    const handleBackToCalendar = () => {
        setViewMode('calendar');
    };

    return (
        <DashboardLayout>
            <div className="max-w-7xl mx-auto pb-20">
                {/* Header - Global */}
                <div className="mb-8">
                    {/* Top Nav (Only show Back to Dashboard if in Calendar mode, strictly speaking the design showed it in Calendar mode) */}
                    {viewMode === 'calendar' && (
                        <Link href="/admin" className="text-slate-500 hover:text-blue-600 font-bold flex items-center mb-4 transition w-fit group">
                            <ChevronLeft size={20} className="mr-1 group-hover:-translate-x-1 transition" />
                            ダッシュボードに戻る
                        </Link>
                    )}

                    <h1 className="text-3xl font-extrabold text-slate-950 flex items-center">
                        <ClipboardList className="mr-3 text-blue-600" size={32} />
                        受注管理
                        <span className="ml-4 text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                            {viewMode === 'calendar' ? '月間カレンダー' : '日次詳細'}
                        </span>
                    </h1>
                </div>

                <div className="transition-all duration-300">
                    {viewMode === 'calendar' ? (
                        <OrderCalendar onSelectDate={handleDateSelect} />
                    ) : (
                        <OrderDailyList
                            initialDate={selectedDate}
                            onBack={handleBackToCalendar}
                        />
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
