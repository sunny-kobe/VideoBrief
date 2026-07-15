import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VideoBrief | AI 视频生产工作台',
  description: 'Local AI video production workbench driven by creative briefs and mixed source materials.',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
