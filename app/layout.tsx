import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "SoBan Retail",
  description: "Nền tảng quản lý bán lẻ cho cửa hàng và chuỗi nhỏ tại Việt Nam"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
