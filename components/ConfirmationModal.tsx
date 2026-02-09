'use client';

import { X, AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
}

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = '実行',
    cancelText = 'キャンセル',
    isDanger = false
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className={`p-3 rounded-full ${isDanger ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                            <AlertTriangle size={24} />
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
                            <X size={24} />
                        </button>
                    </div>
                    <h3 className="text-xl font-bold text-slate-950 mb-2">{title}</h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{message}</p>
                </div>
                <div className="bg-slate-50 p-4 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`px-5 py-2.5 rounded-xl font-bold text-white shadow-lg transform active:scale-95 transition ${isDanger
                                ? 'bg-red-600 hover:bg-red-700 shadow-red-200'
                                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                            }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
