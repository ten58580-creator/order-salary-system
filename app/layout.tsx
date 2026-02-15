import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AdminGuardProvider } from "@/components/AdminGuardContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AdminGuardProvider>
          {children}
        </AdminGuardProvider>
      </body>
    </html>
  );
}
