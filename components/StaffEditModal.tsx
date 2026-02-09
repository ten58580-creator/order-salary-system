'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Database } from '@/types/supabase';
import { X, Save, PlusCircle, MinusCircle } from 'lucide-react';

type Staff = Database['public']['Tables']['staff']['Row'];

interface StaffEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    staff?: Staff | null;
    mode?: 'edit' | 'create';
    companyId?: string | null; // Required for create
    onSave: () => void;
}

export default function StaffEditModal({ isOpen, onClose, staff, mode = 'edit', companyId, onSave }: StaffEditModalProps) {
    // Standard Fields
    const [formData, setFormData] = useState<{
        name: string;
        hourly_wage: number;
        dependents: number;
        tax_category: string;
        pin: string;
        note: string;
        // Custom Allowances
        allowance1_name: string;
        allowance1_value: number;
        allowance2_name: string;
        allowance2_value: number;
        allowance3_name: string;
        allowance3_value: number;
        // Custom Deductions
        deduction1_name: string;
        deduction1_value: number;
        deduction2_name: string;
        deduction2_value: number;
    }>({
        name: '',
        hourly_wage: 1100, // Default for new staff
        dependents: 0,
        tax_category: '甲',
        pin: '0000',
        note: '',
        allowance1_name: '', allowance1_value: 0,
        allowance2_name: '', allowance2_value: 0,
        allowance3_name: '', allowance3_value: 0,
        deduction1_name: '', deduction1_value: 0,
        deduction2_name: '', deduction2_value: 0,
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (mode === 'edit' && staff) {
                setFormData({
                    name: staff.name || '',
                    hourly_wage: staff.hourly_wage || 0,
                    dependents: staff.dependents || 0,
                    tax_category: staff.tax_category || '甲',
                    pin: staff.pin || '0000',
                    note: staff.note || '',
                    // If DB has nulls, fallback to empty/0
                    allowance1_name: staff.allowance1_name || '', allowance1_value: staff.allowance1_value || 0,
                    allowance2_name: staff.allowance2_name || '', allowance2_value: staff.allowance2_value || 0,
                    allowance3_name: staff.allowance3_name || '', allowance3_value: staff.allowance3_value || 0,
                    deduction1_name: staff.deduction1_name || '', deduction1_value: staff.deduction1_value || 0,
                    deduction2_name: staff.deduction2_name || '', deduction2_value: staff.deduction2_value || 0,
                });
            } else if (mode === 'create') {
                // Reset for create
                setFormData({
                    name: '',
                    hourly_wage: 1100,
                    dependents: 0,
                    tax_category: '甲',
                    pin: '0000',
                    note: '',
                    allowance1_name: '', allowance1_value: 0,
                    allowance2_name: '', allowance2_value: 0,
                    allowance3_name: '', allowance3_value: 0,
                    deduction1_name: '', deduction1_value: 0,
                    deduction2_name: '', deduction2_value: 0,
                });
            }
        }
    }, [isOpen, staff, mode]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (mode === 'create') {
                let resolvedCompanyId = companyId;

                // 1. If prop is missing, try to fetch existing company
                if (!resolvedCompanyId) {
                    console.log('Company ID missing in props, fetching from DB...');
                    const { data: existingCompany } = await supabase
                        .from('companies')
                        .select('id')
                        .limit(1)
                        .maybeSingle();

                    if (existingCompany) {
                        resolvedCompanyId = existingCompany.id;
                        console.log('Found existing company:', resolvedCompanyId);
                    }
                }

                // 2. If still missing, FORCE create "自社"
                if (!resolvedCompanyId) {
                    console.log('No company found, creating new default company...');
                    const { data: newCompany, error: createError } = await supabase
                        .from('companies')
                        .insert({ name: '自社' })
                        .select('id')
                        .single();

                    if (createError || !newCompany) {
                        console.error('CRITICAL: Failed to create default company:', createError);
                        throw new Error(`会社情報の作成に失敗しました: ${createError?.message || 'Unknown error'}`);
                    }
                    resolvedCompanyId = newCompany.id;
                    console.log('Created new company:', resolvedCompanyId);
                }

                // 3. Final Check
                if (!resolvedCompanyId) {
                    throw new Error('Company ID could not be resolved or created.');
                }

                // 4. Insert Staff with resolved ID
                // 4. Insert Staff with resolved ID
                const { error } = await supabase
                    .from('staff')
                    .insert({
                        company_id: resolvedCompanyId,
                        name: formData.name,
                        hourly_wage: formData.hourly_wage,
                        dependents: formData.dependents,
                        tax_category: formData.tax_category,
                        pin: formData.pin,
                        note: formData.note,
                        role: 'staff',
                        // Custom Items (Using _amount as per DB schema)
                        allowance1_name: formData.allowance1_name || null, allowance1_amount: formData.allowance1_value || 0,
                        allowance2_name: formData.allowance2_name || null, allowance2_amount: formData.allowance2_value || 0,
                        allowance3_name: formData.allowance3_name || null, allowance3_amount: formData.allowance3_value || 0,
                        deduction1_name: formData.deduction1_name || null, deduction1_amount: formData.deduction1_value || 0,
                        deduction2_name: formData.deduction2_name || null, deduction2_amount: formData.deduction2_value || 0,
                    });
                if (error) throw error;
            } else {
                if (!staff) return;
                const { error } = await supabase
                    .from('staff')
                    .update({
                        name: formData.name,
                        hourly_wage: formData.hourly_wage,
                        dependents: formData.dependents,
                        tax_category: formData.tax_category,
                        pin: formData.pin,
                        note: formData.note,
                        // Save Custom Items (Using _amount as per DB schema)
                        allowance1_name: formData.allowance1_name || null, allowance1_amount: formData.allowance1_value || 0,
                        allowance2_name: formData.allowance2_name || null, allowance2_amount: formData.allowance2_value || 0,
                        allowance3_name: formData.allowance3_name || null, allowance3_amount: formData.allowance3_value || 0,
                        deduction1_name: formData.deduction1_name || null, deduction1_amount: formData.deduction1_value || 0,
                        deduction2_name: formData.deduction2_name || null, deduction2_amount: formData.deduction2_value || 0,
                    })
                    .eq('id', staff.id);
                if (error) throw error;
            }

            onSave();
            onClose();
        } catch (error: any) {
            console.error('Error updating/creating staff:', error.message || error);
            alert(`保存に失敗しました: ${error.message || '不明なエラー'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 transition-opacity" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-200">
                    <h3 className="text-xl font-bold text-slate-950">
                        {mode === 'create' ? '従業員を新規登録' : '従業員マスタ編集'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-900 mb-2">氏名</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-900 mb-2">基本時給 (円)</label>
                            <input
                                type="number"
                                required
                                min="0"
                                value={formData.hourly_wage}
                                onChange={(e) => setFormData({ ...formData, hourly_wage: Number(e.target.value) })}
                                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 font-mono text-gray-900"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-900 mb-2">扶養親族数</label>
                            <input
                                type="number"
                                required
                                min="0"
                                value={formData.dependents}
                                onChange={(e) => setFormData({ ...formData, dependents: Number(e.target.value) })}
                                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 font-mono text-gray-900"
                            />
                        </div>
                        {/* PIN */}
                        <div>
                            <label className="block text-sm font-bold text-blue-900 mb-2">PINコード (4桁)</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    maxLength={4}
                                    value={formData.pin}
                                    onChange={(e) => {
                                        const val = e.target.value
                                            .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // Full-width to half-width
                                            .replace(/[^0-9]/g, ''); // Remove non-numeric
                                        setFormData({ ...formData, pin: val });
                                    }}
                                    className="w-24 border border-blue-300 rounded-lg px-3 py-3 focus:ring-2 focus:ring-blue-500 font-mono text-center tracking-widest font-bold text-blue-900"
                                    placeholder="0000"
                                    onFocus={() => {
                                        if (formData.pin === '0000') {
                                            setFormData({ ...formData, pin: '' });
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, pin: '0000' })}
                                    className="px-3 py-2 bg-gray-100 rounded text-xs hover:bg-gray-200"
                                >
                                    リセット
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Tax Category */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <label className="block text-sm font-bold text-gray-900 mb-2">源泉徴収区分</label>
                        <div className="flex space-x-6">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="radio"
                                    name="tax_category"
                                    value="甲"
                                    checked={formData.tax_category === '甲'}
                                    onChange={(e) => setFormData({ ...formData, tax_category: e.target.value })}
                                    className="w-5 h-5 text-blue-600"
                                />
                                <span className="ml-2 text-gray-900 font-bold">甲欄 (主)</span>
                            </label>
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="radio"
                                    name="tax_category"
                                    value="乙"
                                    checked={formData.tax_category === '乙'}
                                    onChange={(e) => setFormData({ ...formData, tax_category: e.target.value })}
                                    className="w-5 h-5 text-blue-600"
                                />
                                <span className="ml-2 text-gray-900 font-bold">乙欄 (他)</span>
                            </label>
                        </div>
                    </div>

                    {/* Custom Allowances Section */}
                    <div className="border-t border-gray-200 pt-6">
                        <div className="flex items-center gap-2 mb-4 text-green-700">
                            <PlusCircle size={20} />
                            <h4 className="font-bold text-lg">固定手当 (月額)</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4 bg-green-50 p-4 rounded-lg">
                            <div className="grid grid-cols-12 gap-2 text-sm text-gray-600 font-bold mb-1">
                                <div className="col-span-1 text-center">No.</div>
                                <div className="col-span-7">手当名 (例: 資格手当)</div>
                                <div className="col-span-4">金額 (円)</div>
                            </div>
                            {/* Item 1 */}
                            <div className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-1 text-center font-bold text-gray-500">1</div>
                                <div className="col-span-7">
                                    <input type="text" placeholder="未設定"
                                        value={formData.allowance1_name}
                                        onChange={(e) => setFormData({ ...formData, allowance1_name: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500"
                                    />
                                </div>
                                <div className="col-span-4">
                                    <input type="number" min="0" placeholder="0"
                                        value={formData.allowance1_value}
                                        onChange={(e) => setFormData({ ...formData, allowance1_value: Number(e.target.value) })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500 font-mono text-right"
                                    />
                                </div>
                            </div>
                            {/* Item 2 */}
                            <div className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-1 text-center font-bold text-gray-500">2</div>
                                <div className="col-span-7">
                                    <input type="text" placeholder="未設定"
                                        value={formData.allowance2_name}
                                        onChange={(e) => setFormData({ ...formData, allowance2_name: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500"
                                    />
                                </div>
                                <div className="col-span-4">
                                    <input type="number" min="0" placeholder="0"
                                        value={formData.allowance2_value}
                                        onChange={(e) => setFormData({ ...formData, allowance2_value: Number(e.target.value) })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500 font-mono text-right"
                                    />
                                </div>
                            </div>
                            {/* Item 3 */}
                            <div className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-1 text-center font-bold text-gray-500">3</div>
                                <div className="col-span-7">
                                    <input type="text" placeholder="未設定"
                                        value={formData.allowance3_name}
                                        onChange={(e) => setFormData({ ...formData, allowance3_name: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500"
                                    />
                                </div>
                                <div className="col-span-4">
                                    <input type="number" min="0" placeholder="0"
                                        value={formData.allowance3_value}
                                        onChange={(e) => setFormData({ ...formData, allowance3_value: Number(e.target.value) })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-green-500 font-mono text-right"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Custom Deductions Section */}
                    <div className="border-t border-gray-200 pt-6">
                        <div className="flex items-center gap-2 mb-4 text-red-700">
                            <MinusCircle size={20} />
                            <h4 className="font-bold text-lg">固定控除 (月額・寮費など)</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4 bg-red-50 p-4 rounded-lg">
                            <div className="grid grid-cols-12 gap-2 text-sm text-gray-600 font-bold mb-1">
                                <div className="col-span-1 text-center">No.</div>
                                <div className="col-span-7">控除項目名</div>
                                <div className="col-span-4">金額 (円)</div>
                            </div>
                            {/* Item 1 */}
                            <div className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-1 text-center font-bold text-gray-500">1</div>
                                <div className="col-span-7">
                                    <input type="text" placeholder="未設定"
                                        value={formData.deduction1_name}
                                        onChange={(e) => setFormData({ ...formData, deduction1_name: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-red-500"
                                    />
                                </div>
                                <div className="col-span-4">
                                    <input type="number" min="0" placeholder="0"
                                        value={formData.deduction1_value}
                                        onChange={(e) => setFormData({ ...formData, deduction1_value: Number(e.target.value) })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-red-500 font-mono text-right"
                                    />
                                </div>
                            </div>
                            {/* Item 2 */}
                            <div className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-1 text-center font-bold text-gray-500">2</div>
                                <div className="col-span-7">
                                    <input type="text" placeholder="未設定"
                                        value={formData.deduction2_name}
                                        onChange={(e) => setFormData({ ...formData, deduction2_name: e.target.value })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-red-500"
                                    />
                                </div>
                                <div className="col-span-4">
                                    <input type="number" min="0" placeholder="0"
                                        value={formData.deduction2_value}
                                        onChange={(e) => setFormData({ ...formData, deduction2_value: Number(e.target.value) })}
                                        className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-red-500 font-mono text-right"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>


                    {/* Actions */}
                    <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 border border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-50 transition"
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center shadow-md disabled:opacity-50"
                        >
                            <Save size={20} className="mr-2" />
                            保存
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
