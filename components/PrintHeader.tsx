import React from 'react';

interface PrintHeaderProps {
    title: string;
    companyName?: string;
    date?: string;
}

const PrintHeader: React.FC<PrintHeaderProps> = ({ title, companyName, date }) => {
    const formattedDate = date || new Date().toLocaleDateString('ja-JP');
    const issuerName = '株式会社TEN&A'; // Default Issuer Name

    return (
        <div className="hidden print:block mb-8 border-b-2 border-black pb-4">
            <div className="flex justify-between items-end">
                {/* Left: Client Name */}
                <div className="w-1/3 text-left">
                    {companyName && (
                        <h2 className="text-sm font-bold border-b border-gray-400 inline-block pb-0.5 mb-1">
                            {companyName} <span className="text-xs ml-1">御中</span>
                        </h2>
                    )}
                </div>

                {/* Center: Title */}
                <div className="w-1/3 text-center">
                    <h1 className="text-xl font-extrabold tracking-wider border border-black px-4 py-1 inline-block">
                        {title}
                    </h1>
                </div>

                {/* Right: Issuer & Date */}
                <div className="w-1/3 text-right">
                    <div className="text-[10px] text-gray-500 mb-0.5">発行元</div>
                    <div className="text-sm font-bold mb-1">{issuerName}</div>
                    <div className="text-xs font-mono">出力日: {formattedDate}</div>
                </div>
            </div>
        </div>
    );
};

export default PrintHeader;
