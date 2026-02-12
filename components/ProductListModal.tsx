import { X, Edit2, Search, Printer, Archive, ArchiveRestore, Save } from 'lucide-react';
import { Database } from '@/types/supabase';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { format } from 'date-fns';
import PrintHeader from './PrintHeader';

type Product = Database['public']['Tables']['products']['Row'] & {
    is_archived?: boolean;
    category?: string | null;
    description?: string | null
};

interface ProductListModalProps {
    isOpen: boolean;
    onClose: () => void;
    products: Product[];
    companyName?: string;
    onSelectProduct: (product: Product) => void;
    onProductUpdated?: () => void;
}

export default function ProductListModal({ isOpen, onClose, products, companyName, onSelectProduct, onProductUpdated }: ProductListModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [loading, setLoading] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; product: Product | null }>({ isOpen: false, product: null });

    useEffect(() => {
        if (isOpen) {
            setShowArchived(false); // Reset to "Active Only" on open
            setSearchTerm(''); // Optional clearly
        }
    }, [isOpen]);

    // Handle Print
    const handlePrint = () => {
        window.print();
    };



    if (!isOpen) return null;

    const filteredProducts = products.filter(p => {
        // ... (existing filter logic)
        // Filter by Archive Status
        if (!showArchived && p.is_archived) return false;

        // Strict filter
        if (showArchived) {
            if (!p.is_archived) return false;
        } else {
            if (p.is_archived) return false;
        }

        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return p.name.toLowerCase().includes(term) || (p.yomigana && p.yomigana.includes(term));
    });

    const handleToggleArchiveClick = (product: Product) => {
        setConfirmConfig({ isOpen: true, product });
    };

    const executeArchiveToggle = async () => {
        const product = confirmConfig.product;
        if (!product) return;

        setLoading(true);
        const { error } = await supabase.from('products').update({ is_archived: !product.is_archived }).eq('id', product.id);
        setLoading(false);
        setConfirmConfig({ isOpen: false, product: null });

        if (error) {
            alert('工ラー: ' + error.message);
        } else {
            if (onProductUpdated) onProductUpdated();
        }
    };


    return (
        <>
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 transition-opacity print:hidden" // Added print:hidden
                onClick={onClose}
            >
                <div
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                    onClick={e => e.stopPropagation()}
                >

                    {/* Header */}
                    <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white">
                        <div>
                            <h3 className="font-extrabold text-2xl text-gray-900">
                                {showArchived ? 'アーカイブ済み商品' : '登録商品一覧'}
                            </h3>
                            <p className="text-sm text-gray-500 font-bold mt-1">
                                {filteredProducts.length} 件の商品が見つかりました
                            </p>
                        </div>
                        <div className="flex items-center space-x-4">
                            {!showArchived && (
                                <button
                                    type="button"
                                    onClick={handlePrint}
                                    className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition flex items-center shadow-sm"
                                >
                                    <Printer size={16} className="mr-2" />
                                    印刷 / PDF保存
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowArchived(!showArchived)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold border transition flex items-center ${showArchived ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                            >
                                {showArchived ? <ArchiveRestore size={16} className="mr-2" /> : <Archive size={16} className="mr-2" />}
                                {showArchived ? '通常商品に戻る' : 'アーカイブを表示'}
                            </button>
                            <button type="button" onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">
                                <X size={24} className="text-gray-600" />
                            </button>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="p-4 bg-gray-50 border-b border-slate-300 flex items-center px-6">
                        <Search className="text-gray-500 mr-3" size={20} />
                        <input
                            type="text"
                            placeholder="商品名またはよみがなで検索..."
                            className="bg-transparent border-none outline-none font-bold text-slate-900 w-full placeholder-slate-500 text-lg"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {/* Table Area */}
                    <div className="flex-1 overflow-y-auto">
                        {filteredProducts.length === 0 ? (
                            <div className="p-12 text-center text-gray-400 font-bold">
                                {showArchived ? 'アーカイブされた商品はありません。' : '商品が見つかりません。'}
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white sticky top-0 z-10 border-b border-gray-200 shadow-sm">
                                    <tr className="text-gray-500 text-xs uppercase tracking-wider">
                                        <th className="px-6 py-4 font-extrabold bg-gray-50">商品名 / よみがな</th>
                                        <th className="px-6 py-4 font-extrabold bg-gray-50 text-center">単位</th>
                                        <th className="px-6 py-4 font-extrabold bg-gray-50 text-right">現在単価</th>
                                        <th className="px-6 py-4 font-extrabold bg-gray-50 text-center">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {filteredProducts.map((product) => (
                                        <tr
                                            key={product.id}
                                            onClick={() => onSelectProduct(product)}
                                            className="hover:bg-blue-50 transition-colors cursor-pointer group"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900 text-lg">{product.name}</div>
                                                <div className="text-xs text-gray-400 font-bold">{product.yomigana || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded border border-gray-200 font-bold">
                                                    {product.unit}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="font-mono font-bold text-gray-700 text-lg">
                                                    ¥{product.unit_price.toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center items-center space-x-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onSelectProduct(product);
                                                        }}
                                                        className="bg-blue-100 text-blue-600 p-2 rounded-lg hover:bg-blue-200 transition"
                                                        title="編集"
                                                    >
                                                        <Edit2 size={18} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleToggleArchiveClick(product);
                                                        }}
                                                        className={`p-2 rounded-lg transition ${product.is_archived ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-slate-950 hover:bg-gray-200'}`}
                                                        title={product.is_archived ? '復元' : 'アーカイブ'}
                                                    >
                                                        {product.is_archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Custom Confirmation Modal */}
                {
                    confirmConfig.isOpen && confirmConfig.product && (
                        <div
                            className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                            onClick={() => setConfirmConfig({ isOpen: false, product: null })}
                        >
                            <div
                                className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full transform transition-all scale-100"
                                onClick={e => e.stopPropagation()}
                            >
                                <h3 className="font-bold text-lg mb-2 text-gray-900">
                                    {confirmConfig.product!.is_archived ? '商品を復元しますか？' : '商品をアーカイブしますか？'}
                                </h3>
                                <p className="text-gray-600 text-sm mb-6">
                                    対象: {confirmConfig.product!.name}
                                    {!confirmConfig.product!.is_archived && (
                                        <span className="block mt-1 text-red-500 font-bold">
                                            ※アーカイブすると注文入力画面に表示されなくなります。
                                        </span>
                                    )}
                                </p>
                                <div className="flex justify-end space-x-3">
                                    <button
                                        type="button"
                                        onClick={() => setConfirmConfig({ isOpen: false, product: null })}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-bold hover:bg-gray-50"
                                    >
                                        キャンセル
                                    </button>
                                    <button
                                        type="button"
                                        onClick={executeArchiveToggle}
                                        className={`px-4 py-2 rounded-lg text-white font-bold shadow-md ${confirmConfig.product!.is_archived ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                                    >
                                        {confirmConfig.product!.is_archived ? '復元する' : 'アーカイブする'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div >

            {/* PRINT VIEW (Visible only on print) */}
            <div id="product-list-print-content" className="hidden print:block">
                <style type="text/css" media="print">
                    {`
                        @page { size: auto; margin: 15mm; }
                        body * { visibility: hidden; }
                        #product-list-print-content, #product-list-print-content * { visibility: visible; }
                        #product-list-print-content {
                            position: absolute;
                            top: 0;
                            left: 0;
                            width: 100%;
                            background: white;
                            z-index: 9999;
                            padding: 0;
                            margin: 0;
                        }
                        
                        /* Table Formatting */
                        th, td {
                            white-space: nowrap;
                        }
                        tr {
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }
                    `}
                </style>
                <div className="print-scroll-container">
                    <PrintHeader
                        title={`登録商品一覧${companyName ? `（${companyName} 御中）` : ''}`}
                        companyName=""
                    />

                    <div className="mt-4">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr style={{ borderBottom: '2px solid black' }}>
                                    <th className="py-2 text-sm font-black w-2/5">商品名 / よみがな</th>
                                    <th className="py-2 text-sm font-black w-1/5">カテゴリー</th>
                                    <th className="py-2 text-sm font-black w-1/6 text-right">単価 (円)</th>
                                    <th className="py-2 text-sm font-black w-1/12 text-center">単位</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.map((p) => (
                                    <tr key={p.id} className="break-inside-avoid" style={{ borderBottom: '1px solid #e5e7eb' }}>
                                        <td className="py-3 pr-2 align-top">
                                            <div className="font-bold text-lg">{p.name}</div>
                                            {p.yomigana && <div className="text-sm text-gray-600 mt-1">{p.yomigana}</div>}
                                            {p.description && <div className="text-xs text-gray-500 mt-1">※{p.description}</div>}
                                        </td>
                                        <td className="py-3 pr-2 align-top text-sm font-semibold">
                                            {p.category || '-'}
                                        </td>
                                        <td className="py-3 pr-2 align-top text-right font-mono font-bold text-lg">
                                            {p.unit_price.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-2 align-top text-center text-sm font-semibold">
                                            {p.unit}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    );
}
