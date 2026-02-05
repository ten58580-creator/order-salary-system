'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { calculateIncomeTax } from '@/utils/taxCalculator';
import DashboardLayout from '@/components/DashboardLayout';
import { startOfMonth, endOfMonth, format, parse, addDays } from 'date-fns';
import { Users, Clock, Banknote, Edit, Trash2, Settings, Download, Cloud, Package, Factory, ChevronLeft } from 'lucide-react';
import StatsCard from '@/components/StatsCard';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import StaffEditModal from '@/components/StaffEditModal';
import DailyDetailModal from '@/components/DailyDetailModal';

type Staff = Database['public']['Tables']['staff']['Row'];

interface StaffSummary {
  staff: Staff;
  totalHours: number;
  totalWage: number;
  estimatedTax: number;
}

interface DailyDetailData {
  date: string;
  details: {
    staffName: string;
    hours: number;
    cost: number;
  }[];
  totalCount: number;
  totalCost: number;
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryMonth = searchParams.get('month');

  // Date
  const initialDate = queryMonth ? parse(queryMonth, 'yyyy-MM', new Date()) : new Date();
  const [currentDate, setCurrentDate] = useState<Date>(isNaN(initialDate.getTime()) ? new Date() : initialDate);

  // Data
  const [summaries, setSummaries] = useState<StaffSummary[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyDetailData[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailModalData, setDetailModalData] = useState<DailyDetailData | null>(null);

  const handleEditStaff = (staff: Staff) => {
    setEditingStaff(staff);
    setIsEditModalOpen(true);
  };

  const handleOpenDetail = (stat: DailyDetailData) => {
    setDetailModalData(stat);
    setIsDetailModalOpen(true);
  };

  // Select Logic
  const toggleSelectAll = () => {
    if (selectedStaffIds.size === summaries.length && summaries.length > 0) {
      setSelectedStaffIds(new Set());
    } else {
      setSelectedStaffIds(new Set(summaries.map(s => s.staff.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedStaffIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedStaffIds(newSet);
  };

  useEffect(() => {
    if (queryMonth) {
      const d = parse(queryMonth, 'yyyy-MM', new Date());
      if (!isNaN(d.getTime())) setCurrentDate(d);
    }
  }, [queryMonth]);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const startStr = format(startOfMonth(currentDate), 'yyyy-MM-dd');
        const endStr = format(endOfMonth(currentDate), 'yyyy-MM-dd');

        // Fetch Staff
        const { data: staffData, error: staffError } = await supabase.from('staff').select('*').order('id');
        if (staffError) throw staffError;

        // Custom Sort: Admin first, then PIN ascending
        const sortedStaff = (staffData || []).sort((a, b) => {
          const isAdminA = a.role === 'admin';
          const isAdminB = b.role === 'admin';
          if (isAdminA && !isAdminB) return -1;
          if (!isAdminA && isAdminB) return 1;
          const pinA = parseInt(a.pin || '999999');
          const pinB = parseInt(b.pin || '999999');
          return pinA - pinB;
        });

        // Fetch Timecards
        const { data: timecardsData, error: timecardsError } = await supabase
          .from('timecards')
          .select('*')
          .gte('date', startStr)
          .lte('date', endStr);
        if (timecardsError) throw timecardsError;

        // Aggregate Staff Summary
        const staffSummaries = sortedStaff.map((staff) => {
          const staffTimecards = (timecardsData || []).filter(tc => tc.staff_id === staff.id);
          const totalHours = staffTimecards.reduce((sum, tc) => sum + (tc.worked_hours ?? 0), 0);
          const hourlyWage = staff.hourly_wage || 0;
          const totalWage = Math.floor(totalHours * hourlyWage);
          const estimatedTax = calculateIncomeTax(totalWage, staff.dependents ?? 0, staff.tax_category);
          return { staff, totalHours, totalWage, estimatedTax };
        });
        setSummaries(staffSummaries);

        // Default Select: None (User Request)
        setSelectedStaffIds(new Set());

        // Daily Aggregation
        const dailyGroups = new Map<string, { staff: Staff, hours: number, cost: number }[]>();
        (timecardsData || []).forEach(tc => {
          if (!tc.date) return;
          const staff = sortedStaff.find(s => s.id === tc.staff_id);
          if (!staff) return;
          const hours = tc.worked_hours || 0;
          const cost = Math.floor(hours * (staff.hourly_wage || 0));
          const list = dailyGroups.get(tc.date) || [];
          list.push({ staff, hours, cost });
          dailyGroups.set(tc.date, list);
        });

        const stats: DailyDetailData[] = Array.from(dailyGroups.entries()).map(([date, items]) => {
          const totalCount = items.length;
          const totalCost = items.reduce((s, i) => s + i.cost, 0);
          return {
            date,
            totalCount,
            totalCost,
            details: items.map(i => ({ staffName: i.staff.name, hours: i.hours, cost: i.cost }))
          };
        }).sort((a, b) => a.date.localeCompare(b.date));

        setDailyStats(stats);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [currentDate, isEditModalOpen]);

  // Aggregated Stats
  const totalStaff = summaries.length;
  const totalHoursAll = summaries.reduce((sum, s) => sum + s.totalHours, 0);
  const totalLaborCost = summaries.reduce((sum, s) => sum + s.totalWage, 0);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) router.push(`/?month=${val}`);
  };

  const currentMonthStr = format(currentDate, 'yyyy-MM');

  const getPayslipUrl = () => {
    if (selectedStaffIds.size === 0) return '#';
    const idsParam = Array.from(selectedStaffIds).join(',');
    return `/payslip?month=${currentMonthStr}&ids=${idsParam}`;
  };


  const handleModalNavigate = (direction: 'prev' | 'next') => {
    if (!detailModalData) return;
    const current = parse(detailModalData.date, 'yyyy-MM-dd', new Date());
    const nextDate = addDays(current, direction === 'next' ? 1 : -1);
    const nextDateStr = format(nextDate, 'yyyy-MM-dd');

    // Limit within the current month view? 
    // User didn't specify, but usually "prev/next" implies just going there. 
    // However, dailyStats only contains data for the *viewed month*.
    // If we go outside the month, dailyStats won't have it.
    // If we want to support crossing months, we would need to fetch data.
    // Given the complexity, let's just show empty for now if outside loaded range,
    // OR just let it show empty. Valid behavior.

    const found = dailyStats.find(s => s.date === nextDateStr);

    if (found) {
      setDetailModalData(found);
    } else {
      setDetailModalData({
        date: nextDateStr,
        details: [],
        totalCount: 0,
        totalCost: 0
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <Link href="/admin" className="text-gray-500 hover:text-blue-600 font-bold flex items-center mb-2 transition w-fit">
            <ChevronLeft size={20} className="mr-1" />
            ダッシュボードに戻る
          </Link>
          <h2 className="text-2xl font-bold text-gray-800">人件費管理（勤怠・給与）</h2>
          <p className="text-gray-700 font-medium">勤怠管理と給与計算の概要 ({format(currentDate, 'yyyy年 MM月')})</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <input type="month" value={format(currentDate, 'yyyy-MM')} onChange={handleDateChange} className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5 shadow-sm" />
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><Clock size={16} className="text-gray-400" /></div>
          </div>
          <button className="bg-blue-600 text-white p-2.5 rounded-lg hover:bg-blue-700 shadow-sm transition"><Users size={18} /></button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">データを読み込み中...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatsCard label="従業員数" value={`${totalStaff} 名`} icon={Users} badge="ACTIVE" />
            <StatsCard label={`総労働時間 (${format(currentDate, 'yyyy-MM')})`} value={`${totalHoursAll.toFixed(1)} h`} icon={Clock} />
            <StatsCard label={`人件費合計 (${format(currentDate, 'yyyy-MM')})`} value={`¥${totalLaborCost.toLocaleString()}`} icon={Banknote} badge={totalLaborCost > 1000000 ? 'HIGH' : undefined} />
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Main Staff List */}
            <div className="flex-1">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-gray-800">従業員一覧</h3>
                <Link href={`/ledger?month=${currentMonthStr}`} className="text-blue-600 text-sm hover:underline">賃金台帳を表示 &rarr;</Link>
              </div>

              <div className="bg-white shadow rounded-xl overflow-hidden border border-gray-100">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-4 text-center">
                        <input type="checkbox" checked={selectedStaffIds.size === summaries.length && summaries.length > 0} onChange={toggleSelectAll} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer" />
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">氏名</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">時給</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">PIN</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">今月の状況</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">操作</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {summaries.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">表示するデータがありません</td></tr>
                    ) : (
                      summaries.map(({ staff, totalHours, totalWage }) => (
                        <tr key={staff.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-4 text-center">
                            <input type="checkbox" checked={selectedStaffIds.has(staff.id)} onChange={() => toggleSelect(staff.id)} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer" />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Link href={`/attendance/${staff.id}?month=${currentMonthStr}`} className="flex items-center group">
                              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold mr-3 group-hover:bg-blue-200 transition">{staff.name.charAt(0)}</div>
                              <div className="font-bold text-gray-900 group-hover:text-blue-600 transition text-lg">{staff.name}</div>
                            </Link>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-bold">¥{(staff.hourly_wage || 0).toLocaleString()}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-gray-600 font-mono font-medium">{staff.pin || '----'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-bold text-gray-900">{totalHours.toFixed(1)}h / <span className="text-gray-900">¥{totalWage.toLocaleString()}</span></div>
                            <div className="text-xs mt-1">
                              {totalHours > 80 ? <span className="text-red-500 flex items-center"><AlertCircle size={12} className="mr-1" /> 週20時間超過</span> : <span className="text-green-500 flex items-center">✔ 正常</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center space-x-3">
                            <button onClick={() => handleEditStaff(staff)} className="text-gray-400 hover:text-blue-600 inline-block p-1"><Edit size={18} /></button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="w-full lg:w-80 space-y-6">
              {/* System Ops */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center space-x-2 text-indigo-600 font-bold mb-4">
                  <Settings size={20} />
                  <span>システム操作</span>
                </div>
                <div className="space-y-3">
                  <button className="w-full flex items-center justify-start px-4 py-3 bg-gray-50 rounded-lg text-gray-700 hover:bg-gray-100 transition">
                    <Settings size={18} className="mr-3 text-gray-400" />
                    システム設定
                  </button>
                  <Link href="/admin/products" className="w-full flex items-center justify-start px-4 py-3 bg-gray-50 rounded-lg text-gray-700 hover:bg-gray-100 transition">
                    <Package size={18} className="mr-3 text-gray-400" />
                    商品・単価管理
                  </Link>
                  <Link href="/admin/orders" className="w-full flex items-center justify-start px-4 py-3 bg-gray-50 rounded-lg text-gray-700 hover:bg-gray-100 transition">
                    <Factory size={18} className="mr-3 text-gray-400" />
                    製造現場管理
                  </Link>
                  {/* Issue Payslip Button */}
                  {selectedStaffIds.size > 0 ? (
                    <Link href={getPayslipUrl()} className="w-full flex items-center justify-start px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition font-bold border border-blue-200 shadow-sm">
                      <Banknote size={18} className="mr-3 text-blue-500" />
                      明細発行 ({selectedStaffIds.size}名)
                    </Link>
                  ) : (
                    <button disabled className="w-full flex items-center justify-start px-4 py-3 bg-gray-100 text-gray-400 rounded-lg font-bold cursor-not-allowed border border-gray-200">
                      <Banknote size={18} className="mr-3 text-gray-400" />
                      明細発行 (0名)
                    </button>
                  )}
                  <button className="w-full flex items-center justify-start px-4 py-3 bg-gray-50 rounded-lg text-gray-700 hover:bg-gray-100 transition">
                    <Download size={18} className="mr-3 text-gray-400" />
                    全データDL (CSV)
                  </button>
                </div>
              </div>

              {/* Slim Daily Summary */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800 text-sm">日別労働状況 (サマリー)</h3>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">人数タップで詳細</span>
                </div>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">日付</th>
                        <th className="px-2 py-2 text-center text-xs font-bold text-gray-600">人数</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-gray-600">人件費</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {dailyStats.length === 0 ? (
                        <tr><td colSpan={3} className="px-3 py-4 text-center text-xs text-gray-500">データなし</td></tr>
                      ) : (
                        dailyStats.map((stat) => (
                          <tr key={stat.date} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs font-bold text-gray-800">
                              {format(parse(stat.date, 'yyyy-MM-dd', new Date()), 'MM/dd (eee)')}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                onClick={() => handleOpenDetail(stat)}
                                className="text-xs bg-blue-100 text-blue-700 px-3 py-0.5 rounded-full hover:bg-blue-600 hover:text-white transition font-bold min-w-[30px]"
                              >
                                {stat.totalCount}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-gray-600 font-mono">
                              ¥{(stat.totalCost / 1000).toFixed(1)}k
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-indigo-600 p-6 rounded-xl shadow-lg text-white">
                <div className="flex items-center mb-4">
                  <Clock className="mr-2" size={20} />
                  <span className="font-bold">労働ルール通知</span>
                </div>
                <div className="bg-indigo-500/50 p-3 rounded-lg text-sm mb-2">
                  <div className="text-indigo-200 text-xs mb-1">週労働時間上限設定</div>
                  <div className="font-bold">パートタイム 20時間以内</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <StaffEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        staff={editingStaff}
        onSave={() => setIsEditModalOpen(false)}
      />

      <DailyDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        data={detailModalData}
        onPrev={() => handleModalNavigate('prev')}
        onNext={() => handleModalNavigate('next')}
      />
    </DashboardLayout>
  );
}

function AlertCircle({ size, className }: { size?: number, className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="text-center py-12">読み込み中...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
