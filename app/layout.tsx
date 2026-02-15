import type { Metadata } from "next";
import { Noto_Sans_JP, Inter } from "next/font/google"; // Updated font imports
import { AdminGuardProvider } from "@/components/AdminGuardContext";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"], // Added weights for variety
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "チェックル",
  description: "クラウド型勤怠・給与管理システム",
  // System Name Updated to Checkle (2026-02-15 14:10)
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${notoSansJP.variable} ${inter.variable} antialiased font-sans text-slate-900 bg-gray-50`} // Added base text color and bg
      >
        <AdminGuardProvider>
          {children}
        </AdminGuardProvider>
      </body>
    </html>
  );
}
