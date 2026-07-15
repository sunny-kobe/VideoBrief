'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  ExternalLink,
  Film,
  Play,
  ShieldCheck,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import { ShortVideoProject } from '@/src/shortVideoBrief';
import { WorkbenchAsset } from '@/src/workbench';
import { researchReviewSummary } from '@/src/researchReview';

interface WorkbenchSourceManagerProps {
  project: ShortVideoProject;
  assets: WorkbenchAsset[];
  sourceHrefs: Record<string, string>;
  activeSourceId: string;
  onSelect: (sourceId: string) => void;
  onReview: (sourceId: string) => void;
  onImport: (formData: FormData) => Promise<void>;
  onContinue: () => void;
}

const verificationLabel = {
  verified: '来源已确认',
  needs_check: '来源待确认',
  weak: '弱证据',
} as const;

const rightsLabel = {
  cleared: '可使用',
  review_required: '待复核',
  blocked: '禁止使用',
} as const;

const sourceTypeLabel = {
  official: '官方资料',
  github: '代码仓库',
  paper: '论文',
  demo: '演示资料',
  social: '社交内容',
  video: '视频',
  audio: '音频',
  image: '图片',
  markdown: 'Markdown 文档',
  text: '文本',
  news: '新闻资料',
} as const;

const processingLabel = {
  idle: '等待解析',
  pending: '等待解析',
  running: '正在解析',
  completed: '解析完成',
  failed: '解析失败',
} as const;

export default function WorkbenchSourceManager({
  project,
  assets,
  sourceHrefs,
  activeSourceId,
  onSelect,
  onReview,
  onImport,
  onContinue,
}: WorkbenchSourceManagerProps) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [expandedSourceId, setExpandedSourceId] = useState('');
  const expandedSource = project.sources.find((source) => source.id === expandedSourceId);
  const expandedHref = expandedSource ? sourceHrefs[expandedSource.id] ?? '' : '';
  const review = researchReviewSummary(project);

  useEffect(() => {
    if (!expandedSourceId) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpandedSourceId('');
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expandedSourceId]);

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImporting(true);
    setImportError('');
    try {
      await onImport(new FormData(event.currentTarget));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '素材导入失败');
      setImporting(false);
    }
  }

  const importForm = (
    <form className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-2" onSubmit={handleImport} autoComplete="off">
      <label className="block sm:col-span-2">
        <span className="text-xs font-bold text-slate-600">选择本地资料</span>
        <input className="mt-1.5 block w-full text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:font-bold file:text-white" name="file" type="file" accept="video/mp4,video/quicktime,video/webm,.m4v,audio/*,image/png,image/jpeg,image/webp,.md,.txt,text/plain,text/markdown" required />
        <span className="mt-1.5 block text-[11px] leading-relaxed text-slate-500">支持视频、音频、图片、Markdown 和文本。文件只保存在本机项目目录。</span>
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-600">素材名称</span>
        <input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" name="label" placeholder="例如：产品操作录屏…" />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-600">来源是否已经核对？</span>
        <select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" name="verificationStatus" defaultValue="needs_check">
          <option value="needs_check">还需要核对</option>
          <option value="verified">已经核对</option>
          <option value="weak">只能作为弱参考</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-600">是否有权用于这条视频？</span>
        <select className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" name="rightsStatus" defaultValue="cleared">
          <option value="cleared">已确认可以使用</option>
          <option value="review_required">还需要确认</option>
          <option value="blocked">不能使用</option>
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="text-xs font-bold text-slate-600">来源和使用权说明</span>
        <input className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" name="rightsNote" placeholder="例如：本人录制，仅用于本项目…" required />
      </label>
      <label className="flex items-start gap-2 text-xs font-bold leading-relaxed text-slate-700 sm:col-span-2">
        <input className="mt-0.5 h-4 w-4 accent-emerald-700" name="confirmRights" type="checkbox" value="yes" required />
        我已如实登记这份素材的来源和使用权，不把“公开可见”自动视为“可以使用”。
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="submit" disabled={importing}>
          <Upload aria-hidden="true" className="h-3.5 w-3.5" />
          {importing ? '导入中…' : '导入这份素材'}
        </button>
        {importError ? <p className="text-xs font-bold text-rose-700" role="alert">{importError}</p> : null}
      </div>
    </form>
  );

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Film aria-hidden="true" className="h-4 w-4 text-slate-600" />
        <div>
          <h2 className="text-sm font-extrabold text-slate-950">素材库与关键核验</h2>
          <p className="mt-1 text-xs text-slate-500">{project.sources.length} 份素材 · 从 {project.research.facts.length} 条提取结果中筛出 {review.keyFacts.length} 条关键主张</p>
        </div>
      </div>

      {!project.sources.length ? importForm : null}

      <div className="divide-y divide-slate-200">
        {project.sources.map((source, index) => {
          const usedBy = project.scenes.filter((scene) => scene.sourceId === source.id).length;
          const asset = assets.find(
            (item) => item.kind === '素材' && item.path.endsWith(source.assetPath),
          );
          const active = source.id === activeSourceId;
          const sourceKeyFacts = source.analysis.facts.filter((fact) => review.keyFactIds.has(fact.id));
          const reviewedFacts = sourceKeyFacts.filter((fact) => fact.reviewStatus !== 'proposed').length;
          const unresolvedQuestions = source.analysis.uncertainties.filter((item) => (
            review.requiredUncertaintyIds.has(item.id) && !item.resolution.trim()
          )).length;
          const sourceHref = sourceHrefs[source.id] ?? '';
          const isVisualSource = source.sourceType === 'image' || source.sourceType === 'video';
          return (
            <article key={source.id} className={`px-4 py-4 ${active ? 'bg-emerald-50/70' : 'bg-white'}`}>
              <div className={isVisualSource && sourceHref ? 'grid gap-4 sm:grid-cols-[210px_minmax(0,1fr)]' : ''}>
                {isVisualSource && sourceHref ? (
                  <button
                    className="group relative h-40 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:h-32"
                    type="button"
                    aria-label={`${source.sourceType === 'video' ? '播放' : '查看'} ${source.label}`}
                    onClick={() => {
                      onSelect(source.id);
                      setExpandedSourceId(source.id);
                    }}
                  >
                    {source.sourceType === 'image' ? (
                      <img className="h-full w-full object-contain" src={sourceHref} alt={source.label} loading="lazy" />
                    ) : (
                      <video className="h-full w-full object-contain" src={sourceHref} muted playsInline preload="metadata" />
                    )}
                    {source.sourceType === 'video' ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white shadow-sm">
                          <Play aria-hidden="true" className="h-4 w-4 fill-current" />
                        </span>
                      </span>
                    ) : null}
                  </button>
                ) : null}

                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <button
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-mono text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-white'}`}
                      type="button"
                      aria-label={`编辑素材 ${index + 1}`}
                      onClick={() => onSelect(source.id)}
                    >
                      {index + 1}
                    </button>
                    <button
                      className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      type="button"
                      onClick={() => onSelect(source.id)}
                    >
                      <span className="block truncate text-sm font-extrabold text-slate-950">{source.label}</span>
                      <span className="mt-1 block truncate text-[11px] text-slate-500">{source.originalFileName || '本地文件'}</span>
                    </button>
                    {source.originUrl ? (
                      <a
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        href={source.originUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="打开一手来源"
                        aria-label={`打开 ${source.label} 的一手来源`}
                      >
                        <ExternalLink aria-hidden="true" className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="font-bold text-slate-400">类型</dt>
                      <dd className="mt-1 font-bold text-slate-700">{sourceTypeLabel[source.sourceType]}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">用于片段</dt>
                      <dd className="mt-1 font-bold text-slate-700">{usedBy} 个</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">本地文件</dt>
                      <dd className={`mt-1 font-bold ${asset?.exists ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {asset?.exists ? asset.size : '文件缺失'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">状态</dt>
                      <dd className="mt-1 flex flex-wrap items-center gap-2 font-bold text-slate-700">
                        {source.verificationStatus === 'verified' ? (
                          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 text-amber-600" />
                        )}
                        {verificationLabel[source.verificationStatus]} · {rightsLabel[source.rightsStatus]} · {processingLabel[source.processing.status]}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex justify-end">
                    <button
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-emerald-700 bg-white px-2.5 text-xs font-extrabold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      type="button"
                      onClick={() => onReview(source.id)}
                    >
                      <BrainCircuit aria-hidden="true" className="h-3.5 w-3.5" />
                      {source.processing.status !== 'completed'
                        ? '解析并核验这份素材'
                        : sourceKeyFacts.length
                          ? `关键核验 ${reviewedFacts}/${sourceKeyFacts.length}${unresolvedQuestions ? ` · ${unresolvedQuestions} 个问题` : ''}`
                          : source.analysis.facts.length
                            ? '查看解析结果 · 无需逐条核验'
                            : '查看解析结果'}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {project.sources.length ? (
        <details className="border-t border-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-xs font-extrabold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">继续添加素材</summary>
          <div className="border-t border-slate-200">{importForm}</div>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-emerald-50 px-4 py-3">
        <p className="text-xs font-bold leading-relaxed text-emerald-900">
          {project.sources.length ? `只需确认 ${review.keyFacts.length} 条关键主张并处理 ${review.unresolvedUncertainties.length} 个高风险问题。` : '先导入至少一份自有或已确认可用的素材。'}
        </p>
        <button className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={!project.sources.length || importing} onClick={onContinue}>
          查看关键核验
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      {expandedSource && expandedHref && (expandedSource.sourceType === 'image' || expandedSource.sourceType === 'video') ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${expandedSource.label} 预览`}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setExpandedSourceId('');
          }}
        >
          <div className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-md border border-white/15 bg-slate-950 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">{expandedSource.label}</p>
                <p className="mt-1 text-[11px] text-slate-400">{expandedSource.sourceType === 'video' ? '视频素材' : '图片素材'}</p>
              </div>
              <button
                autoFocus
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/20 text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                type="button"
                title="关闭预览"
                aria-label="关闭预览"
                onClick={() => setExpandedSourceId('')}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black p-2 sm:p-4">
              {expandedSource.sourceType === 'video' ? (
                <video className="max-h-[80dvh] max-w-full" src={expandedHref} controls autoPlay playsInline preload="auto" />
              ) : (
                <img className="max-h-[80dvh] max-w-full object-contain" src={expandedHref} alt={expandedSource.label} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
