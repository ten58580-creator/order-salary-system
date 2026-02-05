'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import Layout from '@/components/DashboardLayout';
import { Database } from '@/types/supabase';
import { Edit2, Trash2, Plus, Search, Archive, ArchiveRestore, Building2, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import ProductRegistrationModal from '@/components/ProductRegistrationModal';
import ProductEditModal from '@/components/ProductEditModal';

type Product = Database['public']['Tables']['products']['Row'] & { is_archived?: boolean };
type Company = Database['public']['Tables']['companies']['Row'];

export default function ProductAdmin() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    // Initial Fetch: Get Companies
    useEffect(() => {
        const fetchCompanies = async () => {
            const { data } = await supabase.from('companies').select('*').order('name');
            if (data && data.length > 0) {
                setCompanies(data);
                setSelectedCompanyId(data[0].id); // Default to first company
            }
            setLoading(false);
        };
        fetchCompanies();
    }, []);

    // Fetch Products when company changes
    useEffect(() => {
        if (selectedCompanyId) {
            fetchProducts(selectedCompanyId);
        }
    }, [selectedCompanyId]);

    const fetchProducts = async (cId: string) => {
        setLoading(true);
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('company_id', cId)
            // Sort: Active first (is_archived false), then by Name
            .order('is_archived', { ascending: true })
            .order('name', { ascending: true });

        if (data) setProducts(data);
        setLoading(false);
    };

    const handleToggleArchive = async (product: Product) => {
        if (!confirm(`「${product.name}」を${product.is_archived ? '復元' : 'アーカイブ'}しますか？`)) return;

        const { error } = await supabase
            .from('products')
            .update({ is_archived: !product.is_archived })
            .eq('id', product.id);

        if (error) {
            alert('更新エラー: ' + error.message);
        } else {
            // Refresh local state or re-fetch
            fetchProducts(selectedCompanyId);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`【危険】「${name}」を完全に削除しますか？\n※この操作は取り消せません。\n※通常は「アーカイブ」を使用してください。`)) return;

        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) {
            alert('削除エラー: ' + (error.message.includes('foreign key') ? '注文データが存在するため削除できません。アーカイブを使用してください。' : error.message));
        } else {
            setProducts(products.filter(p => p.id !== id));
        }
    };

    const filteredProducts = products.filter(p => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return p.name.toLowerCase().includes(term) || (p.yomigana && p.yomigana.includes(term));
    });

    return (
        <Layout>
            <div className="p-8 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <Link href="/admin" className="text-gray-500 hover:text-blue-600 font-bold flex items-center transition mb-4">
                            <ChevronLeft size={20} className="mr-1" />
                            ダッシュボードに戻る
                        </Link>
                        <h1 className="text-3xl font-extrabold text-slate-950">商品管理</h1>
                        <p className="text-slate-600 font-bold mt-1">
                            会社ごとの商品マスタを管理します。
                        </p>
                    </div>
                </div>

                {/* Company Selector */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
                    <label className="block text-slate-700 font-bold mb-2 flex items-center">
                        <Building2 className="mr-2" size={20} />
                        対象会社を選択
                    </label>
                    <select
                        value={selectedCompanyId}
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                        className="w-full md:w-1/2 p-3 bg-slate-50 border border-slate-300 rounded-lg text-lg font-bold text-slate-950 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        {companies.length === 0 && <option>会社が登録されていません</option>}
                        {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>

                {/* Actions & Search */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="商品を検索..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg font-bold text-slate-900 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>

                    <button
                        onClick={() => setIsRegisterModalOpen(true)}
                        disabled={!selectedCompanyId}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold shadow-md hover:bg-blue-700 flex items-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus size={20} className="mr-2" />
                        新規商品登録
                    </button>
                </div>

                {/* Product List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold text-sm uppercase tracking-wider border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4">商品名 / よみがな</th>
                                <th className="px-6 py-4 text-center">ステータス</th>
                                <th className="px-6 py-4 text-center">単位</th>
                                <th className="px-6 py-4 text-right">単価</th>
                                <th className="px-6 py-4 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-bold">読み込み中...</td>
                                </tr>
                            ) : filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-bold">
                                        商品が見つかりません
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((product) => {
                                    const isArchived = product.is_archived;
                                    return (
                                        <tr
                                            key={product.id}
                                            className={`transition group ${isArchived ? 'bg-gray-50' : 'hover:bg-blue-50'}`}
                                        >
                                            <td className="px-6 py-4">
                                                <div className={`font-black text-lg ${isArchived ? 'text-gray-500' : 'text-slate-950'}`}>
                                                    {product.name}
                                                </div>
                                                <div className="text-xs text-gray-400 font-bold">{product.yomigana || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {isArchived ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-600 text-white">
                                                        🚫 非表示中
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                                                        販売中
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center font-bold text-slate-700">
                                                {product.unit}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-lg text-slate-900">
                                                ¥{product.unit_price.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end space-x-2">
                                                    <button
                                                        onClick={() => setEditingProduct(product)}
                                                        className="text-blue-600 hover:text-blue-800 bg-blue-100 hover:bg-blue-200 p-2 rounded-lg transition"
                                                        title="編集"
                                                    >
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleArchive(product)}
                                                        className={`p-2 rounded-lg transition ${isArchived
                                                            ? 'text-green-600 hover:text-green-800 bg-green-100 hover:bg-green-200'
                                                            : 'text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200'
                                                            }`}
                                                        title={isArchived ? '復元' : 'アーカイブ'}
                                                    >
                                                        {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(product.id, product.name)}
                                                        className="text-red-500 hover:text-red-700 bg-red-100 hover:bg-red-200 p-2 rounded-lg transition"
                                                        title="完全に削除"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ProductRegistrationModal
                isOpen={isRegisterModalOpen}
                onClose={() => setIsRegisterModalOpen(false)}
                companyId={selectedCompanyId}
                onProductRegistered={() => fetchProducts(selectedCompanyId)}
            />
            <ProductEditModal
                isOpen={!!editingProduct}
                onClose={() => setEditingProduct(null)}
                product={editingProduct}
                onSave={() => fetchProducts(selectedCompanyId)}
            />
        </Layout>
    );
}
