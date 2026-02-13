
'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ClipboardList, Truck, Package, ArrowRight, BarChart3, Clock, Building, Lock } from 'lucide-react';
import Link from 'next/link';
import { useAdminGuard } from '@/components/AdminGuardContext';
import { useRouter } from 'next/navigation';
import AdminPinModal from '@/components/AdminPinModal';

export default function AdminDashboard() {
    const { isUnlocked } = useAdminGuard();
    const router = useRouter();
    const [pinModalTarget, setPinModalTarget] = useState<string | null>(null);

    // Helper to handle navigation to protected routes
    const handleProtectedClick = (e: React.MouseEvent, href: string) => {
        e.preventDefault();
        if (isUnlocked) {
            router.push(href);
        } else {
            setPinModalTarget(href);
        }
    };

    const handlePinSuccess = () => {
        if (pinModalTarget) {
            router.push(pinModalTarget);
            setPinModalTarget(null);
        }
    };

    // Card Component for reusability
    const DashboardCard = ({
        href,
        icon: Icon,
        colorClass,
        title,
        description,
        isProtected = false
    }: {
        href: string;
        icon: any;
        colorClass: string;
        title: string;
        description: string;
        isProtected?: boolean;
    }) => {
        const isLocked = isProtected && !isUnlocked;

        // Base classes
        let cardClasses = "bg-white rounded-2xl shadow-sm border border-gray-200 p-8 transition-all duration-300 h-full flex flex-col items-center text-center relative overflow-hidden";
        let iconBgClass = `${colorClass.replace('text-', 'bg-').replace('600', '50')} p-6 rounded-full mb-6 transition-transform duration-300`;

        if (isLocked) {
            // Lighter overlay style
            cardClasses += " opacity-100 bg-white cursor-pointer hover:shadow-md";
        } else {
            cardClasses += " hover:shadow-xl hover:border-blue-500 group";
        }

        const content = (
            <div className={cardClasses} onClick={isLocked ? (e) => handleProtectedClick(e, href) : undefined}>
                {isLocked && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-50/40 backdrop-blur-[0.5px] z-10 transition-colors duration-300">
                        <Lock size={64} className="text-slate-300 opacity-70" />
                    </div>
                )}

                <div className={`${iconBgClass} ${!isLocked ? 'group-hover:scale-110' : ''}`}>
                    <Icon size={48} className={colorClass} />
                </div>
                <h2 className={`text-2xl font-black mb-3 ${isLocked ? 'text-slate-400' : 'text-slate-900'}`}>{title}</h2>
                <p className={`font-bold mb-6 flex-grow ${isLocked ? 'text-slate-300' : 'text-gray-500'}`}>
                    {description}
                </p>
                <span className={`flex items-center font-bold ${isLocked ? 'text-slate-300' : colorClass} ${!isLocked ? 'group-hover:underline' : ''}`}>
                    {isLocked ? (
                        <>
                            <Lock size={16} className="mr-2" />
                            ロック中
                        </>
                    ) : (
                        <>
                            開く <ArrowRight size={20} className="ml-2" />
                        </>
                    )}
                </span>
            </div>
        );

        if (isLocked) {
            return content; // Div with onClick
        }

        return (
            <Link href={href} className="group">
                {content}
            </Link>
        );
    };

    return (
        <DashboardLayout>
            <div className="max-w-5xl mx-auto py-12">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-slate-900 mb-4">管理者ダッシュボード</h1>
                    <p className="text-xl text-gray-500 font-bold">業務メニューを選択してください</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* 1. Timecard (Top Left) */}
                    <DashboardCard
                        href="/admin/timecard"
                        icon={Clock}
                        colorClass="text-pink-600"
                        title="タイムカード管理"
                        description="スタッフの出退勤・休憩のリアルタイム打刻。"
                        isProtected={false} // Open
                    />

                    {/* 2. Production (Center Top) */}
                    <DashboardCard
                        href="/admin/production"
                        icon={Truck}
                        colorClass="text-green-600"
                        title="製造指示"
                        description="本日の製造数と内訳を集計します。"
                        isProtected={false} // Open
                    />

                    {/* 3. Orders */}
                    <DashboardCard
                        href="/admin/orders"
                        icon={ClipboardList}
                        colorClass="text-blue-600"
                        title="受注管理"
                        description="各社からの注文状況を確認・編集します。"
                        isProtected={true}
                    />

                    {/* 4. Labor Cost */}
                    <DashboardCard
                        href="/" // Labor Cost
                        icon={ClipboardList}
                        colorClass="text-orange-600"
                        title="人件費管理"
                        description="勤怠管理・給与計算ダッシュボード。"
                        isProtected={false} // Open (Partial lock inside)
                    />

                    {/* 5. Production Analytics */}
                    <DashboardCard
                        href="/admin/analytics"
                        icon={BarChart3}
                        colorClass="text-cyan-600"
                        title="生産管理（分析）"
                        description="生産効率・稼働時間・ガントチャート。"
                        isProtected={true}
                    />

                    {/* 6. Product Management */}
                    <DashboardCard
                        href="/admin/products"
                        icon={Package}
                        colorClass="text-purple-600"
                        title="商品管理"
                        description="商品マスタの登録・アーカイブ設定。"
                        isProtected={true}
                    />

                    {/* 7. Company Management */}
                    <DashboardCard
                        href="/admin/companies"
                        icon={Building}
                        colorClass="text-purple-600"
                        title="会社管理"
                        description="依頼側の会社情報・PINコード管理。"
                        isProtected={true}
                    />
                </div>
            </div>

            {/* PIN Modal - Only shows when a target is selected */}
            {pinModalTarget && (
                <AdminPinModal
                    onClose={() => setPinModalTarget(null)}
                    onSuccess={handlePinSuccess}
                />
            )}
        </DashboardLayout>
    );
}
