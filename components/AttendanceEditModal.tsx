'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { X, Trash2, Save, Lock } from 'lucide-react';
import { differenceInMinutes, parse, format } from 'date-fns';

type Timecard = Database['public']['Tables']['timecards']['Row'];

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
    const [breakMinutes, setBreakMinutes] = useState(0);
    const [isManualBreak, setIsManualBreak] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (timecard) {
            setDate(timecard.date);
            setClockIn(timecard.clock_in || '');
            setClockOut(timecard.clock_out || '');
            setBreakMinutes(timecard.break_minutes ?? 0);
            setIsManualBreak(true); // Don't auto-calc initially to preserve DB value
        }
    }, [timecard]);

    // Auto-calculate break minutes logic (Optional specific enhancement)
    useEffect(() => {
        if (!isOpen || isManualBreak) return;
        if (breakStart && breakEnd) {
            const today = format(new Date(), 'yyyy-MM-dd');
            const start = parse(`${today} ${breakStart}`, 'yyyy-MM-dd HH:mm', new Date());
            const end = parse(`${today} ${breakEnd}`, 'yyyy-MM-dd HH:mm', new Date());
            let diff = differenceInMinutes(end, start);
            if (diff < 0) diff = 0;
            setBreakMinutes(diff);
        }
    }, [breakStart, breakEnd, isManualBreak, isOpen]);

    if (!isOpen || !timecard) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Validation
        if (!date || !staffId) {
            alert('日付と従業員IDは必須です。');
            setLoading(false);
            return;
        }

        try {
            console.log('--- Save (Upsert) Process Started ---');

            // Calculate worked hours
            let workedHours = 0;
            if (clockIn && clockOut) {
                const dateBase = date;
                const start = parse(`${dateBase} ${clockIn}`, 'yyyy-MM-dd HH:mm', new Date());
                const end = parse(`${dateBase} ${clockOut}`, 'yyyy-MM-dd HH:mm', new Date());

                let diffMin = differenceInMinutes(end, start);
                if (diffMin < 0) diffMin += 24 * 60; // Handle overnight

                diffMin -= breakMinutes;
                if (diffMin < 0) diffMin = 0;

                workedHours = Number((diffMin / 60).toFixed(2));
            }

            // Mark as manual
            const currentNotes = timecard?.notes || '';
            const newNotes = currentNotes.includes('手動') ? currentNotes : (currentNotes ? `${currentNotes} [手動]` : '手動修正');

            const payload = {
                staff_id: staffId,
                clock_in: clockIn || null,
                clock_out: clockOut || null,
                break_minutes: breakMinutes,
                worked_hours: workedHours,
                notes: newNotes,
                date: date
            };

            // 1. Handle Date Move (Cleanup old record if date changed)
            if (timecard?.date && timecard.date !== date) {
                console.log('Date changed, deleting old record:', timecard.date);
                const { error: deleteError } = await supabase
                    .from('timecards')
                    .delete()
                    .eq('staff_id', staffId)
                    .eq('date', timecard.date);

                if (deleteError) {
                    console.error('Failed to delete old record:', deleteError);
                    throw deleteError;
                }
            }

            // 2. Perform Upsert (Update if exists, Insert if new) based on Unique Key (staff_id, date)
            console.log('Executing Upsert:', payload);
            const { error: upsertError } = await supabase
                .from('timecards')
                .upsert(payload, { onConflict: 'staff_id, date' });

            if (upsertError) {
                console.error('Supabase Upsert Error:', JSON.stringify(upsertError, null, 2));
                throw upsertError;
            }

            console.log('Save successful');
            alert('保存しました');
            onSave();
            onClose();
        } catch (error) {
            console.error('Save Failure:', error);
            alert('保存に失敗しました。詳細はコンソールをご確認ください。');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('この勤怠データを削除しますか？')) return;
        setLoading(true);
        try {
            // Delete by Composite Key (staff_id, date)
            const { error } = await supabase
                .from('timecards')
                .delete()
                .eq('staff_id', staffId)
                .eq('date', timecard.date);

            if (error) throw error;
            onSave();
            onClose();
        } catch (error) {
            console.error('Delete error', error);
            alert('削除に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 transition-opacity" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-xl font-bold text-gray-900">勤怠の編集</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Date Editing Enabled */}
                    <div>
                        <label className="block text-sm font-bold text-gray-900 mb-2">対象日付</label>
                        <input
                            type="date"
                            required
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full border border-gray-400 rounded-lg px-4 py-3 text-gray-900 bg-white font-bold focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-900 mb-2">出勤</label>
                            <input
                                type="time"
                                required
                                value={clockIn}
                                step="60"
                                onFocus={(e) => !e.target.value && setClockIn('12:00')}
                                onClick={(e) => !(e.target as HTMLInputElement).value && setClockIn('12:00')}
                                onChange={(e) => setClockIn(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-bold text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-900 mb-2">退勤</label>
                            <input
                                type="time"
                                required
                                value={clockOut}
                                step="60"
                                onFocus={(e) => !e.target.value && setClockOut('12:00')}
                                onClick={(e) => !(e.target as HTMLInputElement).value && setClockOut('12:00')}
                                onChange={(e) => setClockOut(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-bold text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600"
                            />
                        </div>
                    </div>

                    {/* Break Time */}
                    <div className="bg-blue-50 p-5 rounded-xl border border-blue-100">
                        <label className="block text-sm font-bold text-blue-900 mb-3">休憩時間 (分)</label>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs text-blue-700 mb-1">開始 (自動計算用)</label>
                                <input
                                    type="time"
                                    value={breakStart}
                                    step="60"
                                    onFocus={(e) => !e.target.value && setBreakStart('12:00')}
                                    onClick={(e) => !(e.target as HTMLInputElement).value && setBreakStart('12:00')}
                                    onChange={(e) => {
                                        setBreakStart(e.target.value);
                                        setIsManualBreak(false);
                                    }}
                                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-600"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs text-blue-700 mb-1">終了 (自動計算用)</label>
                                <input
                                    type="time"
                                    value={breakEnd}
                                    step="60"
                                    onFocus={(e) => !e.target.value && setBreakEnd('12:00')}
                                    onClick={(e) => !(e.target as HTMLInputElement).value && setBreakEnd('12:00')}
                                    onChange={(e) => {
                                        setBreakEnd(e.target.value);
                                        setIsManualBreak(false);
                                    }}
                                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-600"
                                />
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-blue-200 flex justify-between items-center">
                            <span className="text-sm font-bold text-blue-900">休憩合計 (自動計算)</span>
                            <div className="flex items-center space-x-2 bg-white px-3 py-1 rounded border border-blue-200">
                                <input
                                    type="number"
                                    min="0"
                                    value={breakMinutes}
                                    onChange={(e) => {
                                        setBreakMinutes(Number(e.target.value));
                                        setIsManualBreak(true);
                                    }}
                                    className="w-20 text-right font-bold text-xl text-blue-900 bg-white border-none focus:ring-0 p-0 placeholder:text-blue-300"
                                />
                                <span className="text-blue-900 font-bold">分</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-sm text-gray-900 bg-gray-100 p-3 rounded-lg border border-gray-200">
                        <div className="flex items-center font-bold">
                            <Lock size={14} className="mr-2 text-orange-600" />
                            <span>保存すると「手動修正」マークが付きます</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 gap-4">
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="flex items-center justify-center px-4 py-3 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition w-32"
                        >
                            <Trash2 size={18} className="mr-2" />
                            削除
                        </button>
                        <div className="flex gap-3 flex-1 justify-end">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-3 border border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-50 transition"
                            >
                                キャンセル
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-md disabled:opacity-50 flex items-center"
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
