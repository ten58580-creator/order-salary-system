declare module 'jspdf-autotable' {
    import { jsPDF } from 'jspdf';

    export interface UserOptions {
        startY?: number;
        head?: any[][];
        body?: any[][];
        foot?: any[][];
        columns?: any[];
        data?: any[];
        margin?: any;
        styles?: any;
        theme?: 'striped' | 'grid' | 'plain' | 'css';
        styles?: any;
        headStyles?: any;
        bodyStyles?: any;
        footStyles?: any;
        alternateRowStyles?: any;
        columnStyles?: any;
        didDrawPage?: (data: any) => void;
        didDrawCell?: (data: any) => void;
        willDrawCell?: (data: any) => void;
    }

    export function applyPlugin(jsPDF: jsPDF): void;
    export default function autoTable(doc: jsPDF, options: UserOptions): void;
}
