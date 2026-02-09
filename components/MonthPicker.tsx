import { useState } from 'react';
import { format, setMonth, setYear, addYears } from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface MonthPickerProps {
    currentDate: Date;
    onDateChange: (date: Date) => void;
    onClose: () => void;
}

export default function MonthPicker({ currentDate, onDateChange, onClose }: MonthPickerProps) {
    const [viewYear, setViewYear] = useState(currentDate.getFullYear());

    const months = Array.from({ length: 12 }, (_, i) => i);

    const handleMonthSelect = (monthIndex: number) => {
        const newDate = setMonth(setYear(currentDate, viewYear), monthIndex);
        onDateChange(newDate);
        onClose();
    };

    const handlePrevYear = () => setViewYear(prev => prev - 1);
    const handleNextYear = () => setViewYear(prev => prev + 1);

    return (
        <>
            {/* Overlay for closing when clicking outside */}
            <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={onClose}
            />

            {/* Popover Content */}
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 w-64 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-100 p-4">

                {/* Header: Year Navigation */}
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={handlePrevYear}
                        className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="font-black text-slate-950 text-lg">
                        {viewYear}年
                    </div>
                    <button
                        onClick={handleNextYear}
                        className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                {/* Month Grid */}
                <div className="grid grid-cols-3 gap-2">
                    {months.map((month) => {
                        const isSelected = currentDate.getMonth() === month && currentDate.getFullYear() === viewYear;
                        const isCurrentMonth = new Date().getMonth() === month && new Date().getFullYear() === viewYear;

                        return (
                            <button
                                key={month}
                                onClick={() => handleMonthSelect(month)}
                                className={`
                  py-2 rounded-lg text-sm font-bold transition
                  ${isSelected
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-600'
                                    }
                  ${!isSelected && isCurrentMonth ? 'border-2 border-blue-100' : ''}
                `}
                            >
                                {month + 1}月
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
