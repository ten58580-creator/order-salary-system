'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { X, Printer, Calendar, Save } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import PrintHeader from './PrintHeader';
import { Database } from '@/types/supabase';

type Product = Database['public']['Tables']['products']['Row'];

// Define Order type locally to ensure we have the necessary fields joined
interface OrderWithProduct {
    id: string;
    order_date: string;
    quantity: number;
    unit_price: number;
    product_name: string;
    product_unit: string;
    status: string;
}

interface OrderHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    companyId: string;
    companyName?: string;
}

export default function OrderHistoryModal({ isOpen, onClose, companyId, companyName }: OrderHistoryModalProps) {
    const [orders, setOrders] = useState<OrderWithProduct[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

    // Generate month options (last 12 months)
    const monthOptions = Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(new Date(), i);
        return {
            value: format(d, 'yyyy-MM'),
            label: format(d, 'yyyy年MM月', { locale: ja })
        };
    });

    useEffect(() => {
        if (isOpen && companyId) {
            fetchOrders();
        }
    }, [isOpen, companyId, selectedMonth]);

    const fetchOrders = async () => {
        setLoading(true);
        console.log('Fetching orders for month:', selectedMonth);

        const start = startOfMonth(parseISO(selectedMonth + '-01')).toISOString();
        const end = endOfMonth(parseISO(selectedMonth + '-01')).toISOString();

        // Join products to get name
        const { data, error } = await supabase
            .from('orders')
            .select(`
                id,
                order_date,
                quantity,
                unit_price,
                status,
                products (
                    name,
                    unit
                )
            `)
            .eq('company_id', companyId)
            .gte('order_date', start)
            .lte('order_date', end)
            .order('order_date', { ascending: false });

        if (error) {
            console.error('Error fetching orders:', error);
            alert('注文履歴の取得に失敗しました');
        } else if (data) {
            // Transform data to flat structure
            const formatted: OrderWithProduct[] = data.map((item: any) => ({
                id: item.id,
                order_date: item.order_date,
                quantity: item.quantity,
                unit_price: item.unit_price,
                product_name: item.products?.name || '不明な商品',
                product_unit: item.products?.unit || '',
                status: item.status
            }));
            setOrders(formatted);
        }
        setLoading(false);
    };

    // Handle Print
    const handlePrint = () => {
        window.print();
    };

    // Calculate Total
    const totalAmount = orders.reduce((sum, order) => sum + (order.quantity * order.unit_price), 0);

    if (!isOpen) return null;

    return (
        <>
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 transition-opacity no-print"
                onClick={onClose}
            >
                <div
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white">
                        <div className="flex items-center gap-4">
                            <h3 className="font-extrabold text-2xl text-gray-900">注文履歴一覧</h3>

                            {/* Month Selector */}
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="pl-10 pr-8 py-2 border-2 border-slate-300 rounded-lg font-bold text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all appearance-none bg-white"
                                >
                                    {monthOptions.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center space-x-4">
                            <button
                                onClick={handlePrint}
                                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition flex items-center shadow-sm"
                            >
                                <Printer size={16} className="mr-2" />
                                印刷 / PDF保存
                            </button>
                            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">
                                <X size={24} className="text-gray-600" />
                            </button>
                        </div>
                    </div>

                    {/* Table Content */}
                    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                        {loading ? (
                            <div className="text-center py-20 font-bold text-gray-500">読み込み中...</div>
                        ) : orders.length === 0 ? (
                            <div className="text-center py-20 font-bold text-gray-400">
                                この月の注文履歴はありません。
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase">納品希望日</th>
                                            <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase">商品名</th>
                                            <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase text-center">数量</th>
                                            <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase text-right">単価</th>
                                            <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase text-right">小計</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {orders.map((order) => (
                                            <tr key={order.id} className="hover:bg-blue-50 transition-colors">
                                                <td className="px-6 py-4 font-bold text-gray-700">
                                                    {format(parseISO(order.order_date), 'MM/dd')}
                                                </td>
                                                <td className="px-6 py-4 font-bold text-gray-900">
                                                    {order.product_name}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className="font-bold text-slate-800">{order.quantity}</span>
                                                    <span className="text-xs text-gray-500 ml-1">{order.product_unit}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono font-medium text-gray-600">
                                                    ¥{order.unit_price.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                                                    ¥{(order.quantity * order.unit_price).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                                        <tr>
                                            <td colSpan={4} className="px-6 py-4 text-right font-extrabold text-gray-600">
                                                {format(parseISO(selectedMonth + '-01'), 'yyyy年MM月', { locale: ja })} 合計
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-xl font-black text-blue-600">
                                                ¥{totalAmount.toLocaleString()}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* PRINT VIEW */}
            <div className="hidden print:block w-full">
                <div className="print-only-header">
                    <h1>注文履歴明細表</h1>
                    <div className="meta">
                        <p>{companyName || '株式会社TEN&A'}</p>
                        <p>対象月: {format(parseISO(selectedMonth + '-01'), 'yyyy年MM月', { locale: ja })}</p>
                        <p>発行日: {format(new Date(), 'yyyy/MM/dd')}</p>
                    </div>
                </div>

                <table className="w-full text-left border-collapse text-sm">
                    <thead>
                        <tr>
                            <th className="w-[15%]">納品希望日</th>
                            <th>商品名</th>
                            <th className="w-[10%] text-center">数量</th>
                            <th className="w-[15%] text-right">単価</th>
                            <th className="w-[15%] text-right">金額</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((order) => (
                            <tr key={order.id} className="break-inside-avoid">
                                <td className="font-medium">
                                    {format(parseISO(order.order_date), 'MM/dd')}
                                </td>
                                <td className="font-medium">
                                    {order.product_name}
                                </td>
                                <td className="text-center">
                                    {order.quantity} <span className="text-xs">{order.product_unit}</span>
                                </td>
                                <td className="text-right font-mono">
                                    {order.unit_price.toLocaleString()}
                                </td>
                                <td className="text-right font-mono font-bold">
                                    {(order.quantity * order.unit_price).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={4} className="text-right font-black text-lg pr-4 border-t-2 border-black">合計</td>
                            <td className="text-right font-mono font-black text-lg border-t-2 border-black">
                                ¥{totalAmount.toLocaleString()}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </>
    );
}
