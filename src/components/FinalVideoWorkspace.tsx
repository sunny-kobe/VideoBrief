'use client';

import {
  Archive,
  Download,
  ExternalLink,
  Film,
  LoaderCircle,
  WandSparkles,
} from 'lucide-react';
import { useState } from 'react';
import type {
  RenderJobRecord,
  ShortVideoProject,
  WorkbenchRenderStatus,
} from '@/src/shortVideoBrief';

interface FinalVideoWorkspaceProps {
  projectId: string;
  project: ShortVideoProject;
  renderHref: string;
  remotionHref: string;
  renderStatus: WorkbenchRenderStatus;
  renderJob: RenderJobRecord | null;
}

const statusLabel = {
  technical: {
    not_rendered: '尚未生成', stale: '需要重新生成', unverified: '等待技术验收', passed: '技术验收通过', failed: '技术验收失败',
  },
  rights: { cleared: '素材可使用', review_required: '素材待复核', blocked: '素材禁止使用' },
  publication: { 'draft-unpublished': '未发布', 'ready-for-review': '等待发布确认', published: '已发布' },
  market: { none: '未验证', collecting: '收集反馈中', validated: '已有验证' },
} as const;

export default function FinalVideoWorkspace({
  projectId,
  project,
  renderHref,
  remotionHref,
  renderStatus,
  renderJob,
}: FinalVideoWorkspaceProps) {
  const ready = renderStatus.state === 'ready' && Boolean(renderHref);
  const [preview, setPreview] = useState<'ffmpeg' | 'remotion'>(remotionHref ? 'remotion' : 'ffmpeg');
  const [renderingRemotion, setRenderingRemotion] = useState(false);
  const [remotionError, setRemotionError] = useState('');
  const activeHref = preview === 'remotion' && remotionHref ? remotionHref : renderHref;

  async function renderRemotionCandidate() {
    setRenderingRemotion(true);
    setRemotionError('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/remotion`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Remotion 候选生成失败');
      window.location.reload();
    } catch (error) {
      setRemotionError(error instanceof Error ? error.message : 'Remotion 候选生成失败');
      setRenderingRemotion(false);
    }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-950">当前成片</h2>
          <p className="mt-1 text-xs text-slate-500">{renderStatus.label}</p>
        </div>
        {ready ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {remotionHref ? (
              <div className="inline-flex h-9 rounded-md border border-slate-300 bg-slate-100 p-0.5" aria-label="选择审片版本">
                <button className={`rounded px-2.5 text-[11px] font-extrabold ${preview === 'ffmpeg' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`} type="button" onClick={() => setPreview('ffmpeg')}>正式成片</button>
                <button className={`rounded px-2.5 text-[11px] font-extrabold ${preview === 'remotion' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`} type="button" onClick={() => setPreview('remotion')}>Remotion 候选</button>
              </div>
            ) : (
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50" type="button" disabled={renderingRemotion} onClick={renderRemotionCandidate}>
                {renderingRemotion ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <WandSparkles aria-hidden="true" className="h-4 w-4" />}
                {renderingRemotion ? '生成候选中' : '生成 Gate B 候选'}
              </button>
            )}
            <a className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={`/short-video?project=${encodeURIComponent(projectId)}`} title="全屏预览" aria-label="全屏预览"><ExternalLink aria-hidden="true" className="h-4 w-4" /></a>
            <a className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={activeHref} download title="下载当前 MP4" aria-label="下载当前 MP4"><Download aria-hidden="true" className="h-4 w-4" /></a>
            {renderStatus.packageReady ? (
              <a className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={`/api/projects/${encodeURIComponent(projectId)}/export`} title="下载完整导出包" aria-label="下载完整导出包"><Archive aria-hidden="true" className="h-4 w-4" /></a>
            ) : (
              <span className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-400" title={renderStatus.packageMessage || '导出包尚未生成'} aria-label="导出包尚未生成"><Archive aria-hidden="true" className="h-4 w-4" /></span>
            )}
          </div>
        ) : null}
      </div>

      {remotionError ? <p className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800" role="alert">{remotionError}</p> : null}

      <div className="flex min-h-[420px] items-center justify-center bg-slate-950 p-3 lg:min-h-[calc(100dvh-220px)]">
        {ready ? (
          <video key={activeHref} className="max-h-[calc(100dvh-250px)] w-auto max-w-full bg-black" src={activeHref} controls playsInline preload="metadata" />
        ) : (
          <div className="max-w-sm px-6 text-center text-white">
            <Film aria-hidden="true" className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-4 text-base font-extrabold">{renderStatus.label}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{renderJob?.error || renderStatus.message}</p>
          </div>
        )}
      </div>

      <details>
        <summary className="cursor-pointer px-4 py-3 text-xs font-extrabold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">项目状态</summary>
        <dl className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 text-xs sm:grid-cols-4">
          <div className="bg-white p-3"><dt className="text-[10px] font-bold text-slate-400">技术</dt><dd className="mt-1 font-extrabold">{statusLabel.technical[project.technical_status]}</dd></div>
          <div className="bg-white p-3"><dt className="text-[10px] font-bold text-slate-400">素材</dt><dd className="mt-1 font-extrabold">{statusLabel.rights[project.rights_status]}</dd></div>
          <div className="bg-white p-3"><dt className="text-[10px] font-bold text-slate-400">发布</dt><dd className="mt-1 font-extrabold">{statusLabel.publication[project.publication_status]}</dd></div>
          <div className="bg-white p-3"><dt className="text-[10px] font-bold text-slate-400">市场</dt><dd className="mt-1 font-extrabold">{statusLabel.market[project.market_status]}</dd></div>
        </dl>
        {renderJob ? <p className="border-t border-slate-200 px-4 py-3 text-xs leading-relaxed text-slate-600">最近任务：{renderJob.state} · {renderJob.stage}{renderJob.error ? ` · ${renderJob.error}` : ''}</p> : null}
      </details>
    </section>
  );
}
