'use client';

import { useEffect } from 'react';

export default function ProjectHomeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <p className="text-xs font-extrabold text-emerald-700">VIDEOBRIEF</p>
          <h1 className="mt-0.5 text-xl font-extrabold">视频项目</h1>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="border border-rose-200 bg-rose-50 px-4 py-5" role="alert">
          <h2 className="text-sm font-extrabold text-rose-900">项目列表加载失败</h2>
          <p className="mt-1 text-xs leading-5 text-rose-700">{error.message || '无法读取本地项目，请重试。'}</p>
          <button className="mt-4 h-9 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-800" type="button" onClick={reset}>重试</button>
        </div>
      </section>
    </main>
  );
}
