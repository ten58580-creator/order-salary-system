'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { calculateIncomeTax } from '@/utils/taxCalculator';
import DashboardLayout from '@/components/DashboardLayout';
import { startOfMonth, endOfMonth, format, parse, addMonths, subMonths } from 'date-fns';
import { Printer, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { calculateNetWorkingMinutes, formatHoursFromMinutes } from '@/utils/laborCalculator';

type Staff = Database['public']['Tables']['staff']['Row'];

interface PayslipData {
    staff: Staff;
    yearMonth: string;
    totalHours: number;
    baseWage: number; // Hours * Hourly
    totalAllowances: number;
    totalDeductions: number; // Except Tax
    tax: number;
    netPay: number;
    // Details for rendering
    allowanceItems: { name: string; value: number }[];
    deductionItems: { name: string; value: number }[];
}

function PayslipPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryMonth = searchParams.get('month');

    // Date Init
    const initialDate = queryMonth ? parse(queryMonth, 'yyyy-MM', new Date()) : new Date();
    const [currentDate, setCurrentDate] = useState<Date>(isNaN(initialDate.getTime()) ? new Date() : initialDate);

    const [payslips, setPayslips] = useState<PayslipData[]>([]);
    const [loading, setLoading] = useState(true);

    // Sync URL
    useEffect(() => {
        if (queryMonth) {
            const d = parse(queryMonth, 'yyyy-MM', new Date());
            if (!isNaN(d.getTime())) setCurrentDate(d);
        }
    }, [queryMonth]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const startD = startOfMonth(currentDate);
            const endD = endOfMonth(currentDate);
            // Timecard Logs are stored in UTC or local depending on implementation, but usually timestamp column is timestamptz.
            // We need to query range that covers the whole month in local time.
            const startStr = format(startD, 'yyyy-MM-dd') + 'T00:00:00';
            const endStr = format(endD, 'yyyy-MM-dd') + 'T23:59:59';

            // 1. Fetch Staff
            const idsParam = searchParams.get('ids');
            let query = supabase.from('staff').select('*').neq('role', 'admin').order('id');

            if (idsParam) {
                const ids = idsParam.split(',');
                if (ids.length > 0) {
                    query = query.in('id', ids);
                }
            }

            const { data: staffData, error: staffError } = await query;
            if (staffError) throw staffError;

            // Sort by PIN
            const sortedStaff = (staffData || []).sort((a, b) => {
                const pinA = parseInt(a.pin || '999999');
                const pinB = parseInt(b.pin || '999999');
                return pinA - pinB;
            });

            // 2. Fetch Timecard Logs for ALL staff in range
            // We fetch all logs for the month and filter in memory to match each staff
            const { data: logs, error: logsError } = await supabase
                .from('timecard_logs')
                .select('*')
                .gte('timestamp', startStr)
                .lte('timestamp', endStr)
                .order('timestamp', { ascending: true });

            if (logsError) throw logsError;

            // 3. Calculate for each staff
            const calculated: PayslipData[] = sortedStaff.map(staff => {
                const staffLogs = logs?.filter(l => l.staff_id === staff.id) || [];

                // Group by day to calculate daily work minutes
                const dailyLogs = new Map<string, typeof staffLogs>();
                staffLogs.forEach(log => {
                    const dateStr = format(new Date(log.timestamp), 'yyyy-MM-dd');
                    if (!dailyLogs.has(dateStr)) dailyLogs.set(dateStr, []);
                    dailyLogs.get(dateStr)!.push(log);
                });

                let totalWorkMinutes = 0;

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
                        let currentBreakStartLog: (typeof staffLogs)[0] | null = null;

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

                        totalWorkMinutes += Math.max(0, grossMinutes - totalBreakMinutes);
                    }
                });

                // Format: Hours (for display)
                const totalHours = formatHoursFromMinutes(totalWorkMinutes); // e.g. 1.5

                // Base Wage Calculation (Use minutes for precision if possible, standard is usually Hours * Wage)
                // But laborCalculator has calculateSalary(minutes, wage). Let's use that for better precision?
                // Existing code was: Math.floor(totalHours * hourly_wage).
                // Let's stick to simple Hours * Wage if that's the convention, OR use minute precision.
                // Using minute precision is safer for "lost minutes" errors.
                // Re-using laborCalculator.ts: calculateSalary(minutes, wage) -> floor((min/60)*wage)

                // However, totalHours above is rounded to 2 decimals.
                // Let's use exact minutes for calculation.
                // const baseWage = Math.floor(totalHours * (staff.hourly_wage || 0)); // Old logic
                // New Logic using Minute Precision:
                const baseWage = Math.floor((totalWorkMinutes / 60) * (staff.hourly_wage || 0));


                // Allowances
                const allowanceItems = [];
                if (staff.allowance1_name && staff.allowance1_value) allowanceItems.push({ name: staff.allowance1_name, value: staff.allowance1_value });
                if (staff.allowance2_name && staff.allowance2_value) allowanceItems.push({ name: staff.allowance2_name, value: staff.allowance2_value });
                if (staff.allowance3_name && staff.allowance3_value) allowanceItems.push({ name: staff.allowance3_name, value: staff.allowance3_value });
                const totalAllowances = allowanceItems.reduce((s, i) => s + i.value, 0);

                // Deductions (Fixed)
                const deductionItems = [];
                if (staff.deduction1_name && staff.deduction1_value) deductionItems.push({ name: staff.deduction1_name, value: staff.deduction1_value });
                if (staff.deduction2_name && staff.deduction2_value) deductionItems.push({ name: staff.deduction2_name, value: staff.deduction2_value });
                const totalDeductions = deductionItems.reduce((s, i) => s + i.value, 0);

                const grossForTax = baseWage + totalAllowances;

                // Tax
                const tax = calculateIncomeTax(grossForTax, staff.dependents || 0, staff.tax_category);

                const netPay = (baseWage + totalAllowances) - (totalDeductions + tax);

                return {
                    staff,
                    yearMonth: format(currentDate, 'yyyy年 MM月'),
                    totalHours,
                    baseWage,
                    totalAllowances,
                    totalDeductions,
                    tax,
                    netPay,
                    allowanceItems,
                    deductionItems
                };
            });

            setPayslips(calculated);

        } catch (e) {
            console.error(e);
            alert('データの読み込みに失敗しました');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate]);

    // Navigation
    const navigateMonth = (d: 'next' | 'prev') => {
        const next = d === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
        router.push(`/payslip?month=${format(next, 'yyyy-MM')}`);
    };

    // Layout: 1 person per page (2 copies: Employee & Company)


    return (
        <DashboardLayout>
            {/* Header Controls (No Print) */}
            <div className="mb-6 no-print flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center space-x-4">
                    <button onClick={() => router.push('/ledger')} className="text-gray-500 hover:text-gray-700">
                        <ArrowLeft size={20} />
                    </button>
                    <h2 className="text-xl font-bold text-gray-800">給与明細発行</h2>
                </div>

                <div className="flex items-center space-x-4 mt-4 md:mt-0">
                    <div className="flex items-center bg-gray-50 rounded-lg p-1">
                        <button onClick={() => navigateMonth('prev')} className="p-2 hover:bg-white rounded shadow-sm"><ChevronLeft size={16} /></button>
                        <span className="px-4 font-bold text-gray-700">{format(currentDate, 'yyyy年 MM月')}</span>
                        <button onClick={() => navigateMonth('next')} className="p-2 hover:bg-white rounded shadow-sm"><ChevronRight size={16} /></button>
                    </div>
                    <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-blue-700 transition">
                        <Printer size={18} className="mr-2" />
                        印刷開始
                    </button>
                </div>
            </div>

            {/* Print Content */}
            <div className="bg-gray-100 p-8 min-h-screen overflow-auto print:p-0 print:bg-white">
                {loading ? <div className="text-center py-10">読み込み中...</div> : (
                    <div className="print-container space-y-8 print:space-y-0">
                        {payslips.map((slip, idx) => (
                            <div key={idx} className="print-page bg-white shadow-lg print:shadow-none mx-auto print:mx-0 w-[210mm] min-h-[297mm] p-[10mm] relative flex flex-col justify-between">
                                {/* Top Slip (Employee) */}
                                <PayslipComponent data={slip} label="（本人用）" />

                                {/* Cut Line */}
                                <div className="border-t-2 border-dashed border-gray-300 w-full my-4 relative">
                                    <span className="absolute left-1/2 -top-3 bg-white px-2 text-gray-400 text-xs text-transform:none">キリトリ</span>
                                </div>

                                {/* Bottom Slip (Company) */}
                                <PayslipComponent data={slip} label="（会社保管用）" />
                            </div>
                        ))}
                        {payslips.length === 0 && <div className="text-center text-gray-500">データがありません</div>}
                    </div>
                )}
            </div>

            {/* Global Styles for Print */}
            <style jsx global>{`
                @media print {
                    @page { margin: 0; size: A4; }
                    body { background: white; -webkit-print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .print-page { 
                        width: 100%; height: 100vh; 
                        page-break-after: always; 
                        padding: 10mm;
                    }
                    .print-page:last-child { page-break-after: auto; }
                    /* Reset dashboard layout margins for print */
                    main { margin: 0 !important; padding: 0 !important; }
                }
            `}</style>
        </DashboardLayout>
    );
}

// Single Payslip Component
function PayslipComponent({ data, label }: { data: PayslipData, label: string }) {
    if (!data) return null;
    const { staff, yearMonth, totalHours, baseWage, allowanceItems, totalAllowances, deductionItems, totalDeductions, tax, netPay } = data;

    return (
        <div className="flex-1 flex flex-col border border-gray-800 p-6 text-gray-900 box-border h-[48%] relative">
            <div className="absolute top-2 right-2 text-xs text-gray-500 border border-gray-300 px-2 py-0.5 rounded">
                {label}
            </div>
            {/* Title */}
            <div className="flex justify-between items-end border-b-2 border-gray-800 pb-2 mb-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-wider">給与明細書</h1>
                    <p className="text-sm mt-1">{yearMonth} 分</p>
                </div>
                <div className="text-right">
                    <h2 className="text-xl font-bold">{staff.name} 様</h2>
                    <p className="text-xs text-gray-600">PIN: {staff.pin || '****'}</p>
                </div>
            </div>

            {/* Grid Layout */}
            <div className="flex-1 flex flex-col gap-4">

                {/* 勤怠 Area */}
                <div className="border border-gray-400">
                    <div className="bg-gray-100 text-center font-bold text-sm py-1 border-b border-gray-400">勤怠実績</div>
                    <div className="flex text-sm">
                        <div className="flex-1 text-center py-2 border-r border-gray-300">
                            <span className="block text-xs text-gray-500">総労働時間</span>
                            <span className="font-bold text-lg">{totalHours.toFixed(2)}h</span>
                        </div>
                        <div className="flex-1 text-center py-2 border-r border-gray-300">
                            <span className="block text-xs text-gray-500">時給</span>
                            <span className="font-bold">¥{staff.hourly_wage?.toLocaleString()}</span>
                        </div>
                        <div className="flex-1 text-center py-2">
                            <span className="block text-xs text-gray-500">扶養人数</span>
                            <span className="font-bold">{staff.dependents}人 ({staff.tax_category})</span>
                        </div>
                    </div>
                </div>

                {/* 支給 Area */}
                <div className="flex gap-4 h-full">
                    {/* Payment Side */}
                    <div className="flex-1 border border-gray-400 flex flex-col">
                        <div className="bg-gray-100 text-center font-bold text-sm py-1 border-b border-gray-400">支給の部</div>
                        <div className="p-2 space-y-2 flex-1">
                            {/* Base */}
                            <div className="flex justify-between border-b border-dotted border-gray-300 pb-1">
                                <span>基本給</span>
                                <span className="font-bold">¥{baseWage.toLocaleString()}</span>
                            </div>
                            {/* Allowances */}
                            {allowanceItems.map((item, i) => (
                                <div key={i} className="flex justify-between border-b border-dotted border-gray-300 pb-1 text-sm">
                                    <span>{item.name}</span>
                                    <span>¥{item.value.toLocaleString()}</span>
                                </div>
                            ))}
                            {/* Empty rows filler if needed, or just white space */}
                        </div>
                        <div className="border-t border-gray-400 p-2 bg-gray-50 flex justify-between font-bold">
                            <span>総支給額</span>
                            <span>¥{(baseWage + totalAllowances).toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Deduction Side */}
                    <div className="flex-1 border border-gray-400 flex flex-col">
                        <div className="bg-gray-100 text-center font-bold text-sm py-1 border-b border-gray-400">控除の部</div>
                        <div className="p-2 space-y-2 flex-1">
                            {/* Tax */}
                            <div className="flex justify-between border-b border-dotted border-gray-300 pb-1">
                                <span>所得税 (源泉)</span>
                                <span className="font-bold text-red-600">¥{tax.toLocaleString()}</span>
                            </div>
                            {/* Custom Deductions */}
                            {deductionItems.map((item, i) => (
                                <div key={i} className="flex justify-between border-b border-dotted border-gray-300 pb-1 text-sm">
                                    <span>{item.name}</span>
                                    <span>¥{item.value.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-gray-400 p-2 bg-gray-50 flex justify-between font-bold">
                            <span>控除計</span>
                            <span className="text-red-600">¥{(tax + totalDeductions).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Net Pay */}
            <div className="mt-4 border-2 border-black p-3 flex justify-between items-center bg-gray-50">
                <span className="font-bold text-lg">差引支給額 (振込額)</span>
                <span className="font-bold text-3xl">¥{netPay.toLocaleString()}</span>
            </div>

            <div className="text-right mt-2 text-xs text-gray-500">
                発行日: {format(new Date(), 'yyyy/MM/dd')}
            </div>
        </div>
    );
}

export default function PayslipPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PayslipPageContent />
        </Suspense>
    );
}
