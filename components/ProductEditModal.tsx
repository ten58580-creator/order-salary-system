'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import { Database } from '@/types/supabase';
import { format } from 'date-fns';

type Product = Database['public']['Tables']['products']['Row'] & {
    category?: string | null;
    description?: string | null;
    wholesale_price?: number | null;
    cost_price?: number | null;
    container_cost?: number | null;
    wrap_cost?: number | null;
    seal_cost?: number | null;
    box_cost?: number | null;
    other_material_cost?: number | null;
};
type ProductPrice = {
    id: string;
    product_id: string;
    unit_price: number;
    start_date: string;
    created_at?: string;
};

interface ProductEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    onSave: () => void;
}

export default function ProductEditModal({ isOpen, onClose, product, onSave }: ProductEditModalProps) {
    const [name, setName] = useState('');
    const [yomigana, setYomigana] = useState('');
    const [unit, setUnit] = useState('pk');
    const [category, setCategory] = useState(''); // Added
    const [description, setDescription] = useState(''); // Added
    const [prices, setPrices] = useState<ProductPrice[]>([]);
    const [loading, setLoading] = useState(false);

    // Cost-related fields
    const [wholesalePrice, setWholesalePrice] = useState<string>('0');
    const [costPrice, setCostPrice] = useState<string>('0');
    const [containerCost, setContainerCost] = useState<string>('0');
    const [wrapCost, setWrapCost] = useState<string>('0');
    const [sealCost, setSealCost] = useState<string>('0');
    const [boxCost, setBoxCost] = useState<string>('0');
    const [otherMaterialCost, setOtherMaterialCost] = useState<string>('0');

    // New Price Form
    const [newPrice, setNewPrice] = useState('');
    const [newStartDate, setNewStartDate] = useState('');

    const units = ['pk', 'cs', 'kg', 'g', 'L', '袋', '箱', '個', '本', 'セット', '束'];

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        if (newVal.length > name.length && newVal.startsWith(name)) {
            const added = newVal.slice(name.length);
            if (/^[\u3040-\u309f]+$/.test(added)) {
                setYomigana(prev => prev + added);
            }
        }
        setName(newVal);
    };

    useEffect(() => {
        if (isOpen && product) {
            setName(product.name);
            setYomigana(product.yomigana || '');
            setUnit(product.unit || 'pk');
            setCategory(product.category || ''); // Added
            setDescription(product.description || ''); // Added
            fetchPrices(product.id);
            // Default new start date to Today
            setNewStartDate(format(new Date(), 'yyyy-MM-dd'));

            // Load cost fields
            setWholesalePrice(String(product.wholesale_price ?? 0));
            setCostPrice(String(product.cost_price ?? 0));
            setContainerCost(String(product.container_cost ?? 0));
            setWrapCost(String(product.wrap_cost ?? 0));
            setSealCost(String(product.seal_cost ?? 0));
            setBoxCost(String(product.box_cost ?? 0));
            setOtherMaterialCost(String(product.other_material_cost ?? 0));
        }
    }, [isOpen, product]);

    const fetchPrices = async (productId: string) => {
        const { data } = await supabase
            .from('product_prices')
            .select('*')
            .eq('product_id', productId)
            .order('start_date', { ascending: false });
        if (data) setPrices(data);
    };

    const handleSaveBasic = async () => {
        if (!product) return;
        setLoading(true);
        const { error } = await supabase
            .from('products')
            .update({
                name,
                yomigana,
                unit,
                category: category || null, // Added
                description: description || null, // Added
                wholesale_price: Number(wholesalePrice),
                cost_price: Number(costPrice),
                container_cost: Number(containerCost),
                wrap_cost: Number(wrapCost),
                seal_cost: Number(sealCost),
                box_cost: Number(boxCost),
                other_material_cost: Number(otherMaterialCost)
            })
            .eq('id', product.id);

        setLoading(false);
        if (error) {
            alert('保存エラー: ' + error.message);
        } else {
            onSave(); // Notify parent to refresh list maybe? or just close
            onClose();
        }
    };

    const handleAddPrice = async () => {
        if (!product || !newPrice || !newStartDate) return;
        if (!confirm(`単価 ¥${newPrice} を ${newStartDate} から適用しますか？`)) return;

        setLoading(true);
        const { error } = await supabase.from('product_prices').insert([{
            product_id: product.id,
            unit_price: Number(newPrice),
            start_date: newStartDate
        }]);

        if (error) {
            alert('価格追加エラー: ' + error.message);
        } else {
            setNewPrice('');
            fetchPrices(product.id);
            onSave(); // Refetch product list to update "Current Price" in table if needed
        }
        setLoading(false);
    };

    const handleDeletePrice = async (priceId: string) => {
        if (prices.length <= 1) {
            alert('価格履歴は最低1つ必要です。');
            return;
        }
        if (!confirm('この価格設定を削除しますか？')) return;

        setLoading(true);
        const { error } = await supabase.from('product_prices').delete().eq('id', priceId);
        if (error) {
            alert('削除エラー: ' + error.message);
        } else {
            fetchPrices(product!.id);
            onSave();
        }
        setLoading(false);
    };

    if (!isOpen || !product) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 transition-opacity" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h3 className="font-extrabold text-xl text-gray-900">商品編集</h3>
                    <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {/* Basic Info */}
                    <div className="space-y-6">
                        <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                            <h4 className="font-bold text-slate-800 border-l-4 border-blue-500 pl-3 text-lg">基本情報</h4>

                            {/* Current Price Display */}
                            <div className="bg-blue-50 px-5 py-3 rounded-xl border border-blue-200 text-right shadow-sm">
                                <span className="block text-xs font-bold text-blue-600 mb-0.5">現在の適用単価</span>
                                <span className="font-mono text-3xl font-extrabold text-blue-800 tracking-tight">
                                    ¥{(prices.find(p => new Date(p.start_date) <= new Date())?.unit_price ?? product.unit_price).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-2">
                                <label className="block text-sm font-bold text-slate-700 mb-1">商品名</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={handleNameChange}
                                    className="w-full border-2 border-slate-400 rounded-lg p-3 font-bold text-slate-900 text-lg placeholder-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">よみがな</label>
                                <input
                                    type="text"
                                    value={yomigana}
                                    onChange={(e) => setYomigana(e.target.value)}
                                    className="w-full border-2 border-slate-400 rounded-lg p-3 font-medium text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">単位</label>
                                <select
                                    value={unit}
                                    onChange={(e) => setUnit(e.target.value)}
                                    className="w-full border-2 border-slate-400 rounded-lg p-3 font-bold text-slate-900 h-[52px] focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                                >
                                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">カテゴリー</label>
                                <input
                                    type="text"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full border-2 border-slate-400 rounded-lg p-3 font-medium text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                                    placeholder="例: 和菓子"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-bold text-slate-700 mb-1">備考</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full border-2 border-slate-400 rounded-lg p-3 font-medium text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                                    placeholder="規格や詳細など"
                                    rows={2}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Cost Information */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-slate-800 border-l-4 border-orange-500 pl-3 text-lg">原価・資材費情報</h4>
                        <p className="text-xs text-slate-500 font-medium">※ 利益計算に使用されます。1個あたりのコストを入力してください。</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">卸値（売価）</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">¥</span>
                                    <input
                                        type="number"
                                        value={wholesalePrice}
                                        onChange={(e) => setWholesalePrice(e.target.value)}
                                        className="w-full border-2 border-slate-400 rounded-lg p-3 pl-8 font-mono text-slate-900 text-right focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">仕入原価</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">¥</span>
                                    <input
                                        type="number"
                                        value={costPrice}
                                        onChange={(e) => setCostPrice(e.target.value)}
                                        className="w-full border-2 border-slate-400 rounded-lg p-3 pl-8 font-mono text-slate-900 text-right focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">容器代</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">¥</span>
                                    <input
                                        type="number"
                                        value={containerCost}
                                        onChange={(e) => setContainerCost(e.target.value)}
                                        className="w-full border-2 border-slate-400 rounded-lg p-3 pl-8 font-mono text-slate-900 text-right focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">ラップ代</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">¥</span>
                                    <input
                                        type="number"
                                        value={wrapCost}
                                        onChange={(e) => setWrapCost(e.target.value)}
                                        className="w-full border-2 border-slate-400 rounded-lg p-3 pl-8 font-mono text-slate-900 text-right focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">シール代</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">¥</span>
                                    <input
                                        type="number"
                                        value={sealCost}
                                        onChange={(e) => setSealCost(e.target.value)}
                                        className="w-full border-2 border-slate-400 rounded-lg p-3 pl-8 font-mono text-slate-900 text-right focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">箱代</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">¥</span>
                                    <input
                                        type="number"
                                        value={boxCost}
                                        onChange={(e) => setBoxCost(e.target.value)}
                                        className="w-full border-2 border-slate-400 rounded-lg p-3 pl-8 font-mono text-slate-900 text-right focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-slate-700 mb-1">その他資材費</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">¥</span>
                                    <input
                                        type="number"
                                        value={otherMaterialCost}
                                        onChange={(e) => setOtherMaterialCost(e.target.value)}
                                        className="w-full border-2 border-slate-400 rounded-lg p-3 pl-8 font-mono text-slate-900 text-right focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Price Schedule */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-slate-800 border-l-4 border-green-500 pl-3 text-lg">単価スケジュール</h4>
                        <p className="text-xs text-slate-500 font-medium">※ 未来の日付を設定すると、その日から自動で新価格が適用されます。</p>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-300 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr className="text-slate-600 text-left border-b border-slate-200">
                                        <th className="py-3 pl-4 font-bold">適用開始日</th>
                                        <th className="py-3 text-right pr-6 font-bold">単価</th>
                                        <th className="py-3 text-center font-bold">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {prices.map((p, idx) => {
                                        const isCurrent = new Date(p.start_date) <= new Date() && (idx === 0 || new Date(prices[idx - 1].start_date) > new Date());
                                        // Actually simplest logic: first one <= today, if sorted desc.
                                        // But sorting is in fetchPrices: .order('start_date', { ascending: false });
                                        // So the first one we meet that is <= today is the current one.
                                        // But if we iterate, wait. The FIRST one in the array is the LATEST date.
                                        // If array is [2026-02-05, 2026-02-01]. Today 2026-02-04.
                                        // 0: Feb 5 (Future). 1: Feb 1 (Current).
                                        // So logic: Find first p where p.start_date <= today.

                                        const isActive = new Date(p.start_date) <= new Date();
                                        // The prices list might have future prices.
                                        // If filteredProducts handles effective price, that's fine.
                                        // Here we show schedule.

                                        return (
                                            <tr key={p.id} className={isActive ? "text-slate-900 border-l-4 border-l-transparent" : "text-slate-500 bg-gray-50/50"}>
                                                <td className="py-4 pl-4 text-base font-bold">
                                                    {format(new Date(p.start_date), 'yyyy/MM/dd')}
                                                    <span className="text-slate-300 mx-2">~</span>
                                                </td>
                                                <td className="py-4 text-right pr-6 font-mono text-lg font-extrabold text-slate-800">¥{p.unit_price.toLocaleString()}</td>
                                                <td className="py-4 text-center">
                                                    <button
                                                        onClick={() => handleDeletePrice(p.id)}
                                                        className="text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>

                            <div className="mt-4 flex gap-3 items-end border-t border-gray-200 pt-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">新単価</label>
                                    <input
                                        type="number"
                                        value={newPrice}
                                        onChange={e => setNewPrice(e.target.value)}
                                        className="border-2 border-slate-400 rounded p-2 text-sm w-24 text-right font-mono text-slate-900 font-bold"
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">開始日</label>
                                    <input
                                        type="date"
                                        value={newStartDate}
                                        onChange={e => setNewStartDate(e.target.value)}
                                        className="border-2 border-slate-400 rounded p-2 text-sm text-slate-900 font-bold"
                                    />
                                </div>
                                <button
                                    onClick={handleAddPrice}
                                    disabled={!newPrice || !newStartDate || loading}
                                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center mb-[1px]"
                                >
                                    <Plus size={16} className="mr-1" /> 追加
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-100 rounded-lg">キャンセル</button>
                    <button
                        onClick={handleSaveBasic}
                        disabled={loading}
                        className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center shadow-md"
                    >
                        <Save size={18} className="mr-2" />
                        基本情報を保存
                    </button>
                </div>
            </div>
        </div>
    );
}
