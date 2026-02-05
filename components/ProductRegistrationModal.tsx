'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { X, Save, Plus } from 'lucide-react';

interface ProductRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    companyId: string;
    onProductRegistered: (newProductId: string) => void;
}

export default function ProductRegistrationModal({ isOpen, onClose, companyId, onProductRegistered }: ProductRegistrationModalProps) {
    const [name, setName] = useState('');
    const [yomigana, setYomigana] = useState('');
    const [price, setPrice] = useState('');
    const [unit, setUnit] = useState('pk');
    const [loading, setLoading] = useState(false);

    // For robust auto-yomigana
    const lastHiragana = useRef('');
    const isComposing = useRef(false);
    const compositionCursor = useRef(''); // Snapshot of yomigana at start of composition
    const yomiganaMap = useRef<Map<string, string>>(new Map([['', '']]));
    const isManualChange = useRef(false);

    const units = ['pk', 'cs', 'kg', 'g', 'L', '袋', '箱', '個', '本', 'セット', '束'];

    const resetForm = () => {
        setName('');
        setYomigana('');
        setPrice('');
        setUnit('pk');
        lastHiragana.current = '';
        isComposing.current = false;
        compositionCursor.current = '';
        yomiganaMap.current.clear();
        yomiganaMap.current.set('', '');
        isManualChange.current = false;
    };

    useEffect(() => {
        if (isOpen) {
            resetForm();
        }
    }, [isOpen]);

    const handleCompositionStart = () => {
        if (isManualChange.current) return;
        isComposing.current = true;
        compositionCursor.current = yomigana; // Snapshot current yomigana
        lastHiragana.current = '';
    };

    const handleCompositionUpdate = (e: React.CompositionEvent<HTMLInputElement>) => {
        if (isManualChange.current) return;
        const data = e.data;
        if (data && /^[\u3040-\u309f\u30fc]+$/.test(data)) {
            lastHiragana.current = data;
        }
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
        if (isManualChange.current) return;
        isComposing.current = false;
        const captured = lastHiragana.current;
        const finalName = e.currentTarget.value;

        let finalYomi = compositionCursor.current;

        // "Overwrite" Strategy: Always reconstruct from Snapshot + Captured
        if (captured) {
            finalYomi = compositionCursor.current + captured;
        } else if (/^[\u3040-\u309f\u30fc]+$/.test(finalName)) {
            // Fallback for direct Hiragana input
            finalYomi = finalName;
        }

        setYomigana(finalYomi);
        yomiganaMap.current.set(finalName, finalYomi);
        lastHiragana.current = '';
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        const oldName = name;
        setName(newVal);

        // Reset Manual Flag if Empty
        if (newVal === '') {
            isManualChange.current = false;
            setYomigana('');
            return;
        }

        if (isManualChange.current) return;
        if (isComposing.current) return;

        // 1. Map Restore (Primary)
        if (yomiganaMap.current.has(newVal)) {
            setYomigana(yomiganaMap.current.get(newVal)!);
            return;
        }

        // 2. Hiragana Deletion Intelligence
        if (newVal.length < oldName.length) {
            const deleted = oldName.slice(newVal.length);
            if (/^[\u3040-\u309f\u30fc]+$/.test(deleted) && yomigana.endsWith(deleted)) {
                const newYomi = yomigana.slice(0, -deleted.length);
                setYomigana(newYomi);
                yomiganaMap.current.set(newVal, newYomi);
                return;
            }
        }

        // 3. Pure Hiragana Fallback
        if (/^[\u3040-\u309f\u30fc]+$/.test(newVal)) {
            setYomigana(newVal);
            yomiganaMap.current.set(newVal, newVal);
        }
    };

    const handleYomiganaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setYomigana(e.target.value);
        isManualChange.current = true;
    };

    const handleSave = async () => {
        if (!name || !price || !companyId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('products')
                .insert([{
                    company_id: companyId,
                    name: name,
                    yomigana: yomigana,
                    unit_price: Number(price),
                    unit: unit
                }])
                .select()
                .single();

            if (error) throw error;

            if (data) {
                onProductRegistered(data.id);
                onClose();
            }
        } catch (e: any) {
            alert('登録エラー: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-gray-50 border-b border-gray-100 p-6 flex justify-between items-center">
                    <h3 className="font-extrabold text-xl text-gray-900 flex items-center">
                        <Plus className="mr-2 text-blue-600" strokeWidth={3} />
                        商品新規登録
                    </h3>
                    <button onClick={onClose} className="p-2 bg-white border border-gray-200 rounded-full hover:bg-gray-100 text-gray-500 transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-1">商品名</label>
                        <input
                            type="text"
                            value={name}
                            onChange={handleNameChange}
                            onCompositionStart={handleCompositionStart}
                            onCompositionUpdate={handleCompositionUpdate}
                            onCompositionEnd={handleCompositionEnd}
                            className="w-full border-2 border-slate-400 rounded-lg p-3 focus:ring-4 focus:ring-blue-100 focus:border-blue-600 font-bold text-slate-900 text-lg placeholder-slate-500 transition-all"
                            placeholder="例: 特製モンブラン"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">よみがな (ひらがな)</label>
                        <input
                            type="text"
                            value={yomigana}
                            onChange={handleYomiganaChange}
                            className="w-full border-2 border-slate-400 rounded-lg p-3 focus:ring-4 focus:ring-blue-100 focus:border-blue-600 font-medium text-slate-900 placeholder-slate-500 transition-all"
                            placeholder="例: もんぶらん"
                        />
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-500 mb-1">単価 (円)</label>
                            <input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                className="w-full border-2 border-slate-400 rounded-lg p-3 focus:ring-4 focus:ring-blue-100 focus:border-blue-600 font-mono font-bold text-slate-900 text-lg text-right placeholder-slate-500 transition-all"
                                placeholder="0"
                            />
                        </div>
                        <div className="w-24">
                            <label className="block text-xs font-bold text-gray-500 mb-1">単位</label>
                            <select
                                value={unit}
                                onChange={(e) => setUnit(e.target.value)}
                                className="w-full border-2 border-slate-400 rounded-lg p-3 focus:ring-4 focus:ring-blue-100 focus:border-blue-600 font-bold text-slate-900 text-lg h-[54px] transition-all"
                            >
                                {units.map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={loading || !name || !price}
                        className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 shadow-sm disabled:opacity-50 mt-2 transition"
                    >
                        {loading ? '登録中...' : '登録して選択'}
                    </button>
                </div>
            </div>
        </div>
    );
}
