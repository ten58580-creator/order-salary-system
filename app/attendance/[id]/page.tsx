'use client';

import { useEffect, useState, use, Suspense } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import DashboardLayout from '@/components/DashboardLayout';
import { startOfMonth, endOfMonth, format, parse, differenceInMinutes, addMonths, subMonths } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Upload, Key, ChevronLeft, ChevronRight, Lock, Pencil, Trash2 } from 'lucide-react';
import AttendanceEditModal from '@/components/AttendanceEditModal';
import { calculateNetWorkingMinutes, formatHoursFromMinutes } from '@/utils/laborCalculator';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type Staff = Database['public']['Tables']['staff']['Row'];
type Timecard = {
    id: string; // Fake ID for display
    staff_id: string;
    date: string;
    clock_in: string | null;
    clock_out: string | null;
    break_start_time: string | null;
    break_end_time: string | null;
    break_minutes: number;
    worked_hours: number;
    notes: string;
    created_at: string;
};

// Manual definition since it's missing in generated types
type TimecardLog = {
    id: string;
    staff_id: string;
    timestamp: string;
    event_type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end' | string;
    created_at: string;
    is_modified_by_admin?: boolean;
};

function AttendancePageContent({ id }: { id: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryMonth = searchParams.get('month');

    // Initialize date
    const initialDate = queryMonth
        ? parse(queryMonth, 'yyyy-MM', new Date())
        : new Date();

    // Ensure valid date
    const [currentDate, setCurrentDate] = useState<Date>(
        isNaN(initialDate.getTime()) ? new Date() : initialDate
    );

    const [staff, setStaff] = useState<Staff | null>(null);
    const [timecards, setTimecards] = useState<Timecard[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedTimecard, setSelectedTimecard] = useState<Timecard | null>(null);

    // Sync state if URL changes
    useEffect(() => {
        if (queryMonth) {
            const d = parse(queryMonth, 'yyyy-MM', new Date());
            if (!isNaN(d.getTime())) {
                setCurrentDate(d);
            }
        }
    }, [queryMonth]);

    async function fetchData() {
        try {
            setLoading(true);

            // Fetch Staff
            const { data: staffData, error: staffError } = await supabase
                .from('staff')
                .select('*')
                .eq('id', id)
                .single();

            if (staffError) throw staffError;
            setStaff(staffData);

            // Fetch Timecard Logs
            // Use ISO strings for Supabase query to ensure UTC handling is correct or at least consistent
            const startD = startOfMonth(currentDate);
            const endD = endOfMonth(currentDate);

            // Format for query: YYYY-MM-DD 00:00:00 - Local time perspective
            const startStr = format(startD, 'yyyy-MM-dd') + 'T00:00:00';
            const endStr = format(endD, 'yyyy-MM-dd') + 'T23:59:59';

            const { data: logs, error: logsError } = await supabase
                .from('timecard_logs')
                .select('*')
                .eq('staff_id', id)
                .gte('timestamp', startStr)
                .lte('timestamp', endStr)
                .order('timestamp', { ascending: true });

            if (logsError) throw logsError;

            // Process Logs into Daily Records
            const dailyMap = new Map<string, {
                date: string;
                logs: TimecardLog[];
            }>();

            const daysInMonth = parseInt(format(endD, 'd'));
            for (let i = 1; i <= daysInMonth; i++) {
                const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
                const dateStr = format(d, 'yyyy-MM-dd');
                dailyMap.set(dateStr, {
                    date: dateStr,
                    logs: []
                });
            }

            // Distribute logs
            // Be careful with timezone conversion here. new Date(log.timestamp) -> Local Date
            logs?.forEach(log => {
                const dateStr = format(new Date(log.timestamp), 'yyyy-MM-dd');
                if (dailyMap.has(dateStr)) {
                    dailyMap.get(dateStr)!.logs.push(log);
                }
            });

            // Calculate per day
            const processedTimecards: Timecard[] = [];

            dailyMap.forEach((data, dateStr) => {
                if (data.logs.length === 0) return; // Skip days with no activity

                const sorted = data.logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                const firstIn = sorted.find(l => l.event_type === 'clock_in');
                const lastOut = sorted.slice().reverse().find(l => l.event_type === 'clock_out');

                let clockInStr = null;
                let clockOutStr = null;
                let totalWorkMinutes = 0;
                let totalBreakMinutes = 0;

                if (firstIn) {
                    clockInStr = format(new Date(firstIn.timestamp), 'HH:mm');

                    if (lastOut) {
                        clockOutStr = format(new Date(lastOut.timestamp), 'HH:mm');

                        const start = new Date(firstIn.timestamp);
                        const end = new Date(lastOut.timestamp);

                        // 1. Calculate Gross Duration in Minutes (strict floor)
                        const grossMinutes = calculateNetWorkingMinutes(start, end);

                        let firstBreakStart: Date | null = null;
                        let lastBreakEnd: Date | null = null;

                        // Calculate total break minutes
                        sorted.forEach((log) => {
                            const logTime = new Date(log.timestamp);
                            if (logTime < start || logTime > end) return;

                            if (log.event_type === 'break_start') {
                                if (!firstBreakStart) firstBreakStart = logTime; // Keep track of first break start for display?
                                // Actually, for calculation we need pairs.
                                // We need to find the matching 'break_end' for this 'break_start'
                            }
                        });

                        // Re-iterate to calculate break pairs strictly
                        let currentBreakStartLog: TimecardLog | null = null;

                        sorted.forEach(log => {
                            const logTime = new Date(log.timestamp);
                            if (logTime < start || logTime > end) return;

                            if (log.event_type === 'break_start') {
                                if (!currentBreakStartLog) currentBreakStartLog = log;
                            } else if (log.event_type === 'break_end') {
                                if (currentBreakStartLog) {
                                    const bStart = new Date(currentBreakStartLog.timestamp);
                                    const bEnd = logTime;
                                    const bMinutes = calculateNetWorkingMinutes(bStart, bEnd);
                                    totalBreakMinutes += bMinutes;
                                    currentBreakStartLog = null;
                                }
                            }
                        });

                        // Net Work Minutes
                        totalWorkMinutes = Math.max(0, grossMinutes - totalBreakMinutes);
                    }
                }

                // Push if there is ANY activity
                if (data.logs.length > 0) {
                    // Extract break strings for display (use first start and last end as approx)
                    // ... (existing string extraction logic is fine for display purposes)
                    const sorted = data.logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                    const bStartLog = sorted.find(l => l.event_type === 'break_start');
                    const bEndLog = sorted.slice().reverse().find(l => l.event_type === 'break_end');

                    const bStartStr = bStartLog ? format(new Date(bStartLog.timestamp), 'HH:mm') : null;
                    const bEndStr = bEndLog ? format(new Date(bEndLog.timestamp), 'HH:mm') : null;

                    processedTimecards.push({
                        id: dateStr,
                        staff_id: id,
                        date: dateStr,
                        clock_in: clockInStr,
                        clock_out: clockOutStr,
                        break_start_time: bStartStr,
                        break_end_time: bEndStr,
                        break_minutes: totalBreakMinutes,
                        worked_hours: formatHoursFromMinutes(totalWorkMinutes),
                        notes: '',
                        created_at: new Date().toISOString(),
                    });
                }
            });

            processedTimecards.sort((a, b) => a.date.localeCompare(b.date));
            setTimecards(processedTimecards);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, currentDate]);

    const navigateMonth = (direction: 'next' | 'prev') => {
        const nextDate = direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
        const nextMonthStr = format(nextDate, 'yyyy-MM');
        router.push(`/attendance/${id}?month=${nextMonthStr}`);
    };

    const goBack = () => {
        const monthStr = format(currentDate, 'yyyy-MM');
        router.push(`/?month=${monthStr}`);
    };

    const handleEditClick = (tc: Timecard) => {
        setSelectedTimecard(tc);
        setIsEditModalOpen(true);
    };

    const handleSave = () => {
        fetchData(); // Reload data to reflect changes
    };

    if (loading && !staff) {
        return (
            <DashboardLayout>
                <div className="text-center py-12 font-bold text-slate-500">読み込み中...</div>
            </DashboardLayout>
        );
    }

    if (!staff) {
        return (
            <DashboardLayout>
                <div className="text-center py-12 font-bold text-slate-500">従業員が見つかりません</div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="max-w-7xl mx-auto pb-20">
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Sidebar */}
                    <div className="w-full md:w-64 space-y-4">
                        <button onClick={goBack} className="flex items-center text-slate-500 hover:text-blue-600 mb-4 font-bold transition group w-fit">
                            <ArrowLeft size={20} className="mr-1 group-hover:-translate-x-1 transition" /> ダッシュボード
                        </button>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                                    {staff.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-950 text-xl">{staff.name}</h3>
                                    <p className="text-sm text-slate-500 font-bold">時給: <span className="text-slate-950 font-black text-lg">¥{(staff.hourly_wage || 0).toLocaleString()}</span></p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <button
                                    className="w-full flex items-center justify-center space-x-2 bg-slate-100 text-slate-400 py-3 rounded-lg cursor-not-allowed font-bold"
                                    disabled
                                    title="ログ集計モードのため使用不可"
                                >
                                    <Upload size={18} />
                                    <span>タイムカード読込 (停止中)</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1">
                        {/* Header Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                <h4 className="text-sm font-bold text-slate-500 mb-1">総労働時間 ({format(currentDate, 'M月')})</h4>
                                <p className="text-3xl font-black text-slate-950">
                                    {timecards.reduce((sum, tc) => sum + (tc.worked_hours || 0), 0).toFixed(2)}
                                    <span className="text-lg font-bold text-slate-400 ml-1">h</span>
                                </p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                <h4 className="text-sm font-bold text-slate-500 mb-1">概算給与 (額面)</h4>
                                <p className="text-3xl font-black text-slate-950">
                                    ¥{Math.floor(timecards.reduce((sum, tc) => sum + (tc.worked_hours || 0) * (staff.hourly_wage || 0), 0)).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        {/* Chart Implementation */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-6">
                            <h4 className="font-black text-slate-950 mb-4">日別労働時間 ({format(currentDate, 'yyyy年M月')})</h4>
                            <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={timecards}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={(val) => format(parse(val, 'yyyy-MM-dd', new Date()), 'd')}
                                            stroke="#94A3B8"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            fontWeight="bold"
                                        />
                                        <YAxis
                                            stroke="#94A3B8"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            fontWeight="bold"
                                        />
                                        <Tooltip
                                            cursor={{ fill: '#F8FAFC' }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontWeight: 'bold' }}
                                        />
                                        <Bar dataKey="worked_hours" radius={[4, 4, 0, 0]}>
                                            {timecards.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={(entry.worked_hours || 0) > 8 ? '#EF4444' : '#3B82F6'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Table Header & Action */}
                        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                            <div className="flex items-center space-x-3 bg-white p-1 rounded-lg border border-slate-100 shadow-sm">
                                <button onClick={() => navigateMonth('prev')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition">
                                    <ChevronLeft size={20} />
                                </button>
                                <h3 className="font-black text-lg text-slate-950 px-2 min-w-[120px] text-center">
                                    {format(currentDate, 'yyyy-MM')} <span className="text-xs text-slate-500 font-bold">勤怠</span>
                                </h3>
                                <button onClick={() => navigateMonth('next')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-600 transition">
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="bg-white shadow rounded-xl overflow-hidden border border-slate-100">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-black text-slate-600 uppercase tracking-wider">日付</th>
                                        <th className="px-6 py-4 text-left text-xs font-black text-slate-600 uppercase tracking-wider">出勤</th>
                                        <th className="px-6 py-4 text-left text-xs font-black text-slate-600 uppercase tracking-wider">退勤</th>
                                        <th className="px-6 py-4 text-left text-xs font-black text-slate-600 uppercase tracking-wider">休憩(分)</th>
                                        <th className="px-6 py-4 text-left text-xs font-black text-slate-600 uppercase tracking-wider">実労働(h)</th>
                                        <th className="px-6 py-4 text-center text-xs font-black text-slate-600 uppercase tracking-wider">状態</th>
                                        <th className="px-6 py-4 text-center text-xs font-black text-slate-600 uppercase tracking-wider">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {timecards.length === 0 ? (
                                        <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500 font-bold">データがありません</td></tr>
                                    ) : (
                                        timecards.map((tc) => (
                                            <tr key={tc.date} className="hover:bg-slate-50 transition">
                                                <td className="px-6 py-4 whitespace-nowrap text-slate-950 font-bold bg-slate-50/50">
                                                    {format(parse(tc.date, 'yyyy-MM-dd', new Date()), 'MM/dd (eee)')}
                                                </td>
                                                <td className="px-6 py-4 text-slate-950 font-bold">{tc.clock_in || '-'}</td>
                                                <td className="px-6 py-4 text-slate-950 font-bold">{tc.clock_out || '-'}</td>
                                                <td className="px-6 py-4 text-slate-950 font-medium">{tc.break_minutes || 0}</td>
                                                <td className="px-6 py-4 font-black text-blue-600 text-lg">{tc.worked_hours || 0}</td>
                                                <td className="px-6 py-4 text-center">
                                                    {(tc.clock_in && !tc.clock_out) ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                            勤務中
                                                        </span>
                                                    ) : tc.clock_in ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                                            完了
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-300">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => handleEditClick(tc)}
                                                        className="text-slate-400 hover:text-blue-600 transition p-2 rounded-full hover:bg-blue-50"
                                                    >
                                                        <Pencil size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <AttendanceEditModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSave={handleSave}
                    timecard={selectedTimecard}
                    staffId={id}
                />
            </div>
        </DashboardLayout>
    );
}

export default function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <Suspense fallback={<div className="text-center py-12 font-bold text-slate-500">読み込み中...</div>}>
            <AttendancePageContent id={id} />
        </Suspense>
    );
}
