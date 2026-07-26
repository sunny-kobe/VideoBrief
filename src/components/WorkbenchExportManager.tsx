import {
  CheckCircle2,
  CircleAlert,
  Download,
  Eye,
  ExternalLink,
  FileAudio,
  FileJson,
  FileText,
  Film,
  Subtitles,
  Video,
  Image as ImageIcon,
  Package,
  RotateCcw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { RenderJobRecord, ShortVideoProject, WorkbenchRenderStatus } from '@/src/shortVideoBrief';
import { WorkbenchAsset, renderStatusTone } from '@/src/workbench';

interface WorkbenchExportManagerProps {
  projectId: string;
  project: ShortVideoProject;
  assets: WorkbenchAsset[];
  srtText: string;
  renderHref: string;
  renderStatus: WorkbenchRenderStatus;
  renderJob: RenderJobRecord | null;
  renderBlockedReason: string;
  rendering: boolean;
  onRender: () => void;
  onResume: () => void;
  onCancel: () => void;
}

const assetIcon = {
  素材: Film,
  音频: FileAudio,
  字幕: Subtitles,
  时间轴: FileJson,
  成片: Video,
  封面: ImageIcon,
  文案: FileText,
  清单: FileJson,
  项目: FileJson,
  导出包: Package,
  实验: FileText,
} satisfies Record<WorkbenchAsset['kind'], typeof Film>;

function QaRow({ passed, label, detail }: { passed: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-200 py-3 last:border-b-0">
      {passed ? (
        <CheckCircle2 aria-label="通过" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <CircleAlert aria-label="未通过" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      )}
      <div>
        <p className="text-xs font-extrabold text-slate-900">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{detail}</p>
      </div>
    </div>
  );
}

export default function WorkbenchExportManager({
  projectId,
  project,
  assets,
  srtText,
  renderHref,
  renderStatus,
  renderJob,
  renderBlockedReason,
  rendering,
  onRender,
  onResume,
  onCancel,
}: WorkbenchExportManagerProps) {
  const allSourcesVerified = project.sources.every((source) => source.verificationStatus === 'verified');
  const rightsCleared = project.sources.every((source) => source.rightsStatus === 'cleared');
  const enabledClips = project.scenes.filter((scene) => scene.enabled);
  const clipsValid = enabledClips.length > 0 && enabledClips.every(
      (scene) =>
        scene.sourceEnd > scene.sourceStart &&
        scene.title.trim().length > 0 &&
        scene.subtitle.trim().length > 0 &&
        project.sources.some((source) => source.id === scene.sourceId),
    );
  const tone = renderStatusTone[renderStatus.state];
  const exportReady = renderStatus.state === 'ready'
    && renderStatus.packageReady === true
    && assets.some((asset) => asset.kind === '导出包' && asset.exists);
  const userFacingAssets = assets.filter((asset) => (
    asset.exists && ['成片', '封面', '字幕', '文案', '清单', '导出包'].includes(asset.kind)
  ));
  const jobActive = renderJob?.state === 'queued' || renderJob?.state === 'running' || renderJob?.state === 'cancelling';
  const jobRecoverable = renderJob?.state === 'failed' || renderJob?.state === 'cancelled';
  const statusItems = [
    ['技术状态', {
      not_rendered: '尚未渲染', stale: '需要重新渲染', unverified: '等待技术验收', passed: '技术验收通过', failed: '技术验收失败',
    }[project.technical_status]],
    ['素材权利', { cleared: '已确认可使用', review_required: '需要复核', blocked: '禁止使用' }[project.rights_status]],
    ['发布状态', { 'draft-unpublished': '未发布草稿', 'ready-for-review': '等待发布确认', published: '已发布' }[project.publication_status]],
    ['市场验证', {
      none: '尚未开始',
      collecting: '正在收集反馈',
      validated: '验证成立',
      not_validated: '未验证成立',
      inconclusive: '证据不足',
    }[project.market_status]],
  ];
  const jobStateLabel = renderJob ? {
    queued: renderJob.queuePosition ? `排队中（第 ${renderJob.queuePosition} 位）` : '排队中', running: '处理中', cancelling: '取消中', cancelled: '已取消', awaiting_review: '等待内容验收', completed: '已完成', failed: '失败',
  }[renderJob.state] : '';
  const jobStageLabel = renderJob ? {
    saving: '保存项目', rendering: '生成配音、字幕和画面', proof: '技术验收', review: '语义与浏览器验收', packaging: '生成导出包', completed: '完成',
  }[renderJob.stage] : '';

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-950">导出与验收</h2>
          <p className="mt-1 text-xs text-slate-500">生产成片、字幕、配音与时间轴</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {jobActive ? (
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 text-xs font-extrabold text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60" type="button" disabled={renderJob?.state === 'cancelling'} onClick={onCancel}>
              <Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
              {renderJob?.state === 'cancelling' ? '正在取消' : renderJob?.state === 'queued' ? '取消排队' : '取消渲染'}
            </button>
          ) : renderStatus.state === 'ready' ? (
            <>
              <a className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={`/api/projects/${encodeURIComponent(projectId)}/review-package`} target="_blank" rel="noreferrer">
                <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                审片工作包
              </a>
              <a className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={`/short-video?project=${encodeURIComponent(projectId)}`}>
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                全屏预览
              </a>
              <a className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={renderHref || undefined} target="_blank" rel="noreferrer" aria-disabled={!renderHref}>
                <Download aria-hidden="true" className="h-3.5 w-3.5" />
                下载 MP4
              </a>
              <a className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${exportReady ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'pointer-events-none border-slate-200 bg-slate-100 text-slate-400'}`} href={exportReady ? `/api/projects/${encodeURIComponent(projectId)}/export` : undefined} aria-disabled={!exportReady}>
                <Package aria-hidden="true" className="h-3.5 w-3.5" />
                下载导出包
              </a>
            </>
          ) : (
            <button className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-400" type="button" title={renderBlockedReason || '保存项目、生成成片并执行技术验收'} disabled={Boolean(renderBlockedReason) || rendering} onClick={jobRecoverable ? onResume : onRender}>
              {jobRecoverable ? <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> : <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />}
              {rendering ? '渲染中…' : jobRecoverable ? '继续渲染' : '渲染并验收'}
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2">
        <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
          <div className={`rounded-md border px-3 py-3 ${tone.badge}`}>
            <p className="text-sm font-extrabold">{renderStatus.label}</p>
            <p className="mt-1 text-xs leading-relaxed">{renderStatus.message}</p>
          </div>
          {renderJob ? (
            <div className={`mt-2 border-l-2 px-3 py-2 text-xs ${renderJob.state === 'failed' ? 'border-rose-500 bg-rose-50 text-rose-800' : renderJob.state === 'cancelled' ? 'border-amber-500 bg-amber-50 text-amber-800' : renderJob.state === 'queued' || renderJob.state === 'running' || renderJob.state === 'cancelling' ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-emerald-500 bg-emerald-50 text-emerald-800'}`}>
              <p className="font-extrabold">渲染进度：{jobStateLabel} · {jobStageLabel}</p>
              {renderJob.error ? <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{renderJob.error}</pre> : null}
            </div>
          ) : null}
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-xs">
            {statusItems.map(([label, value]) => (
              <div className="min-w-0 bg-white p-3" key={label}>
                <dt className="truncate text-[10px] font-bold text-slate-400">{label}</dt>
                <dd className="mt-1 break-words font-extrabold text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-2">
            <QaRow passed={allSourcesVerified} label="来源事实已核验" detail={allSourcesVerified ? '所有来源均已核验。' : '仍有来源需要核验。'} />
            <QaRow passed={rightsCleared} label="素材使用权已确认" detail={rightsCleared ? '所有素材均已确认可使用。' : '仍有素材需要复核使用范围。'} />
            <QaRow passed={clipsValid} label="片段配置有效" detail={clipsValid ? '启用片段的素材、时间点、标题和字幕完整。' : '存在素材缺失、时间点错误或空文案。'} />
            <QaRow passed={renderStatus.state === 'ready'} label="成片通过技术验收" detail={renderStatus.message} />
          </div>
        </div>

        <div className="p-4">
          <h3 className="text-xs font-extrabold text-slate-950">可下载产物</h3>
          {userFacingAssets.length ? <div className="mt-2 divide-y divide-slate-200">
            {userFacingAssets.map((asset) => {
              const Icon = assetIcon[asset.kind];
              const content = (
                <>
                  <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-bold text-slate-900">{asset.label}</span>
                      <span className={`shrink-0 text-[10px] font-bold ${asset.exists ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {asset.exists ? asset.size : '文件缺失'}
                      </span>
                    </span>
                  </span>
                </>
              );
              return asset.href ? (
                <a key={`${asset.kind}-${asset.path}`} className="flex items-start gap-3 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={asset.href} target="_blank" rel="noreferrer">
                  {content}
                </a>
              ) : (
                <div key={`${asset.kind}-${asset.path}`} className="flex items-start gap-3 py-3">{content}</div>
              );
            })}
          </div> : (
            <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-extrabold text-slate-800">渲染完成后生成下载文件</p>
              <p className="mt-1 text-xs text-slate-500">包括 MP4、字幕、封面、来源清单和完整导出包。</p>
            </div>
          )}
        </div>
      </div>

      <details className="border-t border-slate-200">
        <summary className="cursor-pointer px-4 py-3 text-xs font-extrabold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
          技术信息与全部文件
        </summary>
        <div className="divide-y divide-slate-200 border-t border-slate-200 px-4">
          {assets.map((asset) => (
            <div className="flex items-start justify-between gap-3 py-3" key={`technical-${asset.kind}-${asset.path}`}>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800">{asset.label}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{asset.path}</p>
              </div>
              <span className={`shrink-0 text-[10px] font-bold ${asset.exists ? 'text-emerald-700' : 'text-slate-400'}`}>
                {asset.exists ? asset.size : '尚未生成'}
              </span>
            </div>
          ))}
        </div>
      </details>

      <details className="border-t border-slate-200">
        <summary className="cursor-pointer px-4 py-3 text-xs font-extrabold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
          查看当前 SRT
        </summary>
        <pre className="max-h-80 overflow-auto border-t border-slate-200 bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-100">
          {srtText || '尚未生成 SRT。'}
        </pre>
      </details>
    </section>
  );
}
