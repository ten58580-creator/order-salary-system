'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/utils/supabaseClient';
import { ChevronLeft, User, Clock, Coffee, LogOut, Plus, Search, Archive } from 'lucide-react';
import Link from 'next/link';
import StaffEditModal from '@/components/StaffEditModal';

import { Database } from '@/types/supabase';

// Types
type Staff = Database['public']['Tables']['staff']['Row'] & {
    is_archived?: boolean;
};

type TimeCardStatus = 'clock_in' | 'break_start' | 'break_end' | 'clock_out' | 'unknown';

type TimeCardLog = {
    id: string;
    staff_id: string;
    event_type: string;
    timestamp: string;
    is_modified_by_admin?: boolean;
};

type StaffWithStatus = Staff & {
    current_status: TimeCardStatus;
    last_event_time: string | null;
};

export default function TimeCardPage() {
    const [staffList, setStaffList] = useState<StaffWithStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStaff, setSelectedStaff] = useState<StaffWithStatus | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);

    // Modals
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit');
    const [logs, setLogs] = useState<TimeCardLog[]>([]);
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);



    // Fetch Staff and their latest status
    const fetchData = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            // Get Current User Company ID (Assuming admin)
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Try to find staff record for this user to get company_id
                const { data: myStaff } = await supabase.from('staff').select('company_id').eq('id', user.id).single();
                if (myStaff) setCompanyId(myStaff.company_id);
            }

            // 1. Get All Staff
            const { data: staffData, error: staffError } = await supabase
                .from('staff')
                .select('*')
                .order('name');

            if (staffError) {
                console.error('Staff Fetch Error:', staffError);
                throw new Error(`Staff Fetch Error: ${staffError.message} (Code: ${staffError.code}) - Details: ${staffError.details}`);
            }

            // Fallback for company Id resolution
            let resolvedCompanyId = companyId;

            if (!resolvedCompanyId) { // Check if we already have it in state (fetched previously)
                if (staffData && staffData.length > 0) {
                    resolvedCompanyId = staffData[0].company_id;
                } else {
                    // Determine company_id from companies table if no staff exists
                    const { data: companyData } = await supabase.from('companies').select('id').limit(1).maybeSingle();
                    if (companyData) {
                        resolvedCompanyId = companyData.id;
                    } else {
                        // If NO company exists at all, create one!
                        const { data: newCompany, error: createError } = await supabase
                            .from('companies')
                            .insert({ name: '自社' })
                            .select('id')
                            .single();

                        if (newCompany) {
                            resolvedCompanyId = newCompany.id;
                        } else {
                            console.error('Failed to create default company:', createError);
                            // If this fails, we really can't do much, but at least we tried.
                        }
                    }
                }

                if (resolvedCompanyId) {
                    setCompanyId(resolvedCompanyId);
                    // Set for current user too if possible? (Optional but good for completeness)
                }
            }

            // 2. Get Today's Logs
            const { data: logsData, error: logsError } = await supabase
                .from('timecard_logs')
                .select('id, staff_id, event_type, timestamp, is_modified_by_admin, created_at')
                .order('timestamp', { ascending: false });

            if (logsError) {
                console.error('Logs Fetch Error:', logsError);
                throw new Error(`Logs Fetch Error: ${logsError.message} (Code: ${logsError.code})`);
            }

            // Process Status
            const statusMap = new Map<string, { status: TimeCardStatus; time: string }>();

            if (logsData) {
                // Since we sorted by desc, the first encounter is the latest
                logsData.forEach(log => {
                    if (!statusMap.has(log.staff_id)) {
                        statusMap.set(log.staff_id, { status: log.event_type as TimeCardStatus, time: log.timestamp });
                    }
                });
                setLogs(logsData as unknown as TimeCardLog[]); // Cast for safety or define type properly
            }

            const mergedStaff = (staffData || []).map(s => ({
                ...s,
                current_status: statusMap.get(s.id)?.status || 'unknown',
                last_event_time: statusMap.get(s.id)?.time || null,
            }));

            setStaffList(mergedStaff);

        } catch (error: any) {
            console.error('Error fetching data:', error);
            setErrorMsg(error.message || 'データ取得中に不明なエラーが発生しました');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Subscription for real-time updates (Logs)
        const subscriptionLogs = supabase
            .channel('timecard_logs_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'timecard_logs' }, () => {
                fetchData();
            })
            .subscribe();

        // Subscription for Staff changes (New registration)
        const subscriptionStaff = supabase
            .channel('staff_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, () => {
                fetchData();
            })
            .subscribe();

        return () => {
            subscriptionLogs.unsubscribe();
            subscriptionStaff.unsubscribe();
        };
    }, []);

    const handleCardClick = (staff: StaffWithStatus) => {
        setSelectedStaff(staff);
        setIsModalOpen(true);
    };

    const handleStamp = async (eventType: TimeCardStatus) => {
        if (!selectedStaff) return;
        if (isProcessing) return; // Prevent double click

        setIsProcessing(true);
        console.log('Stamping:', eventType, 'for', selectedStaff.name, 'ID:', selectedStaff.id, 'Company:', selectedStaff.company_id);

        try {
            // DUPLICATE CHECK: Fetch the very latest log for this staff
            const { data: latestLogs, error: fetchError } = await supabase
                .from('timecard_logs')
                .select('event_type, timestamp')
                .eq('staff_id', selectedStaff.id)
                .order('timestamp', { ascending: false })
                .limit(1);

            if (fetchError) {
                throw fetchError;
            }

            if (latestLogs && latestLogs.length > 0) {
                const latestLog = latestLogs[0];
                const latestTime = new Date(latestLog.timestamp).getTime();
                const nowTime = new Date().getTime();

                // Check 1: Same event type? (e.g. clock_in again)
                if (latestLog.event_type === eventType) {
                    console.warn('Duplicate event type detected. Skipping.');
                    alert('既に処理されています。画面を更新してください。');
                    setIsModalOpen(false); // Close modal to force refresh context
                    return;
                }

                // Check 2: Too close? (e.g. within 2 seconds) - optional but good for safety
                if (nowTime - latestTime < 2000) {
                    console.warn('Event too close to previous event. Skipping.');
                    return;
                }
            }

            const timestamp = new Date().toISOString();

            const { error } = await supabase
                .from('timecard_logs')
                .insert({
                    staff_id: selectedStaff.id,
                    company_id: selectedStaff.company_id, // Might be null if staff doesn't have it
                    event_type: eventType,
                    timestamp: timestamp
                });

            if (error) {
                console.error('Stamping Error:', error);
                alert('打刻エラー: ' + error.message);
            } else {
                console.log('Stamp success');

                // 1. Create new log object for immediate UI update
                const newLog: TimeCardLog = {
                    id: 'temp-' + new Date().getTime(), // Temporary ID until fetch
                    staff_id: selectedStaff.id,
                    event_type: eventType,
                    timestamp: timestamp,
                    is_modified_by_admin: false
                };

                // 2. Update Logs State immediately
                setLogs((prevLogs) => [newLog, ...prevLogs]);

                // 3. Update Selected Staff State immediately (Critical for button state)
                const updatedStaff = {
                    ...selectedStaff,
                    current_status: eventType,
                    last_event_time: timestamp
                };
                setSelectedStaff(updatedStaff);

                // 4. Update StaffList State immediately (For background cards)
                setStaffList((prevList) =>
                    prevList.map(s =>
                        s.id === selectedStaff.id
                            ? { ...s, current_status: eventType, last_event_time: timestamp }
                            : s
                    )
                );

                // 5. Background fetch to ensure consistency (optional but good)
                fetchData();
            }
        } catch (err: any) {
            console.error('Unexpected error during stamping:', err);
            alert('予期せぬエラーが発生しました');
        } finally {
            // Unlock immediately
            setIsProcessing(false);
        }
    };




    const getStatusBadge = (status: TimeCardStatus) => {
        switch (status) {
            case 'clock_in':
            case 'break_end':
                return <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-200">出勤中</span>;
            case 'break_start':
                return <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-800 font-bold border border-orange-200">休憩中</span>;
            case 'clock_out':
                return <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-500 font-bold border border-slate-200">退勤済</span>;
            default:
                return <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-400 font-bold border border-gray-200">未出勤</span>;
        }
    };

    const handleCreateStaff = async () => {
        let currentCompanyId = companyId;

        // Failsafe: Ensure company ID exists before opening modal
        if (!currentCompanyId) {
            console.log('Company ID missing, attempting manual fetch...');
            const { data: companyData } = await supabase.from('companies').select('id').limit(1).maybeSingle();
            if (companyData) {
                currentCompanyId = companyData.id;
                setCompanyId(currentCompanyId);
            } else {
                console.log('No company found, attempting to create default company...');
                const { data: newCompany, error } = await supabase.from('companies').insert({ name: '自社' }).select('id').single();
                if (newCompany) {
                    currentCompanyId = newCompany.id;
                    setCompanyId(currentCompanyId);
                } else {
                    console.error('CRITICAL: Failed to create default company manually:', error);
                    alert('エラー: 会社情報の取得・作成に失敗しました。データベースを確認してください。');
                    return;
                }
            }
        }

        if (currentCompanyId) {
            setModalMode('create');
            setSelectedStaff(null);
            setIsEditModalOpen(true);
        }
    };

    // Filter Logic
    const filteredStaffList = staffList.filter(s => {
        // User Request: 「管理者」ロールのスタッフを非表示
        if (s.role === 'admin') return false;

        // Exclude Archived (unless toggled)
        if (!showArchived && s.is_archived) return false;

        // Search
        if (searchQuery && !s.name.includes(searchQuery)) return false;

        return true;
    });

    return (
        <DashboardLayout>
            <div className="max-w-7xl mx-auto pb-32">
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
                                <Clock className="mr-3 text-pink-600" size={32} />
                                タイムカード管理
                            </h1>
                            <p className="text-slate-500 font-bold ml-1">従業員の出退勤・休憩管理</p>
                        </div>

                        {/* Right: Actions (Search + Add) */}
                        <div className="flex items-center space-x-3 w-full md:w-auto">
                            <button
                                onClick={() => setShowArchived(!showArchived)}
                                className={`text-xs font-bold px-3 py-2.5 rounded-xl flex items-center transition border ${showArchived ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                            >
                                <Archive size={16} className="mr-2" />
                                {showArchived ? 'アーカイブを表示中' : 'アーカイブを表示'}
                            </button>
                            <div className="relative flex-1 md:flex-none">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search size={18} className="text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="名前で検索"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm w-full md:w-64 bg-slate-50 text-slate-950 font-bold focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition"
                                />
                            </div>
                            <button
                                onClick={handleCreateStaff}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-md flex items-center transition whitespace-nowrap"
                            >
                                <Plus size={18} className="mr-2" />
                                従業員を追加
                            </button>
                        </div>
                    </div>
                </div>

                {errorMsg && (
                    <div className="mb-8 p-4 bg-red-100 border border-red-400 text-red-700 font-bold rounded-xl animate-pulse">
                        エラーが発生しました: {errorMsg}
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-20 text-slate-950 font-bold animate-pulse">読み込み中...</div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {filteredStaffList.length === 0 ? (
                            <div className="col-span-4 text-center py-12 text-slate-400 font-bold bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                                スタッフが見つかりません
                            </div>
                        ) : (
                            filteredStaffList.map(staff => {
                                const isClockIn = staff.current_status === 'clock_in' || staff.current_status === 'break_end';
                                const isBreak = staff.current_status === 'break_start';
                                const cardBorderClass = isClockIn
                                    ? 'border-blue-500 border-4 shadow-md'
                                    : isBreak
                                        ? 'border-orange-500 border-4 shadow-md'
                                        : 'border-slate-200';

                                return (
                                    <button
                                        key={staff.id}
                                        onClick={() => handleCardClick(staff)}
                                        className={`bg-white p-6 rounded-2xl shadow-sm ${cardBorderClass} hover:shadow-xl hover:scale-[1.02] transition-all text-left group`}
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-950 group-hover:bg-blue-50 transition-colors">
                                                <User size={24} />
                                            </div>
                                            <div>{getStatusBadge(staff.current_status)}</div>
                                        </div>
                                        <h3 className="text-3xl font-black text-slate-950 mb-1 tracking-tight">
                                            {staff.name}
                                        </h3>
                                        <div className="text-xs font-bold text-slate-400">
                                            最終更新: {staff.last_event_time ? new Date(staff.last_event_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* Stamping Modal */}
            {isModalOpen && selectedStaff && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity" onClick={() => !isProcessing && setIsModalOpen(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

                        {/* Sticky Header Section */}
                        <div className="flex-shrink-0 bg-white z-10 shadow-sm relative">
                            <div className="bg-slate-50 text-center py-6 border-b border-slate-100">
                                <h3 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">{selectedStaff.name}</h3>
                                <div className="inline-block mt-1">
                                    {getStatusBadge(selectedStaff.current_status)}
                                </div>
                                <p className="text-slate-500 font-bold mt-2 text-sm">{selectedStaff.current_status === 'clock_in' ? '業務中' : selectedStaff.current_status === 'break_start' ? '休憩中' : selectedStaff.current_status === 'clock_out' ? '業務終了' : '未出勤'}</p>
                            </div>

                            <div className="p-4 grid grid-cols-2 gap-3 border-b border-slate-100 bg-white">
                                {/* Clock In */}
                                <button
                                    onClick={() => handleStamp('clock_in')}
                                    disabled={isProcessing || selectedStaff.current_status !== 'unknown'}
                                    className={`col-span-2 p-4 rounded-xl font-black text-xl shadow-md transition transform flex items-center justify-center gap-3
                                            ${selectedStaff.current_status === 'unknown' && !isProcessing
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-lg active:scale-95'
                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                >
                                    <Clock size={28} />
                                    {isProcessing ? '送信中...' : '出勤'}
                                </button>

                                {/* Break Start */}
                                <button
                                    onClick={() => handleStamp('break_start')}
                                    disabled={isProcessing || !['clock_in', 'break_end'].includes(selectedStaff.current_status)}
                                    className={`p-4 rounded-xl font-black text-lg shadow-md transition transform flex flex-col items-center justify-center
                                            ${['clock_in', 'break_end'].includes(selectedStaff.current_status) && !isProcessing
                                            ? 'bg-orange-500 hover:bg-orange-600 text-white hover:shadow-lg active:scale-95'
                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                >
                                    <Coffee size={24} className="mb-1" />
                                    {isProcessing ? '...' : '休憩開始'}
                                </button>

                                {/* Break End */}
                                <button
                                    onClick={() => handleStamp('break_end')}
                                    disabled={isProcessing || selectedStaff.current_status !== 'break_start'}
                                    className={`p-4 rounded-xl font-black text-lg shadow-md transition transform flex flex-col items-center justify-center
                                            ${selectedStaff.current_status === 'break_start' && !isProcessing
                                            ? 'bg-green-600 hover:bg-green-700 text-white hover:shadow-lg active:scale-95'
                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                >
                                    <Coffee size={24} className="mb-1" />
                                    {isProcessing ? '...' : '休憩終了'}
                                </button>

                                {/* Clock Out */}
                                <button
                                    onClick={() => handleStamp('clock_out')}
                                    disabled={isProcessing || !['clock_in', 'break_end'].includes(selectedStaff.current_status)}
                                    className={`col-span-2 p-4 rounded-xl font-black text-xl shadow-md transition transform flex items-center justify-center gap-3
                                            ${['clock_in', 'break_end'].includes(selectedStaff.current_status) && !isProcessing
                                            ? 'bg-slate-700 hover:bg-slate-800 text-white hover:shadow-lg active:scale-95'
                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                >
                                    <LogOut size={28} />
                                    {isProcessing ? '送信中...' : '退勤'}
                                </button>
                            </div>
                        </div>

                        {/* Scrollable History Section */}
                        <div className="flex-1 overflow-y-auto bg-gray-50 p-6 min-h-0">
                            <h4 className="font-bold text-slate-700 mb-4 flex items-center sticky top-0 bg-gray-50 py-2 z-0">
                                <Clock size={16} className="mr-2" />
                                本日の打刻履歴
                            </h4>
                            <div className="space-y-3">
                                {logs
                                    .filter(l => l.staff_id === selectedStaff.id)
                                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                    .map(log => {
                                        const eventName = {
                                            'clock_in': '出勤', 'break_start': '休憩', 'break_end': '再開', 'clock_out': '退勤'
                                        }[log.event_type] || log.event_type;

                                        return (
                                            <div key={log.id} className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <span className={`text-xs font-bold px-2 py-1 rounded text-white ${log.event_type === 'clock_in' ? 'bg-blue-500' :
                                                        log.event_type === 'clock_out' ? 'bg-slate-500' : 'bg-orange-500'
                                                        }`}>
                                                        {eventName}
                                                    </span>
                                                    <span className="font-mono font-bold text-slate-700 text-lg">
                                                        {new Date(log.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {(log.is_modified_by_admin) && (
                                                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200 font-bold whitespace-nowrap">修正済</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                {logs.filter(l => l.staff_id === selectedStaff.id).length === 0 && (
                                    <div className="text-center text-gray-400 font-bold text-sm py-4">履歴なし</div>
                                )}
                            </div>

                            <button onClick={() => setIsModalOpen(false)} className="mt-8 w-full py-3 text-gray-500 font-bold hover:bg-slate-200 rounded-xl transition border border-slate-200 bg-white shadow-sm">閉じる</button>
                        </div>
                    </div>
                </div>
            )}

            <StaffEditModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                mode={modalMode}
                staff={selectedStaff} // Can be null for create
                companyId={companyId}
                onSave={() => fetchData()}
            />
        </DashboardLayout >
    );
}
