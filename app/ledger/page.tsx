'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { calculateIncomeTax } from '@/utils/taxCalculator';
import DashboardLayout from '@/components/DashboardLayout';
import { startOfMonth, endOfMonth, format, subMonths, addMonths, parse } from 'date-fns';
import { FileText, Printer, Save, RefreshCw, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

type Staff = Database['public']['Tables']['staff']['Row'];
// type Timecard = Database['public']['Tables']['timecards']['Row'];

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
            const startStr = format(startOfMonth(currentDate), 'yyyy-MM-dd');
            const endStr = format(endOfMonth(currentDate), 'yyyy-MM-dd');

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

            if (staffError) throw staffError;

            // Fetch Timecards
            const { data: timecardsData, error: timecardsError } = await supabase
                .from('timecards')
                .select('*')
                .gte('date', startStr)
                .lte('date', endStr);

            if (timecardsError) throw timecardsError;

            // Aggregate
            const ledgerEntries = sortedStaff.map((staff) => {
                const staffTimecards = (timecardsData || []).filter(
                    (tc) => tc.staff_id === staff.id
                );

                const totalHours = staffTimecards.reduce((sum, tc) => {
                    return sum + (tc.worked_hours ?? 0);
                }, 0);

                const hourlyWage = staff.hourly_wage || 0;
                const grossWage = Math.floor(totalHours * hourlyWage);
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

    return (
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

                    {/* Printable Month Header (Visible only in print) */}
                    <div className="hidden print-only text-2xl font-bold text-center mb-4">
                        {format(currentDate, 'yyyy年 MM月')} 賃金台帳
                    </div>

                    <div className="flex space-x-3 no-print">
                        <button className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-sm transition">
                            <Save size={18} />
                            <span>DB保存</span>
                        </button>
                        <button onClick={() => window.print()} className="flex items-center space-x-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 shadow-sm transition">
                            <Printer size={18} />
                            <span>印刷 / PDF</span>
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">読み込み中...</div>
            ) : (
                <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">氏名</th>
                                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">労働時間</th>
                                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">総支給額</th>
                                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">所得税</th>
                                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">差引支給額</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {entries.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">データがありません</td>
                                </tr>
                            ) : (
                                entries.map((entry) => (
                                    <tr key={entry.staff.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                            {entry.staff.name}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-gray-700">
                                            {entry.totalHours.toFixed(2)} h
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-gray-700">
                                            ¥{entry.grossWage.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-red-600">
                                            ¥{entry.incomeTax.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-gray-900">
                                            ¥{entry.netPay.toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                            {/* Total Row */}
                            {entries.length > 0 && (
                                <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                                        合計
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900">
                                        {entries.reduce((sum, e) => sum + e.totalHours, 0).toFixed(2)} h
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900">
                                        ¥{entries.reduce((sum, e) => sum + e.grossWage, 0).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-red-600">
                                        ¥{entries.reduce((sum, e) => sum + e.incomeTax, 0).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900">
                                        ¥{entries.reduce((sum, e) => sum + e.netPay, 0).toLocaleString()}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </DashboardLayout>
    );
}

export default function LedgerPage() {
    return (
        <Suspense fallback={<div className="text-center py-12">読み込み中...</div>}>
            <LedgerPageContent />
        </Suspense>
    );
}
