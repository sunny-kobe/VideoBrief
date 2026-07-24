'use client';

import { ArrowRight, ExternalLink, LoaderCircle, RefreshCw, ScanSearch, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import type { DailySignalRun } from '@/src/dailySignalCore';

interface DailySignalsClientProps {
  initialRun: DailySignalRun | null;
}

const scoreLabels = [
  ['firstParty', '一手'],
  ['recency', '时效'],
  ['actionability', '行动'],
  ['verifiability', '核验'],
  ['mediaRichness', '素材'],
  ['rightsClarity', '权利'],
] as const;

export default function DailySignalsClient({ initialRun }: DailySignalsClientProps) {
  const [run, setRun] = useState(initialRun);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function scan() {
    setBusy('scan');
    setError('');
    try {
      const response = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replace: true }),
      });
      const result = await response.json();
      if (!response.ok && !result.run) throw new Error(result.error ?? '扫描失败');
      setRun(result.run);
      if (!response.ok) setError(result.run.errors.join('；'));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '扫描失败');
    } finally {
      setBusy('');
    }
  }

  async function approve(candidateId: string) {
    if (!run) return;
    setBusy(candidateId);
    setError('');
    try {
      const response = await fetch(`/api/signals/${encodeURIComponent(run.id)}/${encodeURIComponent(candidateId)}/approve`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? '批准候选失败');
      setRun(result.run);
      window.location.href = `/workbench?project=${encodeURIComponent(result.projectId)}&view=sources`;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '批准候选失败');
      setBusy('');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <section className="flex flex-col gap-4 border-b border-slate-300 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-extrabold">先选命题，再建立视频项目</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">扫描只读取免费公开源。批准后创建 canonical project 并收集本地候选素材，不会渲染、发布或提升权利状态。</p>
        </div>
        <button className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-extrabold text-white disabled:bg-slate-400" type="button" onClick={scan} disabled={Boolean(busy)}>
          {busy === 'scan' ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : run ? <RefreshCw aria-hidden="true" className="h-4 w-4" /> : <ScanSearch aria-hidden="true" className="h-4 w-4" />}
          {busy === 'scan' ? '扫描中' : run ? '重新扫描' : '扫描今日信号'}
        </button>
      </section>

      {error ? <p className="mt-4 border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">{error}</p> : null}

      {!run ? (
        <div className="py-20 text-center text-slate-500"><ScanSearch aria-hidden="true" className="mx-auto h-7 w-7" /><p className="mt-3 text-sm font-bold">尚未生成候选</p></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4 text-xs font-bold text-slate-500">
            <span>{run.date}</span><span>{run.candidates.length} 个候选</span><span>零付费源</span><span className={run.status === 'completed' ? 'text-emerald-700' : 'text-amber-700'}>{run.status === 'completed' ? '扫描完成' : '来源不足'}</span>
          </div>
          {run.errors.length ? (
            <details className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3">
              <summary className="flex cursor-pointer items-center gap-2 text-xs font-extrabold text-amber-900"><ShieldAlert aria-hidden="true" className="h-4 w-4" />来源缺口（{run.errors.length}）</summary>
              <ul className="mt-3 space-y-1 text-xs leading-relaxed text-amber-900">{run.errors.map((item) => <li key={item}>{item}</li>)}</ul>
            </details>
          ) : null}
          <div className="space-y-3">
            {run.candidates.map((candidate, index) => (
              <article className="rounded-md border border-slate-200 bg-white p-4" key={candidate.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-700"><span>{String(index + 1).padStart(2, '0')}</span><span>{candidate.score.total}/12</span></div>
                    <h3 className="mt-1 text-base font-extrabold leading-snug">{candidate.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{candidate.summary || '暂无摘要，批准前应查看原始来源。'}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">{scoreLabels.map(([key, label]) => <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600" key={key}>{label} {candidate.score[key]}/2</span>)}</div>
                    <a className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-slate-700 underline decoration-slate-300 underline-offset-4" href={candidate.primaryUrl} target="_blank" rel="noreferrer">查看一手来源<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /></a>
                  </div>
                  {candidate.status === 'approved' ? (
                    <a className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800" href={`/workbench?project=${encodeURIComponent(candidate.projectId)}&view=sources`}>进入项目<ArrowRight aria-hidden="true" className="h-4 w-4" /></a>
                  ) : (
                    <button className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" onClick={() => approve(candidate.id)} disabled={Boolean(busy)}>{busy === candidate.id ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}{busy === candidate.id ? '建立素材包' : '批准并建项目'}</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

