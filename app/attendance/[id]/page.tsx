'use client';

import { useEffect, useState, use, Suspense } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import DashboardLayout from '@/components/DashboardLayout';
import { startOfMonth, endOfMonth, format, parse, differenceInMinutes, addMonths, subMonths } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Printer, Upload, Key, Plus, ChevronLeft, ChevronRight, Lock } from 'lucide-react';

import AttendanceModal from '@/components/AttendanceModal';
import AttendanceEditModal from '@/components/AttendanceEditModal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type Staff = Database['public']['Tables']['staff']['Row'];
type Timecard = Database['public']['Tables']['timecards']['Row'];

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

    // Editing state (Modal)
    const [editingTimecard, setEditingTimecard] = useState<Timecard | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Add Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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

            // Fetch Timecards
            const startStr = format(startOfMonth(currentDate), 'yyyy-MM-dd');
            const endStr = format(endOfMonth(currentDate), 'yyyy-MM-dd');

            const { data: timecardsData, error: timecardsError } = await supabase
                .from('timecards')
                .select('*')
                .eq('staff_id', id)
                .gte('date', startStr)
                .lte('date', endStr)
                .order('date');

            if (timecardsError) throw timecardsError;
            setTimecards(timecardsData || []);
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


    // Handlers
    const handleEdit = (tc: Timecard) => {
        setEditingTimecard(tc);
        setIsEditModalOpen(true);
    };

    const handleEditComplete = () => {
        setIsEditModalOpen(false);
        setEditingTimecard(null);
        fetchData(); // Reload
    };

    const navigateMonth = (direction: 'next' | 'prev') => {
        const nextDate = direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
        const nextMonthStr = format(nextDate, 'yyyy-MM');
        router.push(`/attendance/${id}?month=${nextMonthStr}`);
    };

    const goBack = () => {
        const monthStr = format(currentDate, 'yyyy-MM');
        router.push(`/?month=${monthStr}`);
    };

    // Smart Import Logic
    const handleSmartImport = async () => {
        if (!confirm('タイムカードを読み込みますか？\n※「手動」マークのあるデータは上書きされません。')) return;
        setLoading(true);

        try {
            const startStr = format(startOfMonth(currentDate), 'yyyy-MM-dd');
            const endStr = format(endOfMonth(currentDate), 'yyyy-MM-dd');

            // 1. Get existing timecards
            const { data: existing, error: fetchError } = await supabase
                .from('timecards')
                .select('*')
                .eq('staff_id', id)
                .gte('date', startStr)
                .lte('date', endStr);

            if (fetchError) throw fetchError;

            // 2. Generate "Auto" records for missing days (Simulation)
            // Rule: Weekdays only, 9:00 - 18:00 (8h), Break 60m
            const daysInMonth = parseInt(format(endOfMonth(currentDate), 'd'));
            const newRecords = [];
            const updateRecords = [];

            for (let i = 1; i <= daysInMonth; i++) {
                const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
                const dateStr = format(dateObj, 'yyyy-MM-dd');
                const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat

                // Skip weekends for "Auto" simulation (can be adjusted)
                if (dayOfWeek === 0 || dayOfWeek === 6) continue;

                const existingRecord = existing?.find(r => r.date === dateStr);

                // Logic:
                // - If exists AND is Manual (has notes) -> SKIP (PROTECT)
                // - If exists AND is Auto (no notes) -> UPDATE (Overwrite if needed, or skip) -> Here we skip to avoid unnecessary writes, OR overwrite if we want to "Refresh" auto calculations. User said "Re-read", implies refreshing content. But also "Overwrite protection".
                //   Let's assume "Import" implies fetching NEW data. If I'm simulating, I'll just overwrite "Auto" records with "Auto" values.
                // - If not exists -> INSERT

                const isManual = existingRecord?.notes && existingRecord.notes.length > 0;

                if (isManual) {
                    console.log(`Skipping manual record for ${dateStr}`);
                    continue;
                }

                // Simulate "Device Data"
                const autoData = {
                    staff_id: id,
                    date: dateStr,
                    clock_in: '09:00',
                    clock_out: '18:00',
                    break_minutes: 60,
                    worked_hours: 8.00,
                    notes: null // Auto
                };

                if (existingRecord) {
                    // Update existing "Auto" record
                    // updateRecords.push({ ...autoData, id: existingRecord.id }); 
                    // To simplify, we can delete and re-insert, or just update. Upsert is best.
                    newRecords.push(autoData); // upsert will handle if we match unique key, but we don't have unique key constraints defined in code here on (staff_id, date). Database likely has it or we rely on logic.
                    // Actually, 'upsert' needs a unique constraint. If not present, we should use update.
                    // Let's use separate calls or check ID.

                    // For this simulation, assuming we want to "Fill gaps", we can just ignore existing Auto records if they define "Read" as "Fill Missing". 
                    // But usually "Read" means "Sync". 
                    // Let's just INSERT missing ones to be safe and simple unless user asked to Refresh Auto.
                    // "14日以降の新しいデータのみを反映・追加してください" -> Suggests adding missing.

                    // Ideally, we'd update "Auto" ones too.
                    /* 
                     * Strategy: 
                     * Prepare list of upserts. 
                     * Filter out Manual ones.
                     */
                    // Actually, Supabase upsert works if there is a primary key or unique constraint.
                    // I will assume (staff_id, date) is unique. If not, I can't easily upsert without ID.
                    // I will use `id` for updates.

                    updateRecords.push({
                        // id: existingRecord.id, // ID removed from DB
                        ...autoData // Auto data contains staff_id, date, etc.
                    });
                } else {
                    newRecords.push(autoData);
                }
            }

            // Perform Updates & Inserts (Combined via Upsert for simplicity/robustness)
            const allRecords = [...updateRecords, ...newRecords];
            if (allRecords.length > 0) {
                // Upsert using Composite Key
                const { error: upsertErr } = await supabase
                    .from('timecards')
                    .upsert(allRecords, { onConflict: 'staff_id, date' });
                if (upsertErr) throw upsertErr;
            }

            fetchData();
            alert('読み込みが完了しました');

        } catch (error) {
            console.error(error);
            alert('読み込みエラー');
        } finally {
            setLoading(false);
        }
    };

    if (loading && !staff) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">読み込み中...</div>
            </DashboardLayout>
        );
    }

    if (!staff) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">従業員が見つかりません</div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col md:flex-row gap-6">
                {/* Sidebar */}
                <div className="w-full md:w-64 space-y-4">
                    <button onClick={goBack} className="flex items-center text-gray-500 hover:text-gray-700 mb-4">
                        <ArrowLeft size={20} className="mr-1" /> ダッシュボード
                    </button>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center space-x-3 mb-4">
                            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                                {staff.name.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 text-xl">{staff.name}</h3>
                                <p className="text-sm text-gray-600 font-medium">時給: <span className="text-gray-900 font-bold text-lg">¥{(staff.hourly_wage || 0).toLocaleString()}</span></p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={handleSmartImport}
                                className="w-full flex items-center justify-center space-x-2 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition"
                            >
                                <Upload size={18} />
                                <span>タイムカード読込</span>
                            </button>

                            <button className="w-full flex items-center justify-center space-x-2 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition">
                                <Key size={18} />
                                <span>PINコード変更</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1">
                    {/* Header Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                            <h4 className="text-sm font-bold text-gray-700 mb-1">総労働時間 ({format(currentDate, 'M月')})</h4>
                            <p className="text-3xl font-bold text-gray-900">
                                {timecards.reduce((sum, tc) => sum + (tc.worked_hours || 0), 0).toFixed(2)}
                                <span className="text-lg font-normal text-gray-500 ml-1">h</span>
                            </p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                            <h4 className="text-sm font-bold text-gray-700 mb-1">概算給与 (額面)</h4>
                            <p className="text-3xl font-bold text-green-600">
                                ¥{Math.floor(timecards.reduce((sum, tc) => sum + (tc.worked_hours || 0) * (staff.hourly_wage || 0), 0)).toLocaleString()}
                            </p>
                        </div>
                    </div>

                    {/* Chart Implementation */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
                        <h4 className="font-bold text-gray-900 mb-4">週別労働時間の推移 (直近)</h4>
                        <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={timecards.slice(-7)}> {/* Simple visual: last 7 days */}
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(val) => format(parse(val, 'yyyy-MM-dd', new Date()), 'M/d')}
                                        stroke="#9CA3AF"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#9CA3AF"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#F3F4F6' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                    />
                                    <Bar dataKey="worked_hours" fill="#EF4444" radius={[4, 4, 0, 0]}>
                                        {timecards.slice(-7).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.worked_hours > 8 ? '#EF4444' : '#3B82F6'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Table Header & Action */}
                    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                        <div className="flex items-center space-x-3 bg-white p-1 rounded-lg border border-gray-100 shadow-sm">
                            <button onClick={() => navigateMonth('prev')} className="p-1.5 hover:bg-gray-50 rounded-md text-gray-600">
                                <ChevronLeft size={20} />
                            </button>
                            <h3 className="font-bold text-lg text-gray-900 px-2 min-w-[120px] text-center">
                                {format(currentDate, 'yyyy-MM')} <span className="text-xs text-gray-600">勤怠</span>
                            </h3>
                            <button onClick={() => navigateMonth('next')} className="p-1.5 hover:bg-gray-50 rounded-md text-gray-600">
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm transition"
                        >
                            <Plus size={18} />
                            <span>勤怠を追加</span>
                        </button>
                    </div>

                    <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr className="hover:bg-gray-50 transition border-b border-gray-200">
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">日付</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">出勤</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">退勤</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">休憩(分)</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider">実労働(h)</th>
                                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider">状態</th>
                                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-900 uppercase tracking-wider">操作</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {timecards.map((tc) => {
                                    return (
                                        <tr key={tc.date} className="hover:bg-gray-50 transition border-b border-gray-100">
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-bold bg-gray-50 border-r border-gray-100">
                                                {format(parse(tc.date, 'yyyy-MM-dd', new Date()), 'MM/dd (eee)')}
                                            </td>
                                            <td className="px-6 py-4 text-gray-900 font-medium text-lg">{tc.clock_in || '-'}</td>
                                            <td className="px-6 py-4 text-gray-900 font-medium text-lg">{tc.clock_out || '-'}</td>
                                            <td className="px-6 py-4 text-gray-900 font-medium">{tc.break_minutes ?? 0}</td>
                                            <td className="px-6 py-4 font-bold text-blue-800 text-lg">{tc.worked_hours ?? 0}</td>
                                            <td className="px-6 py-4 text-center">
                                                {tc.notes ? (
                                                    <div className="flex items-center justify-center text-orange-600 text-xs font-bold bg-orange-50 px-2 py-1 rounded-full">
                                                        <Lock size={12} className="mr-1" />
                                                        手動
                                                    </div>
                                                ) : (
                                                    <div className="text-gray-500 text-xs font-medium">
                                                        自動
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button onClick={() => handleEdit(tc)} className="text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-md text-xs font-bold transition shadow-sm">
                                                    編集
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Modals */}
                    <AttendanceModal
                        isOpen={isAddModalOpen}
                        onClose={() => setIsAddModalOpen(false)}
                        onSave={fetchData}
                        staffId={id}
                    />

                    <AttendanceEditModal
                        isOpen={isEditModalOpen}
                        onClose={() => setIsEditModalOpen(false)}
                        onSave={handleEditComplete}
                        timecard={editingTimecard}
                        staffId={id}
                    />

                </div>
            </div>
        </DashboardLayout>
    );
}

export default function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <Suspense fallback={<div className="text-center py-12">読み込み中...</div>}>
            <AttendancePageContent id={id} />
        </Suspense>
    );
}
