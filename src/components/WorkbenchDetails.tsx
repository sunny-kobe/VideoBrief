import { BrainCircuit, CheckCircle2, Film, Monitor, SlidersHorizontal, Smartphone, Square, Subtitles, Video, WandSparkles } from 'lucide-react';
import VoicePreviewPrototype from '@/src/components/VoicePreviewPrototype';
import {
  ProductionScene,
  PlatformCopy,
  ShortVideoProject,
  ShortVideoProjectScene,
  ShortVideoSource,
} from '@/src/shortVideoBrief';
import { WorkbenchView } from '@/src/workbench';
import { researchReviewSummary } from '@/src/researchReview';

interface WorkbenchDetailsProps {
  view: WorkbenchView;
  project: ShortVideoProject;
  activeScene?: ShortVideoProjectScene;
  activeSceneIndex: number;
  activeSource?: ShortVideoSource;
  renderedScene?: ProductionScene;
  onUpdateScene: (patch: Partial<ShortVideoProjectScene>) => void;
  onConfirmVisual: () => void;
  onUpdateSource: (sourceId: string, patch: Partial<ShortVideoSource>) => void;
  onUpdatePlatformCopy: (patch: Partial<PlatformCopy>) => void;
  onUpdateAspectRatio: (aspectRatio: ShortVideoProject['brief']['aspectRatio']) => void;
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
  onConfirmVisual,
  onUpdateSource,
  onUpdatePlatformCopy,
  onUpdateAspectRatio,
}: WorkbenchDetailsProps) {
  const visualConfirmed = activeScene?.selectionStatus === 'codex_reviewed'
    || activeScene?.selectionStatus === 'user_approved';
  if (view === 'research') {
    const completed = project.sources.filter((source) => source.processing.status === 'completed').length;
    const failed = project.sources.filter((source) => source.processing.status === 'failed').length;
    const review = researchReviewSummary(project);
    const reviewedFacts = review.keyFacts.length - review.pendingFacts.length;
    return (
      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <BrainCircuit aria-hidden="true" className="h-4 w-4 text-slate-600" />
          <h2 className="text-sm font-extrabold text-slate-950">项目核验进度</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 p-4 text-xs">
          <div><dt className="font-bold text-slate-400">处理完成</dt><dd className="mt-1 font-mono font-extrabold">{completed} / {project.sources.length}</dd></div>
          <div><dt className="font-bold text-slate-400">失败</dt><dd className="mt-1 font-mono font-extrabold">{failed}</dd></div>
          <div><dt className="font-bold text-slate-400">关键主张</dt><dd className="mt-1 font-mono font-extrabold">{reviewedFacts} / {review.keyFacts.length}</dd></div>
          <div><dt className="font-bold text-slate-400">高风险问题</dt><dd className="mt-1 font-mono font-extrabold">{review.unresolvedUncertainties.length} 待处理</dd></div>
          <div className="col-span-2"><dt className="font-bold text-slate-400">完整提取</dt><dd className="mt-1 font-mono font-extrabold">{project.research.facts.length} 条事实 · {project.research.uncertainties.length} 条疑问</dd></div>
        </dl>
      </section>
    );
  }

  if (view === 'planning') {
    return (
      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <WandSparkles aria-hidden="true" className="h-4 w-4 text-slate-600" />
          <h2 className="text-sm font-extrabold text-slate-950">AI 运行详情</h2>
        </div>
        <div className="divide-y divide-slate-200">
          {project.ai.calls.slice().reverse().slice(0, 8).map((call) => (
            <div className="p-3" key={call.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-slate-900">{call.purpose.startsWith('source-analysis') ? '资料解析' : call.purpose.startsWith('narrative-planning') ? '脚本生成' : call.purpose.startsWith('candidate-ranking') ? '候选画面推荐' : '生产文案生成'}</p>
                <span className={`text-[10px] font-bold ${call.status === 'completed' ? 'text-emerald-700' : 'text-rose-700'}`}>{call.status === 'completed' ? '完成' : '失败'}</span>
              </div>
              <details className="mt-1 text-[10px] text-slate-500"><summary className="cursor-pointer">技术信息</summary><p className="mt-1 break-all font-mono">{call.model} · cache={String(call.cacheHit)}</p></details>
              {call.error ? <p className="mt-2 text-xs leading-relaxed text-rose-700">{call.error}</p> : null}
            </div>
          ))}
          {!project.ai.calls.length ? <p className="p-4 text-xs text-slate-500">尚无 AI 调用记录。</p> : null}
        </div>
      </section>
    );
  }

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
                <VoicePreviewPrototype
                  projectId={project.id}
                  sceneId={activeScene.id}
                  text={activeScene.narration || activeScene.subtitle}
                  voice={project.render.voice}
                />
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
                  <FieldLabel>素材用途</FieldLabel>
                  <select
                    className={fieldClass}
                    value={activeSource.materialRole}
                    onChange={(event) => onUpdateSource(activeSource.id, { materialRole: event.target.value as ShortVideoSource['materialRole'] })}
                  >
                    <option value="official_demo">官方/本项目演示</option>
                    <option value="broll">通用 B-roll</option>
                    <option value="evidence">证据画面</option>
                    <option value="research">研究资料</option>
                  </select>
                </label>
                <label className="block">
                  <FieldLabel>来源可信度</FieldLabel>
                  <select
                    className={fieldClass}
                    value={activeSource.verificationStatus}
                    onChange={(event) => onUpdateSource(activeSource.id, { verificationStatus: event.target.value as ShortVideoSource['verificationStatus'] })}
                  >
                    <option value="verified">来源已确认</option>
                    <option value="needs_check">来源待确认</option>
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
        <div className="border-b border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-500">输出画幅</p>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1" aria-label="选择输出画幅">
            {([
              { value: '16:9', label: '横屏', Icon: Monitor },
              { value: '9:16', label: '竖屏', Icon: Smartphone },
              { value: '1:1', label: '方形', Icon: Square },
            ] as const).map(({ value, label, Icon }) => (
              <button
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded text-xs font-extrabold ${project.brief.aspectRatio === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                key={value}
                type="button"
                onClick={() => onUpdateAspectRatio(value)}
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            {project.brief.aspectRatio === '16:9'
              ? '适合网页演示、B站、视频号和横屏内容。'
              : project.brief.aspectRatio === '9:16'
                ? '横屏素材完整放在画布中央，上下区域承载标题和字幕。'
                : '横屏素材完整居中，适合信息流复用。'}
          </p>
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
          <div>
            <dt className="font-bold text-slate-400">素材适配</dt>
            <dd className="mt-1 font-extrabold text-slate-900">{project.render.mediaFit === 'contain' ? '完整展示' : '裁切填满'}</dd>
          </div>
        </dl>
        <div className="space-y-4 border-t border-slate-200 p-4">
          <h3 className="text-xs font-extrabold text-slate-950">可选发布信息</h3>
          <label className="block">
            <FieldLabel>封面标题</FieldLabel>
            <input className={fieldClass} value={project.platformCopy.coverTitle} onChange={(event) => onUpdatePlatformCopy({ coverTitle: event.target.value })} />
          </label>
          <label className="block">
            <FieldLabel>平台标题</FieldLabel>
            <input className={fieldClass} value={project.platformCopy.title} onChange={(event) => onUpdatePlatformCopy({ title: event.target.value })} />
          </label>
          <label className="block">
            <FieldLabel>平台简介</FieldLabel>
            <textarea className={`${fieldClass} min-h-24 resize-y leading-relaxed`} value={project.platformCopy.description} onChange={(event) => onUpdatePlatformCopy({ description: event.target.value })} />
          </label>
          <label className="block">
            <FieldLabel>标签（逗号分隔）</FieldLabel>
            <input className={fieldClass} value={project.platformCopy.hashtags.join(', ')} onChange={(event) => onUpdatePlatformCopy({ hashtags: event.target.value.split(/[,，]/).map((value) => value.trim()).filter(Boolean) })} />
          </label>
        </div>
        <details className="border-t border-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-xs font-extrabold text-slate-700">制作记录</summary>
          <dl className="grid grid-cols-2 gap-4 border-t border-slate-200 p-4 text-xs">
            <div><dt className="font-bold text-slate-400">素材导入 / 保存</dt><dd className="mt-1 font-mono font-extrabold text-slate-900">{project.production.sourceImportCount} / {project.production.manualSaveCount}</dd></div>
            <div><dt className="font-bold text-slate-400">渲染尝试 / 失败</dt><dd className="mt-1 font-mono font-extrabold text-slate-900">{project.production.renderAttemptCount} / {project.production.renderFailureCount}</dd></div>
            <div><dt className="font-bold text-slate-400">复用素材</dt><dd className="mt-1 font-mono font-extrabold text-slate-900">{project.production.reusedSourceIds.length}</dd></div>
            <div><dt className="font-bold text-slate-400">研究审核</dt><dd className="mt-1 font-extrabold text-slate-900">{project.production.researchReviewedAt ? '已完成' : '尚未完成'}</dd></div>
            <div><dt className="font-bold text-slate-400">首次技术验收</dt><dd className="mt-1 font-extrabold text-slate-900">{project.production.firstRenderCompletedAt ? '已通过' : '尚未通过'}</dd></div>
          </dl>
        </details>
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
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700">
              <span>显示顶部编辑文案</span>
              <input
                className="h-4 w-4 accent-emerald-700"
                type="checkbox"
                checked={activeScene.showEditorialOverlay !== false}
                onChange={(event) => onUpdateScene({ showEditorialOverlay: event.target.checked })}
              />
            </label>
            <label className="block">
              <FieldLabel>画面素材</FieldLabel>
              <select className={fieldClass} value={activeScene.sourceId} onChange={(event) => onUpdateScene({ sourceId: event.target.value })}>
                {project.sources.filter((source) => source.sourceType === 'video' || source.sourceType === 'image').map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
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
              <FieldLabel>字幕文案</FieldLabel>
              <textarea className={`${fieldClass} min-h-28 resize-y leading-relaxed`} value={activeScene.subtitle} onChange={(event) => onUpdateScene({ subtitle: event.target.value })} />
            </label>
            <label className="block">
              <FieldLabel>旁白文案</FieldLabel>
              <textarea className={`${fieldClass} min-h-28 resize-y leading-relaxed`} value={activeScene.narration} onChange={(event) => onUpdateScene({ narration: event.target.value })} />
            </label>
            <label className="block">
              <FieldLabel>画面需求</FieldLabel>
              <textarea className={`${fieldClass} min-h-20 resize-y leading-relaxed`} value={activeScene.visualRequirement} onChange={(event) => onUpdateScene({ visualRequirement: event.target.value })} />
            </label>
            <div className={`rounded-md border p-3 ${visualConfirmed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-start gap-2">
                <CheckCircle2 aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${visualConfirmed ? 'text-emerald-700' : 'text-amber-700'}`} />
                <div>
                  <p className="text-xs font-extrabold text-slate-900">{visualConfirmed ? '当前画面已确认' : '等待你确认画面'}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    {visualConfirmed
                      ? '修改素材或时间段后，需要重新确认。'
                      : activeScene.selectionStatus === 'ai_suggested'
                        ? '当前仅为 AI 推荐，请查看上方预览后明确确认。'
                        : '请先查看上方预览，确认这段画面可以用于成片。'}
                  </p>
                </div>
              </div>
              <button
                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-extrabold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                type="button"
                onClick={onConfirmVisual}
              >
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                {visualConfirmed ? '重新确认当前画面' : '确认使用当前画面'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">请先新增或选择一个片段。</p>
        )}
      </div>
    </section>
  );
}
