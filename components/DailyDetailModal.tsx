'use client';

import { X } from 'lucide-react';
import { format } from 'date-fns';

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

interface DailyDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: DailyDetailData | null;
    onPrev: () => void;
    onNext: () => void;
}

export default function DailyDetailModal({ isOpen, onClose, data, onPrev, onNext }: DailyDetailModalProps) {
    if (!isOpen || !data) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 transition-opacity" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center space-x-4">
                        <button onClick={onPrev} className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition shadow-sm">
                            ← 前日
                        </button>
                        <div>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {format(new Date(data.date), 'MM/dd (eee)')} 詳細
                            </h3>
                            <p className="text-base text-gray-500 mt-1">出勤: {data.totalCount}名</p>
                        </div>
                        <button onClick={onNext} className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition shadow-sm">
                            翌日 →
                        </button>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-gray-100 p-2 rounded-full transition">
                        <X size={24} />
                    </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-4 text-left text-sm font-bold text-gray-600 uppercase">氏名</th>
                                <th className="px-6 py-4 text-right text-sm font-bold text-gray-600 uppercase">労働時間</th>
                                <th className="px-6 py-4 text-right text-sm font-bold text-gray-600 uppercase">概算人件費</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {data.details.map((detail, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-6 py-5 text-lg text-gray-900 font-bold">
                                        {detail.staffName}
                                    </td>
                                    <td className="px-6 py-5 text-lg text-gray-600 text-right font-medium">
                                        {detail.hours.toFixed(1)} <span className="text-sm">h</span>
                                    </td>
                                    <td className="px-6 py-5 text-lg text-gray-900 font-bold text-right">
                                        ¥{detail.cost.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-600">日計</span>
                    <span className="text-3xl font-bold text-gray-900">¥{data.totalCost.toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
}
