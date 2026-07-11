import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VideoBrief | 海外 AI 信息再制生产台',
  description: 'Internal workspace for remixing overseas AI signals into Chinese short videos, cards, briefs, and reusable assets.',
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
