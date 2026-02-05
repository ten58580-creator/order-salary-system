'use client';

import { useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { X, Check } from 'lucide-react';
import { format } from 'date-fns';

interface CompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    // We now operate on Product level primarily
    productId: string;
    productName: string;
    targetDate: Date;
    expectedQuantity: number;
    onCompleted: () => void;
}

export default function CompletionModal({ isOpen, onClose, productId, productName, targetDate, expectedQuantity, onCompleted }: CompletionModalProps) {
    const [actualQuantity, setActualQuantity] = useState<number | ''>('');
    const [loading, setLoading] = useState(false);

    const handleComplete = async () => { // Removed productId parameter from function signature as it's available in scope
        setLoading(true);
        try {
            const finalQty = actualQuantity === '' ? expectedQuantity : Number(actualQuantity);
            const dateStr = format(targetDate, 'yyyy-MM-dd');

            // Use the RPC to update status to 'completed' and set actual quantity
            const { error } = await supabase
                .rpc('update_production_status', {
                    p_product_id: productId,
                    p_target_date: dateStr,
                    p_new_status: 'completed',
                    p_actual_total: finalQty
                });

            if (error) throw error;
            onCompleted();
            onClose();
        } catch (e: any) {
            alert('エラー: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 transition-opacity text-slate-950" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b bg-green-50">
                    <h3 className="font-bold text-lg text-green-900 flex items-center">
                        <Check size={20} className="mr-2" /> 製造完了
                    </h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-gray-600" /></button>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <div className="text-sm text-slate-500 mb-1">商品名</div>
                        <div className="font-bold text-lg text-slate-950">{productName}</div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg flex items-center justify-between border border-gray-200">
                        <div>
                            <div className="text-xs text-slate-500 font-bold mb-1">予定数</div>
                            <div className="text-xl font-bold text-slate-950">{expectedQuantity} <span className="text-sm font-normal">pk</span></div>
                        </div>
                        <div className="text-gray-400">→</div>
                        <div>
                            <div className="text-xs text-blue-600 font-bold mb-1">製造実数</div>
                            <input
                                type="number"
                                placeholder={expectedQuantity.toString()}
                                value={actualQuantity}
                                onChange={(e) => setActualQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-24 border border-blue-300 rounded p-1 text-right text-xl font-bold focus:ring-blue-500 focus:border-blue-500 bg-white text-slate-950"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="text-xs text-slate-500">
                        ※ 実数が予定と異なる場合は入力してください。<br />
                        空欄の場合は予定数 ({expectedQuantity}) が採用されます。
                    </div>

                    <button
                        onClick={handleComplete}
                        disabled={loading}
                        className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 shadow-md transition disabled:opacity-50"
                    >
                        {loading ? '処理中...' : '完了として保存'}
                    </button>
                </div>
            </div>
        </div>
    );
}
