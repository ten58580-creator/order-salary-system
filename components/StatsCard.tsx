import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
    label: string;
    value: string;
    subValue?: string;
    icon?: LucideIcon;
    badge?: string;
}

export default function StatsCard({ label, value, subValue, icon: Icon, badge }: StatsCardProps) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
                {Icon && (
                    <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
                        <Icon size={24} />
                    </div>
                )}
                {badge && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                        {badge}
                    </span>
                )}
            </div>
            <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">{label}</h4>
                <div className="flex items-baseline">
                    <span className="text-3xl font-bold text-gray-900">{value}</span>
                    {subValue && <span className="ml-2 text-sm text-gray-500">{subValue}</span>}
                </div>
            </div>
        </div>
    );
}
