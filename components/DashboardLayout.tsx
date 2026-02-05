import React from 'react';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-gray-900">Order Salary System</h1>
                    <nav className="flex space-x-4">
                        <a href="/admin/orders" className="text-gray-700 hover:text-blue-600 font-bold px-3 py-2 rounded-md text-sm transition">受注管理</a>
                        <a href="/admin/production" className="text-gray-700 hover:text-blue-600 font-bold px-3 py-2 rounded-md text-sm transition flex items-center">
                            <span className="mr-1">🚚</span> 製造指示
                        </a>
                    </nav>
                </div>
            </header >
            <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
                {children}
            </main>
            <footer className="bg-white border-t border-gray-200 mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <p className="text-center text-sm text-gray-500">© 2026 Order Salary System</p>
                </div>
            </footer>
        </div >
    );
}
