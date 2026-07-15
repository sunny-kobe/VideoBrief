import { ExternalLink, Film, Play, Video } from 'lucide-react';
import { RefObject } from 'react';
import {
  ProductionScene,
  ShortVideoProjectScene,
  ShortVideoSource,
} from '@/src/shortVideoBrief';

interface WorkbenchPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  previewMode: 'render' | 'source';
  renderHref: string;
  sourceHref: string;
  source?: ShortVideoSource;
  scene?: ShortVideoProjectScene;
  renderedScene?: ProductionScene;
  sourceOnly?: boolean;
  onPreviewModeChange: (mode: 'render' | 'source') => void;
  onPlayScene: () => void;
}

export default function WorkbenchPreview({
  videoRef,
  previewMode,
  renderHref,
  sourceHref,
  source,
  scene,
  renderedScene,
  sourceOnly = false,
  onPreviewModeChange,
  onPlayScene,
}: WorkbenchPreviewProps) {
  const videoHref = previewMode === 'render' ? renderHref : sourceHref;
  const sourceType = source?.sourceType;
  const canPlayVideo = previewMode === 'render' || sourceType === 'video';
  const previewTitle = previewMode === 'source' ? source?.label ?? '未选择素材' : scene?.title ?? '未选择片段';
  const sourceTypeLabel = sourceType === 'video' ? '视频素材'
    : sourceType === 'image' ? '图片素材'
      : sourceType === 'audio' ? '音频素材'
        : sourceType === 'markdown' ? 'Markdown 文档'
          : sourceType === 'text' ? '文本资料'
            : '项目素材';
  const previewMeta = previewMode === 'source'
    ? source ? sourceTypeLabel : '未选择素材'
    : `${(renderedScene?.start ?? 0).toFixed(2)}s - ${(renderedScene?.end ?? 0).toFixed(2)}s`;

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-white">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Video aria-hidden="true" className="h-4 w-4 text-emerald-300" />
          <h2 className="text-sm font-extrabold">{sourceOnly ? '原始素材' : '画面预览'}</h2>
        </div>
        {!sourceOnly ? <div className="inline-flex rounded-md border border-white/20 bg-black/30 p-0.5" aria-label="预览模式">
          <button
            className={`rounded px-2.5 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${previewMode === 'render' ? 'bg-white text-slate-950' : 'text-slate-300 hover:text-white'}`}
            type="button"
            onClick={() => onPreviewModeChange('render')}
          >
            成片
          </button>
          <button
            className={`rounded px-2.5 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${previewMode === 'source' ? 'bg-white text-slate-950' : 'text-slate-300 hover:text-white'}`}
            type="button"
            onClick={() => onPreviewModeChange('source')}
          >
            素材
          </button>
        </div> : null}
      </div>

      <div className="mx-auto w-full max-w-[430px] p-3 sm:p-4">
        <div className="h-[180px] overflow-hidden rounded-md border border-white/10 bg-black sm:h-[220px] md:h-[240px]">
          {previewMode === 'source' && sourceType === 'image' && sourceHref ? (
            <img className="h-full w-full object-contain" src={sourceHref} alt={source?.label ?? '项目图片素材'} width={1280} height={720} />
          ) : previewMode === 'source' && sourceType === 'audio' && sourceHref ? (
            <div className="flex h-full items-center px-4">
              <audio className="w-full" src={sourceHref} controls preload="metadata" />
            </div>
          ) : previewMode === 'source' && (sourceType === 'markdown' || sourceType === 'text') ? (
            <pre className="h-full overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-slate-200">
              {source?.analysis.extractedText || '资料尚未处理。'}
            </pre>
          ) : videoHref ? (
            <video
              ref={videoRef}
              key={`${previewMode}-${videoHref}`}
              className="h-full w-full bg-black object-contain"
              src={videoHref}
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-400">
              {sourceOnly ? '选择一份素材后在这里核对原始内容。' : '当前场景没有可预览的本地画面。'}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{previewTitle}</p>
            <p className="mt-1 font-mono text-[11px] text-slate-400">
              {previewMeta}
            </p>
          </div>
          {canPlayVideo ? (
            <button
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-emerald-400 px-3 text-xs font-extrabold text-slate-950 hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-200"
              type="button"
              disabled={!videoHref}
              onClick={onPlayScene}
            >
              <Play aria-hidden="true" className="h-3.5 w-3.5" />
              {previewMode === 'source' ? '播放素材' : '播放本段'}
            </button>
          ) : null}
        </div>

        <div className="mt-3 hidden items-center justify-between gap-3 border-t border-white/10 pt-3 md:flex">
          <div className="flex min-w-0 items-center gap-2">
            <Film aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
            <p className="truncate text-xs font-bold text-slate-300">{source?.label ?? '素材缺失'}</p>
          </div>
          {source?.originUrl ? (
            <a
              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-300 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              href={source.originUrl}
              target="_blank"
              rel="noreferrer"
            >
              一手来源
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
