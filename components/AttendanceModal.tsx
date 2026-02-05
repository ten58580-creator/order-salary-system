'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { X } from 'lucide-react';
import { differenceInMinutes, parse, format } from 'date-fns';

interface AttendanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    staffId: string;
}

export default function AttendanceModal({ isOpen, onClose, onSave, staffId }: AttendanceModalProps) {
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [clockIn, setClockIn] = useState('09:00');
    const [clockOut, setClockOut] = useState('17:00');
    const [breakStart, setBreakStart] = useState('12:00');
    const [breakEnd, setBreakEnd] = useState('13:00');
    const [breakMinutes, setBreakMinutes] = useState(60);
    const [isManualBreak, setIsManualBreak] = useState(false);
    const [loading, setLoading] = useState(false);

    // Auto-calculate break minutes when start/end changes
    useEffect(() => {
        if (isManualBreak) return;
        if (breakStart && breakEnd) {
            const today = format(new Date(), 'yyyy-MM-dd');
            const start = parse(`${today} ${breakStart}`, 'yyyy-MM-dd HH:mm', new Date());
            const end = parse(`${today} ${breakEnd}`, 'yyyy-MM-dd HH:mm', new Date());
            let diff = differenceInMinutes(end, start);
            if (diff < 0) diff = 0;
            setBreakMinutes(diff);
        }
    }, [breakStart, breakEnd, isManualBreak]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Calculate worked hours
            const dateBase = date;
            const start = parse(`${dateBase} ${clockIn}`, 'yyyy-MM-dd HH:mm', new Date());
            const end = parse(`${dateBase} ${clockOut}`, 'yyyy-MM-dd HH:mm', new Date());

            let diffMin = differenceInMinutes(end, start);
            if (diffMin < 0) diffMin += 24 * 60; // Handle overnight? Simplicity for now

            diffMin -= breakMinutes;
            if (diffMin < 0) diffMin = 0;

            const workedHours = Number((diffMin / 60).toFixed(2));

            const { error } = await supabase
                .from('timecards')
                .insert({
                    staff_id: staffId,
                    date: date,
                    clock_in: clockIn,
                    clock_out: clockOut,
                    break_minutes: breakMinutes,
                    worked_hours: workedHours,
                    notes: '手動追加',
                });

            if (error) throw error;

            onSave();
            onClose();
        } catch (error) {
            console.error('Error adding attendance:', error);
            alert('登録に失敗しました');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-opacity" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 relative" onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                    <X size={24} />
                </button>

                <h3 className="text-xl font-bold mb-6 text-gray-800">勤怠の手動追加</h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">対象日付</label>
                        <input
                            type="date"
                            required
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">出勤</label>
                            <input
                                type="time"
                                required
                                value={clockIn}
                                onChange={(e) => setClockIn(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">退勤</label>
                            <input
                                type="time"
                                required
                                value={clockOut}
                                onChange={(e) => setClockOut(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">休憩開始</label>
                            <input
                                type="time"
                                value={breakStart}
                                onChange={(e) => {
                                    setBreakStart(e.target.value);
                                    setIsManualBreak(false);
                                }}
                                className="w-full border rounded-lg px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">休憩終了</label>
                            <input
                                type="time"
                                value={breakEnd}
                                onChange={(e) => {
                                    setBreakEnd(e.target.value);
                                    setIsManualBreak(false);
                                }}
                                className="w-full border rounded-lg px-3 py-2"
                            />
                        </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-blue-800 font-medium">休憩合計 (自動計算)</span>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="number"
                                    value={breakMinutes}
                                    onChange={(e) => {
                                        setBreakMinutes(Number(e.target.value));
                                        setIsManualBreak(true);
                                    }}
                                    className="w-16 border rounded px-2 py-1 text-right font-bold text-blue-700"
                                />
                                <span className="text-blue-800">分</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? '保存中...' : '追加する'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
