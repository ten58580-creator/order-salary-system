'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { X, Save, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

type Product = Database['public']['Tables']['products']['Row'];
type Order = Database['public']['Tables']['orders']['Row'];

interface OrderEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    companyId: string;
    existingOrder?: Order | null;
    onSave: () => void;
}

export default function OrderEntryModal({ isOpen, onClose, date, companyId, existingOrder, onSave }: OrderEntryModalProps) {
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProductId, setSelectedProductId] = useState<string>('');
    const [quantity, setQuantity] = useState<number | ''>('');
    const [unitPrice, setUnitPrice] = useState<number>(0);
    const [loading, setLoading] = useState(false);

    const [recentProducts, setRecentProducts] = useState<Product[]>([]);

    // Searchable Dropdown State
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const filteredProducts = products.map(p => {
        if (!searchTerm) return { product: p, score: 0 };

        const toHiragana = (str: string) => str.replace(/[\u30a1-\u30f6]/g, match => String.fromCharCode(match.charCodeAt(0) - 0x60));
        const term = toHiragana(searchTerm).toLowerCase();
        const name = toHiragana(p.name).toLowerCase();
        const yomi = p.yomigana ? toHiragana(p.yomigana).toLowerCase() : '';

        let score = 0;
        if (name.startsWith(term) || yomi.startsWith(term)) score = 10;
        else if (name.includes(term) || yomi.includes(term)) score = 5;

        return { product: p, score };
    })
        .filter(p => !searchTerm || p.score > 0)
        .sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            return a.product.name.localeCompare(b.product.name, 'ja');
        })
        .map(p => p.product);
    const selectedProduct = products.find(p => p.id === selectedProductId);

    useEffect(() => {
        if (isOpen && companyId && date) {
            fetchProducts();
        }
    }, [isOpen, companyId, date]);

    const fetchProducts = async () => {
        if (!date) return;
        const { data } = await supabase
            .rpc('get_products_with_prices', {
                p_company_id: companyId,
                p_target_date: format(date, 'yyyy-MM-dd')
            });

        if (data) setProducts(data as unknown as Product[]);
    };
    // Fetch recent orders when products are loaded
    useEffect(() => {
        if (isOpen && companyId && products.length > 0) {
            const fetchRecent = async () => {
                const { data } = await supabase.from('orders')
                    .select('product_id')
                    .eq('company_id', companyId)
                    .order('created_at', { ascending: false })
                    .limit(30);

                if (data) {
                    const uniqueIds = Array.from(new Set(data.map(o => o.product_id)));
                    const recents = uniqueIds.slice(0, 5)
                        .map(id => products.find(p => p.id === id))
                        .filter((p): p is Product => p !== undefined);
                    setRecentProducts(recents);
                }
            };
            fetchRecent();
        }
    }, [isOpen, companyId, products.length]); // Depend on length to trigger after fetch

    useEffect(() => {
        if (existingOrder) {
            setSelectedProductId(existingOrder.product_id);
            setQuantity(existingOrder.quantity);
        } else {
            if (!isOpen) {
                setSelectedProductId('');
                setQuantity('');
                setUnitPrice(0);
                setSearchTerm('');
            }
        }
    }, [existingOrder, isOpen]);

    useEffect(() => {
        if (selectedProductId && products.length > 0) {
            const p = products.find(prod => prod.id === selectedProductId);
            if (p) {
                setUnitPrice(p.unit_price);
                // Only set search term if it doesn't match (for initial load)
                if (p.name !== searchTerm) setSearchTerm(p.name);
            }
        } else if (!selectedProductId) {
            // Leave as is
        }
    }, [selectedProductId, products]);



    const handleSave = async () => {
        if (!date || !selectedProductId || !quantity || !companyId) return;

        setLoading(true);
        try {
            const orderData = {
                company_id: companyId,
                product_id: selectedProductId,
                quantity: Number(quantity),
                order_date: format(date, 'yyyy-MM-dd'),
                status: 'pending'
            };

            const { data: { user } } = await supabase.auth.getUser();
            const payload = { ...orderData, created_by: user?.id };

            if (existingOrder) {
                const { error } = await supabase
                    .from('orders')
                    .update(payload)
                    .eq('id', existingOrder.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('orders').insert([payload]);
                if (error) throw error;
            }
            onSave();
            onClose();
        } catch (e: any) {
            alert('保存エラー: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!existingOrder || !confirm('この注文を削除しますか？')) return;
        setLoading(true);
        const { error } = await supabase.from('orders').delete().eq('id', existingOrder.id);
        setLoading(false);
        if (!error) {
            onSave();
            onClose();
        }
    };

    if (!isOpen || !date) return null;

    const totalAmount = (Number(quantity) || 0) * unitPrice;



    // Check if date is in the past (before today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const isPast = targetDate < today;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm transition-opacity"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg transform transition-all scale-100 relative"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h3 className="font-extrabold text-xl text-gray-900">
                        {format(date, 'MM/dd (eee)')} 製造予約
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-slate-900 hover:bg-slate-100 p-2.5 rounded-full transition-colors duration-200"
                    >
                        <X size={24} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    <div>
                        <label className="block text-sm font-extrabold text-gray-900 mb-2">製造商品名</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setIsDropdownOpen(true);
                                    if (selectedProductId) setSelectedProductId('');
                                }}
                                onFocus={() => !isPast && setIsDropdownOpen(true)}
                                disabled={isPast}
                                className={`w-full border border-gray-300 rounded-lg p-3 text-base outline-none transition font-bold text-gray-900 placeholder-gray-400 ${isPast ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-600 focus:border-blue-600'}`}
                                placeholder={isPast ? "過去の注文は編集できません" : "入力または選択..."}
                            />
                            {isDropdownOpen && (
                                <div className="absolute z-10 w-full bg-white border border-gray-200 mt-1 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                                    {/* Recent Suggestions (Only when search term is empty) */}
                                    {searchTerm === '' && recentProducts.length > 0 && (
                                        <div className="bg-blue-50/50 border-b border-blue-100">
                                            <div className="px-3 py-1.5 text-xs font-bold text-blue-600">最近の注文</div>
                                            {recentProducts.map(p => (
                                                <div
                                                    key={`recent-${p.id}`}
                                                    className="px-3 py-2.5 hover:bg-blue-100 cursor-pointer text-gray-900 font-bold border-b border-gray-50 last:border-0 flex justify-between items-center group"
                                                    onClick={() => {
                                                        setSelectedProductId(p.id);
                                                        setSearchTerm(p.name);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                >
                                                    <span>{p.name}</span>
                                                    <span className="text-xs text-blue-500 font-normal bg-white px-1.5 py-0.5 rounded shadow-sm group-hover:bg-blue-50">
                                                        前回の注文商品
                                                    </span>
                                                </div>
                                            ))}
                                            <div className="border-t border-gray-100"></div>
                                        </div>
                                    )}

                                    {/* Filtered List */}
                                    {filteredProducts.length > 0 ? (
                                        filteredProducts.map(p => (
                                            <div
                                                key={p.id}
                                                className="px-3 py-2.5 hover:bg-gray-100 cursor-pointer text-gray-700 font-bold border-b border-gray-50 last:border-0"
                                                onClick={() => {
                                                    setSelectedProductId(p.id);
                                                    setSearchTerm(p.name);
                                                    setIsDropdownOpen(false);
                                                }}
                                            >
                                                {p.name}
                                                <span className="text-xs text-gray-400 ml-2 font-normal">({p.unit || 'pk'})</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-3 text-gray-400 text-sm">該当する商品がありません</div>
                                    )}
                                </div>
                            )}
                        </div>
                        {isDropdownOpen && <div className="fixed inset-0 z-0" onClick={() => setIsDropdownOpen(false)} />}
                    </div>

                    <div className="grid grid-cols-2 gap-6 relative z-0">
                        <div>
                            <label className="block text-sm font-extrabold text-gray-900 mb-2">単価 (円)</label>
                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-right text-gray-900 font-mono font-bold">
                                ¥{unitPrice.toLocaleString()}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-extrabold text-gray-900 mb-2">
                                数量 ({selectedProduct?.unit || 'pk'})
                            </label>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                                disabled={isPast}
                                className={`w-full border border-gray-300 rounded-lg p-3 text-right font-extrabold text-lg outline-none transition text-gray-900 ${isPast ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-600 focus:border-blue-600'}`}
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div className="pt-6 mt-4 border-t border-gray-100 bg-gray-50/50 -m-6 p-6 rounded-b-2xl">
                        <div className="flex justify-between items-end">
                            <div>
                                <span className="block text-xs font-bold text-gray-600 mb-1">合計金額 (税込概算)</span>
                                <span className="text-3xl font-extrabold text-blue-600 tracking-tight">
                                    ¥{totalAmount.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex space-x-3">
                                {existingOrder && !isPast && (
                                    <button
                                        onClick={handleDelete}
                                        className="bg-white text-red-500 border border-red-200 hover:bg-red-50 px-4 py-2.5 rounded-lg font-bold shadow-sm flex items-center transition"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                                {!isPast && (
                                    <button
                                        onClick={handleSave}
                                        disabled={loading || !selectedProductId || !quantity}
                                        className="bg-blue-600 text-white px-8 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-md flex items-center font-bold text-lg transition transform hover:-translate-y-0.5"
                                    >
                                        <Save size={20} className="mr-2" />
                                        保存
                                    </button>
                                )}
                                {isPast && (
                                    <span className="text-gray-500 font-bold bg-gray-100 px-4 py-2 rounded-lg flex items-center text-sm">
                                        閲覧のみ (確定済)
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
