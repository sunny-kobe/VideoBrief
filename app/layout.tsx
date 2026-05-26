import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VideoBrief',
  description: 'Transcript-first Chinese research notes for English videos.',
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
