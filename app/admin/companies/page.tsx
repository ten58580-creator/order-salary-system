'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/utils/supabaseClient';
import { Building, Plus, Edit, Trash2, Eye, EyeOff, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

type Company = {
    id: string;
    name: string;
    address: string | null;
    contact_info: string | null;
    phone: string | null;
    person_in_charge: string | null;
    pin_code: string | null;
    created_at: string;
};

export default function CompaniesPage() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPins, setShowPins] = useState<{ [key: string]: boolean }>({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        phone: '',
        person_in_charge: '',
        contact_info: '',
        pin_code: ''
    });

    useEffect(() => {
        fetchCompanies();
    }, []);

    const fetchCompanies = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('name');

        if (error) {
            console.error('Error fetching companies:', error);
        } else {
            setCompanies(data || []);
        }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate PIN (4-6 digits)
        if (formData.pin_code && !/^\d{4,6}$/.test(formData.pin_code)) {
            alert('PINコードは4〜6桁の数字で入力してください');
            return;
        }

        if (editingCompany) {
            // Update
            const { error } = await supabase
                .from('companies')
                .update(formData)
                .eq('id', editingCompany.id);

            if (error) {
                console.error('Error updating company:', error);
                alert('更新エラー: ' + error.message);
            } else {
                fetchCompanies();
                closeModal();
            }
        } else {
            // Create
            const { error } = await supabase
                .from('companies')
                .insert([formData]);

            if (error) {
                console.error('Error creating company:', error);
                alert('登録エラー: ' + error.message);
            } else {
                fetchCompanies();
                closeModal();
            }
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`${name}を削除しますか？この操作は取り消せません。`)) return;

        const { error } = await supabase
            .from('companies')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting company:', error);
            alert('削除エラー: ' + error.message);
        } else {
            fetchCompanies();
        }
    };

    const openModal = (company?: Company) => {
        if (company) {
            setEditingCompany(company);
            setFormData({
                name: company.name,
                address: company.address || '',
                phone: company.phone || '',
                person_in_charge: company.person_in_charge || '',
                contact_info: company.contact_info || '',
                pin_code: company.pin_code || ''
            });
        } else {
            setEditingCompany(null);
            setFormData({
                name: '',
                address: '',
                phone: '',
                person_in_charge: '',
                contact_info: '',
                pin_code: ''
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingCompany(null);
    };

    const togglePinVisibility = (companyId: string) => {
        setShowPins(prev => ({
            ...prev,
            [companyId]: !prev[companyId]
        }));
    };

    if (loading) {
        return (
            <div className="p-8 text-center text-gray-500 font-bold">読み込み中...</div>
        );
    }

    return (
        <DashboardLayout>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <div className="mb-6">
                    <Link href="/admin" className="text-slate-500 hover:text-blue-600 font-bold flex items-center transition mb-3 w-fit group">
                        <ChevronLeft size={20} className="mr-1 group-hover:-translate-x-1 transition" />
                        ダッシュボードに戻る
                    </Link>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center">
                            <Building className="text-blue-600 mr-3" size={32} />
                            <h1 className="text-3xl font-black text-slate-950">会社管理</h1>
                        </div>
                        <button
                            onClick={() => openModal()}
                            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 transition flex items-center"
                        >
                            <Plus size={18} className="mr-1" />
                            新規登録
                        </button>
                    </div>
                </div>

                {/* Company List Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">会社名</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">担当者</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">電話番号</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">PINコード</th>
                                <th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {companies.map((company) => (
                                <tr key={company.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-950">{company.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{company.person_in_charge || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{company.phone || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className="flex items-center space-x-2">
                                            <span className="font-mono font-bold text-slate-950">
                                                {company.pin_code ? (showPins[company.id] ? company.pin_code : '****') : '未設定'}
                                            </span>
                                            {company.pin_code && (
                                                <button
                                                    onClick={() => togglePinVisibility(company.id)}
                                                    className="text-gray-400 hover:text-gray-600"
                                                >
                                                    {showPins[company.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button
                                            onClick={() => openModal(company)}
                                            className="text-blue-600 hover:text-blue-800"
                                        >
                                            <Edit size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(company.id, company.name)}
                                            className="text-red-600 hover:text-red-800"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Modal */}
                {isModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 p-6">
                            <h2 className="text-2xl font-black text-slate-950 mb-6">
                                {editingCompany ? '会社情報編集' : '新規会社登録'}
                            </h2>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">会社名 *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-950 font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">担当者名</label>
                                    <input
                                        type="text"
                                        value={formData.person_in_charge}
                                        onChange={(e) => setFormData({ ...formData, person_in_charge: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-950"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">電話番号</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-950"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">住所</label>
                                    <input
                                        type="text"
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-950"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">PINコード（4〜6桁の数字） *</label>
                                    <input
                                        type="text"
                                        required
                                        pattern="\d{4,6}"
                                        value={formData.pin_code}
                                        onChange={(e) => {
                                            // Convert full-width to half-width and remove non-digits
                                            const halfWidth = e.target.value
                                                .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                                                .replace(/\D/g, '');
                                            setFormData({ ...formData, pin_code: halfWidth });
                                        }}
                                        placeholder="例: 1234"
                                        maxLength={6}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-950 font-mono font-bold"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">依頼側ログイン用のPINコードです</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">メモ・連絡先</label>
                                    <textarea
                                        value={formData.contact_info}
                                        onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-950"
                                    />
                                </div>
                                <div className="flex justify-end space-x-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-bold hover:bg-gray-50"
                                    >
                                        キャンセル
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                                    >
                                        {editingCompany ? '更新' : '登録'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
