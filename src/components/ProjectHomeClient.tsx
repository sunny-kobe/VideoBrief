'use client';

import {
  Archive,
  ArrowRight,
  FolderPlus,
  MoreHorizontal,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { ProjectDeletionPlan } from '@/src/projectLifecycleServer';
import type { ProjectHomeListEntry } from '@/src/projectHomeServer';

interface ProjectHomeClientProps {
  entries: ProjectHomeListEntry[];
}

const stages = [
  ['all', '全部'],
  ['needs_attention', '需处理'],
  ['in_progress', '制作中'],
  ['awaiting_review', '待审片'],
  ['completed', '已完成'],
  ['archived', '已归档'],
] as const;

const rightsLabel = { cleared: '权利已确认', review_required: '权利待复核', blocked: '素材受阻' } as const;
const publicationLabel = { 'draft-unpublished': '未发布', 'ready-for-review': '待发布确认', published: '已发布' } as const;
const marketLabel = { none: '未验证', collecting: '收集反馈中', validated: '已验证', not_validated: '未验证成立', inconclusive: '证据不足' } as const;
const originLabel = { manual: '手动项目', daily_signal: '每日命题', legacy: 'Legacy' } as const;
const blockerLabel: Record<ProjectDeletionPlan['blockers'][number]['code'], string> = {
  active_queue: '仍有生产任务运行',
  referenced: '仍被其他配置或项目引用',
  unsafe_path: '包含不安全路径',
  inspection_failed: '安全检查未完成',
};

function formatDate(value: string) {
  if (!value) return '时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function stageTone(stage: ProjectHomeListEntry['stage']) {
  if (stage === 'needs_attention') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (stage === 'in_progress') return 'border-sky-200 bg-sky-50 text-sky-800';
  if (stage === 'awaiting_review') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (stage === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

export default function ProjectHomeClient({ entries }: ProjectHomeClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const stage = searchParams.get('stage') ?? 'all';
  const sort = searchParams.get('sort') ?? 'updated-desc';
  const rights = searchParams.get('rights') ?? '';
  const publication = searchParams.get('publication') ?? '';
  const market = searchParams.get('market') ?? '';
  const origin = searchParams.get('origin') ?? '';
  const [busyProjectId, setBusyProjectId] = useState('');
  const [operationError, setOperationError] = useState('');
  const [operationResult, setOperationResult] = useState('');
  const [archiveEntry, setArchiveEntry] = useState<ProjectHomeListEntry | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [deleteEntry, setDeleteEntry] = useState<ProjectHomeListEntry | null>(null);
  const [deletionPlan, setDeletionPlan] = useState<ProjectDeletionPlan | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [planLoading, setPlanLoading] = useState(false);

  function closeArchiveModal() {
    setArchiveEntry(null);
    setArchiveReason('');
  }

  function closeDeleteModal() {
    setDeleteEntry(null);
    setDeletionPlan(null);
    setDeleteConfirmation('');
  }

  useEffect(() => {
    if (!archiveEntry && !deleteEntry) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busyProjectId) return;
      closeArchiveModal();
      closeDeleteModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [archiveEntry, busyProjectId, deleteEntry]);

  function setParam(name: string, value: string, fallback = '') {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === fallback) next.delete(name);
    else next.set(name, value);
    router.replace(next.size ? `/?${next.toString()}` : '/', { scroll: false });
  }

  const counts = useMemo(() => Object.fromEntries(stages.map(([value]) => [
    value,
    value === 'all'
      ? entries.filter((entry) => entry.lifecycleState === 'active').length
      : entries.filter((entry) => entry.stage === value).length,
  ])), [entries]);

  const visibleEntries = useMemo(() => {
    const normalizedQuery = q.trim().toLocaleLowerCase('zh-CN');
    return entries
      .filter((entry) => stage === 'archived'
        ? entry.stage === 'archived'
        : stage === 'all'
          ? entry.lifecycleState === 'active'
          : entry.stage === stage)
      .filter((entry) => !normalizedQuery || [entry.title, entry.id, entry.coreMessage]
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery)))
      .filter((entry) => !rights || entry.rightsStatus === rights)
      .filter((entry) => !publication || entry.publicationStatus === publication)
      .filter((entry) => !market || entry.marketStatus === market)
      .filter((entry) => !origin || entry.workflowOrigin === origin)
      .sort((left, right) => {
        if (sort === 'updated-asc') return left.updatedAt.localeCompare(right.updatedAt);
        if (sort === 'title') return left.title.localeCompare(right.title, 'zh-CN');
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [entries, market, origin, publication, q, rights, sort, stage]);

  const blockerGroups = useMemo(() => {
    const groups = new Map<ProjectDeletionPlan['blockers'][number]['code'], { count: number; sources: string[] }>();
    for (const blocker of deletionPlan?.blockers ?? []) {
      const group = groups.get(blocker.code) ?? { count: 0, sources: [] };
      group.count += 1;
      const source = blocker.source || blocker.message;
      if (!group.sources.includes(source)) group.sources.push(source);
      groups.set(blocker.code, group);
    }
    return [...groups.entries()].map(([code, group]) => ({ code, ...group }));
  }, [deletionPlan]);

  const targetGroups = useMemo(() => {
    const groups = new Map<string, { targetCount: number; fileCount: number; bytes: number }>();
    for (const target of deletionPlan?.targets ?? []) {
      const group = groups.get(target.category) ?? { targetCount: 0, fileCount: 0, bytes: 0 };
      group.targetCount += 1;
      group.fileCount += target.fileCount;
      group.bytes += target.bytes;
      groups.set(target.category, group);
    }
    return [...groups.entries()].map(([category, group]) => ({ category, ...group }));
  }, [deletionPlan]);

  async function updateLifecycle(entry: ProjectHomeListEntry, action: 'archive' | 'restore') {
    setBusyProjectId(entry.id);
    setOperationError('');
    setOperationResult('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(entry.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'archive'
          ? { action, archivedBy: 'local-user', archiveReason }
          : { action, restoredBy: 'local-user' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '项目生命周期更新失败');
      setOperationResult(action === 'archive' ? `“${entry.title}”已归档。` : `“${entry.title}”已恢复。`);
      closeArchiveModal();
      router.refresh();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '项目生命周期更新失败');
    } finally {
      setBusyProjectId('');
    }
  }

  async function openDeletionPlan(entry: ProjectHomeListEntry) {
    setDeleteEntry(entry);
    setDeletionPlan(null);
    setDeleteConfirmation('');
    setPlanLoading(true);
    setOperationError('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(entry.id)}/deletion-plan`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '删除计划生成失败');
      setDeletionPlan(payload.plan);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '删除计划生成失败');
    } finally {
      setPlanLoading(false);
    }
  }

  async function deleteProject() {
    if (!deleteEntry || !deletionPlan) return;
    setBusyProjectId(deleteEntry.id);
    setOperationError('');
    setOperationResult('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(deleteEntry.id)}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '项目删除失败');
      setOperationResult(`“${deleteEntry.title}”已移到项目废纸篓，共 ${payload.receipt.totals.files} 个文件。`);
      closeDeleteModal();
      router.refresh();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '项目删除失败');
    } finally {
      setBusyProjectId('');
    }
  }

  const hasFilters = Boolean(q || rights || publication || market || origin || sort !== 'updated-desc' || stage !== 'all');
  const archiveDisabled = Boolean(archiveEntry && busyProjectId === archiveEntry.id);
  const deleteDisabled = !deleteEntry
    || !deletionPlan?.canDelete
    || deleteConfirmation !== deleteEntry.id
    || busyProjectId === deleteEntry.id;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-emerald-700">VIDEOBRIEF</p>
            <h1 className="mt-0.5 text-xl font-extrabold">视频项目</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <details className="relative">
              <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" title="更多入口" aria-label="更多入口"><MoreHorizontal aria-hidden="true" className="h-5 w-5" /></summary>
              <div className="absolute right-0 z-30 mt-2 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg" style={{ width: '11rem' }}>
                <a className="block px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" href="/showcase">受众样片</a>
                <a className="block px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" href="/signals">候选命题</a>
              </div>
            </details>
            <a className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-extrabold text-white hover:bg-slate-800 sm:px-4" href="/projects/new">
              <FolderPlus aria-hidden="true" className="h-4 w-4" />
              新建项目
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {operationError ? <div className="mb-3 flex items-start justify-between gap-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800" role="alert"><span>{operationError}</span><button type="button" onClick={() => setOperationError('')} title="关闭" aria-label="关闭"><X className="h-4 w-4" /></button></div> : null}
        {operationResult ? <div className="mb-3 flex items-start justify-between gap-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800" role="status"><span>{operationResult}</span><button type="button" onClick={() => setOperationResult('')} title="关闭" aria-label="关闭"><X className="h-4 w-4" /></button></div> : null}

        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block min-w-0 flex-1 lg:max-w-xl">
            <span className="sr-only">搜索项目标题、项目 ID 或核心命题</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-md border border-slate-300 bg-white text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              style={{ paddingLeft: '2.25rem', paddingRight: '0.75rem' }}
              value={q}
              onChange={(event) => setParam('q', event.target.value)}
              placeholder="搜索标题、项目 ID 或核心命题…"
              name="project-search"
              autoComplete="off"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
            排序
            <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700" value={sort} onChange={(event) => setParam('sort', event.target.value, 'updated-desc')}>
              <option value="updated-desc">最近更新</option><option value="updated-asc">最早更新</option><option value="title">标题</option>
            </select>
          </label>
        </div>

        <div className="project-stage-scroll mt-4 pb-1">
          <nav className="project-stage-nav rounded-md border border-slate-300 bg-white p-1" aria-label="项目阶段">
            {stages.map(([value, label]) => <button key={value} className={`rounded text-xs font-extrabold ${stage === value ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`} type="button" onClick={() => setParam('stage', value, 'all')}>{label} <span className={stage === value ? 'text-slate-300' : 'text-slate-400'}>{counts[value] ?? 0}</span></button>)}
          </nav>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <select aria-label="素材权利筛选" className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700" value={rights} onChange={(event) => setParam('rights', event.target.value)}><option value="">全部权利状态</option><option value="cleared">权利已确认</option><option value="review_required">权利待复核</option><option value="blocked">素材受阻</option></select>
          <select aria-label="发布状态筛选" className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700" value={publication} onChange={(event) => setParam('publication', event.target.value)}><option value="">全部发布状态</option><option value="draft-unpublished">未发布</option><option value="ready-for-review">待发布确认</option><option value="published">已发布</option></select>
          <select aria-label="市场状态筛选" className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700" value={market} onChange={(event) => setParam('market', event.target.value)}><option value="">全部市场状态</option><option value="none">未验证</option><option value="collecting">收集反馈中</option><option value="validated">已验证</option><option value="not_validated">未验证成立</option><option value="inconclusive">证据不足</option></select>
          <select aria-label="工作流来源筛选" className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700" value={origin} onChange={(event) => setParam('origin', event.target.value)}><option value="">全部项目来源</option><option value="manual">手动项目</option><option value="daily_signal">每日命题</option><option value="legacy">Legacy</option></select>
          {hasFilters ? <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-600 hover:bg-slate-50" type="button" onClick={() => router.replace('/', { scroll: false })}><X aria-hidden="true" className="h-3.5 w-3.5" />清除筛选</button> : null}
        </div>

        <div className="mt-4 overflow-visible border-y border-slate-200 bg-white">
          <div className="hidden gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-extrabold text-slate-500 lg:flex">
            <span className="flex-1">项目</span><span className="flex-1">主要阶段</span><span className="flex-1">异常 / 状态</span><span className="flex-1">更新时间</span><span className="flex-1 text-right">下一步</span>
          </div>
          <div className="divide-y divide-slate-200">
            {visibleEntries.map((entry) => (
              <article className="grid min-w-0 gap-3 px-3 py-3 lg:grid-cols-5 lg:items-center lg:gap-4 lg:px-4" key={entry.id}>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start gap-2"><h2 className="min-w-0 break-words text-sm font-extrabold leading-5">{entry.title}</h2><span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-extrabold ${stageTone(entry.stage)}`}>{entry.stageLabel}</span></div>
                  <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{entry.id}</p>
                  {entry.coreMessage ? <p className="mt-1 line-clamp-1 text-xs text-slate-500 lg:hidden">{entry.coreMessage}</p> : null}
                </div>
                <div className="min-w-0"><p className="text-xs font-extrabold text-slate-800">{entry.primaryStage}</p><p className="mt-1 text-[10px] font-bold text-slate-400">{originLabel[entry.workflowOrigin]}</p></div>
                <div className="min-w-0">
                  {entry.issue ? <p className={`line-clamp-2 text-xs leading-5 ${entry.stage === 'needs_attention' ? 'font-bold text-rose-700' : 'text-slate-600'}`}>{entry.issue}</p> : <p className="text-xs text-slate-500">{entry.archiveReason || `${rightsLabel[entry.rightsStatus]} · ${publicationLabel[entry.publicationStatus]} · ${marketLabel[entry.marketStatus]}`}</p>}
                </div>
                <p className="text-[11px] font-bold text-slate-500">{formatDate(entry.updatedAt)}</p>
                <div className="flex items-center justify-between gap-2 lg:justify-end">
                  {entry.nextHref ? <a className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50" href={entry.nextHref}>{entry.nextAction}<ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /></a> : <span className="text-xs font-bold text-slate-400">无法打开</span>}
                  {!entry.damaged ? <details className="relative shrink-0">
                    <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50" title="项目操作" aria-label={`${entry.title} 项目操作`}><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></summary>
                    <div
                      className="absolute overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                      style={{ right: 0, bottom: 'calc(100% + 0.25rem)', zIndex: 20, width: '9rem' }}
                    >
                      {entry.lifecycleState === 'archived' ? <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50" type="button" disabled={busyProjectId === entry.id} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void updateLifecycle(entry, 'restore'); }}><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />恢复项目</button> : <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50" type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setArchiveEntry(entry); }}><Archive aria-hidden="true" className="h-3.5 w-3.5" />归档项目</button>}
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-rose-700 hover:bg-rose-50" type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void openDeletionPlan(entry); }}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />删除项目</button>
                    </div>
                  </details> : null}
                </div>
              </article>
            ))}
          </div>
        </div>

        {visibleEntries.length === 0 ? <div className="border-b border-slate-200 bg-white px-5 py-14 text-center"><p className="text-sm font-extrabold text-slate-700">{entries.length === 0 ? '还没有项目' : '没有符合条件的项目'}</p><p className="mt-2 text-xs text-slate-500">{entries.length === 0 ? '创建第一个项目后会在这里显示。' : '调整搜索词或筛选条件后重试。'}</p></div> : null}
      </section>

      {archiveEntry ? <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} role="dialog" aria-modal="true" aria-labelledby="archive-title">
        <div className="w-full max-w-md rounded-md bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 id="archive-title" className="text-sm font-extrabold">归档项目</h2><button className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" type="button" onClick={closeArchiveModal} title="关闭" aria-label="关闭"><X aria-hidden="true" className="h-4 w-4" /></button></div>
          <div className="p-4"><p className="text-sm text-slate-600">归档后默认列表会隐藏“{archiveEntry.title}”，成片和生产状态不会改变。</p><label className="mt-4 block text-xs font-bold text-slate-600">归档原因（可选）<textarea className="mt-1.5 min-h-20 w-full resize-y rounded-md border border-slate-300 p-3 text-sm" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} maxLength={1000} name="archive-reason" autoComplete="off" /></label></div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3"><button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-extrabold hover:bg-slate-50" type="button" onClick={closeArchiveModal}>取消</button><button className="h-9 rounded-md px-3 text-xs font-extrabold hover:bg-slate-800" style={{ backgroundColor: archiveDisabled ? '#e2e8f0' : '#020617', color: archiveDisabled ? '#475569' : '#ffffff' }} type="button" disabled={archiveDisabled} onClick={() => void updateLifecycle(archiveEntry, 'archive')}>确认归档</button></div>
        </div>
      </div> : null}

      {deleteEntry ? <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-md bg-white shadow-xl" style={{ maxHeight: 'min(90dvh, 46rem)' }}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3"><div className="min-w-0"><h2 id="delete-title" className="text-sm font-extrabold">移到项目废纸篓</h2><p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{deleteEntry.id}</p></div><button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" type="button" onClick={closeDeleteModal} title="关闭" aria-label="关闭"><X aria-hidden="true" className="h-4 w-4" /></button></div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
            {planLoading ? <p className="py-8 text-center text-sm font-bold text-slate-500" role="status">正在核验影响范围…</p> : deletionPlan ? <>
              <div className="grid grid-cols-2 border border-slate-200 bg-slate-50 text-center"><div className="p-3"><p className="text-[10px] font-bold text-slate-500">文件</p><p className="mt-1 text-lg font-extrabold">{deletionPlan.totals.files}</p></div><div className="border-l border-slate-200 p-3"><p className="text-[10px] font-bold text-slate-500">占用空间</p><p className="mt-1 text-lg font-extrabold">{formatBytes(deletionPlan.totals.bytes)}</p></div></div>
              <div><h3 className="text-xs font-extrabold text-slate-700">影响范围</h3><ul className="mt-2 divide-y divide-slate-100 border-y border-slate-200">{targetGroups.map((group) => <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 text-xs" key={group.category}><span className="min-w-0 font-bold text-slate-700">{group.category}<span className="ml-1 font-normal text-slate-400">{group.targetCount} 处</span></span><span className="whitespace-nowrap font-bold text-slate-500">{group.fileCount} 个 · {formatBytes(group.bytes)}</span></li>)}</ul><details className="mt-2"><summary className="cursor-pointer text-[11px] font-bold text-slate-500 hover:text-slate-800">查看 {deletionPlan.targets.length} 条具体路径</summary><ul className="mt-2 max-h-40 divide-y divide-slate-100 overflow-y-auto overscroll-contain border-y border-slate-200">{deletionPlan.targets.map((target) => <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 text-[11px]" key={target.relativePath}><span className="min-w-0 break-all text-slate-600">{target.relativePath}</span><span className="whitespace-nowrap font-bold text-slate-500">{target.fileCount} 个 · {formatBytes(target.bytes)}</span></li>)}</ul></details></div>
              {deletionPlan.blockers.length ? <div className="border border-rose-200 bg-rose-50 p-3"><h3 className="text-xs font-extrabold text-rose-800">当前不能删除</h3><p className="mt-1 text-xs leading-5 text-rose-700">发现 {deletionPlan.blockers.length} 项安全限制。处理这些依赖或任务后重新检查。</p><ul className="mt-3 space-y-3">{blockerGroups.map((group) => <li key={group.code}><p className="text-xs font-extrabold text-rose-800">{blockerLabel[group.code]} · {group.count}</p><ul className="mt-1 space-y-1 text-[11px] leading-5 text-rose-700">{group.sources.slice(0, 3).map((source) => <li className="break-all" key={source}>{source}</li>)}{group.sources.length > 3 ? <li>另有 {group.sources.length - 3} 项同类限制</li> : null}</ul></li>)}</ul></div> : <><p className="text-xs leading-5 text-slate-600">文件会移动到本地 <code>output/project-trash/</code> 并生成删除 receipt；共享 cache、模型、队列和其他项目引用的素材不会被移动。</p><label className="block text-xs font-bold text-slate-600">输入完整项目 ID 以确认<input className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 font-mono text-sm" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} name="delete-confirmation" autoComplete="off" spellCheck={false} /></label></>}
            </> : null}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3"><button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-extrabold hover:bg-slate-50" type="button" onClick={closeDeleteModal}>取消</button><button className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-extrabold enabled:hover:bg-rose-800" style={{ backgroundColor: deleteDisabled ? '#e2e8f0' : '#be123c', color: deleteDisabled ? '#475569' : '#ffffff' }} type="button" disabled={deleteDisabled} onClick={() => void deleteProject()}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />{deletionPlan?.canDelete ? '确认移到废纸篓' : '当前不可删除'}</button></div>
        </div>
      </div> : null}
    </main>
  );
}
