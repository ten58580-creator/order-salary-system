import jsPDF from 'jspdf';
import autoTable, { UserOptions } from 'jspdf-autotable';
import { NOTO_SANS_JP_BASE64 } from './fontData';

export interface PDFGeneratorOptions {
    title: string;
    companyName: string;
    filename: string;
    columns: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[][];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    footerData?: any[][]; // For totals row
}

export const generatePDF = async ({ title, companyName, filename, columns, data, footerData }: PDFGeneratorOptions) => {
    try {
        // Init jsPDF
        // Explicitly type the orientation
        const orientation = columns.length > 6 ? 'landscape' : 'portrait';
        const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

        // Add font via VFS (Virtual File System)
        // IMPORTANT: Must decode Base64 to binary string for jsPDF
        const fontFileName = 'NotoSansJP-Regular.ttf';
        doc.addFileToVFS(fontFileName, window.atob(NOTO_SANS_JP_BASE64));

        // Add font to jsPDF registry
        // 'normal' weight
        doc.addFont(fontFileName, 'NotoSansJP', 'normal');
        // 'bold' weight (using same font file as fallback)
        doc.addFont(fontFileName, 'NotoSansJP', 'bold');

        // Set font globally
        doc.setFont('NotoSansJP');

        // Header
        doc.setFontSize(18);
        doc.text(title, 14, 20);

        doc.setFontSize(10);
        const dateStr = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
        doc.text(`発行日: ${dateStr}`, doc.internal.pageSize.width - 14, 20, { align: 'right' });

        doc.setFontSize(12);
        const companyText = companyName || '株式会社TEN&A';
        doc.text(companyText, doc.internal.pageSize.width - 14, 28, { align: 'right' });

        // Table
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const autoTableOptions: UserOptions = {
            startY: 35,
            head: [columns],
            body: data,
            foot: footerData,
            styles: {
                font: 'NotoSansJP', // Apply embedded font
                fontStyle: 'normal',
                fontSize: 10,
                cellPadding: 3,
                overflow: 'linebreak', // Handle long text
            },
            headStyles: {
                fillColor: [66, 66, 66],
                textColor: 255,
                fontStyle: 'bold', // This triggers the bold font lookup
                halign: 'center',
            },
            footStyles: {
                fillColor: [240, 240, 240],
                textColor: 0,
                fontStyle: 'bold', // This triggers the bold font lookup
                halign: 'right',
            },
            theme: 'grid',
        };

        // Call autoTable
        autoTable(doc, autoTableOptions);

        // Save
        doc.save(filename);

    } catch (error) {
        console.error('PDF Generation Error (jsPDF):', error);
        alert('PDF生成中に予期せぬエラーが発生しました。');
    }
};
