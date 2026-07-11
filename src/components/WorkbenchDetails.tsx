import { Film, SlidersHorizontal, Subtitles, Video } from 'lucide-react';
import VoicePreviewPrototype from '@/src/components/VoicePreviewPrototype';
import {
  ProductionScene,
  ShortVideoEditorial,
  ShortVideoProject,
  ShortVideoProjectScene,
  ShortVideoSource,
} from '@/src/shortVideoBrief';
import { WorkbenchView } from '@/src/workbench';

interface WorkbenchDetailsProps {
  view: WorkbenchView;
  project: ShortVideoProject;
  activeScene?: ShortVideoProjectScene;
  activeSceneIndex: number;
  activeSource?: ShortVideoSource;
  renderedScene?: ProductionScene;
  onUpdateScene: (patch: Partial<ShortVideoProjectScene>) => void;
  onUpdateEditorial: (patch: Partial<ShortVideoEditorial>) => void;
  onUpdateSource: (sourceId: string, patch: Partial<ShortVideoSource>) => void;
}

const fieldClass =
  'mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-bold text-slate-600">{children}</span>;
}

export default function WorkbenchDetails({
  view,
  project,
  activeScene,
  activeSceneIndex,
  activeSource,
  renderedScene,
  onUpdateScene,
  onUpdateEditorial,
  onUpdateSource,
}: WorkbenchDetailsProps) {
  if (view === 'subtitles') {
    return (
      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Subtitles aria-hidden="true" className="h-4 w-4 text-slate-600" />
          <h2 className="text-sm font-extrabold text-slate-950">当前字幕</h2>
        </div>
        <div className="p-4">
          {activeScene ? (
            <>
              <p className="text-xs font-bold text-emerald-700">片段 {activeSceneIndex + 1}</p>
              <p className="mt-1 text-sm font-extrabold text-slate-950">{activeScene.title || '未命名片段'}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{activeScene.subtitle || '暂无字幕文案'}</p>
              <div className="mt-4">
                <VoicePreviewPrototype sceneId={activeScene.id} text={activeScene.subtitle} />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">请先选择一条字幕。</p>
          )}
        </div>
      </section>
    );
  }

  if (view === 'sources') {
    return (
      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Film aria-hidden="true" className="h-4 w-4 text-slate-600" />
          <h2 className="text-sm font-extrabold text-slate-950">素材详情</h2>
        </div>
        <div className="space-y-4 p-4">
          {activeSource ? (
            <>
              <label className="block">
                <FieldLabel>素材名称</FieldLabel>
                <input
                  className={fieldClass}
                  value={activeSource.label}
                  onChange={(event) => onUpdateSource(activeSource.id, { label: event.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <FieldLabel>核验状态</FieldLabel>
                  <select
                    className={fieldClass}
                    value={activeSource.verificationStatus}
                    onChange={(event) => onUpdateSource(activeSource.id, { verificationStatus: event.target.value as ShortVideoSource['verificationStatus'] })}
                  >
                    <option value="verified">已核验</option>
                    <option value="needs_check">待核验</option>
                    <option value="weak">弱证据</option>
                  </select>
                </label>
                <label className="block">
                  <FieldLabel>版权状态</FieldLabel>
                  <select
                    className={fieldClass}
                    value={activeSource.rightsStatus}
                    onChange={(event) => onUpdateSource(activeSource.id, { rightsStatus: event.target.value as ShortVideoSource['rightsStatus'] })}
                  >
                    <option value="cleared">已确认</option>
                    <option value="review_required">待复核</option>
                    <option value="blocked">禁止使用</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <FieldLabel>版权与使用说明</FieldLabel>
                <textarea
                  className={`${fieldClass} min-h-24 resize-y leading-relaxed`}
                  value={activeSource.rightsNote}
                  onChange={(event) => onUpdateSource(activeSource.id, { rightsNote: event.target.value })}
                />
              </label>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-xs font-extrabold text-slate-950">内容依据</h3>
                <div className="mt-3 space-y-4">
                  <label className="block">
                    <FieldLabel>可核验事实</FieldLabel>
                    <textarea className={`${fieldClass} min-h-20 resize-y`} value={project.editorial.claim} onChange={(event) => onUpdateEditorial({ claim: event.target.value })} />
                  </label>
                  <label className="block">
                    <FieldLabel>为什么重要</FieldLabel>
                    <textarea className={`${fieldClass} min-h-20 resize-y`} value={project.editorial.whyItMatters} onChange={(event) => onUpdateEditorial({ whyItMatters: event.target.value })} />
                  </label>
                  <label className="block">
                    <FieldLabel>中文语境判断</FieldLabel>
                    <textarea className={`${fieldClass} min-h-20 resize-y`} value={project.editorial.chinaContext} onChange={(event) => onUpdateEditorial({ chinaContext: event.target.value })} />
                  </label>
                  <label className="block">
                    <FieldLabel>风险与不确定点</FieldLabel>
                    <textarea className={`${fieldClass} min-h-20 resize-y`} value={project.editorial.riskNote} onChange={(event) => onUpdateEditorial({ riskNote: event.target.value })} />
                  </label>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">请先选择一个素材。</p>
          )}
        </div>
      </section>
    );
  }

  if (view === 'export') {
    return (
      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Video aria-hidden="true" className="h-4 w-4 text-slate-600" />
          <h2 className="text-sm font-extrabold text-slate-950">成片规格</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 p-4 text-xs">
          <div>
            <dt className="font-bold text-slate-400">画布</dt>
            <dd className="mt-1 font-mono font-extrabold text-slate-900">{project.render.width} x {project.render.height}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">帧率</dt>
            <dd className="mt-1 font-mono font-extrabold text-slate-900">{project.render.fps} fps</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">旁白音色</dt>
            <dd className="mt-1 font-bold text-slate-900">{project.render.voice}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-400">语速</dt>
            <dd className="mt-1 font-mono font-extrabold text-slate-900">{project.render.rate}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section id="clip-editor" className="scroll-mt-[310px] rounded-md border border-slate-200 bg-white md:scroll-mt-0">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-slate-600" />
        <h2 className="text-sm font-extrabold text-slate-950">片段编辑</h2>
      </div>
      <div className="space-y-4 p-4">
        {activeScene ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-700">片段 {activeSceneIndex + 1} / {project.scenes.length}</p>
                <p className="mt-1 truncate text-sm font-extrabold text-slate-950">{activeScene.title || '未命名片段'}</p>
              </div>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
                <input className="h-4 w-4 accent-emerald-700" type="checkbox" checked={activeScene.enabled} onChange={(event) => onUpdateScene({ enabled: event.target.checked })} />
                参与成片
              </label>
            </div>
            <label className="block">
              <FieldLabel>画面素材</FieldLabel>
              <select className={fieldClass} value={activeScene.sourceId} onChange={(event) => onUpdateScene({ sourceId: event.target.value })}>
                {project.sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <FieldLabel>素材入点（秒）</FieldLabel>
                <input className={fieldClass} type="number" min="0" step="0.1" value={activeScene.sourceStart} onChange={(event) => onUpdateScene({ sourceStart: Number(event.target.value) })} />
              </label>
              <label className="block">
                <FieldLabel>素材出点（秒）</FieldLabel>
                <input className={fieldClass} type="number" min="0.5" step="0.1" value={activeScene.sourceEnd} onChange={(event) => onUpdateScene({ sourceEnd: Number(event.target.value) })} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 border-y border-slate-200 py-3 text-xs">
              <div>
                <p className="font-bold text-slate-400">素材时长</p>
                <p className="mt-1 font-mono font-extrabold text-slate-900">{Math.max(0, activeScene.sourceEnd - activeScene.sourceStart).toFixed(2)}s</p>
              </div>
              <div>
                <p className="font-bold text-slate-400">当前渲染时长</p>
                <p className="mt-1 font-mono font-extrabold text-slate-900">{(renderedScene?.duration ?? 0).toFixed(2)}s</p>
              </div>
            </div>
            <label className="block">
              <FieldLabel>画面标签</FieldLabel>
              <input className={fieldClass} value={activeScene.eyebrow} onChange={(event) => onUpdateScene({ eyebrow: event.target.value })} />
            </label>
            <label className="block">
              <FieldLabel>片段标题</FieldLabel>
              <input className={fieldClass} value={activeScene.title} onChange={(event) => onUpdateScene({ title: event.target.value })} />
            </label>
            <label className="block">
              <FieldLabel>字幕文案（同时用于旁白）</FieldLabel>
              <textarea className={`${fieldClass} min-h-28 resize-y leading-relaxed`} value={activeScene.subtitle} onChange={(event) => onUpdateScene({ subtitle: event.target.value })} />
            </label>
          </>
        ) : (
          <p className="text-sm text-slate-500">请先新增或选择一个片段。</p>
        )}
      </div>
    </section>
  );
}
