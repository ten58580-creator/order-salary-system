'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { X, Trash2, Save, Lock } from 'lucide-react';
import { differenceInMinutes, parse, format } from 'date-fns';

type Timecard = {
    id: string; // Fake ID
    staff_id: string;
    date: string;
    clock_in: string | null;
    clock_out: string | null;
    break_start_time: string | null;
    break_end_time: string | null;
    break_minutes: number;
    worked_hours: number;
    notes: string;
};

interface AttendanceEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    timecard: Timecard | null;
    staffId: string;
}

export default function AttendanceEditModal({ isOpen, onClose, onSave, timecard, staffId }: AttendanceEditModalProps) {
    const [date, setDate] = useState('');
    const [clockIn, setClockIn] = useState('');
    const [clockOut, setClockOut] = useState('');
    const [breakStart, setBreakStart] = useState('');
    const [breakEnd, setBreakEnd] = useState('');
    const [loading, setLoading] = useState(false);

    // Derived state for display
    const [calculatedBreakMinutes, setCalculatedBreakMinutes] = useState(0);

    useEffect(() => {
        if (timecard) {
            setDate(timecard.date);
            setClockIn(timecard.clock_in || '');
            setClockOut(timecard.clock_out || '');
            setBreakStart(timecard.break_start_time || '');
            setBreakEnd(timecard.break_end_time || '');
        } else {
            // New entry default
            setDate(format(new Date(), 'yyyy-MM-dd'));
            setClockIn('');
            setClockOut('');
            setBreakStart('');
            setBreakEnd('');
        }
    }, [timecard, isOpen]);

    // Cleanup effect: when closing, reset or just rely on next open.
    // Ensure calculation runs when inputs change
    useEffect(() => {
        if (breakStart && breakEnd) {
            const today = new Date(); // base date doesn't matter for diff only if within same day
            const start = parse(breakStart, 'HH:mm', today);
            const end = parse(breakEnd, 'HH:mm', today);
            // Handle overnight break if needed? Usually breaks are within shift. 
            // If end < start, maybe it crossed midnight?
            let diff = differenceInMinutes(end, start);
            if (diff < 0) diff += 24 * 60;
            setCalculatedBreakMinutes(diff);
        } else {
            setCalculatedBreakMinutes(0);
        }
    }, [breakStart, breakEnd]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!date || !staffId) {
            alert('日付と従業員IDは必須です。');
            setLoading(false);
            return;
        }

        try {
            console.log('--- Save Process Started (RPC) ---');

            // Construct timestamps
            let clockInIso = null;
            let clockOutIso = null;
            let breakStartIso = null;
            let breakEndIso = null;

            if (clockIn) {
                const d = parse(`${date} ${clockIn}`, 'yyyy-MM-dd HH:mm', new Date());
                clockInIso = d.toISOString();
            }
            if (clockOut) {
                // Handle overnight? If clockOut < clockIn? 
                // Simple logic: If clockOut < clockIn, assume next day?
                // For now, rely on simple date parsing. If overnight, user might struggle with just time.
                // But requirements didn't specify overnight handling enhancement.
                const d = parse(`${date} ${clockOut}`, 'yyyy-MM-dd HH:mm', new Date());
                // If clockOut is strictly smaller than clockIn, add 1 day?
                // Let's keep it simple: date + time.
                clockOutIso = d.toISOString();
            }

            if (breakStart) {
                const d = parse(`${date} ${breakStart}`, 'yyyy-MM-dd HH:mm', new Date());
                breakStartIso = d.toISOString();
            }
            if (breakEnd) {
                const d = parse(`${date} ${breakEnd}`, 'yyyy-MM-dd HH:mm', new Date());
                breakEndIso = d.toISOString();
            }

            const { error } = await supabase.rpc('manage_daily_attendance_logs', {
                p_staff_id: staffId,
                p_target_date: date,
                p_clock_in_time: clockInIso,
                p_clock_out_time: clockOutIso,
                p_break_start_time: breakStartIso,
                p_break_end_time: breakEndIso,
                p_is_deleted: false
            });

            if (error) throw error;

            console.log('Save successful');
            alert('保存しました');
            onSave();
            onClose();
        } catch (error: any) {
            console.error('Save Failure:', error);
            alert('保存に失敗しました: ' + (error.message || '不明なエラー'));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('この日の勤怠データを全て削除しますか？\n(実データが削除されます)')) return;
        setLoading(true);
        try {
            const { error } = await supabase.rpc('manage_daily_attendance_logs', {
                p_staff_id: staffId,
                p_target_date: date,
                p_clock_in_time: null,
                p_clock_out_time: null,
                p_break_start_time: null,
                p_break_end_time: null,
                p_is_deleted: true
            });

            if (error) throw error;
            onSave();
            onClose();
        } catch (error: any) {
            console.error('Delete error', error);
            alert('削除に失敗しました: ' + (error.message || 'All delete check'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-xl font-black text-slate-900">勤怠データの編集</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-900 mb-2">対象日付</label>
                        <input
                            type="date"
                            required
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-950 font-bold focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-2">出勤時間</label>
                            <input
                                type="time"
                                value={clockIn}
                                onChange={(e) => setClockIn(e.target.value)}
                                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-950 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-2">退勤時間</label>
                            <input
                                type="time"
                                value={clockOut}
                                onChange={(e) => setClockOut(e.target.value)}
                                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-950 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-2">休憩開始</label>
                            <input
                                type="time"
                                value={breakStart}
                                onChange={(e) => setBreakStart(e.target.value)}
                                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-950 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-2">休憩終了</label>
                            <input
                                type="time"
                                value={breakEnd}
                                onChange={(e) => setBreakEnd(e.target.value)}
                                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-950 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center justify-between">
                        <span className="text-sm font-bold text-blue-900">休憩合計 (自動計算)</span>
                        <div className="flex items-end gap-1">
                            <span className="text-2xl font-black text-blue-600">{calculatedBreakMinutes}</span>
                            <span className="text-sm font-bold text-blue-400 mb-1">分</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 gap-4 border-t border-slate-100">
                        {timecard && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="flex items-center justify-center px-4 py-3 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition w-32 font-bold"
                            >
                                <Trash2 size={18} className="mr-2" />
                                削除
                            </button>
                        )}
                        <div className="flex gap-3 flex-1 justify-end">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-3 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition"
                            >
                                キャンセル
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg disabled:opacity-50 flex items-center"
                            >
                                <Save size={20} className="mr-2" />
                                更新する
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
