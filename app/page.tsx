'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { calculateIncomeTax } from '@/utils/taxCalculator';
import DashboardLayout from '@/components/DashboardLayout';
import { startOfMonth, endOfMonth, format, parse, addDays, addMonths, eachMonthOfInterval, differenceInSeconds } from 'date-fns';
import { Users, Clock, Banknote, Edit, Trash2, Settings, Download, Search, Archive, Filter, ChevronLeft, ChevronRight, Package, Factory, AlertCircle, ChevronDown, Calendar, ClipboardList } from 'lucide-react';
import StatsCard from '@/components/StatsCard';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import StaffEditModal from '@/components/StaffEditModal';
import DailyDetailModal from '@/components/DailyDetailModal';
import ConfirmationModal from '@/components/ConfirmationModal';
import { calculateNetWorkingMinutes, calculateSalary, formatHoursFromMinutes } from '@/utils/laborCalculator';

import AdminPinModal from '@/components/AdminPinModal';
import { useAdminGuard } from '@/components/AdminGuardContext';
import { Lock } from 'lucide-react';

type Staff = Database['public']['Tables']['staff']['Row'] & {
  is_archived?: boolean;
};

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

import AdminGuard from '@/components/AdminGuard';

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-slate-950 font-bold">読み込み中...</div>}>
      <DashboardGuard>
        <DashboardContent />
      </DashboardGuard>
    </Suspense>
  );
}


function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { isUnlocked } = useAdminGuard();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // If mounted and locked, redirect to admin dashboard (where PIN modal can be triggered by clicking again, 
    // or arguably we could trigger PIN modal here, but user asked "redirect to PIN input OR dashboard".
    // Redirecting to admin dashboard is safer/easier as it centralizes entry.
    if (mounted && !isUnlocked) {
      router.replace('/admin');
    }
  }, [isUnlocked, router, mounted]);

  if (!mounted) return null; // Avoid hydration mismatch
  if (!isUnlocked) return null; // Don't render content while redirecting

  return <>{children}</>;
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isUnlocked } = useAdminGuard();
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const queryMonth = searchParams.get('month');

  // Date
  const initialDate = queryMonth ? parse(queryMonth, 'yyyy-MM', new Date()) : new Date();
  const [currentDate, setCurrentDate] = useState<Date>(isNaN(initialDate.getTime()) ? new Date() : initialDate);
  // Range for Select
  const [availableMonths, setAvailableMonths] = useState<Date[]>([]);

  useEffect(() => {
    const fetchRange = async () => {
      const { data } = await supabase.from('timecard_logs').select('timestamp').order('timestamp', { ascending: true }).limit(1).single();
      let start = new Date();
      if (data && data.timestamp) {
        start = new Date(data.timestamp);
      } else {
        start = addMonths(new Date(), -12);
      }

      const end = new Date(); // Current month
      const startM = startOfMonth(start);
      const endM = startOfMonth(end);

      if (startM > endM) {
        setAvailableMonths([endM]);
        return;
      }

      const months = eachMonthOfInterval({ start: startM, end: endM }).reverse();
      setAvailableMonths(months);
    };
    fetchRange();
  }, []);
  // Data
  const [summaries, setSummaries] = useState<StaffSummary[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyDetailData[]>([]);
  const [totalPacks, setTotalPacks] = useState(0);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit');
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailModalData, setDetailModalData] = useState<DailyDetailData | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger: boolean;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    isDanger: false,
    confirmText: '実行'
  });

  const handleEditStaff = (staff: Staff) => {
    setEditingStaff(staff);
    setModalMode('edit');
    setIsEditModalOpen(true);
  };

  const handleCreateStaff = () => {
    setEditingStaff(null);
    setModalMode('create');
    setIsEditModalOpen(true);
  };

  const handleOpenDetail = (stat: DailyDetailData) => {
    setDetailModalData(stat);
    setIsDetailModalOpen(true);
  };

  const handleArchiveStaff = async (staff: Staff) => {
    if (staff.is_archived) {
      setConfirmModal({
        isOpen: true,
        title: 'アーカイブ解除',
        message: `${staff.name} のアーカイブを解除し、一覧に再表示しますか？`,
        confirmText: '解除する',
        isDanger: false,
        onConfirm: async () => {
          const { error } = await supabase.from('staff').update({ is_archived: false }).eq('id', staff.id);
          if (error) alert('エラー: ' + error.message);
          else fetchData();
        }
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'アーカイブ（非表示）',
      message: `${staff.name} をアーカイブしますか？\n\n・タイムカード管理画面から非表示になります。\n・人件費管理画面では「アーカイブ済みを表示」でのみ確認できます。\n・過去のデータは保持されます。`,
      confirmText: 'アーカイブする',
      isDanger: true,
      onConfirm: async () => {
        const { error } = await supabase.from('staff').update({ is_archived: true }).eq('id', staff.id);
        if (error) alert('エラー: ' + error.message);
        else fetchData();
      }
    });
  };

  const handleDeleteStaff = async (staff: Staff) => {
    const { count, error } = await supabase
      .from('timecard_logs')
      .select('*', { count: 'exact', head: true })
      .eq('staff_id', staff.id);

    if (error) {
      alert('エラー: ' + error.message);
      return;
    }

    if (count && count > 0) {
      setConfirmModal({
        isOpen: true,
        title: '従業員の完全削除（注意）',
        message: `${staff.name} には ${count} 件の勤怠履歴が存在します。\n\n削除すると、これまでのタイムカード履歴も全て削除され、復元できません。\n本当に削除しますか？\n（履歴を残したい場合は「アーカイブ」を選択してください）`,
        confirmText: '全て削除する',
        isDanger: true,
        onConfirm: async () => {
          const { error } = await supabase.from('staff').delete().eq('id', staff.id);
          if (error) alert('エラー: ' + error.message);
          else fetchData();
        }
      });
    } else {
      setConfirmModal({
        isOpen: true,
        title: '従業員の完全削除',
        message: `本当に ${staff.name} を削除してよろしいですか？\n\nこの操作は取り消せません。`,
        confirmText: '削除する',
        isDanger: true,
        onConfirm: async () => {
          const { error } = await supabase.from('staff').delete().eq('id', staff.id);
          if (error) alert('エラー: ' + error.message);
          else fetchData();
        }
      });
    }
  };

  async function fetchData() {
    try {
      setLoading(true);
      const startStr = format(startOfMonth(currentDate), 'yyyy-MM-dd') + 'T00:00:00';
      const endStr = format(endOfMonth(currentDate), 'yyyy-MM-dd') + 'T23:59:59';

      const { data: staffData, error: staffError } = await supabase.from('staff').select('*').order('id');
      if (staffError) throw staffError;

      if (staffData && staffData.length > 0) {
        if (!companyId) setCompanyId(staffData[0].company_id);
      }

      const sortedStaff = (staffData || []).sort((a, b) => {
        const isAdminA = a.role === 'admin';
        const isAdminB = b.role === 'admin';
        if (isAdminA && !isAdminB) return -1;
        if (!isAdminA && isAdminB) return 1;
        const pinA = parseInt(a.pin || '999999');
        const pinB = parseInt(b.pin || '999999');
        return pinA - pinB;
      });

      // 1. Fetch Logs via API to bypass RLS and ensure fresh data
      const logsResponse = await fetch(`/api/admin/attendance-logs?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`, {
        cache: 'no-store',
        next: { revalidate: 0 },
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
      const logsResult = await logsResponse.json();
      const logsData = logsResult.data || [];
      // error checking logic omitted as logsResult usually returns { data: [] } on error or empty


      // 2. Process Logs to Calculate Hours per Day per Staff
      const staffDailyHours = new Map<string, Map<string, number>>(); // staffId -> date -> minutes

      // Helper to init map
      const addMinutes = (staffId: string, date: string, minutes: number) => {
        if (!staffDailyHours.has(staffId)) staffDailyHours.set(staffId, new Map());
        const dateMap = staffDailyHours.get(staffId)!;
        dateMap.set(date, (dateMap.get(date) || 0) + minutes);
      };

      // Group logs by staff
      const logsByStaff = new Map<string, any[]>();
      (logsData || []).forEach(log => {
        if (!logsByStaff.has(log.staff_id)) logsByStaff.set(log.staff_id, []);
        logsByStaff.get(log.staff_id)!.push(log);
      });

      // Calculate hours for each staff
      logsByStaff.forEach((logs, staffId) => {
        // Group by day for accurate pairing (assuming shift doesn't cross midnight for now, or just pairing within day)
        // If shifts cross midnight, we need more complex logic. For now assuming simple daily logic or global stream logic.
        // Let's use the same logic as Payslip: Group by day.

        const logsByDay = new Map<string, typeof logs>();
        logs.forEach(l => {
          const day = format(new Date(l.timestamp), 'yyyy-MM-dd');
          if (!logsByDay.has(day)) logsByDay.set(day, []);
          logsByDay.get(day)!.push(l);
        });

        logsByDay.forEach((dayLogs, dateStr) => {
          const sorted = dayLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          const firstIn = sorted.find(l => l.event_type === 'clock_in');
          const lastOut = sorted.slice().reverse().find(l => l.event_type === 'clock_out');

          if (firstIn && lastOut) {
            const start = new Date(firstIn.timestamp);
            const end = new Date(lastOut.timestamp);

            // Gross minutes
            const grossMinutes = calculateNetWorkingMinutes(start, end);

            // Break minutes
            let totalBreakMinutes = 0;
            let currentBreakStart: typeof logs[0] | null = null;

            sorted.forEach(log => {
              const t = new Date(log.timestamp);
              if (t < start || t > end) return; // Ignore logs outside main shift

              if (log.event_type === 'break_start') {
                if (!currentBreakStart) currentBreakStart = log;
              } else if (log.event_type === 'break_end') {
                if (currentBreakStart) {
                  const bStart = new Date(currentBreakStart.timestamp);
                  const bEnd = t;
                  totalBreakMinutes += calculateNetWorkingMinutes(bStart, bEnd);
                  currentBreakStart = null;
                }
              }
            });

            const netMinutes = Math.max(0, grossMinutes - totalBreakMinutes);
            addMinutes(staffId, dateStr, netMinutes);
          }
        });
      });

      // 3. Aggregate for Summaries
      const staffSummaries = sortedStaff.map((staff) => {
        const dateMap = staffDailyHours.get(staff.id);
        let totalMinutes = 0;

        if (dateMap) {
          dateMap.forEach((minutes) => {
            totalMinutes += minutes;
          });
        }

        // Ensure non-negative
        if (totalMinutes < 0) totalMinutes = 0;

        const hourlyWage = staff.hourly_wage || 1100;

        // Use unified calculation
        const totalWage = calculateSalary(totalMinutes, hourlyWage);
        const totalHours = formatHoursFromMinutes(totalMinutes);

        // Estimated Tax (using staff's dependents and tax category)
        const estimatedTax = calculateIncomeTax(totalWage, staff.dependents ?? 0, staff.tax_category);

        return {
          staff,
          totalHours, // number (float 2 decimals)
          totalWage,
          estimatedTax
        };
      });
      setSummaries(staffSummaries);
      setSelectedStaffIds(new Set());

      // Fetch Total Packs for Cost/Pack Calculation
      const { data: orderData } = await supabase
        .from('orders')
        .select('actual_quantity')
        .gte('order_date', format(startOfMonth(currentDate), 'yyyy-MM-dd'))
        .lte('order_date', format(endOfMonth(currentDate), 'yyyy-MM-dd'));

      const totalPacksVal = (orderData || []).reduce((sum, o) => sum + (o.actual_quantity || 0), 0);
      setTotalPacks(totalPacksVal);

      // 4. Aggregate for Daily Stats
      const statsMap = new Map<string, { date: string, details: any[], totalCount: number, totalCost: number }>();

      staffDailyHours.forEach((dateMap, staffId) => {
        const staff = sortedStaff.find(s => s.id === staffId);
        if (!staff) return;

        dateMap.forEach((minutes, date) => {
          if (minutes <= 0) return;

          if (!statsMap.has(date)) {
            statsMap.set(date, { date, details: [], totalCount: 0, totalCost: 0 });
          }
          const dayStat = statsMap.get(date)!;

          const wage = calculateSalary(minutes, staff.hourly_wage || 1100);
          const hours = formatHoursFromMinutes(minutes);

          dayStat.details.push({
            staffName: staff.name,
            hours: hours,
            cost: wage
          });
          dayStat.totalCount++;
          dayStat.totalCost += wage;
        });
      });

      const stats = Array.from(statsMap.values()).sort((a, b) => b.date.localeCompare(a.date));
      setDailyStats(stats);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [currentDate, isEditModalOpen]);

  // Update URL update when currentDate changes, to keep browser history in sync, BUT avoid circular loop
  useEffect(() => {
    // If we are just responding to URL change, fetchData handles it.
    // If we clicked button, currentDate changed, we want to push URL.
    const currentUrlMonth = searchParams.get('month');
    const stateMonth = format(currentDate, 'yyyy-MM');
    if (currentUrlMonth !== stateMonth) {
      router.push(`/?month=${stateMonth}`);
    }
  }, [currentDate]);

  const filteredSummaries = summaries.filter(s => {
    if (s.staff.role === 'admin') return false; // Exclude admins as requested
    const matchesSearch = s.staff.name.includes(searchQuery) || (s.staff.pin && s.staff.pin.includes(searchQuery));
    if (!showArchived && s.staff.is_archived) return false;
    return matchesSearch;
  });

  const toggleSelectAll = () => {
    if (selectedStaffIds.size === filteredSummaries.length && filteredSummaries.length > 0) {
      setSelectedStaffIds(new Set());
    } else {
      setSelectedStaffIds(new Set(filteredSummaries.map(s => s.staff.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedStaffIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedStaffIds(newSet);
  };

  const totalStaff = summaries.filter(s => !s.staff.is_archived).length;
  const totalHoursAll = summaries.reduce((sum, s) => sum + s.totalHours, 0);
  const totalLaborCost = summaries.reduce((sum, s) => sum + s.totalWage, 0);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      // Just Update state, effect will update URL
      setCurrentDate(parse(val, 'yyyy-MM', new Date()));
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(prev => addMonths(prev, -1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => addMonths(prev, 1));
  };

  const handleCsvDownload = () => {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const header = '氏名,PIN,職種,総労働時間,時給,総支給額,源泉所得税,手当\n';
    const rows = summaries.map(s => {
      return [
        s.staff.name,
        s.staff.pin || '',
        s.staff.role || '',
        s.totalHours.toFixed(2),
        s.staff.hourly_wage || 0,
        s.totalWage,
        s.estimatedTax,
        // Add other fields if needed
        ''
      ].join(',');
    }).join('\n');

    const blob = new Blob([bom, header, rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salary_data_${currentMonthStr}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
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
      {isPinModalOpen && (
        <AdminPinModal onClose={() => setIsPinModalOpen(false)} />
      )}

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
              <ClipboardList className="mr-3 text-orange-600" size={32} />
              人件費管理
            </h1>
            <p className="text-slate-500 font-bold ml-1">勤怠データと給与の集計・管理</p>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-4">
            {/* CSV Download Button */}
            <button
              onClick={handleCsvDownload}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold flex items-center transition border border-slate-200"
            >
              <Download size={18} className="mr-2" />
              CSV出力
            </button>

            {/* Month Picker */}
            <div className="relative min-w-[200px]">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none z-10">
                <Calendar size={18} strokeWidth={2.5} />
              </div>
              <select
                value={format(currentDate, 'yyyy-MM')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) setCurrentDate(parse(val, 'yyyy-MM', new Date()));
                }}
                className="appearance-none w-full bg-white border border-slate-200 text-slate-950 font-bold text-base py-2.5 pl-10 pr-10 rounded-xl cursor-pointer hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"
              >
                {availableMonths.map((d) => (
                  <option key={format(d, 'yyyy-MM')} value={format(d, 'yyyy-MM')}>
                    {format(d, 'yyyy年 MM月')}
                  </option>
                ))}
                {!availableMonths.some(d => format(d, 'yyyy-MM') === format(currentDate, 'yyyy-MM')) && (
                  <option value={format(currentDate, 'yyyy-MM')}>{format(currentDate, 'yyyy年 MM月')}</option>
                )}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10">
                <ChevronDown size={16} strokeWidth={2.5} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500 font-bold">データを読み込み中...</div>
      ) : (
        <div className="relative">
          {/* Main Content - Dimmed if locked */}

          {/* Main Content - Open (Stats are visible) */}
          <div className="transition-all duration-300">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <StatsCard label="従業員数 (稼働中)" value={`${totalStaff} 名`} icon={Users} badge="ACTIVE" />
              <StatsCard label={`総労働時間 (${format(currentDate, 'yyyy-MM')})`} value={`${totalHoursAll.toFixed(1)} h`} icon={Clock} />
              <StatsCard label={`人件費合計 (${format(currentDate, 'yyyy-MM')})`} value={`¥${totalLaborCost.toLocaleString()}`} icon={Banknote} badge={totalLaborCost > 1000000 ? 'HIGH' : undefined} />
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1">
                <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                  <div className="flex items-center gap-4 w-full md:w-auto">
                    <h3 className="font-black text-lg text-slate-950 whitespace-nowrap">従業員一覧</h3>
                    <div className="relative w-full max-w-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={16} className="text-slate-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="名前またはPINで検索"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full bg-white text-slate-950 font-bold focus:ring-2 focus:ring-blue-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
                    <button
                      onClick={() => setShowArchived(!showArchived)}
                      className={`text-xs font-bold px-3 py-2 rounded-lg flex items-center transition border ${showArchived ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                    >
                      <Archive size={14} className="mr-1" />
                      {showArchived ? 'アーカイブを表示中' : 'アーカイブを表示'}
                    </button>
                    <button
                      onClick={handleCreateStaff}
                      className="btn-primary flex items-center text-sm"
                    >
                      <Users size={16} className="mr-2" />
                      従業員を追加
                    </button>
                  </div>
                </div>
                <div className="text-right mb-2">
                  <Link href={`/ledger?month=${currentMonthStr}`} className="text-blue-600 text-sm hover:underline font-bold">賃金台帳を表示 &rarr;</Link>
                </div>

                <div className="bg-white shadow rounded-xl overflow-hidden border border-slate-100 relative">
                  {!isUnlocked && (
                    <div className="absolute inset-0 z-10 bg-slate-50/60 backdrop-blur-sm flex items-center justify-center cursor-pointer" onClick={() => setIsPinModalOpen(true)}>
                      <div className="flex flex-col items-center bg-white p-8 rounded-2xl shadow-xl border border-slate-200 transform transition-transform hover:scale-105">
                        <div className="bg-slate-100 p-4 rounded-full mb-4">
                          <Lock size={48} className="text-slate-400" />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 mb-2">ロックされています</h3>
                        <p className="text-slate-500 font-bold mb-6 text-center">従業員リストを表示するには<br />PINコードを入力してください</p>
                        <button className="bg-slate-900 text-white px-6 py-2.5 rounded-lg font-bold shadow hover:bg-slate-800 transition">
                          ロック解除
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={`${!isUnlocked ? 'filter blur-sm select-none' : ''} overflow-x-auto`}>
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-4 text-center">
                            <input type="checkbox" checked={selectedStaffIds.size === filteredSummaries.length && filteredSummaries.length > 0} onChange={toggleSelectAll} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer" />
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-black text-slate-600 uppercase tracking-wider">氏名</th>
                          <th className="px-6 py-4 text-left text-xs font-black text-slate-600 uppercase tracking-wider">時給</th>
                          <th className="px-6 py-4 text-center text-xs font-black text-slate-600 uppercase tracking-wider">PIN</th>
                          <th className="px-6 py-4 text-left text-xs font-black text-slate-600 uppercase tracking-wider">
                            {format(currentDate, 'M月')}の状況
                          </th>
                          <th className="px-6 py-4 text-center text-xs font-black text-slate-600 uppercase tracking-wider">操作</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {filteredSummaries.length === 0 ? (
                          <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500 font-bold">表示するデータがありません</td></tr>
                        ) : (
                          filteredSummaries.map(({ staff, totalHours, totalWage }) => (
                            <tr key={staff.id} className={`hover:bg-slate-50 transition ${staff.is_archived ? 'bg-slate-50 opacity-70' : ''}`}>
                              <td className="px-4 py-4 text-center">
                                <input type="checkbox" checked={selectedStaffIds.has(staff.id)} onChange={() => toggleSelect(staff.id)} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer" />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Link href={`/attendance/${staff.id}?month=${currentMonthStr}`} className="flex items-center group">
                                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold mr-3 transition ${staff.is_archived ? 'bg-slate-200 text-slate-500' : 'bg-blue-100 text-blue-600 group-hover:bg-blue-200'}`}>
                                    {staff.is_archived ? <Archive size={18} /> : staff.name.charAt(0)}
                                  </div>
                                  <div>
                                    <div className={`font-black transition text-lg ${staff.is_archived ? 'text-slate-500' : 'text-slate-950 group-hover:text-blue-600'}`}>{staff.name}</div>
                                    {staff.is_archived && <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">アーカイブ済</span>}
                                  </div>
                                </Link>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-slate-950 font-bold">¥{(staff.hourly_wage || 0).toLocaleString()}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-slate-500 font-mono font-bold text-sm bg-slate-50 rounded-md py-1 mx-2 inline-block">{staff.pin || '----'}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-bold text-slate-950">{totalHours.toFixed(1)}h / <span className="text-slate-950">¥{totalWage.toLocaleString()}</span></div>
                                <div className="text-xs mt-1">
                                  {totalHours > 80 ? <span className="text-red-500 flex items-center font-bold"><AlertCircle size={12} className="mr-1" /> 週20時間超過</span> : <span className="text-green-500 flex items-center font-bold">✔ 正常</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="flex justify-center items-center space-x-2">
                                  <button onClick={() => handleEditStaff(staff)} className="text-slate-400 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition" title="編集">
                                    <Edit size={18} />
                                  </button>
                                  <button
                                    onClick={() => handleArchiveStaff(staff)}
                                    className={`p-2 rounded-lg transition ${staff.is_archived ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'}`}
                                    title={staff.is_archived ? "アーカイブ解除" : "アーカイブ"}
                                  >
                                    <Archive size={18} />
                                  </button>
                                  {!staff.is_archived && (
                                    <button
                                      onClick={() => handleDeleteStaff(staff)}
                                      className="text-slate-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition"
                                      title="削除"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="w-full lg:w-80 space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                  <div className="flex items-center space-x-2 text-indigo-600 font-black mb-4">
                    <Settings size={20} />
                    <span>システム操作</span>
                  </div>
                  <div className="space-y-3">
                    <Link href="/admin/system" className="w-full flex items-center justify-start px-4 py-3 bg-slate-50 rounded-lg text-slate-700 font-bold hover:bg-slate-100 transition">
                      <Settings size={18} className="mr-3 text-slate-400" />
                      システム設定
                    </Link>
                    <Link href="/admin/products" className="w-full flex items-center justify-start px-4 py-3 bg-slate-50 rounded-lg text-slate-700 font-bold hover:bg-slate-100 transition">
                      <Package size={18} className="mr-3 text-slate-400" />
                      商品・単価管理
                    </Link>
                    <Link href="/admin/orders" className="w-full flex items-center justify-start px-4 py-3 bg-slate-50 rounded-lg text-slate-700 font-bold hover:bg-slate-100 transition">
                      <Factory size={18} className="mr-3 text-slate-400" />
                      製造現場管理
                    </Link>
                    {selectedStaffIds.size > 0 ? (
                      <Link href={getPayslipUrl()} className="w-full flex items-center justify-start px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition font-black border border-blue-200 shadow-sm">
                        <Banknote size={18} className="mr-3 text-blue-500" />
                        明細発行 ({selectedStaffIds.size}名)
                      </Link>
                    ) : (
                      <button disabled className="w-full flex items-center justify-start px-4 py-3 bg-slate-50 text-slate-400 rounded-lg font-bold cursor-not-allowed border border-slate-200">
                        <Banknote size={18} className="mr-3 text-slate-400" />
                        明細発行 (0名)
                      </button>
                    )}
                    {/* CSV Download Button moved to Header */}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-black text-slate-800 text-sm">日別労働状況 (サマリー)</h3>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded font-bold">人数タップで詳細</span>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-black text-slate-600">日付</th>
                          <th className="px-2 py-2 text-center text-xs font-black text-slate-600">人数</th>
                          <th className="px-3 py-2 text-right text-xs font-black text-slate-600">人件費</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {dailyStats.length === 0 ? (
                          <tr><td colSpan={3} className="px-3 py-4 text-center text-xs text-slate-500 font-bold">データなし</td></tr>
                        ) : (
                          dailyStats.map((stat) => (
                            <tr key={stat.date} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-xs font-black text-slate-800">
                                {format(parse(stat.date, 'yyyy-MM-dd', new Date()), 'MM/dd (eee)')}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() => handleOpenDetail(stat)}
                                  className="text-xs bg-blue-100 text-blue-700 px-3 py-0.5 rounded-full hover:bg-blue-600 hover:text-white transition font-black min-w-[30px]"
                                >
                                  {stat.totalCount}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-right text-xs text-slate-600 font-mono font-bold">
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
                    <span className="font-black">労働ルール通知</span>
                  </div>
                  <div className="bg-indigo-500/50 p-3 rounded-lg text-sm mb-2">
                    <div className="text-indigo-200 text-xs mb-1 font-bold">週労働時間上限設定</div>
                    <div className="font-black">パートタイム 20時間以内</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <StaffEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        staff={editingStaff}
        mode={modalMode}
        companyId={companyId}
        onSave={() => {
          setIsEditModalOpen(false);
        }}
      />

      <DailyDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        data={detailModalData}
        onPrev={() => handleModalNavigate('prev')}
        onNext={() => handleModalNavigate('next')}
      />

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        isDanger={confirmModal.isDanger}
        confirmText={confirmModal.confirmText}
      />
    </DashboardLayout>
  );
}




