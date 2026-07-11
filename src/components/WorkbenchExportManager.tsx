import {
  CheckCircle2,
  CircleAlert,
  Download,
  ExternalLink,
  FileAudio,
  FileJson,
  FileText,
  Film,
  Subtitles,
  Video,
} from 'lucide-react';
import { ShortVideoProject, WorkbenchRenderStatus } from '@/src/shortVideoBrief';
import { WorkbenchAsset, renderStatusTone } from '@/src/workbench';

interface WorkbenchExportManagerProps {
  project: ShortVideoProject;
  assets: WorkbenchAsset[];
  srtText: string;
  renderHref: string;
  renderStatus: WorkbenchRenderStatus;
}

const assetIcon = {
  素材: Film,
  音频: FileAudio,
  字幕: Subtitles,
  时间轴: FileJson,
  成片: Video,
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
  project,
  assets,
  srtText,
  renderHref,
  renderStatus,
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

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-950">导出与验收</h2>
          <p className="mt-1 text-xs text-slate-500">生产成片、字幕、配音与时间轴</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            href="/short-video"
          >
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            全屏预览
          </a>
          <a
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${renderHref ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'pointer-events-none border-slate-200 bg-slate-100 text-slate-400'}`}
            href={renderHref || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!renderHref}
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            下载 MP4
          </a>
        </div>
      </div>

      <div className="grid lg:grid-cols-2">
        <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
          <div className={`rounded-md border px-3 py-3 ${tone.badge}`}>
            <p className="text-sm font-extrabold">{renderStatus.label}</p>
            <p className="mt-1 text-xs leading-relaxed">{renderStatus.message}</p>
          </div>
          <div className="mt-2">
            <QaRow passed={allSourcesVerified} label="来源事实已核验" detail={allSourcesVerified ? '所有来源均已核验。' : '仍有来源需要核验。'} />
            <QaRow passed={rightsCleared} label="素材使用权已确认" detail={rightsCleared ? '所有素材均已确认可使用。' : '仍有素材需要复核使用范围。'} />
            <QaRow passed={clipsValid} label="片段配置有效" detail={clipsValid ? '启用片段的素材、时间点、标题和字幕完整。' : '存在素材缺失、时间点错误或空文案。'} />
            <QaRow passed={renderStatus.state === 'ready'} label="成片通过技术验收" detail={renderStatus.message} />
          </div>
        </div>

        <div className="p-4">
          <h3 className="text-xs font-extrabold text-slate-950">项目产物</h3>
          <div className="mt-2 divide-y divide-slate-200">
            {assets.map((asset) => {
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
                    <span className="mt-1 block truncate font-mono text-[10px] text-slate-500">{asset.path}</span>
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
          </div>
        </div>
      </div>

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
