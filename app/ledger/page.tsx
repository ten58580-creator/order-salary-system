'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { calculateIncomeTax } from '@/utils/taxCalculator';
import DashboardLayout from '@/components/DashboardLayout';
import { startOfMonth, endOfMonth, format, subMonths, addMonths, parse } from 'date-fns';
import { FileText, Printer, Save, RefreshCw, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { calculateNetWorkingMinutes, calculateSalary, formatHoursFromMinutes } from '@/utils/laborCalculator';

type Staff = Database['public']['Tables']['staff']['Row'];
// type Timecard = Database['public']['Tables']['timecards']['Row'];

const COMPANY_NAME = "株式会社TEN&A"; // 自社名

interface LedgerEntry {
    staff: Staff;
    totalHours: number;
    grossWage: number;
    incomeTax: number;
    netPay: number;
}

function LedgerPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryMonth = searchParams.get('month');

    // Initialize date
    const initialDate = queryMonth
        ? parse(queryMonth, 'yyyy-MM', new Date())
        : new Date();

    const [currentDate, setCurrentDate] = useState<Date>(
        isNaN(initialDate.getTime()) ? new Date() : initialDate
    );

    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState(true);

    // Sync state
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
            const startStr = format(startOfMonth(currentDate), 'yyyy-MM-dd') + 'T00:00:00';
            const endStr = format(endOfMonth(currentDate), 'yyyy-MM-dd') + 'T23:59:59';

            // Fetch Staff
            const { data: staffData, error: staffError } = await supabase
                .from('staff')
                .select('*')
                .order('id');

            if (staffError) throw staffError;

            // Filter out admins and Sort by PIN ascending
            const sortedStaff = (staffData || [])
                .filter((s) => s.role !== 'admin')
                .sort((a, b) => {
                    // PIN: Ascending
                    const pinA = parseInt(a.pin || '999999');
                    const pinB = parseInt(b.pin || '999999');
                    return pinA - pinB;
                });

            // Fetch Timecard Logs
            const { data: logsData, error: logsError } = await supabase
                .from('timecard_logs')
                .select('*')
                .gte('timestamp', startStr)
                .lte('timestamp', endStr)
                .order('timestamp', { ascending: true });

            if (logsError) throw logsError;

            // Aggregate
            const ledgerEntries = sortedStaff.map((staff) => {
                const staffLogs = (logsData || []).filter(l => l.staff_id === staff.id);

                // Group by day to calculate daily work minutes
                const dailyLogs = new Map<string, typeof staffLogs>();
                staffLogs.forEach(log => {
                    const dateStr = format(new Date(log.timestamp), 'yyyy-MM-dd');
                    if (!dailyLogs.has(dateStr)) dailyLogs.set(dateStr, []);
                    dailyLogs.get(dateStr)!.push(log);
                });

                let totalMinutes = 0;

                dailyLogs.forEach((dayLogs) => {
                    const sorted = dayLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                    const firstIn = sorted.find(l => l.event_type === 'clock_in');
                    const lastOut = sorted.slice().reverse().find(l => l.event_type === 'clock_out');

                    if (firstIn && lastOut) {
                        const start = new Date(firstIn.timestamp);
                        const end = new Date(lastOut.timestamp);
                        const grossMinutes = calculateNetWorkingMinutes(start, end);

                        let totalBreakMinutes = 0;
                        // Calculate break time
                        let currentBreakStart: typeof staffLogs[0] | null = null;

                        sorted.forEach(log => {
                            const logTime = new Date(log.timestamp);
                            if (logTime < start || logTime > end) return;

                            if (log.event_type === 'break_start') {
                                if (!currentBreakStart) currentBreakStart = log;
                            } else if (log.event_type === 'break_end') {
                                if (currentBreakStart) {
                                    const bStart = new Date(currentBreakStart.timestamp);
                                    const bEnd = logTime;
                                    const bMinutes = calculateNetWorkingMinutes(bStart, bEnd);
                                    totalBreakMinutes += bMinutes;
                                    currentBreakStart = null;
                                }
                            }
                        });

                        totalMinutes += Math.max(0, grossMinutes - totalBreakMinutes);
                    }
                });

                const hourlyWage = staff.hourly_wage || 0;

                // Use unified calculator
                const grossWage = calculateSalary(totalMinutes, hourlyWage);
                const totalHours = formatHoursFromMinutes(totalMinutes);

                // Tax
                // Note: Ledger usually focuses on Gross, Tax, Net. 
                // Using the specific tax calculator logic
                const incomeTax = calculateIncomeTax(grossWage, staff.dependents ?? 0, staff.tax_category);
                const netPay = grossWage - incomeTax;

                return {
                    staff,
                    totalHours,
                    grossWage,
                    incomeTax,
                    netPay,
                };
            });

            setEntries(ledgerEntries);
        } catch (error) {
            console.error('Error fetching ledger data:', error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate]);

    const navigateMonth = (direction: 'next' | 'prev') => {
        const nextDate = direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
        const nextMonthStr = format(nextDate, 'yyyy-MM');
        router.push(`/ledger?month=${nextMonthStr}`);
    };

    const goBack = () => {
        const monthStr = format(currentDate, 'yyyy-MM');
        router.push(`/?month=${monthStr}`);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            <DashboardLayout>
                <div className="mb-6 no-print">
                    <button onClick={goBack} className="flex items-center text-gray-500 hover:text-gray-700 mb-4">
                        <ArrowLeft size={20} className="mr-1" /> ダッシュボードへ戻る
                    </button>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex items-center space-x-3">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                                <FileText size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">賃金台帳</h2>
                                <p className="text-gray-500 text-sm">源泉徴収税額を含む月次集計</p>
                            </div>
                        </div>

                        <div className="flex items-center space-x-3 bg-gray-50 p-1 rounded-lg no-print">
                            <button onClick={() => navigateMonth('prev')} className="p-1 hover:bg-white rounded shadow-sm text-gray-600">
                                <ChevronLeft size={20} />
                            </button>
                            <span className="font-bold text-gray-800 w-32 text-center">
                                {format(currentDate, 'yyyy年 MM月')}
                            </span>
                            <button onClick={() => navigateMonth('next')} className="p-1 hover:bg-white rounded shadow-sm text-gray-600">
                                <ChevronRight size={20} />
                            </button>
                            <button onClick={fetchData} className="p-1 hover:bg-white rounded shadow-sm text-gray-600 ml-2">
                                <RefreshCw size={18} />
                            </button>
                        </div>



                        <div className="flex space-x-3 no-print">
                            <button className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-sm transition">
                                <Save size={18} />
                                <span>DB保存</span>
                            </button>
                            <button onClick={handlePrint} className="flex items-center space-x-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 shadow-sm transition">
                                <Printer size={18} />
                                <span>印刷 / PDF保存</span>
                            </button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12 text-gray-500">読み込み中...</div>
                ) : (
                    <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
                        <div>
                            <table className="min-w-full divide-y divide-gray-100" style={{ borderCollapse: 'collapse' }}>
                                <thead style={{ backgroundColor: '#f9fafb' }}>
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#6b7280' }}>氏名</th>
                                        <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#6b7280' }}>労働時間</th>
                                        <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#6b7280' }}>総支給額</th>
                                        <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#6b7280' }}>所得税</th>
                                        <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider" style={{ color: '#6b7280' }}>差引支給額</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100" style={{ backgroundColor: '#ffffff' }}>
                                    {entries.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center" style={{ color: '#6b7280' }}>データがありません</td>
                                        </tr>
                                    ) : (
                                        entries.map((entry) => (
                                            <tr key={entry.staff.id} className="break-inside-avoid" style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td className="px-6 py-4 whitespace-nowrap font-medium" style={{ color: '#111827' }}>
                                                    {entry.staff.name}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right" style={{ color: '#374151' }}>
                                                    {entry.totalHours.toFixed(2)} h
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right" style={{ color: '#374151' }}>
                                                    ¥{entry.grossWage.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right" style={{ color: '#dc2626' }}>
                                                    ¥{entry.incomeTax.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right font-bold" style={{ color: '#111827' }}>
                                                    ¥{entry.netPay.toLocaleString()}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                    {/* Total Row */}
                                    {entries.length > 0 && (
                                        <tr className="font-bold border-t-2" style={{ backgroundColor: '#f3f4f6', borderColor: '#d1d5db' }}>
                                            <td className="px-6 py-4 whitespace-nowrap" style={{ color: '#111827' }}>
                                                合計
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right" style={{ color: '#111827' }}>
                                                {entries.reduce((sum, e) => sum + e.totalHours, 0).toFixed(2)} h
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right" style={{ color: '#111827' }}>
                                                {entries.reduce((sum, e) => sum + e.grossWage, 0).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right" style={{ color: '#dc2626' }}>
                                                {entries.reduce((sum, e) => sum + e.incomeTax, 0).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right" style={{ color: '#111827' }}>
                                                {entries.reduce((sum, e) => sum + e.netPay, 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </DashboardLayout>

            {/* Dedicated Print/PDF View */}
            <div className="hidden print:block w-full">
                <div className="print-only-header">
                    <h1>賃金台帳</h1>
                    <div className="meta">
                        <p>{COMPANY_NAME}</p>
                        <p>対象月: {format(currentDate, 'yyyy年 MM月')}</p>
                    </div>
                </div>


                <table className="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr>
                            <th className="w-[30%]">氏名</th>
                            <th className="text-right">労働時間</th>
                            <th className="text-right">総支給額</th>
                            <th className="text-right">所得税</th>
                            <th className="text-right">差引支給額</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-8 text-center" style={{ color: '#6b7280' }}>データがありません</td>
                            </tr>
                        ) : (
                            entries.map((entry) => (
                                <tr key={entry.staff.id} className="break-inside-avoid">
                                    <td className="font-medium" style={{ color: '#000000' }}>
                                        {entry.staff.name}
                                    </td>
                                    <td className="text-right" style={{ color: '#000000' }}>
                                        {entry.totalHours.toFixed(2)} h
                                    </td>
                                    <td className="text-right" style={{ color: '#000000' }}>
                                        ¥{entry.grossWage.toLocaleString()}
                                    </td>
                                    <td className="text-right" style={{ color: '#dc2626' }}>
                                        ¥{entry.incomeTax.toLocaleString()}
                                    </td>
                                    <td className="text-right font-bold" style={{ color: '#000000' }}>
                                        ¥{entry.netPay.toLocaleString()}
                                    </td>
                                </tr>
                            ))
                        )}
                        {/* Total Row */}
                        {entries.length > 0 && (
                            <tr>
                                <td className="text-left font-black text-lg border-t-2 border-black">
                                    合計
                                </td>
                                <td className="text-right font-mono font-black text-lg border-t-2 border-black">
                                    {entries.reduce((sum, e) => sum + e.totalHours, 0).toFixed(2)} h
                                </td>
                                <td className="text-right font-mono font-black text-lg border-t-2 border-black">
                                    {entries.reduce((sum, e) => sum + e.grossWage, 0).toLocaleString()}
                                </td>
                                <td className="text-right font-mono font-black text-lg border-t-2 border-black">
                                    {entries.reduce((sum, e) => sum + e.incomeTax, 0).toLocaleString()}
                                </td>
                                <td className="text-right font-mono font-black text-lg border-t-2 border-black">
                                    {entries.reduce((sum, e) => sum + e.netPay, 0).toLocaleString()}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}

export default function LedgerPage() {
    return (
        <Suspense fallback={<div className="text-center py-12">読み込み中...</div>}>
            <LedgerPageContent />
        </Suspense>
    );
}
