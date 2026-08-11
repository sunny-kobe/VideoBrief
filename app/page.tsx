import { Suspense } from 'react';

import ProjectHomeClient from '@/src/components/ProjectHomeClient';
import { listProjectHomeEntries } from '@/src/projectHomeServer';

export const dynamic = 'force-dynamic';

function HomeLoading() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <p className="text-sm font-bold text-slate-500" role="status">正在读取项目状态...</p>
      </div>
    </main>
  );
}

export default function HomePage() {
  const entries = listProjectHomeEntries();
  return (
    <Suspense fallback={<HomeLoading />}>
      <ProjectHomeClient entries={entries} />
    </Suspense>
  );
}
