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
  title: "Checkle (チェックル)",
  description: "クラウド型勤怠・給与管理システム",
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
