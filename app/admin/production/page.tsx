'use client';

import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/utils/supabaseClient';
import { ChevronLeft, ChevronRight, CheckCircle, Truck, X, Pause, Play, Timer, Edit, Coins, TrendingUp } from 'lucide-react';
import Link from 'next/link';

// Type definition matching the SQL return from get_daily_production_summary
type ProductionItem = {
    product_id: string;
    product_name: string;
    unit: string;
    total_quantity: number;
    total_actual_quantity: number;
    status_counts: { [key: string]: number };
    company_breakdown: { company_name: string; quantity: number; status: string }[];
    current_status: string; // 'pending' | 'processing' | 'completed'
    accumulated_time: number; // Seconds from DB
    last_started_at: string | null;
};

const HOURLY_WAGE = 1500;

export default function ProductionPage() {
    const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<ProductionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [now, setNow] = useState(Date.now());

    // Polling Block Ref
    const blockPollingUntil = useRef<number>(0);

    // Modal State
    const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
    const [completingItem, setCompletingItem] = useState<ProductionItem | null>(null);
    const [actualInput, setActualInput] = useState<string>('');

    // Active Processing Item (Exclusive Lock)
    const activeProcessingItem = items.find(item => item.current_status === 'processing');
    const isAnyProcessing = !!activeProcessingItem;

    // Tick for timers
    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchProductionData = async (date: string) => {
        // Skip if blocked
        if (Date.now() < blockPollingUntil.current) {
            return;
        }

        try {
            const { data, error } = await supabase.rpc('get_daily_production_summary', { target_date: date });

            if (error) {
                console.error('RPC Error Detailed:', JSON.stringify(error, null, 2));
                return;
            }

            setItems((data as ProductionItem[]) || []);
        } catch (e) {
            console.error('Fetch Error:', e);
        } finally {
            setLoading(false);
        }
    };

    // Initial Load & Date Change
    useEffect(() => {
        setLoading(true);
        blockPollingUntil.current = 0;
        fetchProductionData(currentDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate]);

    // Polling Interval
    useEffect(() => {
        const pollInterval = setInterval(() => {
            fetchProductionData(currentDate);
        }, 5000);

        return () => clearInterval(pollInterval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate]);

    // Calculate elapsed time
    const getElapsedTime = (item: ProductionItem) => {
        let seconds = item.accumulated_time || 0;
        if (item.current_status === 'processing' && item.last_started_at) {
            const start = new Date(item.last_started_at).getTime();
            const additional = Math.floor((now - start) / 1000);
            if (additional > 0) seconds += additional;
        }
        return seconds;
    };

    // Calculate Summary Stats
    const calculateSummary = () => {
        let totalSeconds = 0;
        let totalActualQuantity = 0;

        items.forEach(item => {
            totalSeconds += getElapsedTime(item);
            totalActualQuantity += (item.total_actual_quantity || 0);
        });

        const totalHours = totalSeconds / 3600;
        const laborCost = Math.floor(totalHours * HOURLY_WAGE);

        let efficiency = 0;
        if (totalHours > 0) {
            efficiency = Math.floor(totalActualQuantity / totalHours);
        }

        return { totalSeconds, laborCost, efficiency, totalActualQuantity };
    };

    const summary = calculateSummary();

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const formatTimeSimple = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h}時間${m}分${s}秒`;
    };

    const handleCompleteClick = (item: ProductionItem) => {
        setCompletingItem(item);
        setActualInput(item.total_actual_quantity?.toString() || item.total_quantity.toString());
        setIsCompletionModalOpen(true);
    };

    const setBlock = () => {
        blockPollingUntil.current = Date.now() + 5000;
    };

    const executeCompletion = async () => {
        if (!completingItem) return;

        const actualVal = parseInt(actualInput);
        if (isNaN(actualVal)) {
            alert('数字を入力してください');
            return;
        }

        const newStatus = 'completed';
        const productId = completingItem.product_id;

        setBlock();

        // Optimistic Update
        setItems(prev => prev.map(item => {
            if (item.product_id === productId) {
                const currentElapsed = getElapsedTime(item);
                return {
                    ...item,
                    current_status: 'completed',
                    total_actual_quantity: actualVal,
                    accumulated_time: currentElapsed,
                    last_started_at: null
                };
            }
            return item;
        }));

        setIsCompletionModalOpen(false);
        setCompletingItem(null);

        const { error } = await supabase.rpc('update_production_status', {
            p_product_id: productId,
            p_target_date: currentDate,
            p_new_status: newStatus,
            p_actual_total: actualVal
        });

        if (error) {
            console.error('Update Status Error:', error);
            alert('更新エラー: ' + error.message);
            blockPollingUntil.current = 0;
            fetchProductionData(currentDate);
        }
    };

    const updateStatusSimple = async (productId: string, newStatus: string) => {
        setBlock();

        setItems(prev => prev.map(item => {
            if (item.product_id === productId) {
                const nowISO = new Date().toISOString();
                let newAccTime = item.accumulated_time || 0;

                if (item.current_status === 'processing' && item.last_started_at) {
                    const start = new Date(item.last_started_at).getTime();
                    const additional = Math.floor((Date.now() - start) / 1000);
                    if (additional > 0) newAccTime += additional;
                }

                return {
                    ...item,
                    current_status: newStatus,
                    last_started_at: newStatus === 'processing' ? nowISO : null,
                    accumulated_time: newAccTime
                };
            }
            return item;
        }));

        const { error } = await supabase.rpc('update_production_status', {
            p_product_id: productId,
            p_target_date: currentDate,
            p_new_status: newStatus,
            p_actual_total: null
        });

        if (error) {
            console.error('Update Status Error:', error);
            alert('更新エラー: ' + error.message);
            blockPollingUntil.current = 0;
            fetchProductionData(currentDate);
        }
    };

    const changeDate = (days: number) => {
        const date = new Date(currentDate);
        date.setDate(date.getDate() + days);
        setCurrentDate(date.toISOString().split('T')[0]);
    };

    const sortedItems = [...items].sort((a, b) => {
        const isCompA = a.current_status === 'completed';
        const isCompB = b.current_status === 'completed';
        if (isCompA && !isCompB) return 1;
        if (!isCompA && isCompB) return -1;
        return 0;
    });

    return (
        <DashboardLayout>
            <div className="max-w-5xl mx-auto pb-48">
                <div className="mb-8">
                    <Link href="/admin" className="text-slate-950 hover:text-blue-700 font-bold flex items-center mb-4 transition w-fit">
                        <ChevronLeft size={20} className="mr-1" />
                        ダッシュボードに戻る
                    </Link>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex items-center">
                            <h1 className="text-3xl font-extrabold text-slate-950 flex items-center mr-4">
                                <Truck className="mr-3" size={32} />
                                製造指示・工数管理
                            </h1>
                            {isAnyProcessing && (
                                <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-bold animate-pulse flex items-center border border-red-200 shadow-sm">
                                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                                    一作業集中モード中
                                </span>
                            )}
                        </div>
                        <div className="flex items-center bg-slate-100 p-1.5 rounded-lg">
                            <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white rounded-md shadow-sm transition">
                                <ChevronLeft className="text-slate-950" />
                            </button>
                            <input
                                type="date"
                                value={currentDate}
                                onChange={(e) => setCurrentDate(e.target.value)}
                                className="bg-transparent border-none text-xl font-bold text-slate-950 mx-4 focus:ring-0 cursor-pointer"
                            />
                            <button onClick={() => changeDate(1)} className="p-2 hover:bg-white rounded-md shadow-sm transition">
                                <ChevronRight className="text-slate-950" />
                            </button>
                        </div>
                    </div>
                </div>

                {loading && items.length === 0 ? (
                    <div className="text-center py-20 text-slate-950 font-bold text-xl animate-pulse">読み込み中...</div>
                ) : sortedItems.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                        <p className="text-slate-400 font-bold text-xl">この日の注文はありません</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {sortedItems.map((item) => {
                            const status = item.current_status;
                            const isCompleted = status === 'completed';
                            const elapsedTime = getElapsedTime(item);
                            const timeStr = formatTime(elapsedTime);
                            const isProcessing = status === 'processing';

                            // Exclusive Lock
                            const isLocked = isAnyProcessing && !isProcessing;

                            return (
                                <div
                                    key={item.product_id}
                                    className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden transition-all duration-300 ${isCompleted ? 'border-gray-200 opacity-60 bg-gray-50' :
                                        isProcessing ? 'border-blue-500 ring-4 ring-blue-100 shadow-2xl scale-[1.01] z-10' :
                                            isLocked ? 'border-gray-100 opacity-40 grayscale pointer-events-none' :
                                                'border-slate-200 shadow-md transform hover:border-blue-300'
                                        }`}
                                >
                                    <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                                        {/* Left Info */}
                                        <div className="flex-1 w-full text-slate-950">
                                            <div className="flex items-center gap-3 mb-2">
                                                {!isCompleted && status === 'processing' && (
                                                    <div className="px-4 py-1.5 rounded-full text-sm font-black tracking-wide bg-blue-600 text-white animate-pulse">
                                                        製造中
                                                    </div>
                                                )}

                                                <h2 className={`text-3xl font-black ${isCompleted ? 'text-slate-400' : 'text-slate-950'}`}>
                                                    {item.product_name}
                                                </h2>

                                                <div className="ml-auto md:ml-4 flex items-center bg-slate-100 px-4 py-2 rounded-lg border border-slate-200">
                                                    <Timer size={24} className={`mr-3 ${status === 'processing' ? 'text-blue-600 animate-spin-slow' : 'text-slate-400'}`} />
                                                    <span className="font-mono text-3xl font-black text-slate-950 tracking-widest leading-none">
                                                        {timeStr}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2 mt-4">
                                                {item.company_breakdown.map((client, idx) => (
                                                    <span key={idx} className="inline-flex items-center px-3 py-1 rounded-md text-sm font-bold bg-slate-50 text-slate-950 border border-slate-200">
                                                        {client.company_name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Right Actions */}
                                        <div className="flex flex-col items-end gap-5 min-w-[340px]">
                                            <div className="text-right">
                                                <div className="text-sm font-bold text-slate-500 mb-1">
                                                    {isCompleted ? '製造実績' : '製造予定'}
                                                </div>
                                                <div className={`text-5xl font-black ${isCompleted ? 'text-green-600' : 'text-slate-950'}`}>
                                                    {isCompleted ? item.total_actual_quantity : item.total_quantity}
                                                    <span className="text-2xl ml-2 text-slate-400 font-bold">{item.unit}</span>
                                                </div>
                                            </div>

                                            <div className="flex gap-2 w-full">
                                                {!isCompleted && (
                                                    <>
                                                        <button
                                                            onClick={isProcessing ? undefined : () => updateStatusSimple(item.product_id, 'processing')}
                                                            disabled={isLocked || isProcessing}
                                                            className={`flex-1 py-4 px-2 rounded-xl font-black transition flex items-center justify-center border-b-4 active:border-b-0 active:translate-y-1 text-lg ${isProcessing
                                                                ? 'bg-blue-100 text-blue-300 border-blue-200 cursor-default shadow-inner'
                                                                : isLocked
                                                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                                    : 'bg-white text-slate-950 border-slate-300 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 shadow-sm'
                                                                }`}
                                                        >
                                                            <Play size={20} className={`mr-1 ${isProcessing ? 'fill-blue-300' : ''}`} />
                                                            {isProcessing ? '製造中' : '開始'}
                                                        </button>

                                                        <button
                                                            onClick={!isProcessing ? undefined : () => updateStatusSimple(item.product_id, 'pending')}
                                                            disabled={!isProcessing}
                                                            className={`flex-1 py-4 px-2 rounded-xl font-black transition flex items-center justify-center border-b-4 active:border-b-0 active:translate-y-1 text-lg ${!isProcessing
                                                                ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                                                                : 'bg-orange-100 text-slate-950 border-orange-300 hover:bg-orange-200 shadow-sm'
                                                                }`}
                                                        >
                                                            <Pause size={20} className="mr-1" />
                                                            中断
                                                        </button>
                                                    </>
                                                )}

                                                <button
                                                    onClick={() => handleCompleteClick(item)}
                                                    disabled={isLocked}
                                                    className={`flex-1 py-4 px-2 rounded-xl font-black transition flex items-center justify-center border-b-4 active:border-b-0 active:translate-y-1 text-lg ${isCompleted
                                                        ? 'bg-green-100 text-green-800 border-green-200 cursor-default'
                                                        : isLocked
                                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                            : 'bg-green-400 text-slate-950 border-green-600 hover:bg-green-300 shadow-lg'
                                                        }`}
                                                >
                                                    <CheckCircle size={20} className="mr-1" /> 完了
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* PRODUCTION SUMMARY FOOTER */}
                {items.length > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-4 border-blue-500 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] p-6 z-40 transform transition-transform duration-300">
                        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
                            <div className="flex bg-slate-50 px-6 py-3 rounded-2xl border border-slate-200 shadow-inner flex-1 w-full justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-blue-100 rounded-full text-blue-600">
                                        <Timer size={28} />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">総製造時間</div>
                                        <div className="text-3xl font-black text-slate-950 font-mono tracking-tight">
                                            {formatTimeSimple(summary.totalSeconds)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex bg-slate-50 px-6 py-3 rounded-2xl border border-slate-200 shadow-inner flex-1 w-full justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-orange-100 rounded-full text-orange-600">
                                        <Coins size={28} />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">概算人件費 (¥{HOURLY_WAGE.toLocaleString()}/h)</div>
                                        <div className="text-3xl font-black text-slate-950 font-mono tracking-tight">
                                            ¥{summary.laborCost.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex bg-slate-50 px-6 py-3 rounded-2xl border border-slate-200 shadow-inner flex-1 w-full justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-green-100 rounded-full text-green-600">
                                        <TrendingUp size={28} />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">製造効率 (個/h)</div>
                                        <div className="text-3xl font-black text-slate-950 font-mono tracking-tight">
                                            {summary.efficiency.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}


                {/* Completion Modal */}
                {isCompletionModalOpen && completingItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transform scale-100 transition-all">
                            <div className="bg-green-50 border-b border-green-100 p-6 flex justify-between items-center">
                                <h3 className="font-extrabold text-2xl text-green-900 flex items-center">
                                    <CheckCircle className="mr-3 text-green-600" size={28} />
                                    製造完了報告
                                </h3>
                                <button onClick={() => setIsCompletionModalOpen(false)} className="p-2 bg-white rounded-full hover:bg-gray-100 text-gray-500 transition">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-8">
                                <h4 className="text-3xl font-black text-slate-950 mb-6 text-center">{completingItem.product_name}</h4>

                                <div className="mb-8 text-center bg-slate-900 rounded-2xl p-6 text-white shadow-inner">
                                    <div className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-2">Total Time</div>
                                    <div className="font-mono text-5xl font-black tracking-widest text-green-400">
                                        {formatTime(getElapsedTime(completingItem))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6 mb-8">
                                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 text-center">
                                        <div className="text-xs font-bold text-slate-500 mb-1">予定数</div>
                                        <div className="text-3xl font-black text-slate-400">
                                            {completingItem.total_quantity} <span className="text-sm">{completingItem.unit}</span>
                                        </div>
                                    </div>
                                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center relative group focus-within:ring-2 focus-within:ring-blue-500">
                                        <div className="text-xs font-bold text-blue-600 mb-1">製造実数</div>
                                        <input
                                            type="number"
                                            value={actualInput}
                                            onChange={(e) => setActualInput(e.target.value)}
                                            className="w-full text-center text-3xl font-black text-slate-950 bg-transparent border-none outline-none p-0 placeholder-gray-300"
                                            placeholder={completingItem.total_quantity.toString()}
                                            autoFocus
                                        />
                                        <div className="absolute top-2 right-2 opacity-0 group-focus-within:opacity-100 text-blue-400">
                                            <Edit size={16} />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={executeCompletion}
                                    className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-xl shadow-xl hover:bg-slate-800 hover:scale-[1.01] transition-transform active:scale-95 flex items-center justify-center"
                                >
                                    <CheckCircle className="mr-3" />
                                    完了履歴として保存
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
