'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { format, addDays, subDays } from 'date-fns';
import { Play, Pause, CheckCircle, ChevronLeft, ChevronRight, RefreshCw, Calendar } from 'lucide-react';
import CompletionModal from './CompletionModal';

export default function ProductionDashboard() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [productionItems, setProductionItems] = useState<any[]>([]);

    // Completion Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);

    // Timer ticker
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        // Ticker for local timer update
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000); // Poll every 10s to sync
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate]);

    const fetchData = async () => {
        try {
            const dateStr = format(currentDate, 'yyyy-MM-dd');
            const { data, error } = await supabase
                .rpc('get_daily_production_summary', { target_date: dateStr });

            if (error) {
                console.error('Error fetching summary:', error);
            } else {
                setProductionItems(data || []);
            }
        } catch (err) {
            console.error('Unexpected error:', err);
        }
    };

    const updateStatus = async (productId: string, newStatus: string) => {
        try {
            const dateStr = format(currentDate, 'yyyy-MM-dd');
            const { error } = await supabase
                .rpc('update_production_status', {
                    p_product_id: productId,
                    p_target_date: dateStr,
                    p_new_status: newStatus
                });

            if (error) throw error;
            fetchData(); // Refresh immediately
        } catch (err) {
            console.error('Error updating status:', err);
            alert('ステータス更新に失敗しました');
        }
    };

    const handleCompletion = (item: any) => {
        setSelectedItem(item);
        setModalOpen(true);
    };

    // Calculate generic stats
    const totalPlanned = productionItems.reduce((sum, item) => sum + (Number(item.total_quantity) || 0), 0);
    const totalActual = productionItems.reduce((sum, item) => sum + (Number(item.total_actual_quantity) || 0), 0);
    // Progress calculation
    const completedItemsCount = productionItems.filter(i => i.current_status === 'completed').length;
    const progress = productionItems.length > 0 ? (completedItemsCount / productionItems.length) * 100 : 0;

    // Check if ANY item is currently processing (for locking)
    const isAnyProcessing = productionItems.some(item => item.current_status === 'processing');

    // Calculate total time (seconds) and labor cost
    const HOURLY_WAGE = 1500;

    let totalSeconds = 0;

    productionItems.forEach(item => {
        let seconds = Number(item.accumulated_time) || 0;
        // If currently processing, add elapsed time locally
        if (item.current_status === 'processing' && item.last_started_at) {
            const start = new Date(item.last_started_at).getTime();
            const current = now.getTime();
            const diff = Math.floor((current - start) / 1000);
            if (diff > 0) seconds += diff;
        }
        totalSeconds += seconds;
    });

    const totalHours = totalSeconds / 3600;
    const totalLaborCost = Math.floor(totalHours * HOURLY_WAGE);

    // Format seconds to H時間 MM分 SS秒
    const formatTimeJapanese = (totalSec: number) => {
        // Prevent negative time display if clocks are skewed
        if (totalSec < 0) totalSec = 0;

        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return `${h}時間 ${m}分 ${s}秒`;
    };

    // Helper for individual item timer (MM:SS)
    const getItemTimeDisplay = (item: any) => {
        let seconds = Number(item.accumulated_time) || 0;
        if (item.current_status === 'processing' && item.last_started_at) {
            const start = new Date(item.last_started_at).getTime();
            const current = now.getTime();
            const diff = Math.floor((current - start) / 1000);
            if (diff > 0) seconds += diff;
        }

        if (seconds < 0) seconds = 0;

        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    return (
        <div className="text-slate-950 pb-32">
            {/* Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white p-4 rounded-xl shadow border border-gray-100">
                <div className="flex items-center space-x-4 mb-4 md:mb-0">
                    <button onClick={() => setCurrentDate(subDays(currentDate, 1))} className="p-2 border rounded hover:bg-gray-50 text-slate-950"><ChevronLeft size={20} /></button>
                    <div className="text-xl font-bold flex items-center text-slate-950">
                        <Calendar className="mr-2 text-slate-950" />
                        {format(currentDate, 'yyyy年 MM月 dd日 (eee)')}
                    </div>
                    <button onClick={() => setCurrentDate(addDays(currentDate, 1))} className="p-2 border rounded hover:bg-gray-50 text-slate-950"><ChevronRight size={20} /></button>
                </div>

                <div className="flex gap-6 text-sm">
                    <div className="text-center">
                        <div className="text-slate-500 font-bold">商品数</div>
                        <div className="font-bold text-lg text-slate-950">{productionItems.length} <span className="text-xs">件</span></div>
                    </div>
                    <div className="text-center border-l border-slate-200 pl-6">
                        <div className="text-slate-500 font-bold">予定総数</div>
                        <div className="font-bold text-lg text-slate-950">{totalPlanned.toLocaleString()} <span className="text-xs">pk</span></div>
                    </div>
                    <div className="text-center border-l border-slate-200 pl-6">
                        <div className="text-slate-500 font-bold">製造実績</div>
                        <div className="font-bold text-lg text-blue-700">{totalActual.toLocaleString()} <span className="text-xs">pk</span></div>
                    </div>
                    <div className="text-center border-l border-slate-200 pl-6">
                        <div className="text-slate-500 font-bold">進捗</div>
                        <div className="font-bold text-lg text-green-700">{Math.round(progress)}%</div>
                    </div>
                </div>

                <button onClick={() => fetchData()} className="p-2 text-slate-400 hover:text-blue-600 transition">
                    <RefreshCw size={20} />
                </button>
            </div>

            {/* List */}
            <div className="space-y-4">
                {productionItems.length === 0 && <div className="text-center py-10 text-slate-400">注文がありません</div>}

                {productionItems.map(item => {
                    const isProcessing = item.current_status === 'processing';
                    const isCompleted = item.current_status === 'completed';

                    // Lock Logic: Disabled if something ELSE is processing AND this one is not the one processing
                    const isLocked = isAnyProcessing && !isProcessing;

                    // Company breakdown string
                    // item.company_breakdown is an array of object { company_name, quantity, status }
                    const companies = item.company_breakdown || [];
                    const companyNames = companies.map((c: any) => c.company_name).join(', ');

                    return (
                        <div key={item.product_id} className={`bg-white p-4 rounded-xl border-l-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 transition text-slate-950 
                            ${isCompleted ? 'border-green-500 opacity-80 bg-slate-50' : isProcessing ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-300'} 
                            ${isLocked ? 'opacity-50 grayscale' : ''}`}>

                            <div className="flex-1 min-w-0 w-full">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-bold text-slate-600">
                                        {companyNames}
                                    </span>
                                </div>
                                <div className="text-xl font-bold text-slate-950 truncate mb-1">{item.product_name}</div>
                                <div className="text-sm text-slate-600 flex items-center gap-4">
                                    <span>予定: <span className="font-bold text-slate-950 text-base">{Number(item.total_quantity).toLocaleString()}</span> {item.unit}</span>

                                    {/* Real-time stats for this item */}
                                    <div className="flex items-center gap-2 bg-slate-100 px-2 py-1 rounded">
                                        ⏱ <span className="font-mono font-bold text-slate-950">{getItemTimeDisplay(item)}</span>
                                    </div>

                                    {Number(item.total_actual_quantity) > 0 && (
                                        <span className="text-blue-700 font-bold">
                                            → 実績: {Number(item.total_actual_quantity).toLocaleString()} {item.unit}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 w-full md:w-auto">
                                {!isCompleted && !isProcessing && (
                                    <button
                                        disabled={isLocked}
                                        onClick={() => updateStatus(item.product_id, 'processing')}
                                        className={`flex-1 md:flex-none w-32 px-4 py-3 rounded-lg font-bold flex items-center justify-center shadow transition
                                            ${isLocked
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                    >
                                        <Play size={18} className="mr-2" /> 開始
                                    </button>
                                )}

                                {isProcessing && (
                                    <>
                                        <button
                                            onClick={() => updateStatus(item.product_id, 'pending')}
                                            className="flex-1 md:flex-none w-32 bg-orange-100 text-orange-700 px-4 py-3 rounded-lg font-bold hover:bg-orange-200 flex items-center justify-center"
                                        >
                                            <Pause size={18} className="mr-2" /> 中断
                                        </button>
                                        <button
                                            onClick={() => handleCompletion(item)}
                                            className="flex-1 md:flex-none w-32 bg-green-600 text-white px-4 py-3 rounded-lg font-bold hover:bg-green-700 flex items-center justify-center shadow"
                                        >
                                            <CheckCircle size={18} className="mr-2" /> 完了
                                        </button>
                                    </>
                                )}

                                {isCompleted && (
                                    <button
                                        onClick={() => handleCompletion(item)} // Re-open for edit
                                        className="bg-gray-100 text-gray-500 px-4 py-2 rounded-lg font-bold hover:bg-gray-200 text-sm"
                                    >
                                        修正
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Sticky Footer Summary */}
            <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 shadow-2xl border-t border-slate-700 z-10 opacity-95">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-6">
                        <div>
                            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">総製造時間</div>
                            <div className="text-2xl font-mono font-bold text-white tracking-widest">
                                {formatTimeJapanese(totalSeconds)}
                            </div>
                        </div>
                        <div className="h-10 w-px bg-slate-700 hidden md:block"></div>
                        <div>
                            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">概算人件費</div>
                            <div className="text-2xl font-mono font-bold text-green-400">
                                ¥{totalLaborCost.toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <CompletionModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                productId={selectedItem?.product_id || ''}
                productName={selectedItem?.product_name || ''}
                targetDate={currentDate}
                expectedQuantity={selectedItem?.total_quantity || 0}
                onCompleted={fetchData}
            />
        </div>
    );
}
