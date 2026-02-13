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
  title: "Order Salary System",
  description: "Order and salary management system",
  icons: { icon: '/favicon.ico?v=final' },
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
