'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { ClipboardList, Truck, Package, ArrowRight, BarChart3, Clock, Building } from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboard() {
    return (
        <DashboardLayout>
            <div className="max-w-5xl mx-auto py-12">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-slate-900 mb-4">管理者ダッシュボード</h1>
                    <p className="text-xl text-gray-500 font-bold">業務メニューを選択してください</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Order Management */}
                    <Link href="/admin/orders" className="group">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 hover:shadow-xl hover:border-blue-500 transition-all duration-300 h-full flex flex-col items-center text-center">
                            <div className="bg-blue-50 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                                <ClipboardList size={48} className="text-blue-600" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-3">受注管理</h2>
                            <p className="text-gray-500 font-bold mb-6 flex-grow">
                                各社からの注文状況を確認・編集します。
                            </p>
                            <span className="flex items-center text-blue-600 font-bold group-hover:underline">
                                開く <ArrowRight size={20} className="ml-2" />
                            </span>
                        </div>
                    </Link>

                    {/* Production Instructions */}
                    <Link href="/admin/production" className="group">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 hover:shadow-xl hover:border-green-500 transition-all duration-300 h-full flex flex-col items-center text-center">
                            <div className="bg-green-50 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Truck size={48} className="text-green-600" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-3">製造指示</h2>
                            <p className="text-gray-500 font-bold mb-6 flex-grow">
                                本日の製造数と内訳を集計します。
                            </p>
                            <span className="flex items-center text-green-600 font-bold group-hover:underline">
                                開く <ArrowRight size={20} className="ml-2" />
                            </span>
                        </div>
                    </Link>

                    {/* Product Management */}
                    <Link href="/admin/products" className="group">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 hover:shadow-xl hover:border-purple-500 transition-all duration-300 h-full flex flex-col items-center text-center">
                            <div className="bg-purple-50 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Package size={48} className="text-purple-600" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-3">商品管理</h2>
                            <p className="text-gray-500 font-bold mb-6 flex-grow">
                                商品マスタの登録・アーカイブ設定。
                            </p>
                            <span className="flex items-center text-purple-600 font-bold group-hover:underline">
                                開く <ArrowRight size={20} className="ml-2" />
                            </span>
                        </div>
                    </Link>

                    {/* Production Analytics */}
                    <Link href="/admin/analytics" className="group">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 hover:shadow-xl hover:border-cyan-500 transition-all duration-300 h-full flex flex-col items-center text-center">
                            <div className="bg-cyan-50 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                                <BarChart3 size={48} className="text-cyan-600" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-3">生産管理（分析）</h2>
                            <p className="text-gray-500 font-bold mb-6 flex-grow">
                                生産効率・稼働時間・ガントチャート。
                            </p>
                            <span className="flex items-center text-cyan-600 font-bold group-hover:underline">
                                開く <ArrowRight size={20} className="ml-2" />
                            </span>
                        </div>
                    </Link>

                    {/* Labor Cost Management */}
                    <Link href="/" className="group">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 hover:shadow-xl hover:border-orange-500 transition-all duration-300 h-full flex flex-col items-center text-center">
                            <div className="bg-orange-50 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                                <ClipboardList size={48} className="text-orange-600" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-3">人件費管理</h2>
                            <p className="text-gray-500 font-bold mb-6 flex-grow">
                                勤怠管理・給与計算ダッシュボード。
                            </p>
                            <span className="flex items-center text-orange-600 font-bold group-hover:underline">
                                開く <ArrowRight size={20} className="ml-2" />
                            </span>
                        </div>
                    </Link>

                    {/* Time Card Management */}
                    <Link href="/admin/timecard" className="group">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 hover:shadow-xl hover:border-pink-500 transition-all duration-300 h-full flex flex-col items-center text-center">
                            <div className="bg-pink-50 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Clock size={48} className="text-pink-600" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-3">タイムカード管理</h2>
                            <p className="text-gray-500 font-bold mb-6 flex-grow">
                                スタッフの出退勤・休憩のリアルタイム打刻。
                            </p>
                            <span className="flex items-center text-pink-600 font-bold group-hover:underline">
                                開く <ArrowRight size={20} className="ml-2" />
                            </span>
                        </div>
                    </Link>

                    {/* Company Management */}
                    <Link href="/admin/companies" className="group">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 hover:shadow-xl hover:border-purple-500 transition-all duration-300 h-full flex flex-col items-center text-center">
                            <div className="bg-purple-50 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Building size={48} className="text-purple-600" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-3">会社管理</h2>
                            <p className="text-gray-500 font-bold mb-6 flex-grow">
                                依頼側の会社情報・PINコード管理。
                            </p>
                            <span className="flex items-center text-purple-600 font-bold group-hover:underline">
                                開く <ArrowRight size={20} className="ml-2" />
                            </span>
                        </div>
                    </Link>
                </div>
            </div>
        </DashboardLayout>
    );
}
