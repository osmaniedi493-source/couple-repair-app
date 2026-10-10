import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "我们慢慢说",
  description: "情侣冲突 AI 双人复盘"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Zhi+Mang+Xing&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
