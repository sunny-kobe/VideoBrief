import { ArrowLeft } from 'lucide-react';
import DailySignalsClient from '@/src/components/DailySignalsClient';
import { readLatestDailySignalRun } from '@/src/dailySignalServer';

export const dynamic = 'force-dynamic';

export default function DailySignalsPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <a className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" href="/" title="返回项目列表" aria-label="返回项目列表">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          </a>
          <div>
            <p className="text-xs font-extrabold text-emerald-700">DAILY SIGNALS</p>
            <h1 className="text-lg font-extrabold">每日候选命题</h1>
          </div>
        </div>
      </header>
      <DailySignalsClient initialRun={readLatestDailySignalRun()} />
    </main>
  );
}

