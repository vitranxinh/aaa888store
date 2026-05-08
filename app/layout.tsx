import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "AAA888",
  description: "Nền tảng quản lý bán lẻ cho cửa hàng và chuỗi nhỏ tại Việt Nam",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AAA888"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#059669"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="max-w-full overflow-x-hidden">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
