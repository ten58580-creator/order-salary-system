'use client';

import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/utils/supabaseClient';
import { ChevronLeft, ChevronRight, BarChart3, Clock, Calendar } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { calculateNetWorkingMinutes, calculateSalary, formatHoursFromMinutes } from '@/utils/laborCalculator';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type ProductionLog = {
    status: string;
    created_at: string; // Used as start_time
    end_time: string | null;
    worker_count: number;
};

type ProductionItem = {
    product_id: string;
    product_name: string;
    unit: string;
    total_quantity: number;
    total_actual_quantity: number;
    status_counts: { [key: string]: number };
    company_breakdown: { company_name: string; quantity: number; status: string }[];
    current_status: string; // 'pending' | 'processing' | 'completed'
    worker_count: number;
    logs: ProductionLog[];
    first_start: string | null;
    last_end: string | null;
    has_correction?: boolean;
    // Cost fields
    wholesale_price?: number;
    cost_price?: number;
    container_cost?: number;
    wrap_cost?: number;
    seal_cost?: number;
    box_cost?: number;
    other_material_cost?: number;
};

type TimeCard = {
    clock_in: string;
    clock_out: string;
    date: string;
    staff_id: string;
};

type Staff = {
    id: string;
    hourly_wage: number;
};

import AdminGuard from '@/components/AdminGuard';

export default function AnalyticsPage() {
    return (
        <AdminGuard>
            <AnalyticsContent />
        </AdminGuard>
    );
}

function AnalyticsContent() {
    const [mounted, setMounted] = useState(false);

    const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<ProductionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [productCostMap, setProductCostMap] = useState<Map<string, any>>(new Map());

    // Cost Data
    const [staffMap, setStaffMap] = useState<Map<string, number>>(new Map()); // id -> hourly_wage

    // Attendance Data
    const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
    const [factoryStartTime, setFactoryStartTime] = useState<string | null>(null);
    const [factoryEndTime, setFactoryEndTime] = useState<string | null>(null);

    const [now, setNow] = useState<Date>(new Date());

    // Timer Tick
    useEffect(() => {
        setMounted(true);
        const interval = setInterval(() => {
            setNow(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // ------------------------------------------------------------------
    // Data Fetching
    // ------------------------------------------------------------------

    // ------------------------------------------------------------------
    // Data Fetching
    // ------------------------------------------------------------------

    const fetchProductionData = async (date: string) => {
        try {
            // 1. Fetch Production Summary
            const { data: prodData, error: prodError } = await supabase.rpc('get_daily_production_v2', { p_target_date: date });

            if (prodError) {
                console.error('RPC Error:', prodError);
            } else {
                const fetchedItems = ((prodData as ProductionItem[]) || []).map(item => ({
                    ...item,
                    logs: Array.isArray(item.logs) ? item.logs : [],
                    company_breakdown: Array.isArray(item.company_breakdown) ? item.company_breakdown : []
                }));

                // Fetch product cost data
                const productIds = fetchedItems.map(i => i.product_id);
                if (productIds.length > 0) {
                    const { data: productsData } = await supabase
                        .from('products')
                        .select('id, wholesale_price, cost_price, container_cost, wrap_cost, seal_cost, box_cost, other_material_cost')
                        .in('id', productIds);

                    if (productsData) {
                        const costMap = new Map();
                        productsData.forEach(p => costMap.set(p.id, p));
                        setProductCostMap(costMap);

                        // Merge cost data into items
                        fetchedItems.forEach(item => {
                            const costData = costMap.get(item.product_id);
                            if (costData) {
                                Object.assign(item, costData);
                            }
                        });
                    }
                }

                setItems(fetchedItems);
            }

            // 2. Fetch Attendance Logs instead of 'timecards'
            const startStr = date + 'T00:00:00';
            const endStr = date + 'T23:59:59';

            const { data: logsData, error: logsError } = await supabase
                .from('timecard_logs')
                .select('*')
                .gte('timestamp', startStr)
                .lte('timestamp', endStr)
                .order('timestamp', { ascending: true });

            if (logsData) {
                // Determine Factory Open/Close
                const clockIns = logsData.filter(l => l.event_type === 'clock_in');
                const clockOuts = logsData.filter(l => l.event_type === 'clock_out');

                let minIn: string | null = null;
                let maxOut: string | null = null;

                if (clockIns.length > 0) {
                    const sortedIns = clockIns.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                    minIn = format(new Date(sortedIns[0].timestamp), 'HH:mm');
                }

                if (clockOuts.length > 0) {
                    const sortedOuts = clockOuts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                    maxOut = format(new Date(sortedOuts[0].timestamp), 'HH:mm');
                }

                setFactoryStartTime(minIn);
                setFactoryEndTime(maxOut);

                // Store raw logs for calculation
                setAttendanceLogs(logsData);
            } else {
                setAttendanceLogs([]);
                setFactoryStartTime(null);
                setFactoryEndTime(null);
            }

        } catch (e) {
            console.error('Fetch Error:', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchStaffData = async () => {
        const { data } = await supabase.from('staff').select('id, hourly_wage');
        if (data) {
            const map = new Map<string, number>();
            data.forEach(s => map.set(s.id, s.hourly_wage || 1100)); // Default 1100 if null
            setStaffMap(map);
        }
    };

    useEffect(() => {
        fetchStaffData();
    }, []);

    useEffect(() => {
        setLoading(true);
        fetchProductionData(currentDate);
    }, [currentDate]);

    useEffect(() => {
        const pollInterval = setInterval(() => {
            fetchProductionData(currentDate);
        }, 10000);
        return () => clearInterval(pollInterval);
    }, [currentDate]);

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    const getDurationMinutes = (start: string, end: string | null) => {
        if (!start) return 0;
        const s = new Date(start);
        const e = end ? new Date(end) : now;
        if (e < s) return 0;
        return calculateNetWorkingMinutes(s, e);
    };

    // Helper to calculate total minutes for a staff from logs
    const calculateStaffDailyMinutes = (staffId: string, logs: any[]) => {
        const staffLogs = logs.filter(l => l.staff_id === staffId);
        if (staffLogs.length === 0) return 0;

        const sorted = staffLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const firstIn = sorted.find(l => l.event_type === 'clock_in');
        const lastOut = sorted.slice().reverse().find(l => l.event_type === 'clock_out');

        if (!firstIn || !lastOut) return 0;

        const start = new Date(firstIn.timestamp);
        const end = new Date(lastOut.timestamp);
        const gross = calculateNetWorkingMinutes(start, end);

        let totalBreak = 0;
        let currentBreakStart: any = null;

        sorted.forEach(log => {
            const t = new Date(log.timestamp);
            if (t < start || t > end) return;

            if (log.event_type === 'break_start') {
                if (!currentBreakStart) currentBreakStart = log;
            } else if (log.event_type === 'break_end') {
                if (currentBreakStart) {
                    const bStart = new Date(currentBreakStart.timestamp);
                    totalBreak += calculateNetWorkingMinutes(bStart, t);
                    currentBreakStart = null;
                }
            }
        });

        return Math.max(0, gross - totalBreak);
    };


    const changeDate = (days: number) => {
        const date = new Date(currentDate);
        date.setDate(date.getDate() + days);
        setCurrentDate(date.toISOString().split('T')[0]);
    };

    // ------------------------------------------------------------------
    // Calculations
    // ------------------------------------------------------------------

    const calculateSummary = () => {
        let totalAttendanceMinutes = 0;
        let totalLaborCost = 0;

        // Group logs by staff
        const logsByStaff = new Map<string, any[]>();
        (attendanceLogs || []).forEach(log => {
            if (!logsByStaff.has(log.staff_id)) logsByStaff.set(log.staff_id, []);
            logsByStaff.get(log.staff_id)!.push(log);
        });

        logsByStaff.forEach((logs, staffId) => {
            const minutes = calculateStaffDailyMinutes(staffId, logs);
            totalAttendanceMinutes += minutes;

            const wage = staffMap.get(staffId) || 1100; // Default wage
            totalLaborCost += calculateSalary(minutes, wage);
        });

        let totalProductionManMinutes = 0;
        items.forEach(item => {
            (item.logs || []).forEach(log => {
                if (log.status === 'processing') {
                    const m = getDurationMinutes(log.created_at, log.end_time);
                    const workers = log.worker_count || item.worker_count || 1;
                    totalProductionManMinutes += m * workers;
                }
            });
        });

        const totalAttendanceHours = formatHoursFromMinutes(totalAttendanceMinutes);
        const totalProductionManHours = formatHoursFromMinutes(totalProductionManMinutes);

        let nonProductionMinutes = totalAttendanceMinutes - totalProductionManMinutes;
        if (nonProductionMinutes < 0) nonProductionMinutes = 0;
        const nonProductionHours = formatHoursFromMinutes(nonProductionMinutes);

        const efficiency = totalAttendanceMinutes > 0
            ? (totalProductionManMinutes / totalAttendanceMinutes) * 100
            : 0;

        // Pack Calculation
        const totalPacks = items.reduce((sum, item) => sum + (item.total_actual_quantity || 0), 0);
        const costPerPack = totalPacks > 0 ? Math.round(totalLaborCost / totalPacks) : 0;

        // Profit Calculation
        let totalRevenue = 0;
        let totalMaterialCost = 0;

        items.forEach(item => {
            const qty = item.total_actual_quantity || 0;
            const wholesalePrice = item.wholesale_price || 0;
            const materialCostPerUnit = (
                (item.cost_price || 0) +
                (item.container_cost || 0) +
                (item.wrap_cost || 0) +
                (item.seal_cost || 0) +
                (item.box_cost || 0) +
                (item.other_material_cost || 0)
            );

            totalRevenue += wholesalePrice * qty;
            totalMaterialCost += materialCostPerUnit * qty;
        });

        const grossProfit = totalRevenue - totalMaterialCost - totalLaborCost;
        const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

        return {
            totalAttendanceHours, // Already formatted
            totalProductionManHours,
            nonProductionHours,
            efficiency: Math.floor(efficiency),
            factoryStartTime,
            factoryEndTime,
            totalLaborCost,
            totalPacks,
            costPerPack,
            totalRevenue,
            totalMaterialCost,
            grossProfit,
            profitMargin: Math.round(profitMargin)
        };
    };

    const summary = calculateSummary();

    // Changeover Logic for Timeline
    const allBlocks: { start: Date; end: Date; name: string }[] = [];
    items.forEach(item => {
        (item.logs || []).forEach(log => {
            if (log.status === 'processing') {
                allBlocks.push({
                    start: new Date(log.created_at),
                    end: log.end_time ? new Date(log.end_time) : now,
                    name: item.product_name
                });
            }
        });
    });
    allBlocks.sort((a, b) => a.start.getTime() - b.start.getTime());

    const gaps: { start: Date; end: Date; label: string }[] = [];
    for (let i = 0; i < allBlocks.length - 1; i++) {
        const currentEnd = allBlocks[i].end;
        const nextStart = allBlocks[i + 1].start;
        const gapMs = nextStart.getTime() - currentEnd.getTime();
        if (gapMs > 60000) {
            gaps.push({ start: currentEnd, end: nextStart, label: '段取り' });
        }
    }

    if (!mounted) return null;

    return (
        <DashboardLayout>
            <div className="max-w-7xl mx-auto pb-20">
                {/* Header - Unified Design */}
                <div className="mb-8 bg-white border-b border-slate-200 pb-4">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        {/* Left: Title & Nav */}
                        <div>
                            <Link href="/admin" className="text-slate-500 hover:text-blue-600 font-bold flex items-center mb-1 transition w-fit group">
                                <ChevronLeft size={20} className="mr-1 group-hover:-translate-x-1 transition" />
                                ダッシュボードに戻る
                            </Link>
                            <h1 className="text-3xl font-extrabold text-slate-950 flex items-center">
                                <BarChart3 className="mr-3 text-cyan-600" size={32} />
                                生産管理（分析）
                            </h1>
                            <p className="text-slate-500 font-bold ml-1">製造効率と人件費の分析・管理</p>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-4">
                            {/* Clock Badge */}
                            <div className="hidden md:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-slate-600 font-mono font-bold border border-slate-200">
                                <Clock size={16} />
                                {format(now, 'HH:mm:ss')}
                            </div>

                            {/* Date Picker */}
                            <div className="flex items-center bg-white border border-slate-200 p-1 rounded-xl shadow-sm">
                                <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-50 rounded-lg transition text-slate-600">
                                    <ChevronLeft size={20} />
                                </button>
                                <input
                                    type="date"
                                    value={currentDate}
                                    onChange={(e) => setCurrentDate(e.target.value)}
                                    className="bg-transparent border-none text-lg font-black text-slate-950 mx-2 focus:ring-0 cursor-pointer text-center w-40"
                                />
                                <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-50 rounded-lg transition text-slate-600">
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition">
                            {/* Icon placeholders if needed */}
                        </div>
                        <div className="text-xs font-black text-slate-600 uppercase mb-1">実製造工数</div>
                        <div className="text-3xl font-black text-slate-950 font-mono">
                            {summary.totalProductionManHours.toFixed(1)} <span className="text-lg text-slate-500">h</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-xs font-black text-slate-600 uppercase mb-1">生産性効率</div>
                        <div className={`text-3xl font-black font-mono ${summary.efficiency >= 100 ? 'text-green-600' : 'text-slate-950'}`}>
                            {summary.efficiency}<span className="text-lg">%</span>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border-2 border-slate-900 shadow-sm transform hover:-translate-y-1 transition text-slate-950">
                        <div className="text-xs font-black uppercase mb-1 flex items-center gap-2">
                            <span>平均人件費 / Pack</span>
                            <span className="bg-slate-100 text-[10px] px-1.5 py-0.5 rounded text-slate-600">Cost/Pack</span>
                        </div>
                        <div className="text-3xl font-black font-mono tracking-tight">
                            ¥{summary.costPerPack.toLocaleString()}
                        </div>
                        <div className="text-xs font-bold text-slate-500 mt-1">
                            総製造: {summary.totalPacks.toLocaleString()} pk
                        </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-xs font-black text-slate-600 uppercase mb-1">総人件費 (推定)</div>
                        <div className="text-3xl font-black text-slate-950 font-mono">
                            ¥{summary.totalLaborCost.toLocaleString()}
                        </div>
                    </div>

                    <div className={`p-6 rounded-2xl border-2 shadow-lg transform hover:-translate-y-1 transition ${summary.grossProfit >= 0
                        ? 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-600'
                        : 'bg-gradient-to-br from-red-50 to-orange-50 border-red-600'
                        }`}>
                        <div className="text-xs font-black uppercase mb-1 flex items-center gap-2">
                            <span className={summary.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}>想定粗利</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${summary.grossProfit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {summary.profitMargin}%
                            </span>
                        </div>
                        <div className={`text-3xl font-black font-mono tracking-tight ${summary.grossProfit >= 0 ? 'text-emerald-900' : 'text-red-900'
                            }`}>
                            {summary.grossProfit >= 0 ? '+' : ''}¥{summary.grossProfit.toLocaleString()}
                        </div>
                        <div className="text-xs font-bold mt-1 opacity-70">
                            売上: ¥{summary.totalRevenue.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Gantt Chart Section */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
                    <h2 className="text-xl font-extrabold text-slate-950 mb-6 flex items-center">
                        <Calendar size={24} className="mr-2" />
                        生産工程ガントチャート
                    </h2>

                    <div className="relative h-64 bg-slate-100 rounded-xl overflow-hidden border border-slate-300">
                        {Array.from({ length: 13 }).map((_, i) => (
                            <div key={i} className="absolute top-0 bottom-0 border-l border-slate-300 text-[10px] text-slate-500 pl-1 font-mono"
                                style={{ left: `${(i / 12) * 100}%` }}>
                                {8 + i}:00
                            </div>
                        ))}

                        {/* Attendance Range */}
                        {summary.factoryStartTime && summary.factoryEndTime && (
                            <div
                                className="absolute top-0 bottom-0 bg-white/50 border-x-2 border-slate-400/50"
                                style={{
                                    left: `${Math.max(0, (parseInt(summary.factoryStartTime.split(':')[0]) - 8 + parseInt(summary.factoryStartTime.split(':')[1]) / 60) / 12 * 100)}%`,
                                    right: `${Math.max(0, 100 - ((parseInt(summary.factoryEndTime.split(':')[0]) - 8 + parseInt(summary.factoryEndTime.split(':')[1]) / 60) / 12 * 100))}%`
                                }}
                            >
                                <div className="absolute top-1 left-1 text-[10px] font-bold text-slate-600">OPEN</div>
                            </div>
                        )}

                        {/* Production Bars */}
                        {items.map((item, idx) => {
                            const colors = ['bg-blue-600', 'bg-indigo-600', 'bg-violet-600', 'bg-purple-600', 'bg-fuchsia-600', 'bg-pink-600'];
                            const color = colors[idx % colors.length];

                            return (item.logs || []).map((log, logIdx) => {
                                if (log.status !== 'processing') return null;
                                const start = new Date(log.created_at);
                                const end = log.end_time ? new Date(log.end_time) : now;

                                const startH = start.getHours() + start.getMinutes() / 60;
                                const endH = end.getHours() + end.getMinutes() / 60;

                                const safeStart = Math.max(8, startH);
                                const safeEnd = Math.min(20, endH);

                                const leftPct = ((safeStart - 8) / 12) * 100;
                                const widthPct = ((safeEnd - safeStart) / 12) * 100;

                                if (widthPct <= 0) return null;

                                return (
                                    <div
                                        key={`${item.product_id}-${logIdx}`}
                                        className={`absolute h-8 rounded-md shadow-sm ${color} hover:brightness-110 transition-all opacity-90 border border-white/20`}
                                        style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: `${20 + (idx * 10) % 70}%` }}
                                        title={`${item.product_name} (${format(start, 'HH:mm')} - ${format(end, 'HH:mm')})`}
                                    >
                                        <div className="text-xs text-white font-bold px-2 truncate leading-8">{item.product_name}</div>
                                    </div>
                                );
                            });
                        })}

                        {/* Changeover Gaps */}
                        {gaps.map((gap, idx) => {
                            const startH = gap.start.getHours() + gap.start.getMinutes() / 60;
                            const endH = gap.end.getHours() + gap.end.getMinutes() / 60;
                            const safeStart = Math.max(8, startH);
                            const safeEnd = Math.min(20, endH);
                            const leftPct = ((safeStart - 8) / 12) * 100;
                            const widthPct = ((safeEnd - safeStart) / 12) * 100;

                            if (widthPct <= 0) return null;

                            return (
                                <div
                                    key={`gap-${idx}`}
                                    className="absolute h-full bg-stripes-gray opacity-30 top-0 border-x border-dashed border-slate-400 z-0 flex items-center justify-center group"
                                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                >
                                    <div className="hidden group-hover:block absolute top-2 bg-black text-white text-xs px-2 py-1 rounded">
                                        段取り: {Math.round((gap.end.getTime() - gap.start.getTime()) / 60000)}分
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Items Detail Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h3 className="font-extrabold text-slate-950">商品別製造実績・利益分析</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 text-slate-950 uppercase text-xs font-black">
                                <tr>
                                    <th className="px-6 py-3">商品名</th>
                                    <th className="px-6 py-3">予定 / 実績</th>
                                    <th className="px-6 py-3">投入人数</th>
                                    <th className="px-6 py-3 text-right">実稼働時間</th>
                                    <th className="px-6 py-3 text-right">推定人件費</th>
                                    <th className="px-6 py-3 text-right">売上</th>
                                    <th className="px-6 py-3 text-right">材料費</th>
                                    <th className="px-6 py-3 text-right">粗利</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {items.map((item) => {
                                    let itemTotalMinutes = 0;
                                    (item.logs || []).forEach(l => {
                                        if (l.status === 'processing') itemTotalMinutes += getDurationMinutes(l.created_at, l.end_time);
                                    });
                                    // 1500 JPY/h assumption as per original code -> Updated to 1100 as per verification request
                                    const uniqueCost = Math.floor(itemTotalMinutes * (1100 / 60) * (item.worker_count || 1));

                                    // Profit calculations
                                    const qty = item.total_actual_quantity || 0;
                                    const revenue = (item.wholesale_price || 0) * qty;
                                    const materialCost = (
                                        (item.cost_price || 0) +
                                        (item.container_cost || 0) +
                                        (item.wrap_cost || 0) +
                                        (item.seal_cost || 0) +
                                        (item.box_cost || 0) +
                                        (item.other_material_cost || 0)
                                    ) * qty;
                                    const profit = revenue - materialCost - uniqueCost;

                                    return (
                                        <tr key={item.product_id} className="hover:bg-slate-50 transition">
                                            <td className="px-6 py-4 font-bold text-slate-950">
                                                <div className="flex items-center gap-2">
                                                    {item.product_name}
                                                    {item.has_correction && (
                                                        <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded border border-red-200 whitespace-nowrap">
                                                            修正依頼
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-950">
                                                {item.total_quantity} / <span className={item.total_actual_quantity >= item.total_quantity ? 'text-green-600 font-bold' : ''}>{item.total_actual_quantity}</span> {item.unit}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-950">{item.worker_count}名</td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-slate-950">{(Math.floor((itemTotalMinutes / 60) * 100) / 100).toFixed(2)} h</td>
                                            <td className="px-6 py-4 text-right font-mono text-slate-500">¥{uniqueCost.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-right font-mono text-slate-950 font-bold">¥{revenue.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-right font-mono text-slate-500">¥{materialCost.toLocaleString()}</td>
                                            <td className={`px-6 py-4 text-right font-mono font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                                                }`}>
                                                {profit >= 0 ? '+' : ''}¥{profit.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DashboardLayout >
    );
}
